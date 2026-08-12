import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createNotification } from "@/lib/notify";
import { DaetaPostingRow, reescalateAfterDropout } from "@/lib/daetaEscalation";

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// 취소 횟수(최근 90일)별 페널티 — 1회는 유예, 이후 반복될수록 가중.
// 정지는 취소한 쪽의 대타 관련 행동만 막음(알바생=지원, 사장님=SOS 등록).
const PENALTY_TIERS = [
  { suspendDays: 0, trustPenalty: 0 },
  { suspendDays: 3, trustPenalty: 10 },
  { suspendDays: 7, trustPenalty: 15 },
  { suspendDays: 14, trustPenalty: 20 },
];
const LOOKBACK_DAYS = 90;
const CANCEL_REASON = "대타 확정 취소";

export async function POST(req: NextRequest) {
  try {
    const { matchId } = await req.json();
    if (!matchId) return NextResponse.json({ error: "matchId 필요" }, { status: 400 });

    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getServiceClient();
    const { data: match } = await supabase
      .from("matches")
      .select("id, employer_id, worker_id, daeta_posting_id, progress_status")
      .eq("id", matchId)
      .maybeSingle();

    if (!match || !match.daeta_posting_id) {
      return NextResponse.json({ error: "대타 매칭을 찾을 수 없어요." }, { status: 404 });
    }
    if (user.id !== match.employer_id && user.id !== match.worker_id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    if (["cancelled", "rejected", "failed"].includes(match.progress_status)) {
      return NextResponse.json({ error: "이미 종료된 매칭이에요." }, { status: 409 });
    }

    const isEmployerCancelling = user.id === match.employer_id;
    const counterpartId = isEmployerCancelling ? match.worker_id : match.employer_id;

    // 최근 90일 내 이 사용자의 대타 취소 횟수 → 페널티 단계 판정
    const lookbackStart = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { count: priorCancels } = await supabase
      .from("trust_score_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("reason", CANCEL_REASON)
      .gte("created_at", lookbackStart);

    const tierIndex = Math.min(priorCancels ?? 0, PENALTY_TIERS.length - 1);
    const tier = PENALTY_TIERS[tierIndex];

    // 페널티 적용: 신뢰점수 감점
    if (tier.trustPenalty > 0) {
      const { data: u } = await supabase.from("users").select("trust_score").eq("id", user.id).maybeSingle();
      const before = u?.trust_score ?? 50;
      const after = Math.max(0, before - tier.trustPenalty);
      await supabase.from("users").update({ trust_score: after }).eq("id", user.id);
      await supabase.from("trust_score_logs").insert({
        user_id: user.id, delta: -tier.trustPenalty, reason: CANCEL_REASON, before_score: before, after_score: after, ref_id: matchId,
      });
    } else {
      await supabase.from("trust_score_logs").insert({
        user_id: user.id, delta: 0, reason: CANCEL_REASON, ref_id: matchId,
      });
    }

    // 페널티 적용: 정지 (해당 사용자의 대타 관련 행동만 제한)
    if (tier.suspendDays > 0) {
      const suspendedUntil = new Date(Date.now() + tier.suspendDays * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from("users").update({ daeta_cancel_suspended_until: suspendedUntil }).eq("id", user.id);
    }

    // 매칭·계약 취소 처리
    await supabase.from("matches").update({ progress_status: "cancelled" }).eq("id", matchId);
    await supabase.from("contracts").update({ status: "cancelled" }).eq("match_id", matchId).neq("status", "cancelled");

    // 상대방에게 알림
    await createNotification({
      userId: counterpartId,
      type: "daeta",
      title: "😢 확정된 대타가 취소됐어요",
      body: isEmployerCancelling ? "사장님 사정으로 대타가 취소됐어요." : "알바생 사정으로 대타가 취소됐어요.",
      url: `/chat/${matchId}`,
      data: { matchId },
    });

    // 대타 공고 자체 처리 — 예전엔 여기서 daeta_postings를 아예 건드리지 않아서 노쇼보다도 못한
    // 대우였음(사전에 알려준 취소인데 재구인 시도조차 안 됨). 알바생이 취소했으면 노쇼와 동일하게
    // 즉시 재오픈+재확산(신뢰점수/정지 페널티는 위에서 이미 별도 처리했으니 중복 감점 없음).
    // 사장님이 취소했으면 더 이상 구할 필요가 없다는 뜻이라 공고 자체를 종료.
    const { data: posting } = await supabase
      .from("daeta_postings")
      .select("id, user_id, business_name, region, lat, lng, work_date, work_date_end, work_hours, wage, base_wage, max_urgent_pct, duty, status, escalation_stage, stage_updated_at, allow_new, created_at, expires_at")
      .eq("id", match.daeta_posting_id)
      .maybeSingle();

    if (posting) {
      if (isEmployerCancelling) {
        await supabase.from("daeta_postings").update({ status: "cancelled" }).eq("id", posting.id);
      } else {
        await reescalateAfterDropout(
          supabase,
          posting as DaetaPostingRow,
          match.worker_id,
          "🔄 대타 취소 확인, 바로 대체 인력을 찾고 있어요",
          `${posting.business_name} 대타를 다시 넓혀서 요청했어요.`
        );
      }
    }

    return NextResponse.json({ success: true, suspendDays: tier.suspendDays, trustPenalty: tier.trustPenalty, cancelCount: (priorCancels ?? 0) + 1 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
