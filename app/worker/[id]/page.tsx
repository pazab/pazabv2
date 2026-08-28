"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useToast } from "@/lib/useToast";
import { supabase } from "@/lib/supabase";
import { getFitChips, WORKER_TYPE_INFO } from "@/lib/utils";
import { getGrade, BADGE_DEFS, getBadgesByRole } from "@/lib/trustScore";
import { getWorkerTier, DaetaTier } from "@/lib/daetaTier";
import TierBadge from "@/components/TierBadge";
import { btnPrimary, btnSecondary, modalOverlay, modalSheet } from "@/lib/styles";
import AppHeader from "@/components/AppHeader";
import PersonalFeedSection from "@/components/profile/PersonalFeedSection";
import ResumeEditForm from "@/components/worker/ResumeEditForm";
import GalleryEditForm from "@/components/worker/GalleryEditForm";

function FitSection({ fit }: { fit: { wage_ok: boolean | null; days_overlap: number } }) {
  const chips = getFitChips(fit);
  if (chips.length === 0) return null;
  return (
    <div style={{ padding: "20px 0", borderBottom: "1px solid var(--card-inner-border)" }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700, margin: "0 0 12px", letterSpacing: "0.5px" }}>🎯 조건 적합도</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {chips.map(c => (
          <span key={c.text} style={{ fontSize: 13, fontWeight: 700, background: "var(--success-bg)", border: "1px solid var(--success-border)", color: "var(--success)", padding: "8px 14px", borderRadius: 20 }}>{c.icon} {c.text}</span>
        ))}
      </div>
    </div>
  );
}

function calcCareerMonths(start: string | null, end: string | null, isCurrent: boolean): number {
  if (!start) return 0;
  const s = new Date(start);
  if (isNaN(s.getTime())) return 0;
  const e = isCurrent || !end ? new Date() : new Date(end);
  if (isNaN(e.getTime())) return 0;
  const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  return Math.max(0, months);
}

