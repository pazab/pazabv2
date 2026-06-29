import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

webpush.setVapidDetails(
  "mailto:hellopazab@gmail.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

// 구독 저장
export async function POST(req: NextRequest) {
  try {
    const { userId, subscription } = await req.json();
    if (!userId || !subscription) {
      return NextResponse.json({ error: "필수 정보 없음" }, { status: 400 });
    }

    await supabase.from("push_subscriptions").upsert({
      user_id: userId,
      subscription: subscription,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// 푸시 발송
export async function PUT(req: NextRequest) {
  try {
    const { userId, title, body, url, tag } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId 필요" }, { status: 400 });

    const { data: sub } = await supabase.from("push_subscriptions")
      .select("subscription").eq("user_id", userId).maybeSingle();

    if (!sub?.subscription) {
      return NextResponse.json({ error: "구독 정보 없음", noSubscription: true });
    }

    await webpush.sendNotification(
      sub.subscription,
      JSON.stringify({ title, body, url: url || "/", tag: tag || "pazab" })
    );

    return NextResponse.json({ success: true });
  } catch (e: any) {
    // 구독 만료 시 삭제
    if (e.statusCode === 410) {
      const { userId } = await req.json().catch(() => ({}));
      if (userId) await supabase.from("push_subscriptions").delete().eq("user_id", userId);
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
