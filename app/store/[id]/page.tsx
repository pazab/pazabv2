"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import { EntityLink } from "@/components/EntityLink";
import StoreRegisterModal from "@/components/StoreRegisterModal";
import { useToast } from "@/lib/useToast";
import { BADGE_DEFS, getBadgesByRole } from "@/lib/trustScore";
import PostComposeModal from "@/components/feed/PostComposeModal";
import { BusinessHours, ClosedDate, formatBusinessHours, getUpcomingClosedDate, formatClosedDate, daysUntil } from "@/lib/businessHours";

interface StoreInfo {
  id: string;
  user_id: string;
  business_name: string;
  business_type: string | null;
  description: string | null;
  logo_url: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  region: string | null;
  address: string | null;
  address_detail: string | null;
  lat: number | null;
  lng: number | null;
  biz_tel: string | null;
  video_url: string | null;
  business_hours: BusinessHours | null;
  closed_dates: ClosedDate[] | null;
  perks: string[] | null;
  created_at: string | null;
  owner?: { nickname: string | null; avatar_url: string | null; trust_score: number | null } | null;
}

interface Job {
  id: string;
  wage: number | null;
  wage_negotiable: boolean;
  work_days: string | null;
  work_hours: string | null;
  tags: string[] | null;
}

interface Post {
  id: string;
  content: string;
  media_urls: string[];
  media_type: "image" | "video";
  like_count: number;
  comment_count: number;
  created_at: string;
  likedByMe: boolean;
}

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  authorName: string;
  authorAvatar: string | null;
}

