/**
 * lib/verification.ts — STEP 2·3: Tier 판정 + is_verified 갱신
 */
import { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// Tier 타입 (결정 4)
// ============================================================
export type VerifyTier = 'verified' | 'new'
export type VerifyReason = 'team_history' | 'attendance' | 'bank_verified'

// ============================================================
// getTier — is_verified 기반 Tier 판정
// ============================================================
export function getTier(w: {
  is_verified?: boolean
  verified_reason?: string | null
}): VerifyTier {
  return w.is_verified ? 'verified' : 'new'
}

// ============================================================
// markVerified — 검증 신호 발생 시 호출
//   - team_history: 초대 수락 완료 (invite_status='joined')
//   - attendance: 첫 출근 기록
//   - bank_verified: 계좌 실명인증 완료
// ============================================================
export async function markVerified(
  supabase: SupabaseClient,
  workerUserId: string,
  reason: VerifyReason
): Promise<void> {
  await supabase
    .from('worker_profiles')
    .update({
      is_verified: true,
      verified_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', workerUserId)
}

// ============================================================
// checkBankVerified — 사장님/알바생 계좌인증 상태 확인
// ============================================================
export async function checkBankVerified(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('users')
    .select('bank_verified')
    .eq('id', userId)
    .single()
  return data?.bank_verified ?? false
}

// ============================================================
// Tier 뱃지 정보 (UI 표시용)
// ============================================================
export const TIER_BADGE = {
  verified: { emoji: '✅', label: '검증', color: 'text-green-600', bg: 'bg-green-50' },
  new:      { emoji: '🔵', label: '신규', color: 'text-blue-600',  bg: 'bg-blue-50' },
} as const
