/**
 * POST /api/daeta/cancel-posting — 아직 매칭 전(open) 대타 공고를 사장님이 취소.
 * daeta_postings 상태 변경만 하고 지원자들에게 알리지 않으면, 지원자는 계속
 * "대기중"으로 남아 자기가 떨어진 줄도 모르게 됨 — 여기서 pending 지원 전부 정리 + 알림.
 * (매칭 확정 후 취소는 /api/daeta/cancel — 페널티가 붙는 별개 플로우)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/notify";

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function POST(req: NextRequest) {
  try {
    const { postingId, userId } = await req.json();
    if (!postingId || !userId) {
      return NextResponse.json({ error: "필수 정보 없음", success: false }, { status: 400 });
    }

    const sb = getServiceClient();
    const { data: posting } = await sb
      .from("daeta_postings")
      .select("id, user_id, business_name, status")
      .eq("id", postingId)
      .maybeSingle();

    if (!posting) {
      return NextResponse.json({ error: "공고를 찾을 수 없어요", success: false }, { status: 404 });
    }
    if (posting.user_id !== userId) {
      return NextResponse.json({ error: "권한이 없어요", success: false }, { status: 403 });
    }
    if (["cancelled", "matched"].includes(posting.status)) {
      return NextResponse.json({ error: "이미 종료된 공고예요", success: false }, { status: 409 });
    }

    await sb.from("daeta_postings").update({ status: "cancelled" }).eq("id", postingId);

    const { data: pendingMatches } = await sb
      .from("matches")
      .select("id, worker_id")
      .eq("daeta_posting_id", postingId)
      .eq("progress_status", "pending");

    if (pendingMatches?.length) {
      await sb.from("matches")
        .update({ progress_status: "cancelled", message: "사장님이 대타 요청을 취소함" })
        .in("id", pendingMatches.map(m => m.id));

      await Promise.all(pendingMatches.map(m => createNotification({
        userId: m.worker_id,
        type: "daeta",
        title: "🚫 대타 요청이 취소됐어요",
        body: `${posting.business_name || "매장"} 사장님이 대타 요청을 취소했어요.`,
        url: "/daeta",
        data: { daetaPostingId: postingId },
      })));
    }

    return NextResponse.json({ success: true, notified: pendingMatches?.length || 0 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
}
