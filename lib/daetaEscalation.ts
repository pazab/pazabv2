/**
 * lib/daetaEscalation.ts — 대타 SOS 에스컬레이션 엔진 (서버 전용, 서비스롤 클라이언트 주입)
 * 루프: ① 팀 내 알림 → ② 동네 Tier1 공개 → ③ 신규(Tier2) 포함(opt-in) → ④ 공개 SOS
 * 사용처: /api/daeta/sos (발동), /api/cron/daeta-escalate (단계 자동 전진)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/notify";
import { getWorkerTiers } from "@/lib/daetaTier";
import { calcKoreanAge, isNightWorkHours, formatDaetaDateRange } from "@/lib/utils";

export interface DaetaPostingRow {
  id: string;
  user_id: string;
  business_name: string;
  region: string;
  lat: number;
  lng: number;
  work_date: string;
  work_date_end?: string | null;
  work_hours: string;
  wage: number;
  base_wage: number;
  max_urgent_pct: number;
  duty: string;
  status: string;
  escalation_stage: number;
  stage_updated_at: string | null;
  allow_new: boolean;
  created_at: string;
  expires_at: string;
}

export interface SosConfig {
  stage1_wait_min: number;
  stage2_wait_min: number;
  stage3_wait_min: number;
  radius_km: number;
  urgent_pct_same_day: number;
  urgent_pct_3h: number;
  stage2_pct: number;
  stage3_pct: number;
  stage4_pct: number;
}

const DEFAULT_CONFIG: SosConfig = {
  stage1_wait_min: 10,
  stage2_wait_min: 30,
  stage3_wait_min: 30,
  radius_km: 10,
  urgent_pct_same_day: 20,
  urgent_pct_3h: 30,
  stage2_pct: 10,
  stage3_pct: 20,
  stage4_pct: 30,
};

// 안 잡히고 단계가 오를수록(escalation_stage) 사장님이 등록 시 동의한 상한(max_urgent_pct) 안에서만 자동 인상
const STAGE_PCT_KEY: Record<number, keyof SosConfig> = { 2: "stage2_pct", 3: "stage3_pct", 4: "stage4_pct" };

// 단계 전진(stage1_wait_min~stage3_wait_min, 합계 70분)은 "등록 후 경과 시간"만 보고 돈다 — 근무일이
// 며칠 뒤든 상관없이 70분이면 전체공개까지 다 도달함. 확산 단계(누구에게 보이는지)가 빨리 넓어지는
// 건 리드타임이 길어도 해롭지 않지만(오히려 노출 기회가 늘어남), 시급 자동인상까지 같이 따라가면
// "안 급한데 급한 것처럼" 며칠씩 과할증 상태로 방치됨 — 그래서 시급 인상만 실제 근무 임박(24시간
// 이내)일 때로 분리해서 게이팅한다(2026-09-04). 등록 화면 미리보기(DaetaRegisterModal.tsx)에도
// 안내 문구를 같이 달아야 함.
const WAGE_BUMP_MAX_LEAD_HOURS = 24;

export function computeAutoWage(posting: DaetaPostingRow, nextStage: number, cfg: SosConfig, now: Date = new Date()): number {
  const pctKey = STAGE_PCT_KEY[nextStage];
  if (!pctKey) return posting.wage;
  const hoursUntilShift = (new Date(posting.expires_at).getTime() - now.getTime()) / 3600000;
  if (hoursUntilShift > WAGE_BUMP_MAX_LEAD_HOURS) return posting.wage;
  const appliedPct = Math.min(cfg[pctKey], posting.max_urgent_pct || 0);
  if (appliedPct <= 0) return posting.wage;
  return Math.round((posting.base_wage * (1 + appliedPct / 100)) / 10) * 10;
}

export async function getSosConfig(sb: SupabaseClient): Promise<SosConfig> {
  const cfg = { ...DEFAULT_CONFIG };
  const { data } = await sb.from("daeta_sos_config").select("key, value");
  (data || []).forEach((row: { key: string; value: number }) => {
    if (row.key in cfg) (cfg as unknown as Record<string, number>)[row.key] = row.value;
  });
  return cfg;
}

function toRad(d: number) { return d * Math.PI / 180; }
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function postingSummary(p: DaetaPostingRow) {
  return `${formatDaetaDateRange(p.work_date, p.work_date_end)} ${p.work_hours} · 시급 ${p.wage.toLocaleString()}원`;
}

const WARN_BEFORE_MIN = 5;

/**
 * 확산 임박 예고 — 다음 단계로 넘어가기 WARN_BEFORE_MIN분 전, 사장님에게 취소 기회 제공.
 * notifications.data에 daetaPostingId+warnStage를 남겨 중복 발송 방지(별도 스키마 없이 재사용).
 */
