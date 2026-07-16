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

    // 게시물이 특정 매장에 귀속된 경우, 해당 매장 정보를 우선 사용 (다중 매장 사장님 대응)
    const storeIds = Array.from(new Set(posts.map(p => p.employer_profile_id).filter(Boolean)));

    const [employerProfiles, workerProfiles, storeProfiles] = await Promise.all([
      employerUserIds.length > 0
        ? supabaseAdmin.from("employer_profiles").select("user_id, business_name, logo_url, image_url").in("user_id", employerUserIds)
        : Promise.resolve({ data: [] }),
      workerUserIds.length > 0
        ? supabaseAdmin.from("worker_profiles").select("user_id, image_url").in("user_id", workerUserIds)
        : Promise.resolve({ data: [] }),
      storeIds.length > 0
        ? supabaseAdmin.from("employer_profiles").select("id, business_name, logo_url, image_url").in("id", storeIds)
        : Promise.resolve({ data: [] })
    ]);

    const empProfileMap = new Map((employerProfiles.data || []).map(p => [p.user_id, p]));
    const wrkProfileMap = new Map((workerProfiles.data || []).map(p => [p.user_id, p]));
    const storeProfileMap = new Map((storeProfiles.data || []).map(p => [p.id, p]));

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
      const storeProfile = post.employer_profile_id ? storeProfileMap.get(post.employer_profile_id) : null;
      const empProfile = empProfileMap.get(post.user_id);
      const wrkProfile = wrkProfileMap.get(post.user_id);

      // 매장 귀속 글이면 매장 정보 우선, 개인 글이면 닉네임만
      const isStorePost = !!post.employer_profile_id && !!storeProfile;
      const authorName = isStorePost
        ? (storeProfile!.business_name || writer?.nickname || "매장")
        : (writer?.nickname || "알 수 없음");

      // 프로필 아바타 결정
      const authorAvatar = isStorePost
        ? (storeProfile!.logo_url || storeProfile!.image_url || writer?.avatar_url || null)
        : (wrkProfile?.image_url || writer?.avatar_url || null);

      return {
        ...post,
        authorName,
        authorAvatar,
        authorType: writer?.user_type || "worker",
        trustScore: writer?.trust_score || 50,
        grade: writer?.grade || "bronze",
        likedByMe: likedPostIds.has(post.id),
        bookmarkedByMe: bookmarkedPostIds.has(post.id),
        authorRegion: writer?.region || null,
        storeId: post.employer_profile_id || null
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
    const { content, media_urls, media_type, employerProfileId } = body;

    // 매장 지정 시 본인 소유 매장인지 검증
    let store: { id: string; business_name: string | null; logo_url: string | null; image_url: string | null } | null = null;
    if (employerProfileId) {
      const { data: ownedStore } = await supabaseAdmin
        .from("employer_profiles")
        .select("id, business_name, logo_url, image_url")
        .eq("id", employerProfileId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!ownedStore) {
        return NextResponse.json({ success: false, error: "본인 소유 매장이 아닙니다." }, { status: 403 });
      }
      store = ownedStore;
    }

    const { data: newPost, error: insertErr } = await supabaseAdmin
      .from("feed_posts")
      .insert({
        user_id: user.id,
        content,
        media_urls: media_urls || [],
        media_type: media_type || "image",
        employer_profile_id: store?.id || null
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

    let authorName: string;
    let authorAvatar: string | null;

    if (store) {
      authorName = store.business_name || writer?.nickname || "매장";
      authorAvatar = store.logo_url || store.image_url || writer?.avatar_url || null;
    } else {
      // 개인 글 — 닉네임 + 개인 아바타
      authorName = writer?.nickname || "알 수 없음";
      const { data: wrk } = await supabaseAdmin
        .from("worker_profiles").select("image_url").eq("user_id", user.id).maybeSingle();
      authorAvatar = wrk?.image_url || writer?.avatar_url || null;
    }

    const enrichedPost = {
      ...newPost,
      authorName,
      authorAvatar,
      authorType: writer?.user_type || "worker",
      trustScore: writer?.trust_score || 50,
      grade: writer?.grade || "bronze",
      likedByMe: false,
      bookmarkedByMe: false,
      storeId: store?.id || null
    };

    // 매장에 올린 글이면 팔로워들에게 새 소식 알림 발송 (자연 유입 루프)
    if (store) {
      const { data: followers } = await supabaseAdmin
        .from("store_follows")
        .select("user_id")
        .eq("employer_profile_id", store.id);

      if (followers && followers.length > 0) {
        const { createNotification } = await import("@/lib/notify");
        await Promise.all(followers.map(f => createNotification({
          userId: f.user_id,
          type: "feed_new_post",
          title: `📰 ${store!.business_name} 새 소식`,
          body: content ? String(content).slice(0, 60) : "새로운 소식이 올라왔어요",
          url: `/store/${store!.id}`
        })));
      }
    }

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

export async function PATCH(req: NextRequest) {
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
    const { postId, content, mediaUrls, mediaType } = body;

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
      return NextResponse.json({ success: false, error: "수정 권한이 없음" }, { status: 403 });
    }

    // 2. 포스트 업데이트
    const { error: updErr } = await supabaseAdmin
      .from("feed_posts")
      .update({
        content,
        media_urls: mediaUrls,
        media_type: mediaType,
        updated_at: new Date().toISOString()
      })
      .eq("id", postId);

    if (updErr) throw updErr;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating post:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

