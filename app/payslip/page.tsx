"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import { getTaxRates, calcDailyWorkerTax, calcInsuranceEligibility, calcInsuranceDeduction } from "@/lib/taxRates";

function PayslipContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const teamMemberId = sp.get("tmId") || "";
  const payslipId = sp.get("id") || "";
  const fromTab = sp.get("tab") || "payslip";

  const [user, setUser] = useState<any>(null);
  const [userType, setUserType] = useState<string>("");
  const [member, setMember] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{msg:string;type:"success"|"error"|"info"} | null>(null);

  const showToast = (msg: string, type: "success"|"error"|"info" = "success") => {
    setToast({msg, type});
    setTimeout(() => setToast(null), 2500);
  };

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [memo, setMemo] = useState("");
  const [existingPayslip, setExistingPayslip] = useState<any>(null);
  const [taxRates, setTaxRates] = useState<any>(null);
  const [calcType, setCalcType] = useState<"regular" | "daily">("regular");

  // 세금 공제 각 항목의 체크 상태 (공제 제외 여부)
  const [enableIncomeTax, setEnableIncomeTax] = useState(true);
  const [enableLocalTax, setEnableLocalTax] = useState(true);
  const [enableHealthIns, setEnableHealthIns] = useState(true);
  const [enableEmploymentIns, setEnableEmploymentIns] = useState(true);
  const [enableNationalPension, setEnableNationalPension] = useState(true);

  // 세금 공제 각 항목의 금액 상태
  const [incomeTax, setIncomeTax] = useState(0);
  const [localTax, setLocalTax] = useState(0);
  const [healthIns, setHealthIns] = useState(0);
  const [employmentIns, setEmploymentIns] = useState(0);
  const [nationalPension, setNationalPension] = useState(0);
  const [contractInsurances, setContractInsurances] = useState<{ insPension: boolean; insHealth: boolean; insEmp: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      const rates = await getTaxRates(year);
      setTaxRates(rates);
    })();
  }, [year]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUser(user);
      const { data: ud } = await supabase.from("users").select("user_type").eq("id", user.id).single();
      setUserType(ud?.user_type || "worker");
      if (payslipId) {
        await loadExistingPayslip(payslipId);
      } else if (teamMemberId) {
        await loadMember(teamMemberId);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (member) loadAttendanceWithMember(member, year, month);
  }, [year, month, member?.id]);

  async function loadExistingPayslip(id: string) {
    const { data } = await supabase.from("payslips")
      .select("*, team_members(*, users!team_members_worker_id_fkey(nickname, email, avatar_url))")
      .eq("id", id).single();
    if (data) {
      setExistingPayslip(data);
      setYear(data.year);
      setMonth(data.month);
      setMemo(data.memo || "");
      const m = { ...data.team_members, worker: data.team_members?.users };
      setMember(m);
      setAttendance(data.attendance_data || []);
      if (data.health_insurance > 0 || data.national_pension > 0 || (data.income_tax === 0 && data.health_insurance === 0)) {
        setCalcType("regular");
      } else {
        setCalcType("daily");
      }
    }
  }

  async function loadMember(tmId: string) {
    const { data } = await supabase.from("team_members")
      .select("*, users!team_members_worker_id_fkey(nickname, email, avatar_url)")
      .eq("id", tmId).single();
    if (data) {
      const m = { ...data, worker: data.users };
      setMember(m);

      // 계약서에 등록된 사회보험 설정(insEmp, insPension, insHealth)을 불러옵니다.
      const { data: contract } = await supabase.from("contracts")
        .select("contract_data")
        .eq("team_member_id", tmId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (contract?.contract_data) {
        const cd = contract.contract_data;
        setContractInsurances({
          insPension: cd.insPension !== false,
          insHealth: cd.insHealth !== false,
          insEmp: cd.insEmp !== false,
        });
      }

      // year/month 클로저 문제 방지 - 현재 날짜로 직접 계산
      const nowY = new Date().getFullYear();
      const nowM = new Date().getMonth() + 1;
      await loadAttendanceWithMember(m, nowY, nowM);
    }
  }

  async function loadAttendanceWithMember(m: any, y: number, mo: number) {
    const monthStr = `${y}-${String(mo).padStart(2,"0")}`;
    const lastDay = new Date(y, mo, 0).getDate(); // 해당 월 마지막 날
    const lastDateStr = `${monthStr}-${String(lastDay).padStart(2,"0")}`;
    const { data } = await supabase.from("attendance")
      .select("work_date, status, actual_hours, check_in, check_out")
      .eq("team_member_id", m.id)
      .gte("work_date", `${monthStr}-01`)
      .lte("work_date", lastDateStr)
      .order("work_date");
    setAttendance(data || []);
  }

  const isEmployer = userType === "employer" || userType === "both";
  const isWorker = userType === "worker" || userType === "both";

  const wage = member?.wage || 0;
  const contractHours = member?.work_hours ? parseFloat(member.work_hours) : 8;
  const workDays = attendance.filter(a => ["normal","late","early_leave"].includes(a.status));
  const totalHours = workDays.reduce((s, a) => s + (a.actual_hours || contractHours), 0);
  const overtimeHours = Math.max(0, totalHours - workDays.length * contractHours);
  const basePay = Math.round((totalHours - overtimeHours) * wage);
  const overtimePay = Math.round(overtimeHours * wage * 1.5);
  const totalPay = basePay + overtimePay;

  // 1. 계산 의존성 useEffect: 계산 인풋이 바뀔 때 세금/공제 금액 기본 계산
  useEffect(() => {
    // 만약 기존에 발급된 명세서가 있고 년/월이 일치한다면 기존에 저장된 공제 데이터를 복원
    if (existingPayslip && existingPayslip.year === year && existingPayslip.month === month) {
      setIncomeTax(existingPayslip.income_tax ?? 0);
      setEnableIncomeTax((existingPayslip.income_tax ?? 0) > 0 || (existingPayslip.local_tax ?? 0) > 0 || existingPayslip.status === "confirmed");
      setLocalTax(existingPayslip.local_tax ?? 0);
      setEnableLocalTax((existingPayslip.local_tax ?? 0) > 0 || existingPayslip.status === "confirmed");

      setHealthIns(existingPayslip.health_insurance ?? 0);
      setEnableHealthIns((existingPayslip.health_insurance ?? 0) > 0 || existingPayslip.status === "confirmed");
      setEmploymentIns(existingPayslip.employment_insurance ?? 0);
      setEnableEmploymentIns((existingPayslip.employment_insurance ?? 0) > 0 || existingPayslip.status === "confirmed");
      setNationalPension(existingPayslip.national_pension ?? 0);
      setEnableNationalPension((existingPayslip.national_pension ?? 0) > 0 || existingPayslip.status === "confirmed");
      return;
    }

    if (calcType === "daily") {
      let calcInc = 0;
      let calcLoc = 0;
      workDays.forEach(a => {
        const dailyHours = a.actual_hours || contractHours;
        const dailyPay = Math.round(dailyHours * wage);
        const tax = calcDailyWorkerTax(dailyPay);
        calcInc += tax.incomeTax;
        calcLoc += tax.localTax;
      });
      setIncomeTax(calcInc);
      setLocalTax(calcLoc);
      setEnableIncomeTax(calcInc > 0);
      setEnableLocalTax(calcLoc > 0);
      setHealthIns(0);
      setEmploymentIns(0);
      setNationalPension(0);
    } else {
      if (taxRates) {
        const eligibility = calcInsuranceEligibility({
          monthlyHours: totalHours,
          contractMonths: 0,
          isDailyWorker: false
        });
        const ins = calcInsuranceDeduction(totalPay, taxRates, eligibility);
        setHealthIns(ins.health);
        setEmploymentIns(ins.employment);
        setNationalPension(ins.nationalPension);
        if (contractInsurances) {
          setEnableHealthIns(contractInsurances.insHealth && ins.health > 0);
          setEnableEmploymentIns(contractInsurances.insEmp && ins.employment > 0);
          setEnableNationalPension(contractInsurances.insPension && ins.nationalPension > 0);
        } else {
          setEnableHealthIns(ins.health > 0);
          setEnableEmploymentIns(ins.employment > 0);
          setEnableNationalPension(ins.nationalPension > 0);
        }
      } else {
        setHealthIns(0);
        setEmploymentIns(0);
        setNationalPension(0);
      }
      setIncomeTax(0);
      setLocalTax(0);
    }
  }, [totalPay, calcType, taxRates, year, month, existingPayslip, workDays.length, totalHours, contractInsurances]);

  // 실시간으로 체크 상태와 편집된 수치를 연동해 합계 산출
  const currentIncomeTax = enableIncomeTax ? incomeTax : 0;
  const currentLocalTax = enableLocalTax ? localTax : 0;
  const currentHealthIns = enableHealthIns ? healthIns : 0;
  const currentEmploymentIns = enableEmploymentIns ? employmentIns : 0;
  const currentNationalPension = enableNationalPension ? nationalPension : 0;

  const totalDeductions = calcType === "daily"
    ? (currentIncomeTax + currentLocalTax)
    : (currentHealthIns + currentEmploymentIns + currentNationalPension);

  const netPay = totalPay - totalDeductions;

  async function issuePayslip() {
    if (!member || !user) return;
    if (!wage) { showToast("시급 정보가 없어요. 계약서를 먼저 작성해주세요.", "error"); return; }
    if (workDays.length === 0) { showToast("해당 월 근태 기록이 없어요.", "error"); return; }

    const confirmed = window.confirm(
      `📄 ${year}년 ${month}월 급여 명세서 발행\n\n` +
      `👤 ${member.worker?.nickname || "팀원"}\n` +
      `⏱ 총 근무시간: ${totalHours.toFixed(1)}시간\n` +
      `💰 총 지급액: ${totalPay.toLocaleString()}원\n` +
      `💸 공제액: ${totalDeductions.toLocaleString()}원\n` +
      `💵 실수령액: ${netPay.toLocaleString()}원\n\n` +
      `발행하면 직원에게 채팅 알림이 가요.\n계속할까요?`
    );
    if (!confirmed) return;

    setSaving(true);
    const lastDay = new Date(year, month, 0).getDate();
    const monthStr = `${year}-${String(month).padStart(2,"0")}`;
    const payload = {
      employer_id: member.employer_id,
      worker_id: member.worker_id,
      team_member_id: member.id,
      match_id: member.match_id,
      year, month,
      wage,
      total_hours: totalHours,
      overtime_hours: overtimeHours,
      base_pay: basePay,
      overtime_pay: overtimePay,
      total_pay: totalPay,
      work_days: workDays.length,
      attendance_data: attendance,
      memo,
      status: "issued",
      issued_at: new Date().toISOString(),
      confirmed_at: null,
      correction_reason: null,

      // 구 스키마 컬럼 호환성 매핑
      pay_period_start: `${monthStr}-01`,
      pay_period_end: `${monthStr}-${String(lastDay).padStart(2,"0")}`,
      base_wage: wage,
      total_amount: totalPay,
      deductions: totalDeductions,
      net_amount: netPay,

      // 신규 세금/보험 정보 저장
      income_tax: currentIncomeTax,
      local_tax: currentLocalTax,
      health_insurance: currentHealthIns,
      employment_insurance: currentEmploymentIns,
      national_pension: currentNationalPension,
      total_deductions: totalDeductions,
      net_pay: netPay,
    };

    let payslipData: any = null;
    if (existingPayslip) {
      const { data } = await supabase.from("payslips").update(payload).eq("id", existingPayslip.id).select("id").single();
      payslipData = data;
    } else {
      const { data } = await supabase.from("payslips").insert(payload).select("id").single();
      payslipData = data;
    }

    if (payslipData && member.match_id) {
      const workerName = member.worker?.nickname || "팀원";
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: member.match_id,
          senderId: user.id,
          receiverId: member.worker_id,
          message: `📋 ${year}년 ${month}월 급여 명세서가 발행됐어요!\n\n💰 실수령액: ${netPay.toLocaleString()}원\n(총 지급액: ${totalPay.toLocaleString()}원 · 공제액: ${totalDeductions.toLocaleString()}원)\n⏱ 총 근무: ${totalHours.toFixed(1)}시간 (${workDays.length}일)\n\n명세서를 확인해주세요.`,
          messageType: "system",
        }),
      }).catch(() => {});
    }

    showToast(`✅ ${year}년 ${month}월 급여 명세서가 발행됐어요!`);
    router.push(`/employer/team/${member.id}`);
    setSaving(false);
  }

  const statusLabel: Record<string,string> = { normal:"정상", late:"지각", early_leave:"조퇴", absent:"결근", off:"휴무" };
  const statusColor: Record<string,string> = { normal:"#10b981", late:"#f59e0b", early_leave:"#f59e0b", absent:"#ef4444", off:"#6b7280" };

  if (loading) return (
    <main style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <p style={{ color:"var(--text-muted)" }}>로딩 중...</p>
    </main>
  );

  return (
    <main style={{ minHeight:"100vh", background:"var(--bg)", paddingBottom:80 }}>
      <AppHeader title="급여 명세서" showBack onBack={() => router.replace(`/myteam?tab=${fromTab}`)} />
      <div style={{ maxWidth:480, margin:"0 auto", padding:16 }}>

        {/* 직원 정보 */}
        {member && (
          <div style={{ background:"var(--surface)", borderRadius:14, padding:14, border:"1px solid var(--border)", marginBottom:14, display:"flex", gap:12, alignItems:"center" }}>
            <div style={{ width:44, height:44, borderRadius:"50%", background:"linear-gradient(135deg,#7c3aed,#ec4899)", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
              {member.worker?.avatar_url
                ? <img src={member.worker.avatar_url} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                : <span style={{ color:"#fff", fontWeight:700 }}>{(member.worker?.nickname || member.worker?.email || "?")[0].toUpperCase()}</span>}
            </div>
            <div>
              <p style={{ fontSize:14, fontWeight:700, color:"var(--text)", margin:"0 0 2px" }}>
                {member.worker?.nickname || member.worker?.email?.split("@")[0] || "팀원"}
              </p>
              <p style={{ fontSize:11, color:"var(--text-muted)", margin:0 }}>
                시급 {wage ? wage.toLocaleString()+"원" : "미설정"} · {member.work_days || "요일 미정"}
              </p>
            </div>
          </div>
        )}

        {/* 수정 요청 사유 배너 (공용) */}
        {existingPayslip?.status === "correction_requested" && (
          <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:14, padding:14, marginBottom:14 }}>
            <p style={{ fontSize:13, color:"#ef4444", margin:"0 0 4px", fontWeight:700 }}>⚠️ 알바생 수정 요청 사유</p>
            <p style={{ fontSize:12, color:"var(--text)", margin:0, lineHeight: 1.4 }}>
              {existingPayslip.correction_reason || "사유 미작성"}
            </p>
          </div>
        )}

        {/* 월 선택 */}
        <div style={{ background:"var(--surface)", borderRadius:14, padding:14, border:"1px solid var(--border)", marginBottom:14 }}>
          <p style={{ fontSize:12, fontWeight:700, color:"var(--text)", margin:"0 0 10px" }}>📅 명세서 기간</p>
          <div style={{ display:"flex", gap:8 }}>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"10px", fontSize:14, color:"var(--text)", outline:"none" }}>
              {[now.getFullYear()-1, now.getFullYear()].map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"10px", fontSize:14, color:"var(--text)", outline:"none" }}>
              {Array.from({length:12}, (_,i) => i+1).map(m => <option key={m} value={m}>{m}월</option>)}
            </select>
          </div>
        </div>

        {/* 근무 유형 선택 */}
        <div style={{ background:"var(--surface)", borderRadius:14, padding:14, border:"1px solid var(--border)", marginBottom:14 }}>
          <p style={{ fontSize:12, fontWeight:700, color:"var(--text)", margin:"0 0 10px" }}>🛡️ 근무 및 공제 유형</p>
          {isEmployer ? (
            <div style={{ display:"flex", gap:8 }}>
              <button type="button" onClick={() => setCalcType("regular")}
                style={{ flex:1, padding:"10px", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer",
                  background: calcType === "regular" ? "rgba(124,58,237,0.15)" : "var(--surface2)",
                  border: calcType === "regular" ? "1px solid #7c3aed" : "1px solid var(--border)",
                  color: calcType === "regular" ? "var(--purple-text)" : "var(--text-muted)",
                  outline: "none" }}>
                상용/단시간 (4대보험)
              </button>
              <button type="button" onClick={() => setCalcType("daily")}
                style={{ flex:1, padding:"10px", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer",
                  background: calcType === "daily" ? "rgba(236,72,153,0.15)" : "var(--surface2)",
                  border: calcType === "daily" ? "1px solid #ec4899" : "1px solid var(--border)",
                  color: calcType === "daily" ? "var(--pink-text)" : "var(--text-muted)",
                  outline: "none" }}>
                일용근로자 (일용세)
              </button>
            </div>
          ) : (
            <p style={{ fontSize:13, fontWeight:600, color:"var(--text)", margin:0 }}>
              {calcType === "regular" ? "상용/단시간 근로자 (4대보험 공제)" : "일용근로자 (일용소득세 공제)"}
            </p>
          )}
        </div>

        {/* 급여 계산 */}
        <div style={{ background:"linear-gradient(135deg,#7c3aed,#ec4899)", borderRadius:16, padding:16, marginBottom:14 }}>
          <p style={{ fontSize:12, color:"rgba(255,255,255,0.8)", margin:"0 0 12px" }}>{year}년 {month}월 급여 내역</p>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {[
              { label:"근무일수", value:`${workDays.length}일` },
              { label:"총 근무시간", value:`${totalHours.toFixed(1)}시간` },
              { label:`기본급 (${totalHours.toFixed(1) }h × ${wage.toLocaleString()}원)`, value:`${basePay.toLocaleString()}원` },
              ...(overtimeHours > 0 ? [{ label:`초과수당 (${overtimeHours.toFixed(1)}h × 1.5)`, value:`${overtimePay.toLocaleString()}원` }] : []),
            ].map(r => (
              <div key={r.label} style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:12, color:"rgba(255,255,255,0.8)" }}>{r.label}</span>
                <span style={{ fontSize:12, color:"#fff", fontWeight:600 }}>{r.value}</span>
              </div>
            ))}

            <div style={{ display:"flex", justifyContent:"space-between", borderTop:"1px dashed rgba(255,255,255,0.3)", paddingTop:8 }}>
              <span style={{ fontSize:12, color:"rgba(255,255,255,0.8)", fontWeight:700 }}>총 지급액 (세전)</span>
              <span style={{ fontSize:12, color:"#fff", fontWeight:700 }}>{totalPay.toLocaleString()}원</span>
            </div>

            {totalDeductions > 0 && (
              <div style={{ display:"flex", flexDirection:"column", gap:6, paddingLeft:8, borderLeft:"2px solid rgba(255,255,255,0.3)", margin:"4px 0" }}>
                {calcType === "regular" ? (
                  <>
                    {currentNationalPension > 0 && (
                      <div style={{ display:"flex", justifyContent:"space-between" }}>
                        <span style={{ fontSize:11, color:"rgba(255,255,255,0.7)" }}>└ 국민연금 (4.5%)</span>
                        <span style={{ fontSize:11, color:"rgba(255,255,255,0.9)" }}>-{currentNationalPension.toLocaleString()}원</span>
                      </div>
                    )}
                    {currentHealthIns > 0 && (
                      <div style={{ display:"flex", justifyContent:"space-between" }}>
                        <span style={{ fontSize:11, color:"rgba(255,255,255,0.7)" }}>└ 건강보험 (3.545%)</span>
                        <span style={{ fontSize:11, color:"rgba(255,255,255,0.9)" }}>-{currentHealthIns.toLocaleString()}원</span>
                      </div>
                    )}
                    {currentEmploymentIns > 0 && (
                      <div style={{ display:"flex", justifyContent:"space-between" }}>
                        <span style={{ fontSize:11, color:"rgba(255,255,255,0.7)" }}>└ 고용보험 (0.9%)</span>
                        <span style={{ fontSize:11, color:"rgba(255,255,255,0.9)" }}>-{currentEmploymentIns.toLocaleString()}원</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {currentIncomeTax > 0 && (
                      <div style={{ display:"flex", justifyContent:"space-between" }}>
                        <span style={{ fontSize:11, color:"rgba(255,255,255,0.7)" }}>└ 소득세</span>
                        <span style={{ fontSize:11, color:"rgba(255,255,255,0.9)" }}>-{currentIncomeTax.toLocaleString()}원</span>
                      </div>
                    )}
                    {currentLocalTax > 0 && (
                      <div style={{ display:"flex", justifyContent:"space-between" }}>
                        <span style={{ fontSize:11, color:"rgba(255,255,255,0.7)" }}>└ 지방소득세 (10%)</span>
                        <span style={{ fontSize:11, color:"rgba(255,255,255,0.9)" }}>-{currentLocalTax.toLocaleString()}원</span>
                      </div>
                    )}
                  </>
                )}
                <div style={{ display:"flex", justifyContent:"space-between", fontWeight:600 }}>
                  <span style={{ fontSize:11, color:"rgba(255,255,255,0.8)" }}>공제 합계</span>
                  <span style={{ fontSize:11, color:"#fff" }}>-{totalDeductions.toLocaleString()}원</span>
                </div>
              </div>
            )}

            <div style={{ borderTop:"1px solid rgba(255,255,255,0.4)", paddingTop:10, display:"flex", justifyContent:"space-between" }}>
              <span style={{ fontSize:14, fontWeight:700, color:"#fff" }}>💰 실수령액 (세후)</span>
              <span style={{ fontSize:18, fontWeight:900, color:"#fff" }}>{netPay.toLocaleString()}원</span>
            </div>
          </div>
        </div>

        {/* 사장님: 공제 항목 직접 수정 설정 */}
        {isEmployer && (
          <div style={{ background:"var(--surface)", borderRadius:14, padding:14, border:"1px solid var(--border)", marginBottom:14 }}>
            <p style={{ fontSize:12, fontWeight:700, color:"var(--text-muted)", margin:"0 0 10px" }}>⚙️ 세금 및 공제 직접 수정 (감면/제외 설정)</p>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {calcType === "regular" ? (
                <>
                  {/* 국민연금 */}
                  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                        <input type="checkbox" checked={enableNationalPension} onChange={e => setEnableNationalPension(e.target.checked)} style={{ width:16, height:16, cursor:"pointer" }} />
                        <span>국민연금 (4.5%)</span>
                      </label>
                      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <input type="number" disabled={!enableNationalPension} value={nationalPension || ""} onChange={e => setNationalPension(Number(e.target.value))}
                          style={{ width:100, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"6px 10px", color:"var(--text)", fontSize:13, textAlign:"right", outline:"none" }} />
                        <span style={{ fontSize:12, color:"var(--text-muted)" }}>원</span>
                      </div>
                    </div>
                    {enableNationalPension && (
                      <p style={{ fontSize:10, color:"var(--text-muted)", margin:"0 0 0 24px", lineHeight:1.4 }}>
                        ℹ️ 법정 산출 공식: 세전급여 {totalPay.toLocaleString()}원 × 요율 4.5% = {Math.round(totalPay * 0.045).toLocaleString()}원
                      </p>
                    )}
                  </div>

                  {/* 건강보험 */}
                  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                        <input type="checkbox" checked={enableHealthIns} onChange={e => setEnableHealthIns(e.target.checked)} style={{ width:16, height:16, cursor:"pointer" }} />
                        <span>건강보험 (3.545%)</span>
                      </label>
                      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <input type="number" disabled={!enableHealthIns} value={healthIns || ""} onChange={e => setHealthIns(Number(e.target.value))}
                          style={{ width:100, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"6px 10px", color:"var(--text)", fontSize:13, textAlign:"right", outline:"none" }} />
                        <span style={{ fontSize:12, color:"var(--text-muted)" }}>원</span>
                      </div>
                    </div>
                    {enableHealthIns && (
                      <p style={{ fontSize:10, color:"var(--text-muted)", margin:"0 0 0 24px", lineHeight:1.4 }}>
                        ℹ️ 법정 산출 공식: 세전급여 {totalPay.toLocaleString()}원 × 요율 3.545% = {Math.round(totalPay * 0.03545).toLocaleString()}원
                      </p>
                    )}
                  </div>

                  {/* 고용보험 */}
                  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                        <input type="checkbox" checked={enableEmploymentIns} onChange={e => setEnableEmploymentIns(e.target.checked)} style={{ width:16, height:16, cursor:"pointer" }} />
                        <span>고용보험 (0.9%)</span>
                      </label>
                      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <input type="number" disabled={!enableEmploymentIns} value={employmentIns || ""} onChange={e => setEmploymentIns(Number(e.target.value))}
                          style={{ width:100, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"6px 10px", color:"var(--text)", fontSize:13, textAlign:"right", outline:"none" }} />
                        <span style={{ fontSize:12, color:"var(--text-muted)" }}>원</span>
                      </div>
                    </div>
                    {enableEmploymentIns && (
                      <p style={{ fontSize:10, color:"var(--text-muted)", margin:"0 0 0 24px", lineHeight:1.4 }}>
                        ℹ️ 법정 산출 공식: 세전급여 {totalPay.toLocaleString()}원 × 요율 0.9% = {Math.round(totalPay * 0.009).toLocaleString()}원
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* 소득세 */}
                  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                        <input type="checkbox" checked={enableIncomeTax} onChange={e => setEnableIncomeTax(e.target.checked)} style={{ width:16, height:16, cursor:"pointer" }} />
                        <span>소득세 (일용세)</span>
                      </label>
                      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <input type="number" disabled={!enableIncomeTax} value={incomeTax || ""} onChange={e => setIncomeTax(Number(e.target.value))}
                          style={{ width:100, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"6px 10px", color:"var(--text)", fontSize:13, textAlign:"right", outline:"none" }} />
                        <span style={{ fontSize:12, color:"var(--text-muted)" }}>원</span>
                      </div>
                    </div>
                    {enableIncomeTax && (
                      <p style={{ fontSize:10, color:"var(--text-muted)", margin:"0 0 0 24px", lineHeight:1.4 }}>
                        ℹ️ 법정 산출 공식: 일급 15만 초과액의 6% × 45% (소액부징수 1천원 미만 면제)
                      </p>
                    )}
                  </div>

                  {/* 지방소득세 */}
                  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                        <input type="checkbox" checked={enableLocalTax} onChange={e => setEnableLocalTax(e.target.checked)} style={{ width:16, height:16, cursor:"pointer" }} />
                        <span>지방소득세 (10%)</span>
                      </label>
                      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <input type="number" disabled={!enableLocalTax} value={localTax || ""} onChange={e => setLocalTax(Number(e.target.value))}
                          style={{ width:100, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"6px 10px", color:"var(--text)", fontSize:13, textAlign:"right", outline:"none" }} />
                        <span style={{ fontSize:12, color:"var(--text-muted)" }}>원</span>
                      </div>
                    </div>
                    {enableLocalTax && (
                      <p style={{ fontSize:10, color:"var(--text-muted)", margin:"0 0 0 24px", lineHeight:1.4 }}>
                        ℹ️ 법정 산출 공식: 소득세 ({incomeTax.toLocaleString()}원) × 요율 10% = {Math.round(incomeTax * 0.1).toLocaleString()}원
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 날짜별 상세 */}
        <div style={{ background:"var(--surface)", borderRadius:14, padding:14, border:"1px solid var(--border)", marginBottom:14 }}>
          <p style={{ fontSize:12, fontWeight:700, color:"var(--text)", margin:"0 0 10px" }}>📋 일별 근무 내역</p>
          {attendance.length === 0 ? (
            <p style={{ fontSize:13, color:"var(--text-muted)", textAlign:"center", padding:"16px 0" }}>근태 기록이 없어요</p>
          ) : attendance.map(a => (
            <div key={a.work_date} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid var(--border)" }}>
              <div>
                <span style={{ fontSize:12, fontWeight:600, color:"var(--text)" }}>{a.work_date}</span>
                {a.check_in && (
                  <span style={{ fontSize:11, color:"var(--text-muted)", marginLeft:8 }}>
                    {new Date(a.check_in).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})}
                    ~{a.check_out ? new Date(a.check_out).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"}) : "-"}
                  </span>
                )}
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <span style={{ fontSize:11, color:statusColor[a.status]||"#888" }}>{statusLabel[a.status]||a.status}</span>
                {a.actual_hours && <span style={{ fontSize:11, color:"#7c3aed", fontWeight:600 }}>{a.actual_hours}h</span>}
              </div>
            </div>
          ))}
        </div>

        {/* 메모 */}
        <div style={{ background:"var(--surface)", borderRadius:14, padding:14, border:"1px solid var(--border)", marginBottom:16 }}>
          <p style={{ fontSize:12, fontWeight:700, color:"var(--text)", margin:"0 0 4px" }}>메모</p>
          {isWorker && !isEmployer ? (
            <p style={{ fontSize:13, color:"var(--text-muted)", margin:0 }}>{memo || "특이사항 없음"}</p>
          ) : (
            <textarea value={memo} onChange={e => setMemo(e.target.value)}
              placeholder="특이사항이나 추가 내용을 입력해주세요"
              rows={3}
              style={{ width:"100%", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"10px 12px", fontSize:13, color:"var(--text)", outline:"none", resize:"none", boxSizing:"border-box" as const }} />
          )}
        </div>

        {/* 사장님: 발행 버튼 */}
        {isEmployer && (
          <>
            <button onClick={issuePayslip} disabled={saving || !wage}
              style={{ width:"100%", background: wage ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "none", border: wage ? "none" : "1px solid var(--border)", borderRadius:14, padding:14, color: wage ? "#fff" : "var(--text-muted)", fontSize:15, fontWeight:700, cursor: wage ? "pointer" : "default" }}>
              {saving ? "발행 중..." : existingPayslip ? "📋 명세서 재발행" : "📋 급여 명세서 발행"}
            </button>
            {!wage && <p style={{ fontSize:12, color:"#ef4444", textAlign:"center", marginTop:8 }}>⚠️ 시급 정보가 없어요. 계약서를 먼저 작성해주세요.</p>}
            
            {/* 알바생 확인 독촉 알림 전송 버튼 */}
            {existingPayslip && !existingPayslip.confirmed_at && existingPayslip.status === "issued" && (
              <button onClick={async () => {
                if (!member?.match_id) return;
                const { error } = await supabase.from("payslips")
                  .update({ issued_at: new Date().toISOString() })
                  .eq("id", existingPayslip.id);
                if (error) { showToast("알림 에러: " + error.message, "error"); return; }
                
                await fetch("/api/chat", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    matchId: member.match_id,
                    senderId: user.id,
                    receiverId: member.worker_id,
                    message: `⏳ [급여명세서 확인 요청]\n아직 ${year}년 ${month}월 급여 명세서 확인이 완료되지 않았습니다. 명세서를 확인하고 서명해 주세요.\n👉 http://localhost:3000/payslip?id=${existingPayslip.id}`,
                    messageType: "system",
                  }),
                }).catch(() => {});
                showToast("🔔 알바생에게 명세서 확인 요청 알림을 전송했습니다.", "success");
              }}
                style={{ width:"100%", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:14, padding:12, color:"var(--text)", fontSize:13, fontWeight:600, cursor:"pointer", marginTop:8 }}>
                🔔 알바생에게 확인 독촉 알림 전송
              </button>
            )}
          </>
        )}

        {/* 알바생: 확인 및 수정 요청 버튼 */}
        {isWorker && !isEmployer && existingPayslip && (
          existingPayslip.status === "confirmed" || existingPayslip.confirmed_at ? (
            <div style={{ background:"#10b98120", borderRadius:14, padding:14, textAlign:"center" }}>
              <p style={{ fontSize:13, color:"#10b981", margin:"0 0 4px", fontWeight:700 }}>✅ 확인 완료</p>
              <p style={{ fontSize:11, color:"var(--text-muted)", margin:0 }}>
                {existingPayslip.confirmed_at ? new Date(existingPayslip.confirmed_at).toLocaleDateString("ko-KR") : ""} 확인함
              </p>
            </div>
          ) : existingPayslip.status === "correction_requested" ? (
            <div style={{ background:"rgba(239,68,68,0.1)", borderRadius:14, padding:14, textAlign:"center" }}>
              <p style={{ fontSize:13, color:"#ef4444", margin:"0 0 4px", fontWeight:700 }}>✏️ 수정 요청 완료</p>
              <p style={{ fontSize:11, color:"var(--text-muted)", margin:0 }}>
                사장님이 확인 후 재발행할 예정입니다.
              </p>
            </div>
          ) : (
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={async () => {
                const confirmedAt = new Date().toISOString();
                const { error } = await supabase.from("payslips")
                  .update({ confirmed_at: confirmedAt, status: "confirmed" })
                  .eq("id", existingPayslip.id);
                if (error) { showToast("저장 오류: " + error.message, "error"); return; }
                setExistingPayslip((p: any) => ({ ...p, confirmed_at: confirmedAt, status: "confirmed" }));
                showToast("✅ 급여 명세서를 확인했어요!", "success");
              }}
                style={{ flex:1.5, background:"linear-gradient(135deg,#10b981,#059669)", border:"none", borderRadius:14, padding:14, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                ✅ 확인했어요
              </button>
              <button onClick={async () => {
                const reason = window.prompt("수정을 요청하시는 사유를 상세히 입력해 주세요.\n입력 시 사장님에게 실시간으로 알림이 전송됩니다.");
                if (reason === null) return;
                if (!reason.trim()) { alert("수정 요청 사유를 입력하셔야 합니다."); return; }
                
                const { error } = await supabase.from("payslips")
                  .update({ status: "correction_requested", correction_reason: reason })
                  .eq("id", existingPayslip.id);
                if (error) { showToast("수정 요청 오류: " + error.message, "error"); return; }
                setExistingPayslip((p: any) => ({ ...p, status: "correction_requested", correction_reason: reason }));
                showToast("✏️ 사장님께 수정 요청을 보냈습니다.", "info");

                // 사장님에게 채팅 알림 전송
                if (member?.match_id) {
                  await fetch("/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      matchId: member.match_id,
                      senderId: user.id,
                      receiverId: member.employer_id,
                      message: `⚠️ [급여 명세서 수정 요청]\n${year}년 ${month}월 급여 명세서에 대한 수정 요청이 도착했습니다.\n\n사유: ${reason}`,
                      messageType: "system",
                    }),
                  }).catch(() => {});
                }
              }}
                style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:14, padding:14, color:"var(--text-muted)", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                ✏️ 수정 요청
              </button>
            </div>
          )
        )}
        {isWorker && !isEmployer && !existingPayslip && (
          <p style={{ fontSize:13, color:"var(--text-muted)", textAlign:"center", padding:"16px 0" }}>
            사장님이 급여 명세서를 발행하면 여기서 확인할 수 있어요
          </p>
        )}
      </div>
      {/* 토스트 알림 */}
      {toast && (
        <div style={{ position:"fixed", bottom:100, left:"50%", transform:"translateX(-50%)", zIndex:999,
          background: toast.type==="error" ? "#ef4444" : toast.type==="info" ? "#3b82f6" : "#10b981",
          color:"#fff", borderRadius:12, padding:"12px 20px", fontSize:13, fontWeight:600,
          boxShadow:"0 4px 20px rgba(0,0,0,0.3)", maxWidth:320, textAlign:"center" as const }}>
          {toast.msg}
        </div>
      )}
    </main>
  );
}

export default function PayslipPage() {
  return (
    <Suspense fallback={<div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}><p style={{ color:"var(--text-muted)" }}>로딩 중...</p></div>}>
      <PayslipContent />
    </Suspense>
  );
}
