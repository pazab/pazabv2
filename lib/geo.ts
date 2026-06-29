/**
 * lib/geo.ts — STEP 6: 좌표/거리/지역 매칭 유틸
 */

// ============================================================
// Haversine 거리 계산 (km)
// ============================================================
const rad = (d: number) => (d * Math.PI) / 180

export function haversine(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

// ============================================================
// 지역 매칭 레벨 (3단계)
// ============================================================
export type RegionLevel = 'same-dong' | 'same-gu' | 'same-sido' | 'other'

/**
 * 두 region 문자열('충남 아산시 신창면')의 매칭 레벨 반환
 * 매칭 가중치:
 *   same-dong  (읍면동) → +12점
 *   same-gu    (구/군)  → +4점
 *   same-sido  (시도)   → 0점
 *   other               → -15점
 */
export function getRegionMatchLevel(a: string, b: string): RegionLevel {
  if (!a || !b) return 'other'
  const pa = a.trim().split(/\s+/)
  const pb = b.trim().split(/\s+/)

  if (pa.length >= 3 && pb.length >= 3 && pa[2] === pb[2] && pa[1] === pb[1]) return 'same-dong'
  if (pa.length >= 2 && pb.length >= 2 && pa[1] === pb[1] && pa[0] === pb[0]) return 'same-gu'
  if (pa[0] === pb[0]) return 'same-sido'
  return 'other'
}

export function regionScore(level: RegionLevel): number {
  return { 'same-dong': 12, 'same-gu': 4, 'same-sido': 0, 'other': -15 }[level]
}

// ============================================================
// 거리 표시 포맷
// ============================================================
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`
  return `${km.toFixed(1)}km`
}
