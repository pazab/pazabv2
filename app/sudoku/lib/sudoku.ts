export type 난이도타입 = '초급' | '중급' | '고급' | '전문가'

export const 난이도설정 = {
  초급: { 빈칸: 35, 설명: '느긋하게 풀어요' },
  중급: { 빈칸: 45, 설명: '집중이 필요해요' },
  고급: { 빈칸: 52, 설명: '꽤 어려워요' },
  전문가: { 빈칸: 58, 설명: '최고난이도예요' },
}

export function 퍼즐생성(난이도: 난이도타입): { 퍼즐: number[][], 정답: number[][] } {
  const 판: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0))

  function 채우기(판: number[][]): boolean {
    for (let 행 = 0; 행 < 9; 행++) {
      for (let 열 = 0; 열 < 9; 열++) {
        if (판[행][열] === 0) {
          const 숫자들 = [1,2,3,4,5,6,7,8,9].sort(() => Math.random() - 0.5)
          for (const 숫자 of 숫자들) {
            if (가능한가(판, 행, 열, 숫자)) {
              판[행][열] = 숫자
              if (채우기(판)) return true
              판[행][열] = 0
            }
          }
          return false
        }
      }
    }
    return true
  }

  채우기(판)
  const 정답 = 판.map(행 => [...행])

  function 해답개수(퍼즐: number[][]): number {
    let 개수 = 0
    const 복사 = 퍼즐.map(r => [...r])
    function 풀기(): void {
      if (개수 >= 2) return
      for (let 행 = 0; 행 < 9; 행++) {
        for (let 열 = 0; 열 < 9; 열++) {
          if (복사[행][열] === 0) {
            for (let n = 1; n <= 9; n++) {
              if (가능한가(복사, 행, 열, n)) {
                복사[행][열] = n
                풀기()
                복사[행][열] = 0
              }
            }
            return
          }
        }
      }
      개수++
    }
    풀기()
    return 개수
  }

  const 퍼즐 = 판.map(행 => [...행])
  const 빈칸수 = 난이도설정[난이도].빈칸
  const 위치목록: [number, number][] = []
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      위치목록.push([r, c])
  위치목록.sort(() => Math.random() - 0.5)

  let 제거됨 = 0
  for (const [행, 열] of 위치목록) {
    if (제거됨 >= 빈칸수) break
    const 원래값 = 퍼즐[행][열]
    퍼즐[행][열] = 0
    if (해답개수(퍼즐) === 1) {
      제거됨++
    } else {
      퍼즐[행][열] = 원래값
    }
  }

  return { 퍼즐, 정답 }
}

export function 가능한가(판: number[][], 행: number, 열: number, 숫자: number) {
  for (let c = 0; c < 9; c++) if (판[행][c] === 숫자) return false
  for (let r = 0; r < 9; r++) if (판[r][열] === 숫자) return false
  const 박스행 = Math.floor(행 / 3) * 3
  const 박스열 = Math.floor(열 / 3) * 3
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      if (판[박스행 + r][박스열 + c] === 숫자) return false
  return true
}

export function 완성됐나(판: number[][], 오답: Set<string>) {
  if (오답.size > 0) return false
  for (let 행 = 0; 행 < 9; 행++)
    for (let 열 = 0; 열 < 9; 열++)
      if (판[행][열] === 0) return false
  return true
}

export function 시간표시(초: number) {
  const 분 = Math.floor(초 / 60)
  const 나머지초 = 초 % 60
  return `${String(분).padStart(2, '0')}:${String(나머지초).padStart(2, '0')}`
}

export function 숫자남은개수(판: number[][], 숫자: number) {
  let 개수 = 0
  for (let 행 = 0; 행 < 9; 행++)
    for (let 열 = 0; 열 < 9; 열++)
      if (판[행][열] === 숫자) 개수++
  return 개수
}

export function 논리풀기(판: number[][]): { 성공: boolean, 결과판: number[][] } {
  const 가상판 = 판.map(r => [...r])
  let 변경됨 = true
  while (변경됨) {
    변경됨 = false
    const 후보맵 = new Map<string, number[]>()
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (가상판[r][c] !== 0) continue
        const 후보 = [1,2,3,4,5,6,7,8,9].filter(n => 가능한가(가상판, r, c, n))
        if (후보.length === 0) return { 성공: false, 결과판: 가상판 }
        후보맵.set(`${r},${c}`, 후보)
      }
    }
    for (const [키, 후보] of 후보맵) {
      if (후보.length === 1) {
        const [r, c] = 키.split(',').map(Number)
        가상판[r][c] = 후보[0]
        변경됨 = true
      }
    }
    if (변경됨) continue
    행루프: for (let r = 0; r < 9; r++) {
      for (let n = 1; n <= 9; n++) {
        const 가능열 = [] as number[]
        for (let c = 0; c < 9; c++)
          if (가상판[r][c] === 0 && (후보맵.get(`${r},${c}`) ?? []).includes(n)) 가능열.push(c)
        if (가능열.length === 1) { 가상판[r][가능열[0]] = n; 변경됨 = true; break 행루프 }
      }
    }
    if (변경됨) continue
    열루프: for (let c = 0; c < 9; c++) {
      for (let n = 1; n <= 9; n++) {
        const 가능행 = [] as number[]
        for (let r = 0; r < 9; r++)
          if (가상판[r][c] === 0 && (후보맵.get(`${r},${c}`) ?? []).includes(n)) 가능행.push(r)
        if (가능행.length === 1) { 가상판[가능행[0]][c] = n; 변경됨 = true; break 열루프 }
      }
    }
    if (변경됨) continue
    박스루프: for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        for (let n = 1; n <= 9; n++) {
          const 가능위치 = [] as [number, number][]
          for (let r = br*3; r < br*3+3; r++)
            for (let c = bc*3; c < bc*3+3; c++)
              if (가상판[r][c] === 0 && (후보맵.get(`${r},${c}`) ?? []).includes(n)) 가능위치.push([r,c])
          if (가능위치.length === 1) { 가상판[가능위치[0][0]][가능위치[0][1]] = n; 변경됨 = true; break 박스루프 }
        }
      }
    }
  }
  return { 성공: 가상판.flat().every(n => n !== 0), 결과판: 가상판 }
}
