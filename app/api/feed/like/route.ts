import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "인증 필요" }, { status: 401 });
    }

    const body = await req.json();
    const { feedPostId } = body;
    if (!feedPostId) {
      return NextResponse.json({ success: false, error: "feedPostId 필요" }, { status: 400 });
    }

    // 1. 이미 좋아요 했는지 검증
    const { data: existingLike, error: checkErr } = await supabaseAdmin
      .from("feed_likes")
      .select("id")
      .eq("feed_post_id", feedPostId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (checkErr) throw checkErr;

    let liked = false;
    if (existingLike) {
      // 좋아요 해제
      const { error: delErr } = await supabaseAdmin
        .from("feed_likes")
        .delete()
        .eq("id", existingLike.id);
      if (delErr) throw delErr;
      liked = false;
    } else {
      // 좋아요 추가
      const { error: insErr } = await supabaseAdmin
        .from("feed_likes")
        .insert({
          feed_post_id: feedPostId,
          user_id: user.id
        });
      if (insErr) throw insErr;
      liked = true;
    }

    // 2. 실제 좋아요 수 카운트 후 feed_posts에 동기화
    const { count: likeCount } = await supabaseAdmin
      .from("feed_likes")
      .select("*", { count: "exact", head: true })
      .eq("feed_post_id", feedPostId);

    const { error: updateErr } = await supabaseAdmin
      .from("feed_posts")
      .update({ like_count: likeCount || 0 })
      .eq("id", feedPostId);

    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true, liked, likeCount: likeCount || 0 });
  } catch (error: any) {
    console.error("Error toggling like:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
