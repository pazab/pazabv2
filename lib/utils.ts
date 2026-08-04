export const KOREAN_DAY_BY_INDEX = ["일", "월", "화", "수", "목", "금", "토"];

// work_days 문자열이 해당 요일을 포함하는지 판정 — 개별 요일 나열("월·화·수")과
// 매크로 표현("평일"/"주말"/"주5일"/"주6일"/"매일") 둘 다 지원. 요일 미설정(빈 값)이면 항상 false(오탐 방지).
// cron(app/api/cron/checkin), myteam.tsx, employer/team/[id] 세 곳에서 각자 다르게 판정하다 결근
// 자동처리가 조용히 빠지던 버그가 있어 단일 구현으로 통일함(2026-07-26).
export function isWorkingOnDay(workDays: string | null | undefined, dayKo: string): boolean {
  const workDaysStr = (workDays || "").toLowerCase();
  if (!workDaysStr) return false;
  const daysMap: Record<string, string> = { "월":"mon","화":"tue","수":"wed","목":"thu","금":"fri","토":"sat","일":"sun" };
  const engDay = daysMap[dayKo];
  if (workDaysStr.includes(dayKo) || (engDay && workDaysStr.includes(engDay))) return true;
  const weekdays = ["월","화","수","목","금"];
  const weekend = ["토","일"];
  if ((workDaysStr.includes("평일") || workDaysStr.includes("주5일")) && weekdays.includes(dayKo)) return true;
  if (workDaysStr.includes("주6일") && [...weekdays, "토"].includes(dayKo)) return true;
  if (workDaysStr.includes("주말") && weekend.includes(dayKo)) return true;
  if (workDaysStr.includes("매일") || workDaysStr.includes("월~일")) return true;
  return false;
}

// 계약서(contract_data)에 저장된 휴게시간(분)을 찾는다.
// 출퇴근 시각 차이는 휴게시간을 포함한 raw 값이라, 실근무시간 계산 시 이 값을 빼줘야 함 (없으면 0).
// 요일별 breakTimeMon~Sun 필드는 계약서 위자드가 "요일마다 달라요"(perDayHours)를 켰을 때만 실제로
// 개별 입력됨 — 꺼져 있으면(기본값) 폼 초기화 시 채워둔 상시 "30"이 그대로 남아있어 실제 공통
// breakTime(예: 60)과 다를 수 있으므로, perDayHours가 켜져 있을 때만 요일별 값을 신뢰한다.
const BREAK_DAYKEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function getBreakMinutesForDate(
  contracts: { status?: string | null; contract_data?: any }[] | null | undefined,
  dateStr: string
): number {
  const contract = contracts?.find(c => c.status === "active") || contracts?.[0];
  const cd = contract?.contract_data;
  if (!cd || cd.noBreak) return 0;
  let raw = cd.breakTime;
  if (cd.perDayHours) {
    const dayIdx = new Date(`${dateStr}T00:00:00`).getDay();
    const dk = BREAK_DAYKEYS[dayIdx];
    raw = cd[`breakTime${dk}`] ?? cd.breakTime;
  }
  const mins = parseInt(String(raw ?? "0"), 10);
  return isNaN(mins) ? 0 : mins;
}

// 주(월요일 시작) 단위 그룹핑 키 — 명세서 정산기간이 달력 월 기준이라 주 경계가 월을 넘나들 수 있는데,
// 이 함수 자체는 넘겨받은 attendance 배열 범위 안에서만 주 단위로 묶는다(월 경계 걸친 주는 각 월에서 부분 집계됨 — 기존 초과근무 계산과 동일한 한계).
function getWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay(); // 0=일 ~ 6=토
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  return monday.toISOString().slice(0, 10);
}

// 주휴수당(근로기준법 제55조): 주 15시간 이상 근무 + 그 주 결근(무단) 없이 개근한 주에 한해
// (주 실근로시간 ÷ 40) × 8시간분을 시급으로 별도 지급. 계약서에서 시급에 이미 포함해서
// 책정했다고 선언(wageIncludesWeeklyPay)한 경우는 이중지급 방지를 위해 0.
export function calcWeeklyHolidayPay(
  attendance: { work_date: string; status: string; actual_hours?: number | null }[] | null | undefined,
  contractHours: number,
  hourlyRate: number,
  wageIncludesWeeklyPay: boolean
): number {
  if (wageIncludesWeeklyPay || !hourlyRate || !attendance?.length) return 0;
  const weeks = new Map<string, { hours: number; hasAbsent: boolean }>();
  for (const a of attendance) {
    const key = getWeekKey(a.work_date);
    const w = weeks.get(key) || { hours: 0, hasAbsent: false };
    if (a.status === "absent") w.hasAbsent = true;
    else if (["normal", "late", "early_leave"].includes(a.status)) w.hours += a.actual_hours ?? contractHours;
    weeks.set(key, w);
  }
  let total = 0;
  for (const { hours, hasAbsent } of weeks.values()) {
    if (hasAbsent || hours < 15) continue;
    total += Math.round((hours / 40) * 8 * hourlyRate);
  }
  return total;
}

