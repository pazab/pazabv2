import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createNotification } from "@/lib/notify";
import { daetaDayCount } from "@/lib/utils";

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

function todayKstStr(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];
}

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

    const { data: posting } = await supabase.from("daeta_postings")
      .select("business_name, work_date, work_date_end")
      .eq("id", match.daeta_posting_id).maybeSingle();
    const days = posting ? daetaDayCount(posting.work_date, posting.work_date_end) : 1;
    const today = todayKstStr();

    // 하루짜리는 기존 그대로 matches.checked_in_at/out 하나로 관리. 다일치는 matches.checked_out_at이
    // 1일차 값 하나뿐이라 그것만으로 막으면 2일차 이후엔 퇴근 처리가 막히므로 daeta_daily_attendance로 판정.
    if (days === 1) {
      if (!match.checked_in_at) {
        return NextResponse.json({ error: "출근 처리를 먼저 해주세요." }, { status: 409 });
      }
      if (match.checked_out_at) {
        return NextResponse.json({ success: true, message: "이미 퇴근 처리되어 있어요." });
      }
    } else {
      const { data: todayRow } = await supabase.from("daeta_daily_attendance")
        .select("checked_in_at, checked_out_at").eq("match_id", matchId).eq("work_date", today).maybeSingle();
      if (!todayRow?.checked_in_at) {
        return NextResponse.json({ error: "오늘 출근 처리를 먼저 해주세요." }, { status: 409 });
      }
      if (todayRow.checked_out_at) {
        return NextResponse.json({ success: true, message: "오늘은 이미 퇴근 처리되어 있어요." });
      }
    }

    const now = new Date().toISOString();
    if (!match.checked_out_at) {
      await supabase.from("matches").update({ checked_out_at: now }).eq("id", matchId);
    }
    // daeta_daily_attendance는 다일치(2일차 이후) 노쇼 감지 전용 — 하루짜리는 matches.checked_out_at이
    // 이미 SOT라 여기 또 쓰면 같은 사실을 두 테이블에 중복 기록하는 것뿐이고 아무도 안 읽음.
    if (days > 1) {
      const { error: dailyErr } = await supabase.from("daeta_daily_attendance")
        .update({ checked_out_at: now }).eq("match_id", matchId).eq("work_date", today);
      if (dailyErr) console.error("[daeta checkout] daily attendance update failed:", dailyErr.message);
    }

    const timeStr = new Date(now).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
    await supabase.from("chats").insert({
      match_id: matchId,
      sender_id: match.worker_id,
      receiver_id: match.employer_id,
      message: days > 1 ? `🏁 퇴근했습니다 (${today} ${timeStr})` : `🏁 퇴근했습니다 (${timeStr})`,
      message_type: "system",
      is_read: false,
    });

    await createNotification({
      userId: match.employer_id,
      type: "daeta",
      title: "🏁 대타 알바생 퇴근",
      body: `${posting?.business_name || "매장"} 대타 알바생이 퇴근했어요.${days > 1 ? " 마지막 날이면 근무 완료·정산을 진행해주세요." : " 근무시간을 확인하고 정산해주세요."}`,
      url: "/mypage/daeta-history?tab=employer",
      data: { matchId },
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
