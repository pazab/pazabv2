import { createBrowserClient } from "@supabase/ssr";

// 연도별 최저시급 폴백 (DB 조회 실패 시 사용)
const FALLBACK_MIN_WAGE: Record<number, number> = {
  2024: 9860,
  2025: 10030,
  2026: 10030,
};

let minWageCache: Record<number, number> = {};

export async function fetchMinWage(year?: number): Promise<number> {
  const y = year ?? new Date().getFullYear();
  if (minWageCache[y]) return minWageCache[y];

  try {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase
      .from("min_wages")
      .select("year, hourly_wage")
      .lte("year", y)
      .order("year", { ascending: false })
      .limit(1)
      .single();

    if (data?.hourly_wage) {
      minWageCache[y] = data.hourly_wage;
      return data.hourly_wage;
    }
  } catch {
    // DB 미연결 등 — 폴백 사용
  }

  return getFallbackMinWage(y);
}

export function invalidateMinWageCache() {
  minWageCache = {};
}

// ── 동기 폴백 (서버컴포넌트나 즉시 필요한 경우) ──

function getFallbackMinWage(year: number): number {
  const keys = Object.keys(FALLBACK_MIN_WAGE).map(Number).sort((a, b) => b - a);
  const match = keys.find(k => k <= year);
  return match ? FALLBACK_MIN_WAGE[match] : FALLBACK_MIN_WAGE[keys[keys.length - 1]];
}

export function getMinWage(year?: number): number {
  return getFallbackMinWage(year ?? new Date().getFullYear());
}

export function getCurrentMinWage(): number {
  return getMinWage();
}

export function getMinWageForDate(dateStr?: string): number {
  if (!dateStr) return getCurrentMinWage();
  return getMinWage(new Date(dateStr).getFullYear());
}

export function isUnderMinWage(hourlyRate: number, dateStr?: string): boolean {
  return hourlyRate < getMinWageForDate(dateStr);
}