// 연장/야간 가산수당(근로기준법 제56조)은 상시근로자 5인 이상 사업장에만 의무 — 5인 미만이면
// 가산 없이 통상시급만 지급하면 됨(연장·야간 시간 자체의 기본급은 별도로 이미 지급됨).
export function getOvertimePremiumMultiplier(is5OrMore: boolean): number {
  return is5OrMore ? 1.5 : 1;
}
export function getNightPremiumMultiplier(is5OrMore: boolean): number {
  return is5OrMore ? 0.5 : 0;
}

export function getTrustGrade(score: number): { label: string; emoji: string; color: string } {
  if (score >= 90) return { label: "플래티넘", emoji: "💎", color: "#60a5fa" };
  if (score >= 75) return { label: "골드", emoji: "🥇", color: "#fbbf24" };
  if (score >= 60) return { label: "실버", emoji: "🥈", color: "#94a3b8" };
  if (score >= 45) return { label: "브론즈", emoji: "🥉", color: "#b45309" };
  return { label: "주의", emoji: "⚠️", color: "#ef4444" };
}

export function getMatchLevel(score: number): { label: string; emoji: string; color: string } {
  if (score >= 80) return { label: "환상의 짝꿍", emoji: "💕", color: "#a3e635" };
  if (score >= 65) return { label: "잘 맞아요", emoji: "👍", color: "#c4b5fd" };
  if (score >= 50) return { label: "괜찮아요", emoji: "😊", color: "#fbbf24" };
  return { label: "도전적이에요", emoji: "💪", color: "#94a3b8" };
}

// 매칭 이유 생성 (카드에 표시용)
export function getMatchReasons(
  item: any,
  userProfile: any,
  viewMode: "worker" | "employer"
): string[] {
  const reasons: string[] = [];
  if (!userProfile) return reasons;

  if (viewMode === "worker") {
    const workerResult = userProfile.worker_result || {};
    const cond = workerResult.practicalConditions || {};

    // 시급 비교
    const jobWage = item.wage || 0;
    const minWage = cond.minWage || 0;
    if (minWage && jobWage >= minWage) {
      reasons.push(`💰 시급 ${jobWage.toLocaleString()}원 (희망 이상)`);
    } else if (jobWage > 0 && !minWage) {
      reasons.push(`💰 시급 ${jobWage.toLocaleString()}원`);
    }

    // 지역 비교 (region: "충남 아산시 신창면 기준 자차 30분 이내" 형식)
    const jobRegion = item.region || "";
    const wantedRegion = cond.region || "";
    if (wantedRegion && jobRegion) {
      // 지역명 앞 2글자(시/도)나 앞 4글자(시/군/구)로 비교
      const regionKeyword = wantedRegion.slice(0, 5);
      if (jobRegion.includes(wantedRegion.slice(0, 2))) {
        reasons.push(`📍 희망 지역 인근`);
      }
    }

    // 요일 비교
    const jobDays = item.work_days || "";
    const preferredDays = cond.preferredDays || cond.workStyle || "";
    if (preferredDays && jobDays) {
      const dayKeywords = ["토", "일", "평일", "주말", "월", "화", "수", "목", "금"];
      const matched = dayKeywords.filter(d =>
        preferredDays.includes(d) && jobDays.includes(d)
      );
      if (matched.length > 0) reasons.push(`📅 선호 요일 일치`);
    }

    // 즉시 채용
    if (item.available_now) reasons.push(`⚡ 즉시 채용 가능`);

    // 선호 업종
    if (item.is_preferred_type) reasons.push(`⭐ 선호 업종이에요`);

  } else {
    // 사장님이 구직자 보는 경우
    if (item.experience === "있음" && item.experience_months > 0) {
      reasons.push(`📋 경력 ${item.experience_months}개월`);
    }
    if (item.available_now) reasons.push(`⚡ 즉시 근무 가능`);
    if (item.is_long_term) reasons.push(`🔒 장기 근무 선호`);
    if (item.is_preferred_type) reasons.push(`⭐ 우리 업종 선호해요`);
  }

  return reasons.slice(0, 3);
}

