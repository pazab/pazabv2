/**
 * lib/daetaSettlement.ts — 대타 정산 공통 계산
 * 사용처: app/api/daeta/complete(근무 완료 정산), app/api/daeta/cancel(출근 후 중도취소 시 실근무 정산)
 * 두 곳에서 같은 시급/초과근무 계산 로직이 어긋나면 같은 근무에도 다른 금액이 나올 수 있어 공용화했다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOvertimePremiumMultiplier, parseWorkHoursRange } from "@/lib/utils";
import { calcDailyWorkerTax } from "@/lib/taxRates";

export interface TaxResult {
  incomeTax: number;
  localTax: number;
  totalDeductions: number;
  netPay: number;
}

/**
 * 일용근로소득세 — 팀원 정규 일급 정산(app/api/cron/payslip)과 동일하게 "하루 단위"로 계산해서
 * 합산한다(일당 15만원 초과분에만 과세되는 구조라 여러 날치 총액에 한 번에 적용하면 틀림).
 * 대타 정산엔 지금까지 이 계산이 아예 없어서 늘 세전 금액만 지급 처리되고 있었음.
 */
export function calcDailyTaxForPeriod(totalPay: number, days: number): TaxResult {
  const safeDays = Math.max(1, days);
  const perDay = totalPay / safeDays;
  let incomeTax = 0;
  let localTax = 0;
  for (let i = 0; i < safeDays; i++) {
    const t = calcDailyWorkerTax(Math.round(perDay));
    incomeTax += t.incomeTax;
    localTax += t.localTax;
  }
  const totalDeductions = incomeTax + localTax;
  return { incomeTax, localTax, totalDeductions, netPay: totalPay - totalDeductions };
}

export interface SettlementResult {
  scheduledTotal: number;
  overtimeHours: number;
  regularHours: number;
  basePay: number;
  overtimePay: number;
  totalPay: number;
}

/** 상시근로자 5인 이상 여부(연장근로 가산수당 의무 대상 판정) — 매장 프로필에 없으면 안전하게 5인 이상으로 간주 */
export async function getIs5OrMore(sb: SupabaseClient, employerProfileId: string | null | undefined): Promise<boolean> {
  if (!employerProfileId) return true;
  const { data } = await sb.from("employer_profiles").select("is_5_or_more_employees").eq("id", employerProfileId).maybeSingle();
  return data?.is_5_or_more_employees !== false;
}

/**
 * 다일치(기간) 대타가 중도 종료(노쇼 확정 등)될 때, 이미 완료(출근+퇴근 기록 있음)한 날짜들은
 * 반드시 정산하고 넘어간다 — daeta_daily_attendance 기준. 완료된 날이 없으면 null 반환.
 */
export async function settlePriorDailyAttendance(
  sb: SupabaseClient,
  match: { id: string; employer_id: string; worker_id: string; employer_profile_id?: string | null },
  posting: { wage: number; work_hours: string | null | undefined },
  excludeDate?: string
): Promise<{ totalHours: number; totalPay: number; netPay: number; days: number } | null> {
  const { data: rows } = await sb
    .from("daeta_daily_attendance")
    .select("work_date, checked_in_at, checked_out_at")
    .eq("match_id", match.id)
    .not("checked_in_at", "is", null)
    .not("checked_out_at", "is", null);

  const completed = (rows || []).filter((r: { work_date: string }) => r.work_date !== excludeDate);
  if (completed.length === 0) return null;

  let totalHours = 0;
  completed.forEach((r: { checked_in_at: string; checked_out_at: string }) => {
    const ms = new Date(r.checked_out_at).getTime() - new Date(r.checked_in_at).getTime();
    totalHours += Math.max(0, ms / 3600000);
  });
  totalHours = Math.round(totalHours * 10) / 10;
  if (totalHours <= 0) return null;

  const scheduledHoursPerDay = parseWorkHoursRange(posting.work_hours) ?? 6;
  const is5OrMore = await getIs5OrMore(sb, match.employer_profile_id);
  const { overtimeHours, basePay, overtimePay, totalPay } =
    calcSettlementPay(posting.wage, scheduledHoursPerDay, completed.length, totalHours, is5OrMore);
  const { incomeTax, localTax, totalDeductions, netPay } = calcDailyTaxForPeriod(totalPay, completed.length);

  const now = new Date();
  await sb.from("payslips").insert({
    employer_id: match.employer_id,
    worker_id: match.worker_id,
    match_id: match.id,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    wage: posting.wage,
    total_hours: totalHours,
    overtime_hours: overtimeHours,
    base_pay: basePay,
    overtime_pay: overtimePay,
    total_pay: totalPay,
    income_tax: incomeTax,
    local_tax: localTax,
    total_deductions: totalDeductions,
    deductions: totalDeductions,
    net_pay: netPay,
    status: "issued",
    issued_at: now.toISOString(),
    memo: `다일치 대타 중도 종료 — 이미 완료한 ${completed.length}일치 자동 정산`,
    attendance_data: { completed_days: completed.length, settled_hours: totalHours, mid_termination: true },
  });

  return { totalHours, totalPay, netPay, days: completed.length };
}

export function calcSettlementPay(
  wage: number,
  scheduledHoursPerDay: number,
  days: number,
  totalHours: number,
  is5OrMore: boolean
): SettlementResult {
  const scheduledTotal = scheduledHoursPerDay * days;
  const overtimeHours = Math.max(0, Math.round((totalHours - scheduledTotal) * 10) / 10);
  const regularHours = totalHours - overtimeHours;
  const overtimeMultiplier = getOvertimePremiumMultiplier(is5OrMore);
  const basePay = Math.round(regularHours * wage);
  const overtimePay = Math.round(overtimeHours * wage * overtimeMultiplier);
  return { scheduledTotal, overtimeHours, regularHours, basePay, overtimePay, totalPay: basePay + overtimePay };
}