async function maybeWarnExpansion(sb: SupabaseClient, posting: DaetaPostingRow, stage: number) {
  const { data: existing } = await sb
    .from("notifications")
    .select("id")
    .eq("user_id", posting.user_id)
    .eq("type", "daeta")
    .eq("data->>daetaPostingId", posting.id)
    .eq("data->>warnStage", String(stage))
    .maybeSingle();
  if (existing) return;

  const nextLabel = stage === 1 ? "동네 ✅검증 인력" : stage === 2 ? "🔵신규 알바생" : "전체 공개 SOS";
  await createNotification({
    userId: posting.user_id,
    type: "daeta",
    title: "⏳ 잠시 후 대타 요청이 넓어져요",
    body: `${WARN_BEFORE_MIN}분 뒤 ${nextLabel}으로 확대돼요. 원치 않으면 지금 요청을 취소할 수 있어요.`,
    url: "/daeta",
    data: { daetaPostingId: posting.id, warnStage: stage },
  });
}

/** ① 팀 내 알림 — 사장님 소속 active 팀원 전원에게 발송. 알림 보낸 인원 수 반환 */
export async function notifyTeam(sb: SupabaseClient, posting: DaetaPostingRow, excludeWorkerId?: string): Promise<number> {
  const { data: members } = await sb
    .from("team_members")
    .select("worker_id")
    .eq("employer_id", posting.user_id)
    .eq("status", "active");

  const workerIds = [...new Set((members || []).map((m: { worker_id: string }) => m.worker_id))]
    .filter(id => id && id !== posting.user_id && id !== excludeWorkerId);

  await Promise.all(workerIds.map(workerId =>
    createNotification({
      userId: workerId,
      type: "daeta",
      title: `⚡ ${posting.business_name} 대타 SOS`,
      body: `${postingSummary(posting)} — 우리 매장 펑크! 가장 먼저 수락하면 확정돼요`,
      url: "/daeta",
      data: { daetaPostingId: posting.id, stage: 1 },
    })
  ));
  return workerIds.length;
}

