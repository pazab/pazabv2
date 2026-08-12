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

export function computeAutoWage(posting: DaetaPostingRow, nextStage: number, cfg: SosConfig): number {
  const pctKey = STAGE_PCT_KEY[nextStage];
  if (!pctKey) return posting.wage;
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

  const waitMap: Record<number, number> = {
    1: cfg.stage1_wait_min,
    2: cfg.stage2_wait_min,
    3: cfg.stage3_wait_min,
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

  const newWage = computeAutoWage(posting, nextStage, cfg);
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
