/**
 * lib/daetaNoShow.ts — 대타 노쇼 처리 공통 로직 (수동 신고 / 자동판정 공용)
 * "돈으로 위로금을 주는 대신 속도로 확실히 채워준다" 방향(DESIGN_PLAN.md §11 2026-08-13) —
 * 노쇼 확정 즉시 신뢰점수 감점 + 알림 + 공고 재오픈/재확산까지 한 번에 처리한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/notify";
import { DaetaPostingRow, getSosConfig, notifyTeam, notifyNearby, computeAutoWage } from "@/lib/daetaEscalation";

interface NoShowMatch {
  id: string;
  employer_id: string;
  worker_id: string;
  daeta_posting_id: string;
}

export async function markNoShowAndReescalate(
  sb: SupabaseClient,
  match: NoShowMatch,
  posting: DaetaPostingRow,
  reason: "manual" | "auto"
) {
  await sb.from("matches").update({
    progress_status: "failed",
    message: "알바생 노쇼로 인한 구인 취소",
  }).eq("id", match.id);

  const { data: worker } = await sb.from("users").select("trust_score").eq("id", match.worker_id).maybeSingle();
  const before = worker?.trust_score ?? 50;
  const after = Math.max(0, before - 30);
  await sb.from("users").update({ trust_score: after }).eq("id", match.worker_id);
  await sb.from("trust_score_logs").insert({
    user_id: match.worker_id, delta: -30, reason: "대타 매칭 후 무단 노쇼 발생", before_score: before, after_score: after, ref_id: match.id,
  });

  await createNotification({
    userId: match.worker_id,
    type: "daeta",
    title: "🚨 대타 노쇼 처리",
    body: reason === "auto"
      ? "출근 시각이 15분 넘게 지나도록 출근 처리가 안 돼 무단 노쇼로 자동 처리됐어요. 신뢰점수가 감점되고 대타 참여도 일정 기간 제한돼요."
      : "확정된 대타에 무단 노쇼로 신고되어 신뢰점수가 감점됐어요. 대타 참여도 일정 기간 제한돼요.",
    url: "/myteam",
    data: { matchId: match.id },
  });

  // 취소로 끝내지 않고 즉시 재확산 — 이미 동의한 상한(allow_new/max_urgent_pct) 안에서 넓은 단계로 바로 점프
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
    notifyTeam(sb, reopenedPosting, match.worker_id),
    notifyNearby(sb, reopenedPosting, targetStage >= 3 ? "tier2" : "tier1", cfg.radius_km, match.worker_id),
  ]);

  await createNotification({
    userId: match.employer_id,
    type: "daeta",
    title: reason === "auto" ? "🚨 노쇼 자동 감지, 바로 대체 인력을 찾고 있어요" : "🔄 노쇼 확인, 바로 대체 인력을 찾고 있어요",
    body: `${posting.business_name} 대타를 다시 넓혀서 요청했어요. 팀원 ${teamNotified}명 + 동네 인력 ${nearbyNotified}명에게 알림이 갔어요.`,
    url: "/daeta",
    data: { daetaPostingId: posting.id },
  });
}
