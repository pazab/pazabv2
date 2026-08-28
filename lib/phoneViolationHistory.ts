import { SupabaseClient } from "@supabase/supabase-js";
import { hashPhone } from "@/lib/phoneHash";

interface RecordParams {
  phone: string;
  userId: string;
  noShowCount: number;
  trustScore: number;
  suspendedUntil: string | null; // 미래 시각일 때만 넘길 것 (호출부에서 이미 필터링)
}

// 탈퇴 확정 시(lib/withdrawal.ts) 전화번호를 익명화하기 직전에 호출한다. 위반 이력이
// 있는 계정만 해시로 남기고, 깨끗한 계정은 애초에 기록하지 않는다 — 모든 탈퇴자의
// 번호 해시를 쌓아두면 그 자체가 새로운 추적 가능 식별자가 되므로, 남길 이유(위반
// 이력 있음)가 있을 때만 최소한으로 남긴다.
export async function recordPhoneViolationOnWithdrawal(sb: SupabaseClient, p: RecordParams) {
  const phoneHash = hashPhone(p.phone);
  const { data: existing } = await sb.from("phone_violation_history")
    .select("no_show_count, worst_trust_score, suspended_until, source_user_ids")
    .eq("phone_hash", phoneHash).maybeSingle();

  const noShowCount = (existing?.no_show_count ?? 0) + p.noShowCount;
  const worstTrustScore = Math.min(existing?.worst_trust_score ?? 100, p.trustScore);

  const candidates = [existing?.suspended_until, p.suspendedUntil]
    .filter((v): v is string => !!v)
    .map(v => new Date(v));
  const suspendedUntil = candidates.length > 0
    ? new Date(Math.max(...candidates.map(d => d.getTime()))).toISOString()
    : null;

  const sourceUserIds = Array.from(new Set([...(existing?.source_user_ids || []), p.userId]));

  await sb.from("phone_violation_history").upsert({
    phone_hash: phoneHash,
    no_show_count: noShowCount,
    worst_trust_score: worstTrustScore,
    suspended_until: suspendedUntil,
    last_violation_at: new Date().toISOString(),
    source_user_ids: sourceUserIds,
    updated_at: new Date().toISOString(),
  }, { onConflict: "phone_hash" });
}

interface ApplyResult {
  applied: boolean;
  noShowCount?: number;
}

// 계정이 휴대폰 번호를 저장할 때(app/api/user/phone/route.ts) 호출. 그 번호로 과거
// 위반 이력이 있으면 이 계정에도 신뢰점수/정지 상태를 승계한다. 이력을 만든 계정
// 본인이거나 이미 승계 적용된 계정이면 다시 적용하지 않는다(재저장할 때마다 중복
// 감점되는 것 방지).
export async function applyPhoneViolationHistory(
  sb: SupabaseClient,
  userId: string,
  phone: string
): Promise<ApplyResult> {
  const phoneHash = hashPhone(phone);
  const { data: record } = await sb.from("phone_violation_history")
    .select("*").eq("phone_hash", phoneHash).maybeSingle();
  if (!record) return { applied: false };

  const sourceUserIds: string[] = record.source_user_ids || [];
  const appliedUserIds: string[] = record.applied_to_user_ids || [];
  if (sourceUserIds.includes(userId) || appliedUserIds.includes(userId)) return { applied: false };

  const { data: user } = await sb.from("users")
    .select("trust_score, daeta_cancel_suspended_until").eq("id", userId).maybeSingle();
  const before = user?.trust_score ?? 50;
  const after = Math.min(before, record.worst_trust_score ?? before);

  const updates: Record<string, unknown> = {};
  if (after < before) updates.trust_score = after;

  const suspendIsFuture = record.suspended_until && new Date(record.suspended_until) > new Date();
  const currentSuspend = user?.daeta_cancel_suspended_until ? new Date(user.daeta_cancel_suspended_until) : null;
  if (suspendIsFuture && (!currentSuspend || new Date(record.suspended_until) > currentSuspend)) {
    updates.daeta_cancel_suspended_until = record.suspended_until;
  }

  // 실제로 바뀐 게 없으면(예: 기본 신뢰점수 50이 승계 이력의 최저점수보다 이미 낮음,
  // 정지 이력도 이미 만료됨) 승계된 것으로 표시하지 않는다 — 사용자에게 괜히 경고
  // 토스트를 띄울 이유가 없고, 다음 저장 때 다시 판정해도 무해하니 목록에 남기지도 않는다.
  if (Object.keys(updates).length === 0) return { applied: false };

  await sb.from("users").update(updates).eq("id", userId);
  if (after < before) {
    await sb.from("trust_score_logs").insert({
      user_id: userId, delta: after - before, before_score: before, after_score: after,
      reason: "이전 계정 노쇼/신뢰점수 위반 이력 승계 (휴대폰 번호 기준)", category: "attendance",
    });
  }

  await sb.from("phone_violation_history")
    .update({ applied_to_user_ids: [...appliedUserIds, userId] })
    .eq("phone_hash", phoneHash);

  return { applied: true, noShowCount: record.no_show_count };
}