function formatCareerDuration(months: number): string {
  if (months <= 0) return "-";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest}개월`;
  if (rest === 0) return `${years}년`;
  return `${years}년 ${rest}개월`;
}

export default function WorkerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { showToast, ToastUI } = useToast();
  const [worker, setWorker] = useState<Record<string, unknown> | null>(null);
  const [profileUser, setProfileUser] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [fit, setFit] = useState<{ wage_ok: boolean | null; days_overlap: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [existingMatch, setExistingMatch] = useState<Record<string, unknown> | null>(null);
  const [employerProfileId, setEmployerProfileId] = useState<string | null>(null);
  const [employerProfiles, setEmployerProfiles] = useState<{ id: string; business_name: string }[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [activeTeamMemberId, setActiveTeamMemberId] = useState<string | null>(null);
  const [pendingDaetaApplication, setPendingDaetaApplication] = useState<{ postingId: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [successMatchId, setSuccessMatchId] = useState<string | null>(null);
  const [matchModal, setMatchModal] = useState<{ matchId: string } | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [workerTier, setWorkerTier] = useState<DaetaTier | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [hasWorkerProfile, setHasWorkerProfile] = useState(false);
  const [ownedStores, setOwnedStores] = useState<{ id: string; business_name: string; business_type: string | null; region: string | null; image_url: string | null }[]>([]);
  const [careerHistory, setCareerHistory] = useState<{ id: string; storeName: string; businessType: string | null; region: string | null; roleDesc: string | null; hireDate: string | null; endDate: string | null; status: string }[]>([]);
  const [careerEntries, setCareerEntries] = useState<{ id: string; company_name: string; role_desc: string | null; start_date: string | null; end_date: string | null; is_current: boolean; description: string | null }[]>([]);
  const [careerModal, setCareerModal] = useState<{ id?: string; company_name: string; role_desc: string; start_date: string; end_date: string; is_current: boolean; description: string } | null>(null);
  const [savingCareer, setSavingCareer] = useState(false);
  const [badges, setBadges] = useState<{ key: string; name: string; emoji: string }[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<string | null>(null);

  useEffect(() => {
    if (typeof id === "string") {
      getWorkerTier(supabase, id).then(setWorkerTier).catch(() => setWorkerTier(null));
    }
  }, [id]);

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

  // 구직 정보(worker_profiles) 등록 여부와 무관하게 항상 표시 — 지원자가 온보딩을 안 거쳤어도
  // 파잡 내 실제 근무이력/직접입력 경력은 보여야 함
  useEffect(() => {
    if (typeof id !== "string") return;
    (async () => {
      try {
        const res = await fetch(`/api/worker/career-history?workerId=${id}`);
        const data = await res.json();
        if (data.success) setCareerHistory(data.history || []);
      } catch {}
    })();
    (async () => {
      const { data } = await supabase.from("worker_career_entries").select("*").eq("worker_id", id).order("start_date", { ascending: false });
      setCareerEntries(data || []);
    })();
  }, [id]);

  const loadCareerEntries = async () => {
    const { data } = await supabase.from("worker_career_entries").select("*").eq("worker_id", id).order("start_date", { ascending: false });
    const entries = data || [];
    setCareerEntries(entries);
    return entries;
  };

  // 대타 홈 인력카드의 "경력 N개월" 배지가 여전히 worker_profiles.experience_months를 그대로 읽어서 —
  // 구조화된 경력(검증된 파잡 이력 + 직접입력)을 바꿀 때마다 그 합계를 캐시로 다시 써준다.
  const syncExperienceMonths = async (entries: typeof careerEntries) => {
    const total = careerHistory.reduce((sum, h) => sum + calcCareerMonths(h.hireDate, h.endDate, h.status === "active"), 0)
      + entries.reduce((sum, e) => sum + calcCareerMonths(e.start_date, e.end_date, e.is_current), 0);
    await supabase.from("worker_profiles").update({ experience_months: total }).eq("user_id", id);
  };

  const openAddCareer = () => setCareerModal({ company_name: "", role_desc: "", start_date: "", end_date: "", is_current: false, description: "" });
  const openEditCareer = (entry: typeof careerEntries[number]) => setCareerModal({
    id: entry.id, company_name: entry.company_name, role_desc: entry.role_desc || "",
    start_date: entry.start_date || "", end_date: entry.end_date || "", is_current: entry.is_current, description: entry.description || "",
  });

  const saveCareerEntry = async () => {
    if (!careerModal || !careerModal.company_name.trim() || !userId) return;
    setSavingCareer(true);
    const payload = {
      worker_id: id,
      company_name: careerModal.company_name.trim(),
      role_desc: careerModal.role_desc.trim() || null,
      start_date: careerModal.start_date || null,
      end_date: careerModal.is_current ? null : (careerModal.end_date || null),
      is_current: careerModal.is_current,
      description: careerModal.description.trim() || null,
    };
    const { error } = careerModal.id
      ? await supabase.from("worker_career_entries").update(payload).eq("id", careerModal.id)
      : await supabase.from("worker_career_entries").insert(payload);
    setSavingCareer(false);
    if (error) { showToast("저장 중 오류가 발생했어요", "error"); return; }
    setCareerModal(null);
    const entries = await loadCareerEntries();
    await syncExperienceMonths(entries);
    showToast("경력이 저장됐어요");
  };

  const deleteCareerEntry = async (entryId: string) => {
    const { error } = await supabase.from("worker_career_entries").delete().eq("id", entryId);
    if (!error) {
      const next = careerEntries.filter(e => e.id !== entryId);
      setCareerEntries(next);
      await syncExperienceMonths(next);
      showToast("삭제됐어요");
    }
  };

  const openBotChat = () => {
    if (botMessages.length === 0 && profileUser) {
      setBotMessages([{ role: "assistant", content: `안녕하세요! 저는 ${String(profileUser.nickname || "알바생")}님을 대신하는 파잡봇이에요 🤖\n궁금한 점이 있으면 편하게 물어보세요!` }]);
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
        body: JSON.stringify({ messages: newMessages, botType: "worker", botProfile: { ...worker, ...profileUser }, userId }),
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
    await fetchProfile(session?.user.id, role);
  };

  const fetchProfile = async (uid?: string, role?: string | null) => {
    const [{ data: profile }, { data: user }, { data: badgeRows }] = await Promise.all([
      supabase.from("worker_profiles")
        .select("*").eq("user_id", id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("users")
        .select("id, nickname, avatar_url, trust_score, user_type, created_at, worker_result, real_name, phone, address, address_detail").eq("id", id).maybeSingle(),
      supabase.from("user_badges").select("badge_key").eq("user_id", id),
    ]);

    if (!user) { setLoading(false); return; }

    const data = (profile ?? { user_id: id }) as Record<string, unknown>;
    setProfileUser(user as Record<string, unknown>);
    setWorker(data);
    setHasWorkerProfile(!!profile);
    setBadges(getBadgesByRole(badgeRows || [], (user as { user_type?: string }).user_type === "employer" ? "employer" : "worker"));

    const { data: stores } = await supabase.from("employer_profiles")
      .select("id, business_name, business_type, region, image_url").eq("user_id", id)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .not("business_name", "is", null)
      .order("created_at", { ascending: false });
    setOwnedStores(stores || []);

    if (uid) {
      if (uid === id || role === "admin") setIsOwner(true);

      const { data: empProfiles } = await supabase.from("employer_profiles")
        .select("id, business_name").eq("user_id", uid)
        .or("is_deleted.is.null,is_deleted.eq.false")
        .not("business_name", "is", null)
        .order("created_at", { ascending: false });
      if (empProfiles && empProfiles.length > 0) {
        setEmployerProfiles(empProfiles as { id: string; business_name: string }[]);
        setEmployerProfileId(empProfiles[0].id);
      }

      // 대타 SOS 매칭(daeta_posting_id 있음)은 단발성 요청이라 제외 — 정규 채용 매칭 상태만 반영
      const { data: match } = await supabase.from("matches")
        .select("id, progress_status, employer_id, worker_id, employer_interest, worker_interest")
        .or(`and(employer_id.eq.${uid},worker_id.eq.${id}),and(employer_id.eq.${id},worker_id.eq.${uid})`)
        .is("daeta_posting_id", null)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (match) setExistingMatch({ ...match, isReceived: match.worker_interest === true });

      if (uid !== id) {
        // 이미 우리 매장 활성 팀원이면 채용제안/결렬됨 흐름 자체가 무의미 — matches 이력과 무관하게 우선 적용
        const { data: activeTeam } = await supabase.from("team_members")
          .select("id").eq("employer_id", uid).eq("worker_id", id).eq("status", "active").maybeSingle();
        setActiveTeamMemberId(activeTeam?.id || null);

        // 위 existingMatch 조회는 daeta_posting_id를 일부러 제외하는데(정규 채용과 별개 트랙),
        // 그래서 이 알바생이 내 대타 SOS 공고에 이미 지원해 응답 대기중이어도 "대타 SOS 요청" 버튼이
        // 아무 일도 없었던 것처럼 계속 활성 상태로 보였음 — 눌러도 중복 요청만 하나 더 쌓이는 상태.
        const { data: daetaApp } = await supabase.from("matches")
          .select("daeta_posting_id")
          .eq("employer_id", uid).eq("worker_id", id)
          .eq("progress_status", "pending")
          .not("daeta_posting_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        setPendingDaetaApplication(daetaApp?.daeta_posting_id ? { postingId: daetaApp.daeta_posting_id as string } : null);
      }

      if (uid !== id) {
        try {
          const res = await fetch("/api/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: uid, userType: "employer" }) });
          const matchData = await res.json();
          if (matchData.success) {
            const found = matchData.results?.find((r: Record<string, unknown>) => r.id === id || r.user_id === id);
            if (found) setFit({ wage_ok: (found.wage_ok as boolean | null) ?? null, days_overlap: Number(found.days_overlap || 0) });
          }
        } catch {}
      }
    }
    setLoading(false);
  };

  const handleLoveCall = async () => {
    if (!isLoggedIn || !userId) { localStorage.setItem("login_redirect", window.location.pathname); router.push("/login"); return; }
    if (employerProfiles.length === 0) {
      setPendingConfirm({
        title: "사장님 프로필 등록 필요",
        message: "채용 제안은 매장을 등록하신 사장님만 보낼 수 있습니다. 사장님 프로필(매장)을 등록하시겠습니까?",
        onConfirm: () => {
          setPendingConfirm(null);
          router.push("/employer/register?return=" + encodeURIComponent(window.location.pathname));
        }
      });
      return;
    }
    setShowConfirm(true);
  };

  const handleSosClick = () => {
    if (!isLoggedIn || !userId) { localStorage.setItem("login_redirect", window.location.pathname); router.push("/login"); return; }
    if (employerProfiles.length === 0) {
      setPendingConfirm({
        title: "사장님 프로필 등록 필요",
        message: "대타 SOS 요청은 매장을 등록하신 사장님만 보낼 수 있습니다. 사장님 프로필(매장)을 등록하시겠습니까?",
        onConfirm: () => {
          setPendingConfirm(null);
          router.push("/employer/register?return=" + encodeURIComponent(window.location.pathname));
        }
      });
      return;
    }
    router.push(`/daeta?targetWorkerId=${id}`);
  };

  const sendLoveCall = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/lovecall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employerId: userId, workerId: id, senderType: "employer", employerProfileId }) });
      const data = await res.json();
      if (data.success) {
        setSent(true);
        setShowConfirm(false);
        setSuccessMatchId(data.data.id);
      } else {
        showToast(data.error || "오류가 발생했어요", "error");
      }
    } catch {
      showToast("오류가 발생했어요", "error");
    }
    setSending(false);
  };

  const handleRespondDirect = async (action: "accept" | "reject") => {
    if (!existingMatch || !userId) return;
    const matchId = String(existingMatch.id);
    setSending(true);
    try {
      const res = await fetch("/api/lovecall", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, action }),
      });
      const data = await res.json();
      if (data.success) {
        if (action === "accept") {
          const counterpartId = existingMatch.employer_id === userId ? existingMatch.worker_id : existingMatch.employer_id;
          await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              matchId,
              senderId: userId,
              receiverId: counterpartId,
              message: "🎉 매칭이 성사됐어요! 서로 인사를 나눠보세요 😊",
              messageType: "system",
            }),
          });
          setExistingMatch(prev => prev ? { ...prev, progress_status: "accepted" } : null);
          setMatchModal({ matchId });
        } else {
          setExistingMatch(prev => prev ? { ...prev, progress_status: "rejected" } : null);
          showToast("제안을 거절했습니다.");
        }
      } else {
        showToast(data.error || "오류가 발생했습니다.", "error");
      }
    } catch (e) {
      showToast("오류가 발생했습니다.", "error");
    }
    setSending(false);
  };

  if (loading) return <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "var(--text-muted)" }}>불러오는 중...</p></main>;
  if (!profileUser) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>구직자 정보를 찾을 수 없어요</p>
        <button onClick={() => router.back()} style={{ background: "var(--primary)", border: "none", color: "#fff", padding: "10px 20px", borderRadius: 12, cursor: "pointer" }}>돌아가기</button>
      </div>
    </main>
  );

  const w = worker || {};
  const name = String(profileUser.nickname || "알바생");
  const realName = String((profileUser as any).real_name || "");
  const phone = String((profileUser as any).phone || "");
  const address = String((profileUser as any).address || "");
  const addressDetail = String((profileUser as any).address_detail || "");
  const credentials = Array.isArray(w.credentials) ? w.credentials as { name: string; is_mandatory_by_law?: boolean; is_preset?: boolean }[] : [];
  const desiredTypes = w.category_ids && Array.isArray(w.custom_categories) && w.custom_categories.length > 0
    ? w.custom_categories as string[]
    : (String(w.desired_type || "").split(",").map(s => s.trim()).filter(Boolean));

  const imageUrl = w.image_url as string | null;
  const imageUrls = w.image_urls as string[] | null;
  const videoUrl = w.video_url as string | null;

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

  const grade = getGrade(Number(profileUser.trust_score || 50));
  const status = sent ? "sent" : String(existingMatch?.progress_status || "");
  const isReceived = existingMatch?.isReceived === true;
  const isWorkerRole = profileUser.user_type === "worker" || profileUser.user_type === "both";

  type TimelineItem = {
    id: string;
    verified: boolean;
    title: string;
    subtitle: string | null;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
    description?: string | null;
    entry?: typeof careerEntries[number];
  };

  const timelineItems: TimelineItem[] = [
    ...careerHistory.map(h => ({
      id: `hist-${h.id}`,
      verified: true,
      title: h.storeName,
      subtitle: [h.roleDesc, h.businessType].filter(Boolean).join(" · ") || null,
      startDate: h.hireDate,
      endDate: h.endDate,
      isCurrent: h.status === "active",
    })),
    ...careerEntries.map(e => ({
      id: `entry-${e.id}`,
      verified: false,
      title: e.company_name,
      subtitle: e.role_desc,
      startDate: e.start_date,
      endDate: e.end_date,
      isCurrent: e.is_current,
      description: e.description,
      entry: e,
    })),
  ].sort((a, b) => {
    const ad = a.startDate ? new Date(a.startDate).getTime() : 0;
    const bd = b.startDate ? new Date(b.startDate).getTime() : 0;
    return bd - ad;
  });

  const totalCareerMonths = timelineItems.reduce((sum, item) => sum + calcCareerMonths(item.startDate, item.endDate, item.isCurrent), 0);
  const verifiedCareerCount = careerHistory.length;

  const ownerMenu = (
    <div style={{ position: "relative" }}>
      <button onClick={() => setShowMenu(!showMenu)} style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)", border: "none", borderRadius: "50%", width: 36, height: 36, color: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>⋯</button>
      {showMenu && (
        <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", width: 160, boxShadow: "0 8px 24px rgba(0,0,0,0.3)", zIndex: 50 }}>
          {isOwner ? (
            <>
              {hasWorkerProfile ? (
                <button onClick={() => { setShowMenu(false); showToast("삭제됐어요"); }} style={{ width: "100%", background: "none", border: "none", padding: "12px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--danger)" }}>🗑️ 삭제하기</button>
              ) : (
                <button onClick={() => { setShowMenu(false); setShowResumeModal(true); }} style={{ width: "100%", background: "none", border: "none", padding: "12px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--text)" }}>📝 이력서 작성하기</button>
              )}
            </>
          ) : (
            <>
              <button onClick={() => { setShowMenu(false); showToast("신고가 접수됐어요"); }} style={{ width: "100%", background: "none", border: "none", padding: "12px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--warning)", borderBottom: "1px solid var(--border)" }}>🚨 신고하기</button>
              <button onClick={() => { setShowMenu(false); showToast("차단됐어요"); }} style={{ width: "100%", background: "none", border: "none", padding: "12px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--danger)" }}>🚫 차단하기</button>
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 150, width: "100%", maxWidth: 480, margin: "0 auto" }}>
      <AppHeader title={isWorkerRole ? "이력서" : "프로필"} showBack showBellAndMenu={true} />
      {ToastUI}

      {hasWorkerProfile ? (
        /* 히어로 (구직 정보 있을 때) */
        <div style={{ position: "relative", height: hasMedia ? 360 : 280, background: "#000", overflow: "hidden" }}>
          {hasMedia ? (
            activeMedia.type === "video" ? (
              <video src={activeMedia.url} controls muted autoPlay loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ position: "absolute", inset: 0, background: `url(${activeMedia.url}) center/cover no-repeat` }} />
            )
          ) : (
            <div style={{ position: "absolute", inset: 0, background: "var(--surface2)" }} />
          )}

          <div style={{ position: "absolute", inset: 0, background: hasMedia ? "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.85) 100%)" : "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.7) 100%)", pointerEvents: "none" }} />

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

          {/* 히어로 오버레이 컨트롤 */}
          <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 8, zIndex: 30 }}>
            {isOwner && (
              <button onClick={() => setShowGalleryModal(true)}
                title="사진 수정"
                style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)", border: "none", borderRadius: "50%", width: 36, height: 36, color: "#fff", fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className="ti ti-pencil" aria-hidden="true" />
              </button>
            )}
            {ownerMenu}
          </div>

          {/* 히어로 하단 */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 20px 20px" }}>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fff", margin: "0 0 8px", textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>{name}</h1>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
              {workerTier && <TierBadge tier={workerTier} />}
              {!!w.available_now && <span style={{ fontSize: 10, fontWeight: 800, background: "var(--success)", color: "#fff", padding: "3px 8px", borderRadius: 8 }}>즉시가능</span>}
              {desiredTypes.length > 0 && <span style={{ fontSize: 10, background: "rgba(255,255,255,0.15)", backdropFilter: "blur(4px)", color: "#fff", padding: "3px 8px", borderRadius: 8 }}>{desiredTypes[0]}</span>}
              <span style={{ fontSize: 10, background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)", padding: "3px 8px", borderRadius: 8 }}>{grade.emoji} {grade.name}</span>
            </div>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: "0 0 10px" }}>📍 {String(w.desired_region || "지역 협의")}</p>
          </div>
        </div>
      ) : isWorkerRole ? (
        /* 컴팩트 헤더 (워커 계정, 구직 정보 없을 때 — 정체성만 표시) */
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px" }}>
          <div style={{ width: 68, height: 68, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--border)" }}>
            {profileUser.avatar_url ? (
              <img src={profileUser.avatar_url as string} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <i className="ti ti-user" style={{ fontSize: 28, color: "var(--text-muted)" }} aria-hidden="true" />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 4px", color: "var(--text)" }}>{name}</h1>
            <span style={{ fontSize: 11, background: "var(--surface2)", color: "var(--text-muted)", padding: "3px 8px", borderRadius: 8, fontWeight: 700 }}>{grade.emoji} {grade.name}</span>
          </div>
          {ownerMenu}
        </div>
      ) : (
        /* 소셜형 헤더 (사장님 전용 계정 — 신뢰도 바 포함) */
        <div style={{ padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "linear-gradient(135deg,#7c3aed,#ec4899)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, border: "2px solid var(--border)" }}>
              {profileUser.avatar_url ? (
                <img src={profileUser.avatar_url as string} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : "🏪"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 4px", color: "var(--text)" }}>{name}</h1>
              <span style={{ fontSize: 11, background: "var(--surface2)", color: "var(--text-muted)", padding: "3px 8px", borderRadius: 8, fontWeight: 700 }}>{grade.emoji} {grade.name}</span>
            </div>
            {ownerMenu}
          </div>
          <div style={{ background: "var(--surface2, var(--surface))", borderRadius: 12, padding: "10px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>종합 신뢰도</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--purple-text)" }}>{Number(profileUser.trust_score || 0)}점</span>
            </div>
            <div style={{ height: 6, background: "var(--progress-track)", borderRadius: 4 }}>
              <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#7c3aed,#ec4899)", width: `${Math.min(100, Number(profileUser.trust_score || 0))}%`, transition: "width 0.6s" }} />
            </div>
          </div>
        </div>
      )}

      {/* 본문 */}
      <div style={{ padding: "0 20px" }}>

      {/* 💼 경력 요약 */}
      {isWorkerRole && timelineItems.length > 0 && (
        <div style={{ padding: "20px 0 4px", display: "flex", gap: 8 }}>
          <div style={{ flex: 1, textAlign: "center", background: "var(--card-inner)", border: "1px solid var(--card-inner-border)", borderRadius: 14, padding: "12px 8px" }}>
            <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 4px", fontWeight: 600 }}>총 경력</p>
            <p style={{ fontSize: 15, fontWeight: 800, margin: 0, color: "var(--text)" }}>{formatCareerDuration(totalCareerMonths)}</p>
          </div>
          <div style={{ flex: 1, textAlign: "center", background: "var(--card-inner)", border: "1px solid var(--card-inner-border)", borderRadius: 14, padding: "12px 8px" }}>
            <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 4px", fontWeight: 600 }}>근무이력</p>
            <p style={{ fontSize: 15, fontWeight: 800, margin: 0, color: "var(--text)" }}>{timelineItems.length}곳</p>
          </div>
          <div style={{ flex: 1, textAlign: "center", background: "var(--card-inner)", border: "1px solid var(--card-inner-border)", borderRadius: 14, padding: "12px 8px" }}>
            <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 4px", fontWeight: 600 }}>파잡 인증</p>
            <p style={{ fontSize: 15, fontWeight: 800, margin: 0, color: verifiedCareerCount > 0 ? "var(--success)" : "var(--text)" }}>{verifiedCareerCount}곳</p>
          </div>
        </div>
      )}

      {/* 🏅 뱃지 */}
      {badges.length > 0 && (
        <div style={{ padding: "20px 0", borderBottom: "1px solid var(--card-inner-border)" }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700, margin: "0 0 10px", letterSpacing: "0.5px" }}>🏅 뱃지</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {badges.map(b => (
              <button key={b.key} onClick={() => setSelectedBadge(selectedBadge === b.key ? null : b.key)}
                style={{ background: selectedBadge === b.key ? "var(--primary-light)" : "var(--card-inner)", border: `1px solid ${selectedBadge === b.key ? "var(--primary-border)" : "var(--card-inner-border)"}`, borderRadius: 20, padding: "4px 10px", fontSize: 11, color: "var(--purple-text)", cursor: "pointer", fontWeight: 600 }}>
                {b.emoji} {b.name}
              </button>
            ))}
          </div>
          {selectedBadge && BADGE_DEFS[selectedBadge] && (
            <div style={{ background: "var(--primary-light)", border: "1px solid var(--primary-border)", borderRadius: 10, padding: "8px 12px", marginTop: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--purple-text)", margin: "0 0 2px" }}>{BADGE_DEFS[selectedBadge].emoji} {BADGE_DEFS[selectedBadge].name}</p>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{BADGE_DEFS[selectedBadge].desc}</p>
            </div>
          )}
        </div>
      )}

      {/* 👤 개인정보 — 본인에게만 노출(계약서 SOT 미리보기용). 다른 사람에겐 절대 안 보임 — 실제 공개는 계약서 작성 시 상대 사장님에게만 */}
      {isOwner && (realName || phone || address) && (
        <div style={{ padding: "20px 0", borderBottom: "1px solid var(--card-inner-border)" }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700, margin: "0 0 10px", letterSpacing: "0.5px" }}>👤 개인정보 <span style={{ fontWeight: 400 }}>(나만 볼 수 있어요 · 계약서 자동입력용)</span></p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "var(--text)" }}>
            {realName && <div>{realName}</div>}
            {phone && <div style={{ color: "var(--text-muted)" }}>{phone}</div>}
            {address && <div style={{ color: "var(--text-muted)" }}>{address}{addressDetail ? ` ${addressDetail}` : ""}</div>}
          </div>
        </div>
      )}

      {/* 💼 경력 (파잡 근무이력 + 직접입력 경력을 하나의 타임라인으로 통합) */}
      {isWorkerRole && (timelineItems.length > 0 || isOwner) && (
        <div style={{ padding: "20px 0", borderBottom: "1px solid var(--card-inner-border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700, margin: 0, letterSpacing: "0.5px" }}>💼 경력</p>
            {isOwner && (
              <button onClick={openAddCareer} style={{ fontSize: 11, fontWeight: 700, color: "var(--purple-text)", background: "var(--primary-light)", border: "1px solid var(--primary-border)", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>+ 추가</button>
            )}
          </div>
          {timelineItems.length === 0 ? (
            isOwner && <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>파잡 밖에서의 근무 경력을 추가해보세요.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {timelineItems.map(item => {
                const entry = item.entry;
                return (
                  <div key={item.id} onClick={() => entry && isOwner && openEditCareer(entry)} style={{ background: "var(--card-inner)", border: "1px solid var(--card-inner-border)", borderRadius: 14, padding: "12px 14px", cursor: entry && isOwner ? "pointer" : "default" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                          <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "var(--text)" }}>{item.title}</p>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 6, whiteSpace: "nowrap", background: item.verified ? "var(--success-bg)" : "var(--surface2)", color: item.verified ? "var(--success)" : "var(--text-muted)" }}>
                            {item.verified ? "✅ 파잡 인증" : "✏️ 직접입력"}
                          </span>
                        </div>
                        {item.subtitle && <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{item.subtitle}</p>}
                      </div>
                      {entry && isOwner ? (
                        <button onClick={(ev) => { ev.stopPropagation(); setPendingConfirm({ title: "경력 삭제", message: "이 경력사항을 삭제할까요?", onConfirm: () => { setPendingConfirm(null); deleteCareerEntry(entry.id); } }); }}
                          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14, padding: 2, flexShrink: 0 }}>🗑️</button>
                      ) : item.verified ? (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 8, whiteSpace: "nowrap", flexShrink: 0, background: item.isCurrent ? "var(--success-bg)" : "var(--surface2)", color: item.isCurrent ? "var(--success)" : "var(--text-muted)" }}>
                          {item.isCurrent ? "재직중" : "근무완료"}
                        </span>
                      ) : null}
                    </div>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0" }}>
                      {item.startDate || "?"} ~ {item.isCurrent ? "현재" : (item.endDate ? String(item.endDate).slice(0, 10) : "?")}
                    </p>
                    {item.description && <p style={{ fontSize: 12, color: "var(--text)", margin: "8px 0 0", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{item.description}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {isWorkerRole && (hasWorkerProfile ? (<>
        {/* 보유 자격증 & 실무기술 */}
        {credentials.length > 0 && (
          <div style={{ padding: "20px 0", borderBottom: "1px solid var(--card-inner-border)" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700, margin: "0 0 10px", letterSpacing: "0.5px" }}>🏅 보유 자격증 & 실무기술</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {credentials.map((c) => (
                <span key={c.name} style={{ fontSize: 12, fontWeight: c.is_mandatory_by_law ? 700 : 400, background: c.is_mandatory_by_law ? "var(--danger-bg)" : "var(--primary-light)", border: `1px solid ${c.is_mandatory_by_law ? "var(--danger-border)" : "var(--primary-border)"}`, color: c.is_mandatory_by_law ? "var(--danger)" : "var(--purple-text)", padding: "6px 12px", borderRadius: 20 }}>
                  {c.is_mandatory_by_law && "⚠️ "}{c.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 자기소개 (Description) */}
        {!!w.bio && (
          <div style={{ padding: "20px 0", borderBottom: "1px solid var(--card-inner-border)" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700, margin: "0 0 10px", letterSpacing: "0.5px" }}>🙋 자기소개</p>
            <div style={{ background: "var(--card-inner)", border: "1px solid var(--card-inner-border)", borderRadius: 16, padding: "14px 16px", color: "var(--text)", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {String(w.bio)}
            </div>
          </div>
        )}

        {/* 🔍 매칭 정보 구분선 — 위는 이력서 영역, 아래는 사장님과의 매칭 정보 */}
        <div style={{ margin: "4px -20px 0", padding: "10px 20px", background: "var(--surface2)" }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", margin: 0, letterSpacing: "0.5px" }}>🔍 매칭 정보</p>
        </div>

        {/* 조건 적합도 */}
        {fit && <FitSection fit={fit} />}

        {/* 이력서 수정 — "⋯" 메뉴 안에 숨겨두던 걸 여기로 꺼냄. 사진은 위쪽 연필 아이콘으로 따로 편집 */}
        {isOwner && (
          <div style={{ padding: "20px 0" }}>
            <button onClick={() => setShowResumeModal(true)}
              style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 14, padding: "13px", color: "var(--text)", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <i className="ti ti-pencil" aria-hidden="true" /> 이력서 수정
            </button>
          </div>
        )}

      </>) : (
        isOwner && (
          <div style={{ padding: "20px 0" }}>
            <div style={{ background: "var(--primary-light)", border: "1px solid var(--primary-border)", borderRadius: 16, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "var(--purple-text)", margin: "0 0 2px" }}>💼 구직 정보를 아직 등록 안 하셨어요</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>등록하면 대타 요청도 받을 수 있어요</p>
              </div>
              <button onClick={() => setShowResumeModal(true)} style={{ flexShrink: 0, background: "var(--primary)", color: "#fff", border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                등록하기 →
              </button>
            </div>
          </div>
        )
      ))}

        {/* 운영 매장 */}
        {ownedStores.length > 0 && (
          <div style={{ padding: "20px 0", borderBottom: "1px solid var(--card-inner-border)" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700, margin: "0 0 12px", letterSpacing: "0.5px" }}>🏪 운영 매장</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ownedStores.map(s => (
                <div key={s.id} onClick={() => router.push(`/store/${s.id}`)}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--card-inner)", border: "1px solid var(--card-inner-border)", borderRadius: 14, padding: "10px 12px", cursor: "pointer" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                    {s.image_url ? <img src={s.image_url} alt={s.business_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🏪"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.business_name}</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{s.business_type || ""}{s.region ? ` · ${s.region.split(" ").slice(0, 2).join(" ")}` : ""}</p>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>→</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 📝 최근 소식 (개인 피드) */}
        <PersonalFeedSection
          profileUserId={id}
          viewerId={userId}
          nickname={name}
          avatarUrl={profileUser.avatar_url as string | null}
        />
      </div>

      {/* 하단 버튼 (구직 정보 등록 여부와 무관하게 항상 노출 — 채용제안/대타요청은 별개 기능) */}
      <div style={{ position: "fixed", bottom: navHidden ? 0 : 81, left: 0, right: 0, padding: "12px 16px 12px", background: "var(--nav-bg)", backdropFilter: "blur(16px)", borderTop: "1px solid var(--nav-border)", zIndex: 40, transition: "bottom 0.3s ease" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", gap: 10 }}>
          {isOwner ? null : activeTeamMemberId ? (
            <div style={{ display: "flex", gap: 8, flex: 1 }}>
              <button disabled style={{ flex: 1, height: 52, background: "var(--success-bg)", border: "1px solid var(--success-border)", color: "var(--success)", fontWeight: 700, borderRadius: 14, fontSize: 14, cursor: "default" }}>✅ 우리 매장 직원이에요</button>
              <button onClick={() => router.push(`/employer/team/${activeTeamMemberId}`)} style={{ flex: 1, height: 52, background: "var(--primary)", border: "none", color: "#fff", fontWeight: 800, borderRadius: 14, fontSize: 14, cursor: "pointer" }}>👥 팀원 관리로 이동</button>
            </div>
          ) : isReceived && status === "pending" ? (
            <div style={{ display: "flex", gap: 8, flex: 1 }}>
              <button onClick={() => handleRespondDirect("reject")} disabled={sending}
                style={{ flex: 1, height: 52, background: "var(--danger-bg)", border: "1px solid var(--danger-border)", color: "var(--danger)", fontWeight: 700, borderRadius: 14, fontSize: 13, cursor: "pointer" }}>
                거절하기
              </button>
              <button onClick={() => handleRespondDirect("accept")} disabled={sending}
                style={{ flex: 2, height: 52, background: "var(--primary)", border: "none", color: "#fff", fontWeight: 800, borderRadius: 14, fontSize: 13, cursor: "pointer" }}>
                수락하기
              </button>
            </div>
          ) : status === "sent" || status === "pending" ? (
            <button disabled style={{ flex: 1, height: 52, background: "var(--primary-light)", border: "1px solid var(--primary-border)", color: "var(--purple-text)", fontWeight: 700, borderRadius: 14, fontSize: 14, cursor: "default" }}>📤 제안 완료 (수락 대기중)</button>
          ) : status === "accepted" ? (
            <button onClick={() => router.push(`/chat/${existingMatch?.id}`)} style={{ flex: 1, height: 52, background: "var(--success-bg)", border: "1px solid var(--success-border)", color: "var(--success)", fontWeight: 700, borderRadius: 14, fontSize: 14, cursor: "pointer" }}>💬 대화 중 · 채팅방 가기</button>
          ) : status === "hired" ? (
            <button disabled style={{ flex: 1, height: 52, background: "var(--warning-bg)", border: "1px solid var(--warning-border)", color: "var(--warning)", fontWeight: 700, borderRadius: 14, fontSize: 14, cursor: "default" }}>✅ 채용 완료</button>
          ) : ["rejected", "failed", "cancelled"].includes(status) ? (
            <button onClick={handleLoveCall} disabled={sending} style={{ flex: 1, height: 52, background: "var(--danger-bg)", border: "1px solid var(--danger-border)", color: "var(--danger)", fontWeight: 700, borderRadius: 14, fontSize: 14, cursor: "pointer" }}>💔 결렬됨 · 다시 보내기</button>
          ) : (
            <div style={{ display: "flex", gap: 8, flex: 1 }}>
              {pendingDaetaApplication ? (
                <button
                  onClick={() => router.push(`/daeta?applicants=${pendingDaetaApplication.postingId}`)}
                  style={{
                    flex: 1,
                    height: 52,
                    background: "var(--success-bg)",
                    border: "1px solid var(--success-border)",
                    color: "var(--success)",
                    fontWeight: 800,
                    borderRadius: 14,
                    fontSize: 13,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4
                  }}
                >
                  📥 이미 지원함 · 확인하기
                </button>
              ) : Boolean(worker?.available_now) && (
                <button
                  onClick={handleSosClick}
                  style={{
                    flex: 1,
                    height: 52,
                    background: "linear-gradient(135deg, #f97316, #ef4444)",
                    border: "none",
                    color: "#fff",
                    fontWeight: 900,
                    borderRadius: 14,
                    fontSize: 14,
                    cursor: "pointer",
                    boxShadow: "0 3px 12px rgba(249,115,22,0.35)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4
                  }}
                >
                  ⚡ 대타 SOS 요청
                </button>
              )}
              <button onClick={handleLoveCall} disabled={sending} style={{ flex: 1, height: 52, background: isLoggedIn ? "var(--primary)" : "var(--surface2)", border: "none", color: isLoggedIn ? "#fff" : "var(--text-muted)", fontWeight: 800, borderRadius: 14, fontSize: 14, cursor: "pointer", opacity: sending ? 0.7 : 1, letterSpacing: "-0.3px" }}>
                {sending ? "..." : isLoggedIn ? "💼 채용 제안" : "로그인 후 제안 →"}
              </button>
            </div>
          )}
        </div>
      </div>
      {/* 사진 수정 모달 — 히어로 사진 위 연필 아이콘 */}
      {showGalleryModal && userId && (
        <div style={{ ...modalOverlay }} onClick={() => setShowGalleryModal(false)}>
          <div style={{ ...modalSheet, maxWidth: 480, margin: "0 auto", maxHeight: "88dvh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>사진 수정</h3>
              <button onClick={() => setShowGalleryModal(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <GalleryEditForm
              userId={userId}
              onSaved={() => {
                setShowGalleryModal(false);
                showToast("사진이 저장됐어요");
                fetchProfile(userId, null);
              }}
            />
          </div>
        </div>
      )}

      {/* 이력서 수정 모달 — /worker/profile로 페이지 이동하지 않고 바로 여기서 편집 */}
      {showResumeModal && userId && (
        <div style={{ ...modalOverlay }} onClick={() => setShowResumeModal(false)}>
          <div style={{ ...modalSheet, maxWidth: 480, margin: "0 auto", maxHeight: "88dvh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>이력서 수정</h3>
              <button onClick={() => setShowResumeModal(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <ResumeEditForm
              userId={userId}
              onSaved={(warning) => {
                setShowResumeModal(false);
                showToast(warning || "이력서가 저장됐어요", warning ? "warning" : "success");
                fetchProfile(userId, null);
              }}
            />
          </div>
        </div>
      )}

      {/* 경력 추가/수정 모달 */}
      {careerModal && (
        <div style={{ ...modalOverlay }}>
          <div style={{ ...modalSheet, maxWidth: 480, margin: "0 auto" }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 16px" }}>{careerModal.id ? "경력 수정" : "경력 추가"}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 6 }}>회사/매장명 *</label>
                <input value={careerModal.company_name} onChange={e => setCareerModal(prev => prev && { ...prev, company_name: e.target.value })} placeholder="예) OO커피 탕정점"
                  style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", color: "var(--text)", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 6 }}>담당 업무</label>
                <input value={careerModal.role_desc} onChange={e => setCareerModal(prev => prev && { ...prev, role_desc: e.target.value })} placeholder="예) 홀 서빙, 바리스타"
                  style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", color: "var(--text)", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 6 }}>시작일</label>
                  <input type="date" value={careerModal.start_date} onChange={e => setCareerModal(prev => prev && { ...prev, start_date: e.target.value })}
                    style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", color: "var(--text)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 6 }}>종료일</label>
                  <input type="date" value={careerModal.end_date} disabled={careerModal.is_current} onChange={e => setCareerModal(prev => prev && { ...prev, end_date: e.target.value })}
                    style={{ width: "100%", background: "var(--surface2)", opacity: careerModal.is_current ? 0.5 : 1, border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", color: "var(--text)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
              </div>
              <div onClick={() => setCareerModal(prev => prev && { ...prev, is_current: !prev.is_current })} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${careerModal.is_current ? "var(--primary)" : "var(--border)"}`, background: careerModal.is_current ? "var(--primary)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, flexShrink: 0 }}>
                  {careerModal.is_current && "✓"}
                </div>
                <span style={{ fontSize: 13, color: "var(--text)" }}>현재 재직중</span>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 6 }}>상세 설명 (선택)</label>
                <textarea value={careerModal.description} onChange={e => setCareerModal(prev => prev && { ...prev, description: e.target.value })} placeholder="주요 업무, 성과 등을 자유롭게 적어주세요" rows={3}
                  style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", color: "var(--text)", fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={saveCareerEntry} disabled={savingCareer || !careerModal.company_name.trim()} style={{ ...btnPrimary, flex: 1, opacity: (savingCareer || !careerModal.company_name.trim()) ? 0.6 : 1 }}>{savingCareer ? "저장 중..." : "저장"}</button>
              <button onClick={() => setCareerModal(null)} style={{ ...btnSecondary, flex: 1 }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 확인 모달 */}
      {showConfirm && (
        <div style={{ ...modalOverlay }}>
          <div style={{ ...modalSheet, maxWidth: 480, margin: "0 auto" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>
              {existingMatch && ["cancelled", "rejected", "failed"].includes(String(existingMatch.progress_status)) ? "재제안 확인" : "채용 제안 확인"}
            </h3>
            {existingMatch && ["cancelled", "rejected", "failed"].includes(String(existingMatch.progress_status)) && (
              <p style={{ fontSize: 13, color: "var(--warning)", margin: "0 0 12px", lineHeight: 1.6, background: "var(--warning-bg)", border: "1px solid var(--warning-border)", borderRadius: 10, padding: "8px 12px" }}>
                ⚠️ 이전에 매칭이 결렬된 이력이 있습니다. 다시 제안하시겠어요?
              </p>
            )}
            {employerProfiles.length > 1 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, margin: "0 0 8px" }}>어느 매장으로 제안할까요?</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {employerProfiles.map(ep => (
                    <button key={ep.id} onClick={() => setEmployerProfileId(ep.id)}
                      style={{ background: employerProfileId === ep.id ? "var(--primary-light)" : "var(--surface2)", border: `1px solid ${employerProfileId === ep.id ? "var(--primary-border)" : "var(--border)"}`, borderRadius: 12, padding: "10px 14px", cursor: "pointer", textAlign: "left", fontSize: 14, fontWeight: employerProfileId === ep.id ? 700 : 400, color: employerProfileId === ep.id ? "var(--purple-text)" : "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{employerProfileId === ep.id ? "✅" : "🏪"}</span>
                      {ep.business_name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {employerProfiles.length === 1 && (
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px", lineHeight: 1.6 }}>
                🏪 <strong style={{ color: "var(--text)" }}>{employerProfiles[0].business_name}</strong> 매장으로 채용 제안을 보냅니다.
              </p>
            )}
            {employerProfiles.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px", lineHeight: 1.6 }}>
                이 알바생에게 채용 제안을 보내시겠습니까?
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={sendLoveCall} disabled={sending} style={{ ...btnPrimary, flex: 1 }}>{sending ? "처리 중..." : "제안하기"}</button>
              <button onClick={() => setShowConfirm(false)} style={{ ...btnSecondary, flex: 1 }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 사장님 프로필 등록 확인 모달 */}
      {pendingConfirm && (
        <div style={{ ...modalOverlay }}>
          <div style={{ ...modalSheet, maxWidth: 480, margin: "0 auto" }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 8px" }}>{pendingConfirm.title}</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px", lineHeight: 1.6 }}>{pendingConfirm.message}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={pendingConfirm.onConfirm} style={{ ...btnPrimary, flex: 2 }}>확인 (등록으로 이동)</button>
              <button onClick={() => setPendingConfirm(null)} style={{ ...btnSecondary, flex: 1 }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 제안 완료 모달 */}
      {successMatchId && (
        <div style={{ ...modalOverlay }}>
          <div style={{ ...modalSheet, maxWidth: 480, margin: "0 auto" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>제안 완료 🎉</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px", lineHeight: 1.6 }}>
              채용 제안이 정상적으로 완료되었으며 알바생에게 알림이 전송되었습니다.<br />
              알바생이 제안을 수락하면 대화방이 열립니다.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setSuccessMatchId(null)} style={{ ...btnPrimary, flex: 1 }}>확인</button>
            </div>
          </div>
        </div>
      )}

      {/* 봇 채팅 */}
      {showBotChat && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "var(--surface)", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, margin: "0 auto", height: "70vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🤖</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{name} 봇</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>AI 사전 문의 ({MAX_BOT_TURNS - botUserTurns}회 남음)</p>
              </div>
              <button onClick={() => setShowBotChat(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {botMessages.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "78%", background: msg.role === "user" ? "var(--primary)" : "var(--surface2)", borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "4px 18px 18px 18px", padding: "10px 14px", fontSize: 13, color: msg.role === "user" ? "#fff" : "var(--text)", lineHeight: 1.6, whiteSpace: "pre-line" }}>{msg.content}</div>
                </div>
              ))}
              {botSending && <div style={{ display: "flex" }}><div style={{ background: "var(--surface2)", borderRadius: "4px 18px 18px 18px", padding: "10px 14px" }}><div style={{ display: "flex", gap: 4 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--primary)" }} />)}</div></div></div>}
              {botUserTurns < 3 && botMessages.length > 0 && botMessages[botMessages.length - 1]?.role === "assistant" && (
                <div style={{ marginTop: 4 }}>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>💬 이런 것도 물어볼 수 있어요</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {["어떤 업무를 주로 하셨나요?", "장기 근무 가능한가요?", "빠르게 배우는 편인가요?", "팀 분위기를 좋아하시나요?"].map(q => (
                      <button key={q} onClick={() => sendBotMessage(q)} style={{ background: "var(--surface)", border: "1px solid var(--primary-border)", borderRadius: 20, padding: "7px 14px", fontSize: 12, color: "var(--text-muted)", cursor: "pointer", textAlign: "left" }}>{q}</button>
                    ))}
                  </div>
                </div>
              )}
              {isBotMaxReached && (
                <div style={{ textAlign: "center", marginTop: 8 }}>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.6 }}>궁금한 점이 해결됐나요? 😊</p>
                  <button onClick={() => setShowBotChat(false)} style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", fontWeight: 600, padding: "10px 20px", borderRadius: 12, cursor: "pointer", fontSize: 13 }}>프로필로 돌아가기</button>
                </div>
              )}
              <div ref={botBottomRef} />
            </div>
            {!isBotMaxReached && (
              <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", paddingBottom: "calc(10px + env(safe-area-inset-bottom))" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={botInput} onChange={e => setBotInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); sendBotMessage(); } }} placeholder="궁금한 것을 물어보세요..." style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 20, padding: "10px 16px", color: "var(--text)", fontSize: 13, outline: "none" }} />
                  <button onClick={() => sendBotMessage()} disabled={!botInput.trim() || botSending} style={{ width: 40, height: 40, borderRadius: "50%", background: botInput.trim() ? "var(--primary)" : "var(--surface2)", border: "none", color: "#fff", cursor: botInput.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}>→</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {matchModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--surface)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 360, textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
            <h3 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 8px", color: "var(--text)" }}>매칭 성사!</h3>
            <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 24px", lineHeight: 1.6 }}>
              본격적인 채팅 전에<br />AI 사전미팅으로 먼저 알아가볼까요? 😊
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => { setMatchModal(null); router.push(`/pre-meet/${matchModal.matchId}`); }}
                style={{ width: "100%", background: "var(--primary)", border: "none", color: "#fff", fontWeight: 700, padding: 14, borderRadius: 14, fontSize: 15, cursor: "pointer" }}>
                🤖 AI 사전미팅 하기
              </button>
              <button onClick={() => { setMatchModal(null); router.push(`/chat/${matchModal.matchId}`); }}
                style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", fontWeight: 600, padding: 12, borderRadius: 14, fontSize: 14, cursor: "pointer" }}>
                💬 바로 채팅하기
              </button>
              <button onClick={() => setMatchModal(null)}
                style={{ width: "100%", background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: 8 }}>
                나중에
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