/** ②③ 동네 알림 — 반경 내 대타 가능(available_now) 알바생 중 해당 Tier에게 발송 */
export async function notifyNearby(
  sb: SupabaseClient,
  posting: DaetaPostingRow,
  targetTier: "tier1" | "tier2",
  radiusKm: number,
  excludeWorkerId?: string
): Promise<number> {
  const { data: workers } = await sb
    .from("worker_profiles")
    .select("user_id, lat, lng, available_now, is_active")
    .eq("is_active", true)
    .eq("available_now", true)
    .not("lat", "is", null);

  const nearby = (workers || []).filter((w: { user_id: string; lat: number; lng: number }) =>
    w.user_id !== posting.user_id &&
    w.user_id !== excludeWorkerId &&
    distanceKm({ lat: w.lat, lng: w.lng }, { lat: posting.lat, lng: posting.lng }) <= radiusKm
  );
  if (nearby.length === 0) return 0;

  const ids = [...new Set(nearby.map((w: { user_id: string }) => w.user_id))];
  const tiers = await getWorkerTiers(sb, ids);
  let targets = ids.filter(id => tiers[id] === targetTier);

  // 근로기준법상 연소근로자(만 18세 미만)는 22~06시 야간근무가 원칙적으로 금지됨.
  // 대화·확인 절차 없이 후보 풀 단계에서 자동 제외 — 생년월일 미확인자도 안전하게 제외(fail-safe).
  if (isNightWorkHours(posting.work_hours) && targets.length > 0) {
    const { data: userRows } = await sb.from("users").select("id, birth_date").in("id", targets);
    const confirmedAdults = new Set(
      (userRows || [])
        .filter((u: { id: string; birth_date: string | null }) => {
          const age = calcKoreanAge(u.birth_date);
          return age !== null && age >= 18;
        })
        .map((u: { id: string }) => u.id)
    );
    targets = targets.filter(id => confirmedAdults.has(id));
  }
  if (targets.length === 0) return 0;

  const title = targetTier === "tier1"
    ? `⚡ 동네 대타 SOS — ${posting.business_name}`
    : `🔵 첫 대타 기회 — ${posting.business_name}`;
  const body = targetTier === "tier1"
    ? `${postingSummary(posting)} · 검증 인력 우선 공개! 지금 지원하면 선점`
    : `${postingSummary(posting)} · 첫 대타를 뛰면 ✅검증 등급으로 승격돼요`;

  await Promise.all(targets.map(workerId =>
    createNotification({
      userId: workerId,
      type: "daeta",
      title,
      body,
      url: "/daeta",
      data: { daetaPostingId: posting.id, stage: targetTier === "tier1" ? 2 : 3 },
    })
  ));
  return targets.length;
}

/**
 * 확정된 대타 인력이 이탈(노쇼 또는 사전 취소)했을 때 공고를 재오픈하고 즉시 재확산.
 * "돈으로 위로금을 주는 대신 속도로 확실히 채워준다" 방향(DESIGN_PLAN.md §11) —
 * 노쇼(lib/daetaNoShow.ts)와 알바생측 사전취소(app/api/daeta/cancel) 양쪽에서 공용으로 쓴다.
 * 신뢰점수/정지 페널티는 호출부마다 성격이 달라서(노쇼=-30 고정, 취소=90일 누적 가중) 여기서 다루지 않는다.
 */
export async function reescalateAfterDropout(
  sb: SupabaseClient,
  posting: DaetaPostingRow,
  excludeWorkerId: string,
  employerNotifyTitle: string,
  employerNotifyBodyPrefix: string
): Promise<{ teamNotified: number; nearbyNotified: number }> {
  const cfg = await getSosConfig(sb);
  const targetStage = Math.max(posting.escalation_stage || 1, posting.allow_new ? 3 : 2);
  const newWage = computeAutoWage(posting, targetStage, cfg);

  await sb.from("daeta_postings").update({
    status: "pending",
    escalation_stage: targetStage,
    stage_updated_at: new Date().toISOString(),
    wage: newWage,
  }).eq("id", posting.id);

  const reopenedPosting: DaetaPostingRow = { ...posting, status: "pending", escalation_stage: targetStage, wage: newWage };
  const [teamNotified, nearbyNotified] = await Promise.all([
    notifyTeam(sb, reopenedPosting, excludeWorkerId),
    notifyNearby(sb, reopenedPosting, targetStage >= 3 ? "tier2" : "tier1", cfg.radius_km, excludeWorkerId),
  ]);

  await createNotification({
    userId: posting.user_id,
    type: "daeta",
    title: employerNotifyTitle,
    body: `${employerNotifyBodyPrefix} 팀원 ${teamNotified}명 + 동네 인력 ${nearbyNotified}명에게 알림이 갔어요.`,
    url: "/daeta",
    data: { daetaPostingId: posting.id },
  });

  return { teamNotified, nearbyNotified };
}

