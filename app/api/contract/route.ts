import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execAsync = promisify(exec);
function getSupabaseClient(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    );
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseClient(req);
    const body = await req.json();
    const { matchId, ...extraData } = body;

    // match 정보 조회
    const { data: match } = await supabase
      .from("matches")
      .select("employer_id, worker_id, employer_profile_id, interview_at")
      .eq("id", matchId)
      .single();

    if (!match) return NextResponse.json({ error: "매칭 없음" }, { status: 404 });

    // contracts 테이블에서 최신 계약 데이터 조회
    const { data: contract } = await supabase
      .from("contracts")
      .select("*")
      .eq("match_id", matchId)
      .neq("status", "superseded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 사장님 정보
    const { data: employer } = await supabase
      .from("users")
      .select("name, real_name, nickname, phone, address")
      .eq("id", match.employer_id)
      .single();

    const { data: empProfile } = await supabase
      .from("employer_profiles")
      .select("business_name, business_type, region, address, address_detail, wage, work_days, work_hours, biz_reg_number, ceo_name, biz_tel")
      .eq("id", match.employer_profile_id)
      .maybeSingle();

    // 알바생 정보
    const { data: worker } = await supabase
      .from("users")
      .select("name, real_name, nickname, phone, address, birth_date")
      .eq("id", match.worker_id)
      .single();

    // 기본값 머지
    const f = contract?.contract_data || {};
    const ct = f.contractType || "parttime";

    const data = {
      contractType: ct,
      business_name: f.biz || empProfile?.business_name || "",
      biz_reg_number: f.bizRegNo || empProfile?.biz_reg_number || "",
      employer_name: f.ceo || employer?.real_name || employer?.nickname || employer?.name || "",
      employer_phone: f.ceoPhone || empProfile?.biz_tel || employer?.phone || "",
      business_address: f.bizAddr || [empProfile?.address, empProfile?.address_detail].filter(Boolean).join(" ") || empProfile?.region || "",
      work_place: f.workPlace || empProfile?.region || "",
      job_description: f.jobDesc || (empProfile?.business_type ? `${empProfile.business_type} 관련 업무` : ""),
      worker_name: f.worker || worker?.real_name || worker?.nickname || worker?.name || "",
      worker_birth: f.workerBirth || worker?.birth_date?.replace(/-/g, ". ") || "",
      worker_phone: f.workerPhone || worker?.phone || "",
      worker_address: f.workerAddr || worker?.address || "",
      start_date: f.startDate || "",
      end_date: f.endDate || "",
      work_start: f.workStart || "",
      work_end: f.workEnd || "",
      break_start: f.breakStart || "12:00",
      break_end: f.breakEnd || "13:00",
      daily_hours: f.dailyHours || "",
      weekly_hours: f.weeklyHours || "",
      work_days_text: f.workDaysText || "",
      work_days_mode: f.workDaysMode || "check",
      weekly_holiday: f.weeklyHoliday || "일",
      wage: f.wage || "",
      wage_type: f.wageType || "hour",
      has_bonus: f.hasBonus || false,
      bonus_amount: f.bonusAmount || "",
      has_extra_wage: f.hasExtraWage || false,
      extra_wage_details: f.extraWageDetails || "",
      overtime_premium_rate: f.overtimePremiumRate || "50",
      pay_day: f.payDay || "말일",
      pay_method: f.payMethod || "계좌이체",
      ins_emp: f.insEmp || false,
      ins_acc: f.insAcc || false,
      ins_pension: f.insPension || false,
      ins_health: f.insHealth || false,
      contract_date: f.contractDate || "",
      // 연소자 추가 정보
      has_family_cert: f.hasFamilyCert !== false,
      has_parent_consent: f.hasParentConsent !== false,
      parent_name: f.parentName || "",
      parent_rel: f.parentRel || "부",
      parent_birth: f.parentBirth || "",
      parent_address: f.parentAddr || "",
      parent_phone: f.parentTel || "",
      // 요일별 시간
      workStartMon: f.workStartMon || "", workEndMon: f.workEndMon || "", breakTimeMon: f.breakTimeMon || "",
      workStartTue: f.workStartTue || "", workEndTue: f.workEndTue || "", breakTimeTue: f.breakTimeTue || "",
      workStartWed: f.workStartWed || "", workEndWed: f.workEndWed || "", breakTimeWed: f.breakTimeWed || "",
      workStartThu: f.workStartThu || "", workEndThu: f.workEndThu || "", breakTimeThu: f.breakTimeThu || "",
      workStartFri: f.workStartFri || "", workEndFri: f.workEndFri || "", breakTimeFri: f.breakTimeFri || "",
      workStartSat: f.workStartSat || "", workEndSat: f.workEndSat || "", breakTimeSat: f.breakTimeSat || "",
      workStartSun: f.workStartSun || "", workEndSun: f.workEndSun || "", breakTimeSun: f.breakTimeSun || "",
      ...extraData,
    };

    const tmpPath = join(tmpdir(), `contract_${matchId}_${Date.now()}.pdf`);
    const overlayPath = join(tmpdir(), `overlay_${Date.now()}.pdf`);
    const scriptPath = join(tmpdir(), `gen_${Date.now()}.py`);
    const templatePdfPath = join(process.cwd(), "docs", "standard_contract_form.pdf");

    const script = `
import os
import sys
import json
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
import pypdf

# 폰트 로드 폴백
font_paths = [
    ("/usr/share/fonts/truetype/nanum/NanumGothic.ttf", "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf", "NanumGothic", "NanumGothicBold"),
    ("C:\\\\Windows\\\\Fonts\\\\malgun.ttf", "C:\\\\Windows\\\\Fonts\\\\malgunbd.ttf", "Malgun", "MalgunBold"),
]

registered = False
for reg_path, bold_path, f_name, b_name in font_paths:
    if os.path.exists(reg_path) and os.path.exists(bold_path):
        pdfmetrics.registerFont(TTFont(f_name, reg_path))
        pdfmetrics.registerFont(TTFont(b_name, bold_path))
        font_regular = f_name
        font_bold = b_name
        registered = True
        break

if not registered:
    font_regular = 'Helvetica'
    font_bold = 'Helvetica-Bold'

data = json.loads('''${JSON.stringify(data).replace(/\\\\/g, "\\\\\\\\").replace(/'/g, "\\\\'")}''')
ct = data.get("contractType", "parttime")

w, h = A4
c = canvas.Canvas("${overlayPath.replace(/\\/g, "\\\\")}", pagesize=A4)

def text(x, yy, txt, bold=False, size=9):
    if not txt:
        return
    c.setFont(font_bold if bold else font_regular, size)
    c.setFillColor(colors.HexColor("#EF4444"))
    c.drawString(x * 72 / 25.4, h - yy * 72 / 25.4, str(txt))

def check(x, yy):
    text(x, yy, "✓", bold=True, size=10)

def split_date(d_str):
    parts = [p.strip() for p in d_str.replace("년",".").replace("월",".").replace("일",".").split(".") if p.strip()]
    if len(parts) >= 3:
        return parts[0], parts[1], parts[2]
    return "", "", ""

if ct == "standard_unlimited" or ct == "standard_fixed":
    # 계약당사자 상단 표기
    text(15, 34, data.get("business_name"))
    text(100, 34, data.get("worker_name"))

    # 1. 근로계약기간
    sy, sm, sd = split_date(data.get("start_date", ""))
    if ct == "standard_unlimited":
        text(50, 50, sy)
        text(63, 50, sm)
        text(73, 50, sd)
    else:
        text(42, 50, sy)
        text(56, 50, sm)
        text(67, 50, sd)
        ey, em, ed = split_date(data.get("end_date", ""))
        text(102, 50, ey)
        text(117, 50, em)
        text(128, 50, ed)

    # 2. 근무장소 및 3. 업무내용
    text(55, 57, data.get("work_place"))
    text(55, 64, data.get("job_description"))

    # 4. 소정근로시간
    ws_h, ws_m = data.get("work_start", "09:00").split(":") if ":" in data.get("work_start", "") else ("", "")
    we_h, we_m = data.get("work_end", "18:00").split(":") if ":" in data.get("work_end", "") else ("", "")
    bs_h, bs_m = data.get("break_start", "12:00").split(":") if ":" in data.get("break_start", "") else ("", "")
    be_h, be_m = data.get("break_end", "13:00").split(":") if ":" in data.get("break_end", "") else ("", "")

    text(50, 71, ws_h)
    text(60, 71, ws_m)
    text(75, 71, we_h)
    text(85, 71, we_m)
    text(112, 71, bs_h)
    text(122, 71, bs_m)
    text(135, 71, be_h)
    text(145, 71, be_m)
    text(168, 71, data.get("daily_hours"))
    text(187, 71, data.get("weekly_hours"))

    # 5. 근무일 / 휴일
    days_cnt = data.get("work_days_text", "")
    if not days_cnt and data.get("work_days_mode") == "check":
        sel_days = [d for d in ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] if data.get(f"workDays{d}")]
        days_cnt = str(len(sel_days))
        days_detail = "·".join(["월","화","수","목","금","토","일"][i] for i, d in enumerate(["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]) if data.get(f"workDays{d}"))
        text(115, 78, days_detail)
    text(60, 78, days_cnt)
    text(180, 78, data.get("weekly_holiday"))

    # 6. 임금
    wt = data.get("wage_type", "hour")
    wt_label = "시간급" if wt == "hour" else "일급" if wt == "day" else "월급"
    text(55, 98, f"{wt_label}  {data.get('wage')} 원")

    if data.get("has_bonus"):
        check(48, 105)
        text(65, 105, data.get("bonus_amount"))
    else:
        check(142, 105)

    if data.get("has_extra_wage"):
        check(83, 112)
        text(42, 119, data.get("extra_wage_details"))
    else:
        check(125, 112)

    text(98, 126, data.get("pay_day"))

    if data.get("pay_method") == "현금":
        check(104, 133)
    else:
        check(172, 133)

    # 8. 사회보험
    if data.get("ins_emp"): check(57, 159)
    if data.get("ins_acc"): check(78, 159)
    if data.get("ins_pension"): check(99, 159)
    if data.get("ins_health"): check(120, 159)

    # 날짜
    dy, dm, dd = split_date(data.get("contract_date", ""))
    text(85, 222, dy)
    text(105, 222, dm)
    text(120, 222, dd)

    # 사업주 서명
    text(38, 231, f"{data.get('business_name')} (사업자번호: {data.get('biz_reg_number')})")
    text(135, 231, data.get("employer_phone"))
    text(38, 240, data.get("business_address"))
    text(38, 249, data.get("employer_name"))

    # 근로자 서명
    text(38, 258, data.get("worker_address"))
    text(38, 267, data.get("worker_phone"))
    text(38, 276, data.get("worker_name"))
    text(125, 276, data.get("worker_birth"))

    c.showPage()

elif ct == "minor":
    # 1페이지 (연소자 근로계약서)
    text(15, 34, data.get("business_name"))
    text(100, 34, data.get("worker_name"))

    sy, sm, sd = split_date(data.get("start_date", ""))
    text(50, 50, sy)
    text(63, 50, sm)
    text(73, 50, sd)
    if data.get("end_date"):
        text(110, 50, f"~ {data.get('end_date')}")

    text(55, 60, data.get("work_place"))
    text(55, 67, data.get("job_description"))

    # 소정근로시간
    ws_h, ws_m = data.get("work_start", "09:00").split(":") if ":" in data.get("work_start", "") else ("", "")
    we_h, we_m = data.get("work_end", "18:00").split(":") if ":" in data.get("work_end", "") else ("", "")
    bs_h, bs_m = data.get("break_start", "12:00").split(":") if ":" in data.get("break_start", "") else ("", "")
    be_h, be_m = data.get("break_end", "13:00").split(":") if ":" in data.get("break_end", "") else ("", "")

    text(50, 74, ws_h)
    text(60, 74, ws_m)
    text(75, 74, we_h)
    text(85, 74, we_m)
    text(112, 74, bs_h)
    text(122, 74, bs_m)
    text(135, 74, be_h)
    text(145, 74, be_m)
    text(168, 74, data.get("daily_hours"))
    text(187, 74, data.get("weekly_hours"))

    # 근무일
    days_cnt = data.get("work_days_text", "")
    if not days_cnt and data.get("work_days_mode") == "check":
        sel_days = [d for d in ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] if data.get(f"workDays{d}")]
        days_cnt = str(len(sel_days))
        days_detail = "·".join(["월","화","수","목","금","토","일"][i] for i, d in enumerate(["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]) if data.get(f"workDays{d}"))
        text(115, 84, days_detail)
    text(60, 84, days_cnt)
    text(180, 84, data.get("weekly_holiday"))

    # 임금
    wt = data.get("wage_type", "hour")
    wt_label = "시간급" if wt == "hour" else "일급" if wt == "day" else "월급"
    text(55, 106, f"{wt_label}  {data.get('wage')} 원")

    if data.get("has_bonus"):
        check(48, 113)
        text(65, 113, data.get("bonus_amount"))
    else:
        check(142, 113)

    if data.get("has_extra_wage"):
        check(83, 120)
        text(42, 127, data.get("extra_wage_details"))
    else:
        check(125, 120)

    text(98, 134, data.get("pay_day"))

    if data.get("pay_method") == "현금":
        check(104, 141)
    else:
        check(172, 141)

    # 8. 가족관계증명서
    text(105, 154, "제출함" if data.get("has_family_cert") else "미제출")
    text(105, 161, "구비함" if data.get("has_parent_consent") else "미구비")

    # 사회보험
    if data.get("ins_emp"): check(57, 172)
    if data.get("ins_acc"): check(78, 172)
    if data.get("ins_pension"): check(99, 172)
    if data.get("ins_health"): check(120, 172)

    # 날짜
    dy, dm, dd = split_date(data.get("contract_date", ""))
    text(85, 233, dy)
    text(105, 233, dm)
    text(120, 233, dd)

    # 서명
    text(38, 241, f"{data.get('business_name')} (사업자번호: {data.get('biz_reg_number')})")
    text(135, 241, data.get("employer_phone"))
    text(38, 250, data.get("business_address"))
    text(38, 259, data.get("employer_name"))

    text(38, 268, data.get("worker_address"))
    text(38, 277, data.get("worker_phone"))
    text(38, 286, data.get("worker_name"))
    text(125, 286, data.get("worker_birth"))

    c.showPage()

    # 2페이지 (친권자 동의서)
    text(35, 50, data.get("parent_name"))
    text(38, 60, data.get("parent_birth"))
    text(35, 70, data.get("parent_address"))
    text(38, 80, data.get("parent_phone"))
    text(60, 90, data.get("parent_rel"))

    text(35, 115, data.get("worker_name"))
    text(38, 125, data.get("worker_birth"))
    text(35, 135, data.get("worker_address"))
    text(38, 145, data.get("worker_phone"))

    text(38, 163, data.get("business_name"))
    text(38, 171, data.get("business_address"))
    text(38, 180, data.get("employer_name"))
    text(38, 188, data.get("employer_phone"))

    text(90, 203, data.get("worker_name"))

    text(85, 231, dy)
    text(105, 231, dm)
    text(120, 231, dd)
    text(110, 249, data.get("parent_name"))

    c.showPage()

elif ct == "parttime":
    # 단시간근로자 표준근로계약서
    text(35, 33, data.get("business_name"))
    text(105, 33, data.get("worker_name"))

    sy, sm, sd = split_date(data.get("start_date", ""))
    text(42, 44, sy)
    text(58, 44, sm)
    text(70, 44, sd)
    if data.get("end_date"):
        text(100, 44, f"~ {data.get('end_date')}")

    text(42, 51.5, data.get("work_place"))
    text(42, 58.5, data.get("job_description"))

    # 4. 근로일별 근로시간 테이블 채우기
    DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    DAYS_KO = ["월", "화", "수", "목", "금", "토", "일"]
    sel_days = [d for d in DAYS if data.get(f"workDays{d}")]

    # 최대 6개 근무일 작성 가능 (단시간 양식 제한)
    X_COLS = [46, 68, 92, 116, 140, 164]
    
    def calc_daily_hours(ws, we, bt_min):
        try:
            sh, sm = map(int, ws.split(':'))
            eh, em = map(int, we.split(':'))
            b_min = int(bt_min)
            t_min = (eh * 60 + em) - (sh * 60 + sm) - b_min
            return f"{t_min / 60:.1f}".rstrip('0').rstrip('.')
        except:
            return ""

    for idx, d in enumerate(sel_days[:6]):
        x_pos = X_COLS[idx]
        ko_day = DAYS_KO[DAYS.index(d)]
        text(x_pos, 70.0, ko_day)

        ws = data.get(f"workStart{d}", "09:00")
        we = data.get(f"workEnd{d}", "18:00")
        bt = data.get(f"breakTime{d}", "30")

        dh = calc_daily_hours(ws, we, bt)
        text(x_pos, 75.0, f"{dh}시간" if dh else "")

        ws_h, ws_m = ws.split(":") if ":" in ws else ("", "")
        text(x_pos - 2, 80.0, ws_h)
        text(x_pos + 6, 80.0, ws_m)

        we_h, we_m = we.split(":") if ":" in we else ("", "")
        text(x_pos - 2, 85.0, we_h)
        text(x_pos + 6, 85.0, we_m)

        # 휴게시간 (기본 12시~12시30분 / 12시~13시 분할표시)
        try:
            bt_val = int(bt)
            bs_h, bs_m = "12", "00"
            if bt_val == 30:
                be_h, be_m = "12", "30"
            elif bt_val == 60:
                be_h, be_m = "13", "00"
            else:
                be_h = str(12 + bt_val // 60)
                be_m = str(bt_val % 60).zfill(2)
            text(x_pos - 2, 90.0, bs_h)
            text(x_pos + 6, 90.0, bs_m)
            text(x_pos - 2, 94.0, be_h)
            text(x_pos + 6, 94.0, be_m)
        except:
            pass

    text(30, 98, data.get("weekly_holiday"))

    # 임금
    wt = data.get("wage_type", "hour")
    wt_label = "시간급" if wt == "hour" else "일급" if wt == "day" else "월급"
    text(55, 118, f"{wt_label}  {data.get('wage')} 원")

    if data.get("has_bonus"):
        check(48, 125)
        text(65, 125, data.get("bonus_amount"))
    else:
        check(142.5, 125)

    if data.get("has_extra_wage"):
        check(83, 132)
        text(42, 139, data.get("extra_wage_details"))
    else:
        check(125, 132)

    text(90, 144, data.get("overtime_premium_rate"))
    text(98, 163, data.get("pay_day"))

    if data.get("pay_method") == "현금":
        check(104, 170)
    else:
        check(172, 170)

    # 사회보험
    if data.get("ins_emp"): check(57, 188)
    if data.get("ins_acc"): check(78, 188)
    if data.get("ins_pension"): check(99, 188)
    if data.get("ins_health"): check(120, 188)

    # 날짜
    dy, dm, dd = split_date(data.get("contract_date", ""))
    text(85, 231, dy)
    text(105, 231, dm)
    text(120, 231, dd)

    # 서명
    text(40, 241, f"{data.get('business_name')} (사업자번호: {data.get('biz_reg_number')})")
    text(135, 241, data.get("employer_phone"))
    text(40, 250, data.get("business_address"))
    text(40, 259, data.get("employer_name"))

    text(40, 268, data.get("worker_address"))
    text(40, 277, data.get("worker_phone"))
    text(40, 286, data.get("worker_name"))
    text(125, 286, data.get("worker_birth"))

    c.showPage()

c.save()

# PDF Merging using pypdf
template_reader = pypdf.PdfReader("${templatePdfPath.replace(/\\/g, "\\\\")}")
overlay_reader = pypdf.PdfReader("${overlayPath.replace(/\\/g, "\\\\")}")
writer = pypdf.PdfWriter()

# ct에 따른 템플릿 페이지 매핑
page_map = {
    "standard_unlimited": [0],
    "standard_fixed": [1],
    "minor": [2, 3],
    "parttime": [5]
}
target_pages = page_map.get(ct, [5])

for i, page_idx in enumerate(target_pages):
    page = template_reader.pages[page_idx]
    page.merge_page(overlay_reader.pages[i])
    writer.add_page(page)

with open("${tmpPath.replace(/\\/g, "\\\\")}", "wb") as f_out:
    writer.write(f_out)

print("OK")
`;

    // Write python script to temp file
    await writeFile(scriptPath, script, "utf-8");

    // Execute python
    let pythonCmd = "python3";
    if (process.platform === "win32") {
      pythonCmd = "python";
    }

    try {
      const { stdout } = await execAsync(`${pythonCmd} "${scriptPath}"`);
      if (!stdout.includes("OK")) {
        throw new Error("Python script did not complete with OK");
      }
    } catch (execError: any) {
      console.error("Python execution error, trying fallback command 'python':", execError);
      // fallback
      const fallbackCmd = pythonCmd === "python" ? "python3" : "python";
      const { stdout } = await execAsync(`${fallbackCmd} "${scriptPath}"`);
      if (!stdout.includes("OK")) {
        throw new Error("Python fallback script did not complete with OK");
      }
    }

    // Read generated PDF file
    const pdfBuffer = await readFile(tmpPath);

    // Clean up temp files
    await unlink(scriptPath).catch(() => {});
    await unlink(overlayPath).catch(() => {});
    await unlink(tmpPath).catch(() => {});

    const safeFilename = encodeURIComponent(`근로계약서_${data.business_name}_${data.worker_name}.pdf`);
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${safeFilename}`,
      },
    });
  } catch (error: any) {
    console.error("Contract generation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 계약서 서명 / 기타 상태 변경 (PATCH)
export async function PATCH(req: NextRequest) {
  try {
    const { action, contractId, teamMemberId, matchId, workerId, employerId, isHired } = await req.json();

    if (action === "sign") {
      // 계약서 worker_signed = true
      if (contractId) {
        await supabaseAdmin.from("contracts")
          .update({ worker_signed: true, status: "active", worker_signed_at: new Date().toISOString() })
          .eq("id", contractId);
      }

      // team_members.contract_status = "active"
      if (teamMemberId) {
        await supabaseAdmin.from("team_members")
          .update({ contract_status: "active" })
          .eq("id", teamMemberId);
      } else if (matchId && workerId) {
        // teamMemberId 없으면 matchId+workerId로 찾기
        await supabaseAdmin.from("team_members")
          .update({ contract_status: "active" })
          .eq("match_id", matchId)
          .eq("worker_id", workerId);
      }

      // 아직 hired 아닐 때: matches 업데이트 + team_members 생성
      if (!isHired && matchId) {
        await supabaseAdmin.from("matches")
          .update({ progress_status: "hired", hire_confirmed_by_employer: true, hire_confirmed_by_worker: true })
          .eq("id", matchId);

        if (workerId && employerId) {
          const { data: existingTm } = await supabaseAdmin.from("team_members")
            .select("id").eq("match_id", matchId).maybeSingle();
          if (!existingTm) {
            await supabaseAdmin.from("team_members").insert({
              employer_id: employerId,
              worker_id: workerId,
              match_id: matchId,
              hire_date: new Date().toISOString().split("T")[0],
              status: "active",
              contract_status: "active",
            });
          }
        }
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "알 수 없는 action" }, { status: 400 });
  } catch (error: any) {
    console.error("Contract PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
