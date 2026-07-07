"use client"

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { 퍼즐생성, 완성됐나, 시간표시, 숫자남은개수, 난이도타입 } from '../lib/sudoku'

type HistoryEntry = { board: number[][], errors: Set<string>, memo: Record<string, number[]> }

interface SudokuGameProps {
  difficulty: 난이도타입
  onClose: () => void
}

export default function SudokuGame({ difficulty, onClose }: SudokuGameProps) {
  const [initial, setInitial] = useState<number[][]>([])
  const [solution, setSolution] = useState<number[][]>([])
  const [board, setBoard] = useState<number[][]>([])
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [errors, setErrors] = useState<Set<string>>(new Set())
  const [memo, setMemo] = useState<Record<string, number[]>>({})
  const [memoMode, setMemoMode] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [hints, setHints] = useState(3)
  const [seconds, setSeconds] = useState(0)
  const [running, setRunning] = useState(false)
  const [complete, setComplete] = useState(false)
  const [isNewRecord, setIsNewRecord] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [exitConfirm, setExitConfirm] = useState(false)
  const savedRef = useRef(false)
  const runningRef = useRef(false)
  const completeRef = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then((res) => {
      const session = res.data.session;
      if (session) setUserId(session.user.id)
    })
  }, [])

  useEffect(() => { runningRef.current = running }, [running])
  useEffect(() => { completeRef.current = complete }, [complete])

  // 뒤로가기 인터셉트 (이동하지 않고 모달 띄우기)
  useEffect(() => {
    window.history.pushState(null, '', window.location.href)
    const handlePopState = () => {
      if (runningRef.current && !completeRef.current) {
        window.history.pushState(null, '', window.location.href)
        setExitConfirm(true)
      } else {
        onClose()
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [onClose])

  function newGame() {
    savedRef.current = false
    const { 퍼즐, 정답 } = 퍼즐생성(difficulty)
    setInitial(퍼즐.map(r => [...r]))
    setSolution(정답)
    setBoard(퍼즐.map(r => [...r]))
    setErrors(new Set())
    setMemo({})
    setHistory([])
    setHints(3)
    setSeconds(0)
    setRunning(true)
    setComplete(false)
    setIsNewRecord(false)
    setSelected(null)
  }

  useEffect(() => { newGame() }, [difficulty])

  useEffect(() => {
    if (!running || complete) return
    const id = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [running, complete])

  useEffect(() => {
    if (board.length === 0 || complete) return
    if (완성됐나(board, errors)) {
      setComplete(true)
      setRunning(false)
      if (!savedRef.current) {
        savedRef.current = true
        saveRecord(seconds)
      }
    }
  }, [board, errors])

  async function saveRecord(time: number) {
    if (!userId) return
    await supabase.from('sudoku_records').insert({ user_id: userId, difficulty, time_seconds: time })
    const { data } = await supabase
      .from('sudoku_records')
      .select('time_seconds')
      .eq('user_id', userId)
      .eq('difficulty', difficulty)
      .order('time_seconds', { ascending: true })
      .limit(2)
    if (data && data[0]?.time_seconds === time && data.length === 1) setIsNewRecord(true)
  }

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

    setHistory(prev => [...prev, { board: board.map(row => [...row]), errors: new Set(errors), memo: Object.fromEntries(Object.entries(memo).map(([k, v]) => [k, [...v]])) }])

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

  function handleUndo() {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setBoard(prev.board)
    setErrors(prev.errors)
    setMemo(prev.memo)
    setHistory(h => h.slice(0, -1))
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
      if (r === sr || c === sc) return 'rgba(139,92,246,0.18)'
      if (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3)) return 'rgba(139,92,246,0.10)'
      if (board[r][c] !== 0 && board[sr][sc] !== 0 && board[r][c] === board[sr][sc]) return 'rgba(139,92,246,0.15)'
    }
    return 'transparent'
  }

  function getCellColor(r: number, c: number) {
    if (errors.has(`${r},${c}`)) return '#ec4899'
    if (initial[r]?.[c] !== 0) return 'var(--text)'
    return '#a78bfa'
  }

  if (board.length === 0) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>퍼즐 생성 중...</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 12px 20px', userSelect: 'none' }}>
      {/* 헤더 */}
      <div style={{ width: '100%', maxWidth: 400, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={() => running && !complete ? setExitConfirm(true) : onClose()} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 8 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 22 }} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{difficulty}</div>
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-geist-mono)', color: 'var(--text)', lineHeight: 1 }}>{시간표시(seconds)}</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-sub)', padding: 8 }}>💡 {hints}</div>
      </div>

      {/* 보드 */}
      <div style={{ width: '100%', maxWidth: 380, aspectRatio: '1', display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', border: '2px solid rgba(255,255,255,0.18)', borderRadius: 6, overflow: 'hidden', marginBottom: 14 }}>
        {board.map((row, r) => row.map((val, c) => {
          const key = `${r},${c}`
          const cellMemo = memo[key] || []
          const isGiven = initial[r]?.[c] !== 0
          const borderRight = (c + 1) % 3 === 0 && c !== 8 ? '2px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.07)'
          const borderBottom = (r + 1) % 3 === 0 && r !== 8 ? '2px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.07)'

          return (
            <div key={key} onClick={() => setSelected([r, c])}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '1', borderRight, borderBottom, background: getCellBg(r, c), cursor: isGiven ? 'default' : 'pointer', position: 'relative' }}>
              {val === 0 && cellMemo.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', width: '100%', height: '100%', padding: '1px' }}>
                  {[1,2,3,4,5,6,7,8,9].map(n => (
                    <span key={n} style={{ fontSize: 7, textAlign: 'center', lineHeight: '1.6', color: cellMemo.includes(n) ? '#a78bfa' : 'transparent' }}>{n}</span>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: 17, fontWeight: isGiven ? 700 : 500, color: getCellColor(r, c) }}>
                  {val !== 0 ? val : ''}
                </span>
              )}
            </div>
          )
        }))}
      </div>

      {/* 컨트롤 */}
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
          {[
            { icon: 'ti-arrow-back-up', label: '실행취소', action: handleUndo, disabled: history.length === 0 },
            { icon: 'ti-eraser', label: '지우기', action: handleErase, disabled: false },
            { icon: 'ti-pencil', label: memoMode ? '메모 ON' : '메모', action: () => setMemoMode(m => !m), active: memoMode, disabled: false },
            { icon: 'ti-bulb', label: `힌트 ${hints}`, action: handleHint, disabled: hints === 0 || !selected },
          ].map(({ icon, label, action, disabled, active }) => (
            <button key={label} onClick={action} disabled={disabled}
              style={{ padding: '10px 0', background: active ? 'var(--primary-light)' : 'var(--surface)', border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 10, color: disabled ? 'var(--text-muted)' : active ? 'var(--primary)' : 'var(--text)', cursor: disabled ? 'default' : 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, opacity: disabled ? 0.4 : 1 }}>
              <i className={`ti ${icon}`} style={{ fontSize: 18 }} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* 숫자 패드 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 4 }}>
          {[1,2,3,4,5,6,7,8,9].map(n => {
            const remaining = 9 - 숫자남은개수(board, n)
            return (
              <button key={n} onClick={() => handleInput(n)} disabled={remaining === 0}
                style={{ padding: '12px 0', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, cursor: remaining > 0 ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, opacity: remaining > 0 ? 1 : 0.25 }}>
                <span style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)' }}>{n}</span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{remaining}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 나가기 확인 모달 */}
      {exitConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 20, padding: 28, maxWidth: 300, width: '100%', border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🤔</div>
            <h3 style={{ fontSize: 17, fontWeight: 900, margin: '0 0 8px', color: 'var(--text)' }}>풀이를 그만할까요?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.6 }}>
              혼자 풀기는 패널티가 없어요.<br />기록은 완성해야 저장됩니다.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setExitConfirm(false)} style={{ flex: 1, padding: 13, background: 'var(--primary-light)', border: '1px solid var(--primary)', borderRadius: 12, color: 'var(--primary)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                계속 풀기
              </button>
              <button onClick={onClose} style={{ flex: 1, padding: 13, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-muted)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                나가기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 완성 모달 */}
      {complete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 24, padding: 32, maxWidth: 320, width: '100%', textAlign: 'center', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>{isNewRecord ? '🏆' : '🎉'}</div>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 4px', color: 'var(--text)' }}>{isNewRecord ? '신기록!' : '완성!'}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>{difficulty}</p>
            <p style={{ fontSize: 36, fontWeight: 800, color: 'var(--primary)', margin: '0 0 24px', fontFamily: 'var(--font-geist-mono)' }}>{시간표시(seconds)}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, padding: 14, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--text)', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>홈</button>
              <button onClick={newGame} style={{ flex: 1, padding: 14, background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', border: 'none', borderRadius: 14, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>다시 풀기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
