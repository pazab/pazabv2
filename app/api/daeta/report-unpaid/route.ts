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

// 임금 미지급 신고 — 검증 없이 즉시 사장님 계정을 정지시키던 예전 로직을 대체.
// 앱이 직접 처벌하지 않고: 이력만 남기고(trust_score_logs, delta 0 — 검토 대기), 사장님·관리자 양쪽에 알림만 보냄.
// 실제 정지 여부는 관리자가 /admin/trust에서 사람이 검토 후 판단.
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
      .select("id, employer_id, worker_id, daeta_posting_id")
      .eq("id", matchId)
      .maybeSingle();

    if (!match || !match.daeta_posting_id) {
      return NextResponse.json({ error: "대타 매칭을 찾을 수 없어요." }, { status: 404 });
    }
    if (user.id !== match.worker_id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    // 신고 이력 기록 — 신뢰점수 자동 변동 없음(delta 0), 관리자 검토용 로그
    await supabase.from("trust_score_logs").insert({
      user_id: match.employer_id,
      delta: 0,
      reason: "임금 미지급 신고 접수 (검토 대기)",
      ref_id: matchId,
    });

    const { data: workerUser } = await supabase.from("users").select("nickname, real_name").eq("id", match.worker_id).maybeSingle();
    const workerName = workerUser?.nickname || workerUser?.real_name || "알바생";

    await createNotification({
      userId: match.employer_id,
      type: "daeta",
      title: "⚠️ 임금 미지급 신고 접수",
      body: `${workerName}님이 대타 근무 임금 미지급을 신고했어요. 명세서/정산 내역을 확인해 주세요.`,
      url: `/daeta?history=1&matchId=${matchId}`,
      data: { matchId },
    });

    const { data: admin } = await supabase.from("users").select("id").eq("email", ADMIN_EMAIL).maybeSingle();
    if (admin?.id) {
      await createNotification({
        userId: admin.id,
        type: "system",
        title: "🚨 임금 미지급 신고 (검토 필요)",
        body: `매칭 ${matchId} 건에 임금 미지급 신고가 접수됐어요. /admin/trust에서 확인해 주세요.`,
        url: "/admin/trust",
        data: { matchId },
      });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
