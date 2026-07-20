/**
 * lib/daetaTier.ts — 대타 2-Tier 판정 (STRATEGY.md §4)
 * Tier1(✅검증): 팀 이력(team_members) 보유 OR 대타 매칭 성사(accepted/hired) 이력
 * Tier2(🔵신규): 그 외 전부. 대타 1회 완료 시 자동으로 Tier1 조건 충족.
 * 클라이언트/서버 양쪽에서 사용 가능 (SupabaseClient 주입)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type DaetaTier = "tier1" | "tier2";

export const TIER_LABEL: Record<DaetaTier, { emoji: string; name: string; color: string }> = {
  tier1: { emoji: "✅", name: "검증", color: "#22c55e" },
  tier2: { emoji: "🔵", name: "신규", color: "#3b82f6" },
};

/** 여러 명 일괄 판정 — 후보 리스트 정렬/배지용 */
export async function getWorkerTiers(
  sb: SupabaseClient,
  workerIds: string[]
): Promise<Record<string, DaetaTier>> {
  const result: Record<string, DaetaTier> = {};
  if (workerIds.length === 0) return result;
  workerIds.forEach(id => { result[id] = "tier2"; });

  const [tmRes, daetaRes] = await Promise.all([
    sb.from("team_members").select("worker_id").in("worker_id", workerIds),
    sb.from("matches")
      .select("worker_id")
      .in("worker_id", workerIds)
      .not("daeta_posting_id", "is", null)
      .in("progress_status", ["accepted", "hired"]),
  ]);

  (tmRes.data || []).forEach((r: { worker_id: string }) => { result[r.worker_id] = "tier1"; });
  (daetaRes.data || []).forEach((r: { worker_id: string }) => { result[r.worker_id] = "tier1"; });
  return result;
}

/** 단일 판정 */
export async function getWorkerTier(sb: SupabaseClient, workerId: string): Promise<DaetaTier> {
  const tiers = await getWorkerTiers(sb, [workerId]);
  return tiers[workerId] || "tier2";
}
