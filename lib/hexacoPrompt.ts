/**
 * lib/hexacoPrompt.ts — STEP 5: 5턴 HEXACO 프롬프트 설계
 * 결정 3: C·H·A에 턴 집중, E·X·O는 가볍게
 */

export type HexacoFactor =
  | 'honesty'
  | 'conscientiousness'
  | 'agreeableness'
  | 'extraversion'
  | 'emotionality'
  | 'openness'

export type TurnDepth = 'deep' | 'normal' | 'light'

export interface TurnConfig {
  turn: number
  factors: HexacoFactor[]
  depth: TurnDepth
  label: string
}

/**
 * 5턴 배분 (결정 3)
 * 매칭 영향도: 성실성(C) -24점 > 정직성(H) 노쇼예측 > 원만성(A) +8 > E·X·O
 */
export const TURN_FOCUS: TurnConfig[] = [
  { turn: 1, factors: ['conscientiousness'], depth: 'deep',   label: '책임감·시간약속' },
  { turn: 2, factors: ['honesty'],           depth: 'deep',   label: '신뢰·정직' },
  { turn: 3, factors: ['agreeableness'],     depth: 'normal', label: '협업·갈등' },
  { turn: 4, factors: ['extraversion', 'emotionality'], depth: 'light', label: '성격·감정' },
  { turn: 5, factors: ['openness'],          depth: 'light',  label: '개방성·마무리' },
]

/**
 * 턴별 시스템 프롬프트 생성
 */
export function buildTurnPrompt(
  turn: number,
  userRole: 'worker' | 'employer'
): string {
  const config = TURN_FOCUS.find(t => t.turn === turn)
  if (!config) return ''

  const roleCtx = userRole === 'worker'
    ? '알바생 지원자'
    : '사장님'

  const depthGuide = {
    deep: '이 요인에 대해 깊이 탐색하는 질문을 하세요. 구체적인 상황과 행동을 물어보세요.',
    normal: '이 요인을 적당한 깊이로 탐색하세요. 1~2개의 구체적 사례를 유도하세요.',
    light: '이 요인을 가볍게 확인하세요. 간단한 선호나 경향을 파악하면 됩니다.',
  }[config.depth]

  return `당신은 ${roleCtx}의 HEXACO 성향을 분석하는 대화형 인터뷰어입니다.

지금은 턴 ${turn}/5입니다. 집중 요인: ${config.factors.join(', ')} (${config.label})

${depthGuide}

규칙:
- 한 번에 하나의 질문만 (복수 금지)
- 한국어로, 친근하고 자연스럽게
- 직접 "성실성이 있나요?" 같은 직접적 질문 금지
- 상황·행동·판단을 통해 자연스럽게 측정
- 대화 길이: 2~4문장 이내`
}

/**
 * 6요인 기본값 (HEXACO 미완료 시 폴백)
 */
export const DEFAULT_HEXACO: Record<HexacoFactor, number> = {
  honesty: 3,
  conscientiousness: 3,
  agreeableness: 3,
  extraversion: 3,
  emotionality: 3,
  openness: 3,
}
