"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import InviteBottomSheet from "@/components/InviteBottomSheet";
import ImageCropModal from "@/components/ImageCropModal";
import { convertHeicIfNeeded } from "@/lib/heicConvert";

import AppHeader from "@/components/AppHeader";
import { Suspense } from "react";
import { BADGE_DEFS, GRADE_DEFS, getGrade, getBadgesByRole } from "@/lib/trustScore";
import { cardStyle, cardGradientStyle, cardInnerStyle, btnPrimary, btnSecondary, btnAccent, btnGhost, btnDanger, modalOverlay, modalSheet, modalCenter, toggleTrack, toggleThumb } from "@/lib/styles";
import { JobCard } from "@/components/JobCard";
import { useActiveRole } from "@/lib/useActiveRole";
import RoleToggleButton from "@/components/RoleToggleButton";
import InfoTip from "@/components/InfoTip";
import ConfirmModal from "@/components/ConfirmModal";
import LoveCallSection from "@/components/LoveCallSection";
import MatchSuccessModal from "@/components/MatchSuccessModal";
import { useLoveCalls } from "@/lib/useLoveCalls";

const glassStyle: React.CSSProperties = {
  background: "var(--surface2)",
  backdropFilter: "blur(16px)",
  border: "1px solid var(--border)",
  borderRadius: 20,
  boxShadow: "var(--shadow-elevate)",
};

const glassProfileCard: React.CSSProperties = {
  background: "var(--primary-light)",
  backdropFilter: "blur(20px)",
  border: "1px solid var(--primary-border)",
  borderRadius: 24,
  boxShadow: "var(--shadow-elevate)",
  padding: "20px 18px",
};

interface UserProfile {
  id: string; email: string; name: string; nickname?: string;
  user_type: "employer" | "worker" | "both";
  trust_score: number; grade: string; profile_completed: boolean;
  avatar_url?: string;
}

const GRADE_INFO: Record<string, { label: string; emoji: string; color: string }> = {
  bronze: { label: "브론즈", emoji: "🥉", color: "#fb923c" },
  silver: { label: "실버", emoji: "🥈", color: "#94a3b8" },
  gold: { label: "골드", emoji: "🥇", color: "#fbbf24" },
  platinum: { label: "플래티넘", emoji: "💎", color: "#60a5fa" },
};

const isVideoUrl = (url: string) => {
  if (!url || typeof url !== "string") return false;
  if (url.startsWith("data:video/")) return true;
  const cleanUrl = url.split("?")[0].split("#")[0];
  const ext = cleanUrl.split(".").pop()?.toLowerCase();
  return ext ? ["mp4", "webm", "ogg", "mov", "avi", "mkv", "quicktime"].includes(ext) : false;
};

