export type 스도쿠등급타입 = '브론즈' | '실버' | '골드' | '다이아' | '마스터'

export const 스도쿠등급기준: Record<스도쿠등급타입, number> = {
  브론즈: 0, 실버: 800, 골드: 1200, 다이아: 1600, 마스터: 2000,
}

export const 스도쿠등급아이콘: Record<스도쿠등급타입, string> = {
  브론즈: '🥉', 실버: '🥈', 골드: '🥇', 다이아: '💎', 마스터: '👑',
}

export const 스도쿠등급색: Record<스도쿠등급타입, string> = {
  브론즈: '#CD7F32', 실버: '#9E9E9E', 골드: '#FFB300', 다이아: '#00B4D8', 마스터: '#a78bfa',
}

export function 레이팅to스도쿠등급(rating: number): 스도쿠등급타입 {
  if (rating >= 2000) return '마스터'
  if (rating >= 1600) return '다이아'
  if (rating >= 1200) return '골드'
  if (rating >= 800) return '실버'
  return '브론즈'
}

export function 스도쿠레이팅변화(내레이팅: number, 상대레이팅: number, 결과: '승' | '패' | '무'): number {
  const K = 32
  const 기대값 = 1 / (1 + Math.pow(10, (상대레이팅 - 내레이팅) / 400))
  const 실제값 = 결과 === '승' ? 1 : 결과 === '무' ? 0.5 : 0
  return Math.round(K * (실제값 - 기대값))
}

const 순위별변화표: Record<number, number[]> = {
  2: [20, -20],
  3: [25, 0, -25],
  4: [30, 10, -10, -30],
}

export function 순위레이팅변화(순위: number, 총인원: number, 포기 = false): number {
  const 표 = 순위별변화표[총인원] ?? 순위별변화표[2]
  if (포기) return (표[표.length - 1] ?? -20) - 10
  return 표[순위 - 1] ?? 표[표.length - 1]
}