/**
 * 근무 시작 시각(expires_at)이 지나도록 아무도 못 구한 pending 공고를 expired 처리.
 * 사용처: /api/cron/daeta-escalate(5분 주기), /api/daeta/expire-check(클라이언트가 대타 홈을 열 때 즉시 반영용).
 * 공고만 닫고 끝내면 거기 딸린 pending 지원자가 알림도 못 받고 영원히 pending으로 방치되므로
 * (사장님이 직접 취소하는 /api/daeta/cancel-posting과 동일하게) 지원자 정리 + 알림까지 함께 처리한다.
 */
export async function expireStalePostings(sb: SupabaseClient, now: Date): Promise<string[]> {
  const { data: expiredPostings } = await sb
    .from("daeta_postings")
    .select("id, user_id, business_name, work_date, work_date_end, work_hours, wage")
    .eq("status", "pending")
    .lte("expires_at", now.toISOString());

  if (!expiredPostings || expiredPostings.length === 0) return [];

  const ids = expiredPostings.map((p: { id: string }) => p.id);
  await sb.from("daeta_postings").update({ status: "expired" }).in("id", ids);

  await Promise.all(expiredPostings.map((p: {
    id: string; user_id: string; business_name: string; work_date: string; work_date_end: string | null; work_hours: string; wage: number;
  }) =>
    createNotification({
      userId: p.user_id,
      type: "daeta",
      title: "😢 이번 대타는 결국 못 구했어요",
      body: `${p.business_name} ${formatDaetaDateRange(p.work_date, p.work_date_end)} ${p.work_hours} · 시급 ${p.wage.toLocaleString()}원 요청이 만료됐어요. 다시 등록하거나 아는 알바생에게 카톡으로 직접 요청해보세요.`,
      url: "/daeta",
      data: { daetaPostingId: p.id },
    })
  ));

  const { data: strandedApplicants } = await sb
    .from("matches")
    .select("id, worker_id, daeta_posting_id")
    .in("daeta_posting_id", ids)
    .eq("progress_status", "pending");

  if (strandedApplicants?.length) {
    const postingById = new Map(expiredPostings.map((p: { id: string; business_name: string }) => [p.id, p]));
    await sb.from("matches")
      .update({ progress_status: "rejected", message: "대타 요청이 만료되어 자동 종료됨" })
      .in("id", strandedApplicants.map((m: { id: string }) => m.id));

    await Promise.all(strandedApplicants.map((m: { id: string; worker_id: string; daeta_posting_id: string }) => {
      const posting = postingById.get(m.daeta_posting_id) as { business_name: string } | undefined;
      return createNotification({
        userId: m.worker_id,
        type: "daeta",
        title: "⌛ 대타 요청이 만료됐어요",
        body: `${posting?.business_name || "매장"} 대타는 근무 시작 시각까지 아무도 확정되지 않아 요청이 만료됐어요. 다른 대타를 찾아보세요!`,
        url: "/daeta",
        data: { daetaPostingId: m.daeta_posting_id },
      });
    }));
  }

  return ids;
}

// 리드타임(등록~근무 시작) 대비 단계별 대기시간 비율 — stage1/2/3_wait_min은 하한선으로 그대로 두고,
// 리드타임이 길수록(최대 7일) 이 비율만큼 늘어남. 진짜 긴급(리드타임 ~3시간 이내)은 비율값이
// 하한선보다 작아서 max()가 항상 하한선을 골라 지금과 완전히 동일한 속도를 유지한다 — 계산:
// 3시간(180분) 기준 stage1=180*0.05=9<10, stage2/3=180*0.15=27<30, 전부 하한선 승. 리드타임이
// 길어질 때만(며칠짜리 공고) 비율값이 하한선을 넘어서면서 전환이 자연스럽게 퍼진다. 근거: 시급
// 자동인상은 24시간 게이팅했지만(computeAutoWage) stage 2/3 전환마다 나가는 실제 푸시 알림
// (notifyNearby)은 그대로라서, 안 급한 공고가 등록 70분 만에 동네·신규 인력한테까지 "긴급"
// 알림이 뿌려지는 문제가 남아있었음(2026-09-04).
const STAGE_WAIT_LEAD_FRACTION: Record<number, number> = { 1: 0.05, 2: 0.15, 3: 0.15 };