function UserGradeBadge({ userId, trustScore, mode }: { userId: string; trustScore: number; mode: "worker" | "employer" }) {
  const [allBadges, setAllBadges] = useState<any[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<string | null>(null);

  const grade = getGrade(trustScore || 50);

  useEffect(() => {
    supabase.from("user_badges").select("badge_key").eq("user_id", userId)
      .then(({ data }: any) => {
        setAllBadges(data || []);
      });
  }, [userId]);

  const showWorker = mode === "worker";
  const showEmployer = mode === "employer";

  const workerBadges = getBadgesByRole(allBadges, "worker");
  const employerBadges = getBadgesByRole(allBadges, "employer");

  const scorePercent = Math.max(0, Math.min(100, trustScore || 50));
  const scoreColor = scorePercent >= 80 ? "var(--success)" : scorePercent >= 50 ? "var(--purple-text)" : "var(--danger)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 신뢰도 게이지 바 */}
      <div style={{ background: "var(--surface2)", borderRadius: 16, padding: "12px 14px", border: "1px solid var(--card-inner-border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-sub)", display: "flex", alignItems: "center", gap: 4 }}>
            🎯 종합 신뢰도
            <InfoTip title="신뢰도 점수는 어떻게 정해지나요?">
              <p style={{ margin: "0 0 8px" }}>노쇼·지각 없이 약속을 지키고, 계약을 완료하고, 좋은 평점을 받을 때마다 점수가 오르는 활동 기반 점수예요(0~100점).</p>
              <p style={{ margin: 0 }}>점수 구간에 따라 등급이 자동으로 매겨져요: {GRADE_DEFS.map(g => `${g.emoji}${g.name}(${g.min}점~)`).join(" → ")}</p>
            </InfoTip>
          </span>
          <span style={{ fontSize: 15, fontWeight: 900, color: scoreColor }}>{scorePercent}점</span>
        </div>
        <div style={{ width: "100%", height: 10, background: "var(--progress-track)", borderRadius: 6, overflow: "hidden", border: "1px solid var(--card-inner-border)" }}>
          <div style={{ width: `${scorePercent}%`, height: "100%", background: "var(--primary)", borderRadius: 6 }} />
        </div>
      </div>

      {showWorker && (
        <div>
          {/* 알바생 타이틀 */}
          <p style={{ fontSize: 12, fontWeight: 800, color: "var(--text-muted)", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
            <span>⚡</span> 알바생 신뢰등급
          </p>
          {/* 등급 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 20 }}>{grade.emoji}</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: "var(--purple-text)" }}>{grade.name}</span>
            <span style={{ fontSize: 10, color: "var(--purple-text)", background: "var(--chip-purple-bg)", padding: "2px 8px", borderRadius: 20, border: "1px solid var(--chip-purple-border)", fontWeight: 700 }}>
              알바 등급
            </span>
          </div>

          {/* 뱃지 */}
          {workerBadges.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {workerBadges.map(b => (
                <button key={b.key} type="button" onClick={() => setSelectedBadge(selectedBadge === b.key ? null : b.key)}
                  style={{ background: "var(--chip-green-bg)", border: "1px solid var(--chip-green-border)", borderRadius: 20, padding: "4px 10px", fontSize: 11, color: "var(--green-text)", cursor: "pointer", fontWeight: 600 }}>
                  {b.emoji} {b.name}
                </button>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>아직 획득한 알바 뱃지가 없어요</p>
          )}
        </div>
      )}

      {showEmployer && (
        <div>
          {/* 사장님 타이틀 */}
          <p style={{ fontSize: 12, fontWeight: 800, color: "var(--text-muted)", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
            <span>🏪</span> 사장님 신뢰등급
          </p>
          {/* 등급 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 20 }}>{grade.emoji}</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: "var(--pink-text)" }}>{grade.name}</span>
            <span style={{ fontSize: 10, color: "var(--pink-text)", background: "var(--chip-pink-bg)", padding: "2px 8px", borderRadius: 20, border: "1px solid var(--chip-pink-border)", fontWeight: 700 }}>
              사장 등급
            </span>
          </div>

          {/* 뱃지 */}
          {employerBadges.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {employerBadges.map(b => (
                <button key={b.key} type="button" onClick={() => setSelectedBadge(selectedBadge === b.key ? null : b.key)}
                  style={{ background: "var(--chip-green-bg)", border: "1px solid var(--chip-green-border)", borderRadius: 20, padding: "4px 10px", fontSize: 11, color: "var(--green-text)", cursor: "pointer", fontWeight: 600 }}>
                  {b.emoji} {b.name}
                </button>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>아직 획득한 사장님 뱃지가 없어요</p>
          )}
        </div>
      )}

      {/* 뱃지 상세 툴팁 */}
      {selectedBadge && BADGE_DEFS[selectedBadge] && (
        <div style={{ marginTop: 10, background: "var(--success-bg)", border: "1px solid var(--success-border)", borderRadius: 12, padding: "10px 12px" }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: "var(--success)", margin: "0 0 4px" }}>
            {BADGE_DEFS[selectedBadge].emoji} {BADGE_DEFS[selectedBadge].name}
          </p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 6px", lineHeight: 1.5 }}>{BADGE_DEFS[selectedBadge].desc}</p>
          <p style={{ fontSize: 11, color: "var(--success)", margin: 0 }}>🎯 {BADGE_DEFS[selectedBadge].cond}</p>
        </div>
      )}
    </div>
  );
}

function MyPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as "worker" | "employer" | null;
  const toastParam = searchParams.get("toast");
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    if (toastParam === "bot_updated") {
      setToastMsg("🤖 봇이 업데이트됐어요!");
      setTimeout(() => setToastMsg(""), 3000);
    }
  }, [toastParam]);

  const [user, setUser] = useState<UserProfile | null>(null);
  const { activeRole, setActiveRole, isBoth } = useActiveRole(user?.user_type);

  // ?tab=worker|employer 딥링크(예: 채팅방 "대타 관리하기") — both 계정의 활성 모드를 강제 전환.
  // 적용 후 URL에서 tab을 지워야 함 — 안 지우면 다른 페이지로 이동했다가 뒤로가기로 돌아올 때
  // 이 effect가 다시 실행되며, 그 사이 상단 스위치로 바꾼 모드를 무시하고 예전 값으로 되돌려버림.
  const searchParamsString = searchParams.toString();
  useEffect(() => {
    if (isBoth && (tabParam === "worker" || tabParam === "employer")) {
      setActiveRole(tabParam);
      const params = new URLSearchParams(searchParamsString);
      params.delete("tab");
      router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
    }
  }, [isBoth, tabParam, setActiveRole, pathname, router, searchParamsString]);
  const [userId, setUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const viewType = "worker";
  const [basicResult, setBasicResult] = useState<any>(null);
  const [advancedResult, setAdvancedResult] = useState<any>(null);
  const [hasWorkerInterview, setHasWorkerInterview] = useState(false);
  const [hasEmployerInterview, setHasEmployerInterview] = useState(false);
  const [showRetryModal, setShowRetryModal] = useState(false);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [showNicknameConfirm, setShowNicknameConfirm] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState("");
  const [confirmModal, setConfirmModal] = useState<{
    title: string; desc: string; confirmLabel: string; confirmColor?: string; onConfirm: () => void;
  } | null>(null);
  const {
    loveCalls, loveCallLoading, respondingId,
    matchModal, setMatchModal,
    fetchLoveCalls, handleRespond, handleCancel, handleDelete,
  } = useLoveCalls(userId, setConfirmModal, (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(""), 3000); });

  const handleCropComplete = async (croppedBlob: Blob) => {
    if (!user) return;
    setAvatarUploading(true);
    setTempImageSrc(null);
    const path = `${user.id}.jpg`;
    const file = new File([croppedBlob], `profile.jpg`, { type: "image/jpeg" });
    const { error } = await supabase.storage.from("media").upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      const avatarUrl = `${data.publicUrl}?t=${Date.now()}`;
      await supabase.from("users").update({ avatar_url: avatarUrl }).eq("id", user.id);
      await supabase.from("worker_profiles").update({ image_url: avatarUrl }).eq("user_id", user.id);
      await supabase.from("employer_profiles").update({ image_url: avatarUrl }).eq("user_id", user.id);
      setUser(prev => prev ? { ...prev, avatar_url: avatarUrl } : prev);
      setToastMsg("프로필 사진이 변경됐어요!");
    } else {
      alert("프로필 사진 업로드 실패: " + error.message);
    }
    setAvatarUploading(false);
  };

  const [myEmployerProfile, setMyEmployerProfile] = useState<any>(null);

  // 피드 및 북마크 탭 관련 상태
  const [myPosts, setMyPosts] = useState<any[]>([]);
  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  const [feedTab, setFeedTab] = useState<"posts" | "saved">("posts");
  const [selectedPost, setSelectedPost] = useState<any | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [commenting, setCommenting] = useState(false);

  useEffect(() => { fetchUser(); }, []);
  useEffect(() => { if (user) loadResultsForType(viewType, user.id); }, [viewType]);

  // 사장님: 알바생이 채용 제안 수락 시 실시간 팝업
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`match-accept-${userId}-${Date.now()}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "matches",
        filter: `employer_id=eq.${userId}`,
      }, (payload) => {
        const updated = payload.new as Record<string, unknown>;
        if (updated.progress_status === "accepted" && updated.employer_interest === true) {
          setMatchModal({ matchId: String(updated.id) });
          fetchLoveCalls(userId, "both");
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const fetchUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        localStorage.setItem("login_redirect", window.location.pathname);
        router.push("/login");
        return;
      }
      setAuthEmail(session.user.email || "");
      setUserId(session.user.id);
      const { data, error } = await supabase.from("users").select("*").eq("id", session.user.id).single();
      let userData = data;
      if (error || !data) {
        // app/auth/callback/page.tsx의 insert가 어떤 이유로든 안 됐을 때의 자가치유 경로 —
        // 역할 선택은 항상 /onboarding 한 곳에서만 하므로 여기도 onboarded:false로 만들어
        // 다음 요청에서 proxy.ts가 그리로 보내게 한다.
        const newUser = {
          id: session.user.id, email: session.user.email,
          name: session.user.user_metadata?.full_name || "파잡유저",
          user_type: "worker",
          profile_completed: false, trust_score: 50, grade: "bronze", is_active: true,
          onboarded: false,
        };
        await supabase.from("users").upsert(newUser);
        userData = newUser as any;
      }
      setUser(userData);
      loadResultsForType("worker", session.user.id);
      const hw = !!(localStorage.getItem(`interview_result_basic_worker`) || localStorage.getItem(`interview_result_advanced_worker`));
      const he = !!(localStorage.getItem(`interview_result_basic_employer`) || localStorage.getItem(`interview_result_advanced_employer`));

      // DB에서도 확인 (다른 기기/카카오 로그인 대비)
      const { data: dbUser } = await supabase.from("users").select("worker_result, employer_result").eq("id", session.user.id).single();
      const hwDb = !!(dbUser?.worker_result);
      const heDb = !!(dbUser?.employer_result);

      setHasWorkerInterview(hw || hwDb);
      setHasEmployerInterview(he || heDb);
      fetchLoveCalls(session.user.id, "both");

      // 매장 공고 최신본 가져오기 (미리보기용)
      const { data: eps } = await supabase.from("employer_profiles").select("*").eq("user_id", session.user.id).or("is_deleted.is.null,is_deleted.eq.false").not("business_name", "is", null).order("created_at", { ascending: false });
      setMyEmployerProfile(eps?.[0] || null);

      // 내 피드 & 북마크 로딩
      fetchMyFeeds(session.user.id);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fetchMyFeeds = async (uid: string) => {
    try {
      // 1. 내가 올린 피드 조회
      const { data: posts } = await supabase
        .from("feed_posts")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      setMyPosts(posts || []);

      // 2. 내가 저장한 피드 조회
      const res = await fetch("/api/feed/bookmark");
      const data = await res.json();
      if (data.success) {
        setSavedPosts(data.data || []);
      }
    } catch (e) {
      console.error(e);
    }
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
    if (!newComment.trim() || !selectedPost || !userId) return;
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
        setMyPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, comment_count: data.commentCount } : p));
        setSavedPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, comment_count: data.commentCount } : p));
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
        setMyPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, comment_count: data.commentCount } : p));
        setSavedPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, comment_count: data.commentCount } : p));
        setSelectedPost((p: any) => p ? { ...p, comment_count: data.commentCount } : null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLikePost = async () => {
    if (!selectedPost || !userId) return;
    try {
      const res = await fetch("/api/feed/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedPostId: selectedPost.id })
      });
      const data = await res.json();
      if (data.success) {
        setMyPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, like_count: data.likeCount } : p));
        setSavedPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, like_count: data.likeCount } : p));
        setSelectedPost((p: any) => p ? { ...p, like_count: data.likeCount } : null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeletePost = (postId: string) => {
    setConfirmModal({
      title: "게시물을 삭제할까요?",
      desc: "삭제된 게시물은 복구할 수 없습니다.",
      confirmLabel: "삭제",
      confirmColor: "var(--danger)",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/feed?postId=${postId}`, { method: "DELETE" });
          const data = await res.json();
          if (data.success) {
            setMyPosts(prev => prev.filter(p => p.id !== postId));
            setSavedPosts(prev => prev.filter(p => p.id !== postId));
            setSelectedPost(null);
            setToastMsg("게시물이 삭제되었습니다.");
            setTimeout(() => setToastMsg(""), 3000);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setConfirmModal(null);
        }
      }
    });
  };

  const [toastMsg, setToastMsg] = useState("");
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  // /settings의 "계정 삭제" 메뉴가 여기 탈퇴 플로우를 그대로 재사용하도록 쿼리 파라미터로 진입
  useEffect(() => {
    if (searchParams.get("action") === "withdraw") {
      setShowWithdrawModal(true);
      const params = new URLSearchParams(searchParamsString);
      params.delete("action");
      router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
    }
  }, [searchParams, searchParamsString, pathname, router]);

  const handleWithdraw = async (immediate = false) => {
    if (!userId) return;
    setWithdrawing(true);
    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, immediate }),
      });
      if (res.ok) {
        await supabase.auth.signOut();
        router.replace("/");
        return;
      }
      setToastMsg("탈퇴 처리 중 오류가 발생했어요. 다시 시도해주세요.");
    } catch (e) {
      console.error("탈퇴 오류:", e);
      setToastMsg("탈퇴 처리 중 오류가 발생했어요. 다시 시도해주세요.");
    }
    setWithdrawing(false);
  };

  const handleImmediateWithdrawClick = () => {
    setShowWithdrawModal(false);
    setConfirmModal({
      title: "정말 지금 바로 삭제할까요?",
      desc: "7일 유예기간 없이 즉시 처리돼요. 이후엔 취소할 수 없어요.",
      confirmLabel: "즉시 삭제",
      confirmColor: "#ef4444",
      onConfirm: () => { setConfirmModal(null); handleWithdraw(true); },
    });
  };

  const loadResultsForType = async (uType: string, uid?: string) => {
    const advanced = localStorage.getItem(`interview_result_advanced_${uType}`);
    const basic = localStorage.getItem(`interview_result_basic_${uType}`);

    if (advanced) { setAdvancedResult(JSON.parse(advanced)); setBasicResult(null); return; }
    if (basic) { setBasicResult(JSON.parse(basic)); setAdvancedResult(null); return; }

    // localStorage 없으면 DB에서
    const userId = uid || user?.id;
    if (!userId) return;
    const dbField = uType === "worker" ? "worker_result" : "employer_result";
    const { data } = await supabase.from("users").select(dbField).eq("id", userId).single();
    const dbResult = (data as any)?.[dbField];
    if (dbResult) {
      localStorage.setItem(`interview_result_basic_${uType}`, JSON.stringify(dbResult));
      setBasicResult(dbResult);
      setAdvancedResult(null);
    } else {
      setBasicResult(null);
      setAdvancedResult(null);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    const keys = Object.keys(localStorage);
    keys.forEach(key => { if (!key.startsWith("interview_result")) localStorage.removeItem(key); });
    router.push("/");
  };

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
    </main>
  );

  if (!user) return null;

  const grade = GRADE_INFO[user.grade || "bronze"];
  const mainResult = advancedResult || basicResult;
  const hasAny = !!(basicResult || advancedResult);
  const mode: "worker" | "employer" = isBoth ? activeRole : (user.user_type === "employer" ? "employer" : "worker");

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 120 }}>
      <AppHeader title="마이페이지"
        rightActions={isBoth ? <RoleToggleButton activeRole={activeRole} onChange={setActiveRole} /> : undefined} />

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px" }}>
        <div style={{ padding: "0 0px" }}>

        {/* 프로필 카드 */}
        <div style={{ ...glassProfileCard, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            {/* 아바타 + 업로드 */}
            <label style={{ cursor: "pointer", flexShrink: 0, position: "relative" }}>
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                e.target.value = "";
                const converted = await convertHeicIfNeeded(file);
                const reader = new FileReader();
                reader.onload = () => {
                  setTempImageSrc(reader.result as string);
                };
                reader.readAsDataURL(converted);
              }} />
               {(user as any).avatar_url ? (
                <img src={(user as any).avatar_url} alt="avatar"
                  style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--primary-border)" }} />
              ) : (
                <div style={{
                  width: 52, height: 52, borderRadius: "50%",
                  background: "var(--surface2)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
                  border: "2px dashed var(--primary-border)"
                }}>
                  <i className={user.user_type === "employer" ? "ti ti-building-store" : "ti ti-user"}
                    style={{ fontSize: 22, color: "var(--text-muted)" }} aria-hidden="true" />
                </div>
              )}
              <div style={{ position: "absolute", bottom: 0, right: 0, background: "var(--primary)", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>
                <i className="ti ti-pencil" style={{ fontSize: 10, color: "#fff" }} aria-hidden="true" />
              </div>
            </label>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 16 }}>{grade.emoji}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: grade.color }}>{grade.label}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>{user.nickname || user.name}</h2>
                <button onClick={() => { setNicknameInput(user.nickname || user.name || ""); setShowNicknameModal(true); }}
                  style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 10, padding: "3px 8px", borderRadius: 20, cursor: "pointer" }}>
                  닉네임 변경
                </button>
                <button onClick={() => setShowWithdrawModal(true)}
                  style={{ background: "none", border: "1px solid var(--danger-border)", color: "var(--danger)", fontSize: 10, padding: "3px 8px", borderRadius: 20, cursor: "pointer" }}>
                  탈퇴
                </button>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{authEmail}</p>
            </div>
          </div>
          <div style={{ ...cardInnerStyle, background: "var(--card-inner)", border: "1px solid var(--card-inner-border)", borderRadius: 16, padding: "14px 16px", marginBottom: 12 }}>
            {/* 등급 + 뱃지 */}
            <UserGradeBadge userId={user.id} trustScore={user.trust_score} mode={mode} />
          </div>
        </div>

        {/* 바로가기 모음 — 전부 정적 링크라 글자수 상관없이 균일한 카드 그리드로. 팀원 초대는 사장님 모드에서만 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
          <button onClick={() => router.push(`/worker/${user.id}`)}
            style={{ minHeight: 82, background: "linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(236,72,153,0.08) 100%)", border: "1px solid var(--primary-border)", borderRadius: 16, padding: "12px 8px", textAlign: "left", display: "flex", flexDirection: "column", gap: 6, cursor: "pointer" }}>
            <span style={{ fontSize: 20 }}>👤</span>
            <p style={{ fontSize: 13, fontWeight: 800, margin: 0, color: "var(--purple-text)" }}>내 이력서</p>
            <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>경력·신뢰도·활동</p>
          </button>
          <button onClick={() => router.push("/myteam")}
            style={{ minHeight: 82, background: "var(--chip-purple-bg)", border: "1px solid var(--chip-purple-border)", borderRadius: 16, padding: "12px 8px", textAlign: "left", display: "flex", flexDirection: "column", gap: 6, cursor: "pointer" }}>
            <span style={{ fontSize: 20 }}>👥</span>
            <p style={{ fontSize: 13, fontWeight: 800, margin: 0, color: "var(--purple-text)" }}>내 팀 · 소속</p>
            <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>매장·팀원 관리</p>
          </button>
          {mode === "employer" && (
            <button onClick={() => setInviteOpen(true)}
              style={{ minHeight: 82, background: "var(--chip-pink-bg)", border: "1px solid var(--chip-pink-border)", borderRadius: 16, padding: "12px 8px", textAlign: "left", display: "flex", flexDirection: "column", gap: 6, cursor: "pointer" }}>
              <span style={{ fontSize: 20 }}>🎫</span>
              <p style={{ fontSize: 13, fontWeight: 800, margin: 0, color: "var(--pink-text)" }}>팀원 초대</p>
              <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>닉네임으로 초대</p>
            </button>
          )}
          <button onClick={() => router.push("/chat")}
            style={{ minHeight: 82, background: "var(--chip-purple-bg)", border: "1px solid var(--chip-purple-border)", borderRadius: 16, padding: "12px 8px", textAlign: "left", display: "flex", flexDirection: "column", gap: 6, cursor: "pointer" }}>
            <span style={{ fontSize: 20 }}>💬</span>
            <p style={{ fontSize: 13, fontWeight: 800, margin: 0, color: "var(--purple-text)" }}>전체 채팅 보관함</p>
            <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>전체 대화 목록</p>
          </button>
          <button onClick={() => router.push("/payslip/list")}
            style={{ minHeight: 82, background: "var(--success-bg)", border: "1px solid var(--success-border)", borderRadius: 16, padding: "12px 8px", textAlign: "left", display: "flex", flexDirection: "column", gap: 6, cursor: "pointer" }}>
            <span style={{ fontSize: 20 }}>📋</span>
            <p style={{ fontSize: 13, fontWeight: 800, margin: 0, color: "var(--success)" }}>임금 명세서 보관함</p>
            <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>발행·수령 내역</p>
          </button>
          <button onClick={() => router.push(`/mypage/daeta-history?tab=${mode}`)}
            style={{ minHeight: 82, background: "var(--warning-bg)", border: "1px solid var(--warning-border)", borderRadius: 16, padding: "12px 8px", textAlign: "left", display: "flex", flexDirection: "column", gap: 6, cursor: "pointer" }}>
            <span style={{ fontSize: 20 }}>🔄</span>
            <p style={{ fontSize: 13, fontWeight: 800, margin: 0, color: "var(--warning)" }}>대타 이력</p>
            <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>정산 완료 기록</p>
          </button>
          {mode === "worker" && (
            <button onClick={() => router.push("/mypage/applications?tab=worker")}
              style={{ minHeight: 82, background: "var(--chip-pink-bg)", border: "1px solid var(--chip-pink-border)", borderRadius: 16, padding: "12px 8px", textAlign: "left", display: "flex", flexDirection: "column", gap: 6, cursor: "pointer" }}>
              <span style={{ fontSize: 20 }}>📋</span>
              <p style={{ fontSize: 13, fontWeight: 800, margin: 0, color: "var(--pink-text)" }}>지원 현황</p>
              <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>받은 제안·일반 지원</p>
            </button>
          )}
        </div>

        {/* 로그아웃 */}
        <button onClick={handleLogout}
          style={{ ...btnDanger, borderRadius: 16 }}>
          로그아웃
        </button>

        {/* 푸터 */}
        <div style={{ textAlign: "center", padding: "16px 0 0", display: "flex", justifyContent: "center", gap: 16 }}>
          <span onClick={() => router.push("/privacy")} style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>개인정보처리방침</span>
          <span style={{ color: "var(--border)" }}>|</span>
          <span onClick={() => router.push("/terms")} style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>서비스 이용약관</span>
          <span style={{ color: "var(--border)" }}>|</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>파잡 v1.0</span>
        </div>

        {/* 닉네임 변경 모달 */}
        {showWithdrawModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
            <div style={{ ...modalSheet, margin: "0 auto" }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>정말 탈퇴하시겠어요?</h3>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px", lineHeight: 1.7 }}>
                신청 즉시 공고/프로필은 비공개 처리되고, <strong style={{ color: "var(--text)" }}>7일 유예기간</strong> 동안은 로그인해도 취소 화면 말고는 다른 기능을 쓸 수 없어요. 7일 후엔 아래와 같이 처리돼요.
              </p>
              <div style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
                {[
                  "프로필·연락처·성향분석 결과 → 익명 처리",
                  "등록한 공고/대타 공고 → 비공개 처리 (신청 즉시)",
                  "계약서·임금명세서·근태기록 → 관련 법령에 따라 보관 후 파기",
                  "채팅·AI 상담 기록 → 상대방 보호를 위해 보관될 수 있음",
                ].map(item => (
                  <div key={item} style={{ fontSize: 12, color: "var(--danger)", marginBottom: 4 }}>✗ {item}</div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowWithdrawModal(false)}
                  style={{ ...btnSecondary, flex: 1 }}>
                  취소
                </button>
                <button onClick={() => handleWithdraw()} disabled={withdrawing}
                  style={{ ...btnDanger, flex: 1 }}>
                  {withdrawing ? "처리 중..." : "탈퇴 신청"}
                </button>
              </div>
              <button onClick={handleImmediateWithdrawClick} disabled={withdrawing}
                style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 11, textDecoration: "underline", padding: "12px 0 0", width: "100%", cursor: "pointer" }}>
                유예기간 없이 지금 바로 삭제할게요
              </button>
            </div>
          </div>
        )}

        {/* 닉네임 변경 모달 (입력 → 확인 인라인 전환) */}
        {showNicknameModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
            <div style={{ ...modalSheet, maxWidth: 640, margin: "0 auto", transition: "all 0.2s" }}>
              {!showNicknameConfirm ? (
                <>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>닉네임 변경</h3>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 14px" }}>다른 사용자에게 표시되는 이름이에요</p>
                  <input
                    type="text"
                    value={nicknameInput}
                    onChange={e => setNicknameInput(e.target.value.slice(0, 20))}
                    placeholder="새 닉네임 입력 (최대 20자)"
                    autoFocus
                    style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--primary-border)", borderRadius: 12, padding: "12px 16px", color: "var(--text)", fontSize: 15, outline: "none", boxSizing: "border-box", marginBottom: 6 }}
                  />
                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 16px", textAlign: "right" }}>{nicknameInput.length}/20</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setShowNicknameModal(false)} style={{ ...btnSecondary, flex: 1 }}>취소</button>
                    <button onClick={async () => {
                      const next = nicknameInput.trim();
                      if (!next || !user) return;
                      const { data: dup } = await supabase.from("users")
                        .select("id").ilike("nickname", next).neq("id", user.id).limit(1);
                      if (dup && dup.length > 0) { setToastMsg("이미 사용 중인 닉네임이에요"); return; }
                      setShowNicknameConfirm(true);
                    }} style={{ ...btnPrimary, flex: 1 }}>변경하기</button>
                  </div>
                </>
              ) : (
                <>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>이 닉네임으로 변경할까요?</h3>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>변경 후에도 다시 바꿀 수 있어요</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface2)", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
                    <span style={{ flex: 1, fontSize: 14, color: "var(--text-muted)", textDecoration: "line-through" }}>{user?.nickname || user?.name}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: 18 }}>→</span>
                    <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: "var(--text)", textAlign: "right" }}>{nicknameInput.trim()}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setShowNicknameConfirm(false)} style={{ ...btnSecondary, flex: 1 }}>돌아가기</button>
                    <button onClick={async () => {
                      const next = nicknameInput.trim();
                      if (!next || !user) return;
                      await supabase.from("users").update({ nickname: next }).eq("id", user.id);
                      setUser(prev => prev ? { ...prev, nickname: next } : prev);
                      setShowNicknameConfirm(false);
                      setShowNicknameModal(false);
                      setToastMsg("닉네임이 변경됐어요!");
                    }} style={{ ...btnPrimary, flex: 1 }}>확인</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

      {tempImageSrc && (
        <ImageCropModal
          imageSrc={tempImageSrc}
          aspect={1}
          isCircle={true}
          onClose={() => setTempImageSrc(null)}
          onCrop={handleCropComplete}
        />
      )}

        {/* 매칭 성사 모달 */}
      {/* 토스트 메시지 */}
      {toastMsg && (
        <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", background: "rgba(24,24,27,0.95)", border: "1px solid var(--border)", color: "#fff", fontSize: 13, padding: "12px 20px", borderRadius: 20, zIndex: 200, whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
          {toastMsg}
        </div>
      )}

        {matchModal && (
          <MatchSuccessModal
            matchId={matchModal.matchId}
            router={router}
            onClose={() => setMatchModal(null)}
            onToast={(msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(""), 3000); }}
          />
        )}

        {/* 다시하기 모달 */}
        {showRetryModal && (
          <ConfirmModal
            title="인터뷰 다시 하기"
            desc="기존 결과가 삭제되고 새로 시작돼요. 이번엔 다른 스타일로 질문할게요 😊"
            confirmLabel="다시 하기 →"
            onConfirm={() => {
              localStorage.removeItem(`interview_result_basic_${viewType}`);
              localStorage.removeItem(`interview_result_advanced_${viewType}`);
              setShowRetryModal(false);
              router.push(`/interview?type=${viewType}&retry=true`);
            }}
            onCancel={() => setShowRetryModal(false)}
          />
        )}

        {/* 공통 확인 모달 */}
        {confirmModal && (
          <ConfirmModal
            title={confirmModal.title}
            desc={confirmModal.desc}
            confirmLabel={confirmModal.confirmLabel}
            confirmColor={confirmModal.confirmColor}
            onConfirm={confirmModal.onConfirm}
            onCancel={() => setConfirmModal(null)}
          />
        )}
        {/* 📸 피드 및 북마크 탭 섹션 */}
        <div style={{ marginTop: 24, background: "var(--surface2)", backdropFilter: "blur(12px)", border: "1px solid var(--border)", borderRadius: 20, padding: 20 }}>
          <div style={{ display: "flex", gap: 12, borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 14 }}>
            <button onClick={() => setFeedTab("posts")}
              style={{ paddingBottom: 6, borderBottom: feedTab === "posts" ? "2px solid var(--primary)" : "none", color: feedTab === "posts" ? "var(--text)" : "var(--text-muted)", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "none", borderLeft: "none", borderRight: "none", borderTop: "none" }}>
              내 스토리 ({myPosts.length})
            </button>
            <button onClick={() => setFeedTab("saved")}
              style={{ paddingBottom: 6, borderBottom: feedTab === "saved" ? "2px solid var(--primary)" : "none", color: feedTab === "saved" ? "var(--text)" : "var(--text-muted)", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "none", borderLeft: "none", borderRight: "none", borderTop: "none" }}>
              저장됨 ({savedPosts.length})
            </button>
          </div>

          {feedTab === "posts" ? (
            myPosts.length === 0 ? (
              <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)", padding: "20px 0" }}>올린 피드가 없습니다.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {myPosts.map(post => (
                  <button key={post.id} onClick={() => handlePostClick(post)}
                    className="aspect-square bg-zinc-900 rounded-xl relative overflow-hidden group focus:outline-none border border-border/20">
                    {post.media_urls && post.media_urls[0] && isVideoUrl(post.media_urls[0]) ? (
                      <div className="w-full h-full relative">
                        <video src={post.media_urls[0].includes("#") ? post.media_urls[0] : `${post.media_urls[0]}#t=0.1`} preload="metadata" playsInline muted className="w-full h-full object-cover" />
                        <div className="absolute top-1.5 right-1.5 bg-black/60 w-5 h-5 rounded-full flex items-center justify-center">
                          <i className="ti ti-video text-white text-[10px]" aria-hidden="true" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full relative">
                        <img src={post.media_urls?.[0] || ""} alt="my-post" className="w-full h-full object-cover" />
                        {post.media_urls && post.media_urls.length > 1 && (
                          <div className="absolute top-1.5 right-1.5 bg-black/60 w-5 h-5 rounded-full flex items-center justify-center">
                            <i className="ti ti-layers-difference text-white text-[10px]" aria-hidden="true" />
                          </div>
                        )}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center gap-2.5 text-xs font-bold text-white">
                      <span>❤️ {post.like_count || 0}</span>
                      <span>💬 {post.comment_count || 0}</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : (
            savedPosts.length === 0 ? (
              <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)", padding: "20px 0" }}>저장된 피드가 없습니다.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {savedPosts.map(post => (
                  <button key={post.id} onClick={() => handlePostClick(post)}
                    className="aspect-square bg-zinc-900 rounded-xl relative overflow-hidden group focus:outline-none border border-border/20">
                    {post.media_urls && post.media_urls[0] && isVideoUrl(post.media_urls[0]) ? (
                      <div className="w-full h-full relative">
                        <video src={post.media_urls[0].includes("#") ? post.media_urls[0] : `${post.media_urls[0]}#t=0.1`} preload="metadata" playsInline muted className="w-full h-full object-cover" />
                        <div className="absolute top-1.5 right-1.5 bg-black/60 w-5 h-5 rounded-full flex items-center justify-center">
                          <i className="ti ti-video text-white text-[10px]" aria-hidden="true" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full relative">
                        <img src={post.media_urls?.[0] || ""} alt="saved-post" className="w-full h-full object-cover" />
                        {post.media_urls && post.media_urls.length > 1 && (
                          <div className="absolute top-1.5 right-1.5 bg-black/60 w-5 h-5 rounded-full flex items-center justify-center">
                            <i className="ti ti-layers-difference text-white text-[10px]" aria-hidden="true" />
                          </div>
                        )}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center gap-2.5 text-xs font-bold text-white">
                      <span>❤️ {post.like_count || 0}</span>
                      <span>💬 {post.comment_count || 0}</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}
        </div>

      </div>
      </div>

      {/* 피드 라이트박스 상세 모달 */}
      {selectedPost && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl border border-border shadow-2xl w-full max-w-sm overflow-hidden flex flex-col h-[80vh] max-h-[80vh]">
            {/* 헤더 */}
            <div className="flex justify-between items-center px-4 py-3 border-b border-border bg-surface2/40">
              <span className="font-bold text-xs text-text-sub">상세 보기</span>
              <div className="flex items-center gap-2">
                {selectedPost.user_id === userId && (
                  <button onClick={() => handleDeletePost(selectedPost.id)} className="text-text-muted hover:text-red-500 mr-2 focus:outline-none">
                    <i className="ti ti-trash text-base" aria-hidden="true" />
                  </button>
                )}
                <button onClick={() => setSelectedPost(null)} className="text-text-muted hover:text-text focus:outline-none">
                  <i className="ti ti-x text-lg" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* 바디 (스크롤 가능) */}
            <div className="flex-1 overflow-y-auto">
              {/* 미디어 */}
              {selectedPost.media_urls && selectedPost.media_urls.length > 0 && (
                <div className="relative w-full aspect-square flex-shrink-0 bg-black overflow-hidden flex items-center justify-center">
                  <div className="flex w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-none">
                    {selectedPost.media_urls.map((url: string, idx: number) => {
                      const isVid = isVideoUrl(url);
                      return (
                        <div key={idx} className="w-full h-full flex-shrink-0 snap-start flex items-center justify-center relative bg-black">
                          {isVid ? (
                            <video src={url} controls playsInline className="w-full h-full object-contain" />
                          ) : (
                            <img src={url} alt={`media-${idx}`} className="w-full h-full object-contain" />
                          )}
                        </div>
                      );
                    })}
                  </div>
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
                            <i className="ti ti-user text-xs text-text-muted" aria-hidden="true" />
                          )}
                        </div>
                        <div className="flex-1 bg-surface rounded-xl px-2.5 py-1.5 shadow-sm border border-border relative">
                          <div className="flex justify-between items-center mb-0.5">
                            <span className="font-bold text-[10px] text-text">{comment.authorName}</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[8px] text-text-muted">
                                {comment.created_at ? new Date(comment.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) : ""}
                              </span>
                              {comment.user_id === userId && (
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
            {userId && (
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
      )}

      <InviteBottomSheet isOpen={inviteOpen} onClose={() => setInviteOpen(false)} />
    </main>
  );
}

export default function MyPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
      </div>
    }>
      <MyPageContent />
    </Suspense>
  );
}
