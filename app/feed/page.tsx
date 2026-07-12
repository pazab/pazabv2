"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";

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

export default function FeedPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<"all" | "nearby" | "employer" | "worker">("all");
  const [userRegion, setUserRegion] = useState<string | null>(null);

  // 작성 모달 상태
  const [writeModalOpen, setWriteModalOpen] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newMediaFiles, setNewMediaFiles] = useState<File[]>([]);
  const [newMediaType, setNewMediaType] = useState<"image" | "video">("image");
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // 댓글 창 관리 (postId -> boolean)
  const [openCommentsMap, setOpenCommentsMap] = useState<Record<string, boolean>>({});
  const [commentsMap, setCommentsMap] = useState<Record<string, Comment[]>>({});
  const [loadingCommentsMap, setLoadingCommentsMap] = useState<Record<string, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

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

    // 확장자 체크로 비디오 여부 결정
    const isVideo = files[0].type.startsWith("video/");
    setNewMediaType(isVideo ? "video" : "image");
    
    // 최대 10장 이미지, 1개 비디오
    const targetFiles = isVideo ? [files[0]] : files.slice(0, 10);
    setNewMediaFiles(targetFiles);

    const previews = targetFiles.map(file => URL.createObjectURL(file));
    setMediaPreviews(previews);
  };

  const handleCreatePost = async () => {
    if (!newContent.trim() && newMediaFiles.length === 0) return;
    setUploading(true);

    try {
      const mediaUrls: string[] = [];

      // 1. Supabase Storage 파일 업로드
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
          mediaUrls.push(data.publicUrl);
        }
      }

      // 2. DB Insert
      const res = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newContent,
          media_urls: mediaUrls,
          media_type: newMediaType
        })
      });

      const data = await res.json();
      if (data.success) {
        setPosts(prev => [data.data, ...prev]);
        closeWriteModal();
      } else {
        alert("게시물 업로드 실패: " + data.error);
      }
    } catch (err: any) {
      console.error(err);
      alert("업로드 중 오류 발생: " + err.message);
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
          { id: "nearby", label: "내 주변 📍" },
          { id: "employer", label: "🏪 매장 소식" },
          { id: "worker", label: "👤 구직 피드" }
        ].map(tab => (
          <button key={tab.id} onClick={() => setFilterTab(tab.id as any)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition flex-shrink-0
              ${filterTab === tab.id ? "bg-primary text-white" : "bg-surface2 text-text-sub"}`}>
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
          <div className="text-4xl mb-3">📸</div>
          <h4 className="text-base font-bold mb-1">피드가 비어있어요</h4>
          <p className="text-xs text-text-muted mb-4">
            선택한 필터에 해당하는 피드가 존재하지 않습니다.
          </p>
          <button onClick={() => setWriteModalOpen(true)}
            className="bg-primary text-white font-bold text-xs px-5 py-2.5 rounded-xl hover:scale-105 active:scale-95 transition">
            ✨ 첫 피드 남기기
          </button>
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
                  <div className="flex items-center gap-3 p-3 border-b border-border">
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

                  {/* 미디어 영역 */}
                  {post.media_urls && post.media_urls.length > 0 && (
                    <div className="relative w-full aspect-[4/3] bg-black overflow-hidden flex items-center justify-center">
                      {post.media_type === "video" ? (
                        <video src={post.media_urls[0]} controls playsInline className="w-full h-full object-contain" />
                      ) : (
                        <div className="flex w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-none">
                          {post.media_urls.map((url, idx) => (
                            <div key={idx} className="w-full h-full flex-shrink-0 snap-start flex items-center justify-center">
                              <img src={url} alt={`media-${idx}`} className="w-full h-full object-contain" />
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* 이미지 개수 표시 인디케이터 */}
                      {post.media_type === "image" && post.media_urls.length > 1 && (
                        <div className="absolute top-3 right-3 bg-black/60 text-[10px] text-white px-2 py-0.5 rounded-full font-bold">
                          1/{post.media_urls.length}
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
                          className="bg-primary text-white text-xs font-bold px-3.5 py-2 rounded-xl active:scale-95 transition">
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
        className="fixed bottom-[92px] right-4 w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-accent text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition z-40">
        <i className="ti ti-plus text-2xl" aria-hidden="true" />
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
                  {mediaPreviews.map((url, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border flex-shrink-0 bg-black">
                      {newMediaType === "video" ? (
                        <video src={url} className="w-full h-full object-cover" />
                      ) : (
                        <img src={url} alt={`preview-${idx}`} className="w-full h-full object-cover" />
                      )}
                      <button onClick={() => {
                        setNewMediaFiles(prev => prev.filter((_, i) => i !== idx));
                        setMediaPreviews(prev => prev.filter((_, i) => i !== idx));
                      }} className="absolute top-0.5 right-0.5 bg-black/70 text-white w-4 h-4 rounded-full flex items-center justify-center hover:bg-black">
                        <i className="ti ti-x text-[8px]" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 푸터 */}
            <div className="px-4 py-3 border-t border-border flex gap-2 justify-end bg-surface2">
              <button onClick={closeWriteModal} disabled={uploading}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-surface border border-border text-text-sub hover:bg-surface2 transition active:scale-95">
                취소
              </button>
              <button onClick={handleCreatePost} disabled={uploading || (!newContent.trim() && newMediaFiles.length === 0)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-primary text-white transition active:scale-95 disabled:opacity-50">
                {uploading ? "업로드 중..." : "공유하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
