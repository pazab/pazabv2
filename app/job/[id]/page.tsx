"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useToast } from "@/lib/useToast";
import { supabase } from "@/lib/supabase";
import { getMatchLevel, EMPLOYER_TYPE_INFO } from "@/lib/utils";
import { BADGE_DEFS, getGrade } from "@/lib/trustScore";
import { btnPrimary, btnSecondary, modalOverlay, modalSheet } from "@/lib/styles";

interface TypeInfo {
  emoji: string;
  desc?: string;
  tagline?: string;
  color: string;
  traits: string[];
  good: string;
  bad: string;
}

function getEmployerTypeFromBig5(big5: Record<string, number> | null): TypeInfo | null {
  if (!big5) return null;
  const { conscientiousness, extraversion, agreeableness } = big5;
  const traits: string[] = [];
  let desc = "", good = "", bad = "", color = "#c4b5fd";
  if (conscientiousness >= 4) { traits.push("꼼꼼한 관리"); desc += "체계적이고 "; good += "성실하고 책임감 있는 "; }
  else { traits.push("자율적 환경"); desc += "자율적이고 "; good += "스스로 판단하는 "; }
  if (extraversion >= 4) { traits.push("활발한 소통"); desc += "소통 잘 되는 "; color = "#f9a8d4"; }
  else { traits.push("조용한 환경"); desc += "차분한 "; color = "#93c5fd"; }
  if (agreeableness >= 4) { traits.push("배려하는 분위기"); bad = "차갑고 무뚝뚝한 알바생"; }
  else { traits.push("성과 중심"); bad = "느긋하게 일하는 알바생"; }
  desc += "분위기예요";
  return { desc, color, traits: traits.slice(0, 3), good: good + "알바생", bad, tagline: desc, emoji: "👔" };
}

function HeroScoreBadge({ score }: { score: number }) {
  const level = getMatchLevel(score);
  return (
    <div style={{
      background: "rgba(0,0,0,0.45)", backdropFilter: "blur(12px)",
      border: `1px solid ${level.color}40`, borderRadius: 12,
      padding: "5px 10px", display: "flex", alignItems: "center", gap: 5,
    }}>
      <span style={{ fontSize: 15, fontWeight: 900, color: level.color }}>{score}</span>
      <span style={{ fontSize: 9, color: level.color, fontWeight: 700 }}>{level.emoji} {level.label}</span>
    </div>
  );
}

function MatchScoreSection({ score }: { score: number }) {
  const level = getMatchLevel(score);
  return (
    <div style={{ padding: "20px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700, margin: "0 0 12px", letterSpacing: "0.5px" }}>💕 이 매장과의 궁합</p>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ fontSize: 56, fontWeight: 900, color: level.color, lineHeight: 1, letterSpacing: "-2px" }}>{score}</div>
        <div style={{ flex: 1 }}>
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 6, height: 8, marginBottom: 8, overflow: "hidden" }}>
            <div style={{ background: `linear-gradient(90deg, ${level.color}80, ${level.color})`, height: "100%", borderRadius: 6, width: `${score}%`, transition: "width 0.8s ease" }} />
          </div>
          <p style={{ fontSize: 14, color: level.color, margin: 0, fontWeight: 700 }}>{level.emoji} {level.label}</p>
        </div>
      </div>
    </div>
  );
}

