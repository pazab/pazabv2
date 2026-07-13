"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";

interface StoreInfo {
  id: string;
  user_id: string;
  business_name: string;
  business_type: string | null;
  description: string | null;
  image_url: string | null;
  region: string | null;
  address: string | null;
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

  // 상세 라이트박스
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [commenting, setCommenting] = useState(false);

  useEffect(() => { init(); }, [storeId]);

  const init = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id || null;
    setMyId(uid);

    const { data: storeData } = await supabase
      .from("employer_profiles")
      .select("id, user_id, business_name, business_type, description, image_url, region, address")
      .eq("id", storeId)
      .maybeSingle();
    setStore(storeData);

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
    }

    setLoading(false);
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
      <AppHeader title="매장 홈" showBack onBack={() => router.back()} />

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* 매장 헤더 */}
        <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="w-full aspect-[16/9] bg-surface2 flex items-center justify-center overflow-hidden">
            {store.image_url ? (
              <img src={store.image_url} alt={store.business_name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-5xl">🏪</span>
            )}
          </div>
          <div className="p-4 flex flex-col gap-2">
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
            {(store.region || store.address) && (
              <span className="text-xs text-text-muted">📍 {store.address || store.region}</span>
            )}
            {store.description && (
              <p className="text-xs text-text-sub leading-relaxed whitespace-pre-wrap">{store.description}</p>
            )}
            <span className="text-[11px] text-text-muted mt-1">👥 팔로워 {followerCount}명</span>
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

        {/* 매장 피드 */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-text-sub">📸 매장 소식</span>
          {posts.length === 0 ? (
            <div className="text-center py-14 px-4 bg-surface rounded-2xl border border-border">
              <p className="text-xs text-text-muted">아직 올라온 소식이 없어요</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {posts.map(post => (
                <button key={post.id} onClick={() => handlePostClick(post)}
                  className="aspect-square bg-surface2 rounded-xl relative overflow-hidden group focus:outline-none border border-border/40">
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
                    <div className="w-full h-full flex items-center justify-center p-2">
                      <span className="text-[10px] text-text-muted line-clamp-4 text-center">{post.content}</span>
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
      {selectedPost && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl border border-border shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center px-4 py-3 border-b border-border bg-surface2/40">
              <span className="font-bold text-xs text-text-sub">{store.business_name}</span>
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
                    <div className="flex w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-none">
                      {selectedPost.media_urls.map((url, idx) => (
                        <div key={idx} className="w-full h-full flex-shrink-0 snap-start flex items-center justify-center">
                          <img src={url} alt={`media-${idx}`} className="w-full h-full object-contain" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="p-4 flex flex-col gap-2.5">
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
      )}
    </main>
  );
}
