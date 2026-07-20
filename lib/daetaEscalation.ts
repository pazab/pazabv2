/**
 * lib/daetaEscalation.ts — 대타 SOS 에스컬레이션 엔진 (서버 전용, 서비스롤 클라이언트 주입)
 * 루프: ① 팀 내 알림 → ② 동네 Tier1 공개 → ③ 신규(Tier2) 포함(opt-in) → ④ 공개 SOS
 * 사용처: /api/daeta/sos (발동), /api/cron/daeta-escalate (단계 자동 전진)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/notify";
import { getWorkerTiers } from "@/lib/daetaTier";

export interface DaetaPostingRow {
  id: string;
  user_id: string;
  business_name: string;
  region: string;
  lat: number;
  lng: number;
  work_date: string;
  work_hours: string;
  wage: number;
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
}

const DEFAULT_CONFIG: SosConfig = {
  stage1_wait_min: 10,
  stage2_wait_min: 30,
  stage3_wait_min: 30,
  radius_km: 10,
  urgent_pct_same_day: 20,
  urgent_pct_3h: 30,
};

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
  return `${p.work_date} ${p.work_hours} · 시급 ${p.wage.toLocaleString()}원`;
}

/** ① 팀 내 알림 — 사장님 소속 active 팀원 전원에게 발송. 알림 보낸 인원 수 반환 */
export async function notifyTeam(sb: SupabaseClient, posting: DaetaPostingRow): Promise<number> {
  const { data: members } = await sb
    .from("team_members")
    .select("worker_id")
    .eq("employer_id", posting.user_id)
    .eq("status", "active");

  const workerIds = [...new Set((members || []).map((m: { worker_id: string }) => m.worker_id))]
    .filter(id => id && id !== posting.user_id);

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
  radiusKm: number
): Promise<number> {
  const { data: workers } = await sb
    .from("worker_profiles")
    .select("user_id, lat, lng, available_now, is_active")
    .eq("is_active", true)
    .eq("available_now", true)
    .not("lat", "is", null);

  const nearby = (workers || []).filter((w: { user_id: string; lat: number; lng: number }) =>
    w.user_id !== posting.user_id &&
    distanceKm({ lat: w.lat, lng: w.lng }, { lat: posting.lat, lng: posting.lng }) <= radiusKm
  );
  if (nearby.length === 0) return 0;

  const ids = [...new Set(nearby.map((w: { user_id: string }) => w.user_id))];
  const tiers = await getWorkerTiers(sb, ids);
  const targets = ids.filter(id => tiers[id] === targetTier);

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
  if (elapsedMin < waitMap[stage]) return null;

  let nextStage: number;
  if (stage === 1) nextStage = 2;
  else if (stage === 2) nextStage = posting.allow_new ? 3 : 4;
  else nextStage = 4;

  const { error } = await sb
    .from("daeta_postings")
    .update({ escalation_stage: nextStage, stage_updated_at: now.toISOString() })
    .eq("id", posting.id)
    .eq("escalation_stage", stage); // 동시 실행 가드
  if (error) return null;

  // 단계별 알림 발송
  if (nextStage === 2) {
    await notifyNearby(sb, posting, "tier1", cfg.radius_km);
  } else if (nextStage === 3) {
    await notifyNearby(sb, posting, "tier2", cfg.radius_km);
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
  return nextStage;
}
