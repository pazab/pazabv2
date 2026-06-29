"use client"

import { useState, useEffect, useRef } from 'react'
import { 퍼즐생성, 완성됐나, 논리풀기, 시간표시, 숫자남은개수, 난이도타입 } from '../lib/sudoku'

const AI속도ms: Record<난이도타입, number> = { 초급: 22000, 중급: 12000, 고급: 5000, 전문가: 2000 }
const AI배율 = [[1.0], [0.75, 1.35], [0.65, 1.0, 1.45]]

type Bot = { name: string, board: number[][], speed: number, doneAt: number | null }

interface SudokuAIProps {
  difficulty: 난이도타입
  onClose: () => void
}

export default function SudokuAI({ difficulty: initialDifficulty, onClose }: SudokuAIProps) {
  const [phase, setPhase] = useState<'setup' | 'game' | 'done'>('setup')
  const [difficulty, setDifficulty] = useState<난이도타입>(initialDifficulty)
  const [botCount, setBotCount] = useState(1)

  const [initial, setInitial] = useState<number[][]>([])
  const [solution, setSolution] = useState<number[][]>([])
  const [board, setBoard] = useState<number[][]>([])
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [errors, setErrors] = useState<Set<string>>(new Set())
  const [memo, setMemo] = useState<Record<string, number[]>>({})
  const [memoMode, setMemoMode] = useState(false)
  const [history, setHistory] = useState<{ board: number[][], errors: Set<string>, memo: Record<string, number[]> }[]>([])
  const [hints, setHints] = useState(3)
  const [seconds, setSeconds] = useState(0)
  const [bots, setBots] = useState<Bot[]>([])
  const [myDoneAt, setMyDoneAt] = useState<number | null>(null)
  const [gameStartTime, setGameStartTime] = useState(0)
  const botTimers = useRef<NodeJS.Timeout[]>([])
  const completedRef = useRef(false)

  const 난이도목록: 난이도타입[] = ['초급', '중급', '고급', '전문가']
  const botNames = ['AI 도우미', 'AI 스피드', 'AI 마스터', 'AI 챔피언']

  // 뒤로가기 인터셉트
  useEffect(() => {
    window.history.pushState(null, '', window.location.href)
    const handlePopState = () => {
      if (phase === 'game' && !completedRef.current) {
        if (confirm('AI 대결을 중단하고 나가시겠습니까? (레이팅 변화 없음)')) {
          onClose()
        } else {
          window.history.pushState(null, '', window.location.href)
        }
      } else {
        onClose()
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      botTimers.current.forEach(clearTimeout)
    }
  }, [phase, onClose])

  function startGame() {
    const { 퍼즐, 정답 } = 퍼즐생성(difficulty)
    setInitial(퍼즐.map(r => [...r]))
    setSolution(정답)
    setBoard(퍼즐.map(r => [...r]))
    setErrors(new Set())
    setMemo({})
    setHistory([])
    setHints(3)
    setSeconds(0)
    setMyDoneAt(null)
    completedRef.current = false

    const baseMs = AI속도ms[difficulty]
    const multipliers = AI배율[botCount - 1] || [1.0]
    const startTime = Date.now()
    setGameStartTime(startTime)

    // 봇 초기 상태
    const initialBots: Bot[] = Array.from({ length: botCount }, (_, i) => ({
      name: botNames[i],
      board: 퍼즐.map(r => [...r]),
      speed: baseMs * (multipliers[i] || 1.0),
      doneAt: null,
    }))
    setBots(initialBots)

    // 봇 자동완성 시뮬레이션
    botTimers.current.forEach(clearTimeout)
    botTimers.current = initialBots.map((bot, idx) => {
      const { 결과판 } = 논리풀기(정답.map(r => [...r]))
      return setTimeout(() => {
        setBots(prev => prev.map((b, i) => i === idx ? { ...b, board: 결과판, doneAt: Date.now() } : b))
      }, bot.speed)
    })

    setPhase('game')
  }

  // 타이머
  useEffect(() => {
    if (phase !== 'game' || myDoneAt !== null) return
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - gameStartTime) / 1000)), 1000)
    return () => clearInterval(id)
  }, [phase, myDoneAt, gameStartTime])

  // 완성 감지
  useEffect(() => {
    if (phase !== 'game' || completedRef.current || board.length === 0) return
    if (완성됐나(board, errors)) {
      completedRef.current = true
      setMyDoneAt(Date.now())
    }
  }, [board, errors, phase])

  // 봇 모두 완료되면 게임 종료
  useEffect(() => {
    if (phase !== 'game') return
    const allBotsDone = bots.length > 0 && bots.every(b => b.doneAt !== null)
    if (allBotsDone && myDoneAt !== null) setPhase('done')
    if (allBotsDone && myDoneAt === null) {
      const timer = setTimeout(() => setPhase('done'), 3000)
      return () => clearTimeout(timer)
    }
  }, [bots, myDoneAt, phase])

  function handleInput(n: number) {
    if (!selected) return
    const [r, c] = selected
    if (initial[r]?.[c] !== 0) return
    if (memoMode) {
      const key = `${r},${c}`
      setMemo(prev => {
        const cur = prev[key] || []
        return { ...prev, [key]: cur.includes(n) ? cur.filter(x => x !== n) : [...cur, n] }
      })
      return
    }
    setHistory(prev => [...prev, { board: board.map(row => [...row]), errors: new Set(errors), memo: { ...memo } }])
    const newBoard = board.map(row => [...row])
    newBoard[r][c] = n
    const key = `${r},${c}`
    const newErrors = new Set(errors)
    n !== solution[r][c] ? newErrors.add(key) : newErrors.delete(key)
    const newMemo = { ...memo }
    delete newMemo[key]
    setBoard(newBoard)
    setErrors(newErrors)
    setMemo(newMemo)
  }

  function handleErase() {
    if (!selected) return
    const [r, c] = selected
    if (initial[r]?.[c] !== 0) return
    setHistory(prev => [...prev, { board: board.map(row => [...row]), errors: new Set(errors), memo: { ...memo } }])
    const newBoard = board.map(row => [...row])
    newBoard[r][c] = 0
    const key = `${r},${c}`
    const newErrors = new Set(errors)
    newErrors.delete(key)
    const newMemo = { ...memo }
    delete newMemo[key]
    setBoard(newBoard)
    setErrors(newErrors)
    setMemo(newMemo)
  }

  function handleHint() {
    if (hints === 0 || !selected) return
    const [r, c] = selected
    if (initial[r]?.[c] !== 0 || board[r][c] === solution[r][c]) return
    setHistory(prev => [...prev, { board: board.map(row => [...row]), errors: new Set(errors), memo: { ...memo } }])
    const newBoard = board.map(row => [...row])
    newBoard[r][c] = solution[r][c]
    const key = `${r},${c}`
    const newErrors = new Set(errors)
    newErrors.delete(key)
    const newMemo = { ...memo }
    delete newMemo[key]
    setBoard(newBoard)
    setErrors(newErrors)
    setMemo(newMemo)
    setHints(h => h - 1)
  }

  function getCellBg(r: number, c: number) {
    const key = `${r},${c}`
    if (errors.has(key)) return 'rgba(236,72,153,0.18)'
    if (selected) {
      const [sr, sc] = selected
      if (r === sr && c === sc) return 'rgba(139,92,246,0.25)'
      if (r === sr || c === sc) return 'rgba(139,92,246,0.07)'
    }
    return 'transparent'
  }

  // 결과 화면
  if (phase === 'done') {
    const entries = [
      { name: '나', doneAt: myDoneAt, isMe: true },
      ...bots.map(b => ({ name: b.name, doneAt: b.doneAt, isMe: false })),
    ].sort((a, b) => {
      if (!a.doneAt && !b.doneAt) return 0
      if (!a.doneAt) return 1
      if (!b.doneAt) return -1
      return a.doneAt - b.doneAt
    })
    const medals = ['🥇', '🥈', '🥉', '4위']
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8, color: 'var(--text)' }}>AI 대결 결과</h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>{difficulty} · 레이팅 변화 없음</p>
        <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
          {entries.map((e, i) => (
            <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: 12, background: e.isMe ? 'var(--primary-light)' : 'var(--surface)', border: `1px solid ${e.isMe ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 14, padding: '12px 16px' }}>
              <span style={{ fontSize: 24, width: 36 }}>{medals[i] || `${i + 1}위`}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{e.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {e.doneAt ? 시간표시(Math.floor((e.doneAt - gameStartTime) / 1000)) : '미완성'}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 360 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 14, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--text)', fontWeight: 600, cursor: 'pointer' }}>홈</button>
          <button onClick={startGame} style={{ flex: 1, padding: 14, background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', border: 'none', borderRadius: 14, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>다시 대결</button>
        </div>
      </div>
    )
  }

  // 설정 화면
  if (phase === 'setup') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '20px 16px 120px' }}>
        <div style={{ maxWidth: 400, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}>
              <i className="ti ti-arrow-left" style={{ fontSize: 22 }} />
            </button>
            <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>AI 대결</h1>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>난이도</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {난이도목록.map(d => (
                <button key={d} onClick={() => setDifficulty(d)}
                  style={{ padding: '10px 0', borderRadius: 10, border: `1px solid ${difficulty === d ? 'var(--primary)' : 'var(--border)'}`, background: difficulty === d ? 'var(--primary-light)' : 'var(--surface)', color: difficulty === d ? 'var(--primary)' : 'var(--text-sub)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>AI 수</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[1, 2, 3].map(n => (
                <button key={n} onClick={() => setBotCount(n)}
                  style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: `1px solid ${botCount === n ? 'var(--primary)' : 'var(--border)'}`, background: botCount === n ? 'var(--primary-light)' : 'var(--surface)', color: botCount === n ? 'var(--primary)' : 'var(--text-sub)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                  AI {n}명
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
              🤖 AI는 논리 풀이 기반으로 자동 완성합니다. 레이팅에는 영향을 주지 않아요.
            </p>
          </div>

          <button onClick={startGame}
            style={{ width: '100%', padding: 16, background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', border: 'none', borderRadius: 14, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>
            🤖 AI와 대결 시작
          </button>
        </div>
      </div>
    )
  }

  // 게임 화면
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 10px 20px', userSelect: 'none' }}>
      {/* 헤더 */}
      <div style={{ width: '100%', maxWidth: 380, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button onClick={() => { if (confirm('AI 대결을 중단하고 나가시겠습니까?')) onClose() }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 20 }} />
        </button>
        <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-geist-mono)', color: myDoneAt ? '#4ade80' : 'var(--text)' }}>
          {myDoneAt ? '완성! ' + 시간표시(Math.floor((myDoneAt - gameStartTime) / 1000)) : 시간표시(seconds)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>AI {botCount}명</div>
      </div>

      {/* 봇 상태 */}
      <div style={{ width: '100%', maxWidth: 380, display: 'flex', gap: 8, marginBottom: 10 }}>
        {bots.map(bot => (
          <div key={bot.name} style={{ flex: 1, background: 'var(--surface)', borderRadius: 10, padding: '6px 10px', textAlign: 'center', border: `1px solid ${bot.doneAt ? '#4ade80' : 'var(--border)'}` }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>🤖 {bot.name}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: bot.doneAt ? '#4ade80' : 'var(--text-sub)' }}>
              {bot.doneAt ? '완성! ' + 시간표시(Math.floor((bot.doneAt - gameStartTime) / 1000)) : '풀이 중...'}
            </div>
          </div>
        ))}
      </div>

      {/* 보드 */}
      {board.length > 0 && (
        <>
          <div style={{ width: '100%', maxWidth: 370, aspectRatio: '1', display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', border: '2px solid rgba(255,255,255,0.18)', borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
            {board.map((row, r) => row.map((val, c) => {
              const key = `${r},${c}`
              const cellMemo = memo[key] || []
              const isGiven = initial[r]?.[c] !== 0
              const borderRight = (c + 1) % 3 === 0 && c !== 8 ? '2px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.07)'
              const borderBottom = (r + 1) % 3 === 0 && r !== 8 ? '2px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.07)'
              return (
                <div key={key} onClick={() => !myDoneAt && setSelected([r, c])}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '1', borderRight, borderBottom, background: getCellBg(r, c), cursor: isGiven || myDoneAt ? 'default' : 'pointer' }}>
                  {val === 0 && cellMemo.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', width: '100%', height: '100%', padding: 1 }}>
                      {[1,2,3,4,5,6,7,8,9].map(n => (
                        <span key={n} style={{ fontSize: 7, textAlign: 'center', lineHeight: '1.6', color: cellMemo.includes(n) ? '#a78bfa' : 'transparent' }}>{n}</span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontSize: 17, fontWeight: isGiven ? 700 : 500, color: errors.has(key) ? '#ec4899' : isGiven ? 'var(--text)' : '#a78bfa' }}>
                      {val !== 0 ? val : ''}
                    </span>
                  )}
                </div>
              )
            }))}
          </div>

          {!myDoneAt && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 8, width: '100%', maxWidth: 370 }}>
                <button onClick={() => { if (history.length > 0) { const p = history[history.length - 1]; setBoard(p.board); setErrors(p.errors); setMemo(p.memo); setHistory(h => h.slice(0,-1)) } }} disabled={history.length === 0}
                  style={{ padding: '8px 0', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: history.length > 0 ? 'var(--text)' : 'var(--text-muted)', cursor: history.length > 0 ? 'pointer' : 'default', fontSize: 11, fontWeight: 600, opacity: history.length > 0 ? 1 : 0.4 }}>
                  <i className="ti ti-arrow-back-up" /> 실행취소
                </button>
                <button onClick={handleErase} style={{ padding: '8px 0', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                  <i className="ti ti-eraser" /> 지우기
                </button>
                <button onClick={() => setMemoMode(m => !m)} style={{ padding: '8px 0', background: memoMode ? 'var(--primary-light)' : 'var(--surface)', border: `1px solid ${memoMode ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 10, color: memoMode ? 'var(--primary)' : 'var(--text)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                  <i className="ti ti-pencil" /> {memoMode ? '메모 ON' : '메모'}
                </button>
                <button onClick={handleHint} disabled={hints === 0 || !selected} style={{ padding: '8px 0', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: hints > 0 && selected ? 'var(--text)' : 'var(--text-muted)', cursor: hints > 0 && selected ? 'pointer' : 'default', fontSize: 11, fontWeight: 600, opacity: hints > 0 && selected ? 1 : 0.4 }}>
                  <i className="ti ti-bulb" /> 힌트 {hints}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 3, width: '100%', maxWidth: 370 }}>
                {[1,2,3,4,5,6,7,8,9].map(n => {
                  const remaining = 9 - 숫자남은개수(board, n)
                  return (
                    <button key={n} onClick={() => handleInput(n)} disabled={remaining === 0}
                      style={{ padding: '11px 0', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, cursor: remaining > 0 ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, opacity: remaining > 0 ? 1 : 0.25 }}>
                      <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{n}</span>
                      <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>{remaining}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
