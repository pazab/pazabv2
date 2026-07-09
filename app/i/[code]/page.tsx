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
  employer_profile_id?: string | null
  team_member_id: string | null
  role: string
  expires_at: string | null
  used_at: string | null
  wage?: number | null
  work_days?: string | null
  work_hours?: string | null
  biz_name?: string | null
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
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then((res) => setIsLoggedIn(!!res.data.user))
  }, [])

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

      // 1. team_members 연결
      if (invite.team_member_id) {
        // 구형: team_member_id 방식
        await supabase.from('team_members').update({
          worker_id: user.id,
          invite_status: 'joined',
          updated_at: new Date().toISOString(),
        }).eq('id', invite.team_member_id)
      } else {
        // 신형: 닉네임 검색 초대 — 직접 insert
        const { data: existing } = await supabase.from('team_members')
          .select('id').eq('employer_id', invite.employer_id).eq('worker_id', user.id).limit(1)
        if (!existing || existing.length === 0) {
          await supabase.from('team_members').insert({
            employer_id: invite.employer_id,
            employer_profile_id: invite.employer_profile_id ?? null,
            worker_id: user.id,
            invite_status: 'joined',
            status: 'active',
            member_role: 'staff',
            wage: invite.wage ?? null,
            work_days: invite.work_days ?? null,
            work_hours: invite.work_hours ?? null,
          })
        } else {
          // 이미 있으면 근무조건 + 매장 연결 업데이트
          await supabase.from('team_members').update({
            employer_profile_id: invite.employer_profile_id ?? null,
            invite_status: 'joined',
            status: 'active',
            wage: invite.wage ?? null,
            work_days: invite.work_days ?? null,
            work_hours: invite.work_hours ?? null,
          }).eq('id', existing[0].id)
        }
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

      const currentType = userData?.user_type;
      const newType = currentType === 'employer' ? 'both'
        : currentType === 'both' ? 'both'
        : 'worker';

      if (!userData?.onboarded) {
        await promoteProfile(supabase, user.id, 'worker')
        await supabase.from('users').update({
          onboarded: true,
          user_type: newType,
        }).eq('id', user.id)
      } else {
        await supabase.from('users').update({ user_type: newType }).eq('id', user.id)
      }

      // 초대로 가입/소속 되었으므로 구직 탐색에서 즉시 제외 및 상태를 hired로 처리
      await supabase.from('worker_profiles').update({
        is_active: false,
        is_public: false,
        job_status: 'hired'
      }).eq('user_id', user.id)

      // 4. Tier1 검증 승격 (team_history)
      await markVerified(supabase, user.id, 'team_history')

      setDone(true)

      // 5. myteam으로 이동
      setTimeout(() => router.replace('/myteam'), 1500)
    } catch (e) {
      console.error(e)
      setError('수락 처리 중 오류가 발생했어요. 다시 시도해주세요.')
    } finally {
      setAccepting(false)
    }
  }

  // 상태별 렌더
  const storeName =
    (invite?.employer as { employer_profiles?: { business_name: string }[] } | undefined)
      ?.employer_profiles?.[0]?.business_name ?? '가게'
  const employerNick =
    (invite?.employer as { nickname?: string } | undefined)?.nickname ?? '사장님'
  const workerNick = invite?.team_member?.nickname ?? '님'

  const centerStyle: React.CSSProperties = {
    minHeight: "100vh", background: "var(--bg)",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20,
  }

  if (loading) return (
    <div style={centerStyle}>
      <p style={{ color: "var(--text-muted)" }}>초대 정보 확인 중...</p>
    </div>
  )

  if (error) return (
    <div style={centerStyle}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
        <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>{error}</p>
        <a href="/" style={{ color: "#8b5cf6", fontSize: 14 }}>홈으로</a>
      </div>
    </div>
  )

  if (done) return (
    <div style={centerStyle}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>연결 완료!</p>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>근무정보로 이동할게요...</p>
      </div>
    </div>
  )

  return (
    <div style={centerStyle}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        {/* 초대 카드 */}
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 20, padding: 28, textAlign: "center", marginBottom: 16,
        }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🙌</div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: "var(--text)", margin: "0 0 8px", lineHeight: 1.4 }}>
            {storeName}에서<br />
            <span style={{ color: "#8b5cf6" }}>@{workerNick}</span>님을 초대했어요
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px" }}>
            근태·급여를 앱으로 받아보세요
          </p>

          {/* 매장 정보 */}
          <div style={{
            background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: 12, padding: "12px 16px", textAlign: "left", marginBottom: 20,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: "rgba(139,92,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <i className="ti ti-building-store" style={{ fontSize: 20, color: "#8b5cf6" }} />
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "var(--text)" }}>{storeName}</p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>@{employerNick}</p>
            </div>
          </div>

          {error && (
            <p style={{ fontSize: 13, color: "#ef4444", background: "rgba(239,68,68,0.08)", borderRadius: 8, padding: "8px 12px", marginBottom: 16 }}>{error}</p>
          )}

          {/* CTA */}
          {isLoggedIn ? (
            <button onClick={handleAccept} disabled={accepting} style={{
              width: "100%", padding: "14px 0", borderRadius: 14, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff",
              fontSize: 15, fontWeight: 700, opacity: accepting ? 0.6 : 1,
            }}>
              {accepting ? '처리 중...' : '✅ 초대 수락하기'}
            </button>
          ) : (
            <button onClick={handleAccept} disabled={accepting} style={{
              width: "100%", padding: "14px 0", borderRadius: 14, border: "none", cursor: "pointer",
              background: "#FEE500", color: "#191919",
              fontSize: 15, fontWeight: 700, opacity: accepting ? 0.6 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              {accepting ? '처리 중...' : <><span style={{ fontSize: 18 }}>🗨️</span> 카카오로 로그인 후 수락하기</>}
            </button>
          )}
        </div>

        <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
          PAZAB — 알바 근태·급여 관리
        </p>
      </div>
    </div>
  )
}
