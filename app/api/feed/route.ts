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
    const currentUserId = user?.id || null;

    // 1. 피드 게시물 전체 가져오기
    const { data: posts, error: postsErr } = await supabaseAdmin
      .from("feed_posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (postsErr) throw postsErr;
    if (!posts || posts.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 2. 피드 작성자 정보 (users) 일괄 조회
    const userIds = Array.from(new Set(posts.map(p => p.user_id)));
    const { data: users, error: usersErr } = await supabaseAdmin
      .from("users")
      .select("id, nickname, avatar_url, user_type, trust_score, grade, region")
      .in("id", userIds);

    if (usersErr) throw usersErr;

    // 사장님 및 알바생 프로필 추가 정보 일괄 조회
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

    // 3. 내가 좋아요 및 북마크 한 항목 매핑
    let likedPostIds = new Set<string>();
    let bookmarkedPostIds = new Set<string>();
    
    if (currentUserId) {
      const postIds = posts.map(p => p.id);
      const [likesRes, bookmarksRes] = await Promise.all([
        supabaseAdmin.from("feed_likes").select("feed_post_id").eq("user_id", currentUserId).in("feed_post_id", postIds),
        supabaseAdmin.from("feed_bookmarks").select("feed_post_id").eq("user_id", currentUserId).in("feed_post_id", postIds)
      ]);

      if (likesRes.data) {
        likedPostIds = new Set(likesRes.data.map(l => l.feed_post_id));
      }
      if (bookmarksRes.data) {
        bookmarkedPostIds = new Set(bookmarksRes.data.map(b => b.feed_post_id));
      }
    }

    // 4. 데이터 조립
    const enriched = posts.map(post => {
      const writer = (users || []).find(u => u.id === post.user_id);
      const empProfile = empProfileMap.get(post.user_id);
      const wrkProfile = wrkProfileMap.get(post.user_id);

      // 이름 결정 (매장 이름이 있으면 매장 이름 노출, 없으면 닉네임)
      const authorName = empProfile?.business_name 
        ? `${empProfile.business_name} 사장님` 
        : (writer?.nickname || "알 수 없음");

      // 프로필 아바타 결정
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
        bookmarkedByMe: bookmarkedPostIds.has(post.id),
        authorRegion: writer?.region || null
      };
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (error: any) {
    console.error("Error fetching feed:", error);
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
      return NextResponse.json({ success: false, error: "인증되지 않은 사용자입니다." }, { status: 401 });
    }

    const body = await req.json();
    const { content, media_urls, media_type } = body;

    const { data: newPost, error: insertErr } = await supabaseAdmin
      .from("feed_posts")
      .insert({
        user_id: user.id,
        content,
        media_urls: media_urls || [],
        media_type: media_type || "image"
      })
      .select("*")
      .single();

    if (insertErr) throw insertErr;

    // 작성한 내 프로필 정보 포함하여 리턴
    const { data: writer } = await supabaseAdmin
      .from("users")
      .select("nickname, avatar_url, user_type, trust_score, grade")
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

    const enrichedPost = {
      ...newPost,
      authorName,
      authorAvatar,
      authorType: writer?.user_type || "worker",
      trustScore: writer?.trust_score || 50,
      grade: writer?.grade || "bronze",
      likedByMe: false
    };

    return NextResponse.json({ success: true, data: enrichedPost });
  } catch (error: any) {
    console.error("Error creating post:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

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

    const { searchParams } = new URL(req.url);
    const postId = searchParams.get("postId");
    if (!postId) {
      return NextResponse.json({ success: false, error: "postId 필요" }, { status: 400 });
    }

    // 1. 해당 포스트의 소유주 확인
    const { data: post, error: getErr } = await supabaseAdmin
      .from("feed_posts")
      .select("user_id")
      .eq("id", postId)
      .single();

    if (getErr) throw getErr;
    if (!post) {
      return NextResponse.json({ success: false, error: "포스트를 찾을 수 없음" }, { status: 404 });
    }
    if (post.user_id !== user.id) {
      return NextResponse.json({ success: false, error: "삭제 권한이 없음" }, { status: 403 });
    }

    // 2. 종속된 데이터들 일괄 삭제 (likes, comments, bookmarks)
    await Promise.all([
      supabaseAdmin.from("feed_likes").delete().eq("feed_post_id", postId),
      supabaseAdmin.from("feed_comments").delete().eq("feed_post_id", postId),
      supabaseAdmin.from("feed_bookmarks").delete().eq("feed_post_id", postId),
    ]);

    // 3. 포스트 삭제
    const { error: delErr } = await supabaseAdmin
      .from("feed_posts")
      .delete()
      .eq("id", postId);

    if (delErr) throw delErr;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting post:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

