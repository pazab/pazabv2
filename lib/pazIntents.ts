// PAZ 인텐트 정의 파일
// 키워드 매칭으로 처리 가능한 것들 (Claude API 비용 없음)

export interface PazIntent {
  id: string;
  description: string;
  userTypes: ("employer" | "worker" | "both")[];
  match: (text: string) => boolean;
}

export const PAZ_INTENTS: PazIntent[] = [
  // ── 사장님 인텐트 ──
  {
    id: "attendance_today",
    description: "오늘 출근 현황",
    userTypes: ["employer", "both"],
    match: (t) =>
      t.includes("출근") &&
      (t.includes("현황") || t.includes("확인") || t.includes("했어") ||
       t.includes("했나") || t.includes("누가") || t.includes("몇명") || t.includes("알려")),
  },
  {
    id: "salary_estimate",
    description: "이번달 예상 급여",
    userTypes: ["employer", "worker", "both"],
    match: (t) =>
      t.includes("예상 급여") || t.includes("이번달 급여") ||
      (t.includes("급여") && t.includes("얼마")) ||
      (t.includes("월급") && t.includes("얼마")),
  },
  {
    id: "contract_notify",
    description: "계약서 미서명 알림",
    userTypes: ["employer", "both"],
    match: (t) =>
      t.includes("계약서") &&
      (t.includes("알림") || t.includes("보내") ||
       t.includes("미서명") || t.includes("안 한") || t.includes("독촉")),
  },
  {
    id: "attendance_summary",
    description: "이번달 근태 요약",
    userTypes: ["employer", "both"],
    match: (t) =>
      t.includes("근태") &&
      (t.includes("요약") || t.includes("현황") || t.includes("이번달") || t.includes("정리")),
  },
  {
    id: "team_status",
    description: "팀원 현황",
    userTypes: ["employer", "both"],
    match: (t) =>
      (t.includes("팀원") || t.includes("직원")) &&
      (t.includes("현황") || t.includes("몇명") || t.includes("누구") || t.includes("있어")),
  },
  // ── 알바생 인텐트 ──
  {
    id: "my_attendance",
    description: "내 이번달 근태",
    userTypes: ["worker", "both"],
    match: (t) =>
      (t.includes("내 근태") || t.includes("내 출근") ||
      (t.includes("이번달") && (t.includes("근무") || t.includes("근태") || t.includes("출근")))),
  },
  {
    id: "my_salary",
    description: "내 예상 급여",
    userTypes: ["worker", "both"],
    match: (t) =>
      (t.includes("내") || t.includes("나")) &&
      (t.includes("급여") || t.includes("월급") || t.includes("페이")),
  },
  {
    id: "unsigned_contracts",
    description: "미서명 계약서 확인",
    userTypes: ["employer", "both"],
    match: (t) =>
      t.includes("계약서") &&
      (t.includes("미작성") || t.includes("없는") || t.includes("확인") || t.includes("현황")),
  },
];

// 인텐트 매칭 함수
export function matchPazIntent(
  text: string,
  userType: string
): PazIntent | null {
  const t = text.toLowerCase();
  for (const intent of PAZ_INTENTS) {
    const typeMatch =
      intent.userTypes.includes("both") ||
      intent.userTypes.includes(userType as any) ||
      userType === "both";
    if (typeMatch && intent.match(t)) return intent;
  }
  return null;
}
