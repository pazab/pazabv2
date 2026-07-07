"use client"

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { 레이팅to스도쿠등급, 스도쿠등급아이콘, 스도쿠등급색 } from './lib/sudokuGrade'
import { 난이도타입, 시간표시 } from './lib/sudoku'
import SudokuGame from './components/SudokuGame'
import SudokuAI from './components/SudokuAI'
import SudokuBattle from './components/SudokuBattle'

const 난이도목록: 난이도타입[] = ['초급', '중급', '고급', '전문가']

function 코드생성() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function SudokuMain() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode')
  const code = searchParams.get('code')
  const searchDifficulty = searchParams.get('d') || '초급'

  const [difficulty, setDifficulty] = useState<난이도타입>(searchDifficulty as 난이도타입)
  const [maxPlayers, setMaxPlayers] = useState(2)
  const [joinCode, setJoinCode] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [loading, setLoading] = useState<'quick' | 'join' | null>(null)
  const [error, setError] = useState('')
  const [bestTimes, setBestTimes] = useState<Record<string, number>>({})
  const [profile, setProfile] = useState<{ uid: string, nickname: string, rating: number } | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const uid = session.user.id
      const [userRes, ratingRes, recordsRes] = await Promise.all([
        supabase.from('users').select('nickname, name').eq('id', uid).single(),
        supabase.from('sudoku_ratings').select('rating, wins, losses').eq('user_id', uid).single(),
        supabase.from('sudoku_records').select('difficulty, time_seconds').eq('user_id', uid).order('time_seconds', { ascending: true }),
      ])
      const nickname = userRes.data?.nickname || userRes.data?.name || session.user.email?.split('@')[0] || '유저'
      setProfile({ uid, nickname, rating: ratingRes.data?.rating || 600 })
      if (recordsRes.data) {
        const best: Record<string, number> = {}
        for (const r of recordsRes.data) {
          if (!best[r.difficulty] || r.time_seconds < best[r.difficulty]) best[r.difficulty] = r.time_seconds
        }
        setBestTimes(best)
      }
    }
    load()
  }, [])

  async function quickMatch() {
    if (!profile) return
    setLoading('quick')
    setError('')
    try {
      const { data: rooms, error: queryError } = await supabase
        .from('sudoku_rooms')
        .select('*')
        .eq('status', '대기중')
        .eq('is_public', true)
        .eq('difficulty', difficulty)
        .eq('max_players', maxPlayers)
        .order('created_at', { ascending: true })

      if (queryError) { setError(`방 검색 실패: ${queryError.message}`); return }

      const now = Date.now()
      const myGrade = 레이팅to스도쿠등급(profile.rating)
      type Room = { created_at: number; participants: Record<string, unknown>; max_players: number; host_id: string; code: string };
      const available = (rooms || []).filter((r: Room) => {
        if (now - r.created_at > 10 * 60 * 1000) return false
        const count = Object.keys(r.participants || {}).length
        return r.participants?.[profile.uid] || count < r.max_players
      })

      const sameGrade = available.find((r: Room) => (r.participants?.[r.host_id] as Record<string, unknown>)?.grade === myGrade && !r.participants?.[profile.uid])
      const target = sameGrade || available.find((r: Room) => !r.participants?.[profile.uid]) || available[0]

      if (target) {
        if (target.participants?.[profile.uid]) { router.push(`/sudoku?code=${target.code}`); return }
        const updated = {
          ...target.participants,
          [profile.uid]: { uid: profile.uid, nickname: profile.nickname, grade: myGrade, rating: profile.rating, ready: false, finished_at: null, rank: null, board: null, errors: [] }
        }
        const { error: joinError } = await supabase.from('sudoku_rooms').update({ participants: updated }).eq('code', target.code).eq('status', '대기중')
        if (!joinError) { router.push(`/sudoku?code=${target.code}`); return }
      }

      // 방 없으면 새로 생성
      let code = 코드생성()
      for (let i = 0; i < 5; i++) {
        const { data: ex } = await supabase.from('sudoku_rooms').select('code').eq('code', code).single()
        if (!ex) break
        code = 코드생성()
      }
      const { error: createError } = await supabase.from('sudoku_rooms').insert({
        code, host_id: profile.uid, status: '대기중', difficulty, max_players: maxPlayers, is_public: true,
        puzzle: null, answer: null, started_at: null, created_at: Date.now(),
        participants: { [profile.uid]: { uid: profile.uid, nickname: profile.nickname, grade: myGrade, rating: profile.rating, ready: false, finished_at: null, rank: null, board: null, errors: [] } }
      })
      if (createError) { setError(`방 생성 실패: ${createError.message}`); return }
      router.push(`/sudoku?code=${code}`)
    } catch (e: any) {
      setError(e?.message || '오류가 발생했어요')
    } finally {
      setLoading(null)
    }
  }

  async function joinByCode() {
    if (!profile || !joinCode) return
    setLoading('join')
    setError('')
    try {
      const upper = joinCode.toUpperCase().trim()
      const { data: room } = await supabase.from('sudoku_rooms').select('*').eq('code', upper).single()
      if (!room) { setError('방을 찾을 수 없어요'); return }
      if (room.status !== '대기중') { setError('이미 시작된 방이에요'); return }
      const count = Object.keys(room.participants || {}).length
      if (count >= room.max_players && !room.participants[profile.uid]) { setError('방이 가득 찼어요'); return }
      if (!room.participants[profile.uid]) {
        const grade = 레이팅to스도쿠등급(profile.rating)
        const updated = { ...room.participants, [profile.uid]: { uid: profile.uid, nickname: profile.nickname, grade, rating: profile.rating, ready: false, finished_at: null, rank: null, board: null, errors: [] } }
        await supabase.from('sudoku_rooms').update({ participants: updated }).eq('code', upper)
      }
      router.push(`/sudoku?code=${upper}`)
    } catch (e: any) {
      setError(e?.message || '입장 실패')
    } finally {
      setLoading(null)
    }
  }

  // 1. 방 코드가 URL에 포함되어 있으면, 멀티플레이어 배틀 룸 화면을 렌더링
  if (code) {
    return <SudokuBattle code={code} onClose={() => router.push('/sudoku')} />
  }

  // 2. 혼자 풀기 모드
  if (mode === 'game') {
    return <SudokuGame difficulty={searchDifficulty as 난이도타입} onClose={() => router.push('/sudoku')} />
  }

  // 3. AI 대결 모드
  if (mode === 'ai') {
    return <SudokuAI difficulty={searchDifficulty as 난이도타입} onClose={() => router.push('/sudoku')} />
  }

  // 4. 로비 홈 화면
  const 등급 = profile ? 레이팅to스도쿠등급(profile.rating) : '브론즈'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '20px 16px 60px' }}>
      <div style={{ maxWidth: 400, margin: '0 auto' }}>

        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => router.push('/explore')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 900, background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>PAZAB</span>
            </button>
            <span style={{ width: 1, height: 14, background: 'var(--border)', display: 'inline-block' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>스도쿠</span>
          </div>
          {profile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', borderRadius: 20, padding: '6px 14px' }}>
              <span style={{ fontSize: 16 }}>{스도쿠등급아이콘[등급]}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: 스도쿠등급색[등급] }}>{profile.rating}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{등급}</span>
            </div>
          )}
        </div>

        {/* 난이도 선택 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em' }}>난이도</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {난이도목록.map(d => (
              <button key={d} onClick={() => setDifficulty(d)}
                style={{ padding: '10px 0', borderRadius: 12, border: `1px solid ${difficulty === d ? 'var(--primary)' : 'var(--border)'}`, background: difficulty === d ? 'var(--primary-light)' : 'var(--surface)', color: difficulty === d ? 'var(--primary)' : 'var(--text-sub)', fontWeight: difficulty === d ? 700 : 400, fontSize: 13, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <span>{d}</span>
                {bestTimes[d] && <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400 }}>{시간표시(bestTimes[d])}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* 인원수 선택 (대결용) */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em' }}>대결 인원</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[2, 3, 4].map(n => (
              <button key={n} onClick={() => setMaxPlayers(n)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: `1px solid ${maxPlayers === n ? 'var(--primary)' : 'var(--border)'}`, background: maxPlayers === n ? 'var(--primary-light)' : 'var(--surface)', color: maxPlayers === n ? 'var(--primary)' : 'var(--text-sub)', fontWeight: maxPlayers === n ? 700 : 400, fontSize: 14, cursor: 'pointer' }}>
                {n}명
              </button>
            ))}
          </div>
        </div>

        {/* 에러 */}
        {error && (
          <div style={{ background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.3)', borderRadius: 10, padding: '10px 14px', color: '#ec4899', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* 모드 버튼들 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {/* 혼자 풀기 */}
          <button onClick={() => router.push(`/sudoku?mode=game&d=${difficulty}`)}
            style={{ padding: '18px 20px', background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', border: 'none', borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}>
            <span style={{ fontSize: 28 }}>🧩</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>혼자 풀기</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
                {difficulty} {bestTimes[difficulty] ? `· 최고 ${시간표시(bestTimes[difficulty])}` : ''}
              </div>
            </div>
          </button>

          {/* 빠른 매칭 */}
          <button onClick={quickMatch} disabled={loading !== null || !profile}
            style={{ padding: '18px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, cursor: loading || !profile ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', opacity: loading === 'quick' ? 0.7 : 1 }}>
            <span style={{ fontSize: 28 }}>{loading === 'quick' ? '⏳' : '⚔️'}</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>
                {loading === 'quick' ? '매칭 중...' : '빠른 매칭'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {difficulty} · {maxPlayers}명 · 레이팅 대전
              </div>
            </div>
          </button>

          {/* AI 대결 */}
          <button onClick={() => router.push(`/sudoku?mode=ai&d=${difficulty}`)}
            style={{ padding: '18px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}>
            <span style={{ fontSize: 28 }}>🤖</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>AI 대결</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{difficulty} · 레이팅 변화 없음</div>
            </div>
          </button>
        </div>

        {/* 코드로 입장 */}
        <button onClick={() => { setShowCode(v => !v); setError('') }}
          style={{ width: '100%', padding: '12px 0', background: 'none', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', marginBottom: showCode ? 10 : 0 }}>
          {showCode ? '▲ 닫기' : '🔑 코드로 방 입장'}
        </button>

        {showCode && (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="방 코드 6자리"
              maxLength={6}
              style={{ flex: 1, padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)', fontSize: 18, fontWeight: 700, textAlign: 'center', letterSpacing: '0.15em', outline: 'none', fontFamily: 'var(--font-geist-mono)' }}
            />
            <button onClick={joinByCode} disabled={joinCode.length !== 6 || loading !== null || !profile}
              style={{ padding: '12px 18px', background: 'var(--primary)', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 14, cursor: joinCode.length === 6 && !loading ? 'pointer' : 'default', opacity: joinCode.length === 6 && !loading ? 1 : 0.4 }}>
              {loading === 'join' ? '...' : '입장'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function SudokuHome() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>로딩 중...</div>}>
      <SudokuMain />
    </Suspense>
  )
}
