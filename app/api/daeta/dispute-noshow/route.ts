import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createNotification } from "@/lib/notify";

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

const ADMIN_EMAIL = "pazab@kakao.com";

// 노쇼 신고 이의제기 — 사장님의 "노쇼 신고"(app/api/daeta/complete action=noshow, lib/daetaNoShow.ts)는
// 검증 없이 즉시 -30점 감점 + 정지가 확정되는데, 반대로 알바생이 낸 "임금 미지급 신고"(report-unpaid)는
// 즉시 처벌 없이 관리자 검토로 넘어가도록 이미 비대칭적으로 설계돼 있었음(허위 신고 방지 목적).
// 노쇼 쪽엔 알바생이 방어할 수단이 전혀 없던 구멍을 메움 — 이미 확정된 페널티를 자동으로
// 되돌리진 않지만(사람 판단 필요), 이력·알림을 남겨 관리자가 검토할 수 있게 한다.
export async function POST(req: NextRequest) {
  try {
    const { matchId, reason } = await req.json();
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
    if (user.id !== match.worker_id) {
      return NextResponse.json({ error: "본인만 이의제기할 수 있어요." }, { status: 403 });
    }
    if (match.progress_status !== "failed") {
      return NextResponse.json({ error: "노쇼로 처리된 매칭이 아니에요." }, { status: 409 });
    }

    const DISPUTE_REASON = "대타 노쇼 이의제기 접수 (검토 대기)";
    const { data: existing } = await supabase
      .from("trust_score_logs")
      .select("id")
      .eq("ref_id", matchId)
      .eq("reason", DISPUTE_REASON)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "이미 이의제기가 접수됐어요. 검토를 기다려주세요." }, { status: 409 });
    }

    // 자동 변동 없음(delta 0) — 관리자 검토용 로그
    await supabase.from("trust_score_logs").insert({
      user_id: match.worker_id,
      delta: 0,
      reason: DISPUTE_REASON,
      ref_id: matchId,
    });

    const { data: workerUser } = await supabase.from("users").select("nickname, real_name").eq("id", match.worker_id).maybeSingle();
    const workerName = workerUser?.nickname || workerUser?.real_name || "알바생";
    const { data: posting } = await supabase.from("daeta_postings").select("business_name").eq("id", match.daeta_posting_id).maybeSingle();

    await createNotification({
      userId: match.employer_id,
      type: "daeta",
      title: "📮 노쇼 신고에 이의제기 접수됨",
      body: `${workerName}님이 ${posting?.business_name || "매장"} 노쇼 신고에 이의를 제기했어요. 관리자가 검토할 예정이에요.`,
      url: `/chat/${matchId}`,
      data: { matchId },
    });

    const { data: admin } = await supabase.from("users").select("id").eq("email", ADMIN_EMAIL).maybeSingle();
    if (admin?.id) {
      await createNotification({
        userId: admin.id,
        type: "system",
        title: "🚨 노쇼 이의제기 (검토 필요)",
        body: `매칭 ${matchId} 건에 노쇼 이의제기가 접수됐어요.${reason ? ` 사유: ${String(reason).slice(0, 200)}` : ""} /admin/trust에서 확인해 주세요.`,
        url: "/admin/trust",
        data: { matchId },
      });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
