// PAZ Voice 유틸리티
// 음성 인식 결과 정규화 + 팀원 별명 해석
// Voice-First 원칙: 모든 기능은 음성으로 실행 가능해야 한다

// ── 음성 텍스트 정규화 ──────────────────────────────────────
export function normalizeVoiceText(text: string): string {
  return text
    // 띄어쓰기 변형 통일
    .replace(/발행해 줘|발행 해줘|발행 해 줘/g, "발행해줘")
    .replace(/알려 줘|알려 줘|알려 줘/g, "알려줘")
    .replace(/보내 줘|보내 줘/g, "보내줘")
    .replace(/확인해 줘|확인 해줘/g, "확인해줘")
    .replace(/조회해 줘|조회 해줘/g, "조회해줘")
    // 존댓말/반말 통일
    .replace(/발행해주세요|발행해주셔요/g, "발행해줘")
    .replace(/알려주세요|알려주셔요/g, "알려줘")
    .replace(/보내주세요|보내주셔요/g, "보내줘")
    // 숫자 변형
    .replace(/이번 달/g, "이번달")
    .replace(/이번 월/g, "이번달")
    .trim();
}

// ── 팀원 별명으로 타깃 찾기 ─────────────────────────────────
export function resolveVoiceTarget(
  text: string,
  members: any[]
): any | null {
  // 별명(PAZ 호칭) 우선, 닉네임 차선, 이메일 앞부분 최후
  for (const m of members) {
    const aliases = [
      m.nickname,                              // PAZ 호칭 (한글)
      m.users?.nickname,                       // 실제 닉네임
      m.users?.email?.split("@")[0],           // 이메일 앞부분
    ].filter(Boolean);

    if (aliases.some((a: string) => text.includes(a))) return m;
  }
  return null;
}

// ── 금액 음성 인식 정규화 ────────────────────────────────────
// "오만원" → 50000, "십만원" → 100000
export function parseVoiceAmount(text: string): number | null {
  // 한국어 숫자
  const koreanNums: Record<string, number> = {
    "일": 1, "이": 2, "삼": 3, "사": 4, "오": 5,
    "육": 6, "칠": 7, "팔": 8, "구": 9, "십": 10,
    "백": 100, "천": 1000
  };

  const patterns = [
    { regex: /(\d+)만\s*원/, multiplier: 10000 },
    { regex: /(\d+)천\s*원/, multiplier: 1000 },
    { regex: /(\d+)\s*원/, multiplier: 1 },
  ];

  for (const { regex, multiplier } of patterns) {
    const m = text.match(regex);
    if (m) return parseInt(m[1]) * multiplier;
  }
  return null;
}

// ── 날짜 음성 인식 정규화 ────────────────────────────────────
export function parseVoiceDate(text: string): { year?: number; month?: number } {
  const now = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const result: { year?: number; month?: number } = {};

  // "이번달" → 현재 월
  if (text.includes("이번달") || text.includes("이번 달")) {
    result.year = now.getFullYear();
    result.month = now.getMonth() + 1;
  }

  // "지난달" → 이전 월
  if (text.includes("지난달") || text.includes("저번달")) {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    result.year = prev.getFullYear();
    result.month = prev.getMonth() + 1;
  }

  // "X월" → 특정 월
  const monthMatch = text.match(/(\d+)월/);
  if (monthMatch) {
    result.year = result.year || now.getFullYear();
    result.month = parseInt(monthMatch[1]);
  }

  return result;
}

// ── 확인/취소 응답 감지 ──────────────────────────────────────
export function isConfirmResponse(text: string): boolean {
  const confirmKeywords = ["네", "응", "ㅇㅇ", "고고", "해줘", "맞아", "yes", "ok", "오케"];
  return confirmKeywords.some(k => text.trim() === k || text.trim().startsWith(k + " "));
}

export function isCancelResponse(text: string): boolean {
  const cancelKeywords = ["아니", "취소", "ㄴㄴ", "no", "안 해", "안해", "괜찮아"];
  return cancelKeywords.some(k => text.trim() === k || text.trim().startsWith(k));
}

// ── 액션 키워드 감지 ─────────────────────────────────────────
// 실제 DB 수정이 필요한 명령인지 판단
export function isActionCommand(text: string): boolean {
  const actionKeywords = ["발행", "보내줘", "발송", "처리해줘", "등록해줘", "수정해줘"];
  return actionKeywords.some(k => text.includes(k));
}

// ── 음성 로그 기록 ───────────────────────────────────────────
export async function logVoiceAction(
  supabase: any,
  params: {
    userId?: string;
    transcript: string;
    intent?: string;
    actionTaken?: string;
    success?: boolean;
    errorReason?: string;
  }
) {
  await supabase.from("voice_logs").insert({
    user_id: params.userId,
    raw_transcript: params.transcript,
    intent: params.intent,
    action_taken: params.actionTaken,
    success: params.success ?? true,
    error_reason: params.errorReason,
  }).catch(() => {});
}

// ── 음성 힌트 메시지 ─────────────────────────────────────────
// 각 페이지/탭에서 표시할 음성 명령 힌트
export const VOICE_HINTS: Record<string, string[]> = {
  attendance: [
    "오늘 출근 현황 알려줘",
    "이번달 근태 요약해줘",
    "누가 출근 안 했어?",
  ],
  payslip: [
    "이번달 급여 명세서 발행해줘",
    "예상 급여 얼마야?",
    "팀원 급여 알려줘",
  ],
  contract: [
    "계약서 미서명 팀원 알려줘",
    "계약서 알림 보내줘",
  ],
  team: [
    "팀원 목록 알려줘",
    "오늘 출근 현황 알려줘",
  ],
  worker_mywork: [
    "내 이번달 근무 알려줘",
    "예상 급여 얼마야?",
    "내 출근 기록 보여줘",
  ],
};
