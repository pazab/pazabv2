"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import DaetaRegisterModal from "@/components/daeta/DaetaRegisterModal";
import DaetaSosHome from "@/components/daeta/DaetaSosHome";
import DaetaWorkerHome from "@/components/daeta/DaetaWorkerHome";
import TierBadge from "@/components/TierBadge";
import { getWorkerTiers, DaetaTier } from "@/lib/daetaTier";
import { useToast } from "@/lib/useToast";
import { addRole } from "@/lib/onboarding";
import { getEmployerContext } from "@/lib/permissions";

const FALLBACK_BASE = { lat: 37.5665, lng: 126.9780 };

function toRad(d: number) { return d * Math.PI / 180; }
function calcDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// 방향 A: 후보 카드마다 랜덤 그라데이션을 돌리던 배경 제거 — 사진 없을 때만 보이는 폴백이라 무채색 하나로 통일
const BG_LIST = ["#18181b"];
const ACCENT_LIST = ["#ff9800", "#8b5cf6", "#ec4899", "#22c55e", "#ef4444"];

interface Candidate {
  id: string;
  workerUserId: string;
  name: string;
  score: number;
  distance: string;
  eta: string;
  experience: number;
  category: string;
  dong: string;
  bg: string;
  accent: string;
  badge: string;
  tier: DaetaTier;
  imageUrl?: string;
  videoUrl?: string;
}