/**
 * 단계 전진. 전진했으면 새 stage 반환, 아니면 null.
 * 규칙: 1→2 (stage1_wait 경과), 2→3 (allow_new) 또는 2→4, 3→4
 */
export async function advancePostingStage(
  sb: SupabaseClient,
  posting: DaetaPostingRow,
  cfg: SosConfig,
  now: Date = new Date()
): Promise<number | null> {
  const stage = posting.escalation_stage || 1;
  if (stage >= 4) return null;

  const stageStart = new Date(posting.stage_updated_at || posting.created_at).getTime();
  const elapsedMin = (now.getTime() - stageStart) / 60000;

  const totalLeadMin = (new Date(posting.expires_at).getTime() - new Date(posting.created_at).getTime()) / 60000;
  const baseWaitMap: Record<number, number> = {
    1: cfg.stage1_wait_min,
    2: cfg.stage2_wait_min,
    3: cfg.stage3_wait_min,
  };
  const waitMap: Record<number, number> = {
    1: Math.max(baseWaitMap[1], totalLeadMin * STAGE_WAIT_LEAD_FRACTION[1]),
    2: Math.max(baseWaitMap[2], totalLeadMin * STAGE_WAIT_LEAD_FRACTION[2]),
    3: Math.max(baseWaitMap[3], totalLeadMin * STAGE_WAIT_LEAD_FRACTION[3]),
  };
  if (elapsedMin < waitMap[stage]) {
    if (elapsedMin >= waitMap[stage] - WARN_BEFORE_MIN) {
      await maybeWarnExpansion(sb, posting, stage);
    }
    return null;
  }

  let nextStage: number;
  if (stage === 1) nextStage = 2;
  else if (stage === 2) nextStage = posting.allow_new ? 3 : 4;
  else nextStage = 4;

  const newWage = computeAutoWage(posting, nextStage, cfg, now);
  const wageBumped = newWage !== posting.wage;

  const updatePayload: { escalation_stage: number; stage_updated_at: string; wage?: number } = {
    escalation_stage: nextStage,
    stage_updated_at: now.toISOString(),
  };
  if (wageBumped) updatePayload.wage = newWage;

  const { error } = await sb
    .from("daeta_postings")
    .update(updatePayload)
    .eq("id", posting.id)
    .eq("escalation_stage", stage); // 동시 실행 가드
  if (error) return null;

  // 알림 문구에 방금 오른 시급이 반영되도록 갱신된 posting을 사용
  const updatedPosting: DaetaPostingRow = { ...posting, escalation_stage: nextStage, wage: newWage };

  // 단계별 알림 발송
  if (nextStage === 2) {
    await notifyNearby(sb, updatedPosting, "tier1", cfg.radius_km);
  } else if (nextStage === 3) {
    await notifyNearby(sb, updatedPosting, "tier2", cfg.radius_km);
  } else if (nextStage === 4) {
    // 공개 SOS 전환: 사장님에게 상태 알림 (공개글은 리스트 노출로 처리)
    await createNotification({
      userId: posting.user_id,
      type: "daeta",
      title: "📢 공개 SOS로 전환됐어요",
      body: `${posting.business_name} 대타 요청이 모든 알바생에게 공개됐어요. 링크를 카톡으로 공유하면 더 빨라요!`,
      url: "/daeta",
      data: { daetaPostingId: posting.id, stage: 4 },
    });
  }

  if (wageBumped) {
    await createNotification({
      userId: posting.user_id,
      type: "daeta",
      title: "💰 시급이 자동으로 올랐어요",
      body: `${posting.business_name} 대타가 안 잡혀서 시급이 ${posting.wage.toLocaleString()}원 → ${newWage.toLocaleString()}원으로 자동 인상됐어요. (등록 시 동의한 상한 ${posting.max_urgent_pct}% 이내)`,
      url: "/daeta",
      data: { daetaPostingId: posting.id, stage: nextStage },
    });
  }

  return nextStage;
}
