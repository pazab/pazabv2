"use client";
import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/lib/useToast";
import { getMinWageForDate, isUnderMinWage } from "@/lib/minWage";
import { supabase } from "@/lib/supabase";
import ContractOfficialForm, { getOfficialFormHTML } from "@/components/ContractOfficialForm";
import {
  inputStyle,
  btnPrimary,
  btnSecondary,
  cardStyle,
  divider,
} from "@/lib/styles";

// 공식 계약서 뷰어용 Read-only 필드 컴포넌트
function E({ v, ph = "" }: { v: string; ph?: string; onChange?: (s: string) => void; w?: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        borderBottom: "1px solid #111",
        padding: "0 4px",
        fontWeight: 700,
        color: "#111",
        fontSize: "inherit",
        fontFamily: "inherit",
        wordBreak: "break-all",
        whiteSpace: "normal",
        maxWidth: "100%",
      }}
    >
      {v || <span style={{ color: "#aaa", fontStyle: "italic" }}>({ph || "미입력"})</span>}
    </span>
  );
}

function CB({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 3, cursor: "pointer", marginRight: 8, fontSize: "9pt", color: "#111" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 12, height: 12 }} />
      {label}
    </label>
  );
}

type CT = "parttime" | "standard_unlimited" | "standard_fixed" | "minor";
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
const DAYKEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const RESPONSIVE_CSS = `
  .contract-layout {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 16px 16px 100px;
    width: 100%;
    box-sizing: border-box;
  }
  .form-section {
    width: 100%;
  }
  .preview-section {
    width: 100%;
  }
  
  @media (min-width: 900px) {
    .contract-layout {
      flex-direction: row;
      align-items: flex-start;
      max-width: 1200px;
      margin: 0 auto;
      gap: 28px;
      padding: 24px 24px 100px;
    }
    .form-section {
      flex: 1.1;
      position: sticky;
      top: 80px;
      max-height: calc(100vh - 140px);
      overflow-y: auto;
      padding-right: 4px;
    }
    .form-section::-webkit-scrollbar {
      width: 6px;
    }
    .form-section::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.1);
      border-radius: 4px;
    }
    .preview-section {
      flex: 1;
      min-width: 450px;
    }
  }
`;

function ContractContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const matchId = sp.get("matchId") || "";
  const memberId = sp.get("memberId") || "";
  const mode = sp.get("mode") || "";
  const fromParam = sp.get("from") || "";

  const { showToast, ToastUI } = useToast();
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<any[]>([]);
  const [selMatch, setSelMatch] = useState<any>(null);
  const [ct, setCt] = useState<CT>("standard_unlimited");
  const [step, setStep] = useState<"select" | "edit">("select");
  const [saving, setSaving] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [existingContract, setExistingContract] = useState<any>(null);
  const [myEps, setMyEps] = useState<any[]>([]);
  const [selEp, setSelEp] = useState<any>(null);
  const [myUserId, setMyUserId] = useState<string>("");

  // 스텝 위자드 상태 (0=사업체, 1=근로자, 2=근무, 3=임금, 4=보험/서명)
  const [wizardStep, setWizardStep] = useState(0);

  const [f, setF] = useState({
    biz: "", bizRegNo: "", ceo: "", ceoPhone: "",
    bizAddr: "", bizAddrDetail: "", samePlace: true, workPlace: "",
    bizType: "", jobDesc: "",
    worker: "", workerBirth: "", workerPhone: "", workerAddr: "", workerAddrDetail: "",
    contractType: "fixed",
    startDate: "", endDate: "",
    workDaysMon: false, workDaysTue: false, workDaysWed: false,
    workDaysThu: false, workDaysFri: false, workDaysSat: false, workDaysSun: false,
    workDaysMode: "check", workDaysText: "",
    workStart: "", workEnd: "", breakTime: "30",
    workStartMon: "09:00", workEndMon: "18:00", breakTimeMon: "30",
    workStartTue: "09:00", workEndTue: "18:00", breakTimeTue: "30",
    workStartWed: "09:00", workEndWed: "18:00", breakTimeWed: "30",
    workStartThu: "09:00", workEndThu: "18:00", breakTimeThu: "30",
    workStartFri: "09:00", workEndFri: "18:00", breakTimeFri: "30",
    workStartSat: "09:00", workEndSat: "18:00", breakTimeSat: "30",
    workStartSun: "09:00", workEndSun: "18:00", breakTimeSun: "30",
    weeklyHours: "", dailyHours: "",
    wage: "", payDay: "말일", payMethod: "계좌이체",
    insEmp: false, insAcc: false, insPension: false, insHealth: false,
    contractDate: "",
    school: "", grade: "",
    parentName: "", parentRel: "부", parentBirth: "", parentAddr: "", parentTel: "",
    wageType: "hour",
    hasBonus: false,
    bonusAmount: "",
    hasExtraWage: false,
    extraWageDetails: "",
    weeklyHoliday: "일",
    overtimePremiumRate: "50",
    hasFamilyCert: true,
    hasParentConsent: true,
    breakStart: "12:00",
    breakEnd: "13:00",
  });

  const updateField = (k: string, v: any) => {
    setF((p) => {
      const next = { ...p, [k]: v };
      if (k === "bizAddr" && p.samePlace) {
        next.workPlace = v;
      }
      // 근무요일 변경 시 주휴일 자동 추천 (첫 번째 쉬는 날)
      if (k.startsWith("workDays")) {
        const updatedNext = { ...next, [k]: v };
        const workingSet = new Set(DAYKEYS.filter(dk => updatedNext[`workDays${dk}` as keyof typeof updatedNext]));
        const firstOff = DAYKEYS.find(dk => !workingSet.has(dk));
        if (firstOff) next.weeklyHoliday = DAYS[DAYKEYS.indexOf(firstOff)];
      }
      return next;
    });
  };

  const selectedDays = DAYS.filter((_, i) => (f as any)[`workDays${DAYKEYS[i]}`]);

  // 급여 자동계산
  const payCalc = (() => {
    const wageRaw = Number(String(f.wage || "0").replace(/,/g, ""));
    const dailyH = parseFloat(String(f.dailyHours || "0")) || 0;
    const weekDays = selectedDays.length;
    if (!wageRaw || !dailyH || !weekDays) return null;

    // 시급 환산
    let hourlyRate = wageRaw;
    if (f.wageType === "day") hourlyRate = wageRaw / dailyH;
    else if (f.wageType === "month") hourlyRate = wageRaw / ((dailyH * weekDays) * 4.345);

    // 1일 기준 시간 분류
    const regularH = Math.min(8, dailyH);      // 법정근로
    const overtimeH = Math.max(0, dailyH - 8); // 연장근로

    // 야간근로 계산 (22:00~06:00 구간)
    let nightH = 0;
    if (f.workStart && f.workEnd) {
      const [sh, sm] = f.workStart.split(":").map(Number);
      const [eh, em] = f.workEnd.split(":").map(Number);
      const startMin = sh * 60 + sm;
      let endMin = eh * 60 + em;
      if (endMin <= startMin) endMin += 24 * 60; // 자정 넘기는 경우
      const nightStart = 22 * 60;
      const nightEnd = 30 * 60; // 다음날 06:00
      const overlapStart = Math.max(startMin, nightStart);
      const overlapEnd = Math.min(endMin, nightEnd);
      if (overlapEnd > overlapStart) nightH = (overlapEnd - overlapStart) / 60;
    }

    // 주간 합계
    const weekRegular = regularH * weekDays;
    const weekOvertime = overtimeH * weekDays;
    const weekNight = nightH * weekDays;
    const weekOvertimeWarn = weekOvertime > 12; // 주 12시간 초과 경고

    // 주휴수당 (주 15시간 이상 시 발생)
    const weekTotal = dailyH * weekDays;
    const juhyu = weekTotal >= 15 ? Math.round((weekTotal / 40) * 8 * hourlyRate) : 0;

    // 월 환산 (4.345주)
    const monthRegular = Math.round(weekRegular * 4.345 * hourlyRate);
    const monthOvertime = Math.round(weekOvertime * 4.345 * hourlyRate * 1.5);
    const monthNight = Math.round(weekNight * 4.345 * hourlyRate * 0.5); // 야간 가산분만
    const monthJuhyu = Math.round(juhyu * 4.345);
    const monthTotal = monthRegular + monthOvertime + monthNight + monthJuhyu;

    return {
      hourlyRate: Math.round(hourlyRate),
      regularH, overtimeH, nightH,
      weekRegular, weekOvertime, weekTotal, weekOvertimeWarn,
      juhyu: weekTotal >= 15,
      monthRegular, monthOvertime, monthNight, monthJuhyu, monthTotal,
    };
  })();

  // Daum Postcode 우편번호 서비스 연동
  const openAddressSearch = (field: "bizAddr" | "workerAddr") => {
    const loadPostcode = () => {
      new (window as any).daum.Postcode({
        oncomplete: (data: any) => {
          const fullAddress = data.roadAddress || data.jibunAddress;
          updateField(field, fullAddress);
          if (field === "bizAddr") updateField("bizAddrDetail", "");
          if (field === "workerAddr") updateField("workerAddrDetail", "");
        },
      }).open();
    };

    if ((window as any).daum?.Postcode) {
      loadPostcode();
      return;
    }
    const s = document.createElement("script");
    s.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    s.onload = loadPostcode;
    document.head.appendChild(s);
  };

  useEffect(() => {
    loadInit();
  }, [matchId, memberId]);

  const loadInit = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setMyUserId(user.id);
      // 스키마 확정 컬럼만 선택 (없는 컬럼 선택 시 쿼리 전체 실패)
      const { data: eps } = await supabase
        .from("employer_profiles")
        .select("id, business_name, business_type, address, region, user_id")
        .eq("user_id", user.id)
        .or("is_deleted.is.null,is_deleted.eq.false")
        .not("business_name", "is", null)
        .order("created_at", { ascending: false });
      let finalEps = eps;
      // 확장 컬럼 별도 병합 시도
      if (eps && eps.length > 0) {
        const { data: epsExt } = await supabase
          .from("employer_profiles")
          .select("id, biz_reg_number, ceo_name, biz_address, biz_tel")
          .eq("user_id", user.id)
          .or("is_deleted.is.null,is_deleted.eq.false")
          .not("business_name", "is", null)
          .order("created_at", { ascending: false });
        if (epsExt) {
          finalEps = eps.map((ep: any) => {
            const ext = epsExt.find((e: any) => e.id === ep.id) || {};
            return { ...ep, ...ext };
          });
        }
      }
      if (finalEps && finalEps.length > 0) {
        setMyEps(finalEps);
        setSelEp(finalEps[0]);
        applyEpToForm(finalEps[0], user.id, null);
      }
    }
    if (memberId) await loadByMember();
    else if (matchId) await load();
    else setLoading(false);
  };

  const load = async () => {
    const { data: cur } = await supabase.from("matches")
      .select("employer_id, worker_id").eq("id", matchId).single();
    if (!cur) {
      setLoading(false);
      return;
    }

    const { data: all } = await supabase.from("matches")
      .select("id, employer_id, worker_id, employer_profile_id, created_at, matched_at")
      .eq("employer_id", cur.employer_id).eq("worker_id", cur.worker_id)
      .eq("progress_status", "hired").order("created_at", { ascending: false });

    const enriched = await Promise.all((all || []).map(async (m: any, i: number) => {
      let ep = null;
      if (m.employer_profile_id) {
        const { data } = await supabase.from("employer_profiles")
          .select("business_name, business_type, region, wage, work_days, work_hours, biz_reg_number, ceo_name, biz_address, biz_tel")
          .eq("id", m.employer_profile_id).maybeSingle();
        ep = data;
      }
      if (!ep) {
        const { data } = await supabase.from("employer_profiles")
          .select("business_name, business_type, region, wage, work_days, work_hours, biz_reg_number, ceo_name, biz_address, biz_tel")
          .eq("user_id", m.employer_id)
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        ep = data;
      }
      return { ...m, ep, idx: (all?.length || 0) - i };
    }));
    setMatches(enriched);

    const [eu, wu] = await Promise.all([
      supabase.from("users").select("nickname, real_name, birth_date, phone, address").eq("id", cur.employer_id).single(),
      supabase.from("users").select("nickname, real_name, birth_date, phone, address").eq("id", cur.worker_id).single(),
    ]);

    const cur2 = enriched.find(m => m.id === matchId) || enriched[0];
    if (cur2) initF(cur2, eu.data, wu.data);

    if (mode === "update" && matchId) {
      const { data: existing } = await supabase.from("contracts")
        .select("*").eq("match_id", matchId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (existing?.contract_data) {
        setF(existing.contract_data);
        setCt(existing.contract_data.contractType || "parttime");
        setExistingContract(existing);
        setStep("edit");
      }
    }

    setLoading(false);
  };

  const loadByMember = async () => {
    const { data: tm } = await supabase
      .from("team_members")
      .select("id, employer_id, worker_id, employer_profile_id, wage, work_days, work_hours, member_role, status")
      .eq("id", memberId)
      .single();
    if (!tm) { setLoading(false); return; }

    const [eu, wu] = await Promise.all([
      supabase.from("users").select("nickname, real_name, birth_date, phone, address").eq("id", tm.employer_id).single(),
      supabase.from("users").select("nickname, real_name, birth_date, phone, address").eq("id", tm.worker_id).single(),
    ]);

    let ep = null;
    if (tm.employer_profile_id) {
      const { data } = await supabase
        .from("employer_profiles")
        .select("id, business_name, business_type, region, address, wage, work_days, work_hours, biz_reg_number, ceo_name, biz_address, biz_tel")
        .eq("id", tm.employer_profile_id).maybeSingle();
      ep = data;
    }
    if (!ep) {
      const { data } = await supabase
        .from("employer_profiles")
        .select("id, business_name, business_type, region, address, wage, work_days, work_hours, biz_reg_number, ceo_name, biz_address, biz_tel")
        .eq("user_id", tm.employer_id)
        .or("is_deleted.is.null,is_deleted.eq.false")
        .not("business_name", "is", null)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      ep = data;
    }

    const memberAsMatch = {
      id: tm.id,
      employer_id: tm.employer_id,
      worker_id: tm.worker_id,
      employer_profile_id: tm.employer_profile_id,
      ep,
      matched_at: null,
      created_at: new Date().toISOString(),
      _isMember: true,
    };

    setMatches([memberAsMatch]);
    initF(memberAsMatch, eu.data, wu.data);

    if (mode === "update") {
      const { data: existing } = await supabase.from("contracts")
        .select("*").eq("team_member_id", memberId)
        .neq("status", "superseded")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (existing?.contract_data) {
        setF(existing.contract_data);
        setCt(existing.contract_data.contractType || "parttime");
        setExistingContract(existing);
        setStep("edit");
      }
    }

    setLoading(false);
  };

  const initF = (m: any, eu: any, wu: any) => {
    setSelMatch(m);
    const ep = m.ep;
    const today = new Date();
    const md = new Date(m.matched_at || m.created_at);
    const wd = ep?.work_days || "";
    const dayFlags: Record<string, boolean> = {};
    DAYS.forEach((d, i) => { dayFlags[`workDays${DAYKEYS[i]}`] = wd.includes(d); });

    const cleanWorkHours = (ep?.work_hours || "").split("(")[0].trim();
    const [ws, we] = cleanWorkHours.includes("~")
      ? cleanWorkHours.split("~").map((s: string) => s.trim()) : ["", ""];

    const breakMatch = (ep?.work_hours || "").match(/휴게\s*(\d+)분/);
    const breakHoursMatch = (ep?.work_hours || "").match(/휴게\s*(\d+(\.\d+)?)시간/);
    let defaultBreak = "30";
    if (breakMatch) {
      defaultBreak = breakMatch[1];
    } else if (breakHoursMatch) {
      defaultBreak = String(parseFloat(breakHoursMatch[1]) * 60);
    } else if ((ep?.work_hours || "").includes("휴게 없음")) {
      defaultBreak = "0";
    }

    const holidayMatch = (ep?.work_hours || "").match(/주휴일\s*:\s*([가-힣a-zA-Z]+)/);
    const defaultHoliday = holidayMatch ? holidayMatch[1] : "일";

    const dayHours: Record<string, string> = {};
    DAYKEYS.forEach(dk => {
      dayHours[`workStart${dk}`] = ws || "09:00";
      dayHours[`workEnd${dk}`] = we || "18:00";
      dayHours[`breakTime${dk}`] = defaultBreak;
    });

    setF(p => ({
      ...p,
      biz: ep?.business_name || "",
      bizRegNo: ep?.biz_reg_number || "",
      ceo: ep?.ceo_name || eu?.real_name || eu?.nickname || "",
      ceoPhone: ep?.biz_tel || eu?.phone || "",
      bizAddr: ep?.biz_address || ep?.region || "",
      samePlace: !ep?.biz_address || ep?.biz_address === ep?.region,
      workPlace: ep?.region || "",
      bizType: ep?.business_type || "",
      jobDesc: ep?.business_type ? `${ep.business_type} 관련 업무` : "",
      worker: wu?.real_name || wu?.nickname || "",
      workerBirth: wu?.birth_date ? wu.birth_date.replace(/-/g, ". ") : "",
      workerPhone: wu?.phone || "",
      workerAddr: wu?.address || "",
      startDate: `${md.getFullYear()}. ${String(md.getMonth() + 1).padStart(2, "0")}. ${String(md.getDate()).padStart(2, "0")}.`,
      ...dayFlags,
      ...dayHours,
      workStart: ws, workEnd: we,
      dailyHours: ws && we ? String(Math.round((parseInt(we) - parseInt(ws)) * 10) / 10) : "",
      wage: ep?.wage ? Number(ep.wage).toLocaleString() : "",
      weeklyHoliday: defaultHoliday,
      contractDate: `${today.getFullYear()}년  ${String(today.getMonth() + 1).padStart(2, "0")}월  ${String(today.getDate()).padStart(2, "0")}일`,
    }));
  };

  const buildFullAddr = (ep: any) => {
    if (ep?.biz_address) return ep.biz_address;
    if (ep?.address) return ep.address;
    // sido/sigungu/eupmyeondong 조합
    const parts = [ep?.sido, ep?.sigungu, ep?.eupmyeondong].filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
    // region + address_detail 조합 (등록 페이지 저장 방식)
    const region = ep?.region || "";
    const detail = ep?.address_detail || "";
    if (region && detail && !region.includes(detail)) return `${region} ${detail}`;
    return region || detail;
  };

  const applyEpToForm = (ep: any, userId: string, wu: any) => {
    const today = new Date();
    const fullAddr = buildFullAddr(ep);
    setF(p => ({
      ...p,
      biz: ep?.business_name || "",
      bizRegNo: ep?.biz_reg_number || "",
      ceo: ep?.ceo_name || "",
      ceoPhone: ep?.biz_tel || "",
      bizAddr: fullAddr,
      samePlace: true,
      workPlace: fullAddr,
      bizType: ep?.business_type || "",
      jobDesc: ep?.business_type ? `${ep.business_type} 관련 업무` : "",
      worker: wu?.real_name || wu?.nickname || p.worker,
      workerBirth: wu?.birth_date ? wu.birth_date.replace(/-/g, ". ") : p.workerBirth,
      workerPhone: wu?.phone || p.workerPhone,
      workerAddr: wu?.address || p.workerAddr,
      contractDate: `${today.getFullYear()}년  ${String(today.getMonth() + 1).padStart(2, "0")}월  ${String(today.getDate()).padStart(2, "0")}일`,
    }));
  };

  const workDaysStr = f.workDaysMode === "text" ? f.workDaysText : selectedDays.join("·");

  const formatPhone = (v: string) => {
    const n = v.replace(/\D/g, "");
    if (n.length <= 3) return n;
    if (n.length <= 7) return `${n.slice(0, 3)}-${n.slice(3)}`;
    if (n.length <= 11) return `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7)}`;
    return `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7, 11)}`;
  };

  // "YYYY. MM. DD." ↔ "YYYY-MM-DD" (date input 호환)
  const toDateInput = (v: string) => v.replace(/\.\s*/g, "-").replace(/-$/, "").trim();
  const fromDateInput = (v: string) => {
    if (!v) return "";
    const [y, m, d] = v.split("-");
    return `${y}. ${m}. ${d}.`;
  };

  const formatBizNo = (v: string) => {
    const n = v.replace(/\D/g, "");
    if (n.length <= 3) return n;
    if (n.length <= 5) return `${n.slice(0, 3)}-${n.slice(3)}`;
    return `${n.slice(0, 3)}-${n.slice(3, 5)}-${n.slice(5, 10)}`;
  };

  const validate = (): string | null => {
    if (!f.biz.trim()) return "사업체명을 입력해주세요.";
    if (!f.ceo.trim()) return "대표자 성명을 입력해주세요.";
    if (!f.worker.trim()) return "근로자 성명을 입력해주세요.";
    if (!f.startDate.trim()) return "계약 시작일을 입력해주세요.";
    if (!f.wage.trim()) return "시급을 입력해주세요.";
    const wageNum = parseInt(f.wage.replace(/,/g, ""));
    const minWage = getMinWageForDate(f.startDate);
    if (isNaN(wageNum) || isUnderMinWage(wageNum, f.startDate)) {
      return `시급이 최저임금(${minWage.toLocaleString()}원)보다 낮아요.\n현재 입력: ${f.wage}원`;
    }
    if (f.workDaysMode === "check" && selectedDays.length === 0) {
      return "근무 요일을 선택해주세요.";
    }
    return null;
  };

  const buildPayload = () => ({
    employer_id: selMatch.employer_id,
    worker_id: selMatch.worker_id,
    start_date: f.startDate.replace(/\.\s*/g, "-").replace(/-$/, "").trim() || null,
    end_date: f.contractType !== "unlimited" && f.endDate
      ? f.endDate.replace(/\.\s*/g, "-").replace(/-$/, "").trim() : null,
    wage: f.wage ? parseInt(f.wage.replace(/,/g, "")) : null,
    work_days: workDaysStr,
    work_hours: f.dailyHours || null,
    contract_data: { ...f, contractType: ct },
    status: "pending",
    employer_signed: true,
    worker_signed: false,
    signed_at: new Date().toISOString(),
  });

  const doSave = async (saveMode: "overwrite" | "new") => {
    if (!selMatch) return;

    const err = validate();
    if (err) {
      showToast(`⚠️ ${err}`, "error");
      return;
    }

    setShowSaveModal(false);
    setSaving(true);
    const payload = buildPayload();
    let error = null;

    if (saveMode === "overwrite" && existingContract) {
      const r = await supabase.from("contracts")
        .update({ ...payload, status: "pending", worker_signed: false })
        .eq("id", existingContract.id);
      error = r.error;
    } else {
      await supabase.from("contracts")
        .update({ status: "superseded" })
        .eq("team_member_id", selMatch.id)
        .neq("status", "superseded");

      const r = await supabase.from("contracts")
        .insert({ ...payload, team_member_id: selMatch.id });
      error = r.error;
    }

    if (!error) {
      // 1. 대표자 프로필 및 근로자 연락처 동기화
      if (selMatch?.employer_id) {
        await supabase.from("users").update({ phone: f.ceoPhone }).eq("id", selMatch.employer_id);
      }
      if (selEp?.id) {
        await supabase.from("employer_profiles").update({
          biz_reg_number: f.bizRegNo, ceo_name: f.ceo,
          address: [f.bizAddr, f.bizAddrDetail].filter(Boolean).join(" "), biz_address: [f.bizAddr, f.bizAddrDetail].filter(Boolean).join(" "), biz_tel: f.ceoPhone,
        }).eq("id", selEp.id);
      } else if (selMatch?.employer_id) {
        await supabase.from("employer_profiles").update({
          biz_reg_number: f.bizRegNo, ceo_name: f.ceo,
          address: [f.bizAddr, f.bizAddrDetail].filter(Boolean).join(" "), biz_address: [f.bizAddr, f.bizAddrDetail].filter(Boolean).join(" "), biz_tel: f.ceoPhone,
        }).eq("user_id", selMatch.employer_id);
      }
      if (selMatch?.worker_id) {
        await supabase.from("users").update({ phone: f.workerPhone, address: [f.workerAddr, f.workerAddrDetail].filter(Boolean).join(" ") }).eq("id", selMatch.worker_id);
      }

      // 2. 최종 계약 정보를 team_members 테이블에 실시간 덮어쓰기 (동기화)
      if (selMatch.id) {
        await supabase.from("team_members").update({
          wage: payload.wage,
          work_days: payload.work_days,
          work_hours: payload.work_hours,
        }).eq("id", selMatch.id);
      }

      // 3. 채팅방 알림 메시지 전송
      const sendMatchId = selMatch.id || matchId;
      if (sendMatchId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && selMatch.employer_id && selMatch.worker_id) {
          const receiverId = user.id === selMatch.employer_id ? selMatch.worker_id : selMatch.employer_id;
          try {
            const msg = saveMode === "new"
              ? "📄 새 근로계약서가 발행됐어요.\n기존 계약서를 대체하는 새 계약서예요.\n검토 후 동의해주세요."
              : "📄 근로계약서가 수정됐어요. 검토 후 동의해주세요.";
            await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                matchId: sendMatchId,
                senderId: user.id,
                receiverId,
                message: msg,
                messageType: "system",
              }),
            });
          } catch (msgErr) {
            console.error("채팅 API 오류:", msgErr);
          }
        }
      }

      showToast(saveMode === "overwrite"
        ? "✅ 계약서가 수정됐어요! 알바생 재동의 필요"
        : "✅ 새 계약서가 발행됐어요! 알바생 동의 대기중");

      setTimeout(() => {
        if (fromParam === "chat" && selMatch?.id) {
          router.replace(`/chat/${selMatch.id}`);
        } else if (fromParam === "team") {
          router.back();
        } else {
          if (selMatch?.id) router.replace(`/chat/${selMatch.id}`);
          else router.back();
        }
      }, 1000);
    } else {
      showToast("저장 오류: " + error.message, "error");
    }
    setSaving(false);
  };

  const saveContract = async () => {
    if (!selMatch) return;
    const { data: existing } = await supabase.from("contracts")
      .select("id, created_at, contract_data, worker_signed, status")
      .eq("team_member_id", selMatch.id)
      .neq("status", "superseded")
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();

    if (existing) {
      if (existing.worker_signed) {
        const confirmed = window.confirm(
          "📄 새 근로계약서 작성\n\n" +
          "⚠️ 주의사항\n" +
          "· 이미 동의가 완료된 계약서가 있어요.\n" +
          "· 새 계약서는 기존 계약서를 대체해요.\n" +
          "· 기존 계약서는 이력으로 보존돼요.\n" +
          "· 알바생이 새 계약서에 다시 동의해야\n" +
          "  법적 효력이 발생해요.\n\n" +
          "계속 진행할까요?"
        );
        if (!confirmed) return;
        doSave("new");
      } else {
        setExistingContract(existing);
        setShowSaveModal(true);
      }
    } else {
      doSave("new");
    }
  };

  const downloadPDF = async () => {
    const el = document.getElementById("official-form-render");
    if (!el) return;
    try {
      setSaving(true);
      const { default: jsPDF } = await import("jspdf");
      const { default: html2canvas } = await import("html2canvas");

      const canvas = await html2canvas(el, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: 794,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`근로계약서_${f.biz || "파잡"}_${f.worker || "근로자"}.pdf`);
    } catch (e: any) {
      alert("PDF 생성 중 오류 발생: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const print = () => {
    const el = document.getElementById("official-form-render");
    if (!el) return;
    const w = window.open("", "_blank", "width=900,height=1200");
    if (!w) return;
    w.document.write(getOfficialFormHTML(el.innerHTML));
    w.document.close();
    setTimeout(() => w.print(), 600);
  };

  const ContractBody = () => {
    const titles: Record<CT, string> = {
      parttime: "단시간근로자 표준근로계약서",
      standard_unlimited: "표준근로계약서 (기간의 정함이 없는 경우)",
      standard_fixed: "표준근로계약서 (기간의 정함이 있는 경우)",
      minor: "연소근로자 표준근로계약서",
    };

    return (
      <div style={{ fontFamily: "'Noto Sans KR',sans-serif", fontSize: "9.5pt", color: "#000", lineHeight: 1.6 }}>
        <div className="title" style={{ fontSize: "14pt", fontWeight: 900, textAlign: "center", marginBottom: 6 }}>{titles[ct]}</div>
        <div className="subtitle" style={{ fontSize: "9pt", color: "#666", textAlign: "center", marginBottom: 12 }}>(「근로기준법」 제17조에 따른 서면 근로계약)</div>
        <div className="law" style={{ marginBottom: 16, fontSize: "9.5pt" }}>사업주와 근로자는 다음과 같이 근로계약을 체결한다.</div>

        {/* 1. 계약 기간 */}
        <div className="section" style={{ fontWeight: 700, marginTop: 12, marginBottom: 4 }}>1. 근로계약기간</div>
        <div className="indent" style={{ paddingLeft: 12 }}>
          {ct === "standard_unlimited" ? (
            <span>
              근로개시일: <E v={f.startDate} ph="년   월   일" /> 부터
            </span>
          ) : (
            <span>
              근로계약기간: <E v={f.startDate} ph="년   월   일" /> 부터 &nbsp;
              <E v={f.endDate} ph="년   월   일" /> 까지
            </span>
          )}
        </div>

        {/* 2. 근무장소 */}
        <div className="section" style={{ fontWeight: 700, marginTop: 12, marginBottom: 4 }}>2. 근무장소</div>
        <div className="indent" style={{ paddingLeft: 12 }}>
          <E v={f.workPlace} ph="실제 근무할 장소 주소 입력" />
        </div>

        {/* 3. 업무내용 */}
        <div className="section" style={{ fontWeight: 700, marginTop: 12, marginBottom: 4 }}>3. 업무의 내용</div>
        <div className="indent" style={{ paddingLeft: 12 }}>
          <E v={f.jobDesc} ph="담당 직종 및 상세 업무 내용 입력" />
        </div>

        {/* 4. 소정근로시간 / 근무 요일 */}
        {ct !== "parttime" ? (
          <>
            <div className="section" style={{ fontWeight: 700, marginTop: 12, marginBottom: 4 }}>4. 소정근로시간</div>
            <div className="indent" style={{ paddingLeft: 12 }}>
              <E v={f.workStart} ph="09:00" /> 부터 &nbsp;
              <E v={f.workEnd} ph="18:00" /> 까지 &nbsp;
              (휴게시간: <E v={f.breakStart} ph="12:00" /> ~ &nbsp;
              <E v={f.breakEnd} ph="13:00" />)
              <div style={{ marginTop: 2 }}>
                (1일 소정근로시간: <E v={f.dailyHours} ph="8" />시간, &nbsp;
                1주 소정근로시간: <E v={f.weeklyHours} ph="40" />시간)
              </div>
            </div>

            <div className="section" style={{ fontWeight: 700, marginTop: 12, marginBottom: 4 }}>5. 근무일 / 휴일</div>
            <div className="indent" style={{ paddingLeft: 12 }}>
              매주 <E v={f.workDaysText} ph="5" />일 근무
              {f.workDaysMode === "check" && selectedDays.length > 0 && (" (근무일: " + selectedDays.join("·") + ")")}, 주휴일 매주 <E v={f.weeklyHoliday} ph="일" />요일
              <div className="note" style={{ marginTop: 2, fontSize: "8pt", color: "#666" }}>
                • 공휴일(대체공휴일 포함)은 근로기준법이 정하는 바에 따르며, 근로자의 날은 유급휴일로 함
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="section" style={{ fontWeight: 700, marginTop: 12, marginBottom: 4 }}>4. 근로일 및 근로일별 근로시간</div>
            <div className="indent" style={{ paddingLeft: 12, overflowX: "auto", marginBottom: 4 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6, tableLayout: "fixed", border: "1px solid #ddd" }}>
                <tbody>
                  <tr style={{ borderBottom: "1px solid #ddd" }}>
                    <td className="th2" style={{ width: "75px", background: "#f5f5f5", fontWeight: 600, textAlign: "center", padding: "4px" }}>근무일</td>
                    {selectedDays.map(d => (
                      <td key={d} className="th2" style={{ background: "#f5f5f5", fontWeight: 600, textAlign: "center", padding: "4px", borderLeft: "1px solid #ddd" }}>{d}요일</td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #ddd" }}>
                    <td className="th" style={{ background: "#fff", fontSize: "8.5pt", textAlign: "center", padding: "4px" }}>시작 시간</td>
                    {selectedDays.map(d => {
                      const idx = DAYS.indexOf(d);
                      const key = "workStart" + DAYKEYS[idx];
                      return (
                        <td key={d} style={{ textAlign: "center", padding: "4px 2px", borderLeft: "1px solid #ddd" }}>
                          <E v={(f as any)[key]} ph="09:00" />
                        </td>
                      );
                    })}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #ddd" }}>
                    <td className="th" style={{ background: "#fff", fontSize: "8.5pt", textAlign: "center", padding: "4px" }}>종료 시간</td>
                    {selectedDays.map(d => {
                      const idx = DAYS.indexOf(d);
                      const key = "workEnd" + DAYKEYS[idx];
                      return (
                        <td key={d} style={{ textAlign: "center", padding: "4px 2px", borderLeft: "1px solid #ddd" }}>
                          <E v={(f as any)[key]} ph="18:00" />
                        </td>
                      );
                    })}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #ddd" }}>
                    <td className="th" style={{ background: "#fff", fontSize: "8.5pt", textAlign: "center", padding: "4px" }}>휴게 (분)</td>
                    {selectedDays.map(d => {
                      const idx = DAYS.indexOf(d);
                      const key = "breakTime" + DAYKEYS[idx];
                      return (
                        <td key={d} style={{ textAlign: "center", padding: "4px 2px", borderLeft: "1px solid #ddd" }}>
                          <E v={(f as any)[key]} ph="30" />분
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
              <div style={{ marginTop: 4 }}>
                주휴일: 매주 <E v={f.weeklyHoliday} ph="일" />요일
              </div>
              <div className="note" style={{ marginTop: 2, fontSize: "8pt", color: "#666" }}>
                • 공휴일(대체공휴일 포함)은 근로기준법이 정하는 바에 따르며, 근로자의 날은 유급휴일로 함
              </div>
            </div>
          </>
        )}

        {/* 임금 조건 */}
        <div className="section" style={{ fontWeight: 700, marginTop: 12, marginBottom: 4 }}>{ct === "parttime" ? "5" : "6"}. 임금</div>
        <div className="indent" style={{ paddingLeft: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span>• 임금형태: {f.wageType === "hour" ? "시간급" : f.wageType === "day" ? "일급" : "월급"} </span>
            &nbsp;: &nbsp;<E v={f.wage} ph="10,030" /> 원
          </div>

          <div style={{ marginTop: 4 }}>
            • 상여금: {f.hasBonus ? `있음 (금액: ${f.bonusAmount} 원)` : "없음"}
          </div>

          <div style={{ marginTop: 4 }}>
            • 그 밖의 수당(약정수당): {f.hasExtraWage ? `있음 (내역: ${f.extraWageDetails})` : "없음"}
          </div>

          {ct === "parttime" && (
            <div style={{ marginTop: 4 }}>
              • 초과근로에 대한 가산임금률: <E v={f.overtimePremiumRate} ph="50" /> %
            </div>
          )}

          <div style={{ marginTop: 4 }}>
            • 임금지급일: 매월(매주 또는 매일) <E v={f.payDay} ph="말일" /> 일 (휴일의 경우는 전날 지급)
          </div>

          <div style={{ marginTop: 4 }}>
            • 지급방법: {f.payMethod}
          </div>
        </div>

        {/* 연차유급휴가 */}
        <div className="section" style={{ fontWeight: 700, marginTop: 12, marginBottom: 4 }}>{ct === "parttime" ? "6" : "7"}. 연차유급휴가</div>
        <div className="indent" style={{ paddingLeft: 12 }}>
          {ct === "parttime" ? (
            "• 통상근로자의 근로시간에 비례하여 연차유급휴가를 부여함"
          ) : (
            "• 연차유급휴가는 근로기준법에서 정하는 바에 따라 부여함"
          )}
        </div>

        {/* 연소근로자 가족관계증명서 */}
        {ct === "minor" && (
          <>
            <div className="section" style={{ fontWeight: 700, marginTop: 12, marginBottom: 4 }}>8. 가족관계증명서 및 동의서 구비</div>
            <div className="indent" style={{ paddingLeft: 12 }}>
              • 가족관계기록사항에 관한 증명서 제출 여부: {f.hasFamilyCert ? "제출함" : "미제출"}
              <br />
              • 친권자 또는 후견인 동의서 구비 여부: {f.hasParentConsent ? "구비함" : "미구비"}
            </div>
          </>
        )}

        {/* 사회보험 */}
        <div className="section" style={{ fontWeight: 700, marginTop: 12, marginBottom: 4 }}>{ct === "minor" ? "9" : ct === "parttime" ? "7" : "8"}. 사회보험 적용여부</div>
        <div className="indent" style={{ paddingLeft: 12 }}>
          <div style={{ display: "flex", gap: 12, marginTop: 2 }}>
            {["고용보험", "산재보험", "국민연금", "건강보험"].map((lbl, idx) => {
              const keys = ["insEmp", "insAcc", "insPension", "insHealth"];
              const isChecked = (f as any)[keys[idx]];
              return (
                <span key={lbl} style={{ fontSize: "9.5pt" }}>
                  [{isChecked ? "✓" : " "}] {lbl}
                </span>
              );
            })}
          </div>
        </div>

        {/* 교부 및 성실 이행 */}
        <div className="section" style={{ fontWeight: 700, marginTop: 12, marginBottom: 4 }}>{ct === "minor" ? "10" : ct === "parttime" ? "8" : "9"}. 근로계약서 교부</div>
        <div className="indent" style={{ paddingLeft: 12, fontSize: "8.5pt", color: "#666" }}>
          • 사업주는 근로계약을 체결함과 동시에 본 계약서를 사본하여 근로자의 교부요구와 관계없이 근로자에게 교부함(근로기준법 제17조 이행)
        </div>

        <div className="section" style={{ fontWeight: 700, marginTop: 12, marginBottom: 4 }}>{ct === "minor" ? "11" : ct === "parttime" ? "9" : "10"}. 근로계약 등의 성실한 이행의무</div>
        <div className="indent" style={{ paddingLeft: 12, fontSize: "8.5pt", color: "#666" }}>
          • 사업주와 근로자는 각자가 근로계약, 취업규칙, 단체협약을 지키고 성실하게 이행하여야 함
        </div>

        {/* 서명부 */}
        <div className="sign-area" style={{ marginTop: 24, borderTop: "1px dashed #bbb", paddingTop: 16 }}>
          <div style={{ textAlign: "center", marginBottom: 14, fontWeight: 700 }}>
            {f.contractDate}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ background: "#f8f9fa", border: "1px solid #ddd", borderRadius: 8, padding: 8 }}>
              <span style={{ fontWeight: 700, fontSize: "9.5pt", display: "block", marginBottom: 4, color: "#7c3aed" }}>사 업 주 (구인자)</span>
              <div style={{ fontSize: "8.5pt", color: "#333", display: "flex", flexDirection: "column", gap: 1 }}>
                <div>사업체명 : {f.biz} &nbsp; (사업자등록번호: {f.bizRegNo})</div>
                <div>대 표 자 : {f.ceo} &nbsp; (서명/날인)</div>
                <div>주    소 : {[f.bizAddr, f.bizAddrDetail].filter(Boolean).join(" ")}</div>
                <div>연 락 처 : {f.ceoPhone}</div>
              </div>
            </div>

            <div style={{ background: "#f8f9fa", border: "1px solid #ddd", borderRadius: 8, padding: 8 }}>
              <span style={{ fontWeight: 700, fontSize: "9.5pt", display: "block", marginBottom: 4, color: "#ec4899" }}>근 로 자 (구직자)</span>
              <div style={{ fontSize: "8.5pt", color: "#333", display: "flex", flexDirection: "column", gap: 1 }}>
                <div>성    명 : {f.worker} &nbsp; (생년월일: {f.workerBirth})</div>
                <div>주    소 : {[f.workerAddr, f.workerAddrDetail].filter(Boolean).join(" ")}</div>
                <div>연 락 처 : {f.workerPhone} &nbsp; (서명/날인)</div>
              </div>
            </div>

            {ct === "minor" && (
              <div style={{ background: "#fff9db", border: "1px solid #ffe3e3", borderRadius: 8, padding: 10 }}>
                <span style={{ fontWeight: 700, fontSize: "9.5pt", display: "block", color: "#e8590c", marginBottom: 4, textAlign: "center" }}>👨‍👩‍👦 친권자 (후견인) 동의서</span>
                <p style={{ fontSize: "8pt", color: "#666", margin: "0 0 6px", textAlign: "center", lineHeight: 1.4 }}>
                  본인은 위 연소근로자(만 18세 미만)의 친권자로서, 위 매장에서의 근로계약 체결에 동의합니다.
                </p>
                <div style={{ fontSize: "8.5pt", color: "#333", display: "flex", flexDirection: "column", gap: 1 }}>
                  <div>친권자 성명 : {f.parentName} &nbsp; (관계: {f.parentRel})</div>
                  <div>생년월일 : {f.parentBirth}</div>
                  <div>주    소 : {f.parentAddr}</div>
                  <div>연 락 처 : {f.parentTel} &nbsp; (서명)</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>로딩 중...</p>
      {ToastUI}
    </main>
  );

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", width: "100%", paddingBottom: 80 }}>
      <style dangerouslySetInnerHTML={{ __html: RESPONSIVE_CSS }} />
      {ToastUI}

      {/* 저장 선택 모달 */}
      {showSaveModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: "var(--surface)", borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>기존 계약서가 존재합니다.</p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>
              📄 {existingContract?.contract_data?.contractType === "parttime" ? "단시간근로자" : "표준"} 근로계약서
              &nbsp;({new Date(existingContract?.created_at).toLocaleDateString("ko-KR")})
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => doSave("overwrite")}
                style={{ background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", borderRadius: 14, padding: 14, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                ✏️ 기존 계약서 수정 (덮어쓰기)
              </button>
              <button onClick={() => doSave("new")}
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 14, padding: 14, color: "var(--text)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                📄 새 계약서로 추가 (재계약)
              </button>
              <button onClick={() => setShowSaveModal(false)}
                style={{ background: "none", border: "none", padding: 10, color: "var(--text-muted)", fontSize: 13, cursor: "pointer" }}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(24,24,27,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)", padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, maxWidth: 1200, margin: "0 auto" }}>
          <button onClick={() => step === "edit" ? setStep("select") : router.back()}
            style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer", padding: "0 4px" }}>←</button>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>근로계약서 작성</span>
        </div>
      </div>

      {step === "select" ? (
        <div style={{ padding: 16, maxWidth: 480, margin: "0 auto" }}>

          {/* 업장 선택 */}
          {myEps.length > 0 && (
            <>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>사업체 선택</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
                {myEps.map(ep => (
                  <button key={ep.id} onClick={() => {
                    setSelEp(ep);
                    applyEpToForm(ep, myUserId, null);
                  }}
                    style={{
                      background: selEp?.id === ep.id ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "var(--surface2)",
                      border: "1.5px solid " + (selEp?.id === ep.id ? "#7c3aed" : "var(--border)"),
                      borderRadius: 20,
                      padding: "8px 16px",
                      color: selEp?.id === ep.id ? "#fff" : "var(--text)",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}>
                    🏢 {ep.business_name || "업장"}
                  </button>
                ))}
              </div>
              {selEp && (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", marginBottom: 18, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
                  {selEp.business_name && <div><span style={{ color: "var(--text)", fontWeight: 700 }}>{selEp.business_name}</span></div>}
                  {selEp.ceo_name && <div>대표: {selEp.ceo_name}</div>}
                  {selEp.biz_reg_number && <div>사업자번호: {selEp.biz_reg_number}</div>}
                  {buildFullAddr(selEp) && <div>주소: {buildFullAddr(selEp)}</div>}
                  {selEp.biz_tel && <div>연락처: {selEp.biz_tel}</div>}
                </div>
              )}
            </>
          )}

          {/* 계약서 종류 선택 */}
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>계약서 종류 선택</p>
          {([
            { id: "standard_unlimited" as CT, label: "표준근로계약서 (무기계약)", desc: "기간의 정함이 없는 일반 근로계약" },
            { id: "standard_fixed" as CT, label: "표준근로계약서 (기간제)", desc: "근무 기간을 명시하는 계약직 근로계약" },
            { id: "minor" as CT, label: "연소근로자 표준근로계약서", desc: "만 18세 미만 청소년 — 친권자 동의 포함" },
            { id: "parttime" as CT, label: "단시간근로자 표준근로계약서", desc: "주 15시간 미만 또는 단시간 알바 (가장 일반적)" },
          ]).map(c => (
            <div key={c.id} onClick={() => setCt(c.id)}
              style={{ background: ct === c.id ? "linear-gradient(135deg,#7c3aed15,#ec489915)" : "var(--surface)", border: "1.5px solid " + (ct === c.id ? "#7c3aed" : "var(--border)"), borderRadius: 14, padding: "14px 16px", marginBottom: 10, cursor: "pointer", transition: "all 0.15s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid " + (ct === c.id ? "#7c3aed" : "var(--border)"), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {ct === c.id && <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#7c3aed" }} />}
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{c.label}</span>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 0 26px" }}>{c.desc}</p>
            </div>
          ))}

          {/* matchId 있을 때만 매칭 계약 선택 */}
          {matches.length > 1 && <>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "16px 0 10px" }}>연결된 계약 선택</p>
            {matches.map(m => (
              <div key={m.id} onClick={() => { setSelMatch(m); initF(m, null, null); }}
                style={{ background: selMatch?.id === m.id ? "var(--surface2)" : "var(--surface)", border: "1.5px solid " + (selMatch?.id === m.id ? "#7c3aed" : "var(--border)"), borderRadius: 12, padding: "12px 14px", marginBottom: 8, cursor: "pointer" }}>
                <span style={{ fontSize: 13, color: "var(--text)" }}>계약 #{m.idx} — {m.ep?.business_name || "매장"}</span>
              </div>
            ))}
          </>}

          <button onClick={() => setStep("edit")}
            style={{ width: "100%", background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", border: "none", color: "#fff", fontWeight: 700, padding: 16, borderRadius: 16, fontSize: 15, cursor: "pointer", marginTop: 8 }}>
            계약서 작성 시작 →
          </button>
        </div>
      ) : (
        <div className="contract-layout">
          
          {/* 📋 모바일/데스크톱 입력 폼 */}
          <div className="form-section">
            <div style={cardStyle}>
              {/* 스텝 위자드 헤더 */}
              {(() => {
                const steps = [
                  { label: "사업체", icon: "🏢" },
                  { label: "근로자", icon: "👤" },
                  { label: "근무", icon: "📅" },
                  { label: "임금", icon: "💰" },
                  { label: "보험·서명", icon: "🛡️" },
                ];
                return (
                  <div style={{ marginBottom: 20 }}>
                    {/* 스텝 라벨 */}
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      {steps.map((s, i) => (
                        <button key={i} onClick={() => setWizardStep(i)}
                          style={{
                            background: "none", border: "none", cursor: "pointer",
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                            opacity: i === wizardStep ? 1 : 0.45,
                            transition: "opacity 0.15s",
                            padding: 0,
                          }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: "50%",
                            background: i < wizardStep ? "linear-gradient(135deg,#7c3aed,#ec4899)"
                              : i === wizardStep ? "linear-gradient(135deg,#8b5cf6,#f472b6)"
                              : "var(--surface2)",
                            border: i === wizardStep ? "2px solid #f472b6" : "2px solid transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: i < wizardStep ? 13 : 14,
                            color: "#fff",
                            fontWeight: 700,
                          }}>
                            {i < wizardStep ? "✓" : s.icon}
                          </div>
                          <span style={{ fontSize: 9, color: i === wizardStep ? "#f472b6" : "var(--text-muted)", fontWeight: i === wizardStep ? 700 : 400 }}>
                            {s.label}
                          </span>
                        </button>
                      ))}
                    </div>
                    {/* 진행 바 */}
                    <div style={{ height: 3, background: "var(--surface2)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${(wizardStep / (steps.length - 1)) * 100}%`,
                        background: "linear-gradient(90deg,#7c3aed,#ec4899)",
                        borderRadius: 99,
                        transition: "width 0.3s ease",
                      }} />
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "10px 0 0" }}>
                      {steps[wizardStep].icon} {steps[wizardStep].label} 정보
                      <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400, marginLeft: 8 }}>
                        {wizardStep + 1} / {steps.length}
                      </span>
                    </p>
                  </div>
                );
              })()}

              {/* 스텝 0: 사업체 */}
              {wizardStep === 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {myEps.length > 0 && (
                    <div>
                      <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>업장 선택</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {myEps.map(ep => (
                          <button key={ep.id} onClick={() => {
                            setSelEp(ep);
                            applyEpToForm(ep, myUserId, null);
                          }}
                            style={{
                              background: selEp?.id === ep.id ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "var(--surface2)",
                              border: "1.5px solid " + (selEp?.id === ep.id ? "#7c3aed" : "var(--border)"),
                              borderRadius: 16,
                              padding: "5px 12px",
                              color: selEp?.id === ep.id ? "#fff" : "var(--text)",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}>
                            {ep.business_name || "업장"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)" }}>회사명/상호</label>
                    <input style={inputStyle} value={f.biz} onChange={e => updateField("biz", e.target.value)} placeholder="예) 파스쿠찌 신창점" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)" }}>사업자등록번호</label>
                    <input style={inputStyle} value={f.bizRegNo} onChange={e => updateField("bizRegNo", formatBizNo(e.target.value))} placeholder="000-00-00000" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)" }}>대표자 성명</label>
                    <input style={inputStyle} value={f.ceo} onChange={e => updateField("ceo", e.target.value)} placeholder="성명 입력" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)" }}>대표 연락처</label>
                    <input style={inputStyle} value={f.ceoPhone} onChange={e => updateField("ceoPhone", formatPhone(e.target.value))} placeholder="010-0000-0000" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)" }}>사업장 소재지 주소</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input style={{ ...inputStyle, flex: 1 }} value={f.bizAddr} onChange={e => updateField("bizAddr", e.target.value)} placeholder="주소 입력" readOnly />
                      <button onClick={() => openAddressSearch("bizAddr")} style={{ ...btnSecondary, width: "auto", fontSize: 11, padding: "10px 12px" }}>🔍 검색</button>
                    </div>
                    {f.bizAddr && (
                      <input
                        style={{ ...inputStyle, marginTop: 6 }}
                        value={f.bizAddrDetail}
                        onChange={e => updateField("bizAddrDetail", e.target.value)}
                        placeholder="상세주소 입력 (동·호수·층 등)"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* 스텝 1: 근로자 */}
              {wizardStep === 1 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>근로자 이름</label>
                    <input style={inputStyle} value={f.worker} onChange={e => updateField("worker", e.target.value)} placeholder="근로자 이름" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>생년월일</label>
                    <input type="date" style={inputStyle} value={toDateInput(f.workerBirth)} onChange={e => updateField("workerBirth", fromDateInput(e.target.value))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>연락처</label>
                    <input type="tel" style={inputStyle} value={f.workerPhone} onChange={e => updateField("workerPhone", formatPhone(e.target.value))} placeholder="010-0000-0000" inputMode="tel" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>주소 (등본지 주소)</label>
                    <button onClick={() => openAddressSearch("workerAddr")}
                      style={{ width: "100%", background: "var(--surface2)", border: "1.5px solid var(--border)", borderRadius: 12, padding: "13px 16px", color: f.workerAddr ? "var(--text)" : "var(--text-muted)", fontSize: 13, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16 }}>🔍</span>
                      <span>{f.workerAddr || "주소 검색 (도로명/지번)"}</span>
                    </button>
                    {f.workerAddr && (
                      <input
                        style={{ ...inputStyle, marginTop: 6 }}
                        value={f.workerAddrDetail}
                        onChange={e => updateField("workerAddrDetail", e.target.value)}
                        placeholder="상세주소 입력 (동·호수·층 등)"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* 스텝 2: 근무일 및 시간 */}
              {wizardStep === 2 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* 계약 기간 */}
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>계약 개시일</label>
                    <input type="date" style={inputStyle} value={toDateInput(f.startDate)} onChange={e => updateField("startDate", fromDateInput(e.target.value))} />
                  </div>
                  {ct !== "standard_unlimited" && (
                    <div>
                      <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>계약 종료일</label>
                      <input type="date" style={inputStyle} value={toDateInput(f.endDate)} onChange={e => updateField("endDate", fromDateInput(e.target.value))} />
                    </div>
                  )}

                  {/* 근무장소 */}
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>실제 근무장소</label>
                    <button onClick={() => {
                      updateField("samePlace", !f.samePlace);
                      if (!f.samePlace) updateField("workPlace", f.bizAddr);
                    }}
                      style={{
                        width: "100%", background: f.samePlace ? "linear-gradient(135deg,#7c3aed20,#ec489920)" : "var(--surface2)",
                        border: "1.5px solid " + (f.samePlace ? "#7c3aed" : "var(--border)"),
                        borderRadius: 12, padding: "12px 16px", color: "var(--text)", fontSize: 13,
                        textAlign: "left", cursor: "pointer", fontWeight: f.samePlace ? 700 : 400,
                      }}>
                      {f.samePlace ? "✓ 사업장 주소와 동일" : "사업장 주소와 동일 (탭하여 선택)"}
                    </button>
                    {!f.samePlace && (
                      <input style={{ ...inputStyle, marginTop: 6 }} value={f.workPlace} onChange={e => updateField("workPlace", e.target.value)} placeholder="근무 주소 입력" />
                    )}
                  </div>

                  {/* 담당업무 preset 버튼 — 다중선택 */}
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>담당업무 <span style={{ fontWeight: 400 }}>(복수 선택 가능)</span></label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                      {["홀 서빙", "주방 보조", "카운터", "매장 청소", "배달", "재고 관리", "음료 제조", "포장·마감"].map(preset => {
                        const parts = f.jobDesc ? f.jobDesc.split(", ").map((s: string) => s.trim()).filter(Boolean) : [];
                        const on = parts.includes(preset);
                        return (
                          <button key={preset} onClick={() => {
                            const next = on ? parts.filter((p: string) => p !== preset) : [...parts, preset];
                            updateField("jobDesc", next.join(", "));
                          }}
                            style={{
                              background: on ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "var(--surface2)",
                              border: `1px solid ${on ? "#7c3aed" : "var(--border)"}`,
                              borderRadius: 20, padding: "8px 14px",
                              color: on ? "#fff" : "var(--text)", fontSize: 12, fontWeight: 600, cursor: "pointer",
                            }}>
                            {preset}
                          </button>
                        );
                      })}
                    </div>
                    <input style={inputStyle} value={f.jobDesc} onChange={e => updateField("jobDesc", e.target.value)} placeholder="직접 입력 또는 위에서 선택" />
                  </div>

                  <div style={divider} />

                  {/* 근무 요일 (공통) */}
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>근무 요일</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      {DAYS.map((d, i) => {
                        const key = `workDays${DAYKEYS[i]}`;
                        const active = (f as any)[key];
                        return (
                          <button key={d} onClick={() => updateField(key, !active)}
                            style={{
                              flex: 1, background: active ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "var(--surface2)",
                              border: "none", borderRadius: 10, padding: "10px 0",
                              fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer",
                            }}>
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 시간 입력 */}
                  {ct !== "parttime" ? (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>출근 시각</label>
                          <input type="time" style={inputStyle} value={f.workStart} onChange={e => updateField("workStart", e.target.value)} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>퇴근 시각</label>
                          <input type="time" style={inputStyle} value={f.workEnd} onChange={e => updateField("workEnd", e.target.value)} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>휴게 시작</label>
                          <input type="time" style={inputStyle} value={f.breakStart} onChange={e => updateField("breakStart", e.target.value)} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>휴게 종료</label>
                          <input type="time" style={inputStyle} value={f.breakEnd} onChange={e => updateField("breakEnd", e.target.value)} />
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>1일 소정시간(h)</label>
                          <input type="number" inputMode="decimal" style={inputStyle} value={f.dailyHours} onChange={e => updateField("dailyHours", e.target.value)} placeholder="8" />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>1주 소정시간(h)</label>
                          <input type="number" inputMode="decimal" style={inputStyle} value={f.weeklyHours} onChange={e => updateField("weeklyHours", e.target.value)} placeholder="40" />
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>주휴일 <span style={{ fontWeight: 400 }}>(유급 휴무일 · 하루치 추가 지급)</span></label>
                        <div style={{ display: "flex", gap: 6 }}>
                          {DAYS.map(d => {
                            const on = f.weeklyHoliday === d;
                            const isWorkDay = selectedDays.includes(d);
                            return (
                              <button key={d} onClick={() => updateField("weeklyHoliday", d)}
                                style={{
                                  flex: 1, background: on ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "var(--surface2)",
                                  border: `1px solid ${on ? "#7c3aed" : isWorkDay ? "var(--border)" : "rgba(139,92,246,0.3)"}`,
                                  borderRadius: 10, padding: "10px 0",
                                  fontSize: 13, fontWeight: 700,
                                  color: on ? "#fff" : isWorkDay ? "var(--text-muted)" : "var(--primary)",
                                  cursor: "pointer", opacity: isWorkDay ? 0.4 : 1,
                                }}>
                                {d}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  ) : (
                    selectedDays.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "rgba(0,0,0,0.15)", padding: 12, borderRadius: 12 }}>
                        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>요일별 근무 시간</p>
                        {selectedDays.map(d => {
                          const idx = DAYS.indexOf(d);
                          const keyStart = "workStart" + DAYKEYS[idx];
                          const keyEnd = "workEnd" + DAYKEYS[idx];
                          const keyBreak = "breakTime" + DAYKEYS[idx];
                          return (
                            <div key={d}>
                              <p style={{ fontSize: 12, fontWeight: 700, margin: "0 0 6px" }}>{d}요일</p>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 6 }}>
                                <input type="time" style={{ ...inputStyle, fontSize: 12 }} value={(f as any)[keyStart]} onChange={e => updateField(keyStart, e.target.value)} />
                                <input type="time" style={{ ...inputStyle, fontSize: 12 }} value={(f as any)[keyEnd]} onChange={e => updateField(keyEnd, e.target.value)} />
                                <div style={{ position: "relative" }}>
                                  <input type="number" inputMode="numeric" style={{ ...inputStyle, fontSize: 12 }} value={(f as any)[keyBreak]} onChange={e => updateField(keyBreak, e.target.value)} placeholder="30" />
                                  <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--text-muted)", pointerEvents: "none" }}>분</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                </div>
              )}

              {/* 스텝 3: 임금 */}
              {wizardStep === 3 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* 임금 구분 버튼 */}
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>임금 구분</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[{ v: "hour", label: "시간급" }, { v: "day", label: "일급" }, { v: "month", label: "월급" }].map(o => (
                        <button key={o.v} onClick={() => updateField("wageType", o.v)}
                          style={{
                            flex: 1, background: f.wageType === o.v ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "var(--surface2)",
                            border: "none", borderRadius: 12, padding: "13px 0",
                            color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
                          }}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 임금액 */}
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                      임금액 (원) — {new Date().getFullYear()}년 최저시급 {getMinWageForDate(f.startDate).toLocaleString()}원
                    </label>
                    <input type="tel" inputMode="numeric" style={inputStyle} value={f.wage}
                      onChange={e => {
                        const n = e.target.value.replace(/[^0-9]/g, "");
                        updateField("wage", n ? Number(n).toLocaleString() : "");
                      }} placeholder={getMinWageForDate(f.startDate).toLocaleString()} />
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      {[getMinWageForDate(f.startDate).toLocaleString(), "11,000", "12,000", "13,000"].map(v => (
                        <button key={v} onClick={() => updateField("wage", v)}
                          style={{ flex: 1, background: f.wage === v ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "var(--surface2)", border: "none", borderRadius: 8, padding: "8px 0", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 상여금 토글 */}
                  <button onClick={() => updateField("hasBonus", !f.hasBonus)}
                    style={{ background: f.hasBonus ? "linear-gradient(135deg,#7c3aed20,#ec489920)" : "var(--surface2)", border: "1.5px solid " + (f.hasBonus ? "#7c3aed" : "var(--border)"), borderRadius: 12, padding: "13px 16px", color: "var(--text)", fontSize: 13, textAlign: "left", cursor: "pointer", fontWeight: f.hasBonus ? 700 : 400 }}>
                    {f.hasBonus ? "✓ 상여금 있음" : "상여금 없음 (탭하여 변경)"}
                  </button>
                  {f.hasBonus && (
                    <input type="tel" inputMode="numeric" style={inputStyle} value={f.bonusAmount} onChange={e => updateField("bonusAmount", e.target.value)} placeholder="상여 금액 (원)" />
                  )}

                  {/* 기타수당 토글 */}
                  <button onClick={() => updateField("hasExtraWage", !f.hasExtraWage)}
                    style={{ background: f.hasExtraWage ? "linear-gradient(135deg,#7c3aed20,#ec489920)" : "var(--surface2)", border: "1.5px solid " + (f.hasExtraWage ? "#7c3aed" : "var(--border)"), borderRadius: 12, padding: "13px 16px", color: "var(--text)", fontSize: 13, textAlign: "left", cursor: "pointer", fontWeight: f.hasExtraWage ? 700 : 400 }}>
                    {f.hasExtraWage ? "✓ 약정수당 있음" : "약정수당 없음 (탭하여 변경)"}
                  </button>
                  {f.hasExtraWage && (
                    <input style={inputStyle} value={f.extraWageDetails} onChange={e => updateField("extraWageDetails", e.target.value)} placeholder="예) 식대 10만원" />
                  )}

                  {/* 지급일 버튼 */}
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>임금 지급일</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {["5일", "10일", "15일", "20일", "25일", "말일"].map(d => (
                        <button key={d} onClick={() => updateField("payDay", d.replace("일", ""))}
                          style={{
                            background: f.payDay === d.replace("일", "") || f.payDay === d ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "var(--surface2)",
                            border: "none", borderRadius: 20, padding: "9px 16px",
                            color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
                          }}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 지급방법 버튼 */}
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>지급방법</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[{ v: "계좌이체", label: "🏦 계좌이체" }, { v: "현금", label: "💵 현금" }].map(o => (
                        <button key={o.v} onClick={() => updateField("payMethod", o.v)}
                          style={{
                            flex: 1, background: f.payMethod === o.v ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "var(--surface2)",
                            border: "none", borderRadius: 12, padding: "13px 0",
                            color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
                          }}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 급여 자동계산 패널 */}
                  {payCalc && (
                    <div style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 16, padding: "16px" }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: "var(--purple-text)", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
                        🧮 예상 급여 자동계산
                        <span style={{ fontSize: 10, fontWeight: 400, color: "var(--text-muted)" }}>시급 {payCalc.hourlyRate.toLocaleString()}원 기준</span>
                      </p>
                      {isUnderMinWage(payCalc.hourlyRate, f.startDate) && (
                        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
                          <p style={{ fontSize: 12, color: "#f87171", fontWeight: 700, margin: 0 }}>
                            ⚠️ 최저임금 위반 — {getMinWageForDate(f.startDate).toLocaleString()}원 미만
                          </p>
                          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "3px 0 0" }}>근로기준법 제6조 위반 · 3년 이하 징역 또는 2천만원 이하 벌금</p>
                        </div>
                      )}

                      {/* 1일 근무 구조 */}
                      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)", color: "#4ade80", borderRadius: 20, padding: "3px 10px", fontWeight: 700 }}>
                          법정 {payCalc.regularH}h
                        </span>
                        {payCalc.overtimeH > 0 && (
                          <span style={{ fontSize: 11, background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.3)", color: "#fb923c", borderRadius: 20, padding: "3px 10px", fontWeight: 700 }}>
                            연장 {payCalc.overtimeH}h × 1.5배
                          </span>
                        )}
                        {payCalc.nightH > 0 && (
                          <span style={{ fontSize: 11, background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.3)", color: "#a78bfa", borderRadius: 20, padding: "3px 10px", fontWeight: 700 }}>
                            야간 {payCalc.nightH.toFixed(1)}h +0.5배
                          </span>
                        )}
                        {payCalc.juhyu && (
                          <span style={{ fontSize: 11, background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)", color: "#fbbf24", borderRadius: 20, padding: "3px 10px", fontWeight: 700 }}>
                            주휴수당 발생
                          </span>
                        )}
                      </div>

                      {/* 주 단위 경고 */}
                      {payCalc.weekOvertimeWarn && (
                        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
                          <p style={{ fontSize: 12, color: "#f87171", fontWeight: 700, margin: 0 }}>
                            ⚠️ 주 연장근로 {payCalc.weekOvertime}h — 법정 한도(12h) 초과
                          </p>
                          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "3px 0 0" }}>근로기준법 제53조 위반. 근무일수 또는 근무시간 조정 필요</p>
                        </div>
                      )}

                      {/* 월 급여 내역 */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {[
                          { label: "기본급 (법정근로)", amount: payCalc.monthRegular, color: "var(--text)" },
                          payCalc.monthOvertime > 0 && { label: "연장근로수당 (×1.5)", amount: payCalc.monthOvertime, color: "#fb923c" },
                          payCalc.monthNight > 0 && { label: "야간근로 가산 (+0.5)", amount: payCalc.monthNight, color: "#a78bfa" },
                          payCalc.monthJuhyu > 0 && { label: "주휴수당", amount: payCalc.monthJuhyu, color: "#fbbf24" },
                        ].filter(Boolean).map((row: any) => (
                          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{row.label}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: row.color }}>{row.amount.toLocaleString()}원</span>
                          </div>
                        ))}
                        <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 800 }}>월 예상 합계</span>
                          <span style={{ fontSize: 16, fontWeight: 900, color: "var(--purple-text)" }}>{payCalc.monthTotal.toLocaleString()}원</span>
                        </div>
                        <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "2px 0 0" }}>* 4대보험 공제 전 금액 · 월 4.345주 기준</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 스텝 4: 사회보험 및 서명 */}
              {wizardStep === 4 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 8 }}>사회보험 적용 여부 (해당하는 항목 선택)</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {[
                        { key: "insEmp", label: "고용보험", icon: "💼" },
                        { key: "insAcc", label: "산재보험", icon: "🏥" },
                        { key: "insPension", label: "국민연금", icon: "🏦" },
                        { key: "insHealth", label: "건강보험", icon: "❤️" },
                      ].map(ins => {
                        const on = (f as any)[ins.key];
                        return (
                          <button key={ins.key} onClick={() => updateField(ins.key, !on)}
                            style={{
                              background: on ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "var(--surface2)",
                              border: "2px solid " + (on ? "#7c3aed" : "var(--border)"),
                              borderRadius: 14, padding: "16px 8px",
                              color: on ? "#fff" : "var(--text)", fontSize: 13, fontWeight: 700, cursor: "pointer",
                              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                            }}>
                            <span style={{ fontSize: 22 }}>{ins.icon}</span>
                            <span>{ins.label}</span>
                            <span style={{ fontSize: 10, opacity: 0.8 }}>{on ? "적용" : "미적용"}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 첨부 서류 수령 확인 */}
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 8 }}>
                      첨부 서류 수령 확인 <span style={{ fontWeight: 400 }}>(오프라인 수령 후 체크)</span>
                    </label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {[
                        { key: "docHealthCert", label: "🏥 보건증", desc: "식품위생법 대상 업종 필수 · 유효기간 1년", required: true },
                        { key: "docIdCard", label: "🪪 신분증 사본", desc: "주민등록증 또는 운전면허증", required: true },
                        { key: "docBankbook", label: "🏦 통장 사본", desc: "급여 이체용 · 본인 명의", required: true },
                        { key: "docParentConsent", label: "📝 친권자 동의서", desc: "만 18세 미만 근로자 필수", required: ct === "minor" },
                      ].map(doc => {
                        const on = (f as any)[doc.key];
                        return (
                          <button key={doc.key} onClick={() => updateField(doc.key, !on)}
                            style={{
                              background: on ? "rgba(74,222,128,0.08)" : "var(--surface2)",
                              border: `1px solid ${on ? "rgba(74,222,128,0.4)" : doc.required ? "rgba(251,146,60,0.3)" : "var(--border)"}`,
                              borderRadius: 12, padding: "10px 14px", cursor: "pointer",
                              display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                            }}>
                            <span style={{ fontSize: 18, flexShrink: 0 }}>{on ? "✅" : "⬜"}</span>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: on ? "#4ade80" : "var(--text)" }}>
                                {doc.label}
                                {doc.required && !on && <span style={{ fontSize: 10, color: "#fb923c", marginLeft: 6, fontWeight: 400 }}>필수</span>}
                              </p>
                              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 0" }}>{doc.desc}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "8px 0 0", lineHeight: 1.5 }}>
                      * 개인정보 보호를 위해 서류 원본은 사업장에서 안전하게 보관하세요.<br/>
                      * 보건증은 만료 전 재발급 필요 (유효기간 1년)
                    </p>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>계약 체결일</label>
                    <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "13px 16px", fontSize: 13, color: "var(--text)" }}>
                      {f.contractDate || "오늘 날짜 자동 입력"}
                    </div>
                  </div>

                  {ct === "minor" && (
                    <div style={{ background: "rgba(251,191,36,0.06)", border: "1px dashed rgba(251,191,36,0.3)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", margin: 0 }}>👨‍👩‍👦 친권자 동의 정보</p>
                      <input style={inputStyle} value={f.parentName} onChange={e => updateField("parentName", e.target.value)} placeholder="동의자 성명" />
                      <input type="date" style={inputStyle} value={f.parentBirth} onChange={e => updateField("parentBirth", e.target.value)} />
                      <input style={inputStyle} value={f.parentAddr} onChange={e => updateField("parentAddr", e.target.value)} placeholder="동의자 주소" />
                      <input type="tel" inputMode="tel" style={inputStyle} value={f.parentTel} onChange={e => updateField("parentTel", formatPhone(e.target.value))} placeholder="동의자 연락처" />
                    </div>
                  )}
                </div>
              )}

              {/* 이전 / 다음 네비게이션 */}
              <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                {wizardStep > 0 && (
                  <button onClick={() => setWizardStep(s => s - 1)}
                    style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", fontWeight: 600, padding: "13px", borderRadius: 14, fontSize: 13, cursor: "pointer" }}>
                    ← 이전
                  </button>
                )}
                {wizardStep < 4 ? (
                  <button onClick={() => setWizardStep(s => s + 1)}
                    style={{ flex: 2, background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", border: "none", color: "#fff", fontWeight: 700, padding: "13px", borderRadius: 14, fontSize: 13, cursor: "pointer" }}>
                    다음 →
                  </button>
                ) : (
                  <button onClick={saveContract} disabled={saving}
                    style={{ flex: 2, background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", color: "#fff", fontWeight: 700, padding: "13px", borderRadius: 14, fontSize: 13, cursor: "pointer" }}>
                    {saving ? "저장 중..." : "💾 계약서 저장"}
                  </button>
                )}
              </div>

            </div>
          </div>

          {/* 📄 인쇄/미리보기 영역 */}
          <div className="preview-section">
            <span style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 6, paddingLeft: 4 }}>
              📄 공식 표준 계약서 미리보기 (실시간 반영)
            </span>
            <div id="contract-print" style={{
              background: "#fff",
              borderRadius: 16,
              padding: "24px 20px",
              border: "1px solid #ccc",
              overflowX: "auto",
              minWidth: "320px",
              WebkitOverflowScrolling: "touch"
            }}>
              <ContractBody />
              <p style={{ fontSize: "7.5pt", color: "#bbb", textAlign: "center", marginTop: 16, borderTop: "1px solid #eee", paddingTop: 8 }}>
                ※ 본 계약서는 파잡(PAZAB) AI 매칭 플랫폼을 통해 작성되었습니다.
              </p>
            </div>
          </div>

          {/* 공식 양식 숨김 렌더 (인쇄/PDF 생성용) */}
          <div id="official-form-render" style={{ position: "absolute", left: "-9999px", top: 0, zIndex: -1, background: "#fff" }}>
            <ContractOfficialForm data={f} contractType={ct} />
          </div>

          {/* 하단 플로팅 액션 바 */}
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "10px 16px 14px", background: "rgba(24,24,27,0.97)", backdropFilter: "blur(12px)", borderTop: "1px solid var(--border)", maxWidth: 1200, margin: "0 auto", zIndex: 10 }}>
            <div style={{ display: "flex", gap: 6, maxWidth: 480, margin: "0 auto" }}>
              <button onClick={print}
                style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", fontWeight: 600, padding: "12px 10px", borderRadius: 12, fontSize: 12, cursor: "pointer" }}>
                📄 화면인쇄
              </button>
              <button onClick={downloadPDF} disabled={saving}
                style={{ flex: 2, background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", color: "#fff", fontWeight: 700, padding: "12px 10px", borderRadius: 12, fontSize: 12, cursor: "pointer" }}>
                📥 공식 양식 PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function ContractPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "var(--text-muted)" }}>로딩 중...</p></div>}>
      <ContractContent />
    </Suspense>
  );
}
