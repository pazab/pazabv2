/**
 * lib/onboarding.ts — STEP 1 온보딩 핵심 유틸
 * - inferRole: 행동 신호로 역할 잠정 추론
 * - resolveAddress: 주소 → 좌표 + region 3단계 (Kakao Local API)
 * - promoteProfile: onboarding_data → 정식 프로필 승격
 */
import { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// 타입 정의
// ============================================================
export type InferSignal =
  | 'manage_store'           // 가게 관리 탭
  | 'post_job'               // 공고 올리기 시도
  | 'daeta_sos_employer'     // 대타 구하기 (사장님 관점)
  | 'personality_card'       // 성향카드 탭
  | 'browse_jobs'            // 공고 탐색
  | 'lovecall_worker'        // 공고에 러브콜

export type UserRole = 'employer' | 'worker'

export interface AddressResult {
  lat: number
  lng: number
  region: string           // '충남 아산시 신창면' (전체)
  sido: string             // '충남'
  sigungu: string          // '아산시'
  eupmyeondong: string     // '신창면'
  address: string          // 원본 주소 문자열
}

export interface OnboardingData {
  region: string
  lat: number
  lng: number
  sido: string
  sigungu: string
  eupmyeondong: string
  industries: string[]     // ['카페', '편의점']
  availability: 'weekday' | 'weekend' | 'any'
  created_at: string
}

// ============================================================
// 1. inferRole — 행동 신호로 역할 잠정 추론
// ============================================================
const EMPLOYER_SIGNALS: InferSignal[] = [
  'manage_store',
  'post_job',
  'daeta_sos_employer',
]

export function inferRole(signal: InferSignal): UserRole {
  return EMPLOYER_SIGNALS.includes(signal) ? 'employer' : 'worker'
}

// ============================================================
// 2. resolveAddress — 주소 → 좌표 + region 3단계
//    Kakao Local 주소 검색 API 사용
// ============================================================
export async function resolveAddress(query: string): Promise<AddressResult | null> {
  const REST_KEY = process.env.NEXT_PUBLIC_KAKAO_REST_KEY
  if (!REST_KEY) {
    console.error('[resolveAddress] NEXT_PUBLIC_KAKAO_REST_KEY missing')
    return null
  }

  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}&size=1`,
      { headers: { Authorization: `KakaoAK ${REST_KEY}` } }
    )
    const data = await res.json()

    if (data.documents?.length > 0) {
      const doc = data.documents[0]
      const addr = doc.road_address || doc.address
      if (!addr) return null

      const lat = parseFloat(doc.y)
      const lng = parseFloat(doc.x)
      const sido = addr.region_1depth_name || ''
      const sigungu = addr.region_2depth_name || ''
      const eupmyeondong = addr.region_3depth_name || addr.region_3depth_h_name || ''

      return {
        lat, lng, sido, sigungu, eupmyeondong,
        region: [sido, sigungu, eupmyeondong].filter(Boolean).join(' '),
        address: query,
      }
    }

    // 주소검색 실패 시 키워드 검색 시도
    const kRes = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=1`,
      { headers: { Authorization: `KakaoAK ${REST_KEY}` } }
    )
    const kData = await kRes.json()
    if (kData.documents?.length > 0) {
      const kDoc = kData.documents[0]
      const lat = parseFloat(kDoc.y)
      const lng = parseFloat(kDoc.x)
      // 키워드 검색은 region 파싱이 제한적 — address_name 파싱
      const parts = kDoc.address_name?.split(' ') || []
      return {
        lat, lng,
        sido: parts[0] || '',
        sigungu: parts[1] || '',
        eupmyeondong: parts[2] || '',
        region: kDoc.address_name || query,
        address: kDoc.address_name || query,
      }
    }

    return null
  } catch (e) {
    console.error('[resolveAddress] error:', e)
    return null
  }
}

// ============================================================
// 3. promoteProfile — onboarding_data → 정식 프로필 승격
//    역할 확정 후 1회 호출
// ============================================================
export async function promoteProfile(
  supabase: SupabaseClient,
  userId: string,
  role: UserRole
): Promise<void> {
  // 1. onboarding_data 읽기
  const { data: userData } = await supabase
    .from('users')
    .select('onboarding_data')
    .eq('id', userId)
    .single()

  const od: OnboardingData | null = userData?.onboarding_data ?? null

  if (role === 'worker') {
    // 알바생 프로필 upsert
    await supabase.from('worker_profiles').upsert({
      user_id: userId,
      job_categories: od?.industries ?? [],
      available_days: availabilityToDays(od?.availability),
      region: od?.region ?? null,
      sido: od?.sido ?? null,
      sigungu: od?.sigungu ?? null,
      eupmyeondong: od?.eupmyeondong ?? null,
      lat: od?.lat ?? null,
      lng: od?.lng ?? null,
      is_active: true,
    }, { onConflict: 'user_id' })
  } else {
    // 사장님 프로필 upsert
    await supabase.from('employer_profiles').upsert({
      user_id: userId,
      business_type: od?.industries?.[0] ?? null,
      region: od?.region ?? null,
      sido: od?.sido ?? null,
      sigungu: od?.sigungu ?? null,
      eupmyeondong: od?.eupmyeondong ?? null,
      lat: od?.lat ?? null,
      lng: od?.lng ?? null,
      hr_only: true,
      is_active: true,
    }, { onConflict: 'user_id' })
  }

  // 2. user_type 확정 + onboarding_data 유지 (분석용)
  await supabase.from('users').update({
    user_type: role,
    updated_at: new Date().toISOString(),
  }).eq('id', userId)
}

// ============================================================
// 헬퍼
// ============================================================
function availabilityToDays(av?: string): string[] {
  if (av === 'weekday') return ['mon', 'tue', 'wed', 'thu', 'fri']
  if (av === 'weekend') return ['sat', 'sun']
  return ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
}
