"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import { BADGE_DEFS, getGrade, getBadgesByRole } from "@/lib/trustScore";

export default function ProfilePage() {
  const router = useRouter();
  const params = useParams();
  const profileId = params.userId as string;

  const [user, setUser] = useState<any>(null);
  const [stores, setStores] = useState<any[]>([]);
  const [workerProfile, setWorkerProfile] = useState<any>(null);
  const [badges, setBadges] = useState<any[]>([]);
  const [personalPosts, setPersonalPosts] = useState<any[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedPost, setSelectedPost] = useState<any | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [activeMediaIdx, setActiveMediaIdx] = useState(0);
  const [zoomedMedia, setZoomedMedia] = useState<{ urls: string[]; index: number } | null>(null);

  useEffect(() => { init(); }, [profileId]);

  const init = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const currentMyId = session?.user?.id || null;
    setMyId(currentMyId);

    const { data: userData } = await supabase
      .from("users")
      .select("id, nickname, avatar_url, trust_score, user_type, created_at")
      .eq("id", profileId)
      .single();
    if (!userData) { setLoading(false); return; }
    setUser(userData);

    const isEmployer = userData.user_type === "employer" || userData.user_type === "both";
    const isWorker = userData.user_type === "worker" || userData.user_type === "both";

    const [storesRes, workerRes, badgesRes, postsRes] = await Promise.all([
      isEmployer
        ? supabase.from("employer_profiles").select("id, business_name, business_type, region, image_url").eq("user_id", profileId).eq("is_deleted", false)
        : Promise.resolve({ data: [] }),
      isWorker
        ? supabase.from("worker_profiles").select("worker_type, desired_region, desired_wage, work_days, bio").eq("user_id", profileId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("user_badges").select("badge_key, earned_at").eq("user_id", profileId),
      supabase.from("feed_posts")
        .select("*, feed_likes(user_id)")
        .eq("user_id", profileId)
        .is("employer_profile_id", null)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    setStores((storesRes as any).data || []);
    setWorkerProfile((workerRes as any).data || null);
    setBadges(getBadgesByRole((badgesRes.data || []), userData.user_type === "employer" ? "employer" : "worker"));
    
    const processedPosts = ((postsRes as any).data || []).map((p: any) => ({
      ...p,
      likedByMe: currentMyId ? (p.feed_likes || []).some((l: any) => l.user_id === currentMyId) : false
    }));
    setPersonalPosts(processedPosts);
    
    setLoading(false);
  };

  const loadComments = async (postId: string) => {
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/feed/comment?feedPostId=${postId}`);
      const data = await res.json();
      if (data.success) {
        setComments(data.data || []);
      }
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
    if (!selectedPost || !myId) return;
    try {
      const res = await fetch("/api/feed/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedPostId: selectedPost.id })
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
    if (!newComment.trim() || !selectedPost || !myId) return;
    setCommenting(true);
    try {
      const res = await fetch("/api/feed/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedPostId: selectedPost.id, content: newComment.trim() })
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

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
    </main>
  );

  if (!user) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>프로필을 찾을 수 없어요</p>
    </main>
  );

  const grade = getGrade(user.trust_score || 0);
  const isEmployer = user.user_type === "employer" || user.user_type === "both";
  const isWorker = user.user_type === "worker" || user.user_type === "both";

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 100, width: "100%", maxWidth: 480, margin: "0 auto" }}>
      <AppHeader title="소셜 프로필" showBack showBellAndMenu={true} />

      <div style={{ padding: "16px" }}>

        {/* 프로필 헤더 */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 24, padding: 20, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "linear-gradient(135deg,#7c3aed,#ec4899)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, border: "2px solid rgba(255,255,255,0.1)" }}>
              {user.avatar_url
                ? <img src={user.avatar_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : (isEmployer ? "🏪" : "👤")}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px", letterSpacing: "-0.3px" }}>{user.nickname || "닉네임 없음"}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>{grade.emoji}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#c4b5fd" }}>{grade.name}</span>
                {isEmployer && isWorker && (
                  <span style={{ fontSize: 10, background: "rgba(139,92,246,0.15)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 20, padding: "2px 8px", fontWeight: 700 }}>사장+알바</span>
                )}
                {isEmployer && !isWorker && (
                  <span style={{ fontSize: 10, background: "rgba(236,72,153,0.12)", color: "#f9a8d4", border: "1px solid rgba(236,72,153,0.25)", borderRadius: 20, padding: "2px 8px", fontWeight: 700 }}>사장님</span>
                )}
                {!isEmployer && isWorker && (
                  <span style={{ fontSize: 10, background: "rgba(34,197,94,0.1)", color: "#86efac", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 20, padding: "2px 8px", fontWeight: 700 }}>알바생</span>
                )}
              </div>
            </div>
          </div>

          {/* 신뢰도 바 */}
          <div style={{ background: "var(--surface2,var(--surface))", borderRadius: 12, padding: "10px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>종합 신뢰도</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#c4b5fd" }}>{user.trust_score || 0}점</span>
            </div>
            <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 4 }}>
              <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#7c3aed,#ec4899)", width: `${Math.min(100, user.trust_score || 0)}%`, transition: "width 0.6s" }} />
            </div>
          </div>
        </div>

        {/* 뱃지 */}
        {badges.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: 16, marginBottom: 14 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px", color: "var(--text)" }}>🏅 뱃지</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {badges.map(b => (
                <button key={b.key}
                  onClick={() => setSelectedBadge(selectedBadge === b.key ? null : b.key)}
                  style={{ background: selectedBadge === b.key ? "rgba(139,92,246,0.2)" : "rgba(139,92,246,0.08)", border: `1px solid ${selectedBadge === b.key ? "rgba(139,92,246,0.5)" : "rgba(139,92,246,0.2)"}`, borderRadius: 20, padding: "4px 10px", fontSize: 11, color: "#c4b5fd", cursor: "pointer", fontWeight: 600 }}>
                  {b.emoji} {b.name}
                </button>
              ))}
            </div>
            {selectedBadge && BADGE_DEFS[selectedBadge] && (
              <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 10, padding: "8px 12px", marginTop: 10 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#c4b5fd", margin: "0 0 2px" }}>{BADGE_DEFS[selectedBadge].emoji} {BADGE_DEFS[selectedBadge].name}</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{BADGE_DEFS[selectedBadge].desc}</p>
              </div>
            )}
          </div>
        )}

        {/* 운영 중인 매장 (사장님) */}
        {isEmployer && stores.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: 16, marginBottom: 14 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>🏪 운영 중인 매장</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {stores.map(s => (
                <button key={s.id} onClick={() => router.push(`/store/${s.id}`)}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px", cursor: "pointer", width: "100%", textAlign: "left" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "linear-gradient(135deg,#ec4899,#be185d)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                    {s.image_url ? <img src={s.image_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🏪"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.business_name}</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{s.business_type || ""} {s.region ? `· ${s.region.split(" ").slice(0, 2).join(" ")}` : ""}</p>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 구직 정보 (알바생) */}
        {isWorker && workerProfile && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: 16, marginBottom: 14 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>💼 구직 정보</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {workerProfile.worker_type && <div style={{ display: "flex", gap: 8, fontSize: 12 }}><span style={{ color: "var(--text-muted)", minWidth: 60 }}>직종</span><span style={{ color: "var(--text)", fontWeight: 600 }}>{workerProfile.worker_type}</span></div>}
              {workerProfile.desired_region && <div style={{ display: "flex", gap: 8, fontSize: 12 }}><span style={{ color: "var(--text-muted)", minWidth: 60 }}>희망 지역</span><span style={{ color: "var(--text)", fontWeight: 600 }}>{workerProfile.desired_region}</span></div>}
              {workerProfile.desired_wage && <div style={{ display: "flex", gap: 8, fontSize: 12 }}><span style={{ color: "var(--text-muted)", minWidth: 60 }}>희망 시급</span><span style={{ color: "var(--text)", fontWeight: 600 }}>{Number(workerProfile.desired_wage).toLocaleString()}원↑</span></div>}
              {workerProfile.work_days && <div style={{ display: "flex", gap: 8, fontSize: 12 }}><span style={{ color: "var(--text-muted)", minWidth: 60 }}>가능 요일</span><span style={{ color: "var(--text)", fontWeight: 600 }}>{workerProfile.work_days}</span></div>}
              {workerProfile.bio && <p style={{ fontSize: 12, color: "var(--text-sub)", margin: "6px 0 0", lineHeight: 1.6, borderTop: "1px solid var(--border)", paddingTop: 8 }}>{workerProfile.bio}</p>}
            </div>
          </div>
        )}

        {/* 개인 피드 글 (3열 격자형 - 인스타 스타일) */}
        {(personalPosts.length > 0 || myId === profileId) && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "16px 0", overflow: "hidden" }}>
            <div className="flex justify-between items-center px-4 mb-3">
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>📝 최근 소식</h3>
              {myId === profileId && (
                <button 
                  onClick={() => router.push("/feed?write=true")}
                  className="text-[10px] font-bold text-primary bg-primary/10 hover:bg-primary/20 px-2 py-1 rounded-md transition active:scale-95 flex items-center gap-1 focus:outline-none"
                >
                  <i className="ti ti-plus" aria-hidden="true" />
                  소식 등록
                </button>
              )}
            </div>
            {personalPosts.length === 0 ? (
              <div className="mx-4 text-center py-14 px-4 bg-surface2/30 rounded-2xl border border-border">
                <p className="text-xs text-text-muted">아직 올린 소식이 없어요</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5px", background: "var(--border)" }}>
                {personalPosts.map(post => {
                  const hasImg = post.media_urls && post.media_urls.length > 0;
                  return (
                    <div
                      key={post.id}
                      onClick={() => handlePostClick(post)}
                      className="transition-all hover:opacity-85 active:scale-95 duration-100"
                      style={{
                        position: "relative",
                        aspectRatio: "1/1",
                        overflow: "hidden",
                        cursor: "pointer",
                        background: hasImg ? "#000" : "linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(236,72,153,0.15) 100%)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: hasImg ? 0 : 8,
                      }}
                    >
                      {hasImg ? (
                        <img
                          src={post.media_urls[0]}
                          alt="thumbnail"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <p style={{
                          fontSize: 10,
                          color: "var(--text-sub)",
                          margin: 0,
                          lineHeight: 1.3,
                          textAlign: "center",
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 4,
                          WebkitBoxOrient: "vertical",
                          wordBreak: "break-all"
                        }}>
                          {post.content}
                        </p>
                      )}
                      {post.media_urls && post.media_urls.length > 1 && (
                        <span style={{ position: "absolute", top: 4, right: 4, fontSize: 8, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "2px 4px", borderRadius: 4, transform: "scale(0.85)" }}>
                          📸
                        </span>
                      )}
                      {post.media_type === "video" && (
                        <span style={{ position: "absolute", top: 4, right: 4, fontSize: 8, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "2px 4px", borderRadius: 4, transform: "scale(0.85)" }}>
                          🎥
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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
              {/* 이전 버튼 */}
              {hasPrev && (
                <button 
                  onClick={(e) => { e.stopPropagation(); navigatePost(-1); }}
                  className="absolute -left-3 md:-left-12 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white w-8 h-8 rounded-full flex items-center justify-center transition active:scale-90 z-50 focus:outline-none border border-white/10"
                >
                  <i className="ti ti-chevron-left text-base" aria-hidden="true" />
                </button>
              )}
              {/* 다음 버튼 */}
              {hasNext && (
                <button 
                  onClick={(e) => { e.stopPropagation(); navigatePost(1); }}
                  className="absolute -right-3 md:-right-12 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white w-8 h-8 rounded-full flex items-center justify-center transition active:scale-90 z-50 focus:outline-none border border-white/10"
                >
                  <i className="ti ti-chevron-right text-base" aria-hidden="true" />
                </button>
              )}

              <div className="bg-surface rounded-xl border border-border shadow-2xl w-full overflow-hidden flex flex-col h-[94vh] max-h-[94vh]">
                <div className="flex justify-between items-center px-4 py-3.5 border-b border-border bg-surface2/40">
                  <span className="font-bold text-xs text-text-sub">{user?.nickname || "소식 상세"}</span>
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
                          {/* 이미지 슬라이더 좌우 화살표 */}
                          {selectedPost.media_urls.length > 1 && (
                            <>
                              {activeMediaIdx > 0 && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setActiveMediaIdx(prev => prev - 1); }}
                                  className="absolute left-2.5 bg-black/50 hover:bg-black/70 text-white w-6 h-6 rounded-full flex items-center justify-center transition active:scale-90 z-20 focus:outline-none border border-white/10"
                                >
                                  <i className="ti ti-chevron-left text-xs" aria-hidden="true" />
                                </button>
                              )}
                              {activeMediaIdx < selectedPost.media_urls.length - 1 && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setActiveMediaIdx(prev => prev + 1); }}
                                  className="absolute right-2.5 bg-black/50 hover:bg-black/70 text-white w-6 h-6 rounded-full flex items-center justify-center transition active:scale-90 z-20 focus:outline-none border border-white/10"
                                >
                                  <i className="ti ti-chevron-right text-xs" aria-hidden="true" />
                                </button>
                              )}
                              {/* 인디케이터 배지 */}
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
                    {/* 작성자 프로필 바 */}
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 rounded-full overflow-hidden bg-surface border border-border flex items-center justify-center">
                        {user?.avatar_url ? (
                          <img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm">👤</span>
                        )}
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-text leading-none">{user?.nickname}</p>
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

                  {/* 댓글 리스트 */}
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

                {/* 댓글 입력 영역 고정 */}
                {myId && (
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
        <div
          onClick={() => setZoomedMedia(null)}
          className="fixed inset-0 bg-black z-[100] flex items-center justify-center cursor-zoom-out select-none"
        >
          <div className="relative max-w-full max-h-full flex items-center justify-center">
            <img 
              src={zoomedMedia.urls[zoomedMedia.index]} 
              alt="zoom-view" 
              className="max-w-full max-h-full object-contain" 
            />

            {/* 줌 상태 내의 이미지 캐러셀 좌우 화살표 */}
            {zoomedMedia.urls.length > 1 && (
              <>
                {zoomedMedia.index > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setZoomedMedia(prev => prev ? { ...prev, index: prev.index - 1 } : null);
                    }}
                    className="absolute left-4 bg-black/50 hover:bg-black/70 text-white w-10 h-10 rounded-full flex items-center justify-center transition active:scale-90 z-[110] focus:outline-none border border-white/10 cursor-pointer"
                  >
                    <i className="ti ti-chevron-left text-xl" aria-hidden="true" />
                  </button>
                )}
                {zoomedMedia.index < zoomedMedia.urls.length - 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setZoomedMedia(prev => prev ? { ...prev, index: prev.index + 1 } : null);
                    }}
                    className="absolute right-4 bg-black/50 hover:bg-black/70 text-white w-10 h-10 rounded-full flex items-center justify-center transition active:scale-90 z-[110] focus:outline-none border border-white/10 cursor-pointer"
                  >
                    <i className="ti ti-chevron-right text-xl" aria-hidden="true" />
                  </button>
                )}
                {/* 줌 인디케이터 배지 */}
                <span className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] px-3 py-1 rounded-full z-[110]">
                  {zoomedMedia.index + 1} / {zoomedMedia.urls.length}
                </span>
              </>
            )}

            <span className="absolute top-4 right-4 bg-black/60 text-white text-[10px] px-2.5 py-1 rounded-full z-[110]">
              닫기
            </span>
          </div>
        </div>
      )}
    </main>
  );
}
