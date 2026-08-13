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

// 대타 알바생 원탭 퇴근 체크아웃 — checked_in_at과 짝을 이뤄 실근무시간 정산(app/api/daeta/complete)의 기준이 됨.
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
      .select("id, employer_id, worker_id, daeta_posting_id, progress_status, checked_in_at, checked_out_at")
      .eq("id", matchId)
      .maybeSingle();

    if (!match || !match.daeta_posting_id) {
      return NextResponse.json({ error: "대타 매칭을 찾을 수 없어요." }, { status: 404 });
    }
    if (user.id !== match.worker_id) {
      return NextResponse.json({ error: "본인만 퇴근 처리할 수 있어요." }, { status: 403 });
    }
    if (match.progress_status !== "accepted") {
      return NextResponse.json({ error: "이미 종료됐거나 확정되지 않은 대타예요." }, { status: 409 });
    }
    if (!match.checked_in_at) {
      return NextResponse.json({ error: "출근 처리를 먼저 해주세요." }, { status: 409 });
    }
    if (match.checked_out_at) {
      return NextResponse.json({ success: true, message: "이미 퇴근 처리되어 있어요." });
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from("matches").update({ checked_out_at: now }).eq("id", matchId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: posting } = await supabase.from("daeta_postings").select("business_name").eq("id", match.daeta_posting_id).maybeSingle();

    const timeStr = new Date(now).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
    await supabase.from("chats").insert({
      match_id: matchId,
      sender_id: match.worker_id,
      receiver_id: match.employer_id,
      message: `🏁 퇴근했습니다 (${timeStr})`,
      message_type: "system",
      is_read: false,
    });

    await createNotification({
      userId: match.employer_id,
      type: "daeta",
      title: "🏁 대타 알바생 퇴근",
      body: `${posting?.business_name || "매장"} 대타 알바생이 퇴근했어요. 근무시간을 확인하고 정산해주세요.`,
      url: "/mypage/daeta-history?tab=employer",
      data: { matchId },
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
