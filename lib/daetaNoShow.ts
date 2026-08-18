/**
 * lib/daetaNoShow.ts — 대타 노쇼 처리 공통 로직 (수동 신고 / 자동판정 공용)
 * "돈으로 위로금을 주는 대신 속도로 확실히 채워준다" 방향(DESIGN_PLAN.md §11 2026-08-13) —
 * 노쇼 확정 즉시 신뢰점수 감점 + 알림 + 공고 재오픈/재확산까지 한 번에 처리한다.
 *
 * 노쇼(당일 무단 불참)는 사전 취소(app/api/daeta/cancel — 신뢰점수만 차등 감점, 정지 없음)보다
 * 명백히 더 나쁜 행동이라 실제로 정지가 걸림(2026-08-14) — 예전엔 알림 문구만 "참여 제한된다"고
 * 안내하고 실제로는 daeta_cancel_suspended_until을 전혀 건드리지 않던 버그였음.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/notify";
import { DaetaPostingRow, reescalateAfterDropout } from "@/lib/daetaEscalation";

interface NoShowMatch {
  id: string;
  employer_id: string;
  worker_id: string;
  daeta_posting_id: string;
}

const NOSHOW_REASON = "대타 매칭 후 무단 노쇼 발생";
const LOOKBACK_DAYS = 90;
// 첫 건부터 정지 — 사전 취소와 달리 "유예"를 주지 않음 (당일 무단 불참은 사장님 쪽에 즉시 피해가 감)
const NOSHOW_SUSPEND_DAYS_TIERS = [3, 7, 14, 30];

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

  // 채팅방에 노쇼 처리 사실을 남김 — 체크인/체크아웃/정산완료는 전부 시스템 메시지를 남기는데
  // 노쇼만 빠져있어서, 나중에 채팅방을 다시 열어봐도 왜 매칭이 끝났는지 흔적이 전혀 없었음
  await sb.from("chats").insert({
    match_id: match.id,
    sender_id: match.employer_id,
    receiver_id: match.worker_id,
    message: reason === "auto"
      ? "🚨 출근 시각이 15분 넘게 지나 무단 노쇼로 자동 처리됐어요."
      : "🚨 무단 노쇼로 신고 처리됐어요.",
    message_type: "system",
    is_read: false,
  });

  // 정지 단계는 이번 건을 기록하기 전(=이전 발생 횟수) 기준으로 판정
  const lookbackStart = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { count: priorNoShows } = await sb
    .from("trust_score_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", match.worker_id)
    .eq("reason", NOSHOW_REASON)
    .gte("created_at", lookbackStart);
  const tierIndex = Math.min(priorNoShows ?? 0, NOSHOW_SUSPEND_DAYS_TIERS.length - 1);
  const suspendDays = NOSHOW_SUSPEND_DAYS_TIERS[tierIndex];

  const { data: worker } = await sb.from("users").select("trust_score").eq("id", match.worker_id).maybeSingle();
  const before = worker?.trust_score ?? 50;
  const after = Math.max(0, before - 30);
  const suspendedUntil = new Date(Date.now() + suspendDays * 24 * 60 * 60 * 1000).toISOString();
  await sb.from("users").update({ trust_score: after, daeta_cancel_suspended_until: suspendedUntil }).eq("id", match.worker_id);
  await sb.from("trust_score_logs").insert({
    user_id: match.worker_id, delta: -30, reason: NOSHOW_REASON, before_score: before, after_score: after, ref_id: match.id,
  });

  await createNotification({
    userId: match.worker_id,
    type: "daeta",
    title: "🚨 대타 노쇼 처리",
    body: reason === "auto"
      ? `출근 시각이 15분 넘게 지나도록 출근 처리가 안 돼 무단 노쇼로 자동 처리됐어요. 신뢰점수 -30점, ${suspendDays}일간 대타 참여가 제한돼요.`
      : `확정된 대타에 무단 노쇼로 신고되어 신뢰점수 -30점, ${suspendDays}일간 대타 참여가 제한돼요.`,
    url: "/myteam",
    data: { matchId: match.id },
  });

  // 취소로 끝내지 않고 즉시 재확산 — 이미 동의한 상한(allow_new/max_urgent_pct) 안에서 넓은 단계로 바로 점프
  await reescalateAfterDropout(
    sb,
    posting,
    match.worker_id,
    reason === "auto" ? "🚨 노쇼 자동 감지, 바로 대체 인력을 찾고 있어요" : "🔄 노쇼 확인, 바로 대체 인력을 찾고 있어요",
    `${posting.business_name} 대타를 다시 넓혀서 요청했어요.`
  );
}
