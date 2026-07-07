"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { 퍼즐생성, 완성됐나, 시간표시, 숫자남은개수, 난이도타입 } from '../lib/sudoku'
import { 레이팅to스도쿠등급, 스도쿠등급아이콘, 순위레이팅변화, 스도쿠등급타입 } from '../lib/sudokuGrade'

type Participant = {
  uid: string
  nickname: string
  grade: string
  rating: number
  ready: boolean
  finished_at: number | null
  rank: number | null
  board: number[] | null
  errors: string[]
}

type Room = {
  code: string
  host_id: string
  status: '대기중' | '진행중' | '종료'
  difficulty: 난이도타입
  max_players: number
  is_public: boolean
  puzzle: number[] | null
  answer: number[] | null
  started_at: number | null
  created_at: number
  participants: Record<string, Participant>
}

function MiniBoard({ participant }: { participant: Participant }) {
  const board = participant.board
  const errSet = new Set(participant.errors)
  if (!board) {
    return (
      <div style={{ width: 80, height: 80, background: 'var(--surface2)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>대기</span>
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', width: 81, height: 81, border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
      {Array.from({ length: 9 }, (_, r) => board.slice(r * 9, r * 9 + 9).map((val, c) => (
        <div key={`${r},${c}`} style={{
          background: errSet.has(`${r},${c}`) ? '#ec4899' : val !== 0 ? '#8b5cf6' : 'var(--surface2)',
          opacity: val !== 0 ? 0.85 : 0.25,
        }} />
      )))}
    </div>
  )
}

interface SudokuBattleProps {
  code: string
  onClose: () => void
}

export default function SudokuBattle({ code, onClose }: SudokuBattleProps) {
  const [room, setRoom] = useState<Room | null>(null)
  const [myUid, setMyUid] = useState<string | null>(null)
  const [initial, setInitial] = useState<number[][]>([])
  const [solution, setSolution] = useState<number[][]>([])
  const [board, setBoard] = useState<number[][]>([])
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [errors, setErrors] = useState<Set<string>>(new Set())
  const [memo, setMemo] = useState<Record<string, number[]>>({})
  const [memoMode, setMemoMode] = useState(false)
  const [history, setHistory] = useState<{ board: number[][], errors: Set<string>, memo: Record<string, number[]> }[]>([])
  const [seconds, setSeconds] = useState(0)
  const [myRank, setMyRank] = useState<number | null>(null)
  const [ratingChange, setRatingChange] = useState<number | null>(null)
  const [toast, setToast] = useState('')
  const [exitConfirm, setExitConfirm] = useState(false)
  const boardUpdateTimer = useRef<NodeJS.Timeout | undefined>(undefined)
  const completedRef = useRef(false)
  const startTimeRef = useRef<number>(0)

  useEffect(() => {
    supabase.auth.getSession().then((res) => {
      const session = res.data.session;
      if (session) setMyUid(session.user.id)
    })
  }, [])

  // 방 나가기 함수
  const leaveRoom = useCallback(async (currentRoom: Room | null, uid: string | null) => {
    if (!currentRoom || !uid || currentRoom.status === '진행중') return
    const { data } = await supabase.from('sudoku_rooms').select('participants').eq('code', code).single()
    if (!data) return
    const remaining = Object.keys(data.participants).filter(u => u !== uid)
    if (remaining.length === 0) {
      // 마지막 사람 → 방 삭제
      await supabase.from('sudoku_rooms').delete().eq('code', code)
    } else {
      // 방장이 나가면 다음 사람이 방장
      const newParticipants = Object.fromEntries(
        Object.entries(data.participants).filter(([u]) => u !== uid)
      )
      const newHostId = currentRoom.host_id === uid ? remaining[0] : currentRoom.host_id
      await supabase.from('sudoku_rooms').update({ participants: newParticipants, host_id: newHostId }).eq('code', code)
    }
  }, [code])

  // 최신 room/myUid를 ref로 유지 (cleanup에서 state 직접 못 씀)
  const roomRef = useRef<Room | null>(null)
  const myUidRef = useRef<string | null>(null)
  useEffect(() => { roomRef.current = room }, [room])
  useEffect(() => { myUidRef.current = myUid }, [myUid])

  // 뒤로가기 차단용 ref
  const roomStatusRef = useRef<string>('대기중')
  useEffect(() => { roomStatusRef.current = room?.status ?? '대기중' }, [room?.status])
  const exitConfirmRef = useRef(false)
  useEffect(() => { exitConfirmRef.current = exitConfirm }, [exitConfirm])

  // 마운트 시 히스토리 더미 추가 + 뒤로가기 인터셉트
  useEffect(() => {
    window.history.pushState(null, '', window.location.href)

    const handlePopState = () => {
      if (roomStatusRef.current === '진행중' && !exitConfirmRef.current) {
        // 뒤로가기 차단
        window.history.pushState(null, '', window.location.href)
        setExitConfirm(true)
      } else if (roomStatusRef.current !== '진행중') {
        leaveRoom(roomRef.current, myUidRef.current).then(() => {
          onClose()
        })
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      leaveRoom(roomRef.current, myUidRef.current)
    }
  }, [onClose, leaveRoom])

  // 방 로드
  useEffect(() => {
    if (!myUid) return
    const load = async () => {
      const { data } = await supabase.from('sudoku_rooms').select('*').eq('code', code).single()
      if (!data) { onClose(); return }
      setRoom(data as Room)
      if (data.status === '진행중' && data.puzzle) {
        const grid = (n: number[]) => Array.from({ length: 9 }, (_, i) => n.slice(i * 9, i * 9 + 9))
        setInitial(grid(data.puzzle))
        setSolution(grid(data.answer))
        const myParticipant = data.participants[myUid]
        if (myParticipant?.board) {
          setBoard(grid(myParticipant.board))
        } else {
          setBoard(grid(data.puzzle))
        }
        startTimeRef.current = data.started_at || Date.now()
      }
    }
    load()
  }, [myUid, code, onClose])

  // Realtime 구독 + 폴링 fallback
  useEffect(() => {
    if (!myUid) return

    const applyRoom = (data: Room) => {
      setRoom(data)
      if (data.status === '진행중' && data.puzzle) {
        const grid = (n: number[]) => Array.from({ length: 9 }, (_, i) => n.slice(i * 9, i * 9 + 9))
        setInitial(prev => prev.length > 0 ? prev : grid(data.puzzle!))
        setSolution(prev => prev.length > 0 ? prev : grid(data.answer!))
        setBoard(prev => {
          if (prev.length > 0) return prev
          const myP = data.participants[myUid]
          return myP?.board ? grid(myP.board) : grid(data.puzzle!)
        })
        if (!startTimeRef.current) startTimeRef.current = data.started_at || Date.now()
      }
    }

    // Realtime
    const channel = supabase
      .channel(`sudoku_room_${code}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sudoku_rooms', filter: `code=eq.${code}` }, (payload: { new: Record<string, unknown> }) => {
        applyRoom(payload.new as Room)
      })
      .subscribe()

    // 폴링 fallback
    const poll = setInterval(async () => {
      const { data } = await supabase.from('sudoku_rooms').select('*').eq('code', code).single()
      if (data) applyRoom(data as Room)
    }, room?.status === '대기중' ? 3000 : 8000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
    }
  }, [myUid, code, room?.status])

  // 타이머
  useEffect(() => {
    if (!room || room.status !== '진행중' || myRank !== null) return
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [room?.status, myRank])

  // 완성 감지
  useEffect(() => {
    if (board.length === 0 || myRank !== null || completedRef.current) return
    if (완성됐나(board, errors)) {
      completedRef.current = true
      handleComplete()
    }
  }, [board, errors])

  // 내 보드 DB 업데이트 (디바운스)
  const syncBoard = useCallback(() => {
    if (!myUid || !room || room.status !== '진행중') return
    clearTimeout(boardUpdateTimer.current)
    boardUpdateTimer.current = setTimeout(async () => {
      const { data } = await supabase.from('sudoku_rooms').select('participants').eq('code', code).single()
      if (!data) return
      const updated = {
        ...data.participants,
        [myUid]: { ...data.participants[myUid], board: board.flat(), errors: Array.from(errors) }
      }
      await supabase.from('sudoku_rooms').update({ participants: updated }).eq('code', code)
    }, 1500)
  }, [myUid, code, board, errors, room?.status])

  useEffect(() => { syncBoard() }, [board])

  async function handleComplete() {
    if (!myUid || !room) return
    const finishedAt = Date.now()
    const { data } = await supabase.from('sudoku_rooms').select('participants').eq('code', code).single()
    if (!data) return

    const completedCount = Object.values(data.participants as Record<string, Participant>).filter(p => p.finished_at !== null).length
    const rank = completedCount + 1
    setMyRank(rank)

    const updated = {
      ...data.participants,
      [myUid]: { ...data.participants[myUid], finished_at: finishedAt, rank, board: board.flat(), errors: [] }
    }

    const allFinished = Object.keys(updated).every(uid => updated[uid].finished_at !== null)
    const updateData: any = { participants: updated }
    if (allFinished) updateData.status = '종료'

    await supabase.from('sudoku_rooms').update(updateData).eq('code', code)

    // 레이팅 업데이트
    const 총인원 = Object.keys(room.participants).length
    if (총인원 >= 2) {
      const change = 순위레이팅변화(rank, 총인원)
      setRatingChange(change)
      const myRating = room.participants[myUid].rating
      const newRating = Math.max(0, myRating + change)
      await supabase.from('sudoku_ratings').upsert({
        user_id: myUid, rating: newRating,
        grade: 레이팅to스도쿠등급(newRating),
        wins: rank === 1 ? 1 : 0, losses: rank !== 1 ? 1 : 0,
      }, { onConflict: 'user_id', ignoreDuplicates: false })
    }

    setToast(rank === 1 ? '🏆 1등 완성!' : `${rank}등으로 완성!`)
  }

  async function toggleReady() {
    if (!myUid || !room) return
    const { data } = await supabase.from('sudoku_rooms').select('participants').eq('code', code).single()
    if (!data) return
    const myPart = data.participants[myUid]
    const updated = { ...data.participants, [myUid]: { ...myPart, ready: !myPart.ready } }
    await supabase.from('sudoku_rooms').update({ participants: updated }).eq('code', code)
  }

  async function forfeit() {
    if (!myUid || !room || room.status !== '진행중') return
    const 총인원 = Object.keys(room.participants).length
    const change = 순위레이팅변화(총인원, 총인원, true)
    const myRating = room.participants[myUid].rating
    const newRating = Math.max(0, myRating + change)
    await supabase.from('sudoku_ratings').upsert({
      user_id: myUid, rating: newRating,
      grade: 레이팅to스도쿠등급(newRating),
      wins: 0, losses: 1,
    }, { onConflict: 'user_id', ignoreDuplicates: false })
    await leaveRoom(roomRef.current, myUidRef.current)
    onClose()
  }

  async function startGame() {
    if (!myUid || !room || room.host_id !== myUid) return
    const { 퍼즐, 정답 } = 퍼즐생성(room.difficulty)
    await supabase.from('sudoku_rooms').update({
      status: '진행중',
      puzzle: 퍼즐.flat(),
      answer: 정답.flat(),
      started_at: Date.now(),
    }).eq('code', code)
  }

  async function handleInput(n: number) {
    if (!selected || room?.status !== '진행중') return
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

  function handleUndo() {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setBoard(prev.board)
    setErrors(prev.errors)
    setMemo(prev.memo)
    setHistory(h => h.slice(0, -1))
  }

  function getCellBg(r: number, c: number) {
    const key = `${r},${c}`
    if (errors.has(key)) return 'rgba(236,72,153,0.18)'
    if (selected) {
      const [sr, sc] = selected
      if (r === sr && c === sc) return 'rgba(139,92,246,0.25)'
      if (r === sr || c === sc) return 'rgba(139,92,246,0.18)'
      if (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3)) return 'rgba(139,92,246,0.10)'
    }
    return 'transparent'
  }

  if (!room) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>방 불러오는 중...</div>
  }

  const participants = Object.values(room.participants).sort((a, b) =>
    a.uid === room.host_id ? -1 : b.uid === room.host_id ? 1 : 0
  )
  const myParticipant = myUid ? room.participants[myUid] : null
  const allReady = participants.length >= 2 && participants.every(p => p.uid === room.host_id || p.ready)
  const opponents = participants.filter(p => p.uid !== myUid)

  // 종료 화면
  if (room.status === '종료') {
    const ranked = [...participants].sort((a, b) => (a.rank || 99) - (b.rank || 99))
    const medals = ['🥇', '🥈', '🥉', '4위']
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 24, color: 'var(--text)' }}>대결 결과</h2>
        <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
          {ranked.map((p, i) => (
            <div key={p.uid} style={{ display: 'flex', alignItems: 'center', gap: 12, background: p.uid === myUid ? 'var(--primary-light)' : 'var(--surface)', border: `1px solid ${p.uid === myUid ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 14, padding: '12px 16px' }}>
              <span style={{ fontSize: 24, width: 36 }}>{medals[i] || `${i + 1}위`}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{p.nickname} {p.uid === myUid && '(나)'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.finished_at && room.started_at ? 시간표시(Math.floor((p.finished_at - room.started_at) / 1000)) : '미완성'}</div>
              </div>
              {p.uid === myUid && ratingChange !== null && (
                <span style={{ fontSize: 14, fontWeight: 700, color: ratingChange >= 0 ? '#4ade80' : '#ec4899' }}>{ratingChange >= 0 ? '+' : ''}{ratingChange}</span>
              )}
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{ padding: '14px 40px', background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', border: 'none', borderRadius: 14, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>
          홈으로
        </button>
      </div>
    )
  }

  // 대기실
  if (room.status === '대기중') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <button onClick={async () => { await leaveRoom(roomRef.current, myUidRef.current); onClose() }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}>
              <i className="ti ti-arrow-left" style={{ fontSize: 22 }} />
            </button>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>대기실</h1>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{room.difficulty} · 최대 {room.max_players}명</div>
            </div>
          </div>

          {/* 방 코드 */}
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', marginBottom: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>방 코드</div>
            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '0.2em', color: 'var(--primary)', fontFamily: 'var(--font-geist-mono)' }}>{code}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>친구에게 이 코드를 알려주세요</div>
          </div>

          {/* 참가자 목록 */}
          <div style={{ marginBottom: 20 }}>
            {participants.map(p => (
              <div key={p.uid} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', borderRadius: 12, padding: '12px 16px', marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>{스도쿠등급아이콘[p.grade as 스도쿠등급타입] || '🎮'}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{p.nickname}</span>
                  {p.uid === room.host_id && <span style={{ fontSize: 11, color: 'var(--primary)', marginLeft: 6 }}>방장</span>}
                </div>
                <span style={{ fontSize: 12, color: p.ready ? '#4ade80' : 'var(--text-muted)', fontWeight: 600 }}>
                  {p.ready ? '✓ 준비완료' : '대기 중'}
                </span>
              </div>
            ))}
            {Array.from({ length: room.max_players - participants.length }).map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', borderRadius: 12, padding: '12px 16px', marginBottom: 8, opacity: 0.4, borderStyle: 'dashed', border: '1px dashed var(--border)' }}>
                <span style={{ fontSize: 20 }}>👤</span>
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>대기 중...</span>
              </div>
            ))}
          </div>

          {/* 버튼 */}
          {myUid && myParticipant && (
            <div style={{ display: 'flex', gap: 10 }}>
              {room.host_id !== myUid && (
                <button onClick={toggleReady}
                  style={{ flex: 1, padding: 14, background: myParticipant.ready ? 'var(--surface2)' : 'var(--primary-light)', border: `1px solid ${myParticipant.ready ? 'var(--border)' : 'var(--primary)'}`, borderRadius: 14, color: myParticipant.ready ? 'var(--text-muted)' : 'var(--primary)', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                  {myParticipant.ready ? '준비 취소' : '준비 완료'}
                </button>
              )}
              {room.host_id === myUid && (
                <button onClick={startGame} disabled={!allReady || participants.length < 2}
                  style={{ flex: 1, padding: 14, background: allReady && participants.length >= 2 ? 'linear-gradient(135deg,#8b5cf6,#7c3aed)' : 'var(--surface2)', border: 'none', borderRadius: 14, color: allReady && participants.length >= 2 ? '#fff' : 'var(--text-muted)', fontWeight: 800, fontSize: 15, cursor: allReady && participants.length >= 2 ? 'pointer' : 'default' }}>
                  {participants.length < 2 ? '상대방 기다리는 중...' : allReady ? '게임 시작!' : '모두 준비 완료 후 시작'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // 나가기 확인 모달
  const opponentsCount = Object.keys(room.participants).length
  const forfeitPenalty = 순위레이팅변화(opponentsCount, opponentsCount, true)

  // 게임 중
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 10px 20px', userSelect: 'none' }}>
      {exitConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 20, padding: 28, maxWidth: 320, width: '100%', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
            <h3 style={{ fontSize: 18, fontWeight: 900, margin: '0 0 10px', color: 'var(--text)', textAlign: 'center' }}>게임을 포기하시겠어요?</h3>
            <div style={{ background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.25)', borderRadius: 12, padding: '12px 14px', marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: '#ec4899', fontWeight: 700, marginBottom: 6 }}>포기 시 패널티</div>
              <div style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.6 }}>
                • 꼴찌 처리 + 추가 감점<br />
                • 레이팅 <span style={{ color: '#ec4899', fontWeight: 700 }}>{forfeitPenalty}점</span> 감소<br />
                • 현재 레이팅: {room.participants[myUid!]?.rating ?? '-'}점
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setExitConfirm(false)} style={{ flex: 1, padding: 14, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                계속 풀기
              </button>
              <button onClick={forfeit} style={{ flex: 1, padding: 14, background: 'rgba(236,72,153,0.15)', border: '1px solid rgba(236,72,153,0.4)', borderRadius: 12, color: '#ec4899', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                포기하기
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(24,24,27,0.97)', border: '1px solid var(--border)', color: '#fff', fontSize: 14, padding: '10px 20px', borderRadius: 20, zIndex: 200, fontWeight: 700 }}>
          {toast}
        </div>
      )}

      {/* 헤더 */}
      <div style={{ width: '100%', maxWidth: 380, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button onClick={() => myRank ? onClose() : setExitConfirm(true)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 8px', fontSize: 13, fontWeight: 600 }}>
          {myRank ? '← 홈' : '포기'}
        </button>
        <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-geist-mono)', color: myRank ? '#4ade80' : 'var(--text)' }}>
          {myRank ? `${myRank}등 완료!` : 시간표시(seconds)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{room.difficulty}</div>
      </div>

      {/* 상대방 미니보드 */}
      {opponents.length > 0 && (
        <div style={{ width: '100%', maxWidth: 380, display: 'flex', gap: 12, marginBottom: 10, overflowX: 'auto' }}>
          {opponents.map(p => (
            <div key={p.uid} style={{ textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, maxWidth: 81, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nickname}</div>
              <MiniBoard participant={p} />
              {p.finished_at && <div style={{ fontSize: 10, color: '#4ade80', marginTop: 3, fontWeight: 700 }}>{p.rank}등 완료</div>}
            </div>
          ))}
        </div>
      )}

      {/* 내 보드 */}
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
                <div key={key} onClick={() => !myRank && setSelected([r, c])}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '1', borderRight, borderBottom, background: getCellBg(r, c), cursor: isGiven || myRank ? 'default' : 'pointer' }}>
                  {val === 0 && cellMemo.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', width: '100%', height: '100%', padding: 1 }}>
                      {[1,2,3,4,5,6,7,8,9].map(n => (
                        <span key={n} style={{ fontSize: 7, textAlign: 'center', lineHeight: '1.6', color: cellMemo.includes(n) ? '#a78bfa' : 'transparent' }}>{n}</span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontSize: 16, fontWeight: isGiven ? 700 : 500, color: errors.has(key) ? '#ec4899' : isGiven ? 'var(--text)' : '#a78bfa' }}>
                      {val !== 0 ? val : ''}
                    </span>
                  )}
                </div>
              )
            }))}
          </div>

          {!myRank && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 8, width: '100%', maxWidth: 370 }}>
                <button onClick={handleUndo} disabled={history.length === 0} style={{ padding: '8px 0', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: history.length > 0 ? 'var(--text)' : 'var(--text-muted)', cursor: history.length > 0 ? 'pointer' : 'default', fontSize: 11, fontWeight: 600, opacity: history.length > 0 ? 1 : 0.4 }}>
                  <i className="ti ti-arrow-back-up" /> 실행취소
                </button>
                <button onClick={handleErase} style={{ padding: '8px 0', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                  <i className="ti ti-eraser" /> 지우기
                </button>
                <button onClick={() => setMemoMode(m => !m)} style={{ padding: '8px 0', background: memoMode ? 'var(--primary-light)' : 'var(--surface)', border: `1px solid ${memoMode ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 10, color: memoMode ? 'var(--primary)' : 'var(--text)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                  <i className="ti ti-pencil" /> {memoMode ? '메모 ON' : '메모'}
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
