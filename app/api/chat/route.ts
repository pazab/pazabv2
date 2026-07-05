import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// GET은 anon(RLS), POST는 service_role(서버에서 시스템 메시지 삽입)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 채팅 메시지 목록 조회 (GET)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const matchId = searchParams.get("matchId");
    const userId = searchParams.get("userId");

    if (!matchId || !userId) {
      return NextResponse.json({ error: "필수 정보 없음", success: false }, { status: 400 });
    }

    // 현재 match 정보
    const { data: match } = await supabase
      .from("matches")
      .select("employer_id, worker_id, status, progress_status, match_score, interview_at, interview_memo")
      .eq("id", matchId)
      .single();

    if (!match) return NextResponse.json({ error: "매칭 없음", success: false }, { status: 404 });

    // 같은 두 사람의 모든 match_id 가져오기 (B방식: 이전 대화 이어가기)
    const { data: allMatches } = await supabase
      .from("matches")
      .select("id, created_at")
      .eq("employer_id", match.employer_id)
      .eq("worker_id", match.worker_id)
      .order("created_at", { ascending: true });

    const allMatchIds = (allMatches || []).map(m => m.id);

    const { data: messages, error } = await supabase
      .from("chats")
      .select("*")
      .in("match_id", allMatchIds)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // 읽음 처리 - 같은 두 사람 모든 채팅방의 내가 받은 메시지
    await supabase
      .from("chats")
      .update({ is_read: true })
      .in("match_id", allMatchIds)
      .eq("receiver_id", userId)
      .eq("is_read", false);

    const counterpartId = match?.employer_id === userId ? match?.worker_id : match?.employer_id;
    const { data: counterpart } = await supabase
      .from("users")
      .select("id, nickname, name, user_type, grade, trust_score, avatar_url")
      .eq("id", counterpartId)
      .single();

    // 사장님이면 employer_profiles도
    let counterpartProfile = null;
    if (counterpart?.user_type === "employer") {
      const { data: emp } = await supabase
        .from("employer_profiles")
        .select("business_name, business_type")
        .eq("user_id", counterpartId)
        .limit(1)
        .maybeSingle();
      counterpartProfile = emp;
    }

    return NextResponse.json({ data: messages, counterpart, counterpartProfile, match, success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
}

// 메시지 전송 (POST)
export async function POST(req: NextRequest) {
  try {
    const { matchId, senderId, receiverId, message, messageType } = await req.json();

    if (!matchId || !senderId || !receiverId || !message) {
      return NextResponse.json({ error: "필수 정보 없음", success: false }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("chats")
      .insert({
        match_id: matchId,
        sender_id: senderId,
        receiver_id: receiverId,
        message,
        message_type: messageType || "text",
        is_read: false,
      })
      .select()
      .single();

    if (error) throw error;

    await supabaseAdmin
      .from("matches")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", matchId);

    // 수신자에게 푸시 알림 (백그라운드)
    const { data: senderUser } = await supabaseAdmin
      .from("users").select("nickname").eq("id", senderId).maybeSingle();
    const { data: sub } = await supabaseAdmin
      .from("push_subscriptions").select("subscription").eq("user_id", receiverId).maybeSingle();

    if (sub?.subscription) {
      const webpush = (await import("web-push")).default;
      webpush.setVapidDetails(
        "mailto:hellopazab@gmail.com",
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        process.env.VAPID_PRIVATE_KEY!
      );
      const senderName = senderUser?.nickname || "상대방";
      const preview = message.length > 30 ? message.slice(0, 30) + "..." : message;
      webpush.sendNotification(
        sub.subscription,
        JSON.stringify({
          title: `💬 ${senderName}`,
          body: preview,
          url: `/chat/${matchId}`,
          tag: `chat-${matchId}`,
        })
      ).catch(() => {}); // 실패해도 무시
    }

    return NextResponse.json({ data, success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
}
