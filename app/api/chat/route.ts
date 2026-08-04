import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 모두 service_role 사용 — server-side anon은 auth.uid()=null이라 RLS 통과 불가
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
    const { data: match } = await supabaseAdmin
      .from("matches")
      .select("employer_id, worker_id, progress_status, match_score, interview_at, interview_memo, initiated_by, worker_left, employer_left, employer_profile_id, job_id, daeta_posting_id")
      .eq("id", matchId)
      .single();

    if (!match) return NextResponse.json({ error: "매칭 없음", success: false }, { status: 404 });

    const { data: messages, error } = await supabaseAdmin
      .from("chats")
      .select("*")
      .eq("match_id", matchId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // 읽음 처리 - 현재 채팅방의 내가 받은 메시지
    await supabaseAdmin
      .from("chats")
      .update({ is_read: true })
      .eq("match_id", matchId)
      .eq("receiver_id", userId)
      .eq("is_read", false);

    const counterpartId = match?.employer_id === userId ? match?.worker_id : match?.employer_id;
    const { data: counterpart } = await supabaseAdmin
      .from("users")
      .select("id, nickname, user_type, grade, trust_score, avatar_url")
      .eq("id", counterpartId)
      .single();

    // 사장님이면 employer_profiles도
    let counterpartProfile = null;
    if (counterpart?.user_type === "employer") {
      const { data: emp } = await supabaseAdmin
        .from("employer_profiles")
        .select("business_name, business_type, logo_url, image_url")
        .eq("user_id", counterpartId)
        .limit(1)
        .maybeSingle();
      counterpartProfile = emp;
    }

    // 알바생이면 worker_profiles도
    let workerProfile = null;
    if (counterpart?.user_type === "worker") {
      const { data: wrk } = await supabaseAdmin
        .from("worker_profiles")
        .select("image_url")
        .eq("user_id", counterpartId)
        .limit(1)
        .maybeSingle();
      workerProfile = wrk;
    }

    return NextResponse.json({ data: messages, counterpart, counterpartProfile, counterpartWorkerProfile: workerProfile, match, success: true });
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