export function calcWorkPay({
  wage, startHour, endHour, workDays
}: {
  wage: number;
  startHour: number;
  endHour: number;
  workDays: string;
}) {
  // 일 근로시간
  const dailyHours = endHour > startHour
    ? endHour - startHour
    : 24 - startHour + endHour;

  // 주 근로일수
  const daysPerWeek =
    workDays === "평일" ? 5 :
    workDays === "주말" ? 2 :
    workDays === "평일+주말" ? 7 : 5;

  const weeklyHours = dailyHours * daysPerWeek;

  // 야간 시간 계산 (22~06시)
  const nightStart = 22, nightEnd = 6;
  let nightHours = 0;
  if (startHour >= nightStart || endHour <= nightEnd || endHour < startHour) {
    // 간단하게 야간 포함 여부만 체크
    nightHours = (startHour >= nightStart || endHour <= nightEnd) ? dailyHours : 0;
  }
  const hasNight = startHour >= 22 || endHour <= 6;

  // 주휴수당 여부 (주 15시간 이상)
  const hasWeeklyPay = weeklyHours >= 15;

  // 주휴수당 = (주근로시간 ÷ 40) × 8 × 시급 (최대 8시간)
  const weeklyPayHours = hasWeeklyPay
    ? Math.min(weeklyHours / daysPerWeek, 8)
    : 0;
  const weeklyPay = weeklyPayHours * wage;

  // 야간수당 (0.5배 가산)
  const nightExtra = hasNight ? dailyHours * wage * 0.5 * daysPerWeek : 0;

  // 주 기본급
  const weeklyBasic = wage * weeklyHours;

  // 월 환산 (4.345주)
  const monthlyBasic = Math.round((weeklyBasic + weeklyPay + nightExtra) * 4.345);

  return {
    dailyHours,
    weeklyHours,
    monthlyHours: Math.round(weeklyHours * 4.345),
    weeklyPay: Math.round(weeklyPay),
    hasWeeklyPay,
    hasNight,
    nightExtra: Math.round(nightExtra),
    monthlyPay: monthlyBasic,
  };
}

export const WORKER_TYPE_INFO: Record<string, { emoji: string; tagline: string; traits: string[]; good: string; bad: string; color: string }> = {
  "돌격대장형": { emoji: "⚡", tagline: "일단 뛰어들고 보는 행동파", traits: ["즉시 실행력", "빠른 적응", "추진력"], good: "에너지 넘치는 환경", bad: "느리고 반복적인 환경", color: "#fbbf24" },
  "완벽주의형": { emoji: "🎯", tagline: "실수 없이 완성도 높게", traits: ["꼼꼼함", "책임감", "정확성"], good: "세심함이 필요한 환경", bad: "대충 해도 되는 환경", color: "#93c5fd" },
  "팀플레이어형": { emoji: "🤝", tagline: "함께할 때 빛나는 타입", traits: ["협동", "소통", "배려"], good: "팀워크 중시 환경", bad: "혼자 하는 업무", color: "#86efac" },
  "올라운더형": { emoji: "🌟", tagline: "어디서든 잘 적응하는 만능형", traits: ["다재다능", "높은 적응력", "유연성"], good: "다양한 업무 환경", bad: "단순 반복 환경", color: "#fcd34d" },
  "열정폭발형": { emoji: "🔥", tagline: "에너지로 분위기를 바꾸는 타입", traits: ["높은 에너지", "긍정적 분위기", "열정"], good: "활기찬 환경", bad: "조용하고 정적인 환경", color: "#fb923c" },
  "성장추구형": { emoji: "📚", tagline: "배우면서 성장하는 스타일", traits: ["학습 의지", "성장 지향", "흡수력"], good: "배울 게 많은 환경", bad: "정체된 환경", color: "#a3e635" },
  "유연적응형": { emoji: "🎭", tagline: "변화에 강하고 유연한 타입", traits: ["유연성", "변화 적응", "즉흥성"], good: "변화가 많은 환경", bad: "딱딱한 규칙 환경", color: "#c4b5fd" },
  "장인기질형": { emoji: "💎", tagline: "한 우물 파는 전문성 타입", traits: ["집중력", "전문성", "꾸준함"], good: "한 분야 깊이 파는 환경", bad: "여러 일 동시에 하는 환경", color: "#60a5fa" },
  "안정추구형": { emoji: "🌿", tagline: "꾸준하고 믿음직한 타입", traits: ["안정성", "신뢰감", "일관성"], good: "규칙적이고 안정적인 환경", bad: "급변하는 환경", color: "#34d399" },
  "독립형": { emoji: "🦅", tagline: "혼자서도 척척 해내는 타입", traits: ["자립심", "집중력", "자기관리"], good: "자율적인 환경", bad: "간섭이 많은 환경", color: "#f472b6" },
  "소통달인형": { emoji: "💬", tagline: "말로 분위기를 살리는 타입", traits: ["소통력", "친화력", "손님 응대"], good: "사람 많은 환경", bad: "혼자 하는 업무", color: "#f9a8d4" },
  "균형잡기형": { emoji: "⚖️", tagline: "워라밸 지키며 꾸준히 하는 타입", traits: ["균형감", "자기조절", "지속성"], good: "워라밸 좋은 환경", bad: "과도한 초과근무 환경", color: "#94a3b8" },
};

