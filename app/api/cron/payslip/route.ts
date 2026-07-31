import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/notify";
import { getTaxRates, calcDailyWorkerTax, calcInsuranceEligibility, calcInsuranceDeduction } from "@/lib/taxRates";

// service_role 클라이언트 생성
const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// 해당 월의 마지막 날 구하기
const isLastDayOfMonth = (year: number, month: number, day: number) => {
  const nextDay = new Date(year, month - 1, day + 1);
  return nextDay.getMonth() !== month - 1;
};

// 약정 근무일수 카운트
const getScheduledDaysInMonth = (year: number, month: number, workDaysStr: string) => {
  if (!workDaysStr) return 0;
  const DAYS_MAP: Record<string, number> = { "일": 0, "월": 1, "화": 2, "수": 3, "목": 4, "금": 5, "토": 6 };
  const activeDays = Object.keys(DAYS_MAP).filter(d => workDaysStr.includes(d)).map(d => DAYS_MAP[d]);
  if (activeDays.length === 0) return 0;
  
  const lastDay = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= lastDay; d++) {
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    if (activeDays.includes(dayOfWeek)) count++;
  }
  return count;
};

export async function GET(req: Request) {
  // Vercel Cron은 Authorization: Bearer <CRON_SECRET> 헤더를 자동으로 전송함
  if (process.env.NODE_ENV === "production") {
    const auth = (req as any).headers?.get?.("authorization") || "";
    const cronSecret = process.env.CRON_SECRET || "";
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = getServiceClient();

  // KST 현재 시간
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  
  const todayYear = kst.getUTCFullYear();
  const todayMonth = kst.getUTCMonth() + 1;
  const todayDay = kst.getUTCDate();

  // 1. 자동 발행 활성화된 active 직원 정보 로드
  const { data: members, error: memError } = await supabase
    .from("team_members")
    .select("*")
    .eq("status", "active")
    .eq("payslip_auto_issue", true);

  if (memError) {
    return NextResponse.json({ error: memError.message }, { status: 500 });
  }

  if (!members || members.length === 0) {
    return NextResponse.json({ message: "No active auto-issue members found" });
  }

  const results: any[] = [];

  for (const m of members) {
    try {
      // 최신 근로계약서 로드
      const { data: contract } = await supabase.from("contracts")
        .select("*")
        .eq("team_member_id", m.id)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const cd = contract?.contract_data;

      // 급여 지급일 (D) 판단
      const payday = cd?.payDay || String(m.payslip_payday_fallback ?? 10);
      const offset = m.payslip_auto_issue_offset ?? 0;

      // 오늘 날짜에서 오프셋(offset)일을 더한 시점 구하기
      const targetKst = new Date(kst.getTime() + offset * 24 * 60 * 60 * 1000);
      const targetYear = targetKst.getUTCFullYear();
      const targetMonth = targetKst.getUTCMonth() + 1;
      const targetDay = targetKst.getUTCDate();

      let isMatch = false;
      if (payday === "말일") {
        isMatch = isLastDayOfMonth(targetYear, targetMonth, targetDay);
      } else {
        const paydayDay = parseInt(payday);
        isMatch = !isNaN(paydayDay) && targetDay === paydayDay;
      }

      if (!isMatch) {
        // 지급일에 매칭되지 않음
        continue;
      }

      // 정산 대상 연/월 계산
      // 지급일 D가 1~20일 사이면 전월(M-1), 21~말일이면 당월(M)
      let calcYear = targetYear;
      let calcMonth = targetMonth;

      const isFirstHalf = payday !== "말일" && parseInt(payday) <= 20;
      if (isFirstHalf) {
        calcMonth = targetMonth - 1;
        if (calcMonth === 0) {
          calcMonth = 12;
          calcYear = targetYear - 1;
        }
      }

      const startStr = `${calcYear}-${String(calcMonth).padStart(2, "0")}-01`;
      const lastDayVal = new Date(calcYear, calcMonth, 0).getDate();
      const endStr = `${calcYear}-${String(calcMonth).padStart(2, "0")}-${String(lastDayVal).padStart(2, "0")}`;

      // 중복 발행 체크
      const { data: dup } = await supabase.from("payslips")
        .select("id")
        .eq("team_member_id", m.id)
        .eq("year", calcYear)
        .eq("month", calcMonth)
        .limit(1)
        .maybeSingle();

      if (dup) {
        results.push({ memberId: m.id, action: "skip_duplicate", year: calcYear, month: calcMonth });
        continue;
      }

      // 정산 기간 근태 기록 로드
      const { data: attendance } = await supabase.from("attendance")
        .select("work_date, status, actual_hours, check_in, check_out")
        .eq("team_member_id", m.id)
        .gte("work_date", startStr)
        .lte("work_date", endStr)
        .order("work_date", { ascending: true });

      const workDays = (attendance || []).filter(a => ["normal", "late", "early_leave"].includes(a.status));
      
      if (workDays.length === 0) {
        // 대상 월 근태가 없으면 스킵
        results.push({ memberId: m.id, action: "skip_no_attendance", year: calcYear, month: calcMonth });
        continue;
      }

      // 임금 정보
      let wage = m.wage || 0;
      let wageType = "hourly";
      if (contract) {
        if (cd?.wage) wage = parseInt(String(cd.wage).replace(/,/g, ""));
        else if (contract.wage) wage = contract.wage;

        if (contract.wage_type) {
          wageType = contract.wage_type;
        } else if (cd?.wageType) {
          wageType = cd.wageType === "month" ? "monthly" : cd.wageType === "day" ? "daily" : "hourly";
        }
      }

      if (!wage) {
        results.push({ memberId: m.id, action: "skip_no_wage", error: "No wage settings found" });
        continue;
      }

      // 소정 근로시간 파싱
      let contractHours = 8;
      if (cd?.dailyHours) {
        contractHours = parseFloat(cd.dailyHours) || 8;
      } else if (m.work_hours) {
        const hMatch = m.work_hours.match(/\b(\d+(\.\d+)?)\b/);
        if (hMatch) contractHours = parseFloat(hMatch[1]) || 8;
      }

      const totalHours = workDays.reduce((s, a) => s + (a.actual_hours || contractHours), 0);
      const overtimeHours = Math.max(0, totalHours - workDays.length * contractHours);

      // 세전 급여 계산
      let basePay = 0;
      let overtimePay = 0;

      if (wageType === "monthly") {
        const workDaysStr = cd?.workDaysText || m.work_days || "";
        const scheduledDays = getScheduledDaysInMonth(calcYear, calcMonth, workDaysStr);
        const dailyRate = scheduledDays > 0 ? wage / scheduledDays : 0;
        basePay = Math.round(dailyRate * workDays.length);
        overtimePay = Math.round(overtimeHours * (wage / 209) * 1.5);
      } else if (wageType === "daily") {
        basePay = Math.round(wage * workDays.length);
        const hourlyEquiv = contractHours > 0 ? wage / contractHours : 0;
        overtimePay = Math.round(overtimeHours * hourlyEquiv * 1.5);
      } else {
        // hourly
        basePay = Math.round((totalHours - overtimeHours) * wage);
        overtimePay = Math.round(overtimeHours * wage * 1.5);
      }

      const totalPay = basePay + overtimePay;

      // 공제액 및 실수령액 계산
      const calcType = wageType === "daily" ? "daily" : "regular";
      const taxRates = await getTaxRates(calcYear);

      let currentIncomeTax = 0;
      let currentLocalTax = 0;
      let currentHealthIns = 0;
      let currentEmploymentIns = 0;
      let currentNationalPension = 0;

      if (calcType === "daily") {
        workDays.forEach(a => {
          const dailyHours = a.actual_hours || contractHours;
          const dailyOvertime = Math.max(0, dailyHours - contractHours);
          const hourlyEquiv = contractHours > 0 ? wage / contractHours : 0;
          const dailyPay = Math.round(wage + dailyOvertime * hourlyEquiv * 1.5);
          const tax = calcDailyWorkerTax(dailyPay);
          currentIncomeTax += tax.incomeTax;
          currentLocalTax += tax.localTax;
        });
      } else {
        if (taxRates) {
          const eligibility = calcInsuranceEligibility({
            monthlyHours: totalHours,
            contractMonths: 0,
            isDailyWorker: false
          });
          const ins = calcInsuranceDeduction(totalPay, taxRates, eligibility);
          
          // 계약서의 보험 가입 여부 확인 (기본값 true)
          const insPension = cd?.insPension !== false;
          const insHealth = cd?.insHealth !== false;
          const insEmp = cd?.insEmp !== false;

          currentNationalPension = insPension ? ins.nationalPension : 0;
          currentHealthIns = insHealth ? ins.health : 0;
          currentEmploymentIns = insEmp ? ins.employment : 0;
        }
      }

      const totalDeductions = calcType === "daily"
        ? (currentIncomeTax + currentLocalTax)
        : (currentHealthIns + currentEmploymentIns + currentNationalPension);

      const netPay = totalPay - totalDeductions;

      // 명세서 등록
      const payload = {
        employer_id: m.employer_id,
        worker_id: m.worker_id,
        team_member_id: m.id,
        match_id: m.match_id,
        year: calcYear,
        month: calcMonth,
        wage,
        total_hours: totalHours,
        overtime_hours: overtimeHours,
        base_pay: basePay,
        overtime_pay: overtimePay,
        total_pay: totalPay,
        work_days: workDays.length,
        attendance_data: attendance,
        memo: "시스템 스케줄러 자동 발행",
        status: "issued",
        issued_at: new Date().toISOString(),
        confirmed_at: null,
        correction_reason: null,

        pay_period_start: startStr,
        pay_period_end: endStr,
        deductions: totalDeductions,

        income_tax: currentIncomeTax,
        local_tax: currentLocalTax,
        health_insurance: currentHealthIns,
        employment_insurance: currentEmploymentIns,
        national_pension: currentNationalPension,
        total_deductions: totalDeductions,
        net_pay: netPay,
      };

      const { data: savedPayslip, error: saveErr } = await supabase
        .from("payslips")
        .insert(payload)
        .select("id")
        .single();

      if (saveErr) {
        console.error("Auto payslip save error for member:", m.id, saveErr);
        results.push({ memberId: m.id, action: "failed_to_save", error: saveErr.message });
        continue;
      }

      // 앱 내 알림 생성
      await createNotification({
        userId: m.worker_id,
        type: "payslip",
        title: "📋 임금 명세서 자동 발행 안내",
        body: `${calcYear}년 ${calcMonth}월 임금 명세서가 자동으로 발행되었습니다. 실수령액: ${netPay.toLocaleString()}원`,
        url: "/myteam"
      });

      // 채팅방 메시지 발송
      if (m.match_id) {
        const chatMsg = `📋 ${calcYear}년 ${calcMonth}월 임금 명세서가 자동으로 발행됐어요!\n\n💰 실수령액: ${netPay.toLocaleString()}원\n(총 지급액: ${totalPay.toLocaleString()}원 · 공제액: ${totalDeductions.toLocaleString()}원)\n⏱ 총 근무: ${totalHours.toFixed(1)}시간 (${workDays.length}일)\n\n명세서를 확인해주세요.`;
        
        await supabase.from("chats").insert({
          match_id: m.match_id,
          sender_id: m.employer_id,
          receiver_id: m.worker_id,
          message: chatMsg,
          message_type: "system",
          is_read: false
        });

        await supabase.from("matches")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", m.match_id);
      }

      results.push({ memberId: m.id, action: "auto_issue_success", payslipId: savedPayslip.id, year: calcYear, month: calcMonth });

    } catch (e: any) {
      console.error("Auto payslip process error for member:", m.id, e);
      results.push({ memberId: m.id, action: "error", error: e.message });
    }
  }

  return NextResponse.json({ message: "Auto payslip cron process completed", results });
}
