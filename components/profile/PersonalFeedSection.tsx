"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import PostComposeModal from "@/components/feed/PostComposeModal";

interface Props {
  profileUserId: string;
  viewerId: string | null;
  nickname: string;
  avatarUrl: string | null;
}

// 개인 피드 글 그리드(3열) + 상세 모달 + 줌 오버레이 — 통합 프로필 페이지의 나머지 로딩과 무관하게 자체적으로 fetch한다
export default function PersonalFeedSection({ profileUserId, viewerId, nickname, avatarUrl }: Props) {
  const isOwner = viewerId === profileUserId;

  const [personalPosts, setPersonalPosts] = useState<any[]>([]);
  const [selectedPost, setSelectedPost] = useState<any | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [activeMediaIdx, setActiveMediaIdx] = useState(0);
  const [zoomedMedia, setZoomedMedia] = useState<{ urls: string[]; index: number } | null>(null);
  const [showCompose, setShowCompose] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("feed_posts")
        .select("*, feed_likes(user_id)")
        .eq("user_id", profileUserId)
        .is("employer_profile_id", null)
        .order("created_at", { ascending: false })
        .limit(12);
      const processed = (data || []).map((p: any) => ({
        ...p,
        likedByMe: viewerId ? (p.feed_likes || []).some((l: any) => l.user_id === viewerId) : false,
      }));
      setPersonalPosts(processed);
    })();
  }, [profileUserId, viewerId]);

  const loadComments = async (postId: string) => {
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/feed/comment?feedPostId=${postId}`);
      const data = await res.json();
      if (data.success) setComments(data.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handlePostClick = (post: any) => {
    setSelectedPost(post);
    loadComments(post.id);
  };

  const handleLikePost = async () => {
    if (!selectedPost || !viewerId) return;
    try {
      const res = await fetch("/api/feed/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedPostId: selectedPost.id }),
      });
      const data = await res.json();
      if (data.success) {
        setPersonalPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, like_count: data.likeCount, likedByMe: !p.likedByMe } : p));
        setSelectedPost((p: any) => p ? { ...p, like_count: data.likeCount, likedByMe: !p.likedByMe } : null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !selectedPost || !viewerId) return;
    setCommenting(true);
    try {
      const res = await fetch("/api/feed/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedPostId: selectedPost.id, content: newComment.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setComments(prev => [...prev, data.data]);
        setNewComment("");
        setPersonalPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, comment_count: data.commentCount } : p));
        setSelectedPost((p: any) => p ? { ...p, comment_count: data.commentCount } : null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCommenting(false);
    }
  };

  if (personalPosts.length === 0 && !isOwner) return null;

  return (
    <>
      <div style={{ padding: "20px 0", borderBottom: "1px solid var(--card-inner-border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700, margin: 0, letterSpacing: "0.5px" }}>📝 최근 소식</p>
          {isOwner && (
            <button onClick={() => setShowCompose(true)} style={{ fontSize: 11, fontWeight: 700, color: "var(--purple-text)", background: "var(--primary-light)", border: "1px solid var(--primary-border)", borderRadius: 8, padding: "4px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <i className="ti ti-plus" aria-hidden="true" /> 소식 등록
            </button>
          )}
        </div>
        {personalPosts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "36px 16px", background: "var(--card-inner)", border: "1px solid var(--card-inner-border)", borderRadius: 16 }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>아직 올린 소식이 없어요</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5px", background: "var(--border)", borderRadius: 14, overflow: "hidden" }}>
            {personalPosts.map(post => {
              const hasImg = post.media_urls && post.media_urls.length > 0;
              return (
                <div key={post.id} onClick={() => handlePostClick(post)}
                  style={{
                    position: "relative", aspectRatio: "1/1", overflow: "hidden", cursor: "pointer",
                    background: hasImg ? "#000" : "linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(236,72,153,0.15) 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center", padding: hasImg ? 0 : 8,
                  }}>
                  {hasImg ? (
                    <img src={post.media_urls[0]} alt="thumbnail" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0, lineHeight: 1.3, textAlign: "center", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", wordBreak: "break-all" }}>
                      {post.content}
                    </p>
                  )}
                  {post.media_urls && post.media_urls.length > 1 && (
                    <span style={{ position: "absolute", top: 4, right: 4, fontSize: 8, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "2px 4px", borderRadius: 4, transform: "scale(0.85)" }}>📸</span>
                  )}
                  {post.media_type === "video" && (
                    <span style={{ position: "absolute", top: 4, right: 4, fontSize: 8, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "2px 4px", borderRadius: 4, transform: "scale(0.85)" }}>🎥</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedPost && (() => {
        const currentIdx = personalPosts.findIndex((p: any) => p.id === selectedPost.id);
        const hasPrev = currentIdx > 0;
        const hasNext = currentIdx < personalPosts.length - 1;
        const navigatePost = (dir: -1 | 1) => {
          const targetIdx = currentIdx + dir;
          if (targetIdx >= 0 && targetIdx < personalPosts.length) {
            const targetPost = personalPosts[targetIdx];
            setSelectedPost(targetPost);
            setActiveMediaIdx(0);
            setComments([]);
            loadComments(targetPost.id);
          }
        };

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3">
            <div className="relative w-full max-w-md">
              {hasPrev && (
                <button onClick={(e) => { e.stopPropagation(); navigatePost(-1); }}
                  className="absolute -left-3 md:-left-12 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white w-8 h-8 rounded-full flex items-center justify-center transition active:scale-90 z-50 focus:outline-none border border-white/10">
                  <i className="ti ti-chevron-left text-base" aria-hidden="true" />
                </button>
              )}
              {hasNext && (
                <button onClick={(e) => { e.stopPropagation(); navigatePost(1); }}
                  className="absolute -right-3 md:-right-12 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white w-8 h-8 rounded-full flex items-center justify-center transition active:scale-90 z-50 focus:outline-none border border-white/10">
                  <i className="ti ti-chevron-right text-base" aria-hidden="true" />
                </button>
              )}

              <div className="bg-surface rounded-xl border border-border shadow-2xl w-full overflow-hidden flex flex-col h-[94vh] max-h-[94vh]">
                <div className="flex justify-between items-center px-4 py-3.5 border-b border-border bg-surface2/40">
                  <span className="font-bold text-xs text-text-sub">{nickname || "소식 상세"}</span>
                  <button onClick={() => setSelectedPost(null)} className="text-text-muted hover:text-text focus:outline-none">
                    <i className="ti ti-x text-lg" aria-hidden="true" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {selectedPost.media_urls && selectedPost.media_urls.length > 0 && (
                    <div className="relative w-full aspect-[4/3] bg-black overflow-hidden flex items-center justify-center">
                      {selectedPost.media_type === "video" ? (
                        <video src={selectedPost.media_urls[0]} controls playsInline className="w-full h-full object-contain" />
                      ) : (
                        <div className="relative w-full h-full flex items-center justify-center select-none">
                          <img
                            src={selectedPost.media_urls[activeMediaIdx]}
                            alt={`media-${activeMediaIdx}`}
                            className="w-full h-full object-contain cursor-zoom-in"
                            onClick={() => setZoomedMedia({ urls: selectedPost.media_urls, index: activeMediaIdx })}
                          />
                          {selectedPost.media_urls.length > 1 && (
                            <>
                              {activeMediaIdx > 0 && (
                                <button onClick={(e) => { e.stopPropagation(); setActiveMediaIdx(prev => prev - 1); }}
                                  className="absolute left-2.5 bg-black/50 hover:bg-black/70 text-white w-6 h-6 rounded-full flex items-center justify-center transition active:scale-90 z-20 focus:outline-none border border-white/10">
                                  <i className="ti ti-chevron-left text-xs" aria-hidden="true" />
                                </button>
                              )}
                              {activeMediaIdx < selectedPost.media_urls.length - 1 && (
                                <button onClick={(e) => { e.stopPropagation(); setActiveMediaIdx(prev => prev + 1); }}
                                  className="absolute right-2.5 bg-black/50 hover:bg-black/70 text-white w-6 h-6 rounded-full flex items-center justify-center transition active:scale-90 z-20 focus:outline-none border border-white/10">
                                  <i className="ti ti-chevron-right text-xs" aria-hidden="true" />
                                </button>
                              )}
                              <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[9px] font-bold px-2 py-0.5 rounded-full z-20">
                                {activeMediaIdx + 1} / {selectedPost.media_urls.length}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="p-4 flex flex-col gap-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 rounded-full overflow-hidden bg-surface border border-border flex items-center justify-center">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm">👤</span>
                        )}
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-text leading-none">{nickname}</p>
                        <p className="text-[9px] text-text-muted mt-0.5">
                          {new Date(selectedPost.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" })}
                        </p>
                      </div>
                    </div>

                    {selectedPost.content ? (
                      <p className="text-xs text-text-sub leading-relaxed whitespace-pre-wrap">{selectedPost.content}</p>
                    ) : (
                      <span className="text-xs text-text-muted italic">본문 텍스트가 없습니다.</span>
                    )}

                    <div className="flex items-center gap-3 mt-1.5 border-t border-b border-border py-2">
                      <button onClick={handleLikePost} className="flex items-center gap-1.5 text-text-sub focus:outline-none">
                        <i className={`ti ${selectedPost.likedByMe ? "ti-heart-filled text-pink-500" : "ti-heart text-text"} text-lg`} aria-hidden="true" />
                        <span className="text-xs font-bold">{selectedPost.like_count || 0}</span>
                      </button>
                      <div className="flex items-center gap-1.5 text-text-sub">
                        <i className="ti ti-message-2 text-lg text-text" aria-hidden="true" />
                        <span className="text-xs font-bold">{selectedPost.comment_count || 0}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-surface2/30 p-4 border-t border-border flex flex-col gap-3">
                    <span className="font-bold text-[11px] text-text-muted">댓글 ({comments.length})</span>
                    {commentsLoading ? (
                      <span className="text-[10px] text-text-muted text-center py-1">댓글 로딩 중...</span>
                    ) : comments.length === 0 ? (
                      <span className="text-[10px] text-text-muted text-center py-1">댓글이 없습니다.</span>
                    ) : (
                      <div className="flex flex-col gap-2.5 max-h-44 overflow-y-auto">
                        {comments.map((comment: any) => (
                          <div key={comment.id} className="flex gap-2 items-start text-xs">
                            <div className="w-6 h-6 rounded-full overflow-hidden bg-surface flex-shrink-0 border border-border flex items-center justify-center">
                              {comment.authorAvatar ? (
                                <img src={comment.authorAvatar} alt="avatar" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-xs">👤</span>
                              )}
                            </div>
                            <div className="flex-1 bg-surface rounded-xl px-2.5 py-1.5 shadow-sm border border-border">
                              <div className="flex justify-between items-center mb-0.5">
                                <span className="font-bold text-[10px] text-text">{comment.authorName}</span>
                              </div>
                              <p className="text-[11px] text-text-sub leading-normal">{comment.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {viewerId && (
                  <div className="p-3 border-t border-border bg-surface2 flex gap-1.5">
                    <input type="text" placeholder="댓글을 입력하세요..."
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleAddComment(); }}
                      disabled={commenting}
                      className="flex-1 bg-surface border border-border text-xs px-3 py-2 rounded-xl focus:outline-none" />
                    <button onClick={handleAddComment} disabled={commenting || !newComment.trim()}
                      className="bg-primary text-white text-xs font-bold px-3.5 py-2 rounded-xl active:scale-95 transition disabled:opacity-50">
                      등록
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {zoomedMedia && (
        <div onClick={() => setZoomedMedia(null)} className="fixed inset-0 bg-black z-[100] flex items-center justify-center cursor-zoom-out select-none">
          <div className="relative max-w-full max-h-full flex items-center justify-center">
            <img src={zoomedMedia.urls[zoomedMedia.index]} alt="zoom-view" className="max-w-full max-h-full object-contain" />
            {zoomedMedia.urls.length > 1 && (
              <>
                {zoomedMedia.index > 0 && (
                  <button onClick={(e) => { e.stopPropagation(); setZoomedMedia(prev => prev ? { ...prev, index: prev.index - 1 } : null); }}
                    className="absolute left-4 bg-black/50 hover:bg-black/70 text-white w-10 h-10 rounded-full flex items-center justify-center transition active:scale-90 z-[110] focus:outline-none border border-white/10 cursor-pointer">
                    <i className="ti ti-chevron-left text-xl" aria-hidden="true" />
                  </button>
                )}
                {zoomedMedia.index < zoomedMedia.urls.length - 1 && (
                  <button onClick={(e) => { e.stopPropagation(); setZoomedMedia(prev => prev ? { ...prev, index: prev.index + 1 } : null); }}
                    className="absolute right-4 bg-black/50 hover:bg-black/70 text-white w-10 h-10 rounded-full flex items-center justify-center transition active:scale-90 z-[110] focus:outline-none border border-white/10 cursor-pointer">
                    <i className="ti ti-chevron-right text-xl" aria-hidden="true" />
                  </button>
                )}
                <span className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] px-3 py-1 rounded-full z-[110]">
                  {zoomedMedia.index + 1} / {zoomedMedia.urls.length}
                </span>
              </>
            )}
            <span className="absolute top-4 right-4 bg-black/60 text-white text-[10px] px-2.5 py-1 rounded-full z-[110]">닫기</span>
          </div>
        </div>
      )}

      {showCompose && viewerId && (
        <PostComposeModal
          userId={viewerId}
          title="새 소식 등록"
          placeholder="오늘의 이야기를 들려주세요... ✨"
          onClose={() => setShowCompose(false)}
          onPosted={(post) => setPersonalPosts(prev => [{ ...post, likedByMe: false }, ...prev])}
        />
      )}
    </>
  );
}