function HexacoSection({ hexacoData }: { hexacoData: Record<string, number> }) {
  const LABELS = [
    { key: "honesty", label: "정직성", emoji: "🤝", desc: "약속 이행" },
    { key: "emotionality", label: "정서성", emoji: "💭", desc: "스트레스 대처" },
    { key: "extraversion", label: "외향성", emoji: "⚡", desc: "소통 스타일" },
    { key: "agreeableness", label: "원만성", emoji: "🕊️", desc: "갈등 해결" },
    { key: "conscientiousness", label: "성실성", emoji: "📋", desc: "규칙·책임감" },
    { key: "openness", label: "개방성", emoji: "🌟", desc: "유연성" },
  ];
  return (
    <div>
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 12px", fontWeight: 600 }}>🧠 HEXACO 분석</p>
      {LABELS.map(item => {
        const val = Number(hexacoData[item.key] || 3);
        const color = val >= 4.5 ? "#86efac" : val >= 3.5 ? "#8b5cf6" : val >= 2.5 ? "#fbbf24" : "#f87171";
        return (
          <div key={item.key} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
              <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>
                {item.emoji} {item.label} <span style={{ opacity: 0.6 }}>{item.desc}</span>
              </span>
              <span style={{ color, fontWeight: 700 }}>{val.toFixed(1)}</span>
            </div>
            <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 6, overflow: "hidden" }}>
              <div style={{ background: `linear-gradient(90deg, ${color}60, ${color})`, height: "100%", borderRadius: 4, width: `${(val / 5) * 100}%`, transition: "width 0.8s ease" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { showToast, ToastUI } = useToast();
  const [job, setJob] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [existingMatch, setExistingMatch] = useState<Record<string, unknown> | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [hasWorkerProfile, setHasWorkerProfile] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showJobMenu, setShowJobMenu] = useState(false);
  const [teamCompat, setTeamCompat] = useState<Record<string, unknown> | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [navHidden, setNavHidden] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);

  useEffect(() => {
    let lastY = 0;
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY > 50 && currentY - lastY > 30) setNavHidden(true);
      else if (currentY - lastY < -30 || currentY < 50) setNavHidden(false);
      lastY = currentY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const [showBotChat, setShowBotChat] = useState(false);
  const [botMessages, setBotMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [botInput, setBotInput] = useState("");
  const [botSending, setBotSending] = useState(false);
  const botBottomRef = useRef<HTMLDivElement>(null);
  const MAX_BOT_TURNS = 10;
  const botUserTurns = botMessages.filter(m => m.role === "user").length;
  const isBotMaxReached = botUserTurns >= MAX_BOT_TURNS;

  useEffect(() => { botBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [botMessages]);
  useEffect(() => { init(); }, [id]);

  const openBotChat = () => {
    if (botMessages.length === 0 && job) {
      setBotMessages([{ role: "assistant", content: `안녕하세요! 저는 ${String(job.business_name || "매장")} 사장님을 대신하는 파잡봇이에요 🤖\n궁금한 점이 있으면 편하게 물어보세요!` }]);
    }
    setShowBotChat(true);
  };

  const sendBotMessage = async (overrideText?: string) => {
    const text = overrideText || botInput.trim();
    if (!text || botSending || isBotMaxReached) return;
    setBotInput("");
    const newMessages = [...botMessages, { role: "user" as const, content: text }];
    setBotMessages(newMessages);
    setBotSending(true);
    try {
      const res = await fetch("/api/pre-meet", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, botType: "employer", botProfile: job, userId }),
      });
      const data = await res.json();
      setBotMessages(prev => [...prev, { role: "assistant", content: data.success ? data.message : "잠시 오류가 발생했어요 😊" }]);
    } catch {
      setBotMessages(prev => [...prev, { role: "assistant", content: "잠시 오류가 발생했어요 😊" }]);
    }
    setBotSending(false);
  };

  const init = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    let role: string | null = null;
    if (session) {
      setIsLoggedIn(true);
      setUserId(session.user.id);
      const { data: u } = await supabase.from("users").select("user_type").eq("id", session.user.id).maybeSingle();
      if (u) role = u.user_type;
    }
    await fetchJob(session?.user.id, role);
  };

  const fetchJob = async (uid?: string, role?: string | null) => {
    let data: Record<string, unknown> | null = null;
    // jobs 테이블 먼저 시도 (새 구조)
    const { data: jobRow } = await supabase.from("jobs")
      .select("*, employer_profiles!inner(id, business_name, business_type, region, address, address_detail, image_url, image_urls, video_url, biz_reg_number, ceo_name, biz_tel, lat, lng)")
      .eq("id", id).maybeSingle();
    if (jobRow) {
      const ep = jobRow.employer_profiles as Record<string, unknown>;
      data = { ...ep, ...jobRow, id: jobRow.id, employer_profile_id: ep?.id } as Record<string, unknown>;
    } else {
      // 구 employer_profiles.id 로 직접 진입한 경우 fallback
      const { data: byId } = await supabase.from("employer_profiles").select("*").eq("id", id).maybeSingle();
      if (byId) {
        data = byId as Record<string, unknown>;
        const { data: latestJob } = await supabase.from("jobs").select("id, wage, work_days, work_hours, is_active, job_status, hexaco_data, tagline, employer_type, best_matches, worst_matches, caution")
          .eq("employer_profile_id", (byId as Record<string,unknown>).id as string)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (latestJob) data = { ...data, ...latestJob, employer_profile_id: (byId as Record<string,unknown>).id, id: latestJob.id ?? (byId as Record<string,unknown>).id };
      } else {
        const { data: byUserId } = await supabase.from("employer_profiles").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        data = byUserId as Record<string, unknown>;
      }
    }
    if (data) {
      const { data: userData } = await supabase.from("users").select("trust_score, nickname, avatar_url").eq("id", data.user_id).maybeSingle();
      const { data: badgeData } = await supabase.from("user_badges").select("badge_key").eq("user_id", data.user_id);
      const employerBadges = (badgeData || []).filter((b: Record<string, string>) => BADGE_DEFS[b.badge_key]).map((b: Record<string, string>) => ({ key: b.badge_key, ...BADGE_DEFS[b.badge_key] }));
      data = { ...data, trust_score: userData?.trust_score || 0, employer_badges: employerBadges, employer_nickname: userData?.nickname || null, employer_avatar: userData?.avatar_url || null };
      setJob(data);
      setLikeCount(Number(data.like_count || 0));

      if (uid) {
        if (uid === data.user_id || role === "admin") setIsOwner(true);
        const { data: wp } = await supabase.from("worker_profiles").select("id").eq("user_id", uid).eq("is_public", true).eq("is_active", true).neq("job_status", "completed").maybeSingle();
        setHasWorkerProfile(!!wp);
        const { data: likeData } = await supabase.from("job_likes").select("id").eq("user_id", uid).eq("target_id", data.id).eq("target_type", "employer").maybeSingle();
        setIsLiked(!!likeData);
        if (uid !== data.user_id) {
          try {
            const tcRes = await fetch(`/api/team-compat?employerUserId=${data.user_id}&targetUserId=${uid}`);
            const tcData = await tcRes.json();
            if (tcData.success) setTeamCompat(tcData);
          } catch {}
        }
        const { data: match } = await supabase.from("matches").select("id, progress_status, employer_id, worker_id, employer_interest, worker_interest, match_score")
          .or(`job_id.eq.${data.id},employer_profile_id.eq.${data.employer_profile_id ?? data.id}`)
          .eq("worker_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (match) setExistingMatch({ ...match, isReceived: match.employer_interest === true });
        if (match?.match_score) {
          setMatchScore(Number(match.match_score));
        } else {
          try {
            const res = await fetch("/api/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: uid, userType: "worker" }) });
            const matchData = await res.json();
            if (matchData.success) {
              const found = matchData.results?.find((r: Record<string, unknown>) => r.user_id === data!.user_id || r.id === data!.user_id || r.id === id);
              if (found) setMatchScore(Number(found.match_score));
            }
          } catch {}
        }
      }
    }
    setLoading(false);
  };

  const handleLike = async () => {
    if (!userId) { router.push("/login"); return; }
    const action = isLiked ? "unlike" : "like";
    setIsLiked(!isLiked);
    setLikeCount(prev => prev + (isLiked ? -1 : 1));
    await fetch("/api/likes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, targetId: job?.id, targetType: "employer", action }) });
  };

  const handleInterest = async () => {
    if (!isLoggedIn || !userId) { localStorage.setItem("login_redirect", window.location.pathname); router.push("/login"); return; }
    if (existingMatch && (existingMatch.progress_status === "cancelled" || existingMatch.progress_status === "rejected")) { setShowConfirm(true); return; }
    await sendLoveCall();
  };

  const sendLoveCall = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/lovecall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employerId: job?.user_id, workerId: userId, matchScore: matchScore || 0, senderType: "worker", employerProfileId: job?.employer_profile_id ?? job?.id, jobId: job?.id }) });
      const data = await res.json();
      if (data.success) { setSent(true); setShowConfirm(false); }
      else showToast(data.error || "오류가 발생했어요", "error");
    } catch { showToast("오류가 발생했어요", "error"); }
    setSending(false);
  };

  if (loading) return <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "var(--text-muted)" }}>불러오는 중...</p></main>;
  if (!job) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>공고를 찾을 수 없어요</p>
        <button onClick={() => router.back()} style={{ background: "var(--primary)", border: "none", color: "#fff", padding: "10px 20px", borderRadius: 12, cursor: "pointer" }}>돌아가기</button>
      </div>
    </main>
  );

  const rawTypeInfo = EMPLOYER_TYPE_INFO[String(job.employer_type || "")];
  const typeInfo: TypeInfo | null = rawTypeInfo ? { ...rawTypeInfo, desc: rawTypeInfo.tagline } : getEmployerTypeFromBig5(job.bio5_data as Record<string, number> | null);
  const tags = Array.isArray(job.tags) ? job.tags as string[] : JSON.parse(String(job.tags || "[]")) as string[];
  const imageUrl = job.image_url as string | null;
  const imageUrls = job.image_urls as string[] | null;
  const videoUrl = job.video_url as string | null;

  const mediaItems: { type: "image" | "video"; url: string }[] = [];
  if (videoUrl) {
    mediaItems.push({ type: "video", url: videoUrl });
  }
  if (Array.isArray(imageUrls) && imageUrls.length > 0) {
    imageUrls.forEach(url => mediaItems.push({ type: "image", url }));
  } else if (imageUrl) {
    mediaItems.push({ type: "image", url: imageUrl });
  }

  const hasMedia = mediaItems.length > 0;
  const activeMedia = mediaItems[activeMediaIndex];

  const grade = getGrade(Number(job.trust_score || 50));
  const status = sent ? "sent" : String(existingMatch?.progress_status || "");
  const isReceived = existingMatch?.isReceived === true;
  const hexacoData = job.hexaco_data as Record<string, number> | null;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 150, maxWidth: 480, margin: "0 auto" }}>
      {ToastUI}

      {/* 히어로 */}
      <div style={{ position: "relative", height: hasMedia ? 360 : 280, background: "#000", overflow: "hidden" }}>
        {hasMedia ? (
          activeMedia.type === "video" ? (
            <video src={activeMedia.url} controls muted autoPlay loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ position: "absolute", inset: 0, background: `url(${activeMedia.url}) center/cover no-repeat` }} />
          )
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, #1a1035 0%, #2d1b6e 50%, #1e1040 100%)" }} />
        )}
        
        <div style={{ position: "absolute", inset: 0, background: hasMedia ? "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.85) 100%)" : "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.7) 100%)", pointerEvents: "none" }} />
        {!hasMedia && <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.04) 0%, transparent 60%)", pointerEvents: "none" }} />}

        {mediaItems.length > 1 && (
          <>
            <button onClick={() => setActiveMediaIndex(prev => (prev - 1 + mediaItems.length) % mediaItems.length)}
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 36, height: 36, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, zIndex: 10 }}>
              ‹
            </button>
            <button onClick={() => setActiveMediaIndex(prev => (prev + 1) % mediaItems.length)}
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 36, height: 36, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, zIndex: 10 }}>
              ›
            </button>
            <div style={{ position: "absolute", bottom: 16, right: 16, background: "rgba(0,0,0,0.6)", borderRadius: 12, padding: "4px 8px", fontSize: 11, color: "#fff", fontWeight: 600, zIndex: 10 }}>
              {activeMediaIndex + 1} / {mediaItems.length}
            </div>
          </>
        )}

        {/* 상단 컨트롤 */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "48px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={() => router.back()} style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)", border: "none", borderRadius: "50%", width: 36, height: 36, color: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
          <div style={{ display: "flex", gap: 8 }}>
            {matchScore != null && <HeroScoreBadge score={matchScore} />}
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowJobMenu(!showJobMenu)} style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)", border: "none", borderRadius: "50%", width: 36, height: 36, color: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>⋯</button>
              {showJobMenu && (
                <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", width: 160, boxShadow: "0 8px 24px rgba(0,0,0,0.3)", zIndex: 50 }}>
                  <button onClick={() => { setShowJobMenu(false); showToast("신고가 접수됐어요"); }} style={{ width: "100%", background: "none", border: "none", padding: "12px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "#fbbf24", borderBottom: "1px solid var(--border)" }}>🚨 신고하기</button>
                  <button onClick={() => { setShowJobMenu(false); showToast("차단됐어요"); }} style={{ width: "100%", background: "none", border: "none", padding: "12px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "#f87171" }}>🚫 차단하기</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 히어로 하단 */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 20px 20px" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            {!!job.available_now && <span style={{ fontSize: 10, fontWeight: 800, background: "rgba(34,197,94,0.9)", color: "#fff", padding: "3px 8px", borderRadius: 8 }}>즉시채용</span>}
            <span style={{ fontSize: 10, background: "rgba(255,255,255,0.15)", backdropFilter: "blur(4px)", color: "#fff", padding: "3px 8px", borderRadius: 8 }}>{String(job.business_type || "")}</span>
            <span style={{ fontSize: 10, background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)", padding: "3px 8px", borderRadius: 8 }}>{grade.emoji} {grade.name}</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: "0 0 4px", color: "#fff", letterSpacing: "-0.5px", lineHeight: 1.2 }}>{String(job.business_name || "")}</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: "0 0 10px" }}>📍 {String(job.region || "").split(" ").slice(0, 3).join(" ")}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => router.push(`/employer/${job.user_id}`)} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 20, padding: "6px 12px", cursor: "pointer" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: job.employer_avatar ? `url(${job.employer_avatar}) center/cover` : "linear-gradient(135deg,#ec4899,#be185d)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>
                {!job.employer_avatar && "🏪"}
              </div>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.9)", fontWeight: 600 }}>{String(job.employer_nickname || "사장님")} 프로필 보기 →</span>
            </button>
            {!!job.employer_profile_id && (
              <button onClick={() => router.push(`/store/${job.employer_profile_id}`)} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(139,92,246,0.25)", backdropFilter: "blur(8px)", border: "1px solid rgba(139,92,246,0.4)", borderRadius: 20, padding: "6px 12px", cursor: "pointer" }}>
                <span style={{ fontSize: 12, color: "#fff", fontWeight: 700 }}>🏪 매장 홈 보기 →</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div style={{ padding: "0 20px" }}>

        {/* 핵심 조건 */}
        <div style={{ padding: "20px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { icon: "₩", label: "시급", value: `${Number(job.wage || 0).toLocaleString()}원`, sub: job.wage_negotiable ? "협의 가능" : null, color: "#fca5a5" },
              { icon: "📅", label: "근무요일", value: String(job.work_days || "협의"), sub: job.days_negotiable ? "협의 가능" : null, color: null },
              { icon: "⏰", label: "근무시간", value: String(job.work_hours || "협의"), sub: null, color: null },
              { icon: "👥", label: "모집인원", value: `${job.staff_count || 1}명`, sub: null, color: null },
            ].map(item => (
              <div key={item.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "12px 14px" }}>
                <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 4px", fontWeight: 600 }}>{item.icon} {item.label}</p>
                <p style={{ fontSize: 16, fontWeight: 800, margin: 0, color: item.color || "var(--text)" }}>{item.value}</p>
                {item.sub && <p style={{ fontSize: 10, color: "#c4b5fd", margin: "3px 0 0" }}>💬 {item.sub}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* 혜택 */}
        {(!!job.meal_provided || !!job.parking || tags.length > 0) && (
          <div style={{ padding: "20px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700, margin: "0 0 10px", letterSpacing: "0.5px" }}>✨ 혜택 & 복지</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!!job.meal_provided && <span style={{ fontSize: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-muted)", padding: "6px 12px", borderRadius: 20 }}>🍱 식사 제공</span>}
              {!!job.parking && <span style={{ fontSize: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-muted)", padding: "6px 12px", borderRadius: 20 }}>🚗 주차 가능</span>}
              {tags.map((tag: string) => <span key={tag} style={{ fontSize: 12, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)", color: "#c4b5fd", padding: "6px 12px", borderRadius: 20 }}>#{tag}</span>)}
            </div>
          </div>
        )}

        {/* 궁합 */}
        {matchScore != null && <MatchScoreSection score={matchScore} />}

        {/* 비로그인 궁합 유도 */}
        {matchScore == null && !isLoggedIn && (
          <div style={{ margin: "20px 0", background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(236,72,153,0.06))", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 16, padding: 16, textAlign: "center" }}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>🔒 궁합 점수를 보고 싶다면?</p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>성향 분석 후 가입하면 공개돼요</p>
            <button onClick={() => router.push("/interview")} style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", border: "none", color: "#fff", fontWeight: 700, padding: "10px 20px", borderRadius: 12, cursor: "pointer", fontSize: 13 }}>🔬 성향 분석 하러가기 →</button>
          </div>
        )}

        {/* 사장님 성향 */}
        {!!job.employer_type && typeInfo && (
          <div style={{ padding: "20px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700, margin: "0 0 12px", letterSpacing: "0.5px" }}>👔 사장님 성향</p>
            <div style={{ background: `${typeInfo.color}12`, border: `1px solid ${typeInfo.color}30`, borderRadius: 16, padding: "14px 16px", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 30 }}>{typeInfo.emoji}</span>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 800, margin: "0 0 2px", color: typeInfo.color }}>{String(job.employer_type)}</p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{String(job.tagline || typeInfo.desc || typeInfo.tagline || "")}</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {typeInfo.traits.map((t: string) => <span key={t} style={{ fontSize: 11, background: "rgba(0,0,0,0.2)", color: "var(--text-muted)", padding: "3px 8px", borderRadius: 20 }}>{t}</span>)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <p style={{ fontSize: 12, color: "#86efac", margin: 0 }}>✓ 잘 맞아요: {typeInfo.good}</p>
                <p style={{ fontSize: 12, color: "#fca5a5", margin: 0 }}>· 이런 환경: {typeInfo.bad}</p>
              </div>
            </div>
            {hexacoData && <HexacoSection hexacoData={hexacoData} />}
            {!existingMatch && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)", borderRadius: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <span>💌</span>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>러브콜을 주고받으면 찰떡 알바생 유형이 공개돼요</p>
              </div>
            )}
            <button onClick={openBotChat} style={{ width: "100%", marginTop: 12, background: "rgba(236,72,153,0.08)", border: "1px solid rgba(236,72,153,0.25)", color: "#f9a8d4", fontWeight: 600, padding: "11px", borderRadius: 12, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              🤖 AI 봇에게 물어보기
            </button>
          </div>
        )}

        {/* 팀 궁합 */}
        {teamCompat && !isOwner && Number((teamCompat as Record<string, unknown>).totalScore || 0) > 0 && (
          <TeamCompatSection teamCompat={teamCompat} />
        )}

        {/* 사장님 뱃지 */}
        {Array.isArray(job.employer_badges) && job.employer_badges.length > 0 && (
          <div style={{ padding: "20px 0" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700, margin: "0 0 10px", letterSpacing: "0.5px" }}>🏅 사장님 뱃지</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(job.employer_badges as Record<string, string>[]).map(b => (
                <span key={b.key} style={{ fontSize: 11, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", color: "#c4b5fd", padding: "4px 10px", borderRadius: 20 }}>{b.emoji} {b.name}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 하단 버튼 */}
      <div style={{ position: "fixed", bottom: navHidden ? 0 : 81, left: 0, right: 0, padding: "12px 16px 12px", background: "rgba(18,18,22,0.97)", backdropFilter: "blur(16px)", borderTop: "1px solid rgba(255,255,255,0.06)", zIndex: 40, transition: "bottom 0.3s ease" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", gap: 10 }}>
          <button onClick={handleLike} style={{ display: "flex", alignItems: "center", gap: 5, background: isLiked ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.06)", border: `1px solid ${isLiked ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)"}`, borderRadius: 14, padding: "0 16px", height: 52, color: isLiked ? "#fca5a5" : "var(--text-muted)", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0, transition: "all 0.15s" }}>
            {isLiked ? "❤" : "♡"}
            <span style={{ fontSize: 12 }}>{likeCount}</span>
          </button>
          {isOwner ? (
            <button onClick={() => router.push(`/employer/register?edit=true&jobId=${job.id}`)} style={{ flex: 1, height: 52, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-muted)", fontWeight: 600, borderRadius: 14, cursor: "pointer", fontSize: 14 }}>✏️ 공고 수정하기</button>
          ) : isReceived && status === "pending" ? (
            <button disabled style={{ flex: 1, height: 52, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#c4b5fd", fontWeight: 700, borderRadius: 14, fontSize: 13, cursor: "default" }}>💌 러브콜 받음 · MY에서 수락/거절</button>
          ) : status === "sent" || status === "pending" ? (
            <button disabled style={{ flex: 1, height: 52, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#c4b5fd", fontWeight: 700, borderRadius: 14, fontSize: 14, cursor: "default" }}>💌 러브콜 보냄 (대기중)</button>
          ) : status === "accepted" ? (
            <button onClick={() => router.push(`/chat/${existingMatch?.id}`)} style={{ flex: 1, height: 52, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", color: "#86efac", fontWeight: 700, borderRadius: 14, fontSize: 14, cursor: "pointer" }}>💬 대화 중 · 채팅방 가기</button>
          ) : status === "hired" ? (
            <button disabled style={{ flex: 1, height: 52, background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)", color: "#fde68a", fontWeight: 700, borderRadius: 14, fontSize: 14, cursor: "default" }}>✅ 채용 완료</button>
          ) : status === "rejected" ? (
            <button onClick={handleInterest} disabled={sending} style={{ flex: 1, height: 52, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontWeight: 700, borderRadius: 14, fontSize: 14, cursor: "pointer" }}>💔 거절됨 · 다시 보내기</button>
          ) : isLoggedIn && !hasWorkerProfile ? (
            <button onClick={() => router.push(`/worker/profile?return=${encodeURIComponent(`/job/${id}`)}`)} style={{ flex: 1, height: 52, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", border: "none", color: "#fff", fontWeight: 700, borderRadius: 14, fontSize: 13, cursor: "pointer" }}>📋 구직 공고 등록 후 지원하기</button>
          ) : (
            <button onClick={handleInterest} disabled={sending} style={{ flex: 1, height: 52, background: isLoggedIn ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "rgba(255,255,255,0.08)", border: "none", color: "#fff", fontWeight: 800, borderRadius: 14, fontSize: 15, cursor: "pointer", opacity: sending ? 0.7 : 1, letterSpacing: "-0.3px" }}>
              {sending ? "처리 중..." : isLoggedIn ? "💌 러브콜 보내기" : "로그인하고 지원하기 →"}
            </button>
          )}
        </div>
      </div>

      {/* 확인 모달 */}
      {showConfirm && (
        <div style={{ ...modalOverlay }}>
          <div style={{ ...modalSheet, maxWidth: 480, margin: "0 auto" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>러브콜 다시 보내기</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px", lineHeight: 1.6 }}>{existingMatch?.progress_status === "rejected" ? "거절된 공고에 다시 보낼까요?" : "이전에 취소한 공고예요. 다시 보낼까요?"}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={sendLoveCall} disabled={sending} style={{ ...btnPrimary, flex: 1 }}>{sending ? "처리 중..." : "보내기 →"}</button>
              <button onClick={() => setShowConfirm(false)} style={{ ...btnSecondary, flex: 1 }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 봇 채팅 */}
      {showBotChat && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "var(--surface)", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, margin: "0 auto", height: "70vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #ec4899, #be185d)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🤖</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{String(job.business_name || "매장")} 봇</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>AI 사전 문의 ({MAX_BOT_TURNS - botUserTurns}회 남음)</p>
              </div>
              <button onClick={() => setShowBotChat(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {botMessages.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "78%", background: msg.role === "user" ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)", borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "4px 18px 18px 18px", padding: "10px 14px", fontSize: 13, color: msg.role === "user" ? "#fff" : "var(--text)", lineHeight: 1.6, whiteSpace: "pre-line" }}>{msg.content}</div>
                </div>
              ))}
              {botSending && <div style={{ display: "flex" }}><div style={{ background: "var(--surface2)", borderRadius: "4px 18px 18px 18px", padding: "10px 14px" }}><div style={{ display: "flex", gap: 4 }}>{[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#ec4899" }} />)}</div></div></div>}
              {botUserTurns < 3 && botMessages.length > 0 && botMessages[botMessages.length - 1]?.role === "assistant" && (
                <div style={{ marginTop: 4 }}>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>💬 이런 것도 물어볼 수 있어요</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {["매장 분위기가 어때요?", "교육은 어떻게 진행되나요?", "식사 제공되나요?", "야근이 자주 있나요?"].map(q => (
                      <button key={q} onClick={() => sendBotMessage(q)} style={{ background: "var(--surface)", border: "1px solid rgba(236,72,153,0.3)", borderRadius: 20, padding: "7px 14px", fontSize: 12, color: "var(--text-muted)", cursor: "pointer", textAlign: "left" }}>{q}</button>
                    ))}
                  </div>
                </div>
              )}
              {isBotMaxReached && (
                <div style={{ textAlign: "center", marginTop: 8 }}>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.6 }}>궁금한 점이 해결됐나요? 😊</p>
                  <button onClick={() => setShowBotChat(false)} style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", fontWeight: 600, padding: "10px 20px", borderRadius: 12, cursor: "pointer", fontSize: 13 }}>공고로 돌아가기</button>
                </div>
              )}
              <div ref={botBottomRef} />
            </div>
            {!isBotMaxReached && (
              <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", paddingBottom: "calc(10px + env(safe-area-inset-bottom))" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={botInput} onChange={e => setBotInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); sendBotMessage(); } }} placeholder="궁금한 것을 물어보세요..." style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 20, padding: "10px 16px", color: "var(--text)", fontSize: 13, outline: "none" }} />
                  <button onClick={() => sendBotMessage()} disabled={!botInput.trim() || botSending} style={{ width: 40, height: 40, borderRadius: "50%", background: botInput.trim() ? "linear-gradient(135deg, #ec4899, #be185d)" : "var(--surface2)", border: "none", color: "#fff", cursor: botInput.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}>→</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function TeamCompatSection({ teamCompat }: { teamCompat: Record<string, unknown> }) {
  const totalScore = Number(teamCompat.totalScore || 0);
  const employer = teamCompat.employer as Record<string, unknown>;
  const members = (teamCompat.members as Record<string, unknown>[] || []);
  return (
    <div style={{ padding: "20px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <p style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700, margin: 0, letterSpacing: "0.5px" }}>👥 팀과의 궁합</p>
        <span style={{ fontSize: 20, fontWeight: 900, color: totalScore >= 70 ? "#86efac" : totalScore >= 55 ? "#fbbf24" : "#f87171" }}>{totalScore}점</span>
      </div>
      {[{ label: "사장님", data: employer }, ...members.map((m, i) => ({ label: `팀원 ${i + 1}`, data: m }))].map(({ label, data }) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>{String(data?.emoji || "👤")}</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{label}</p>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{String(data?.personalityType || "미분석")}</p>
            </div>
          </div>
          {Number(data?.score || 0) > 0
            ? <span style={{ fontSize: 15, fontWeight: 800, color: Number(data?.score) >= 70 ? "#86efac" : Number(data?.score) >= 55 ? "#fbbf24" : "#f87171" }}>{Number(data?.score)}점</span>
            : <span style={{ fontSize: 11, color: "var(--text-muted)", background: "rgba(255,255,255,0.04)", padding: "3px 8px", borderRadius: 20 }}>미분석</span>}
        </div>
      ))}
      <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "10px 0 0", textAlign: "center" }}>* 사장님 50% + 팀원 평균 50%</p>
    </div>
  );
}