async function getDbBase(userId: string): Promise<{ lat: number; lng: number; source: string } | null> {
  // 사장님: employer_profiles.lat/lng
  const { data: ep } = await supabase
    .from("employer_profiles")
    .select("lat, lng")
    .eq("user_id", userId)
    .not("lat", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (ep?.[0]?.lat) return { lat: ep[0].lat, lng: ep[0].lng, source: "매장 주소" };

  // 알바: worker_profiles.lat/lng
  const { data: wp } = await supabase
    .from("worker_profiles")
    .select("lat, lng")
    .eq("user_id", userId)
    .not("lat", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (wp?.[0]?.lat) return { lat: wp[0].lat, lng: wp[0].lng, source: "내 동네" };

  return null;
}

function DaetaPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // SOS 홈 우선 구조 (DESIGN_PLAN.md P1): 로그인 유저는 역할별 홈, 카드덱은 "직접 고르기" 보조 경로
  const [view, setView] = useState<"boot" | "home" | "deck">("boot");

  // "ask" = GPS 허용 요청 화면, "loading" = 매칭 중, "feed" = 피드
  const [step, setStep] = useState<"ask" | "loading" | "feed">("ask");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [baseSource, setBaseSource] = useState("");
  const [index, setIndex] = useState(0);
  const [called, setCalled] = useState<string[]>([]);
  const [animDir, setAnimDir] = useState<"up" | "down" | null>(null);
  const [showVideo, setShowVideo] = useState(false);

  const [isEmployer, setIsEmployer] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // SOS 발행 화면에서 "이 요청이 누구 매장 것인가"에 쓰는 식별자.
  // 사장님 본인이면 currentUserId와 동일, sos_request 권한을 가진 매니저면 소속 사장님 id로 대체된다.
  const [effectiveEmployerId, setEffectiveEmployerId] = useState<string | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [userType, setUserType] = useState<string>("worker");
  const { showToast, ToastUI } = useToast();
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  // New states for real-time Daeta matching & editing
  const [activePosting, setActivePosting] = useState<any | null>(null);
  const [editingPostingId, setEditingPostingId] = useState<string | null>(null);
  const [callingState, setCallingState] = useState<Record<string, { loading: boolean; matchId: string | null }>>({});

  // Location search states
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const handleAddressSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/kakao/local?query=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data.documents || []);
    } catch (err) {
      console.error(err);
      showToast("위치 검색에 실패했습니다.", "error");
    } finally {
      setSearchLoading(false);
    }
  };

  const selectSearchLocation = async (item: any) => {
    const lat = parseFloat(item.y);
    const lng = parseFloat(item.x);
    const sourceName = item.place_name || item.address_name;
    const regionParts = item.address_name.split(" ");
    const dongName = regionParts.slice(-2).join(" ") || sourceName;

    setSearchResults([]);
    setSearchQuery("");
    setShowSearchModal(false);
    setStep("loading");
    await loadCandidates({ lat, lng }, dongName);
  };

  const handleCall = async (c: Candidate) => {
    if (!currentUserId) {
      showToast("로그인이 필요한 서비스입니다.", "error");
      router.push("/login");
      return;
    }
    
    if (!isEmployer || userType !== "both") {
      setIsEmployer(true);
      const next = await addRole(supabase, currentUserId, "employer");
      setUserType(next);
    }
    
    if (!activePosting) {
      showToast("대타 요청을 보내려면 먼저 대타 공고를 등록해 주세요!", "warning");
      setShowRegisterModal(true);
      return;
    }

    setCallingState(prev => ({ ...prev, [c.id]: { loading: true, matchId: null } }));
    try {
      const { data: profile } = await supabase
        .from("employer_profiles")
        .select("id")
        .eq("user_id", currentUserId)
        .or("is_deleted.is.null,is_deleted.eq.false")
        .not("business_name", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const profileId = profile?.id || null;

      const res = await fetch("/api/lovecall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employerId: currentUserId,
          workerId: c.workerUserId,
          senderType: "employer",
          employerProfileId: profileId,
          daetaPostingId: activePosting.id
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "호출 실패");

      const matchId = data.data?.id || null;
      setCalled(prev => [...prev, c.id]);
      setCallingState(prev => ({ ...prev, [c.id]: { loading: false, matchId } }));
      showToast(`🚀 ${c.name} 알바생에게 대타 요청 완료!`);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "요청 중 에러가 발생했습니다.", "error");
      setCallingState(prev => ({ ...prev, [c.id]: { loading: false, matchId: null } }));
    }
  };

  const handleCancelCall = async (c: Candidate) => {
    const matchId = callingState[c.id]?.matchId;
    if (!matchId) {
      setCalled(prev => prev.filter(id => id !== c.id));
      return;
    }

    setPendingConfirm({
      title: "대타 요청 취소",
      message: `${c.name} 알바생에게 보낸 대타 요청을 취소하시겠습니까?`,
      onConfirm: async () => {
        setPendingConfirm(null);
        setCallingState(prev => ({ ...prev, [c.id]: { ...prev[c.id], loading: true } }));
        try {
          const res = await fetch("/api/lovecall", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matchId, action: "cancel" })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "취소 실패");

          setCalled(prev => prev.filter(id => id !== c.id));
          setCallingState(prev => {
            const copy = { ...prev };
            delete copy[c.id];
            return copy;
          });
          showToast("대타 요청이 취소되었습니다.", "info");
        } catch (err: any) {
          console.error(err);
          showToast(err.message || "취소 중 에러가 발생했습니다.", "error");
          setCallingState(prev => ({ ...prev, [c.id]: { ...prev[c.id], loading: false } }));
        }
      }
    });
  };

  // 카드덱(직접 고르기) 진입 시 위치 기반 후보 로드
  async function startDeckFlow() {
    const { data: { user } } = await supabase.auth.getUser();

    // Check if we have a saved localStorage GPS mode first
    const savedMode = localStorage.getItem("daeta_gps_mode");
    if (savedMode === "gps") {
      setStep("loading");
      const pos = await new Promise<GeolocationPosition | null>(resolve => {
        navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 6000 });
      });
      if (pos) {
        await loadCandidates({ lat: pos.coords.latitude, lng: pos.coords.longitude }, "GPS");
        return;
      }
    } else if (savedMode === "no_gps") {
      const savedLat = localStorage.getItem("daeta_custom_lat");
      const savedLng = localStorage.getItem("daeta_custom_lng");
      const savedSource = localStorage.getItem("daeta_custom_source") || "기본값";
      if (savedLat && savedLng) {
        setStep("loading");
        await loadCandidates({ lat: parseFloat(savedLat), lng: parseFloat(savedLng) }, savedSource);
        return;
      }
    }

    // 디폴트 매칭 기준점 로드 시도 (등록한 매장 주소)
    setStep("loading");
    if (user) {
      const db = await getDbBase(user.id);
      if (db) {
        await loadCandidates(db, db.source);
        return;
      }
    }

    // 매장 정보가 없거나 비로그인인 경우 GPS 선택 화면 노출
    setStep("ask");
  }

  useEffect(() => {
    async function initUser() {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        setCurrentUserId(user.id);
        setEffectiveEmployerId(user.id);
        const { data } = await supabase.from("users").select("user_type").eq("id", user.id).single();
        const userTypeTemp = data?.user_type || "worker";
        setUserType(userTypeTemp);
        let employer = userTypeTemp === "employer" || userTypeTemp === "both";

        // 사장님 본인이 아니면, sos_request 권한을 가진 매니저인지 확인해서 소속 사장님 id로 대체
        if (!employer) {
          const ctx = await getEmployerContext(supabase, user.id);
          if (ctx?.isManager && ctx.permissions.sos_request) {
            employer = true;
            setEffectiveEmployerId(ctx.employerId);
          }
        }

        if (employer) setIsEmployer(true);
        setView("home"); // 로그인 유저는 역할별 SOS 홈이 기본
        return;
      }

      // 비로그인 → 기존 카드덱 탐색 흐름
      setView("deck");
      await startDeckFlow();
    }
    initUser();
  }, []);

  const openDeck = () => {
    setView("deck");
    startDeckFlow();
  };

  const backToHome = () => {
    if (currentUserId) setView("home");
    else router.back();
  };

  useEffect(() => {
    setShowVideo(false);
  }, [index]);

  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);

  async function startWithGps() {
    localStorage.setItem("daeta_gps_mode", "gps");
    setStep("loading");
    const pos = await new Promise<GeolocationPosition | null>(resolve => {
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 6000 });
    });
    if (pos) {
      await loadCandidates({ lat: pos.coords.latitude, lng: pos.coords.longitude }, "GPS");
    } else {
      await startWithoutGps();
    }
  }

  async function startWithoutGps() {
    localStorage.setItem("daeta_gps_mode", "no_gps");
    setStep("loading");
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const db = await getDbBase(user.id);
      if (db) {
        localStorage.setItem("daeta_custom_lat", String(db.lat));
        localStorage.setItem("daeta_custom_lng", String(db.lng));
        localStorage.setItem("daeta_custom_source", db.source);
        await loadCandidates(db, db.source);
        return;
      }
    }
    await loadCandidates(FALLBACK_BASE, "기본값");
  }

  async function loadCandidates(base: { lat: number; lng: number }, source: string) {
    setBaseSource(source);

    const checkUserId = currentUserId || (await supabase.auth.getUser()).data.user?.id;
    let checkIsEmployer = isEmployer;
    if (checkUserId && !checkIsEmployer) {
      const { data } = await supabase.from("users").select("user_type").eq("id", checkUserId).single();
      const uType = data?.user_type || "worker";
      checkIsEmployer = uType === "employer" || uType === "both";
    }

    // 사장님인 경우 가장 최근 등록한 pending 대타 공고의 필수 자격 요건 조회
    let reqCreds: any[] = [];
    if (checkIsEmployer && checkUserId) {
      const { data: candidatePostings } = await supabase
        .from("daeta_postings")
        .select("*")
        .eq("user_id", checkUserId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5);

      // 근무 시작 시각(expires_at)이 지났는데 방치된 공고는 크론 없이 조회 시점에 만료 처리
      const nowIso = new Date().toISOString();
      const expiredIds = (candidatePostings || []).filter(p => p.expires_at && p.expires_at < nowIso).map(p => p.id);
      if (expiredIds.length > 0) {
        supabase.from("daeta_postings").update({ status: "expired" }).in("id", expiredIds);
      }
      const posting = (candidatePostings || []).find(p => !p.expires_at || p.expires_at >= nowIso) || null;
      if (posting) {
        setActivePosting(posting);
        if (posting.required_credentials) {
          try {
            reqCreds = typeof posting.required_credentials === "string"
              ? JSON.parse(posting.required_credentials)
              : (Array.isArray(posting.required_credentials) ? posting.required_credentials : []);
          } catch (e) {
            reqCreds = [];
          }
        }
      } else {
        setActivePosting(null);
      }
    }

    const { data, error } = await supabase
      .from("worker_profiles")
      .select(`
        id, user_id, desired_type, desired_region, experience_months,
        available_now, lat, lng, credentials, image_url, video_url,
        users!worker_profiles_user_id_fkey (
          id, nickname, trust_score, avatar_url
        )
      `)
      .eq("is_active", true)
      .eq("is_public", true)
      .limit(50);


    if (error || !data) { setStep("feed"); return; }

    // 사장님의 필수 자격요건을 충족하는 알바생만 필터링
    const matchedData = data.filter((wp: any) => {
      if (reqCreds.length === 0) return true;
      const workerCreds: any[] = Array.isArray(wp.credentials)
        ? wp.credentials
        : [];
      // 사장님이 지정한 모든 자격을 알바생이 갖고 있는지 검증
      return reqCreds.every(req => workerCreds.some((wc: any) => wc.name === req.name));
    });

    // 2-Tier 판정 (Tier1 ✅검증 상단 우선 — STRATEGY.md §4)
    const workerIds = [...new Set(matchedData.map((wp: any) => wp.user_id as string))];
    const tierMap = await getWorkerTiers(supabase, workerIds);

    const list: Candidate[] = matchedData
      .map((p: any, i: number) => {
        const user = p.users;
        const dist = calcDistance(base, { lat: p.lat, lng: p.lng });
        const distStr = dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`;
        const walkMin = Math.round(dist * 1000 / 80);
        const regionParts = (p.desired_region || "").split(" ");
        const dong = regionParts.slice(-2).join(" ");
        const imageUrl = p.image_url || user?.avatar_url || "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=800&q=80";
        const videoUrl = p.video_url;
        return {
          id: p.id,
          workerUserId: p.user_id,
          name: user?.nickname || "익명",
          score: user?.trust_score ?? 50,
          distance: distStr,
          distNum: dist,
          eta: `${walkMin}분`,
          experience: p.experience_months || 0,
          category: p.desired_type || "알바",
          dong,
          bg: BG_LIST[i % BG_LIST.length],
          accent: ACCENT_LIST[i % ACCENT_LIST.length],
          badge: `AI ${i + 1}순위`,
          tier: tierMap[p.user_id] || "tier2",
          imageUrl,
          videoUrl,
        };
      })
      .sort((a: any, b: any) => {
        // Tier1(검증) 항상 상단, 그 안에서 거리→신뢰점수
        if (a.tier !== b.tier) return a.tier === "tier1" ? -1 : 1;
        if (Math.abs(a.distNum - b.distNum) < 0.5) return b.score - a.score;
        return a.distNum - b.distNum;
      })
      .slice(0, 10);

    setCandidates(list);
    setStep("feed");
  }

  const c = candidates[index];
  const isCalled = c ? called.includes(c.id) : false;

  function goTo(nextIndex: number, dir: "up" | "down") {
    if (nextIndex < 0 || nextIndex >= candidates.length) return;
    setAnimDir(dir);
    setTimeout(() => { setIndex(nextIndex); setAnimDir(null); }, 280);
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
  }
  function onTouchEnd(e: React.TouchEvent) {
    const dy = touchStartY.current - e.changedTouches[0].clientY;
    const dt = Date.now() - touchStartTime.current;
    if (Math.abs(dy) > 50 && dt < 500) {
      if (dy > 0) goTo(index + 1, "up");
      else goTo(index - 1, "down");
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") goTo(index - 1, "down");
      if (e.key === "ArrowDown") goTo(index + 1, "up");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [index, candidates.length]);

  // ── 부팅 중 ──
  if (view === "boot") return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg, #0a0a0f)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--gradient-hero)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, animation: "pulse 1.5s ease-in-out infinite", color: "#fff" }}><i className="ti ti-bolt" aria-hidden="true" /></div>
      <style>{`@keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }`}</style>
    </div>
  );

  // ── 단일 통합 대타 허브 홈 ──
  if (view === "home" && currentUserId) {
    return (
      <DaetaSosHome
        userId={effectiveEmployerId || currentUserId}
        userType={userType}
        onOpenDeck={openDeck}
        roleView={isEmployer ? "employer" : "worker"}
      />
    );
  }

  // ── GPS 허용 요청 화면 ──
  if (step === "ask") return (
    <div style={{ position: "fixed", inset: 0, background: "#0a0a0f", display: "flex", flexDirection: "column" }}>
      {/* 배경 그라디언트 */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 30%, #1a1060 0%, transparent 65%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 2 }}>
        <AppHeader showBack onBack={backToHome} title="대타" showBellAndMenu />
      </div>

      {/* 중앙 콘텐츠 */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", position: "relative", zIndex: 2 }}>
        {/* 아이콘 */}
        <div style={{ width: 96, height: 96, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 32, boxShadow: "var(--shadow-elevate)" }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
            <path d="M12 21s-8-7.5-8-12a8 8 0 1 1 16 0c0 4.5-8 12-8 12z"/>
            <circle cx="12" cy="9" r="2.5"/>
          </svg>
        </div>

        <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginBottom: 12, textAlign: "center", letterSpacing: "-0.5px" }}>
          근처 대타를 찾으려면<br/>위치가 필요해요
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", textAlign: "center", lineHeight: 1.6, marginBottom: 48 }}>
          현재 위치를 기준으로 가장 빠르게<br/>올 수 있는 사람을 찾아드려요
        </div>

        {/* 허용 버튼 */}
        <button
          onClick={startWithGps}
          style={{ width: "100%", maxWidth: 320, padding: "18px", background: "var(--primary)", border: "none", borderRadius: 18, fontSize: 16, fontWeight: 800, color: "#fff", cursor: "pointer", marginBottom: 14, boxShadow: "var(--shadow-elevate)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
        >
          <i className="ti ti-map-pin" aria-hidden="true" /> 현재 위치로 찾기
        </button>

        {/* 거부 버튼 */}
        <button
          onClick={startWithoutGps}
          style={{ width: "100%", maxWidth: 320, padding: "16px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 18, fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.55)", cursor: "pointer", marginBottom: 20 }}
        >
          위치 없이 계속하기
        </button>

        {/* 직접 주소 검색 추가 */}
        <div style={{ width: "100%", maxWidth: 320, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 10, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}><i className="ti ti-search" aria-hidden="true" /> 또는 위치 직접 검색</div>
          <div style={{ display: "flex", gap: 8, position: "relative" }}>
            <input
              type="text"
              placeholder="동명, 매장 주소 검색 (예: 음봉면)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddressSearch(); }}
              style={{
                flex: 1,
                padding: "12px 14px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                color: "#fff",
                fontSize: 13,
                outline: "none"
              }}
            />
            <button
              onClick={handleAddressSearch}
              style={{
                padding: "0 14px",
                background: "rgba(139, 92, 246, 0.2)",
                border: "1px solid rgba(139, 92, 246, 0.4)",
                borderRadius: 12,
                color: "#c4b5fd",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              검색
            </button>

            {/* 검색 결과 레이어 */}
            {searchResults.length > 0 && (
              <div style={{
                position: "absolute",
                bottom: "105%",
                left: 0,
                right: 0,
                background: "#18181b",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14,
                maxHeight: 180,
                overflowY: "auto",
                zIndex: 100,
                boxShadow: "var(--shadow-elevate)"
              }}>
                {searchResults.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => selectSearchLocation(item)}
                    style={{
                      padding: "12px 16px",
                      borderBottom: idx < searchResults.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                      cursor: "pointer",
                      textAlign: "left"
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{item.place_name || item.address_name}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{item.address_name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ paddingBottom: 40, textAlign: "center", position: "relative", zIndex: 2 }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>위치 정보는 매칭에만 사용되며 저장되지 않아요</span>
      </div>
    </div>
  );

  // ── 로딩 ──
  if (step === "loading") return (
    <div style={{ position: "fixed", inset: 0, background: "#0a0a0f", display: "flex", flexDirection: "column" }}>
      <AppHeader showBack onBack={backToHome} title="대타" showBellAndMenu />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", animation: "pulse 1.5s ease-in-out infinite" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 21s-8-7.5-8-12a8 8 0 1 1 16 0c0 4.5-8 12-8 12z"/><circle cx="12" cy="9" r="2.5"/></svg>
      </div>
      <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>근처 대타 매칭 중...</div>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>출근확률 높은 순으로 고르는 중</div>
      <style>{`@keyframes pulse { 0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(139,92,246,0.4)} 50%{transform:scale(1.08);box-shadow:0 0 0 16px rgba(139,92,246,0)} }`}</style>
      </div>
    </div>
  );

  // ── 결과 없음 ──
  if (!c) return (
    <div style={{ position: "fixed", inset: 0, background: "#0a0a0f", display: "flex", flexDirection: "column" }}>
      <AppHeader showBack onBack={backToHome} title="대타" showBellAndMenu />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <div style={{ fontSize: 40 }}>😅</div>
        <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>현재 근처에 대타 가능한 인원이 없어요</div>
      </div>
    </div>
  );

  const scoreColor = c.score >= 80 ? "#22c55e" : c.score >= 60 ? "#eab308" : "#f97316";
  const slideStyle: React.CSSProperties = {
    transform: animDir === "up" ? "translateY(-100%)" : animDir === "down" ? "translateY(100%)" : "translateY(0)",
    transition: animDir ? "transform 0.28s cubic-bezier(0.4,0,0.2,1)" : "none",
    opacity: animDir ? 0 : 1,
  };

  return (
    // PC에서 폰 비율로 중앙 정렬, 모바일에서 full-screen
    <div style={{ position: "fixed", inset: 0, background: "#000", display: "flex", justifyContent: "center" }}>
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{ position: "relative", width: "100%", maxWidth: 430, height: "100%", background: "#000", overflow: "hidden", display: "flex", flexDirection: "column", ...slideStyle }}
    >
      {/* Background Image / Video */}
      {c.videoUrl && showVideo ? (
        <video
          src={c.videoUrl}
          autoPlay
          loop
          muted
          playsInline
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 1 }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${c.imageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            zIndex: 1
          }}
        />
      )}

      {/* Dark Gradient Overlay for text readability */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.1) 80%, transparent 100%)",
          zIndex: 2,
          pointerEvents: "none"
        }}
      />

      {/* 숏폼 영상 프로필 토글 버튼 */}
      {c.videoUrl && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowVideo(!showVideo);
          }}
          style={{
            position: "absolute",
            top: 76,
            right: 16,
            zIndex: 10,
            background: "rgba(0, 0, 0, 0.65)",
            border: "1px solid rgba(255, 255, 255, 0.25)",
            borderRadius: 20,
            padding: "8px 14px",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            backdropFilter: "blur(8px)",
            boxShadow: "var(--shadow-elevate)",
            outline: "none"
          }}
        >
          {showVideo ? (<><i className="ti ti-photo" aria-hidden="true" /> 사진 프로필</>) : (<><i className="ti ti-video" aria-hidden="true" /> 영상 프로필 (5초)</>)}
        </button>
      )}

      {/* 헤더 */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }}>
        <AppHeader
          showBack
          onBack={backToHome}
          title="대타"
          showBellAndMenu
          rightActions={
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {currentUserId && (
                <button
                  onClick={() => router.push(`/mypage/daeta-history?tab=${isEmployer ? "employer" : "worker"}`)}
                  style={{
                    background: "rgba(255,255,255,0.15)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: "10px",
                    padding: "4px 8px",
                    color: "#fff",
                    fontSize: "11px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  <i className="ti ti-list" aria-hidden="true" /> 내 대타내역
                </button>
              )}
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {candidates.map((_, i) => (
                  <div key={i} style={{ width: i === index ? 20 : 6, height: 6, borderRadius: 3, background: i === index ? "#fff" : "rgba(255,255,255,0.3)", transition: "all 0.3s ease" }} />
                ))}
              </div>
            </div>
          }
        />
      </div>

      {/* 사장님의 현재 모집중 대타 공고 정보 바 */}
      {isEmployer && activePosting && (
        <div style={{
          position: "absolute",
          top: 76,
          left: 16,
          right: c.videoUrl ? 150 : 16,
          zIndex: 10,
          background: "rgba(0, 0, 0, 0.72)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: 16,
          padding: "8px 12px",
          color: "#fff",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backdropFilter: "blur(8px)",
          boxShadow: "var(--shadow-elevate)"
        }}>
          <div style={{ flex: 1, overflow: "hidden", marginRight: 8 }}>
            <span style={{ fontSize: 10, color: "#c4b5fd", fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}><i className="ti ti-speakerphone" aria-hidden="true" /> 매칭 기준 공고</span>
            <div style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {activePosting.business_name} ({activePosting.work_date})
            </div>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>
              {activePosting.work_hours.split("~")[0].trim()}시 | 시급 {activePosting.wage.toLocaleString()}원
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => {
                setEditingPostingId(activePosting.id);
                setShowRegisterModal(true);
              }}
              style={{
                background: "var(--primary)",
                border: "none",
                borderRadius: 8,
                padding: "6px 10px",
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              수정
            </button>
            <button
              onClick={() => {
                setPendingConfirm({
                  title: "대타 공고 취소",
                  message: "이 대타 구인 공고를 정말 취소하시겠습니까? 공고가 삭제되며 진행 중인 매칭 요청도 취소됩니다.",
                  onConfirm: async () => {
                    setPendingConfirm(null);
                    try {
                      const { error } = await supabase
                        .from("daeta_postings")
                        .update({ status: "cancelled" })
                        .eq("id", activePosting.id);
                      if (error) throw error;
                      showToast("대타 공고가 취소되었습니다.", "info");
                      startWithoutGps();
                    } catch (err: any) {
                      showToast("공고 취소 실패: " + err.message, "error");
                    }
                  }
                });
              }}
              style={{
                background: "rgba(239, 68, 68, 0.2)",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                borderRadius: 8,
                padding: "6px 10px",
                color: "#f87171",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 콘텐츠 */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "60px 20px 36px", position: "relative", zIndex: 5 }}>
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: c.accent, background: `${c.accent}22`, border: `1px solid ${c.accent}55`, padding: "5px 12px", borderRadius: 20 }}>
            {c.badge}
          </span>
          <TierBadge tier={c.tier} size="md" />
        </div>

        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 38, fontWeight: 900, color: "#fff", letterSpacing: "-1px" }}>{c.name}</span>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s-8-7.5-8-12a8 8 0 1 1 16 0c0 4.5-8 12-8 12z"/><circle cx="12" cy="9" r="2.5"/></svg>
            {isCalled ? `${c.dong} (상세주소 전달됨)` : c.dong}
            {!isCalled && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginLeft: 4 }}>(호출 후 공개)</span>}
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)" }}>{c.category}</div>
        </div>

        {/* 출근확률 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 600, letterSpacing: 1 }}>출근확률</span>
            <span style={{ fontSize: 20, fontWeight: 900, color: scoreColor }}>{c.score}%</span>
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 2 }}>
            <div style={{ height: "100%", width: `${c.score}%`, background: `linear-gradient(90deg, ${scoreColor}88, ${scoreColor})`, borderRadius: 2, transition: "width 0.8s ease" }} />
          </div>
        </div>

        {/* 칩 */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
          {[
            { icon: "ti-map-pin", text: c.distance },
            { icon: "ti-clock", text: `${c.eta} 후 도착` },
            { icon: "ti-briefcase", text: `경험 ${c.experience}개월` },
          ].map(chip => (
            <span key={chip.icon} style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", background: "rgba(255,255,255,0.1)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)", padding: "6px 12px", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <i className={`ti ${chip.icon}`} aria-hidden="true" /> {chip.text}
            </span>
          ))}
        </div>

        {/* 버튼 */}
        <div style={{ display: "flex", gap: 12 }}>
          {!isCalled ? (
            <button
              onClick={() => handleCall(c)}
              disabled={callingState[c.id]?.loading}
              style={{
                flex: 1,
                padding: "16px",
                background: c.accent,
                border: "none",
                borderRadius: 16,
                fontSize: 16,
                fontWeight: 800,
                color: "#fff",
                cursor: "pointer",
                boxShadow: "var(--shadow-elevate)",
                opacity: callingState[c.id]?.loading ? 0.7 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              {callingState[c.id]?.loading ? "전송 중..." : (<><i className="ti ti-rocket" aria-hidden="true" /> 대타 SOS 요청</>)}
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8, flex: 1 }}>
              <div style={{ flex: 2, padding: "8px 16px", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 16, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#22c55e", display: "flex", alignItems: "center", gap: 4 }}><i className="ti ti-circle-check" aria-hidden="true" /> 요청 완료</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>응답 대기 중</div>
              </div>
              <button
                onClick={() => handleCancelCall(c)}
                disabled={callingState[c.id]?.loading}
                style={{
                  flex: 1,
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  borderRadius: 16,
                  color: "#f87171",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                {callingState[c.id]?.loading ? "취소 중..." : "요청 취소"}
              </button>
            </div>
          )}
          {index < candidates.length - 1 && (
            <button onClick={() => goTo(index + 1, "up")} style={{ width: 54, height: 54, background: "rgba(255,255,255,0.1)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* 우측 액션 */}
      <div style={{ position: "absolute", right: 16, bottom: 190, display: "flex", flexDirection: "column", gap: 16, zIndex: 10 }}>
        {[{ icon: "ti-heart", label: "찜" }, { icon: "ti-message-circle", label: "문의" }, { icon: "ti-bookmark", label: "저장" }].map(item => (
          <button key={item.label} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#fff" }}><i className={`ti ${item.icon}`} aria-hidden="true" /></div>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>{item.label}</span>
          </button>
        ))}
      </div>

      {isEmployer && currentUserId && (
        <button
          onClick={() => setShowRegisterModal(true)}
          style={{
            position: "absolute",
            right: 16,
            bottom: 120,
            borderRadius: "30px",
            background: "var(--gradient-hero)",
            border: "none",
            color: "#fff",
            padding: "8px 12px",
            fontSize: "13px",
            fontWeight: "800",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            boxShadow: "var(--shadow-elevate)",
            zIndex: 100,
            outline: "none",
            transition: "transform 0.15s ease-in-out"
          }}
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05)"}
          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
          title="대타 긴급 구인 등록"
        >
          {/* 헤더의 대타 불꽃 SVG 로고 */}
          <svg width="48" height="24" viewBox="0 0 512 256" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
            <defs>
              <linearGradient id="btnFireFill" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="30%" stopColor="#ffe082" />
                <stop offset="60%" stopColor="#ff9800" />
                <stop offset="100%" stopColor="#ff3d00" />
              </linearGradient>
              <linearGradient id="btnFireStroke" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ff6d00" />
                <stop offset="100%" stopColor="#d84315" />
              </linearGradient>
            </defs>
            <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle"
              fontFamily="Pretendard, Apple SD Gothic Neo, Noto Sans KR, sans-serif"
              fontSize="140" fontWeight="900"
              fill="none" stroke="url(#btnFireStroke)" strokeWidth="10" strokeLinejoin="round"
              transform="skewX(-12)">대타</text>
            <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle"
              fontFamily="Pretendard, Apple SD Gothic Neo, Noto Sans KR, sans-serif"
              fontSize="140" fontWeight="900"
              fill="url(#btnFireFill)"
              transform="skewX(-12)">대타</text>
          </svg>
          <span style={{ fontSize: "16px", fontWeight: "900", lineHeight: "1", color: "#fff" }}>+</span>
        </button>
      )}

      {showRegisterModal && currentUserId && (
        <DaetaRegisterModal
          userId={effectiveEmployerId || currentUserId}
          postingId={editingPostingId}
          onClose={() => {
            setShowRegisterModal(false);
            setEditingPostingId(null);
          }}
          onSuccess={async (newPostingId) => {
            const wasEditing = !!editingPostingId;
            setShowRegisterModal(false);
            setEditingPostingId(null);
            // 신규 등록이면 SOS 에스컬레이션 발동 (팀 내 → 동네 Tier1)
            if (!wasEditing && newPostingId) {
              try {
                await fetch("/api/daeta/sos", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ postingId: newPostingId }),
                });
              } catch (e) {
                console.error("SOS 발동 실패:", e);
              }
            }
            startWithoutGps();
          }}
        />
      )}

      {pendingConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 10000, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "var(--surface)", borderRadius: "24px 24px 0 0", padding: 24, width: "100%", maxWidth: 430, margin: "0 auto", borderTop: "1px solid rgba(255,255,255,0.08)", color: "#fff" }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 8px" }}>{pendingConfirm.title}</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px", lineHeight: 1.6 }}>{pendingConfirm.message}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={pendingConfirm.onConfirm}
                style={{ flex: 2, padding: "14px", background: "var(--danger)", border: "none", borderRadius: 14, color: "#fff", fontWeight: 700, cursor: "pointer" }}
              >
                확인
              </button>
              <button
                onClick={() => setPendingConfirm(null)}
                style={{ flex: 1, padding: "14px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 14, color: "var(--text-muted)", fontWeight: 700, cursor: "pointer" }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 위치 수동 변경 검색 모달 바텀 시트 */}
      {showSearchModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 11000, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "var(--surface)", borderRadius: "24px 24px 0 0", padding: 24, width: "100%", maxWidth: 430, margin: "0 auto", borderTop: "1px solid rgba(255,255,255,0.08)", color: "#fff", paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>위치 변경</h3>
              <button onClick={() => { setShowSearchModal(false); setSearchResults([]); setSearchQuery(""); }} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            
            {/* 위치 재설정 액션 버튼 그룹 */}
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <button
                onClick={async () => {
                  setShowSearchModal(false);
                  setSearchResults([]);
                  setSearchQuery("");
                  setStep("loading");
                  const pos = await new Promise<GeolocationPosition | null>(resolve => {
                    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 6000 });
                  });
                  if (pos) {
                    await loadCandidates({ lat: pos.coords.latitude, lng: pos.coords.longitude }, "GPS");
                  } else {
                    showToast("GPS를 수신할 수 없습니다.", "error");
                    startWithoutGps();
                  }
                }}
                style={{
                  flex: 1,
                  padding: "12px 10px",
                  background: "var(--primary)",
                  border: "none",
                  borderRadius: 12,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4
                }}
              >
                <i className="ti ti-map-pin" aria-hidden="true" /> 내 GPS 위치
              </button>
              
              <button
                onClick={async () => {
                  setShowSearchModal(false);
                  setSearchResults([]);
                  setSearchQuery("");
                  setStep("loading");
                  const { data: { user } } = await supabase.auth.getUser();
                  if (user) {
                    const db = await getDbBase(user.id);
                    if (db) { await loadCandidates(db, db.source); return; }
                  }
                  showToast("매장 주소를 찾을 수 없습니다.", "error");
                  startWithoutGps();
                }}
                style={{
                  flex: 1,
                  padding: "12px 10px",
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4
                }}
              >
                <i className="ti ti-building-store" aria-hidden="true" /> 등록된 매장 위치
              </button>
            </div>

            <div style={{ position: "relative", marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  placeholder="동명 또는 매장 주소 검색 (예: 역삼동)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddressSearch(); }}
                  style={{
                    flex: 1,
                    padding: "14px 16px",
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    color: "#fff",
                    fontSize: 14,
                    outline: "none"
                  }}
                />
                <button
                  onClick={handleAddressSearch}
                  style={{
                    padding: "0 16px",
                    background: "rgba(255, 255, 255, 0.1)",
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  검색
                </button>
              </div>
            </div>

            {/* 검색 결과 리스트 */}
            {searchLoading ? (
              <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>검색 중...</div>
            ) : searchResults.length > 0 ? (
              <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 14, marginTop: 8 }}>
                {searchResults.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => selectSearchLocation(item)}
                    style={{
                      padding: "14px 16px",
                      borderBottom: idx < searchResults.length - 1 ? "1px solid var(--border)" : "none",
                      cursor: "pointer",
                      transition: "background 0.2s"
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{item.place_name || item.address_name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{item.address_name}</div>
                  </div>
                ))}
              </div>
            ) : searchQuery && !searchLoading ? (
              <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>검색 결과가 없습니다.</div>
            ) : null}
          </div>
        </div>
      )}

      {ToastUI}

      <style>{`@keyframes bounce { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(6px)} }`}</style>
    </div>
    </div>
  );
}

export default function DaetaPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "var(--text-muted)" }}>로딩 중...</p></div>}>
      <DaetaPageContent />
    </Suspense>
  );
}
