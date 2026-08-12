import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

const EXTEND_MINUTES = 10;

// 사장님이 "조금만 더 기다릴게요"를 누르면 자동 노쇼 판정을 10분 미룸 (앱 UI + 푸시알림 원탭 버튼 양쪽에서 호출됨)
export async function POST(req: NextRequest) {
  try {
    const { matchId } = await req.json();
    if (!matchId) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

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
      .select("id, employer_id, worker_id, daeta_posting_id, progress_status, checked_in_at")
      .eq("id", matchId)
      .maybeSingle();

    if (!match || !match.daeta_posting_id) {
      return NextResponse.json({ error: "대타 매칭을 찾을 수 없어요." }, { status: 404 });
    }
    if (user.id !== match.employer_id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    if (match.progress_status !== "accepted") {
      return NextResponse.json({ error: "이미 종료됐거나 확정되지 않은 대타예요." }, { status: 409 });
    }
    if (match.checked_in_at) {
      return NextResponse.json({ success: true, message: "이미 출근 처리되어 있어요." });
    }

    const extendUntil = new Date(Date.now() + EXTEND_MINUTES * 60 * 1000).toISOString();
    const { error } = await supabase.from("matches").update({ noshow_extend_until: extendUntil }).eq("id", matchId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, extendUntil, minutes: EXTEND_MINUTES });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