export default function StoreHomePage() {
  const router = useRouter();
  const params = useParams();
  const storeId = params.id as string;

  const [myId, setMyId] = useState<string | null>(null);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [pendingOffer, setPendingOffer] = useState<{ id: string; employer_id: string } | null>(null);
  const [offerSending, setOfferSending] = useState(false);
  const [badges, setBadges] = useState<{ key: string; name: string; emoji: string }[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<string | null>(null);
  const [teamCount, setTeamCount] = useState<number | null>(null);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [showCompose, setShowCompose] = useState(false);
  const { showToast, ToastUI } = useToast();

  // 상세 라이트박스
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [activeMediaIdx, setActiveMediaIdx] = useState(0);
  const [zoomedMedia, setZoomedMedia] = useState<{ urls: string[]; index: number } | null>(null);

  useEffect(() => { init(); }, [storeId]);

  const init = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id || null;
    setMyId(uid);

    const { data: storeRaw } = await supabase
      .from("employer_profiles")
      .select("id, user_id, business_name, business_type, description, logo_url, image_url, image_urls, region, address, address_detail, lat, lng, biz_tel, video_url, business_hours, closed_dates, perks, created_at")
      .eq("id", storeId)
      .maybeSingle();
    if (storeRaw) {
      const { data: ownerData } = await supabase
        .from("users")
        .select("nickname, avatar_url, trust_score")
        .eq("id", storeRaw.user_id)
        .maybeSingle();
      setStore({ ...storeRaw, owner: ownerData ?? null });

      const { data: badgeRows } = await supabase.from("user_badges").select("badge_key").eq("user_id", storeRaw.user_id);
      setBadges(getBadgesByRole(badgeRows || [], "employer"));

      try {
        const tcRes = await fetch(`/api/store/team-count?storeId=${storeId}`);
        const tcData = await tcRes.json();
        if (tcData.success) setTeamCount(tcData.count);
      } catch {}
    } else {
      setStore(null);
    }

    const { data: jobsData } = await supabase
      .from("jobs")
      .select("id, wage, wage_negotiable, work_days, work_hours, tags")
      .eq("employer_profile_id", storeId)
      .eq("is_active", true)
      .eq("job_status", "active")
      .order("created_at", { ascending: false });
    setJobs(jobsData || []);

    const { data: postsData } = await supabase
      .from("feed_posts")
      .select("id, content, media_urls, media_type, like_count, comment_count, created_at")
      .eq("employer_profile_id", storeId)
      .order("created_at", { ascending: false });

    let likedIds = new Set<string>();
    if (uid && postsData && postsData.length > 0) {
      const { data: likes } = await supabase
        .from("feed_likes")
        .select("feed_post_id")
        .eq("user_id", uid)
        .in("feed_post_id", postsData.map(p => p.id));
      likedIds = new Set((likes || []).map(l => l.feed_post_id));
    }
    setPosts((postsData || []).map(p => ({ ...p, likedByMe: likedIds.has(p.id) })));

    const { count } = await supabase
      .from("store_follows")
      .select("*", { count: "exact", head: true })
      .eq("employer_profile_id", storeId);
    setFollowerCount(count || 0);

    if (uid) {
      const { data: myFollow } = await supabase
        .from("store_follows")
        .select("id")
        .eq("employer_profile_id", storeId)
        .eq("user_id", uid)
        .maybeSingle();
      setFollowing(!!myFollow);

      // 이 매장에서 나(알바생)에게 보낸 pending 채용 제안 확인
      const { data: offerMatch } = await supabase
        .from("matches")
        .select("id, employer_id")
        .eq("employer_profile_id", storeId)
        .eq("worker_id", uid)
        .eq("employer_interest", true)
        .eq("progress_status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setPendingOffer(offerMatch ?? null);
    }

    setLoading(false);
  };

  const handleRespondOffer = async (action: "accept" | "reject") => {
    if (!pendingOffer || !myId) return;
    setOfferSending(true);
    try {
      const res = await fetch("/api/lovecall", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: pendingOffer.id, action }),
      });
      const data = await res.json();
      if (data.success) {
        if (action === "accept") {
          await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              matchId: pendingOffer.id,
              senderId: myId,
              receiverId: pendingOffer.employer_id,
              message: "🎉 매칭이 성사됐어요! 서로 인사를 나눠보세요 😊",
              messageType: "system",
            }),
          });
          router.push(`/chat/${pendingOffer.id}`);
        } else {
          showToast("제안을 거절했습니다.");
          setPendingOffer(null);
        }
      } else {
        showToast(data.error || "오류가 발생했어요", "error");
      }
    } catch {
      showToast("오류가 발생했어요", "error");
    }
    setOfferSending(false);
  };

  const toggleFollow = async () => {
    if (!myId) {
      localStorage.setItem("login_redirect", `/store/${storeId}`);
      router.push("/login");
      return;
    }
    setFollowBusy(true);
    const nextFollowing = !following;
    setFollowing(nextFollowing);
    setFollowerCount(prev => prev + (nextFollowing ? 1 : -1));
    try {
      const res = await fetch("/api/store/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employerProfileId: storeId })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    } catch (e) {
      console.error(e);
      // 롤백
      setFollowing(!nextFollowing);
      setFollowerCount(prev => prev + (nextFollowing ? -1 : 1));
    } finally {
      setFollowBusy(false);
    }
  };

  const loadComments = async (postId: string) => {
    try {
      setCommentsLoading(true);
      const res = await fetch(`/api/feed/comment?feedPostId=${postId}`);
      const data = await res.json();
      if (data.success) setComments(data.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handlePostClick = (post: Post) => {
    setSelectedPost(post);
    setActiveMediaIdx(0);
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
        setPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, like_count: data.likeCount, likedByMe: !p.likedByMe } : p));
        setSelectedPost(p => p ? { ...p, like_count: data.likeCount, likedByMe: !p.likedByMe } : null);
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
        setPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, comment_count: data.commentCount } : p));
        setSelectedPost(p => p ? { ...p, comment_count: data.commentCount } : null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCommenting(false);
    }
  };

  const isOwner = !!myId && !!store && myId === store.user_id;

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
    </main>
  );

  if (!store) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>매장을 찾을 수 없어요</p>
    </main>
  );

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 100 }}>
      <AppHeader title="매장 홈" showBack onBack={() => router.back()} showBellAndMenu={true} />

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* 매장 헤더 */}
        <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="w-full aspect-[16/9] bg-surface2 flex items-center justify-center overflow-hidden relative">
            {(() => {
              const gallery = store.image_urls && store.image_urls.length > 0 ? store.image_urls : (store.image_url ? [store.image_url] : []);
              if (gallery.length === 0) return <span className="text-5xl">🏪</span>;
              const idx = Math.min(galleryIdx, gallery.length - 1);
              return (
                <>
                  <img src={gallery[idx]} alt={store.business_name} className="w-full h-full object-cover" />
                  {gallery.length > 1 && (
                    <>
                      {idx > 0 && (
                        <button onClick={() => setGalleryIdx(idx - 1)}
                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white w-7 h-7 rounded-full flex items-center justify-center transition active:scale-90 z-10 focus:outline-none border border-white/10">
                          <i className="ti ti-chevron-left text-sm" aria-hidden="true" />
                        </button>
                      )}
                      {idx < gallery.length - 1 && (
                        <button onClick={() => setGalleryIdx(idx + 1)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white w-7 h-7 rounded-full flex items-center justify-center transition active:scale-90 z-10 focus:outline-none border border-white/10">
                          <i className="ti ti-chevron-right text-sm" aria-hidden="true" />
                        </button>
                      )}
                      <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                        {gallery.map((_, i) => (
                          <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: i === idx ? "#fff" : "rgba(255,255,255,0.4)" }} />
                        ))}
                      </div>
                    </>
                  )}
                </>
              );
            })()}
            {isOwner && (
              <button
                onClick={() => setShowEditModal(true)}
                className="absolute top-3 right-3 bg-black/60 hover:bg-black/80 w-8 h-8 rounded-full flex items-center justify-center text-white transition active:scale-95 border border-white/10"
                title="매장 정보 수정"
              >
                <i className="ti ti-settings text-base" aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-base font-black truncate">{store.business_name}</h2>
                {store.business_type && (
                  <span className="text-xs text-text-muted">{store.business_type}</span>
                )}
              </div>
              {!isOwner && (
                <button onClick={toggleFollow} disabled={followBusy}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition active:scale-95 disabled:opacity-50
                    ${following ? "bg-surface2 text-text-sub border border-border" : "bg-primary text-white"}`}>
                  {following ? "✓ 팔로잉" : "+ 팔로우"}
                </button>
              )}
            </div>

            {/* 기본 정보: 위치·영업시간·휴무 안내를 한 블록으로 묶어서 소개글/태그와 시각적으로 구분 */}
            {(() => {
              const hoursLabel = store.business_hours ? formatBusinessHours(store.business_hours) : "";
              const upcoming = getUpcomingClosedDate(store.closed_dates);
              const hasAny = !!(store.region || store.address) || !!store.biz_tel || !!hoursLabel || !!upcoming;
              if (!hasAny) return null;
              const soon = upcoming ? daysUntil(upcoming.date) <= 14 : false;
              return (
                <div className="bg-surface2 rounded-xl px-3 py-2.5 flex flex-col gap-1.5">
                  {(store.region || store.address) && (
                    <span className="text-xs text-text-muted">📍 {store.address || store.region}</span>
                  )}
                  {store.biz_tel && (
                    <a href={`tel:${store.biz_tel}`} className="text-xs text-text-muted" style={{ width: "fit-content" }}>📞 {store.biz_tel}</a>
                  )}
                  {hoursLabel && (
                    <span className="text-xs text-text-muted">🕐 {hoursLabel}</span>
                  )}
                  {upcoming && (
                    soon
                      ? <span className="text-xs font-bold" style={{ color: "#f59e0b" }}>⚠️ {formatClosedDate(upcoming)}</span>
                      : <span className="text-xs text-text-muted">🗓 {formatClosedDate(upcoming)}</span>
                  )}
                </div>
              );
            })()}

            {store.lat != null && store.lng != null && (
              <iframe
                src={`/map.html?lat=${store.lat}&lng=${store.lng}&addr=${encodeURIComponent(store.address || store.region || store.business_name)}`}
                className="w-full rounded-xl border-0"
                style={{ height: 160 }} />
            )}

            {store.description && (
              <p className="text-xs text-text-sub leading-relaxed whitespace-pre-wrap">{store.description}</p>
            )}

            {store.perks && store.perks.length > 0 && (
              <div>
                <span className="text-[11px] font-bold text-text-sub" style={{ display: "block", marginBottom: 6 }}>🎁 복지·근무환경</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {store.perks.map(p => (
                    <span key={p} className="bg-surface2 border border-border rounded-full px-2.5 py-1 text-[11px] text-text-sub font-medium">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {badges.length > 0 && (
              <div>
                <span className="text-[11px] font-bold text-text-sub" style={{ display: "block", marginBottom: 6 }}>🏅 신뢰 배지</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {badges.map(b => (
                    <button key={b.key} onClick={() => setSelectedBadge(selectedBadge === b.key ? null : b.key)}
                      style={{ background: selectedBadge === b.key ? "var(--primary-light)" : "var(--card-inner)", border: `1px solid ${selectedBadge === b.key ? "var(--primary-border)" : "var(--card-inner-border)"}`, borderRadius: 20, padding: "4px 10px", fontSize: 11, color: "var(--purple-text)", cursor: "pointer", fontWeight: 600 }}>
                      {b.emoji} {b.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {selectedBadge && BADGE_DEFS[selectedBadge] && (
              <div style={{ background: "var(--primary-light)", border: "1px solid var(--primary-border)", borderRadius: 10, padding: "8px 12px" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "var(--purple-text)", margin: "0 0 2px" }}>{BADGE_DEFS[selectedBadge].emoji} {BADGE_DEFS[selectedBadge].name}</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{BADGE_DEFS[selectedBadge].desc}</p>
              </div>
            )}

            {/* 하단: 팔로워/활동 지표 + 운영자 */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              {(() => {
                const parts: string[] = [];
                if (followerCount > 0) parts.push(`👥 팔로워 ${followerCount}명`);
                if (teamCount != null && teamCount > 0) parts.push(`👷 함께 일하는 중 ${teamCount}명`);
                if (store.created_at) {
                  const months = Math.floor((Date.now() - new Date(store.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30));
                  if (months >= 1) parts.push(`🗓 활동 ${months}개월차`);
                }
                if (jobs.length > 0) parts.push(`📢 공고 ${jobs.length}건`);
                if (posts.length > 0) {
                  const days = Math.floor((Date.now() - new Date(posts[0].created_at).getTime()) / (1000 * 60 * 60 * 24));
                  parts.push(days <= 0 ? "📸 오늘 소식" : `📸 ${days}일전 소식`);
                }
                if (parts.length === 0) return <span />;
                return <span className="text-[11px] text-text-muted leading-relaxed">{parts.join(" · ")}</span>;
              })()}
              {store.owner && (
                <EntityLink
                  href={`/worker/${store.user_id}`}
                  avatarUrl={store.owner.avatar_url}
                  fallbackEmoji="👤"
                  name={store.owner.nickname || "운영자"}
                  label=""
                  variant="content"
                  avatarShape="circle"
                />
              )}
            </div>
          </div>
        </div>

        {/* 진행중 공고 고정 */}
        {jobs.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-text-sub">📢 지금 채용 중</span>
            {jobs.map(job => (
              <button key={job.id} onClick={() => router.push(`/job/${job.id}`)}
                className="bg-primary-light border border-primary-border rounded-2xl p-3.5 text-left flex items-center justify-between gap-3 active:scale-[0.98] transition">
                <div className="min-w-0">
                  <span className="text-sm font-bold text-primary">
                    {job.wage ? `${job.wage.toLocaleString()}원${job.wage_negotiable ? " (협의가능)" : ""}` : "시급 협의"}
                  </span>
                  <div className="text-[11px] text-text-muted mt-0.5 truncate">
                    {job.work_days || "요일 협의"} · {job.work_hours || "시간 협의"}
                  </div>
                </div>
                <span className="text-xs font-bold text-primary flex-shrink-0">지원하기 →</span>
              </button>
            ))}
          </div>
        )}

        {/* 매장 피드 (3열 격자형 - 인스타 스타일) */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "16px 0", overflow: "hidden" }} className="flex flex-col">
          <div className="flex justify-between items-center px-4 mb-3">
            <span className="text-xs font-bold text-text-sub">📸 매장 소식</span>
            {isOwner && (
              <button 
                onClick={() => setShowCompose(true)}
                className="text-[10px] font-bold text-primary bg-primary/10 hover:bg-primary/20 px-2 py-1 rounded-md transition active:scale-95 flex items-center gap-1 focus:outline-none"
              >
                <i className="ti ti-plus" aria-hidden="true" />
                소식 등록
              </button>
            )}
          </div>
          {posts.length === 0 ? (
            <div className="mx-4 text-center py-14 px-4 bg-surface2/30 rounded-2xl border border-border">
              <p className="text-xs text-text-muted">아직 올라온 소식이 없어요</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5px", background: "var(--border)" }}>
              {posts.map(post => (
                <button key={post.id} onClick={() => handlePostClick(post)}
                  className="aspect-square relative overflow-hidden group focus:outline-none transition duration-150 active:scale-95 bg-surface">
                  {post.media_urls && post.media_urls.length > 0 ? (
                    post.media_type === "video" ? (
                      <div className="w-full h-full relative">
                        <video src={post.media_urls[0]} className="w-full h-full object-cover" />
                        <div className="absolute top-1.5 right-1.5 bg-black/60 w-5 h-5 rounded-full flex items-center justify-center">
                          <i className="ti ti-video text-white text-[10px]" aria-hidden="true" />
                        </div>
                      </div>
                    ) : (
                      <img src={post.media_urls[0]} alt="feed-item" className="w-full h-full object-cover" />
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center p-2 bg-gradient-to-br from-purple-900/10 to-pink-900/10">
                      <span className="text-[10px] text-text-sub line-clamp-4 text-center">{post.content}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center gap-3 text-xs font-bold text-white">
                    <span>❤️ {post.like_count || 0}</span>
                    <span>💬 {post.comment_count || 0}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 상세 라이트박스 */}
      {selectedPost && (() => {
        const currentIdx = posts.findIndex(p => p.id === selectedPost.id);
        const hasPrev = currentIdx > 0;
        const hasNext = currentIdx < posts.length - 1;
        const navigatePost = (dir: -1 | 1) => {
          const targetIdx = currentIdx + dir;
          if (targetIdx >= 0 && targetIdx < posts.length) {
            const targetPost = posts[targetIdx];
            setSelectedPost(targetPost);
            setActiveMediaIdx(0);
            setComments([]);
            loadComments(targetPost.id);
          }
        };

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-3">
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

              <div className="bg-surface rounded-xl border border-border shadow-2xl w-full overflow-hidden flex flex-col h-[80vh] max-h-[80vh]">
                <div className="flex justify-between items-center px-4 py-3.5 border-b border-border bg-surface2/40">
                  <span className="font-bold text-xs text-text-sub">{store.business_name}</span>
                  <button onClick={() => setSelectedPost(null)} className="text-text-muted hover:text-text focus:outline-none">
                    <i className="ti ti-x text-lg" aria-hidden="true" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {selectedPost.media_urls && selectedPost.media_urls.length > 0 && (
                    <div className="relative w-full aspect-square flex-shrink-0 bg-black overflow-hidden flex items-center justify-center">
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
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 rounded-full overflow-hidden bg-surface border border-border flex items-center justify-center">
                        {store.owner?.avatar_url ? (
                          <img src={store.owner.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm">👤</span>
                        )}
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-text leading-none">{store.business_name}</p>
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

                  <div className="bg-surface2/30 p-3 border-t border-border flex flex-col gap-2">
                    <span className="font-bold text-[11px] text-text-muted">댓글 ({comments.length})</span>
                    {commentsLoading ? (
                      <span className="text-[10px] text-text-muted text-center py-1">댓글 로딩 중...</span>
                    ) : comments.length === 0 ? (
                      <span className="text-[10px] text-text-muted text-center py-1">댓글이 없습니다.</span>
                    ) : (
                      <div className="flex flex-col gap-2 max-h-28 overflow-y-auto pr-0.5">
                        {comments.map(comment => (
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

                {myId && (
                  <div className="p-3 border-t border-border bg-surface2 flex gap-1.5 flex-shrink-0" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
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

      {/* 채용 제안 수락/거절 하단 고정 바 */}
      {pendingOffer && (
        <div style={{ position: "fixed", bottom: 81, left: 0, right: 0, padding: "12px 16px", background: "rgba(18,18,22,0.97)", backdropFilter: "blur(16px)", borderTop: "1px solid rgba(139,92,246,0.3)", zIndex: 40 }}>
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <p style={{ fontSize: 12, color: "#c4b5fd", fontWeight: 700, margin: "0 0 8px", textAlign: "center" }}>💌 이 매장에서 채용 제안을 보냈어요!</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => handleRespondOffer("reject")} disabled={offerSending}
                style={{ flex: 1, height: 50, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontWeight: 700, borderRadius: 14, fontSize: 14, cursor: "pointer" }}>
                거절하기
              </button>
              <button onClick={() => handleRespondOffer("accept")} disabled={offerSending}
                style={{ flex: 2, height: 50, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", border: "none", color: "#fff", fontWeight: 800, borderRadius: 14, fontSize: 14, cursor: "pointer" }}>
                {offerSending ? "처리 중..." : "수락하기 →"}
              </button>
            </div>
          </div>
        </div>
      )}
      {ToastUI}

      {showEditModal && (
        <StoreRegisterModal
          userId={myId!}
          existingStore={store}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false);
            init(); // 데이터 새로고침
          }}
        />
      )}

      {showCompose && myId && (
        <PostComposeModal
          userId={myId}
          employerProfileId={storeId}
          title="매장 소식 등록"
          placeholder="매장 소식이나 근무 이야기를 들려주세요... ✨"
          onClose={() => setShowCompose(false)}
          onPosted={(post) => setPosts(prev => [{ ...post, likedByMe: false }, ...prev])}
        />
      )}
    </main>
  );
}