export const EMPLOYER_TYPE_INFO: Record<string, { emoji: string; tagline: string; traits: string[]; good: string; bad: string; color: string }> = {
  "원칙주의형": { emoji: "📋", tagline: "규칙과 기준이 명확해요", traits: ["규칙 준수", "시간 엄수", "매뉴얼 중심"], good: "꼼꼼하고 책임감 있는 알바생", bad: "즉흥적인 알바생", color: "#93c5fd" },
  "가족같은형": { emoji: "🤗", tagline: "따뜻하고 편안한 분위기", traits: ["화목한 분위기", "소통 중시", "배려하는 환경"], good: "정 많고 사교적인 알바생", bad: "거리감 있는 알바생", color: "#fcd34d" },
  "성과중심형": { emoji: "🚀", tagline: "잘하면 인정받는 환경", traits: ["성과 보상", "능력 우선", "경쟁적 환경"], good: "목표 지향적인 알바생", bad: "느긋하게 일하는 알바생", color: "#a3e635" },
  "시스템형": { emoji: "🧩", tagline: "체계적으로 운영돼요", traits: ["체계적 운영", "역할 분담", "프로세스 중심"], good: "빠르게 배우는 알바생", bad: "자유분방한 알바생", color: "#c4b5fd" },
  "멘토형": { emoji: "🌱", tagline: "가르쳐주고 성장시켜줘요", traits: ["성장 지원", "피드백 제공", "육성 중시"], good: "배우려는 의지가 강한 알바생", bad: "이미 다 안다는 알바생", color: "#86efac" },
  "자율신뢰형": { emoji: "🎯", tagline: "믿고 맡기는 스타일", traits: ["자율적인 환경", "간섭 최소화", "결과로 평가"], good: "스스로 알아서 하는 알바생", bad: "세세한 지시가 필요한 알바생", color: "#34d399" },
  "응원단장형": { emoji: "👔", tagline: "항상 긍정적이고 응원해줘요", traits: ["긍정적 분위기", "칭찬 많음", "활기찬 환경"], good: "에너지 넘치는 알바생", bad: "소극적인 알바생", color: "#fb923c" },
  "꼼꼼체크형": { emoji: "🔍", tagline: "꼼꼼하게 확인하는 스타일", traits: ["세세한 확인", "품질 중시", "꼼꼼한 관리"], good: "정확하고 실수 없는 알바생", bad: "대충 하는 알바생", color: "#f472b6" },
  "파트너형": { emoji: "🤝", tagline: "수평적으로 함께하는 스타일", traits: ["수평적 관계", "자유로운 소통", "편안한 분위기"], good: "유머 있고 사교적인 알바생", bad: "딱딱하고 형식적인 알바생", color: "#f9a8d4" },
  "창의적형": { emoji: "💡", tagline: "새로운 시도를 즐기는 스타일", traits: ["창의적 도전", "변화 추구", "아이디어 중시"], good: "창의적이고 도전적인 알바생", bad: "변화를 싫어하는 알바생", color: "#fbbf24" },
  "스피드형": { emoji: "🏃", tagline: "빠른 템포로 운영해요", traits: ["빠른 처리", "효율 중시", "스피드 우선"], good: "눈치 빠르고 빠른 알바생", bad: "느리고 신중한 알바생", color: "#60a5fa" },
  "안정중시형": { emoji: "🛡️", tagline: "꾸준하고 안정적인 환경이에요", traits: ["안정적 운영", "낮은 이직률", "편안한 분위기"], good: "장기근무 원하는 알바생", bad: "변화를 즐기는 알바생", color: "#94a3b8" },
};
