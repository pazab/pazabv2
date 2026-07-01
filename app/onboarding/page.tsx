'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function OnboardingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSelect = async (role: 'employer' | 'worker') => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await supabase.auth.getUser()
      const user = data?.user
      if (!user) { router.push('/login'); return }

      const { error: err } = await supabase.from('users').upsert({
        id: user.id,
        user_type: role,
        onboarded: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })

      if (err) throw err

      if (role === 'employer') {
        const { data: existing } = await supabase
          .from('employer_profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()
        if (!existing) {
          await supabase.from('employer_profiles').insert({
            user_id: user.id,
            is_active: false,
          })
        }
      }

      router.push('/')
    } catch (e) {
      setError('저장 중 오류가 발생했어요. 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A0A0A',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* 배경 블롭 */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: 400, height: 400, borderRadius: '50%', background: '#8b5cf6', opacity: 0.1, filter: 'blur(120px)' }} />
        <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: 400, height: 400, borderRadius: '50%', background: '#ec4899', opacity: 0.05, filter: 'blur(100px)' }} />
      </div>

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 10 }}>
        {/* 헤더 */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>👋</div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>어떻게 시작할까요?</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: 0 }}>나중에 설정에서 언제든 바꿀 수 있어요</p>
        </div>

        {/* 역할 선택 버튼 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <button
            onClick={() => handleSelect('employer')}
            disabled={loading}
            style={{
              width: '100%',
              padding: '28px 24px',
              background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(236,72,153,0.1))',
              border: '1.5px solid rgba(124,58,237,0.4)',
              borderRadius: 20,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s',
              opacity: loading ? 0.6 : 1,
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>🏪</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 }}>사장님이에요</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>매장 등록하고 팀원 관리하기</div>
          </button>

          <button
            onClick={() => handleSelect('worker')}
            disabled={loading}
            style={{
              width: '100%',
              padding: '28px 24px',
              background: 'linear-gradient(135deg, rgba(236,72,153,0.1), rgba(124,58,237,0.08))',
              border: '1.5px solid rgba(236,72,153,0.35)',
              borderRadius: 20,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s',
              opacity: loading ? 0.6 : 1,
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>👷</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 }}>알바 찾아요</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>공고 탐색하고 소속 매장 관리하기</div>
          </button>
        </div>

        {loading && (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 20 }}>잠깐만요...</p>
        )}
        {error && (
          <p style={{ textAlign: 'center', color: '#f87171', fontSize: 13, marginTop: 16, background: 'rgba(239,68,68,0.1)', borderRadius: 10, padding: '10px 16px' }}>{error}</p>
        )}
      </div>
    </div>
  )
}
