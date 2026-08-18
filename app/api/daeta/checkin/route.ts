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

// 크론(app/api/cron/daeta-checkin)이 "10분 전" 알림+원탭 출근 버튼을 보내는 시점과 맞춤 —
// 알림은 10분 전에 왔는데 버튼은 그 전부터 눌려있으면 너무 일찍 체크인해서 실근무시간이
// (체크아웃 시각 - 체크인 시각 기준 정산이라) 부풀려질 수 있었음.
const CHECKIN_OPEN_BEFORE_MIN = 10;

// 대타 알바생 원탭 출근 체크인 — 세션 쿠키(로그인) 기반 본인확인 (앱 UI 버튼 + 푸시알림 원탭 버튼 양쪽에서 호출됨)
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
    if (user.id !== match.worker_id) {
      return NextResponse.json({ error: "본인만 출근 처리할 수 있어요." }, { status: 403 });
    }
    if (match.progress_status !== "accepted") {
      return NextResponse.json({ error: "이미 종료됐거나 확정되지 않은 대타예요." }, { status: 409 });
    }

    const { data: posting } = await supabase.from("daeta_postings")
      .select("business_name, work_date, work_date_end, work_hours")
      .eq("id", match.daeta_posting_id).maybeSingle();
    const days = posting ? daetaDayCount(posting.work_date, posting.work_date_end) : 1;
    const today = todayKstStr();

    // 오늘 근무 시작 10분 전부터만 체크인 허용 — 그 전이면 언제부터 가능한지 안내
    const startPart = posting?.work_hours?.split("~")[0]?.trim();
    if (startPart) {
      const shiftStart = new Date(`${today}T${startPart}:00+09:00`);
      if (!Number.isNaN(shiftStart.getTime())) {
        const opensAt = new Date(shiftStart.getTime() - CHECKIN_OPEN_BEFORE_MIN * 60000);
        if (Date.now() < opensAt.getTime()) {
          return NextResponse.json({
            error: `출근 체크인은 근무 시작 ${CHECKIN_OPEN_BEFORE_MIN}분 전(${opensAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" })})부터 가능해요.`,
          }, { status: 409 });
        }
      }
    }

    // 하루짜리 대타는 기존과 동일하게 matches.checked_in_at 하나로 관리(재출근 차단).
    // 여러 날짜에 걸친 대타는 matches.checked_in_at이 1일차 값 하나뿐이라 그것만으로 막으면
    // 2일차부터는 영원히 "이미 출근 처리됨"으로 막혀서 체크인 자체가 불가능해짐 —
    // daeta_daily_attendance에 오늘 날짜로 이미 체크인했는지를 따로 확인한다.
    if (days === 1) {
      if (match.checked_in_at) {
        return NextResponse.json({ success: true, message: "이미 출근 처리되어 있어요." });
      }
    } else {
      const { data: todayRow } = await supabase.from("daeta_daily_attendance")
        .select("checked_in_at").eq("match_id", matchId).eq("work_date", today).maybeSingle();
      if (todayRow?.checked_in_at) {
        return NextResponse.json({ success: true, message: "오늘은 이미 출근 처리되어 있어요." });
      }
    }

    const now = new Date().toISOString();
    if (!match.checked_in_at) {
      await supabase.from("matches").update({ checked_in_at: now }).eq("id", matchId);
    }
    // daeta_daily_attendance는 다일치(2일차 이후) 노쇼 감지 전용 — 하루짜리는 matches.checked_in_at이
    // 이미 SOT라 여기 또 쓰면 같은 사실을 두 테이블에 중복 기록하는 것뿐이고 아무도 안 읽음.
    if (days > 1) {
      const { error: dailyErr } = await supabase.from("daeta_daily_attendance")
        .upsert({ match_id: matchId, work_date: today, checked_in_at: now }, { onConflict: "match_id,work_date" });
      if (dailyErr) console.error("[daeta checkin] daily attendance upsert failed:", dailyErr.message);
    }

    const timeStr = new Date(now).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
    await supabase.from("chats").insert({
      match_id: matchId,
      sender_id: match.worker_id,
      receiver_id: match.employer_id,
      message: days > 1 ? `✅ 출근했습니다 (${today} ${timeStr})` : `✅ 출근했습니다 (${timeStr})`,
      message_type: "system",
      is_read: false,
    });

    await createNotification({
      userId: match.employer_id,
      type: "daeta",
      title: "✅ 대타 알바생 출근",
      body: `${posting?.business_name || "매장"} 대타 알바생이 출근했어요.`,
      url: "/daeta",
      data: { matchId },
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
