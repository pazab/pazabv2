// 연도별 최저시급 (고용노동부 고시 기준)
// 매년 8월 발표 → 다음해 1월 1일 적용
// tax_rates DB 구현 후 여기서 읽어오는 방식으로 마이그레이션 예정
const MIN_WAGE_BY_YEAR: Record<number, number> = {
  2024: 9860,
  2025: 10030,
  2026: 10030,
};

export function getMinWage(year?: number): number {
  const y = year ?? new Date().getFullYear();
  // 등록된 연도 없으면 가장 최근 연도 값 사용
  const keys = Object.keys(MIN_WAGE_BY_YEAR).map(Number).sort((a, b) => b - a);
  const match = keys.find(k => k <= y);
  return match ? MIN_WAGE_BY_YEAR[match] : MIN_WAGE_BY_YEAR[keys[keys.length - 1]];
}

export function getCurrentMinWage(): number {
  return getMinWage();
}

// 계약서 작성 시점 기준 — 근무 시작일 연도로 판단
export function getMinWageForDate(dateStr?: string): number {
  if (!dateStr) return getCurrentMinWage();
  const year = new Date(dateStr).getFullYear();
  return getMinWage(year);
}

export function isUnderMinWage(hourlyRate: number, dateStr?: string): boolean {
  return hourlyRate < getMinWageForDate(dateStr);
}
