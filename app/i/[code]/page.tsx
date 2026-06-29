'use client'
/**
 * app/i/[code]/page.tsx — STEP 4: 알바생 초대 수락 공개 라우트
 * 1탭 카카오 로그인 → team_members 연결 → Tier1 승격
 */
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { markVerified } from '@/lib/verification'
import { promoteProfile } from '@/lib/onboarding'

interface InviteInfo {
  id: string
  employer_id: string
  team_member_id: string | null
  role: string
  expires_at: string | null
  used_at: string | null
  employer?: {
    nickname: string
    employer_profiles: { business_name: string }[] | null
  }
  team_member?: {
    nickname: string
  }
}

export default function InviteAcceptPage() {
  const router = useRouter()
  const params = useParams()
  const code = params.code as string

  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    loadInvite()
  }, [code])

  const loadInvite = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('invite_codes')
        .select(`
          *,
          employer:employer_id(
            nickname,
            employer_profiles(business_name)
          ),
          team_member:team_member_id(nickname)
        `)
        .eq('code', code)
        .single()

      if (error || !data) {
        setError('유효하지 않은 초대 링크예요')
        return
      }

      // 만료 체크
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setError('만료된 초대 링크예요')
        return
      }

      // 사용됨 체크
      if (data.used_at) {
        setError('이미 사용된 초대 링크예요')
        return
      }

      setInvite(data as InviteInfo)
    } catch {
      setError('초대 정보를 불러올 수 없어요')
    } finally {
      setLoading(false)
    }
  }

  const handleKakaoLogin = async () => {
    sessionStorage.setItem('invite_redirect', `/i/${code}`)
    await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/i/${code}`,
      },
    })
  }

  const handleAccept = async () => {
    if (!invite) return
    setAccepting(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        handleKakaoLogin()
        return
      }

      // 1. team_members 연결 (worker_id 채우기)
      if (invite.team_member_id) {
        await supabase.from('team_members').update({
          worker_id: user.id,
          invite_status: 'joined',
          updated_at: new Date().toISOString(),
        }).eq('id', invite.team_member_id)
      }

      // 2. invite_codes 사용 처리
      await supabase.from('invite_codes').update({
        used_at: new Date().toISOString(),
      }).eq('code', code)

      // 3. worker 역할 확정 + 프로필 생성
      const { data: userData } = await supabase
        .from('users')
        .select('onboarded, user_type')
        .eq('id', user.id)
        .single()

      if (!userData?.onboarded) {
        await promoteProfile(supabase, user.id, 'worker')
        await supabase.from('users').update({
          onboarded: true,
          user_type: 'worker',
        }).eq('id', user.id)
      } else if (!userData?.user_type) {
        await supabase.from('users').update({ user_type: 'worker' }).eq('id', user.id)
      }

      // 4. Tier1 검증 승격 (team_history)
      await markVerified(supabase, user.id, 'team_history')

      setDone(true)

      // 5. myteam으로 이동
      setTimeout(() => router.push('/myteam'), 1500)
    } catch (e) {
      console.error(e)
      setError('수락 처리 중 오류가 발생했어요. 다시 시도해주세요.')
    } finally {
      setAccepting(false)
    }
  }

  // 상태별 렌더
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 animate-pulse">초대 정보 확인 중...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-5xl mb-4">😕</div>
          <h1 className="text-lg font-bold text-gray-800 mb-2">{error}</h1>
          <a href="/" className="text-blue-500 text-sm underline">홈으로</a>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-lg font-bold text-gray-800 mb-2">연결 완료!</h1>
          <p className="text-gray-500 text-sm">근무정보로 이동할게요...</p>
        </div>
      </div>
    )
  }

  const storeName =
    (invite?.employer as { employer_profiles?: { business_name: string }[] } | undefined)
      ?.employer_profiles?.[0]?.business_name ?? '가게'
  const employerNick =
    (invite?.employer as { nickname?: string } | undefined)?.nickname ?? '사장님'
  const workerNick = invite?.team_member?.nickname ?? '님'

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* 초대 카드 */}
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center mb-6">
          <div className="text-5xl mb-4">🙌</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {storeName}이<br />
            {workerNick}을(를) 초대했어요
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            근태·급여를 앱으로 받아보세요
          </p>

          {/* 사장님 정보 */}
          <div className="bg-gray-50 rounded-xl p-4 text-left mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-lg">🏪</div>
              <div>
                <p className="font-semibold text-gray-800">{storeName}</p>
                <p className="text-sm text-gray-500">{employerNick}</p>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-red-500 text-sm bg-red-50 rounded-lg py-2 px-3 mb-4">{error}</p>
          )}

          {/* 로그인 여부에 따른 CTA */}
          <button
            id="invite-accept-btn"
            onClick={handleAccept}
            disabled={accepting}
            className="w-full py-4 bg-yellow-400 hover:bg-yellow-500 disabled:opacity-60 text-gray-900 font-bold text-base rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {accepting ? '처리 중...' : (
              <>
                <span className="text-xl">🗨️</span>
                카카오로 1탭 수락하기
              </>
            )}
          </button>
        </div>

        <p className="text-center text-gray-400 text-xs">
          파잡 — 알바 근태·급여 관리
        </p>
      </div>
    </div>
  )
}
