"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getMatchLevel } from "@/lib/utils";

const GRADE_INFO: Record<string, { label: string; emoji: string; color: string }> = {
  bronze: { label: "브론즈", emoji: "🥉", color: "#fb923c" },
  silver: { label: "실버", emoji: "🥈", color: "#94a3b8" },
  gold: { label: "골드", emoji: "🥇", color: "#fbbf24" },
  platinum: { label: "플래티넘", emoji: "💎", color: "#60a5fa" },
};

export default function ProfilePage() {
  const router = useRouter();
  const params = useParams();
  const targetId = params.userId as string;

  const [myId, setMyId] = useState<string | null>(null);
  const [targetUser, setTargetUser] = useState<any>(null);
  const [workerProfile, setWorkerProfile] = useState<any>(null);
  const [employerProfiles, setEmployerProfiles] = useState<any[]>([]);
  const [activeJobMap, setActiveJobMap] = useState<Record<string, string>>({}); // employer_profile_id -> job id
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [existingMatch, setExistingMatch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"worker" | "employer">("worker");

  // 피드 및 댓글 관련 상태
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [selectedPost, setSelectedPost] = useState<any | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [commenting, setCommenting] = useState(false);

  useEffect(() => { init(); }, [targetId]);

  const init = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) setMyId(session.user.id);

    // 유저 정보
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", targetId)
      .single();
    setTargetUser(user);

    // 알바생 프로필
    const { data: wp } = await supabase
      .from("worker_profiles")
      .select("*")
      .eq("user_id", targetId)
      .maybeSingle();
    setWorkerProfile(wp);

    // 사장님 매장 목록 (삭제된/테스트용 매장 제외)
    const { data: eps } = await supabase
      .from("employer_profiles")
      .select("*")
      .eq("user_id", targetId)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .not("business_name", "is", null);
    setEmployerProfiles(eps || []);

    // 매장별 실제 진행중인 공고 여부 (없으면 "공고 상세 보기" 버튼 숨김)
    if (eps && eps.length > 0) {
      const { data: activeJobs } = await supabase
        .from("jobs")
        .select("id, employer_profile_id")
        .in("employer_profile_id", eps.map(e => e.id))
        .eq("is_active", true)
        .eq("job_status", "active");
      const jobMap: Record<string, string> = {};
      (activeJobs || []).forEach(j => { jobMap[j.employer_profile_id] = j.id; });
      setActiveJobMap(jobMap);
    }

    // 피드 게시글 조회
    const { data: posts } = await supabase
      .from("feed_posts")
      .select("*")
      .eq("user_id", targetId)
      .order("created_at", { ascending: false });
    setUserPosts(posts || []);

    // 기본 탭 설정 - 성향은 어느쪽이든 있으면 표시
    if (!wp && eps?.length) setActiveTab("employer");

    // 매칭 점수 + 기존 매치
    if (session) {
      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: session.user.id, userType: "worker" }),
        });
        const data = await res.json();
        if (data.success) {
          const found = data.results?.find((r: any) => r.id === targetId || r.user_id === targetId);
          if (found) setMatchScore(found.match_score);
        }
      } catch {}

      const { data: match } = await supabase
        .from("matches")
        .select("id, progress_status")
        .or(`and(employer_id.eq.${targetId},worker_id.eq.${session.user.id}),and(employer_id.eq.${session.user.id},worker_id.eq.${targetId})`)
        .maybeSingle();
      if (match) setExistingMatch(match);
    }

    setLoading(false);
  };

  const loadComments = async (postId: string) => {
    try {
      setCommentsLoading(true);
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
        setUserPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, comment_count: data.commentCount } : p));
        setSelectedPost((p: any) => p ? { ...p, comment_count: data.commentCount } : null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCommenting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!selectedPost) return;
    try {
      const res = await fetch(`/api/feed/comment?commentId=${commentId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setComments(prev => prev.filter(c => c.id !== commentId));
        setUserPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, comment_count: data.commentCount } : p));
        setSelectedPost((p: any) => p ? { ...p, comment_count: data.commentCount } : null);
      }
    } catch (e) {
      console.error(e);
    }
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
        setUserPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, like_count: data.likeCount } : p));
        setSelectedPost((p: any) => p ? { ...p, like_count: data.likeCount } : null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const isMe = myId === targetId;
  const hasWorker = !!workerProfile;
  const hasEmployer = employerProfiles.length > 0;
  const grade = GRADE_INFO[targetUser?.grade || "bronze"];

  // 성향 데이터 - worker 우선, 없으면 employer
  const big5 = workerProfile?.big5_data || employerProfiles[0]?.bio5_data || null;
  const personalityType = workerProfile?.worker_type || employerProfiles[0]?.employer_type || null;

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
    </main>
  );

  if (!targetUser) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>유저를 찾을 수 없어요</p>
    </main>
  );

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 100 }}>
      {/* 헤더 */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--nav-bg)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => router.back()}
          style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 18, width: 36, height: 36, borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          ←
        </button>
        <span style={{ fontSize: 16, fontWeight: 700 }}>프로필</span>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* 프로필 상단 */}
        <div style={{ background: "linear-gradient(135deg, var(--primary-light), var(--primary-light))", backdropFilter: "blur(12px)", border: "1px solid var(--primary-border)", borderRadius: 20, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
            {/* 아바타 */}
            <div style={{ width: 72, height: 72, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: "2px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {targetUser.avatar_url ? (
                <img src={targetUser.avatar_url} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{
                  width: "100%", height: "100%",
                  background: "linear-gradient(135deg, #f59e0b, #ef4444)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30
                }}>
                  {hasEmployer ? "🏪" : "👤"}
                </div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              {/* 닉네임 */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>{targetUser.nickname || targetUser.name}</h2>
                {hasWorker && <span style={{ fontSize: 11, background: "var(--chip-purple-bg)", color: "var(--purple-text)", padding: "2px 8px", borderRadius: 20, border: "1px solid var(--chip-purple-border)" }}>⚡ 알바생</span>}
                {hasEmployer && <span style={{ fontSize: 11, background: "var(--chip-pink-bg)", color: "var(--pink-text)", padding: "2px 8px", borderRadius: 20, border: "1px solid var(--chip-pink-border)" }}>🏪 사장님</span>}
              </div>
              {/* 등급 + 신뢰점수 */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: grade.color, fontWeight: 700 }}>{grade.emoji} {grade.label}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>신뢰 {targetUser.trust_score || 50}점</span>
              </div>
            </div>
            {/* 궁합 점수 */}
            {matchScore != null && !isMe && (() => {
              const level = getMatchLevel(matchScore);
              return (
                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: level.color }}>{matchScore}</div>
                  <div style={{ fontSize: 9, color: level.color, fontWeight: 600 }}>{level.emoji} {level.label}</div>
                </div>
              );
            })()}
          </div>

          {/* 성향 유형 한줄 요약만 */}
          {personalityType && (
            <div style={{ background: "var(--card-inner)", borderRadius: 12, padding: "8px 14px", border: "1px solid var(--card-inner-border)" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>성향 유형 · </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--purple-text)" }}>{personalityType}</span>
            </div>
          )}
        </div>

        {/* 성향 분석 결과 */}
        {(personalityType || big5) && (
          <>
            {/* 성향 유형 카드 */}
            <div style={{ background: "var(--surface)", backdropFilter: "blur(12px)", border: "1px solid var(--border)", borderRadius: 20, padding: 20, textAlign: "center" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--card-inner)", borderRadius: 20, padding: "4px 12px", marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: "var(--purple-text)", fontWeight: 600 }}>🔬 행동심리 분석 결과</span>
              </div>
              {personalityType && (
                <>
                  <div style={{ fontSize: 52, marginBottom: 8 }}>
                    {workerProfile?.big5_data ? "⚡" : "🏪"}
                  </div>
                  <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 4px" }}>{personalityType}</h2>
                </>
              )}
              {/* 강점 태그 */}
              {(workerProfile?.strengths || employerProfiles[0]?.tags) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 12 }}>
                  {(workerProfile?.strengths || []).map((s: string) => (
                    <span key={s} style={{ background: "var(--primary-light)", border: "1px solid var(--primary-border)", color: "var(--purple-text)", fontSize: 12, borderRadius: 20, padding: "5px 12px" }}>{s}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Big5 성향 분석 */}
            {big5 && (
              <div style={{ background: "var(--surface)", backdropFilter: "blur(12px)", border: "1px solid var(--border)", borderRadius: 20, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>📊 행동심리 성향 분석</h3>
                  <span style={{ fontSize: 11, background: "var(--chip-green-bg)", color: "var(--green-text)", padding: "2px 8px", borderRadius: 20, border: "1px solid var(--chip-green-border)" }}>과학적 근거</span>
                </div>
                {[
                  { label: "성실성", desc: "약속·책임감", value: big5.conscientiousness },
                  { label: "외향성", desc: "에너지·사교", value: big5.extraversion },
                  { label: "친화성", desc: "협동·배려", value: big5.agreeableness },
                  { label: "개방성", desc: "창의·호기심", value: big5.openness },
                  { label: "안정성", desc: "감정조절", value: 5 - big5.neuroticism },
                ].map(item => (
                  <div key={item.label} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                      <div>
                        <span style={{ color: "var(--text-sub)", fontWeight: 600 }}>{item.label}</span>
                        <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: 6 }}>{item.desc}</span>
                      </div>
                      <span style={{ color: "var(--text-muted)" }}>{item.value}/5</span>
                    </div>
                    <div style={{ background: "var(--progress-track)", borderRadius: 4, height: 6 }}>
                      <div style={{ background: item.value >= 4 ? "linear-gradient(90deg, #8b5cf6, #ec4899)" : "var(--primary)", height: 6, borderRadius: 4, width: `${(item.value / 5) * 100}%`, transition: "width 0.8s ease" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {hasWorker && hasEmployer && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setActiveTab("worker")}
              style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 13, fontWeight: 600, cursor: "pointer", background: activeTab === "worker" ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)", color: activeTab === "worker" ? "#fff" : "var(--text-muted)" }}>
              ⚡ 알바생 정보
            </button>
            <button onClick={() => setActiveTab("employer")}
              style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 13, fontWeight: 600, cursor: "pointer", background: activeTab === "employer" ? "linear-gradient(135deg, #ec4899, #be185d)" : "var(--surface2)", color: activeTab === "employer" ? "#fff" : "var(--text-muted)" }}>
              🏪 사장님 정보
            </button>
          </div>
        )}

        {/* 알바생 정보 */}
        {((hasWorker && !hasEmployer) || (hasWorker && activeTab === "worker")) && workerProfile && (
          <div style={{ background: "var(--surface)", backdropFilter: "blur(12px)", border: "1px solid var(--border)", borderRadius: 20, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 14px", color: "var(--purple-text)" }}>⚡ 구직 정보</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {workerProfile.desired_type && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", width: 60, flexShrink: 0 }}>희망직종</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{workerProfile.desired_type}</span>
                </div>
              )}
              {workerProfile.desired_region && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", width: 60, flexShrink: 0 }}>희망지역</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>📍 {workerProfile.desired_region}</span>
                </div>
              )}
              {workerProfile.desired_wage && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", width: 60, flexShrink: 0 }}>희망시급</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>💰 {workerProfile.desired_wage.toLocaleString()}원↑</span>
                </div>
              )}
              {workerProfile.work_days && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", width: 60, flexShrink: 0 }}>가능요일</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>📅 {workerProfile.work_days}</span>
                </div>
              )}
              {workerProfile.work_hours && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", width: 60, flexShrink: 0 }}>가능시간</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>⏰ {workerProfile.work_hours}</span>
                </div>
              )}
              {workerProfile.experience && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", width: 60, flexShrink: 0 }}>경력</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {workerProfile.experience === "있음" ? `📋 ${workerProfile.experience_months || 0}개월` : "신입"}
                  </span>
                </div>
              )}
              <button onClick={() => router.push(`/worker/${targetId}`)}
                style={{ marginTop: 4, background: "var(--primary-light)", border: "1px solid var(--primary-border)", color: "var(--purple-text)", fontSize: 12, fontWeight: 600, padding: "8px", borderRadius: 10, cursor: "pointer" }}>
                구직 정보 상세 보기 →
              </button>
            </div>
          </div>
        )}

        {/* 사장님 정보 — 매장 상세는 각 매장 홈에서만, 여기선 목록/링크만 */}
        {((hasEmployer && !hasWorker) || (hasEmployer && activeTab === "employer")) && (
          <div style={{ background: "var(--surface)", backdropFilter: "blur(12px)", border: "1px solid var(--border)", borderRadius: 20, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 14px", color: "var(--pink-text)" }}>🏪 운영중인 매장 ({employerProfiles.length})</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {employerProfiles.map(ep => (
                <button key={ep.id} onClick={() => router.push(`/store/${ep.id}`)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "var(--card-inner)", border: "1px solid var(--card-inner-border)", borderRadius: 14, padding: "12px 14px", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{ep.business_name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      {ep.business_type}{ep.region ? ` · 📍 ${ep.region}` : ""}
                      {activeJobMap[ep.id] && <span style={{ color: "var(--pink-text)", fontWeight: 700 }}> · 📢 채용중</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--purple-text)", fontWeight: 700, flexShrink: 0 }}>매장 홈 →</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {/* 📸 피드 스토리 그리드 섹션 */}
        {userPosts.length > 0 && (
          <div style={{ background: "var(--surface)", backdropFilter: "blur(12px)", border: "1px solid var(--border)", borderRadius: 20, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 14px", color: "var(--primary)" }}>📸 피드 스토리</h3>
            <div className="grid grid-cols-3 gap-1.5">
              {userPosts.map(post => (
                <button key={post.id} onClick={() => handlePostClick(post)}
                  className="aspect-square bg-surface2 rounded-xl relative overflow-hidden group focus:outline-none border border-border/20">
                  {post.media_type === "video" ? (
                    <div className="w-full h-full relative">
                      <video src={post.media_urls[0]} className="w-full h-full object-cover" />
                      <div className="absolute top-1.5 right-1.5 bg-black/60 w-5 h-5 rounded-full flex items-center justify-center">
                        <i className="ti ti-video text-white text-[10px]" aria-hidden="true" />
                      </div>
                    </div>
                  ) : (
                    <img src={post.media_urls[0]} alt="feed-item" className="w-full h-full object-cover" />
                  )}
                  {/* hover overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center gap-3 text-xs font-bold text-white">
                    <span>❤️ {post.like_count || 0}</span>
                    <span>💬 {post.comment_count || 0}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* 피드 라이트박스 상세 모달 */}
      {selectedPost && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl border border-border shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
            {/* 헤더 */}
            <div className="flex justify-between items-center px-4 py-3 border-b border-border bg-surface2/40">
              <span className="font-bold text-xs text-text-sub">상세 보기</span>
              <button onClick={() => setSelectedPost(null)} className="text-text-muted hover:text-text focus:outline-none">
                <i className="ti ti-x text-lg" aria-hidden="true" />
              </button>
            </div>

            {/* 바디 (스크롤 가능) */}
            <div className="flex-1 overflow-y-auto">
              {/* 미디어 */}
              {selectedPost.media_urls && selectedPost.media_urls.length > 0 && (
                <div className="relative w-full aspect-[4/3] bg-black overflow-hidden flex items-center justify-center">
                  {selectedPost.media_type === "video" ? (
                    <video src={selectedPost.media_urls[0]} controls playsInline className="w-full h-full object-contain" />
                  ) : (
                    <div className="flex w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-none">
                      {selectedPost.media_urls.map((url: string, idx: number) => (
                        <div key={idx} className="w-full h-full flex-shrink-0 snap-start flex items-center justify-center">
                          <img src={url} alt={`media-${idx}`} className="w-full h-full object-contain" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 본문 텍스트 */}
              <div className="p-4 flex flex-col gap-2.5">
                <div className="flex gap-2 items-center">
                  <span className="font-bold text-xs bg-primary-light px-2 py-0.5 rounded text-primary">본문</span>
                  <span className="text-[10px] text-text-muted">
                    {selectedPost.created_at ? new Date(selectedPost.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) : ""}
                  </span>
                </div>
                {selectedPost.content ? (
                  <p className="text-xs text-text-sub leading-relaxed whitespace-pre-wrap">{selectedPost.content}</p>
                ) : (
                  <span className="text-xs text-text-muted italic">본문 텍스트가 없습니다.</span>
                )}

                {/* 좋아요 단추 */}
                <div className="flex items-center gap-3 mt-1.5 border-t border-b border-border py-2">
                  <button onClick={handleLikePost} className="flex items-center gap-1.5 text-text-sub focus:outline-none">
                    <i className="ti ti-heart-filled text-pink-500 text-lg" aria-hidden="true" />
                    <span className="text-xs font-bold">{selectedPost.like_count || 0}</span>
                  </button>
                  <div className="flex items-center gap-1.5 text-text-sub">
                    <i className="ti ti-message-2 text-lg text-text" aria-hidden="true" />
                    <span className="text-xs font-bold">{selectedPost.comment_count || 0}</span>
                  </div>
                </div>
              </div>

              {/* 댓글 섹션 */}
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
                        <div className="flex-1 bg-surface rounded-xl px-2.5 py-1.5 shadow-sm border border-border relative">
                          <div className="flex justify-between items-center mb-0.5">
                            <span className="font-bold text-[10px] text-text">{comment.authorName}</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[8px] text-text-muted">
                                {comment.created_at ? new Date(comment.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) : ""}
                              </span>
                              {comment.user_id === myId && (
                                <button onClick={() => handleDeleteComment(comment.id)}
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
              </div>
            </div>

            {/* 댓글 작성 푸터 */}
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
