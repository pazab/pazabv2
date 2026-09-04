import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { todayKstStr } from "@/lib/utils";

const execAsync = promisify(exec);

const supabaseAdminForAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 로그인 세션에서 요청자 확인 — 인증 안 되면 null (계약서는 당사자(사장님/알바생)만 조회 가능해야 함)
async function getRequesterId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

async function generatePdfResponse(supabase: any, matchId: string | null, contractId: string | null, extraData: any = {}, requesterId: string | null = null) {
  try {
    let match: any = null;
    let contract: any = null;

    if (matchId) {
      const { data: m } = await supabase
        .from("matches")
        .select("employer_id, worker_id, employer_profile_id, interview_at")
        .eq("id", matchId)
        .single();
      match = m;

      if (match) {
        const { data: c } = await supabase
          .from("contracts")
          .select("*")
          .eq("match_id", matchId)
          .neq("status", "superseded")
          .order("created_at", { ascending: false})
          .limit(1)
          .maybeSingle();
        contract = c;
      }
    } else if (contractId) {
      const { data: c } = await supabase
        .from("contracts")
        .select("*")
        .eq("id", contractId)
        .single();
      contract = c;
    }

    if (!contract) return NextResponse.json({ error: "계약서 없음" }, { status: 404 });

    const employerId = contract.employer_id || match?.employer_id;
    const workerId = contract.worker_id || match?.worker_id;

    // 계약 당사자(사장님/알바생) 본인만 조회 가능 — 그 외에는 임금·연락처·주소 등 개인정보 노출 차단
    if (!requesterId || (requesterId !== employerId && requesterId !== workerId)) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    let empProfileId = match?.employer_profile_id || null;
    if (!empProfileId && contract.team_member_id) {
      const { data: tm } = await supabase
        .from("team_members")
        .select("employer_profile_id")
        .eq("id", contract.team_member_id)
        .maybeSingle();
      empProfileId = tm?.employer_profile_id;
    }

    // 사장님 정보
    const { data: employer } = employerId ? await supabase
      .from("users")
      .select("real_name, nickname, phone, address")
      .eq("id", employerId)
      .single() : { data: null };

    const { data: empProfile } = empProfileId ? await supabase
      .from("employer_profiles")
      .select("business_name, business_type, region, address, address_detail, biz_reg_number, ceo_name, biz_tel")
      .eq("id", empProfileId)
      .maybeSingle() : { data: null };

    // 알바생 정보
    const { data: worker } = workerId ? await supabase
      .from("users")
      .select("real_name, nickname, phone, address, birth_date")
      .eq("id", workerId)
      .single() : { data: null };

  // 기본값 머지
  const f = contract?.contract_data || {};
  const ct = f.contractType || "parttime";

  const data = {
    contractType: ct,
    business_name: f.biz || empProfile?.business_name || "",
    biz_reg_number: f.bizRegNo || empProfile?.biz_reg_number || "",
    employer_name: f.ceo || employer?.real_name || employer?.nickname || "",
    employer_phone: f.ceoPhone || empProfile?.biz_tel || employer?.phone || "",
    business_address: f.bizAddr || [empProfile?.address, empProfile?.address_detail].filter(Boolean).join(" ") || empProfile?.region || "",
    work_place: f.workPlace || empProfile?.region || "",
    job_description: f.jobDesc || (empProfile?.business_type ? `${empProfile.business_type} 관련 업무` : ""),
    worker_name: f.worker || worker?.real_name || worker?.nickname || "",
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

  const idForFile = matchId || contractId || Date.now();
  const tmpPath = join(tmpdir(), `contract_${idForFile}_${Date.now()}.pdf`);
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
    text(15, 34, data.get("business_name"))
    text(100, 34, data.get("worker_name"))

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

    text(55, 57, data.get("work_place"))
    text(55, 64, data.get("job_description"))

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

    days_cnt = data.get("work_days_text", "")
    if not days_cnt and data.get("work_days_mode") == "check":
        sel_days = [d for d in ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] if data.get(f"workDays{d}")]
        days_cnt = str(len(sel_days))
        days_detail = "·".join(["월","화","수","목","금","토","일"][i] for i, d in enumerate(["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]) if data.get(f"workDays{d}"))
        text(115, 78, days_detail)
    text(60, 78, days_cnt)
    text(180, 78, data.get("weekly_holiday"))

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

    if data.get("ins_emp"): check(57, 159)
    if data.get("ins_acc"): check(78, 159)
    if data.get("ins_pension"): check(99, 159)
    if data.get("ins_health"): check(120, 159)

    dy, dm, dd = split_date(data.get("contract_date", ""))
    text(85, 222, dy)
    text(105, 222, dm)
    text(120, 222, dd)

    text(38, 231, f"{data.get('business_name')} (사업자번호: {data.get('biz_reg_number')})")
    text(135, 231, data.get("employer_phone"))
    text(38, 240, data.get("business_address"))
    text(38, 249, data.get("employer_name"))

    text(38, 258, data.get("worker_address"))
    text(38, 267, data.get("worker_phone"))
    text(38, 276, data.get("worker_name"))
    text(125, 276, data.get("worker_birth"))

    c.showPage()

elif ct == "minor":
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

    days_cnt = data.get("work_days_text", "")
    if not days_cnt and data.get("work_days_mode") == "check":
        sel_days = [d for d in ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] if data.get(f"workDays{d}")]
        days_cnt = str(len(sel_days))
        days_detail = "·".join(["월","화","수","목","금","토","일"][i] for i, d in enumerate(["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]) if data.get(f"workDays{d}"))
        text(115, 81, days_detail)
    text(60, 81, days_cnt)
    text(180, 81, data.get("weekly_holiday"))

    wt = data.get("wage_type", "hour")
    wt_label = "시간급" if wt == "hour" else "일급" if wt == "day" else "월급"
    text(55, 100, f"{wt_label}  {data.get('wage')} 원")

    if data.get("has_bonus"):
        check(48, 107)
        text(65, 107, data.get("bonus_amount"))
    else:
        check(142, 107)

    if data.get("has_extra_wage"):
        check(83, 114)
        text(42, 121, data.get("extra_wage_details"))
    else:
        check(125, 114)

    text(98, 128, data.get("pay_day"))

    if data.get("pay_method") == "현금":
        check(104, 135)
    else:
        check(172, 135)

    if data.get("has_family_cert"): check(78, 149)
    else: check(102, 149)

    if data.get("has_parent_consent"): check(78, 156)
    else: check(102, 156)

    if data.get("ins_emp"): check(57, 163)
    if data.get("ins_acc"): check(78, 163)
    if data.get("ins_pension"): check(99, 163)
    if data.get("ins_health"): check(120, 163)

    dy, dm, dd = split_date(data.get("contract_date", ""))
    text(85, 231, dy)
    text(105, 231, dm)
    text(120, 231, dd)

    text(38, 240, f"{data.get('business_name')} (전화: {data.get('employer_phone')})")
    text(38, 249, data.get("business_address"))
    text(38, 258, data.get("employer_name"))

    text(38, 267, data.get("worker_address"))
    text(38, 276, data.get("worker_phone"))
    text(38, 285, data.get("worker_name"))

    c.showPage()

    text(40, 46, data.get("parent_name"))
    text(40, 55, data.get("parent_birth"))
    text(40, 64, data.get("parent_address"))
    text(40, 73, data.get("parent_phone"))
    text(65, 82, data.get("parent_rel"))

    text(40, 100, data.get("worker_name"))
    text(40, 109, data.get("worker_birth"))
    text(40, 118, data.get("worker_address"))
    text(40, 127, data.get("worker_phone"))

    text(40, 145, data.get("business_name"))
    text(40, 154, data.get("business_address"))
    text(40, 163, data.get("employer_name"))
    text(40, 172, data.get("employer_phone"))

    text(52, 192, data.get("worker_name"))

    text(85, 234, dy)
    text(105, 234, dm)
    text(120, 234, dd)

    text(85, 246, data.get("parent_name"))

    c.showPage()

elif ct == "parttime":
    text(15, 34, data.get("business_name"))
    text(100, 34, data.get("worker_name"))

    sy, sm, sd = split_date(data.get("start_date", ""))
    text(50, 50, sy)
    text(63, 50, sm)
    text(73, 50, sd)
    if data.get("end_date"):
        text(110, 50, f"~ {data.get('end_date')}")

    text(55, 68, data.get("work_place"))
    text(55, 75, data.get("job_description"))

    sel_days = [d for d in ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] if data.get(f"workDays{d}")]
    col_w_mm = 145.0 / max(len(sel_days), 1)
    start_x_mm = 40.0

    days_ko = ["월","화","수","목","금","토","일"]
    day_indices = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]

    for idx, d_code in enumerate(sel_days):
        x_pos = start_x_mm + idx * col_w_mm + col_w_mm / 2.0
        day_ko = days_ko[day_indices.index(d_code)]
        text(x_pos - 2, 94, f"({day_ko})")

        ws = data.get(f"workStart{d_code}", "")
        we = data.get(f"workEnd{d_code}", "")
        bt = data.get(f"breakTime{d_code}", "0")
        
        ws_h, ws_m = ws.split(":") if ":" in ws else ("", "")
        we_h, we_m = we.split(":") if ":" in we else ("", "")

        hours_str = ""
        try:
            sh = int(ws_h) * 60 + int(ws_m)
            eh = int(we_h) * 60 + int(we_m)
            bt_min = int(bt)
            total_h = (eh - sh - bt_min) / 60.0
            if total_h > 0:
                hours_str = f"{total_h:.1f}".replace(".0", "")
        except:
            pass

        if hours_str: text(x_pos - 3, 101, f"{hours_str}시간")
        text(x_pos - 5, 108, f"{ws_h}:{ws_m}")
        text(x_pos - 5, 115, f"{we_h}:{we_m}")
        text(x_pos - 7, 122, f"{bt}분 휴게")

    text(60, 130, data.get("weekly_holiday"))

    wt = data.get("wage_type", "hour")
    wt_label = "시간급" if wt == "hour" else "일급" if wt == "day" else "월급"
    text(55, 142, f"{wt_label}  {data.get('wage')} 원")

    if data.get("has_bonus"):
        check(48, 149)
        text(65, 149, data.get("bonus_amount"))
    else:
        check(142, 149)

    if data.get("has_extra_wage"):
        check(83, 156)
        text(42, 163, data.get("extra_wage_details"))
    else:
        check(125, 156)

    text(82, 170, data.get("overtime_premium_rate"))
    text(98, 177, data.get("pay_day"))

    if data.get("pay_method") == "현금":
        check(104, 184)
    else:
        check(172, 184)

    if data.get("ins_emp"): check(57, 188)
    if data.get("ins_acc"): check(78, 188)
    if data.get("ins_pension"): check(99, 188)
    if data.get("ins_health"): check(120, 188)

    dy, dm, dd = split_date(data.get("contract_date", ""))
    text(85, 231, dy)
    text(105, 231, dm)
    text(120, 231, dd)

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

template_reader = pypdf.PdfReader("${templatePdfPath.replace(/\\/g, "\\\\")}")
overlay_reader = pypdf.PdfReader("${overlayPath.replace(/\\/g, "\\\\")}")
writer = pypdf.PdfWriter()

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

  const safeFilename = encodeURIComponent(`근로계약서_${data.business_name || "계약서"}_${data.worker_name || "알바생"}.pdf`);
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

export async function POST(req: NextRequest) {
  try {
    const requesterId = await getRequesterId();
    if (!requesterId) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    const body = await req.json();
    const { matchId, contractId, ...extraData } = body;
    if (!matchId && !contractId) return NextResponse.json({ error: "matchId 또는 contractId 필수" }, { status: 400 });
    return await generatePdfResponse(supabaseAdminForAuth, matchId || null, contractId || null, extraData, requesterId);
  } catch (error: any) {
    console.error("Contract generation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const requesterId = await getRequesterId();
    if (!requesterId) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    const matchId = req.nextUrl.searchParams.get("matchId");
    const contractId = req.nextUrl.searchParams.get("contractId");
    if (!matchId && !contractId) return NextResponse.json({ error: "matchId 또는 contractId 필수" }, { status: 400 });
    return await generatePdfResponse(supabaseAdminForAuth, matchId || null, contractId || null, {}, requesterId);
  } catch (error: any) {
    console.error("Contract GET generation error:", error);
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
      let empId = employerId;
      let wrkId = workerId;
      let targetMatchId = matchId;

      // 계약서 정보 조회
      if (contractId) {
        const { data: cData } = await supabaseAdmin.from("contracts").select("*").eq("id", contractId).single();
        if (cData) {
          if (!empId) empId = cData.employer_id;
          if (!wrkId) wrkId = cData.worker_id;
          if (!targetMatchId && cData.team_member_id) {
            const { data: tm } = await supabaseAdmin.from("team_members").select("match_id").eq("id", cData.team_member_id).single();
            if (tm?.match_id) targetMatchId = tm.match_id;
          }
        }

        // 계약서 worker_signed = true
        await supabaseAdmin.from("contracts")
          .update({ worker_signed: true, status: "active", worker_signed_at: new Date().toISOString() })
          .eq("id", contractId);
      }

      // team_members.contract_status = "active"
      if (teamMemberId) {
        await supabaseAdmin.from("team_members")
          .update({ contract_status: "active" })
          .eq("id", teamMemberId);
      } else if (targetMatchId && wrkId) {
        await supabaseAdmin.from("team_members")
          .update({ contract_status: "active" })
          .eq("match_id", targetMatchId)
          .eq("worker_id", wrkId);
      }

      // 아직 hired 아닐 때: matches 업데이트 + team_members 생성
      if (!isHired && targetMatchId) {
        await supabaseAdmin.from("matches")
          .update({ progress_status: "hired", hire_confirmed_by_employer: true, hire_confirmed_by_worker: true })
          .eq("id", targetMatchId);

        if (wrkId && empId) {
          const { data: existingTm } = await supabaseAdmin.from("team_members")
            .select("id").eq("match_id", targetMatchId).maybeSingle();
          if (!existingTm) {
            const { data: matchRow } = await supabaseAdmin.from("matches")
              .select("employer_profile_id").eq("id", targetMatchId).maybeSingle();
            await supabaseAdmin.from("team_members").insert({
              employer_id: empId,
              worker_id: wrkId,
              employer_profile_id: matchRow?.employer_profile_id || null,
              match_id: targetMatchId,
              hire_date: todayKstStr(),
              status: "active",
              contract_status: "active",
            });
          }
        }
      }

      // 1. 사장님과의 채팅방에 실시간 동의완료 시스템 메시지 발송
      if (targetMatchId && wrkId && empId) {
        await supabaseAdmin.from("chats").insert({
          match_id: targetMatchId,
          sender_id: wrkId,
          receiver_id: empId,
          message: "✅ 근로자가 근로계약서에 서명을 완료했어요! 전자계약 체결이 완료되었습니다. 🎉",
          message_type: "system",
          is_read: false,
        });
      }

      // 2. 사장님에게 인앱 알림 발송
      if (empId) {
        await supabaseAdmin.from("notifications").insert({
          user_id: empId,
          type: "contract",
          title: "✍️ 근로계약서 서명 완료!",
          body: "알바생이 근로계약서에 서명을 완료했어요. 최종 체결된 계약서를 확인해보세요.",
          data: { url: contractId ? `/contract/view?contractId=${contractId}` : "/myteam" },
        });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "알 수 없는 action" }, { status: 400 });
  } catch (error: any) {
    console.error("Contract PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
