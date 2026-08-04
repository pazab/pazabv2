"use client";
import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/lib/useToast";
import { getMinWageForDate, isUnderMinWage } from "@/lib/minWage";
import { supabase } from "@/lib/supabase";
import ContractOfficialForm, { getOfficialFormHTML } from "@/components/ContractOfficialForm";
import { sendPushNotification } from "@/lib/usePush";
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
    gap: 16px;
    padding: 16px 16px 100px;
    width: 100%;
    max-width: 680px;
    margin: 0 auto;
    box-sizing: border-box;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .animate-spin {
    animation: spin 1s linear infinite;
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
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showResignModal, setShowResignModal] = useState(false);
  const [existingContract, setExistingContract] = useState<any>(null);
  const [myEps, setMyEps] = useState<any[]>([]);
  const [selEp, setSelEp] = useState<any>(null);
  const [myUserId, setMyUserId] = useState<string>("");
  const [jobDuties, setJobDuties] = useState<{ name: string; parentName: string }[]>([]);
  const [prevContractData, setPrevContractData] = useState<any>(null);
  const [showDocZoomModal, setShowDocZoomModal] = useState(false);
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false);


  // 스텝 위자드 상태 (0=사업체, 1=근로자, 2=근무, 3=임금, 4=보험/서명)
  const [wizardStep, setWizardStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [triedNext, setTriedNext] = useState(false);

  const [f, setF] = useState({
    biz: "", bizRegNo: "", ceo: "", ceoPhone: "",
    bizAddr: "", bizAddrDetail: "", samePlace: true, workPlace: "",
    bizType: "", jobDesc: "",
    worker: "", workerBirth: "", workerPhone: "", workerAddr: "", workerAddrDetail: "",
    contractType: "fixed",
    startDate: "", endDate: "",
    workDaysMon: false, workDaysTue: false, workDaysWed: false,
    workDaysThu: false, workDaysFri: false, workDaysSat: false, workDaysSun: false,
    workDaysMode: "check", workDaysText: "", perDayHours: false,
    workStart: "09:00", workEnd: "18:00", breakTime: "30", noBreak: false,
    workStartMon: "09:00", workEndMon: "18:00", breakTimeMon: "30",
    workStartTue: "09:00", workEndTue: "18:00", breakTimeTue: "30",
    workStartWed: "09:00", workEndWed: "18:00", breakTimeWed: "30",
    workStartThu: "09:00", workEndThu: "18:00", breakTimeThu: "30",
    workStartFri: "09:00", workEndFri: "18:00", breakTimeFri: "30",
    workStartSat: "09:00", workEndSat: "18:00", breakTimeSat: "30",
    workStartSun: "09:00", workEndSun: "18:00", breakTimeSun: "30",
    weeklyHours: "40", dailyHours: "8",
    wage: "", payDay: "말일", payMethod: "계좌이체", bankAccount: "",
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
    is5OrMore: true,
    wageIncludesWeeklyPay: false,
  });

  const errStyle = (empty: boolean) => empty && triedNext
    ? { ...inputStyle, border: "1.5px solid #ef4444" }
    : inputStyle;

  const calcAge = (birthStr: string): number | null => {
    // "YYYY. MM. DD." 또는 "YYYY-MM-DD" 형식 모두 처리
    const cleaned = birthStr.replace(/\.\s*/g, "-").replace(/-+$/, "");
    const d = new Date(cleaned);
    if (isNaN(d.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
    return age;
  };


  const updateField = (k: string, v: any) => {
    setF((p) => {
      const next = { ...p, [k]: v };
      if (k === "breakStart" || k === "breakEnd") {
        const calcDiff = (start: string, end: string): string => {
          if (!start || !end) return "0";
          const [sH, sM] = start.split(":").map(Number);
          const [eH, eM] = end.split(":").map(Number);
          if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return "0";
          let diff = (eH * 60 + eM) - (sH * 60 + sM);
          if (diff < 0) diff += 24 * 60;
          return String(diff);
        };
        next.breakTime = calcDiff(next.breakStart, next.breakEnd);
      }
      if (
        k === "workStart" || k === "workEnd" ||
        k === "breakStart" || k === "breakEnd" ||
        k === "breakTime" || k === "noBreak"
      ) {
        const getMinutes = (start: string, end: string): number => {
          if (!start || !end) return 0;
          const [sH, sM] = start.split(":").map(Number);
          const [eH, eM] = end.split(":").map(Number);
          if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return 0;
          let diff = (eH * 60 + eM) - (sH * 60 + sM);
          if (diff < 0) diff += 24 * 60;
          return diff;
        };
        const workMin = getMinutes(next.workStart, next.workEnd);
        const breakMin = next.noBreak ? 0 : parseInt(next.breakTime || "0", 10) || 0;
        let daily = (workMin - breakMin) / 60;
        if (daily < 0) daily = 0;
        daily = Math.round(daily * 10) / 10;
        next.dailyHours = String(daily);
        
        const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
        const DAYKEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const selectedDays = DAYS.filter((_, i) => (p as any)[`workDays${DAYKEYS[i]}`]);
        const workDayCount = selectedDays.length || 5;
        const weekly = Math.round(daily * workDayCount * 10) / 10;
        next.weeklyHours = String(weekly);
      }
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
    // 생년월일 입력 시 미성년 자동 감지 → 계약서 종류 자동 전환
    if (k === "workerBirth") {
      const age = calcAge(v);
      if (age !== null && age < 18) {
        setCt("minor");
      } else if (age !== null && age >= 18) {
        // 성인으로 확인되면 minor에서 해제 (기본값 단시간으로)
        setCt(prev => prev === "minor" ? "parttime" : prev);
      }
    }
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

    // 주휴수당 (주 15시간 이상 시 발생, 단 시급에 이미 포함해서 책정한 경우는 별도 가산 제외)
    const weekTotal = dailyH * weekDays;
    const juhyuEligible = weekTotal >= 15 && !f.wageIncludesWeeklyPay;
    const juhyu = juhyuEligible ? Math.round((weekTotal / 40) * 8 * hourlyRate) : 0;

    // 가산수당(연장 1.5배·야간 0.5배 가산분)은 상시근로자 5인 이상 사업장에만 법적 의무 발생.
    // 5인 미만이면 가산 없이 통상시급만 지급하면 됨(연장·야간 시간 자체는 monthRegular에 이미 포함).
    const premiumMultiplierOvertime = f.is5OrMore ? 1.5 : 1;
    const premiumMultiplierNight = f.is5OrMore ? 0.5 : 0;

    // 월 환산 (4.345주)
    const monthRegular = Math.round(weekRegular * 4.345 * hourlyRate);
    const monthOvertime = Math.round(weekOvertime * 4.345 * hourlyRate * premiumMultiplierOvertime);
    const monthNight = Math.round(weekNight * 4.345 * hourlyRate * premiumMultiplierNight); // 야간 가산분만
    const monthJuhyu = Math.round(juhyu * 4.345);
    const monthTotal = monthRegular + monthOvertime + monthNight + monthJuhyu;

    return {
      hourlyRate: Math.round(hourlyRate),
      regularH, overtimeH, nightH,
      weekRegular, weekOvertime, weekTotal, weekOvertimeWarn,
      juhyu: juhyuEligible,
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

  useEffect(() => {
    loadJobDuties(f.bizType);
  }, [f.bizType]);

  const loadJobDuties = async (bizType: string) => {
    const { data } = await supabase.from("job_categories").select("id, name, parent_id").order("sort_order");
    if (!data) return;
    const parents = (data as { id: string; name: string; parent_id: string | null }[]).filter(c => !c.parent_id);
    const children = (data as { id: string; name: string; parent_id: string | null }[]).filter(c => c.parent_id);
    const withParent = children.map(c => ({
      name: c.name,
      parentName: parents.find(p => p.id === c.parent_id)?.name ?? "",
    }));
    if (bizType) {
      // 부분 매칭: "카페" ↔ "카페/디저트" 등도 처리
      const filtered = withParent.filter(d =>
        d.parentName === bizType ||
        d.parentName.includes(bizType) ||
        bizType.includes(d.parentName)
      );
      setJobDuties(filtered.length > 0 ? filtered : withParent.filter(d =>
        ["카페", "음식점", "편의점", "패스트푸드"].some(g => d.parentName.includes(g))
      ));
    } else {
      setJobDuties(withParent);
    }
  };

  const fetchPrevContract = async (employerId: string, employerProfileId?: string) => {
    if (!employerId) return;
    let q = supabase.from("contracts")
      .select("contract_data")
      .eq("employer_id", employerId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1);
    if (employerProfileId) {
      q = q.eq("employer_profile_id", employerProfileId);
    }
    const { data } = await q.maybeSingle();
    if (data?.contract_data) {
      setPrevContractData(data.contract_data);
    } else {
      setPrevContractData(null);
    }
  };

  const applyPrevContract = () => {
    if (!prevContractData) return;
    const keptFields = {
      // 근로자 정보 (현재 선택된 근로자 유지)
      worker: f.worker,
      workerBirth: f.workerBirth,
      workerPhone: f.workerPhone,
      workerAddr: f.workerAddr,
      workerAddrDetail: f.workerAddrDetail,
      startDate: f.startDate,
      endDate: f.endDate,
      contractDate: f.contractDate,
      school: f.school,
      grade: f.grade,
      parentName: f.parentName,
      parentRel: f.parentRel,
      parentBirth: f.parentBirth,
      parentAddr: f.parentAddr,
      parentTel: f.parentTel,
      // 사업체 정보 (initF에서 selEp 기준으로 이미 채워짐, 덮어쓰기 방지)
      biz: f.biz,
      bizRegNo: f.bizRegNo,
      ceo: f.ceo,
      ceoPhone: f.ceoPhone,
      bizAddr: f.bizAddr,
      bizAddrDetail: f.bizAddrDetail,
      bizType: f.bizType,
      samePlace: f.samePlace,
      workPlace: f.workPlace,
    };
    setF(prev => ({
      ...prev,
      ...prevContractData,
      ...keptFields
    }));
    if (prevContractData.contractType) {
      setCt(prevContractData.contractType);
    }
    showToast("이전 계약서 설정을 불러왔습니다! 근로자 정보와 날짜는 그대로 유지됩니다.");
  };

  const loadInit = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    let capturedEps: any[] = [];
    if (user) {
      setMyUserId(user.id);
      await fetchPrevContract(user.id);
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
          .select("id, biz_reg_number, ceo_name, address, address_detail, biz_tel, is_5_or_more_employees")
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
        capturedEps = finalEps;
        setMyEps(finalEps);
        setSelEp(finalEps[0]);
        applyEpToForm(finalEps[0], user.id, null);
      }
    }
    if (memberId) await loadByMember(capturedEps);
    else if (matchId) await load(capturedEps);
    else setLoading(false);
  };

  const load = async (availableEps: any[] = []) => {
    const { data: cur } = await supabase.from("matches")
      .select("employer_id, worker_id, job_id").eq("id", matchId).single();
    if (!cur) {
      setLoading(false);
      return;
    }

    const { data: all } = await supabase.from("matches")
      .select("id, employer_id, worker_id, employer_profile_id, job_id, created_at, matched_at")
      .eq("employer_id", cur.employer_id).eq("worker_id", cur.worker_id)
      .eq("progress_status", "hired").order("created_at", { ascending: false });

    const enriched = await Promise.all((all || []).map(async (m: any, i: number) => {
      // 매장 정보는 항상 availableEps(=상단 매장칩 목록)에서 동일한 항목을 찾아 쓴다.
      // (매장칩/폼이 서로 다른 매장을 가리키는 불일치 방지 — loadByMember와 동일한 이유)
      const resolvedEp = (m.employer_profile_id && availableEps.find((e: any) => e.id === m.employer_profile_id))
        || availableEps[0]
        || null;
      let ep: any = resolvedEp ? { ...resolvedEp } : null;
      if (ep?.id) {
        // job_id 있으면 해당 공고 조건 우선 사용, 없으면 최신 공고로 폴백
        if (m.job_id) {
          const { data: specificJob } = await supabase.from("jobs").select("wage, work_days, work_hours")
            .eq("id", m.job_id).maybeSingle();
          if (specificJob) ep = { ...ep, ...specificJob };
        } else {
          const { data: job } = await supabase.from("jobs").select("wage, work_days, work_hours")
            .eq("employer_profile_id", ep.id)
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (job) ep = { ...ep, ...job };
        }
      }
      return { ...m, ep, employer_profile_id: ep?.id || m.employer_profile_id, idx: (all?.length || 0) - i };
    }));
    setMatches(enriched);

    const [eu, wu] = await Promise.all([
      supabase.from("users").select("nickname, real_name, birth_date, phone, address, address_detail").eq("id", cur.employer_id).single(),
      supabase.from("users").select("nickname, real_name, birth_date, phone, address, address_detail").eq("id", cur.worker_id).single(),
    ]);

    const cur2 = enriched.find(m => m.id === matchId) || enriched[0];
    if (cur2) {
      initF(cur2, eu.data, wu.data);
      await fetchPrevContract(cur.employer_id, cur2.employer_profile_id);
      // 폼에 쓴 것과 동일한 ep로 매장칩도 맞춘다
      if (cur2.ep?.id) setSelEp(cur2.ep);
    }

    if (mode === "update" && matchId) {
      const { data: existing } = await supabase.from("contracts")
        .select("*").eq("match_id", matchId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      let epData: any = null;
      if (existing?.employer_profile_id) {
        const { data } = await supabase.from("employer_profiles")
          .select("region, address, address_detail")
          .eq("id", existing.employer_profile_id).maybeSingle();
        epData = data;
      }

      if (existing?.contract_data) {
        const mergedData = {
          ...existing.contract_data,
          bizAddr: existing.contract_data.bizAddr || epData?.region || epData?.address || "",
          bizAddrDetail: existing.contract_data.bizAddrDetail || epData?.address_detail || "",
          worker: existing.contract_data.worker || wu.data?.real_name || wu.data?.nickname || "",
          workerBirth: existing.contract_data.workerBirth || (wu.data?.birth_date ? wu.data.birth_date.replace(/-/g, ". ") : ""),
          workerPhone: existing.contract_data.workerPhone || wu.data?.phone || "",
          workerAddr: existing.contract_data.workerAddr || wu.data?.address || "",
          workerAddrDetail: existing.contract_data.workerAddrDetail || wu.data?.address_detail || "",
        };
        setF(mergedData);
        setCt(mergedData.contractType || "parttime");
        setExistingContract(existing);
        setStep("edit");
      }
    }

    setLoading(false);
  };

  const loadByMember = async (availableEps: any[] = []) => {
    const { data: tm } = await supabase
      .from("team_members")
      .select("id, match_id, employer_id, worker_id, employer_profile_id, wage, work_days, work_hours, member_role, status, hire_date")
      .eq("id", memberId)
      .single();
    if (!tm) { showToast("⚠️ 팀원 정보를 불러올 수 없어요.", "error"); setLoading(false); return; }

    const [eu, wu] = await Promise.all([
      supabase.from("users").select("nickname, real_name, birth_date, phone, address, address_detail").eq("id", tm.employer_id).single(),
      supabase.from("users").select("nickname, real_name, birth_date, phone, address, address_detail").eq("id", tm.worker_id).single(),
    ]);

    // 매장 정보는 항상 availableEps(=상단 매장칩 목록)에서 동일한 항목을 찾아 쓴다.
    // 예전에는 이 값을 employer_profiles에 별도 쿼리로 다시 조회했는데, "가장 최근 매장"
    // 폴백 정렬이 매장칩 목록의 순서와 미묘하게 어긋나는 경우 폼(주소·사업자번호 등)과
    // 매장칩이 서로 다른 매장을 가리키는 불일치가 생겼다. 같은 배열에서 찾으면 항상 일치한다.
    const resolvedEp = (tm.employer_profile_id && availableEps.find((e: any) => e.id === tm.employer_profile_id))
      || availableEps[0]
      || null;

    let ep: any = resolvedEp ? { ...resolvedEp } : null;
    if (ep?.id) {
      const { data: job } = await supabase.from("jobs").select("wage, work_days, work_hours")
        .eq("employer_profile_id", ep.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (job) ep = { ...ep, ...job };
    }

    // team_members 근무조건이 있으면 공고 데이터보다 우선 적용
    if (tm.wage) ep = { ...ep, wage: tm.wage };
    if (tm.work_days) ep = { ...ep, work_days: tm.work_days };
    // work_hours가 "HH:mm ~ HH:mm" 형식일 때만 반영 (숫자 dailyHours는 initF에서 파싱 안 됨)
    if (tm.work_hours && tm.work_hours.includes("~")) ep = { ...ep, work_hours: tm.work_hours };

    const resolvedEmployerProfileId = ep?.id || tm.employer_profile_id;
    const memberAsMatch = {
      id: tm.id,
      employer_id: tm.employer_id,
      worker_id: tm.worker_id,
      employer_profile_id: resolvedEmployerProfileId,
      ep,
      matched_at: tm.hire_date || null,   // 입사일을 계약 시작일 기본값으로
      created_at: new Date().toISOString(),
      _isMember: true,
    };

    setMatches([memberAsMatch]);
    initF(memberAsMatch, eu.data, wu.data);
    await fetchPrevContract(tm.employer_id, resolvedEmployerProfileId);

    // 폼에 쓴 것과 동일한 ep로 매장칩도 맞춘다 (폼/칩이 서로 다른 매장을 가리키지 않도록)
    if (ep?.id) setSelEp(ep);

    if (mode === "update") {
      const { data: existing } = await supabase.from("contracts")
        .select("*").eq("team_member_id", memberId)
        .neq("status", "superseded")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      let epData: any = null;
      if (existing?.employer_profile_id) {
        const { data } = await supabase.from("employer_profiles")
          .select("region, address, address_detail")
          .eq("id", existing.employer_profile_id).maybeSingle();
        epData = data;
      }

      if (existing?.contract_data) {
        const mergedData = {
          ...existing.contract_data,
          bizAddr: existing.contract_data.bizAddr || epData?.region || epData?.address || "",
          bizAddrDetail: existing.contract_data.bizAddrDetail || epData?.address_detail || "",
          worker: existing.contract_data.worker || wu.data?.real_name || wu.data?.nickname || "",
          workerBirth: existing.contract_data.workerBirth || (wu.data?.birth_date ? wu.data.birth_date.replace(/-/g, ". ") : ""),
          workerPhone: existing.contract_data.workerPhone || wu.data?.phone || "",
          workerAddr: existing.contract_data.workerAddr || wu.data?.address || "",
          workerAddrDetail: existing.contract_data.workerAddrDetail || wu.data?.address_detail || "",
        };
        setF(mergedData);
        setCt(mergedData.contractType || "parttime");
        setExistingContract(existing);
        setStep("edit");
      }
    }

    setLoading(false);
  };

  const handleSelectMatch = async (m: any) => {
    setLoading(true);
    setSelMatch(m);
    const [euRes, wuRes] = await Promise.all([
      supabase.from("users").select("nickname, real_name, birth_date, phone, address, address_detail").eq("id", m.employer_id).single(),
      supabase.from("users").select("nickname, real_name, birth_date, phone, address, address_detail").eq("id", m.worker_id).single(),
    ]);
    // 매장 정보는 항상 myEps(=상단 매장칩 목록)에서 동일한 항목을 찾아 쓴다 (칩/폼 불일치 방지)
    let epData = m.employer_profile_id ? myEps.find((e: any) => e.id === m.employer_profile_id) : null;
    if (!epData && m.employer_profile_id) {
      const { data } = await supabase.from("employer_profiles")
        .select("id, business_name, business_type, region, address, address_detail, biz_reg_number, ceo_name, biz_tel, is_5_or_more_employees")
        .eq("id", m.employer_profile_id).maybeSingle();
      epData = data;
    }
    const updatedMatch = { ...m, ep: epData, employer_profile_id: epData?.id || m.employer_profile_id };
    setSelMatch(updatedMatch);
    initF(updatedMatch, euRes.data, wuRes.data);
    await fetchPrevContract(m.employer_id, updatedMatch.employer_profile_id);
    if (epData?.id) setSelEp(epData);

    const { data: existing } = await supabase.from("contracts")
      .select("*").eq("match_id", m.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing?.contract_data) {
      const mergedData = {
        ...existing.contract_data,
        bizAddr: existing.contract_data.bizAddr || epData?.region || epData?.address || "",
        bizAddrDetail: existing.contract_data.bizAddrDetail || epData?.address_detail || "",
        worker: existing.contract_data.worker || wuRes.data?.real_name || wuRes.data?.nickname || "",
        workerBirth: existing.contract_data.workerBirth || (wuRes.data?.birth_date ? wuRes.data.birth_date.replace(/-/g, ". ") : ""),
        workerPhone: existing.contract_data.workerPhone || wuRes.data?.phone || "",
        workerAddr: existing.contract_data.workerAddr || wuRes.data?.address || "",
        workerAddrDetail: existing.contract_data.workerAddrDetail || wuRes.data?.address_detail || "",
      };
      setF(mergedData);
      setCt(mergedData.contractType || "parttime");
      setExistingContract(existing);
      setStep("edit");
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
      bizAddr: ep?.region || ep?.address || "",
      bizAddrDetail: ep?.address_detail || "",
      samePlace: true,
      workPlace: ep?.region || ep?.address || "",
      bizType: ep?.business_type || "",
      jobDesc: ep?.business_type ? `${ep.business_type} 관련 업무` : "",
      worker: wu?.real_name || wu?.nickname || "",
      workerBirth: wu?.birth_date ? wu.birth_date.replace(/-/g, ". ") : "",
      workerPhone: wu?.phone || "",
      workerAddr: wu?.address || "",
      workerAddrDetail: wu?.address_detail || "",
      startDate: `${md.getFullYear()}. ${String(md.getMonth() + 1).padStart(2, "0")}. ${String(md.getDate()).padStart(2, "0")}.`,
      ...dayFlags,
      ...dayHours,
      workStart: ws || "09:00", workEnd: we || "18:00",
      dailyHours: ws && we ? String(Math.round((parseInt(we) - parseInt(ws)) * 10) / 10) : "8",
      wage: ep?.wage ? Number(ep.wage).toLocaleString() : "",
      weeklyHoliday: defaultHoliday,
      is5OrMore: ep?.is_5_or_more_employees !== false,
      contractDate: `${today.getFullYear()}년  ${String(today.getMonth() + 1).padStart(2, "0")}월  ${String(today.getDate()).padStart(2, "0")}일`,
    }));
  };

  const buildFullAddr = (ep: any) => {
    if (ep?.address) return ep.address;
    const parts = [ep?.sido, ep?.sigungu, ep?.eupmyeondong].filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
    return ep?.region || "";
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
      workerAddr: p.workerAddr,
      workerAddrDetail: p.workerAddrDetail,
      is5OrMore: ep?.is_5_or_more_employees !== false,
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

  const validateStep = (step: number): string | null => {
    switch (step) {
      case 0: // 사업체
        if (!f.biz.trim()) return "사업체명을 입력해주세요.";
        if (!f.ceo.trim()) return "대표자 성명을 입력해주세요.";
        if (!f.bizAddr.trim()) return "사업장 주소를 입력해주세요.";
        if (!f.ceoPhone.trim()) return "대표자 연락처를 입력해주세요.";
        return null;
      case 1: // 근로자
        // 생년월일·연락처·주소는 사장님이 모를 수 있어 여기선 선택 입력 — 비워두면
        // 알바생이 계약서 동의(서명) 시 본인이 직접 입력한다 (app/chat/[id]/page.tsx 참고)
        if (!f.worker.trim()) return "근로자 성명을 입력해주세요.";
        if (f.workerPhone.trim()) {
          const workerPhoneRegex = /^01[016789]-\d{3,4}-\d{4}$/;
          if (!workerPhoneRegex.test(f.workerPhone.trim())) {
            return "근로자 연락처를 올바른 휴대폰 번호 형식(010-XXXX-XXXX)으로 입력해주세요.";
          }
        }
        return null;
      case 2: // 근무
        if (!f.startDate.trim()) return "계약 시작일을 입력해주세요.";
        if (!f.jobDesc.trim()) return "담당업무를 입력해주세요.";
        if (f.workDaysMode === "check" && selectedDays.length === 0) return "근무 요일을 선택해주세요.";
        if (!f.workStart || !f.workEnd) return "출퇴근 시각을 입력해주세요.";
        if (ct === "minor") {
          const dailyH2 = parseFloat(String(f.dailyHours || "0")) || 0;
          const weeklyH2 = parseFloat(String(f.weeklyHours || "0")) || 0;
          if (dailyH2 > 7) return "근로기준법상 만 18세 미만 근로자는 1일 7시간을 초과해 근무할 수 없어요.";
          if (weeklyH2 > 35) return "근로기준법상 만 18세 미만 근로자는 1주 35시간을 초과해 근무할 수 없어요.";
        }
        return null;
      case 3: { // 임금
        const wageLabel = f.wageType === "day" ? "일급" : f.wageType === "month" ? "월급" : "시급";
        if (!f.wage.trim()) return `${wageLabel}(임금)을 입력해주세요.`;
        if (!f.payDay.trim()) return "임금 지급일을 선택해주세요.";
        const wageNum3 = parseInt(f.wage.replace(/,/g, ""));
        const dailyH3 = parseFloat(String(f.dailyHours || "0")) || 0;
        const weekDays3 = selectedDays.length;
        const minWage3 = getMinWageForDate(f.startDate);
        let hourlyRate3 = wageNum3;
        if (f.wageType === "day" && dailyH3 > 0) hourlyRate3 = wageNum3 / dailyH3;
        else if (f.wageType === "month" && dailyH3 > 0 && weekDays3 > 0) hourlyRate3 = wageNum3 / ((dailyH3 * weekDays3) * 4.345);
        if (isNaN(hourlyRate3) || isUnderMinWage(hourlyRate3, f.startDate)) {
          return `${wageLabel}이 최저임금 기준(시급 ${minWage3.toLocaleString()}원)보다 낮아요.`;
        }
        return null;
      }
      default:
        return null;
    }
  };

  const validate = (): string | null => {
    for (let i = 0; i <= 3; i++) {
      const err = validateStep(i);
      if (err) return err;
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
    wage_type: f.wageType === "day" ? "daily" : f.wageType === "month" ? "monthly" : "hourly",
    work_days: workDaysStr,
    work_hours: f.dailyHours || null,
    contract_data: { ...f, contractType: ct },
    status: "pending",
    employer_signed: true,
    worker_signed: false,
    employer_signed_at: new Date().toISOString(),
    contract_type: ct,
    duties: f.jobDesc || null,
    workplace_address: f.bizAddr || null,
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
      // 1. 대표자 프로필 및 근로자 정보 users 테이블 동기화
      if (selMatch?.employer_id) {
        await supabase.from("users").update({ phone: f.ceoPhone }).eq("id", selMatch.employer_id);
      }
      if (selMatch?.worker_id && selMatch?.id && (f.worker || f.workerBirth || f.workerPhone || f.workerAddr)) {
        // users 테이블 RLS는 본인 행만 쓰기 허용이라 사장님 세션에서 알바생 행을
        // 직접 update하면 에러 없이 조용히 0건 처리됨 — 서버 라우트(서비스 롤) 경유
        await fetch("/api/contract/sync-worker-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamMemberId: selMatch.id,
            workerId: selMatch.worker_id,
            real_name: f.worker || null,
            birth_date: f.workerBirth ? f.workerBirth.replace(/\.\s*/g, "-").replace(/-$/, "").trim() : null,
            phone: f.workerPhone || null,
            address: f.workerAddr || null,
            address_detail: f.workerAddrDetail || null,
          }),
        });
      }
      if (selEp?.id) {
        await supabase.from("employer_profiles").update({
          biz_reg_number: f.bizRegNo, ceo_name: f.ceo,
          address: f.bizAddr, address_detail: f.bizAddrDetail, biz_tel: f.ceoPhone,
          is_5_or_more_employees: f.is5OrMore,
        }).eq("id", selEp.id);
      } else if (selMatch?.employer_id) {
        await supabase.from("employer_profiles").update({
          biz_reg_number: f.bizRegNo, ceo_name: f.ceo,
          address: f.bizAddr, address_detail: f.bizAddrDetail, biz_tel: f.ceoPhone,
          is_5_or_more_employees: f.is5OrMore,
        }).eq("user_id", selMatch.employer_id);
      }

      // 2. 최종 계약 정보를 team_members 테이블에 실시간 덮어쓰기 (동기화)
      if (selMatch.id) {
        await supabase.from("team_members").update({
          wage: payload.wage,
          work_days: payload.work_days,
          work_hours: payload.work_hours,
          contract_status: "pending",
        }).eq("id", selMatch.id);
      }

      // 3. 채팅방 알림 메시지 전송 및 채팅방 연동
      let sendMatchId = matchId || selMatch.match_id;
      if (!sendMatchId && selMatch.id) {
        const { data: tmRow } = await supabase.from("team_members")
          .select("match_id").eq("id", selMatch.id).maybeSingle();
        sendMatchId = tmRow?.match_id || null;
      }

      // 만약 채팅방(matches)이 연동되어 있지 않다면 accepted 상태로 신규 개설
      if (!sendMatchId && selMatch.employer_id && selMatch.worker_id) {
        const { data: newMatch, error: matchErr } = await supabase
          .from("matches")
          .insert({
            employer_id: selMatch.employer_id,
            worker_id: selMatch.worker_id,
            status: "accepted"
          })
          .select("id")
          .single();
        if (!matchErr && newMatch) {
          sendMatchId = newMatch.id;
          await supabase.from("team_members")
            .update({ match_id: sendMatchId })
            .eq("id", selMatch.id);
        }
      }

      if (sendMatchId) {
        // match가 pending 상태면 accepted로 올려야 채팅방에 표시됨
        await supabase.from("matches")
          .update({ status: "accepted" })
          .eq("id", sendMatchId)
          .eq("status", "pending");

        const { data: { user } } = await supabase.auth.getUser();
        if (user && selMatch.employer_id && selMatch.worker_id) {
          const receiverId = user.id === selMatch.employer_id ? selMatch.worker_id : selMatch.employer_id;
          try {
            const msg = saveMode === "new"
              ? "📄 근로계약서가 발행됐어요. 채팅방에서 확인 후 서명해주세요."
              : "📄 근로계약서가 수정됐어요. 다시 확인 후 서명해주세요.";
            await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ matchId: sendMatchId, senderId: user.id, receiverId, message: msg, messageType: "system" }),
            });
          } catch (msgErr) {
            console.error("채팅 API 오류:", msgErr);
          }
        }
      }

      // 4. 인앱 알림 & push 알림 전송
      if (selMatch?.worker_id) {
        const pushMsg = saveMode === "new"
          ? "📄 새 근로계약서가 발행됐어요. 확인 후 서명해주세요."
          : "📄 근로계약서가 수정됐어요. 다시 확인 후 서명해주세요.";

        // 인앱 알림 발송 (알림 배지 실시간 동기화)
        try {
          await fetch("/api/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: selMatch.worker_id,
              type: "contract",
              title: `📄 ${selEp?.business_name || "매장"}에서 근로계약서가 발행됐어요!`,
              body: pushMsg,
              data: { url: `/contract/view?memberId=${selMatch.id}` },
            }),
          });
        } catch (notifErr) {
          console.warn("인앱 알림 발송 실패:", notifErr);
        }

        // 모바일 브라우저 푸쉬 알림 발송
        sendPushNotification({
          userId: selMatch.worker_id,
          title: "근로계약서 서명 요청",
          body: pushMsg,
          url: `/contract/view?memberId=${selMatch.id}`,
          tag: "contract",
        });
      }

      showToast(saveMode === "overwrite"
        ? "✅ 계약서가 수정됐어요! 알바생 재동의 필요"
        : "✅ 새 계약서가 발행됐어요! 알바생 동의 대기중");

      setTimeout(() => {
        if (fromParam === "chat" && sendMatchId) {
          router.replace(`/chat/${sendMatchId}`);
        } else if (memberId) {
          router.replace(`/employer/team/${memberId}`);
        } else if (fromParam === "team") {
          router.back();
        } else {
          // from/memberId 없는 무컨텍스트 진입(예: Paz 버튼) — 저장 후 편집 폼에 그대로 남아
          // 뒤로가기 시 재진입하는 것을 막기 위해 항상 어딘가로 이동시킨다
          router.replace("/mypage");
        }
      }, 800);
    } else {
      showToast("저장 오류: " + error.message, "error");
    }
    setSaving(false);
  };

  const saveContract = async () => {
    if (!selMatch) {
      showToast("⚠️ 팀원 정보가 없어요. 페이지를 새로고침해주세요.", "error");
      return;
    }
    try {
      const { data: existing } = await supabase.from("contracts")
        .select("id, created_at, contract_data, worker_signed, status")
        .eq("team_member_id", selMatch.id)
        .neq("status", "superseded")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();

      if (existing) {
        if (existing.worker_signed) {
          setExistingContract(existing);
          setShowResignModal(true);
          return;
        } else {
          setExistingContract(existing);
          setShowSaveModal(true);
        }
      } else {
        setShowConfirmModal(true);
      }
    } catch (e) {
      showToast("⚠️ 계약서 확인 중 오류가 발생했어요.", "error");
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
      {showConfirmModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:300, display:"flex", alignItems:"flex-end", justifyContent:"center" }}
          onClick={() => setShowConfirmModal(false)}>
          <div style={{ background:"var(--surface)", borderRadius:"20px 20px 0 0", padding:"24px 20px 36px", width:"100%", maxWidth:480 }}
            onClick={e => e.stopPropagation()}>
            <p style={{ fontSize:15, fontWeight:700, color:"var(--text)", marginBottom:16 }}>📄 계약서 발행 전 확인</p>
            <div style={{ background:"var(--surface2)", borderRadius:12, padding:"14px 16px", marginBottom:20, display:"flex", flexDirection:"column", gap:8, fontSize:13 }}>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ color:"var(--text-muted)" }}>근로자</span>
                <span style={{ fontWeight:600, color:"var(--text)" }}>{f.worker || "-"}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ color:"var(--text-muted)" }}>계약 유형</span>
                <span style={{ fontWeight:600, color:"var(--text)" }}>
                  {ct==="parttime"?"단시간근로자":ct==="minor"?"연소근로자":ct==="standard_fixed"?"기간제":"무기계약"}
                </span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ color:"var(--text-muted)" }}>시급</span>
                <span style={{ fontWeight:700, color:"#a78bfa" }}>{f.wage ? Number(f.wage.replace(/,/g,"")).toLocaleString()+"원" : "-"}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ color:"var(--text-muted)" }}>근무 시작일</span>
                <span style={{ fontWeight:600, color:"var(--text)" }}>{f.startDate || "-"}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ color:"var(--text-muted)" }}>근무 요일</span>
                <span style={{ fontWeight:600, color:"var(--text)" }}>{workDaysStr || "-"}</span>
              </div>
            </div>
            <p style={{ fontSize:11, color:"var(--text-muted)", marginBottom:16, lineHeight:1.6 }}>
              발행 후 알바생에게 서명 요청이 전송돼요.<br/>내용이 맞는지 확인 후 발행해주세요.
            </p>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setShowConfirmModal(false)}
                style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:14, padding:14, color:"var(--text-muted)", fontSize:14, cursor:"pointer" }}>
                다시 확인
              </button>
              <button onClick={() => { setShowConfirmModal(false); doSave("new"); }}
                style={{ flex:2, background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", borderRadius:14, padding:14, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                📄 발행하기
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* 재계약 확인 모달 */}
      {showResignModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: "var(--surface)", borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480 }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>📄 재계약서 발행</p>
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: 14, marginBottom: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#f87171", margin: "0 0 6px" }}>⚠️ 주의사항</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.7 }}>
                · 이미 쌍방 서명 완료된 계약서가 있어요.<br />
                · 새 계약서는 기존 계약서를 대체해요.<br />
                · 기존 계약서는 이력으로 보존돼요.<br />
                · 알바생이 새 계약서에 다시 동의해야 법적 효력이 발생해요.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowResignModal(false)}
                style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 14, padding: 14, color: "var(--text)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                취소
              </button>
              <button onClick={() => { setShowResignModal(false); doSave("new"); }}
                style={{ flex: 2, background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", borderRadius: 14, padding: 14, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                재계약서 발행하기
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

          {/* 계약 대상 미리보기 (matchId/memberId 컨텍스트가 있을 때만) */}
          {selMatch && f.worker && (
            <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 14, padding: "14px 16px", marginBottom: 18 }}>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>계약 대상</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>👤 {f.worker}</span>
                {f.biz && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>🏢 {f.biz}</span>}
              </div>
              {(f.wage || selectedDays.length > 0) && (
                <div style={{ fontSize: 12, color: "#a78bfa" }}>
                  {f.wage && <span>시급 {f.wage}원</span>}
                  {f.wage && selectedDays.length > 0 && <span> · </span>}
                  {selectedDays.length > 0 && <span>{selectedDays.join("·")} 근무</span>}
                </div>
              )}
            </div>
          )}

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
          {(() => {
            const age = f.workerBirth ? calcAge(f.workerBirth) : null;
            if (age !== null && age < 18) return (
              <div style={{ background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.4)", borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#fb923c", margin: "0 0 2px" }}>👨‍👩‍👦 미성년자 ({age}세) — 연소근로자 계약서 필수</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>친권자 동의서가 포함된 계약서로 자동 선택됩니다.</p>
              </div>
            );
            return null;
          })()}
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
              <div key={m.id} onClick={() => handleSelectMatch(m)}
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

          {/* 📋 위자드 폼 */}
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

                  {prevContractData && (
                    <div style={{
                      background: "rgba(124, 58, 237, 0.08)",
                      border: "1px dashed rgba(124, 58, 237, 0.3)",
                      borderRadius: 14,
                      padding: "10px 12px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      margin: "4px 0 8px"
                    }}>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--purple-text)", margin: "0 0 2px" }}>📋 이전 계약서 템플릿 존재</p>
                        <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>직전에 작성한 계약조건을 그대로 가져옵니다.</p>
                      </div>
                      <button onClick={applyPrevContract}
                        style={{
                          background: "linear-gradient(135deg,#7c3aed,#ec4899)",
                          border: "none",
                          borderRadius: 20,
                          padding: "6px 12px",
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          whiteSpace: "nowrap"
                        }}>
                        불러오기
                      </button>
                    </div>
                  )}

                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)" }}>회사명/상호</label>
                    <input style={errStyle(!f.biz.trim())} value={f.biz} onChange={e => updateField("biz", e.target.value)} placeholder="예) 파스쿠찌 신창점" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)" }}>사업자등록번호</label>
                    <input style={inputStyle} value={f.bizRegNo} onChange={e => updateField("bizRegNo", formatBizNo(e.target.value))} placeholder="000-00-00000" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)" }}>대표자 성명</label>
                    <input style={errStyle(!f.ceo.trim())} value={f.ceo} onChange={e => updateField("ceo", e.target.value)} placeholder="성명 입력" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)" }}>대표 연락처</label>
                    <input style={inputStyle} value={f.ceoPhone} onChange={e => updateField("ceoPhone", formatPhone(e.target.value))} placeholder="010-0000-0000" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)" }}>사업장 소재지 주소</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input style={{ ...(triedNext && !f.bizAddr.trim() ? { ...inputStyle, border: "1.5px solid #ef4444" } : inputStyle), flex: 1 }} value={f.bizAddr} onChange={e => updateField("bizAddr", e.target.value)} placeholder="주소 입력" readOnly />
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
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>상시근로자 수</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[{ v: true, label: "5인 이상" }, { v: false, label: "5인 미만" }].map(o => (
                        <button key={String(o.v)} onClick={() => updateField("is5OrMore", o.v)}
                          style={{ flex: 1, background: f.is5OrMore === o.v ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "var(--surface2)", border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 0", lineHeight: 1.6 }}>
                      5인 미만 사업장은 연장·야간 가산수당(근로기준법 제56조) 적용 제외 대상이라 이 계약서·명세서의 가산수당 계산에 반영돼요. 이 매장의 다음 계약서에도 자동 적용됩니다.
                    </p>
                  </div>
                </div>
              )}

              {/* 스텝 1: 근로자 */}
              {wizardStep === 1 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>근로자 이름</label>
                    <input style={errStyle(!f.worker.trim())} value={f.worker} onChange={e => updateField("worker", e.target.value)} placeholder="근로자 이름" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                      * 생년월일 <span style={{ color: "#fb923c", fontWeight: 700, background: "rgba(251,146,60,0.12)", padding: "2px 8px", borderRadius: 6, marginLeft: 4 }}>* 선택 (비워두면 알바생 동의 시 직접 입력)</span>
                    </label>
                    <input type="date" style={inputStyle} value={toDateInput(f.workerBirth)} onChange={e => updateField("workerBirth", fromDateInput(e.target.value))} />
                    {(() => {
                      const age = f.workerBirth ? calcAge(f.workerBirth) : null;
                      if (age === null) return null;
                      if (age < 18) return (
                        <div style={{ marginTop: 8, background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.4)", borderRadius: 12, padding: "10px 14px" }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: "#fb923c", margin: "0 0 4px" }}>👨‍👩‍👦 미성년자 ({age}세) — 연소근로자 계약서 자동 선택</p>
                          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
                            근로기준법상 만 18세 미만 근로자는 <strong style={{ color: "#fb923c" }}>보호자(친권자/후견인) 동의서 작성이 법적 필수</strong>입니다.<br />
                            이에 따라 마지막 단계에서 보호자 동의 항목이 활성화되며, 계약서가 <strong style={{ color: "#fb923c" }}>연소근로자 표준근로계약서</strong>로 자동 전환되었습니다.
                          </p>
                        </div>
                      );
                      if (age < 20) return (
                        <div style={{ marginTop: 8, background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.3)", borderRadius: 12, padding: "8px 12px" }}>
                          <p style={{ fontSize: 11, color: "#fbbf24", margin: 0 }}>
                            ℹ️ 만 {age}세 — 성인이므로 친권자 동의 불필요합니다.
                          </p>
                        </div>
                      );
                      return null;
                    })()}
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                      * 연락처 <span style={{ color: "#fb923c", fontWeight: 700, background: "rgba(251,146,60,0.12)", padding: "2px 8px", borderRadius: 6, marginLeft: 4 }}>* 선택 (비워두면 알바생 동의 시 직접 입력)</span>
                    </label>
                    <input type="tel" style={inputStyle} value={f.workerPhone} onChange={e => updateField("workerPhone", formatPhone(e.target.value))} placeholder="010-0000-0000" inputMode="tel" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                      * 주소 (등본지 주소) <span style={{ color: "#fb923c", fontWeight: 700, background: "rgba(251,146,60,0.12)", padding: "2px 8px", borderRadius: 6, marginLeft: 4 }}>* 선택 (비워두면 알바생 동의 시 직접 입력)</span>
                    </label>
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
                    <input type="date" style={errStyle(!f.startDate.trim())} value={toDateInput(f.startDate)} onChange={e => updateField("startDate", fromDateInput(e.target.value))} />
                    <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "5px 0 0", lineHeight: 1.5 }}>
                      처음 입사일이 아닌 <strong>이 계약 조건이 적용되는 시작일</strong>을 입력하세요.<br />
                      재계약·임금 인상 시에는 갱신 날짜 기준으로 작성하세요.
                    </p>
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

                  {/* 담당업무 — job_categories 소분류 기반 */}
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>담당업무 <span style={{ fontWeight: 400 }}>(복수 선택 가능)</span></label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                      {(jobDuties.length > 0 ? jobDuties : [
                        { name: "홀서빙", parentName: "" }, { name: "주방보조", parentName: "" },
                        { name: "카운터", parentName: "" }, { name: "매장청소", parentName: "" },
                        { name: "배달", parentName: "" }, { name: "재고관리", parentName: "" },
                      ]).map(d => {
                        const parts = f.jobDesc ? f.jobDesc.split(", ").map((s: string) => s.trim()).filter(Boolean) : [];
                        const on = parts.includes(d.name);
                        return (
                          <button key={d.name} onClick={() => {
                            const next = on ? parts.filter((p: string) => p !== d.name) : [...parts, d.name];
                            updateField("jobDesc", next.join(", "));
                          }}
                            style={{
                              background: on ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "var(--surface2)",
                              border: `1px solid ${on ? "#7c3aed" : "var(--border)"}`,
                              borderRadius: 20, padding: "8px 14px",
                              color: on ? "#fff" : "var(--text)", fontSize: 12, fontWeight: 600, cursor: "pointer",
                            }}>
                            {d.name}
                          </button>
                        );
                      })}
                    </div>
                    <input style={errStyle(!f.jobDesc.trim())} value={f.jobDesc} onChange={e => updateField("jobDesc", e.target.value)} placeholder="직접 입력 또는 위에서 선택" />
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

                  {ct === "minor" && f.workStart && f.workEnd && (() => {
                    const [sh, sm] = f.workStart.split(":").map(Number);
                    const [eh, em] = f.workEnd.split(":").map(Number);
                    let startMin = sh * 60 + sm, endMin = eh * 60 + em;
                    if (endMin <= startMin) endMin += 24 * 60;
                    const nightStart = 22 * 60, nightEnd = 30 * 60;
                    const overlaps = Math.min(endMin, nightEnd) > Math.max(startMin, nightStart);
                    if (!overlaps) return null;
                    return (
                      <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 12, padding: "10px 14px" }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "#ef4444", margin: 0, lineHeight: 1.6 }}>
                          ⚠️ 근로기준법상 만 18세 미만 근로자는 원칙적으로 22:00~06:00 야간근로가 금지돼요. 예외적으로 필요하면 고용노동부 인가를 별도로 받아야 합니다.
                        </p>
                      </div>
                    );
                  })()}

                  {/* 시간 입력 */}
                  {ct !== "parttime" ? (
                    <>
                      {/* 요일마다 달라요 토글 */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>출퇴근 시각</span>
                        <button onClick={() => updateField("perDayHours", !f.perDayHours)}
                          style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, border: `1px solid ${f.perDayHours ? "#7c3aed" : "var(--border)"}`, background: f.perDayHours ? "rgba(139,92,246,0.12)" : "var(--surface2)", color: f.perDayHours ? "#c4b5fd" : "var(--text-muted)", cursor: "pointer" }}>
                          {f.perDayHours ? "✓ 요일마다 달라요" : "요일마다 달라요"}
                        </button>
                      </div>

                      {!f.perDayHours ? (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <div>
                              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>출근 시각</label>
                              <input type="time" style={inputStyle} value={f.workStart} onChange={e => {
                                const start = e.target.value; const end = f.workEnd;
                                const breakMin = f.noBreak ? 0 : parseInt(f.breakTime || "0");
                                if (start && end) {
                                  const [sh, sm] = start.split(":").map(Number);
                                  const [eh, em] = end.split(":").map(Number);
                                  const totalMin = (eh * 60 + em) - (sh * 60 + sm);
                                  if (totalMin > 0) {
                                    const daily = Math.round((totalMin - breakMin) / 60 * 10) / 10;
                                    const workDayCount = selectedDays.length || 5;
                                    setF(p => ({ ...p, workStart: start, dailyHours: String(daily), weeklyHours: String(Math.round(daily * workDayCount * 10) / 10) }));
                                    return;
                                  }
                                }
                                updateField("workStart", start);
                              }} />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>퇴근 시각</label>
                              <input type="time" style={inputStyle} value={f.workEnd} onChange={e => {
                                const end = e.target.value; const start = f.workStart;
                                const breakMin = f.noBreak ? 0 : parseInt(f.breakTime || "0");
                                if (start && end) {
                                  const [sh, sm] = start.split(":").map(Number);
                                  const [eh, em] = end.split(":").map(Number);
                                  const totalMin = (eh * 60 + em) - (sh * 60 + sm);
                                  if (totalMin > 0) {
                                    const daily = Math.round((totalMin - breakMin) / 60 * 10) / 10;
                                    const workDayCount = selectedDays.length || 5;
                                    setF(p => ({ ...p, workEnd: end, dailyHours: String(daily), weeklyHours: String(Math.round(daily * workDayCount * 10) / 10) }));
                                    return;
                                  }
                                }
                                updateField("workEnd", end);
                              }} />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>휴게 시작</label>
                              <input type="time" style={{ ...inputStyle, opacity: f.noBreak ? 0.4 : 1 }} value={f.noBreak ? "" : f.breakStart} disabled={f.noBreak} onChange={e => updateField("breakStart", e.target.value)} />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>휴게 종료</label>
                              <input type="time" style={{ ...inputStyle, opacity: f.noBreak ? 0.4 : 1 }} value={f.noBreak ? "" : f.breakEnd} disabled={f.noBreak} onChange={e => updateField("breakEnd", e.target.value)} />
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: -4 }}>
                            <input type="checkbox" id="noBreak" checked={!!f.noBreak} onChange={e => {
                              const noBreak = e.target.checked;
                              const breakMin = noBreak ? 0 : 30;
                              const start = f.workStart; const end = f.workEnd;
                              if (start && end) {
                                const [sh, sm] = start.split(":").map(Number);
                                const [eh, em] = end.split(":").map(Number);
                                const totalMin = (eh * 60 + em) - (sh * 60 + sm);
                                if (noBreak && totalMin >= 240) {
                                  showToast(`⚠️ 근로기준법상 근무 ${totalMin >= 480 ? "8시간" : "4시간"} 이상이면 휴게 ${totalMin >= 480 ? "1시간" : "30분"} 이상이 의무예요. 사람이 못 쉬어도 계속 대기·근무한다면 그 시간은 무급 휴게가 아니라 유급 근로시간으로 처리해야 해요.`, "error");
                                }
                                if (totalMin > 0) {
                                  const daily = Math.round((totalMin - breakMin) / 60 * 10) / 10;
                                  const workDayCount = selectedDays.length || 5;
                                  setF(p => ({ ...p, noBreak, breakTime: String(breakMin), dailyHours: String(daily), weeklyHours: String(Math.round(daily * workDayCount * 10) / 10) }));
                                  return;
                                }
                              }
                              setF(p => ({ ...p, noBreak, breakTime: String(breakMin) }));
                            }} style={{ width: 16, height: 16, accentColor: "#7c3aed", cursor: "pointer" }} />
                            <label htmlFor="noBreak" style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>휴게시간 없음</label>
                          </div>
                        </>
                      ) : selectedDays.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "rgba(0,0,0,0.12)", padding: 12, borderRadius: 12 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 1fr 68px", gap: 6 }}>
                            <div />
                            <span style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>출근</span>
                            <span style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>퇴근</span>
                            <span style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>휴게(분)</span>
                          </div>
                          {selectedDays.map(d => {
                            const idx = DAYS.indexOf(d);
                            const keyStart = "workStart" + DAYKEYS[idx];
                            const keyEnd = "workEnd" + DAYKEYS[idx];
                            const keyBreak = "breakTime" + DAYKEYS[idx];
                            return (
                              <div key={d} style={{ display: "grid", gridTemplateColumns: "36px 1fr 1fr 68px", gap: 6, alignItems: "center" }}>
                                <span style={{ fontSize: 12, fontWeight: 700 }}>{d}</span>
                                <input type="time" style={{ ...inputStyle, fontSize: 12, padding: "10px 8px" }} value={(f as any)[keyStart]} onChange={e => updateField(keyStart, e.target.value)} />
                                <input type="time" style={{ ...inputStyle, fontSize: 12, padding: "10px 8px" }} value={(f as any)[keyEnd]} onChange={e => updateField(keyEnd, e.target.value)} />
                                <input type="number" inputMode="numeric" style={{ ...inputStyle, fontSize: 12, padding: "10px 6px" }} value={(f as any)[keyBreak]} onChange={e => updateField(keyBreak, e.target.value)} placeholder="30" />
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "12px 0", background: "rgba(0,0,0,0.08)", borderRadius: 12 }}>위에서 근무 요일을 먼저 선택해주세요</p>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>1일 소정시간(h)</label>
                          <input type="number" inputMode="decimal" style={inputStyle} value={f.dailyHours} onChange={e => {
                            const daily = parseFloat(e.target.value) || 0;
                            const workDayCount = selectedDays.length || 5;
                            setF(p => ({ ...p, dailyHours: e.target.value, weeklyHours: daily ? String(Math.round(daily * workDayCount * 10) / 10) : p.weeklyHours }));
                          }} placeholder="8" />
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
                    <>
                      {/* 파트타임: 기본 출퇴근/휴게 (요일 미선택 시에도 표시) */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>기본 출근 시각</label>
                          <input type="time" style={inputStyle} value={f.workStart} onChange={e => updateField("workStart", e.target.value)} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>기본 퇴근 시각</label>
                          <input type="time" style={inputStyle} value={f.workEnd} onChange={e => updateField("workEnd", e.target.value)} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>휴게시간</label>
                          <div style={{ position: "relative" }}>
                            <input type="number" inputMode="numeric" style={{ ...inputStyle, opacity: f.noBreak ? 0.4 : 1 }} value={f.noBreak ? "" : f.breakTime} disabled={f.noBreak} onChange={e => updateField("breakTime", e.target.value)} placeholder="30" />
                            <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--text-muted)", pointerEvents: "none" }}>분</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input type="checkbox" id="noBreakPt" checked={!!f.noBreak} onChange={e => {
                              const noBreak = e.target.checked;
                              if (noBreak && f.workStart && f.workEnd) {
                                const [sh, sm] = f.workStart.split(":").map(Number);
                                const [eh, em] = f.workEnd.split(":").map(Number);
                                const totalMin = (eh * 60 + em) - (sh * 60 + sm);
                                if (totalMin >= 240) {
                                  showToast(`⚠️ 근로기준법상 근무 ${totalMin >= 480 ? "8시간" : "4시간"} 이상이면 휴게 ${totalMin >= 480 ? "1시간" : "30분"} 이상이 의무예요. 사람이 못 쉬어도 계속 대기·근무한다면 그 시간은 무급 휴게가 아니라 유급 근로시간으로 처리해야 해요.`, "error");
                                }
                              }
                              setF(p => ({ ...p, noBreak, breakTime: noBreak ? "0" : "30" }));
                            }} style={{ width: 16, height: 16, accentColor: "#7c3aed", cursor: "pointer" }} />
                            <label htmlFor="noBreakPt" style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>휴게 없음</label>
                          </div>
                        </div>
                      </div>
                      {/* 요일별 시간이 다를 경우 개별 설정 */}
                      {selectedDays.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "rgba(0,0,0,0.15)", padding: 12, borderRadius: 12 }}>
                          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>요일별 근무 시간 <span style={{ opacity: 0.6 }}>(기본값과 다른 경우만 수정)</span></p>
                          {selectedDays.map(d => {
                            const idx = DAYS.indexOf(d);
                            const keyStart = "workStart" + DAYKEYS[idx];
                            const keyEnd = "workEnd" + DAYKEYS[idx];
                            const keyBreak = "breakTime" + DAYKEYS[idx];
                            return (
                              <div key={d}>
                                <p style={{ fontSize: 12, fontWeight: 700, margin: "0 0 6px" }}>{d}요일</p>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 6, alignItems: "center" }}>
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
                      )}
                    </>
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
                      {f.wageType === "hour" ? `시간급 (원/시간) — 최저시급 ${getMinWageForDate(f.startDate).toLocaleString()}원`
                        : f.wageType === "day" ? "일급 (원/일)"
                        : "월급 (원/월)"}
                    </label>
                    <input type="tel" inputMode="numeric" style={errStyle(!f.wage.trim())} value={f.wage}
                     
                      onChange={e => {
                        const n = e.target.value.replace(/[^0-9]/g, "");
                        updateField("wage", n ? Number(n).toLocaleString() : "");
                      }}
                      placeholder={
                        f.wageType === "hour" ? getMinWageForDate(f.startDate).toLocaleString()
                          : f.wageType === "day" ? "예) 80,000"
                          : "예) 2,000,000"
                      } />
                    {f.wageType === "hour" && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        {[getMinWageForDate(f.startDate).toLocaleString(), "11,000", "12,000", "13,000"].map(v => (
                          <button key={v} onClick={() => updateField("wage", v)}
                            style={{ flex: 1, background: f.wage === v ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "var(--surface2)", border: "none", borderRadius: 8, padding: "8px 0", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                            {v}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 주휴수당 포함여부 토글 */}
                  <button onClick={() => updateField("wageIncludesWeeklyPay", !f.wageIncludesWeeklyPay)}
                    style={{ background: f.wageIncludesWeeklyPay ? "linear-gradient(135deg,#7c3aed20,#ec489920)" : "var(--surface2)", border: "1.5px solid " + (f.wageIncludesWeeklyPay ? "#7c3aed" : "var(--border)"), borderRadius: 12, padding: "13px 16px", color: "var(--text)", fontSize: 13, textAlign: "left", cursor: "pointer", fontWeight: f.wageIncludesWeeklyPay ? 700 : 400 }}>
                    {f.wageIncludesWeeklyPay ? "✓ 위 금액에 주휴수당 포함됨" : "위 금액은 주휴수당 별도 (탭하여 변경)"}
                  </button>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "-8px 0 0", lineHeight: 1.6 }}>
                    주 15시간 이상·개근 근무 시 주휴수당은 법정 의무예요. 위 금액에 이미 포함해서 책정했다면 켜주세요 — 켜면 명세서에서 별도로 더 계산하지 않아요. 꺼져 있으면(기본값) 명세서 생성 시 자동으로 추가 계산됩니다.
                  </p>

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

                  {/* 계좌번호 (계좌이체 선택 시) */}
                  {f.payMethod === "계좌이체" && (
                    <div>
                      <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                        * 급여 수령 계좌 <span style={{ color: "#fb923c", fontWeight: 700, background: "rgba(251,146,60,0.12)", padding: "2px 8px", borderRadius: 6, marginLeft: 4 }}>* 선택 (비워두면 알바생 동의 시 직접 입력)</span>
                      </label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 6 }}>
                          <select
                            style={{ ...inputStyle, padding: "10px 8px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
                            value={(f as any).bankName || ""}
                            onChange={e => {
                              const bName = e.target.value;
                              const bNum = (f as any).bankNumber || "";
                              const customName = (f as any).bankCustomName || "";
                              const finalName = bName === "기타" ? customName : bName;
                              setF(p => ({
                                ...p,
                                bankName: bName,
                                bankAccount: (finalName || bNum) ? `${finalName} ${bNum}`.trim() : ""
                              }));
                            }}>
                            <option value="">은행 선택</option>
                            <option value="KB국민">KB국민</option>
                            <option value="신한">신한</option>
                            <option value="우리">우리</option>
                            <option value="하나">하나</option>
                            <option value="카카오뱅크">카카오뱅크</option>
                            <option value="토스뱅크">토스뱅크</option>
                            <option value="NH농협">NH농협</option>
                            <option value="IBK기업">IBK기업</option>
                            <option value="새마을금고">새마을금고</option>
                            <option value="우체국">우체국</option>
                            <option value="SC제일">SC제일</option>
                            <option value="수협">수협</option>
                            <option value="신협">신협</option>
                            <option value="기타">기타 (직접입력)</option>
                          </select>
                          <input
                            style={inputStyle}
                            value={(f as any).bankNumber || ""}
                            onChange={e => {
                              const bNum = e.target.value;
                              const bName = (f as any).bankName || "";
                              const customName = (f as any).bankCustomName || "";
                              const finalName = bName === "기타" ? customName : bName;
                              setF(p => ({
                                ...p,
                                bankNumber: bNum,
                                bankAccount: (finalName || bNum) ? `${finalName} ${bNum}`.trim() : ""
                              }));
                            }}
                            placeholder="👉 계좌번호 입력 (숫자/하이픈)"
                            inputMode="numeric"
                          />
                        </div>
                        {(f as any).bankName === "기타" && (
                          <input
                            style={inputStyle}
                            value={(f as any).bankCustomName || ""}
                            onChange={e => {
                              const customName = e.target.value;
                              const bNum = (f as any).bankNumber || "";
                              setF(p => ({
                                ...p,
                                bankCustomName: customName,
                                bankAccount: (customName || bNum) ? `${customName} ${bNum}`.trim() : ""
                              }));
                            }}
                            placeholder="👉 은행명을 입력하세요 (예: 케이뱅크)"
                          />
                        )}
                        {((f as any).bankName || (f as any).bankNumber) && (
                          <div style={{ fontSize: 11, color: "#10b981", fontWeight: 700, padding: "2px 4px" }}>
                            🏦 적용 계좌: {((f as any).bankName === "기타" ? (f as any).bankCustomName : (f as any).bankName)} {(f as any).bankNumber}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 급여 자동계산 패널 */}
                  {payCalc && (
                    <div style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 16, padding: "16px" }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: "var(--purple-text)", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
                        🧮 예상 급여 자동계산
                        <span style={{ fontSize: 10, fontWeight: 400, color: "var(--text-muted)" }}>
                          {f.wageType !== "hour" ? `환산 시급 ${payCalc.hourlyRate.toLocaleString()}원 기준` : `시급 ${payCalc.hourlyRate.toLocaleString()}원 기준`}
                        </span>
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
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                      📂 서류 제출 현황
                    </label>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 8px", lineHeight: 1.5 }}>
                      서류 미제출이어도 계약서 작성은 가능합니다. 수령 시 체크하세요.
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {[
                        { key: "docHealthCert", label: "🏥 보건증", desc: "식품위생법 대상 업종 필수 · 유효기간 1년", required: true },
                        { key: "docIdCard", label: "🪪 신분증 사본", desc: "주민등록증 또는 운전면허증", required: true },
                        { key: "docBankbook", label: "🏦 통장 사본", desc: "급여 이체용 · 본인 명의", required: false },
                        { key: "docParentConsent", label: "📝 친권자 동의서", desc: "만 18세 미만 근로자 필수", required: ct === "minor" },
                      ].map(doc => {
                        const on = (f as any)[doc.key];
                        return (
                          <button key={doc.key} onClick={() => updateField(doc.key, !on)}
                            style={{
                              background: on ? "rgba(74,222,128,0.08)" : "var(--surface2)",
                              border: `1px solid ${on ? "rgba(74,222,128,0.4)" : "var(--border)"}`,
                              borderRadius: 12, padding: "10px 14px", cursor: "pointer",
                              display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                            }}>
                            <span style={{ fontSize: 18, flexShrink: 0 }}>{on ? "✅" : "⬜"}</span>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: on ? "#4ade80" : "var(--text)" }}>
                                {doc.label}
                                {!on && <span style={{ fontSize: 10, color: doc.required ? "#fb923c" : "var(--text-muted)", marginLeft: 6, fontWeight: 400, background: doc.required ? "rgba(251,146,60,0.1)" : "var(--surface)", borderRadius: 4, padding: "1px 5px" }}>{doc.required ? "미제출" : "미제출"}</span>}
                                {on && <span style={{ fontSize: 10, color: "#4ade80", marginLeft: 6, fontWeight: 400 }}>수령 완료</span>}
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
                  <button onClick={() => { setStepError(null); setWizardStep(s => s - 1); }}
                    style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", fontWeight: 600, padding: "13px", borderRadius: 14, fontSize: 13, cursor: "pointer" }}>
                    ← 이전
                  </button>
                )}
                {wizardStep < 4 ? (
                  <button onClick={() => {
                    const err = validateStep(wizardStep);
                    if (err) { setStepError(err); setTriedNext(true); showToast(`⚠️ ${err}`, "error"); return; }
                    setStepError(null); setTriedNext(false);
                    setWizardStep(s => s + 1);
                  }}
                    style={{ flex: 2, background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", border: "none", color: "#fff", fontWeight: 700, padding: "13px", borderRadius: 14, fontSize: 13, cursor: "pointer" }}>
                    다음 →
                  </button>
                ) : (
                  <button onClick={saveContract} disabled={saving}
                    style={{ flex: 2, background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", color: "#fff", fontWeight: 700, padding: "13px", borderRadius: 14, fontSize: 13, cursor: "pointer" }}>
                    {saving ? "발행 중..." : "📨 계약서 발행"}
                  </button>
                )}
              </div>

            </div>

          {/* 📄 공식 계약서 미리보기 (폼 아래 배치) */}
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isPreviewCollapsed ? 0 : 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>📄 계약서 미리보기</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => setShowDocZoomModal(true)}
                  style={{ background: "none", border: "none", fontSize: 10, color: "var(--purple-text)", cursor: "pointer", fontWeight: 700, padding: 0 }}>
                  크게 보기 ↗
                </button>
                <button onClick={() => setIsPreviewCollapsed(!isPreviewCollapsed)}
                  style={{
                    background: "var(--primary-light, rgba(139,92,246,0.12))",
                    border: "1px solid var(--primary-border, rgba(139,92,246,0.3))",
                    borderRadius: 10,
                    padding: "4px 10px",
                    color: "var(--primary, #8b5cf6)",
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4
                  }}
                >
                  <span>{isPreviewCollapsed ? "펼치기" : "접기"}</span>
                  <i className={`ti ${isPreviewCollapsed ? "ti-chevron-down" : "ti-chevron-up"}`} style={{ fontSize: 12, fontWeight: 900 }} aria-hidden="true" />
                </button>
              </div>
            </div>
            {!isPreviewCollapsed && (
              <div style={{
                background: "#fff",
                borderRadius: 12,
                border: "1px solid #ddd",
                overflow: "hidden",
                cursor: "zoom-in",
                zoom: 0.75,
              }} onClick={() => setShowDocZoomModal(true)}>
                <ContractBody />
              </div>
            )}
          </div>

          {/* 🔍 계약서 서식 전체화면 모달 */}
          {showDocZoomModal && (
            <div style={{
              position: "fixed",
              top: 0, left: 0, right: 0, bottom: 0,
              background: "rgba(9, 9, 11, 0.95)",
              zIndex: 99999,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
              cursor: "zoom-out"
            }} onClick={() => setShowDocZoomModal(false)}>
              <div style={{
                position: "relative",
                width: "95vw",
                maxWidth: "800px",
                maxHeight: "85vh",
                overflowY: "auto",
                background: "#fff",
                borderRadius: 12,
                padding: "30px 24px",
                boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)",
                cursor: "default"
              }} onClick={e => e.stopPropagation()}>
                <ContractBody />
                <button onClick={() => setShowDocZoomModal(false)}
                  style={{
                    position: "absolute",
                    top: 15, right: 15,
                    background: "rgba(0,0,0,0.05)",
                    border: "none",
                    borderRadius: "50%",
                    width: 32, height: 32,
                    color: "var(--text)",
                    fontWeight: "bold",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    transition: "all 0.2s"
                  }}>✕</button>
              </div>
              <p style={{ color: "rgba(255,255,255,0.6)", textAlign: "center", fontSize: 11, marginTop: 12, margin: 0 }}>
                💡 바깥 영역을 클릭하거나 우측 상단 ✕를 눌러 닫기 (실시간 서식 뷰)
              </p>
            </div>
          )}

          {/* 공식 양식 숨김 렌더 (인쇄/PDF 생성용) */}
          <div id="official-form-render" style={{ position: "absolute", left: "-9999px", top: 0, zIndex: -1, background: "#fff" }}>
            <ContractOfficialForm data={f} contractType={ct} />
          </div>

          {/* 하단 플로팅 액션 바 제거 (작성 중에는 불필요) */}
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
