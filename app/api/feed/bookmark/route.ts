import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
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

    // 1. 내가 북마크한 목록 조회
    const { data: bookmarks, error: bmErr } = await supabaseAdmin
      .from("feed_bookmarks")
      .select("feed_post_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (bmErr) throw bmErr;
    if (!bookmarks || bookmarks.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const postIds = bookmarks.map(b => b.feed_post_id);

    // 2. 해당 피드 포스트 상세 조회
    const { data: posts, error: postsErr } = await supabaseAdmin
      .from("feed_posts")
      .select("*")
      .in("id", postIds);

    if (postsErr) throw postsErr;
    if (!posts || posts.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 정렬 순서를 북마크 생성일자 순서대로 맞춤
    const postMap = new Map(posts.map(p => [p.id, p]));
    const sortedPosts = postIds.map(id => postMap.get(id)).filter(Boolean) as any[];

    // 3. 작성자 프로필 정보 일괄 조회
    const userIds = Array.from(new Set(sortedPosts.map(p => p.user_id)));
    const { data: users, error: usersErr } = await supabaseAdmin
      .from("users")
      .select("id, nickname, avatar_url, user_type, trust_score, grade")
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

    // 4. 내가 좋아요 한 피드 목록 조회
    const { data: myLikes } = await supabaseAdmin
      .from("feed_likes")
      .select("feed_post_id")
      .eq("user_id", user.id)
      .in("feed_post_id", postIds);

    const likedPostIds = new Set((myLikes || []).map(l => l.feed_post_id));

    // 5. 데이터 조립
    const enriched = sortedPosts.map(post => {
      const writer = (users || []).find(u => u.id === post.user_id);
      const empProfile = empProfileMap.get(post.user_id);
      const wrkProfile = wrkProfileMap.get(post.user_id);

      const authorName = empProfile?.business_name 
        ? `${empProfile.business_name} 사장님` 
        : (writer?.nickname || "알 수 없음");

      const authorAvatar = empProfile?.image_url 
        || wrkProfile?.image_url 
        || writer?.avatar_url 
        || null;

      return {
        ...post,
        authorName,
        authorAvatar,
        authorType: writer?.user_type || "worker",
        trustScore: writer?.trust_score || 50,
        grade: writer?.grade || "bronze",
        likedByMe: likedPostIds.has(post.id),
        bookmarkedByMe: true
      };
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (error: any) {
    console.error("Error fetching bookmarked feeds:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

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

    // 1. 이미 저장되어 있는지 확인
    const { data: existing, error: checkErr } = await supabaseAdmin
      .from("feed_bookmarks")
      .select("id")
      .eq("feed_post_id", feedPostId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (checkErr) throw checkErr;

    let bookmarked = false;
    if (existing) {
      // 북마크 삭제
      const { error: delErr } = await supabaseAdmin
        .from("feed_bookmarks")
        .delete()
        .eq("id", existing.id);
      if (delErr) throw delErr;
      bookmarked = false;
    } else {
      // 북마크 추가
      const { error: insErr } = await supabaseAdmin
        .from("feed_bookmarks")
        .insert({ feed_post_id: feedPostId, user_id: user.id });
      if (insErr) throw insErr;
      bookmarked = true;
    }

    return NextResponse.json({ success: true, bookmarked });
  } catch (error: any) {
    console.error("Error toggling bookmark:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
