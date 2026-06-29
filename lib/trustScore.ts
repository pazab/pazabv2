import { SupabaseClient } from "@supabase/supabase-js";

export const BADGE_DEFS: Record<string, { name: string; emoji: string; desc: string; cond: string; role?: "worker" | "employer" | "both" }> = {
  // 알바생 뱃지
  promise:  { name: "약속왕",   emoji: "🤝", desc: "모든 약속을 한 번도 어기지 않았어요.", cond: "노쇼 0회 + 계약 2회 이상", role: "worker" },
  highrate: { name: "고평점",   emoji: "⭐", desc: "꾸준히 높은 평점을 받았어요.",         cond: "리뷰 3개 이상 + 평균 4.5점 이상", role: "worker" },
  longterm: { name: "장기근무", emoji: "🌿", desc: "한 직장에서 3개월 이상 근무했어요.",   cond: "동일 매장 90일 이상", role: "worker" },
  quick:    { name: "즉시출근", emoji: "⚡", desc: "당일 출근 요청에 빠르게 응했어요.",    cond: "당일 출근 수락 3회 이상", role: "worker" },
  chat:     { name: "소통왕",   emoji: "💬", desc: "채팅 응답이 빠르고 원활해요.",         cond: "응답률 90% + 평균 1시간 이내", role: "worker" },
  multi:    { name: "멀티잡",   emoji: "🏪", desc: "다양한 곳에서 경험을 쌓았어요.",       cond: "2곳 이상 계약 완료", role: "worker" },
  contract: { name: "계약완료", emoji: "📋", desc: "정식 계약서로 투명하게 일했어요.",     cond: "전자계약 5회 이상", role: "worker" },
  // 사장님 뱃지
  boss_contract:  { name: "계약왕",    emoji: "📋", desc: "계약서를 성실하게 작성하는 사장님이에요.", cond: "계약서 5회 이상 작성", role: "employer" },
  boss_paymaster: { name: "페이마스터", emoji: "💰", desc: "급여를 제때 정확하게 지급해요.",          cond: "급여 명세서 10회 이상 발행", role: "employer" },
  boss_promise:   { name: "약속사장",  emoji: "🤝", desc: "면접 약속을 한 번도 어기지 않았어요.",    cond: "면접 노쇼 0회 + 채용 3회 이상", role: "employer" },
  boss_rehire:    { name: "단골사장",  emoji: "🔄", desc: "함께한 알바생을 다시 찾는 사장님이에요.", cond: "같은 알바생 재고용 1회 이상", role: "employer" },
  boss_veteran:   { name: "베테랑사장", emoji: "🏆", desc: "파잡에서 오래 활동한 믿을 수 있는 사장님이에요.", cond: "6개월 이상 운영 + 채용 5회 이상", role: "employer" },
};

export const GRADE_DEFS = [
  { key: "sprout",   emoji: "🌱", name: "새싹",   min: 0,  desc: "파잡에 처음 오신 걸 환영해요!" },
  { key: "steady",   emoji: "⚡", name: "성실",   min: 20, desc: "첫 계약을 완료했어요. 신뢰를 쌓아가는 단계예요." },
  { key: "passion",  emoji: "🔥", name: "열정",   min: 45, desc: "꾸준히 활동하며 신뢰를 쌓고 있어요." },
  { key: "trust",    emoji: "💎", name: "신뢰",   min: 65, desc: "파잡에서 검증된 알바생이에요." },
  { key: "pazabler", emoji: "👑", name: "파잡러", min: 85, desc: "파잡 최상위 등급이에요." },
];

export function getGrade(score: number) {
  return [...GRADE_DEFS].reverse().find(g => score >= g.min) || GRADE_DEFS[0];
}

// role에 맞는 뱃지만 필터링
export function getBadgesByRole(
  badges: { badge_key: string }[],
  role: "worker" | "employer"
) {
  return badges
    .filter(b => {
      const def = BADGE_DEFS[b.badge_key];
      return def && (def.role === role || def.role === "both");
    })
    .map(b => ({ key: b.badge_key, ...BADGE_DEFS[b.badge_key] }));
}

// 등급 + 뱃지 한번에 가져오기
export function getGradeBadgeDisplay(
  score: number,
  badges: { badge_key: string }[],
  role: "worker" | "employer"
) {
  return {
    grade: getGrade(score),
    badges: getBadgesByRole(badges, role),
  };
}

export async function addTrustScore(
  supabase: SupabaseClient,
  userId: string,
  delta: number,
  reason: string,
  category: "promise" | "attendance" | "reputation" | "activity"
) {
  const { data: user } = await supabase
    .from("users").select("trust_score").eq("id", userId).single();
  const current = user?.trust_score ?? 50;
  const next = Math.min(100, Math.max(0, current + delta));
  await supabase.from("users").update({ trust_score: next }).eq("id", userId);
  await supabase.from("trust_score_logs").insert({ user_id: userId, delta, reason, category });
  return next;
}

export async function checkAndAwardBadges(supabase: SupabaseClient, userId: string) {
  const { data: tm } = await supabase
    .from("team_members").select("id, hire_date, status, employer_id")
    .eq("worker_id", userId);
  const { data: matches } = await supabase
    .from("matches").select("id, hire_confirmed_by_worker, hire_confirmed_by_employer")
    .eq("worker_id", userId);
  const { data: att } = await supabase
    .from("attendance").select("status, work_date, team_member_id")
    .eq("worker_id", userId);
  const { data: existing } = await supabase
    .from("user_badges").select("badge_key").eq("user_id", userId);

  const earned = new Set(existing?.map(b => b.badge_key) || []);
  const toAward: string[] = [];

  const contracts = matches?.filter(m => m.hire_confirmed_by_worker && m.hire_confirmed_by_employer) || [];
  const noShows = att?.filter(a => a.status === "absent") || [];

  // 약속왕: 노쇼 0 + 계약 2회+
  if (!earned.has("promise") && noShows.length === 0 && contracts.length >= 2)
    toAward.push("promise");

  // 장기근무: 동일 매장 90일+
  if (!earned.has("longterm")) {
    const employerDays: Record<string, number> = {};
    att?.forEach(a => {
      const key = a.team_member_id;
      employerDays[key] = (employerDays[key] || 0) + 1;
    });
    if (Object.values(employerDays).some(d => d >= 90)) toAward.push("longterm");
  }

  // 멀티잡: 2곳 이상
  const uniqueEmployers = new Set(tm?.map(t => t.employer_id) || []);
  if (!earned.has("multi") && uniqueEmployers.size >= 2) toAward.push("multi");

  // 계약완료: 5회+
  if (!earned.has("contract") && contracts.length >= 5) toAward.push("contract");

  if (toAward.length > 0) {
    await supabase.from("user_badges").insert(
      toAward.map(badge_key => ({ user_id: userId, badge_key }))
    );
  }
  return toAward;
}