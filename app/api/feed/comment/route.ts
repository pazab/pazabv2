import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/feed/comment?feedPostId=xxx
export async function GET(req: NextRequest) {
  try {
    const feedPostId = req.nextUrl.searchParams.get("feedPostId");
    if (!feedPostId) {
      return NextResponse.json({ success: false, error: "feedPostId 필요" }, { status: 400 });
    }

    const { data: comments, error: commErr } = await supabaseAdmin
      .from("feed_comments")
      .select("*")
      .eq("feed_post_id", feedPostId)
      .order("created_at", { ascending: true });

    if (commErr) throw commErr;
    if (!comments || comments.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 작성자 프로필 정보 일괄 조회
    const userIds = Array.from(new Set(comments.map(c => c.user_id)));
    const { data: users, error: usersErr } = await supabaseAdmin
      .from("users")
      .select("id, nickname, avatar_url, user_type")
      .in("id", userIds);

    if (usersErr) throw usersErr;

    const employerUserIds = (users || []).filter(u => u.user_type === "employer" || u.user_type === "both").map(u => u.id);
    const workerUserIds = (users || []).filter(u => u.user_type === "worker" || u.user_type === "both").map(u => u.id);

    const [employerProfiles, workerProfiles] = await Promise.all([
      employerUserIds.length > 0
        ? supabaseAdmin.from("employer_profiles").select("user_id, business_name, image_url").in("user_id", employerUserIds)
        : Promise.resolve({ data: [] }),
      workerUserIds.length > 0
        ? supabaseAdmin.from("worker_profiles").select("user_id, image_url").in("user_id", workerUserIds)
        : Promise.resolve({ data: [] })
    ]);

    const empProfileMap = new Map((employerProfiles.data || []).map(p => [p.user_id, p]));
    const wrkProfileMap = new Map((workerProfiles.data || []).map(p => [p.user_id, p]));

    const enriched = comments.map(comment => {
      const writer = (users || []).find(u => u.id === comment.user_id);
      const empProfile = empProfileMap.get(comment.user_id);
      const wrkProfile = wrkProfileMap.get(comment.user_id);

      const authorName = empProfile?.business_name 
        ? `${empProfile.business_name} 사장님` 
        : (writer?.nickname || "알 수 없음");

      const authorAvatar = empProfile?.image_url 
        || wrkProfile?.image_url 
        || writer?.avatar_url 
        || null;

      return {
        ...comment,
        authorName,
        authorAvatar
      };
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (error: any) {
    console.error("Error fetching comments:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/feed/comment
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
    const { feedPostId, content } = body;
    if (!feedPostId || !content) {
      return NextResponse.json({ success: false, error: "필수 파라미터 누락" }, { status: 400 });
    }

    const { data: comment, error: insertErr } = await supabaseAdmin
      .from("feed_comments")
      .insert({
        feed_post_id: feedPostId,
        user_id: user.id,
        content
      })
      .select("*")
      .single();

    if (insertErr) throw insertErr;

    // 댓글 수 갱신
    const { count: commentCount } = await supabaseAdmin
      .from("feed_comments")
      .select("*", { count: "exact", head: true })
      .eq("feed_post_id", feedPostId);

    await supabaseAdmin
      .from("feed_posts")
      .update({ comment_count: commentCount || 0 })
      .eq("id", feedPostId);

    // 작성자 정보 조회
    const { data: writer } = await supabaseAdmin
      .from("users")
      .select("nickname, avatar_url, user_type")
      .eq("id", user.id)
      .single();

    let businessName = "";
    let profilePic = "";
    if (writer?.user_type === "employer" || writer?.user_type === "both") {
      const { data: emp } = await supabaseAdmin
        .from("employer_profiles")
        .select("business_name, image_url")
        .eq("user_id", user.id)
        .maybeSingle();
      businessName = emp?.business_name || "";
      profilePic = emp?.image_url || "";
    } else {
      const { data: wrk } = await supabaseAdmin
        .from("worker_profiles")
        .select("image_url")
        .eq("user_id", user.id)
        .maybeSingle();
      profilePic = wrk?.image_url || "";
    }

    const authorName = businessName ? `${businessName} 사장님` : (writer?.nickname || "알 수 없음");
    const authorAvatar = profilePic || writer?.avatar_url || null;

    const enrichedComment = {
      ...comment,
      authorName,
      authorAvatar
    };

    return NextResponse.json({ success: true, data: enrichedComment, commentCount: commentCount || 0 });
  } catch (error: any) {
    console.error("Error creating comment:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/feed/comment
export async function DELETE(req: NextRequest) {
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

    const commentId = req.nextUrl.searchParams.get("commentId");
    if (!commentId) {
      return NextResponse.json({ success: false, error: "commentId 필요" }, { status: 400 });
    }

    // 1. 본인 댓글인지 검증
    const { data: comment, error: checkErr } = await supabaseAdmin
      .from("feed_comments")
      .select("user_id, feed_post_id")
      .eq("id", commentId)
      .maybeSingle();

    if (checkErr) throw checkErr;
    if (!comment) {
      return NextResponse.json({ success: false, error: "댓글이 존재하지 않습니다." }, { status: 404 });
    }
    if (comment.user_id !== user.id) {
      return NextResponse.json({ success: false, error: "본인 댓글만 삭제 가능합니다." }, { status: 403 });
    }

    const feedPostId = comment.feed_post_id;

    // 2. 댓글 삭제
    const { error: delErr } = await supabaseAdmin
      .from("feed_comments")
      .delete()
      .eq("id", commentId);

    if (delErr) throw delErr;

    // 3. 댓글 수 갱신
    const { count: commentCount } = await supabaseAdmin
      .from("feed_comments")
      .select("*", { count: "exact", head: true })
      .eq("feed_post_id", feedPostId);

    await supabaseAdmin
      .from("feed_posts")
      .update({ comment_count: commentCount || 0 })
      .eq("id", feedPostId);

    return NextResponse.json({ success: true, commentCount: commentCount || 0 });
  } catch (error: any) {
    console.error("Error deleting comment:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
