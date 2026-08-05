/**
 * lib/daetaTier.ts — 대타 2-Tier 판정 (STRATEGY.md §4)
 * Tier1(✅검증): (팀 이력(team_members) 보유 OR 대타 매칭 성사(accepted/hired) 이력) AND trust_score가 하한 이상
 * Tier2(🔵신규): 그 외 전부. 대타 1회 완료 시 자동으로 Tier1 조건 충족.
 *
 * trust_score 하한 게이트는 2026-08-06 추가 — 예전엔 accepted/hired 이력이 "한 번이라도" 있으면
 * 이후 다른 건에서 노쇼로 trust_score가 깎여도 Tier1 뱃지가 영구히 유지되는 구멍이 있었음
 * (STRATEGY.md §4 "구현 갭" 참조). 노쇼 시 trust_score가 -30점 되므로(app/api/daeta/complete/route.ts),
 * 이 게이트만으로 노쇼 이력이 있는 사람은 자동으로 Tier2로 강등됨.
 * 클라이언트/서버 양쪽에서 사용 가능 (SupabaseClient 주입)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type DaetaTier = "tier1" | "tier2";

export const TIER_LABEL: Record<DaetaTier, { emoji: string; name: string; color: string }> = {
  tier1: { emoji: "✅", name: "검증", color: "#22c55e" },
  tier2: { emoji: "🔵", name: "신규", color: "#3b82f6" },
};

export const TIER1_MIN_TRUST_SCORE = 40;

/** 여러 명 일괄 판정 — 후보 리스트 정렬/배지용 */
export async function getWorkerTiers(
  sb: SupabaseClient,
  workerIds: string[]
): Promise<Record<string, DaetaTier>> {
  const result: Record<string, DaetaTier> = {};
  if (workerIds.length === 0) return result;
  workerIds.forEach(id => { result[id] = "tier2"; });

  const [tmRes, daetaRes, usersRes] = await Promise.all([
    sb.from("team_members").select("worker_id").in("worker_id", workerIds),
    sb.from("matches")
      .select("worker_id")
      .in("worker_id", workerIds)
      .not("daeta_posting_id", "is", null)
      .in("progress_status", ["accepted", "hired"]),
    sb.from("users").select("id, trust_score").in("id", workerIds),
  ]);

  const trustScores: Record<string, number> = {};
  (usersRes.data || []).forEach((u: { id: string; trust_score: number | null }) => { trustScores[u.id] = u.trust_score ?? 50; });

  const qualifiesByHistory = new Set<string>();
  (tmRes.data || []).forEach((r: { worker_id: string }) => qualifiesByHistory.add(r.worker_id));
  (daetaRes.data || []).forEach((r: { worker_id: string }) => qualifiesByHistory.add(r.worker_id));

  qualifiesByHistory.forEach(id => {
    if ((trustScores[id] ?? 50) >= TIER1_MIN_TRUST_SCORE) result[id] = "tier1";
  });

  return result;
}

/** 단일 판정 */
export async function getWorkerTier(sb: SupabaseClient, workerId: string): Promise<DaetaTier> {
  const tiers = await getWorkerTiers(sb, [workerId]);
  return tiers[workerId] || "tier2";
}
