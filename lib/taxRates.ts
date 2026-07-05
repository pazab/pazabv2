import { createBrowserClient } from "@supabase/ssr";

export interface TaxRates {
  year: number;
  health_insurance_rate: number;   // 근로자 부담 %
  employment_insurance_rate: number;
  national_pension_rate: number;
  industrial_accident_rate: number;
}

let cachedRates: Record<number, TaxRates> = {};

export async function getTaxRates(year?: number): Promise<TaxRates> {
  const y = year ?? new Date().getFullYear();
  if (cachedRates[y]) return cachedRates[y];

  const defaultRates: TaxRates = {
    year: y,
    health_insurance_rate: 3.545,
    employment_insurance_rate: 0.9,
    national_pension_rate: 4.5,
    industrial_accident_rate: 0,
  };

  try {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase
      .from("tax_rates")
      .select("*")
      .lte("year", y)
      .order("year", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("Error fetching tax rates, using fallback:", error);
      return defaultRates;
    }

    const rates: TaxRates = data ?? defaultRates;
    cachedRates[y] = rates;
    return rates;
  } catch (err) {
    console.warn("Exception fetching tax rates, using fallback:", err);
    return defaultRates;
  }
}

// 캐시 무효화 (admin에서 업데이트 후 호출)
export function invalidateTaxRatesCache() {
  cachedRates = {};
}

// ──────────────────────────────────────────
// 일용근로소득세 계산 (plan.md 확정 공식)
// ──────────────────────────────────────────

export interface DailyWorkerTax {
  grossPay: number;       // 일급
  incomeTax: number;      // 소득세
  localTax: number;       // 지방소득세
  totalTax: number;       // 합계
  netPay: number;         // 실수령액
}

export function calcDailyWorkerTax(dailyPay: number): DailyWorkerTax {
  const taxable = Math.max(0, dailyPay - 150_000);
  const rawTax = taxable * 0.06 * 0.45;
  // 소액부징수: 소득세 1,000원 미만이면 0
  const incomeTax = rawTax < 1_000 ? 0 : Math.floor(rawTax);
  const localTax = Math.floor(incomeTax * 0.1);
  const totalTax = incomeTax + localTax;
  return {
    grossPay: dailyPay,
    incomeTax,
    localTax,
    totalTax,
    netPay: dailyPay - totalTax,
  };
}

// ──────────────────────────────────────────
// 4대보험 가입 자격 판정
// ──────────────────────────────────────────

export interface InsuranceEligibility {
  // 고용보험: 월 소정근로시간 60시간 이상 or 1개월 이상
  employment: boolean;
  // 국민연금: 월 60시간 이상 (일용직 제외)
  nationalPension: boolean;
  // 건강보험: 월 60시간 이상
  healthInsurance: boolean;
  // 산재보험: 무조건 가입 (사용자 부담)
  industrialAccident: true;
}

export function calcInsuranceEligibility(params: {
  monthlyHours: number;   // 월 소정근로시간
  contractMonths: number; // 계약기간(월), 0 = 기간제한없음
  isDailyWorker: boolean; // 일용직 여부
}): InsuranceEligibility {
  const { monthlyHours, contractMonths, isDailyWorker } = params;
  const over60h = monthlyHours >= 60;
  const over1month = contractMonths === 0 || contractMonths >= 1;

  return {
    employment: over60h && over1month,
    nationalPension: over60h && !isDailyWorker,
    healthInsurance: over60h && !isDailyWorker,
    industrialAccident: true,
  };
}

// ──────────────────────────────────────────
// 4대보험 공제액 계산 (근로자 부담분)
// ──────────────────────────────────────────

export interface InsuranceDeduction {
  health: number;
  employment: number;
  nationalPension: number;
  total: number;
}

export function calcInsuranceDeduction(
  monthlyPay: number,
  rates: TaxRates,
  eligibility: InsuranceEligibility
): InsuranceDeduction {
  const health = eligibility.healthInsurance
    ? Math.floor(monthlyPay * (rates.health_insurance_rate / 100))
    : 0;
  const employment = eligibility.employment
    ? Math.floor(monthlyPay * (rates.employment_insurance_rate / 100))
    : 0;
  const nationalPension = eligibility.nationalPension
    ? Math.floor(monthlyPay * (rates.national_pension_rate / 100))
    : 0;
  return { health, employment, nationalPension, total: health + employment + nationalPension };
}
