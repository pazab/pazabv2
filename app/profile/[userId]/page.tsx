"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getMatchLevel, getTrustGrade } from "@/lib/utils";
import { useToast } from "@/lib/useToast";

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
  const { showToast, ToastUI } = useToast();

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

  // ⋯ 메뉴 상태
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [hasMatchHistory, setHasMatchHistory] = useState(false);

  // 풀스크린 라이트박스
  const [zoomedIndex, setZoomedIndex] = useState(0);

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

      // 차단 여부
      if (session.user.id !== targetId) {
        const { data: blockData } = await supabase
          .from("user_blocks")
          .select("id")
          .eq("blocker_id", session.user.id)
          .eq("blocked_id", targetId)
          .maybeSingle();
        setIsBlocked(!!blockData);
      }

      // 매칭 완료 이력 (hired 이상)
      const { data: matchHistory } = await supabase
        .from("matches")
        .select("id")
        .or(`employer_id.eq.${targetId},worker_id.eq.${targetId}`)
        .in("progress_status", ["hired", "accepted", "completed"])
        .limit(1);
      setHasMatchHistory(!!(matchHistory && matchHistory.length > 0));
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
    setZoomedIndex(0);
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

  const handleChat = async () => {
    if (!myId) { router.push("/login"); return; }
    const res = await fetch(`/api/dm?targetId=${targetId}`);
    const data = await res.json();
    if (!res.ok || !data.matchId) { showToast(data.error || "채팅방을 열 수 없어요.", "error"); return; }
    router.push(`/chat/${data.matchId}`);
  };

  const handleBlock = async () => {
    if (!myId) return;
    if (!isBlocked) { setShowBlockConfirm(true); return; }
    setBlocking(true);
    const { error } = await supabase.from("user_blocks").delete().eq("blocker_id", myId).eq("blocked_id", targetId);
    if (!error) { setIsBlocked(false); showToast("차단이 해제되었습니다."); }
    else showToast("차단 해제 실패", "error");
    setBlocking(false);
  };

  const confirmBlock = async () => {
    if (!myId) return;
    setShowBlockConfirm(false);
    setBlocking(true);
    const { error } = await supabase.from("user_blocks").insert({ blocker_id: myId, blocked_id: targetId });
    if (!error) { setIsBlocked(true); showToast("사용자가 차단되었습니다."); }
    else showToast("차단 처리 실패", "error");
    setBlocking(false);
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
      {ToastUI}

      {/* 차단 확인 모달 */}
      {showBlockConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "var(--surface)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 340 }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", margin: "0 0 8px" }}>🚫 차단하기</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px", lineHeight: 1.6 }}>
              차단 시 이 사용자의 대타 공고 지원이 제한되며 메시지 수신이 차단됩니다.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowBlockConfirm(false)}
                style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, fontSize: 13, fontWeight: 700, color: "var(--text)", cursor: "pointer" }}>
                취소
              </button>
              <button onClick={confirmBlock}
                style={{ flex: 1, background: "#ef4444", border: "none", borderRadius: 12, padding: 12, fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                차단하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--nav-bg)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => router.back()}
          style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 18, width: 36, height: 36, borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          ←
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>프로필</span>
        {/* 본인이 아닐 때만 ⋯ 메뉴 표시 */}
        {!isMe && myId && (
          <div ref={menuRef} style={{ position: "relative" }}>
            <button onClick={() => setShowActionMenu(p => !p)}
              style={{ background: showActionMenu ? "var(--surface)" : "none", border: showActionMenu ? "1px solid var(--border)" : "none", color: "var(--text-muted)", cursor: "pointer", width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-dots-vertical" style={{ fontSize: 20 }} aria-hidden="true" />
            </button>
            {showActionMenu && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", width: 190, boxShadow: "0 8px 32px rgba(0,0,0,0.25)", zIndex: 50 }}
                onClick={() => setShowActionMenu(false)}>
                <button onClick={handleChat}
                  style={{ width: "100%", background: "none", border: "none", padding: "13px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--text)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15 }}>💬</span> 1:1 메시지 보내기
                </button>
                <button onClick={handleBlock} disabled={blocking}
                  style={{ width: "100%", background: "none", border: "none", padding: "13px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: isBlocked ? "#ef4444" : "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15 }}>🚫</span> {isBlocked ? "차단 해제" : "차단하기"}
                </button>
              </div>
            )}
          </div>
        )}
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

        {/* 신뢰도 + 안심 스펙 배지 */}
        {!isMe && (() => {
          const trustScore = targetUser?.trust_score ?? 50;
          const trust = getTrustGrade(trustScore);
          const hasIdCard = !!workerProfile?.is_verified;
          const hasBankbook = !!targetUser?.bank_verified;
          const hasPersonality = !!(workerProfile?.big5_data || employerProfiles[0]?.bio5_data);
          const jobCategories: string[] = workerProfile?.job_categories || [];

          // 역할별 배지 분기
          const badges = hasWorker
            ? [
                { label: "신원 인증", on: hasIdCard, emoji: "🛡️" },
                { label: "계좌 검증", on: hasBankbook, emoji: "🏦" },
                { label: "성향 분석", on: hasPersonality, emoji: "🔬" },
                { label: "매칭 완료", on: hasMatchHistory, emoji: "🤝" },
              ]
            : [
                { label: "신원 인증", on: hasIdCard, emoji: "🛡️" },
                { label: "성향 분석", on: hasPersonality, emoji: "🔬" },
                { label: "매칭 완료", on: hasMatchHistory, emoji: "🤝" },
              ];

          return (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              {/* 신뢰도 게이지 */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>신뢰도 점수</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: trust.color }}>{trustScore}점 · {trust.emoji} {trust.label}등급</span>
                </div>
                <div style={{ width: "100%", height: 6, background: "var(--progress-track)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${trustScore}%`, height: "100%", background: trust.color, borderRadius: 3, transition: "width 0.6s ease" }} />
                </div>
              </div>
              {/* 배지 */}
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", margin: "0 0 10px" }}>🛡️ 신뢰 검증 현황</p>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${badges.length}, 1fr)`, gap: 8 }}>
                  {badges.map(badge => (
                    <div key={badge.label} style={{
                      background: badge.on ? "rgba(16,185,129,0.06)" : "var(--surface2)",
                      border: `1px solid ${badge.on ? "rgba(16,185,129,0.3)" : "var(--border)"}`,
                      borderRadius: 12, padding: "10px 4px", textAlign: "center", display: "flex", flexDirection: "column", gap: 4, alignItems: "center"
                    }}>
                      <span style={{ fontSize: 20, opacity: badge.on ? 1 : 0.35 }}>{badge.emoji}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: badge.on ? "#10b981" : "var(--text-muted)" }}>{badge.label}</span>
                      <span style={{ fontSize: 9, color: badge.on ? "#10b981" : "var(--text-muted)", opacity: 0.8 }}>
                        {badge.on ? "완료" : "미완료"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {/* 선호 업종 칩 (알바생만) */}
              {hasWorker && jobCategories.length > 0 && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", margin: "0 0 8px" }}>💼 선호 업종</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {jobCategories.map((c: string) => (
                      <span key={c} style={{ fontSize: 11, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 10px", color: "var(--text)" }}>{c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

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

      {/* 풀스크린 라이트박스 (인스타 스타일) */}
      {selectedPost && (
        <div className="fixed inset-0 bg-black/95 z-[60] flex flex-col" onClick={() => setSelectedPost(null)}>
          {/* 상단 바 */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-surface2 border border-white/20 flex items-center justify-center flex-shrink-0">
                {targetUser?.avatar_url ? (
                  <img src={targetUser.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm">{hasEmployer ? "🏪" : "👤"}</span>
                )}
              </div>
              <span className="text-white text-xs font-bold truncate">{targetUser?.nickname || targetUser?.name}</span>
            </div>
            <button onClick={() => setSelectedPost(null)}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center flex-shrink-0">
              <i className="ti ti-x" style={{ fontSize: 18, color: "#fff" }} aria-hidden="true" />
            </button>
          </div>

          {/* 미디어 */}
          <div className="flex-1 relative flex items-center justify-center min-h-0" onClick={e => e.stopPropagation()}>
            {selectedPost.media_type === "video" ? (
              <video src={selectedPost.media_urls?.[0]} controls playsInline className="max-w-full max-h-full object-contain" />
            ) : selectedPost.media_urls?.length > 0 ? (
              <>
                <img src={selectedPost.media_urls[zoomedIndex]} alt="확대 이미지" className="max-w-full max-h-full object-contain" />
                {selectedPost.media_urls.length > 1 && zoomedIndex > 0 && (
                  <button onClick={() => setZoomedIndex(i => i - 1)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                    <i className="ti ti-chevron-left" style={{ fontSize: 22, color: "#fff" }} aria-hidden="true" />
                  </button>
                )}
                {selectedPost.media_urls.length > 1 && zoomedIndex < selectedPost.media_urls.length - 1 && (
                  <button onClick={() => setZoomedIndex(i => i + 1)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                    <i className="ti ti-chevron-right" style={{ fontSize: 22, color: "#fff" }} aria-hidden="true" />
                  </button>
                )}
                {selectedPost.media_urls.length > 1 && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
                    {zoomedIndex + 1}/{selectedPost.media_urls.length}
                  </div>
                )}
              </>
            ) : (
              <p className="text-white/50 text-sm">미디어 없음</p>
            )}
          </div>

          {/* 하단: 캡션 + 좋아요/댓글 + 댓글 목록 */}
          <div className="flex-shrink-0 bg-black/60" onClick={e => e.stopPropagation()}>
            <div className="px-4 pt-3 pb-1 flex flex-col gap-2">
              {selectedPost.content && (
                <p className="text-white text-xs leading-relaxed whitespace-pre-wrap">{selectedPost.content}</p>
              )}
              <div className="flex items-center gap-4">
                <button onClick={handleLikePost} className="flex items-center gap-1.5">
                  <i className="ti ti-heart text-lg" style={{ color: "#fff" }} aria-hidden="true" />
                  <span className="text-white text-xs font-bold">{selectedPost.like_count || 0}</span>
                </button>
                <div className="flex items-center gap-1.5">
                  <i className="ti ti-message-2 text-lg" style={{ color: "#fff" }} aria-hidden="true" />
                  <span className="text-white text-xs font-bold">{selectedPost.comment_count || 0}</span>
                </div>
              </div>
            </div>
            {/* 댓글 목록 (최대 3줄) */}
            {comments.length > 0 && (
              <div className="px-4 pb-2 flex flex-col gap-1 max-h-24 overflow-y-auto">
                {comments.slice(0, 5).map(c => (
                  <div key={c.id} className="flex gap-1.5 items-start">
                    <span className="text-white/70 text-[11px] font-bold flex-shrink-0">{c.authorName}</span>
                    <span className="text-white/80 text-[11px] leading-snug">{c.content}</span>
                  </div>
                ))}
              </div>
            )}
            {/* 댓글 입력 */}
            {myId && (
              <div className="px-4 pb-4 pt-2 border-t border-white/10 flex gap-2">
                <input type="text" placeholder="댓글 달기..."
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleAddComment(); }}
                  disabled={commenting}
                  className="flex-1 bg-white/10 border border-white/20 text-white text-xs placeholder-white/40 px-3 py-2 rounded-xl focus:outline-none" />
                <button onClick={handleAddComment} disabled={commenting || !newComment.trim()}
                  style={{ background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", color: "#fff", fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 12, cursor: "pointer" }}
                  className="disabled:opacity-50">
                  게시
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
