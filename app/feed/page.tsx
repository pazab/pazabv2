"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import { EntityLink } from "@/components/EntityLink";

interface Post {
  id: string;
  user_id: string;
  content: string;
  media_urls: string[];
  media_type: "image" | "video";
  like_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
  authorName: string;
  authorAvatar: string | null;
  authorType: string;
  trustScore: number;
  grade: string;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
  authorRegion: string | null;
  storeId: string | null;
}

interface MyStore {
  id: string;
  business_name: string;
}

interface Comment {
  id: string;
  feed_post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  authorName: string;
  authorAvatar: string | null;
}

const GRADE_EMOJI: Record<string, string> = { 
  bronze: "🥉", 
  silver: "🥈", 
  gold: "🥇", 
  platinum: "💎" 
};

const isVideoFile = (file: File) => {
  if (!file) return false;
  if (file.type && file.type.startsWith("video/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext ? ["mp4", "webm", "ogg", "mov", "avi", "mkv", "quicktime"].includes(ext) : false;
};

const isVideoUrl = (url: string) => {
  if (!url || typeof url !== "string") return false;
  if (url.startsWith("data:video/")) return true;
  const cleanUrl = url.split("?")[0].split("#")[0];
  const ext = cleanUrl.split(".").pop()?.toLowerCase();
  return ext ? ["mp4", "webm", "ogg", "mov", "avi", "mkv"].includes(ext) : false;
};

function FeedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<"all" | "following" | "nearby" | "employer" | "worker">("all");
  const [userRegion, setUserRegion] = useState<string | null>(null);
  const [followedStoreIds, setFollowedStoreIds] = useState<Set<string>>(new Set());

  // 작성 모달 상태
  const [writeModalOpen, setWriteModalOpen] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newMediaFiles, setNewMediaFiles] = useState<File[]>([]);
  const [newMediaType, setNewMediaType] = useState<"image" | "video">("image");
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [myStores, setMyStores] = useState<MyStore[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  // 수정/삭제 관련 추가 상태
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [existingMediaUrls, setExistingMediaUrls] = useState<string[]>([]);
  const [activeMenuPostId, setActiveMenuPostId] = useState<string | null>(null);

  // 댓글 창 관리 (postId -> boolean)
  const [openCommentsMap, setOpenCommentsMap] = useState<Record<string, boolean>>({});
  const [commentsMap, setCommentsMap] = useState<Record<string, Comment[]>>({});
  const [loadingCommentsMap, setLoadingCommentsMap] = useState<Record<string, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  // 다중 이미지 캐러셀 (PC 화살표 버튼용 현재 인덱스 + 스크롤 컨테이너 참조)
  const [mediaIndexMap, setMediaIndexMap] = useState<Record<string, number>>({});
  const mediaRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // 풀스크린 이미지 뷰어 (인스타 스타일 확대보기)
  const [zoomedPost, setZoomedPost] = useState<Post | null>(null);
  const [zoomedIndex, setZoomedIndex] = useState(0);

  // 동영상 스크롤 자동재생/정지 (인스타/틱톡 스타일 — 화면에 들어오면 재생, 벗어나면 정지)
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [mutedMap, setMutedMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const writeMode = searchParams.get("write") === "true";
    const qStoreId = searchParams.get("storeId");
    if (writeMode) {
      setWriteModalOpen(true);
      if (qStoreId) {
        setSelectedStoreId(qStoreId);
      }
      // URL의 쿼리 매개변수를 제거하여 뒤로가기 시 모달이 다시 활성화되는 중복 팝업 현상을 방지
      router.replace("/feed", { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { threshold: [0, 0.6, 1] }
    );
    videoRefs.current.forEach(video => observer.observe(video));
    return () => observer.disconnect();
  }, [posts, filterTab]);

  const scrollMedia = (postId: string, dir: -1 | 1) => {
    const el = mediaRefs.current.get(postId);
    if (!el) return;
    const nextIdx = Math.max(0, (mediaIndexMap[postId] || 0) + dir);
    el.scrollTo({ left: nextIdx * el.clientWidth, behavior: "smooth" });
  };

  const handleMediaScroll = (postId: string, e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (!el.clientWidth) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setMediaIndexMap(prev => (prev[postId] === idx ? prev : { ...prev, [postId]: idx }));
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        localStorage.setItem("login_redirect", "/feed");
        router.push("/login");
        return;
      }
      setUserId(session.user.id);

      // 내 지역 정보 로딩
      const { data: u } = await supabase
        .from("users")
        .select("region")
        .eq("id", session.user.id)
        .maybeSingle();
      if (u?.region) setUserRegion(u.region);

      // 내 매장 목록 로딩 (사장님/both — 피드 작성 시 매장 귀속 선택용)
      const { data: eps } = await supabase
        .from("employer_profiles")
        .select("id, business_name")
        .eq("user_id", session.user.id)
        .not("business_name", "is", null)
        .or("is_deleted.is.null,is_deleted.eq.false");
      if (eps && eps.length > 0) {
        setMyStores(eps as MyStore[]);
        setSelectedStoreId(eps[0].id);
      }

      // 내가 팔로우한 매장 목록 ("팔로잉" 탭 필터용)
      const { data: follows } = await supabase
        .from("store_follows")
        .select("employer_profile_id")
        .eq("user_id", session.user.id);
      if (follows) {
        setFollowedStoreIds(new Set(follows.map(f => f.employer_profile_id)));
      }

      fetchPosts();
    });
  }, []);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/feed");
      const data = await res.json();
      if (data.success) {
        setPosts(data.data || []);
      }
    } catch (e) {
      console.error("Error fetching posts:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async (postId: string) => {
    // 낙관적 업데이트
    setPosts(prev => prev.map(post => {
      if (post.id === postId) {
        const nextLiked = !post.likedByMe;
        return {
          ...post,
          likedByMe: nextLiked,
          like_count: post.like_count + (nextLiked ? 1 : -1)
        };
      }
      return post;
    }));

    try {
      const res = await fetch("/api/feed/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedPostId: postId })
      });
      const data = await res.json();
      if (!data.success) {
        // 에러 시 롤백
        fetchPosts();
      }
    } catch {
      fetchPosts();
    }
  };

  const handleBookmark = async (postId: string) => {
    // 낙관적 업데이트
    setPosts(prev => prev.map(post => {
      if (post.id === postId) {
        return {
          ...post,
          bookmarkedByMe: !post.bookmarkedByMe
        };
      }
      return post;
    }));

    try {
      const res = await fetch("/api/feed/bookmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedPostId: postId })
      });
      const data = await res.json();
      if (!data.success) {
        fetchPosts();
      }
    } catch {
      fetchPosts();
    }
  };

  const toggleComments = async (postId: string) => {
    const isCurrentlyOpen = !!openCommentsMap[postId];
    setOpenCommentsMap(prev => ({ ...prev, [postId]: !isCurrentlyOpen }));

    if (!isCurrentlyOpen && !commentsMap[postId]) {
      // 댓글 불러오기
      try {
        setLoadingCommentsMap(prev => ({ ...prev, [postId]: true }));
        const res = await fetch(`/api/feed/comment?feedPostId=${postId}`);
        const data = await res.json();
        if (data.success) {
          setCommentsMap(prev => ({ ...prev, [postId]: data.data || [] }));
        }
      } catch (err) {
        console.error("Error loading comments:", err);
      } finally {
        setLoadingCommentsMap(prev => ({ ...prev, [postId]: false }));
      }
    }
  };

  const handleAddComment = async (postId: string) => {
    const text = commentInputs[postId]?.trim();
    if (!text) return;

    // 입력 필드 초기화
    setCommentInputs(prev => ({ ...prev, [postId]: "" }));

    try {
      const res = await fetch("/api/feed/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedPostId: postId, content: text })
      });
      const data = await res.json();
      if (data.success) {
        // 댓글 목록에 추가 및 댓글 수 반영
        setCommentsMap(prev => ({
          ...prev,
          [postId]: [...(prev[postId] || []), data.data]
        }));
        setPosts(prev => prev.map(post => {
          if (post.id === postId) {
            return { ...post, comment_count: data.commentCount };
          }
          return post;
        }));
      }
    } catch (e) {
      console.error("Error adding comment:", e);
    }
  };

  const handleDeleteComment = async (postId: string, commentId: string) => {
    try {
      const res = await fetch(`/api/feed/comment?commentId=${commentId}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.success) {
        // 댓글 목록에서 제거 및 댓글 수 반영
        setCommentsMap(prev => ({
          ...prev,
          [postId]: (prev[postId] || []).filter(c => c.id !== commentId)
        }));
        setPosts(prev => prev.map(post => {
          if (post.id === postId) {
            return { ...post, comment_count: data.commentCount };
          }
          return post;
        }));
      }
    } catch (e) {
      console.error("Error deleting comment:", e);
    }
  };

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    // 새로 선택된 파일들의 프리뷰 URL 생성
    const newPreviews = files.map(file => URL.createObjectURL(file));

    // 기존 미디어 파일에 이어붙이기 (비디오 감지는 콜백 외부에서 안전하게 상태 단독 갱신)
    const nextFiles = [...newMediaFiles, ...files];
    const hasVideo = nextFiles.some(f => isVideoFile(f));
    setNewMediaType(hasVideo ? "video" : "image");

    setNewMediaFiles(prev => [...prev, ...files]);
    setMediaPreviews(prev => [...prev, ...newPreviews]);
  };

  const openEditModal = (post: Post) => {
    setEditingPost(post);
    setNewContent(post.content);
    setExistingMediaUrls(post.media_urls || []);
    setNewMediaType(post.media_type || "image");
    setSelectedStoreId(post.storeId);
    setMediaPreviews(post.media_urls || []);
    setWriteModalOpen(true);
    setActiveMenuPostId(null);
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm("정말 이 게시글을 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/feed?postId=${postId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setPosts(prev => prev.filter(p => p.id !== postId));
      } else {
        alert("삭제 실패: " + data.error);
      }
    } catch (err: any) {
      alert("오류 발생: " + err.message);
    }
  };

  const removePreview = (idx: number) => {
    const targetUrl = mediaPreviews[idx];
    setMediaPreviews(prev => prev.filter((_, i) => i !== idx));

    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      setExistingMediaUrls(prev => prev.filter(url => url !== targetUrl));
    } else {
      // blob url들 중 이 인덱스가 새로 선택한 파일들(newMediaFiles) 중 몇 번째에 해당하는지 파악
      const numBeforeBlob = mediaPreviews.slice(0, idx).filter(url => !url.startsWith("http://") && !url.startsWith("https://")).length;
      setNewMediaFiles(prev => prev.filter((_, i) => i !== numBeforeBlob));
    }
  };

  const handleCreatePost = async () => {
    if (!newContent.trim() && newMediaFiles.length === 0 && existingMediaUrls.length === 0) return;
    setUploading(true);

    try {
      const uploadedUrls: string[] = [];

      // 1. Supabase Storage 신규 파일 업로드
      for (const file of newMediaFiles) {
        const fileExt = file.name.split(".").pop();
        const randId = Math.random().toString(36).substring(2, 9);
        const fileName = `${Date.now()}-${randId}.${fileExt}`;
        const path = `feeds/${userId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("media")
          .upload(path, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from("media").getPublicUrl(path);
        if (data?.publicUrl) {
          uploadedUrls.push(data.publicUrl);
        }
      }

      // 최종 미디어 URL 목록 (기존 유지분 + 신규 업로드분)
      const finalMediaUrls = [...existingMediaUrls, ...uploadedUrls];

      // 최종 미디어 파일 구성을 보고 비디오가 1개라도 존재하는지 엄밀하게 판별
      const hasNewVideo = newMediaFiles.some(f => isVideoFile(f));
      const hasExistingVideo = existingMediaUrls.some(url => isVideoUrl(url));
      const computedMediaType = (hasNewVideo || hasExistingVideo) ? "video" : "image";

      if (editingPost) {
        // 2-A. DB Update (수정)
        const res = await fetch("/api/feed", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postId: editingPost.id,
            content: newContent,
            mediaUrls: finalMediaUrls,
            mediaType: computedMediaType
          })
        });

        const data = await res.json();
        if (data.success) {
          setPosts(prev => prev.map(p => 
            p.id === editingPost.id 
              ? { ...p, content: newContent, media_urls: finalMediaUrls, media_type: computedMediaType } 
              : p
          ));
          closeWriteModal();
        } else {
          alert("게시물 수정 실패: " + data.error);
        }
      } else {
        // 2-B. DB Insert (새로운 등록)
        const res = await fetch("/api/feed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: newContent,
            media_urls: finalMediaUrls,
            media_type: computedMediaType,
            employerProfileId: selectedStoreId
          })
        });

        const data = await res.json();
        if (data.success) {
          setPosts(prev => [data.data, ...prev]);
          closeWriteModal();
        } else {
          alert("게시물 업로드 실패: " + data.error);
        }
      }
    } catch (err: any) {
      console.error(err);
      alert("처리 중 오류 발생: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const closeWriteModal = () => {
    setWriteModalOpen(false);
    setNewContent("");
    setNewMediaFiles([]);
    setMediaPreviews([]);
    setNewMediaType("image");
    setEditingPost(null);
    setExistingMediaUrls([]);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return "방금 전";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
    return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  };

  const displayedPosts = posts.filter(post => {
    if (filterTab === "following") {
      return !!post.storeId && followedStoreIds.has(post.storeId);
    }
    if (filterTab === "nearby") {
      if (!userRegion || !post.authorRegion) return true;
      const userCity = userRegion.split(" ")[0]; // 예: "충청남도"
      return post.authorRegion.includes(userCity);
    }
    if (filterTab === "employer") {
      return post.authorType === "employer" || post.authorType === "both";
    }
    if (filterTab === "worker") {
      return post.authorType === "worker";
    }
    return true;
  });

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 110 }}>
      <AppHeader title="피드" showBellAndMenu={true} />

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "12px 14px" }}>
        
      {/* 필터 탭 */}
      <div className="flex gap-2 mb-4 border-b border-border pb-2 overflow-x-auto scrollbar-none">
        {[
          { id: "all", label: "전체" },
          { id: "following", label: "❤️ 팔로잉" },
          { id: "nearby", label: "내 주변 📍" },
          { id: "employer", label: "🏪 매장 소식" },
          { id: "worker", label: "👤 구직 피드" }
        ].map(tab => (
          <button key={tab.id} onClick={() => setFilterTab(tab.id as any)}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition flex-shrink-0"
            style={filterTab === tab.id
              ? { background: "var(--primary)", color: "#fff" }
              : { background: "var(--surface2)", color: "var(--text-sub)" }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* 게시글 목록 */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <span className="text-sm text-text-muted">불러오는 중...</span>
        </div>
      ) : displayedPosts.length === 0 ? (
        <div className="text-center py-20 px-4 bg-surface rounded-2xl border border-border shadow-sm">
          <div className="text-4xl mb-3">{filterTab === "following" ? "❤️" : "📸"}</div>
          <h4 className="text-base font-bold mb-1">
            {filterTab === "following" ? "아직 팔로우한 매장이 없어요" : "피드가 비어있어요"}
          </h4>
          <p className="text-xs text-text-muted mb-4">
            {filterTab === "following"
              ? "관심 있는 매장 글에서 팔로우하면 여기 모아볼 수 있어요"
              : "선택한 필터에 해당하는 피드가 존재하지 않습니다."}
          </p>
          {filterTab === "following" ? (
            <button onClick={() => setFilterTab("all")}
              className="font-bold text-xs px-5 py-2.5 rounded-xl hover:scale-105 active:scale-95 transition"
              style={{ background: "var(--primary)", color: "#fff" }}>
              🔍 전체 피드 둘러보기
            </button>
          ) : (
            <button onClick={() => setWriteModalOpen(true)}
              className="font-bold text-xs px-5 py-2.5 rounded-xl hover:scale-105 active:scale-95 transition"
              style={{ background: "var(--primary)", color: "#fff" }}>
              ✨ 첫 피드 남기기
            </button>
          )}
        </div>
      ) : (
          <div className="flex flex-col gap-4">
            {displayedPosts.map(post => {
              const isOpen = !!openCommentsMap[post.id];
              const comments = commentsMap[post.id] || [];
              const commentsLoading = !!loadingCommentsMap[post.id];
              
              return (
                <div key={post.id} className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col">
                  {/* 작성자 정보 */}
                  <div className="flex items-center justify-between p-3 border-b border-border hover:bg-surface2/40 transition relative">
                    <div
                      onClick={() => router.push(post.storeId ? `/store/${post.storeId}` : `/profile/${post.user_id}`)}
                      className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-surface2 border border-border flex items-center justify-center flex-shrink-0">
                        {post.authorAvatar ? (
                          <img src={post.authorAvatar} alt="avatar" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-lg">{post.authorType === "employer" ? "🏪" : "👤"}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-text truncate">{post.authorName}</span>
                          <span className="text-xs" title={post.grade}>{GRADE_EMOJI[post.grade] || "🥉"}</span>
                          {post.storeId && (
                            <EntityLink
                              href={`/store/${post.storeId}`}
                              avatarUrl={post.authorAvatar}
                              fallbackEmoji="🏪"
                              fallbackGradient="linear-gradient(135deg,#ec4899,#be185d)"
                              name=""
                              label="매장홈"
                              variant="chip"
                              avatarShape="square"
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-text-muted bg-surface2 px-1.5 py-0.5 rounded">
                            신뢰도 {post.trustScore}
                          </span>
                          <span className="text-[10px] text-text-muted">
                            {formatTime(post.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 본인 작성 글 수정/삭제 메뉴 */}
                    {post.user_id === userId && (
                      <div className="relative">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuPostId(prev => prev === post.id ? null : post.id);
                          }}
                          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface2 transition focus:outline-none cursor-pointer">
                          <span className="text-text font-bold text-sm">⋮</span>
                        </button>
                        {activeMenuPostId === post.id && (
                          <div className="absolute right-0 top-9 bg-surface border border-border rounded-xl shadow-lg z-20 w-24 overflow-hidden flex flex-col py-1">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditModal(post);
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-bold text-text hover:bg-surface2 transition cursor-pointer">
                              ✏️ 수정하기
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePost(post.id);
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-500/10 transition cursor-pointer">
                              🗑️ 삭제하기
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 미디어 영역 */}
                  {post.media_urls && post.media_urls.length > 0 && (
                    <div className="relative w-full aspect-[4/3] bg-black overflow-hidden flex items-center justify-center">
                      {(post.media_urls.length === 1 && isVideoUrl(post.media_urls[0])) ? (
                        <>
                          <video
                            ref={el => { if (el) videoRefs.current.set(post.id, el); else videoRefs.current.delete(post.id); }}
                            src={post.media_urls[0]}
                            muted={mutedMap[post.id] !== false}
                            loop
                            playsInline
                            onClick={e => {
                              const v = e.currentTarget;
                              v.paused ? v.play().catch(() => {}) : v.pause();
                            }}
                            className="w-full h-full object-contain cursor-pointer" />
                          <button
                            onClick={() => setMutedMap(prev => ({ ...prev, [post.id]: prev[post.id] === false }))}
                            className="absolute bottom-2.5 right-2.5 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition"
                            aria-label="음소거 전환">
                            <i className={`ti ${mutedMap[post.id] !== false ? "ti-volume-3" : "ti-volume"}`}
                              style={{ fontSize: 14, color: "#fff" }} aria-hidden="true" />
                          </button>
                        </>
                      ) : (
                        <div
                          ref={el => { if (el) mediaRefs.current.set(post.id, el); else mediaRefs.current.delete(post.id); }}
                          onScroll={e => handleMediaScroll(post.id, e)}
                          className="flex w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-none">
                          {post.media_urls.map((url, idx) => {
                            const isVid = isVideoUrl(url);
                            return (
                              <div key={idx}
                                onClick={() => { setZoomedPost(post); setZoomedIndex(idx); }}
                                className="w-full h-full flex-shrink-0 snap-start flex items-center justify-center cursor-zoom-in relative bg-black">
                                {isVid ? (
                                  <>
                                    <video
                                      src={url}
                                      muted={mutedMap[`${post.id}-${idx}`] !== false}
                                      loop
                                      playsInline
                                      autoPlay={idx === (mediaIndexMap[post.id] || 0)} // 현재 보고 있는 슬라이드면 자동재생
                                      className="w-full h-full object-contain" />
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMutedMap(prev => ({ ...prev, [`${post.id}-${idx}`]: prev[`${post.id}-${idx}`] === false }));
                                      }}
                                      className="absolute bottom-12 right-2.5 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition z-10"
                                      aria-label="음소거 전환">
                                      <i className={`ti ${mutedMap[`${post.id}-${idx}`] !== false ? "ti-volume-3" : "ti-volume"}`}
                                        style={{ fontSize: 14, color: "#fff" }} aria-hidden="true" />
                                    </button>
                                  </>
                                ) : (
                                  <img src={url} alt={`media-${idx}`} className="w-full h-full object-contain" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* 크게 보기 버튼 (동영상이 아닐 때 혹은 다중 미디어일 때 노출) */}
                      {(post.media_urls.length > 1 || !isVideoUrl(post.media_urls[0])) && (
                        <button onClick={() => { setZoomedPost(post); setZoomedIndex(mediaIndexMap[post.id] || 0); }}
                          className="absolute bottom-2.5 right-2.5 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition z-10"
                          aria-label="크게 보기">
                          <i className="ti ti-maximize" style={{ fontSize: 14, color: "#fff" }} aria-hidden="true" />
                        </button>
                      )}

                      {/* PC용 좌우 화살표 버튼 */}
                      {post.media_urls.length > 1 && (
                        <>
                          {(mediaIndexMap[post.id] || 0) > 0 && (
                            <button onClick={() => scrollMedia(post.id, -1)}
                              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition z-10"
                              aria-label="이전 사진">
                              <i className="ti ti-chevron-left" style={{ fontSize: 18, color: "#fff" }} aria-hidden="true" />
                            </button>
                          )}
                          {(mediaIndexMap[post.id] || 0) < post.media_urls.length - 1 && (
                            <button onClick={() => scrollMedia(post.id, 1)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition z-10"
                              aria-label="다음 사진">
                              <i className="ti ti-chevron-right" style={{ fontSize: 18, color: "#fff" }} aria-hidden="true" />
                            </button>
                          )}
                        </>
                      )}

                      {/* 이미지 개수 표시 인디케이터 */}
                      {post.media_type === "image" && post.media_urls.length > 1 && (
                        <div className="absolute top-3 right-3 bg-black/60 text-[10px] text-white px-2 py-0.5 rounded-full font-bold">
                          {(mediaIndexMap[post.id] || 0) + 1}/{post.media_urls.length}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 피드 텍스트 및 액션 */}
                  <div className="p-3 flex flex-col gap-2">
                    {/* 액션 버튼 */}
                    <div className="flex justify-between items-center w-full">
                      <div className="flex items-center gap-4">
                        <button onClick={() => handleLike(post.id)} className="flex items-center gap-1.5 text-text-sub focus:outline-none">
                          <i className={`ti ${post.likedByMe ? "ti-heart-filled text-pink-500 scale-110" : "ti-heart text-text"} text-xl transition`} aria-hidden="true" />
                          <span className="text-xs font-bold">{post.like_count}</span>
                        </button>
                        <button onClick={() => toggleComments(post.id)} className="flex items-center gap-1.5 text-text-sub focus:outline-none">
                          <i className="ti ti-message-2 text-xl text-text" aria-hidden="true" />
                          <span className="text-xs font-bold">{post.comment_count}</span>
                        </button>
                      </div>
                      <button onClick={() => handleBookmark(post.id)} className="text-text-sub focus:outline-none">
                        <i className={`ti ${post.bookmarkedByMe ? "ti-bookmark-filled text-yellow-500 scale-110" : "ti-bookmark text-text"} text-xl transition`} aria-hidden="true" />
                      </button>
                    </div>

                    {/* 본문 텍스트 */}
                    {post.content && (
                      <p className="text-xs text-text-sub leading-relaxed whitespace-pre-wrap mt-1">
                        {post.content}
                      </p>
                    )}
                  </div>

                  {/* 댓글 섹션 */}
                  {isOpen && (
                    <div className="border-t border-border bg-surface2 p-3 flex flex-col gap-3">
                      {commentsLoading ? (
                        <span className="text-[10px] text-text-muted text-center py-1">댓글 불러오는 중...</span>
                      ) : comments.length === 0 ? (
                        <span className="text-[10px] text-text-muted text-center py-1">아직 댓글이 없어요. 첫 마디를 달아보세요!</span>
                      ) : (
                        <div className="flex flex-col gap-2.5 max-h-48 overflow-y-auto pr-1">
                          {comments.map(comment => (
                            <div key={comment.id} className="flex gap-2 items-start text-xs">
                              <div className="w-6 h-6 rounded-full overflow-hidden bg-surface flex-shrink-0 border border-border flex items-center justify-center">
                                {comment.authorAvatar ? (
                                  <img src={comment.authorAvatar} alt="avatar" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-xs">👤</span>
                                )}
                              </div>
                              <div className="flex-1 bg-surface rounded-xl px-2.5 py-1.5 shadow-sm border border-border relative">
                                <div className="flex justify-between items-center mb-0.5">
                                  <span className="font-bold text-[10px] text-text">{comment.authorName}</span>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[8px] text-text-muted">{formatTime(comment.created_at)}</span>
                                    {comment.user_id === userId && (
                                      <button onClick={() => handleDeleteComment(post.id, comment.id)}
                                        className="text-text-muted hover:text-red-500 font-bold p-0.5">
                                        <i className="ti ti-trash text-[10px]" aria-hidden="true" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <p className="text-[11px] text-text-sub leading-normal">{comment.content}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 댓글 작성창 */}
                      <div className="flex gap-2 mt-1">
                        <input type="text" placeholder="댓글을 달아보세요..."
                          value={commentInputs[post.id] || ""}
                          onChange={e => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter") handleAddComment(post.id); }}
                          className="flex-1 bg-surface border border-border text-xs px-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary" />
                        <button onClick={() => handleAddComment(post.id)}
                          className="text-xs font-bold px-3.5 py-2 rounded-xl active:scale-95 transition"
                          style={{ background: "var(--primary)", color: "#fff" }}>
                          전송
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 새 피드 등록 FAB */}
      <button onClick={() => setWriteModalOpen(true)}
        className="fixed bottom-[92px] right-4 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-40"
        style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
          boxShadow: "0 6px 20px rgba(139,92,246,0.55)",
          border: "2px solid rgba(255,255,255,0.25)",
        }}>
        <i className="ti ti-plus" style={{ fontSize: 26, color: "#fff" }} aria-hidden="true" />
      </button>

      {/* 작성 모달 */}
      {writeModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl border border-border shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            {/* 헤더 */}
            <div className="flex justify-between items-center px-4 py-3 border-b border-border">
              <span className="font-bold text-sm">새 피드 만들기</span>
              <button onClick={closeWriteModal} className="text-text-muted hover:text-text">
                <i className="ti ti-x text-lg" aria-hidden="true" />
              </button>
            </div>

            {/* 본문 */}
            <div className="p-4 flex flex-col gap-4">
              {/* 매장 귀속 선택 (사장님/both만 노출) */}
              {myStores.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-text-sub">이 소식을 어디에 올릴까요?</span>
                  <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
                    <button onClick={() => setSelectedStoreId(null)}
                      className="px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition flex-shrink-0"
                      style={selectedStoreId === null
                        ? { background: "var(--primary)", color: "#fff" }
                        : { background: "var(--surface2)", color: "var(--text-sub)" }}>
                      👤 개인 소식
                    </button>
                    {myStores.map(store => (
                      <button key={store.id} onClick={() => setSelectedStoreId(store.id)}
                        className="px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition flex-shrink-0"
                        style={selectedStoreId === store.id
                          ? { background: "var(--primary)", color: "#fff" }
                          : { background: "var(--surface2)", color: "var(--text-sub)" }}>
                        🏪 {store.business_name}
                      </button>
                    ))}
                  </div>
                  {selectedStoreId && (
                    <span className="text-[10px] text-text-muted">매장 페이지에 계속 쌓여서 팔로워에게 알림이 가요</span>
                  )}
                </div>
              )}

              <textarea placeholder="오늘의 일터 이야기나 일상 소식을 들려주세요... ✨"
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                rows={4}
                className="w-full text-xs bg-surface2 border border-border rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed" />

              {/* 미디어 선택 */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold text-text-sub">사진 또는 비디오 추가</span>
                <label className="w-full h-24 border border-dashed border-border rounded-xl bg-surface2 hover:bg-surface2/50 cursor-pointer transition flex flex-col items-center justify-center gap-1.5">
                  <input type="file" accept="image/*,video/*" multiple onChange={handleMediaChange} className="hidden" />
                  <i className="ti ti-camera text-2xl text-text-muted" aria-hidden="true" />
                  <span className="text-[10px] text-text-muted">사진 최대 10장 / 동영상 1개</span>
                </label>
              </div>

              {/* 미디어 프리뷰 */}
              {mediaPreviews.length > 0 && (
                <div className="flex gap-2 overflow-x-auto py-1 scrollbar-thin">
                  {mediaPreviews.map((url, idx) => {
                    const isVideo = isVideoFile(newMediaFiles[idx]) || isVideoUrl(url);
                    return (
                      <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border flex-shrink-0 bg-black">
                        {isVideo ? (
                          <video src={url} className="w-full h-full object-cover" />
                        ) : (
                          <img src={url} alt={`preview-${idx}`} className="w-full h-full object-cover" />
                        )}
                        <button onClick={() => removePreview(idx)} className="absolute top-0.5 right-0.5 bg-black/70 text-white w-4 h-4 rounded-full flex items-center justify-center hover:bg-black">
                          <i className="ti ti-x text-[8px]" aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 푸터 */}
            <div className="px-4 py-3 border-t border-border flex gap-2 justify-end bg-surface2">
              <button onClick={closeWriteModal} disabled={uploading}
                className="px-4 py-2 rounded-xl text-xs font-bold transition active:scale-95"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-sub)" }}>
                취소
              </button>
              <button onClick={handleCreatePost} disabled={uploading || (!newContent.trim() && newMediaFiles.length === 0)}
                className="px-4 py-2 rounded-xl text-xs font-bold transition active:scale-95 disabled:opacity-50"
                style={{ background: "var(--primary)", color: "#fff" }}>
                {uploading ? "업로드 중..." : "공유하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 풀스크린 이미지 뷰어 (인스타 스타일) */}
      {zoomedPost && (() => {
        const liveZoomedPost = posts.find(p => p.id === zoomedPost.id) || zoomedPost;
        return (
        <div className="fixed inset-0 bg-black/95 z-[60] flex flex-col" onClick={() => setZoomedPost(null)}>
          {/* 상단 바 */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-surface2 border border-white/20 flex items-center justify-center flex-shrink-0">
                {liveZoomedPost.authorAvatar ? (
                  <img src={liveZoomedPost.authorAvatar} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm">{liveZoomedPost.authorType === "employer" ? "🏪" : "👤"}</span>
                )}
              </div>
              <span className="text-white text-xs font-bold truncate">{liveZoomedPost.authorName}</span>
            </div>
            <button onClick={() => setZoomedPost(null)}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center flex-shrink-0">
              <i className="ti ti-x" style={{ fontSize: 18, color: "#fff" }} aria-hidden="true" />
            </button>
          </div>

          {/* 이미지 (핀치/스크롤 확대는 브라우저 기본 동작에 위임, contain으로 전체 노출) */}
          <div className="flex-1 relative flex items-center justify-center min-h-0" onClick={e => e.stopPropagation()}>
            <img src={liveZoomedPost.media_urls[zoomedIndex]} alt="확대 이미지"
              className="max-w-full max-h-full object-contain" />

            {liveZoomedPost.media_urls.length > 1 && zoomedIndex > 0 && (
              <button onClick={() => setZoomedIndex(i => i - 1)}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center">
                <i className="ti ti-chevron-left" style={{ fontSize: 22, color: "#fff" }} aria-hidden="true" />
              </button>
            )}
            {liveZoomedPost.media_urls.length > 1 && zoomedIndex < liveZoomedPost.media_urls.length - 1 && (
              <button onClick={() => setZoomedIndex(i => i + 1)}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center">
                <i className="ti ti-chevron-right" style={{ fontSize: 22, color: "#fff" }} aria-hidden="true" />
              </button>
            )}
            {liveZoomedPost.media_urls.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
                {zoomedIndex + 1}/{liveZoomedPost.media_urls.length}
              </div>
            )}
          </div>

          {/* 하단 캡션 + 좋아요/댓글 */}
          <div className="flex-shrink-0 px-4 py-3 flex flex-col gap-2" onClick={e => e.stopPropagation()}>
            {liveZoomedPost.content && (
              <p className="text-white text-xs leading-relaxed whitespace-pre-wrap">{liveZoomedPost.content}</p>
            )}
            <div className="flex items-center gap-4">
              <button onClick={() => handleLike(liveZoomedPost.id)} className="flex items-center gap-1.5">
                <i className={`ti ${liveZoomedPost.likedByMe ? "ti-heart-filled text-pink-500" : "ti-heart"} text-lg`}
                  style={!liveZoomedPost.likedByMe ? { color: "#fff" } : undefined} aria-hidden="true" />
                <span className="text-white text-xs font-bold">{liveZoomedPost.like_count}</span>
              </button>
              <div className="flex items-center gap-1.5">
                <i className="ti ti-message-2 text-lg" style={{ color: "#fff" }} aria-hidden="true" />
                <span className="text-white text-xs font-bold">{liveZoomedPost.comment_count}</span>
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </main>
  );
}

export default function FeedPage() {
  return (
    <Suspense fallback={
      <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
      </main>
    }>
      <FeedContent />
    </Suspense>
  );
}
