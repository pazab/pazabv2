"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Suspense } from "react";
import { getMatchLevel } from "@/lib/utils";
import AppHeader from "@/components/AppHeader";
import { getGrade } from "@/lib/trustScore";
import { JobCard, CardProps } from "@/components/JobCard";

const SORT_OPTIONS = [
  { key: "추천순", icon: "✦" },
  { key: "인기순", icon: "❤" },
  { key: "긴급순", icon: "⚡" },
] as const;

type SortKey = typeof SORT_OPTIONS[number]["key"];

const GRADE_EMOJI: Record<string, string> = {
  bronze: "🥉", silver: "🥈", gold: "🥇", platinum: "💎",
};

const WORKER_TYPE_EMOJI: Record<string, string> = {
  "폭풍처리형": "⚡", "꼼꼼탐정형": "🔍", "공감마스터형": "💕",
  "돌격대장형": "🚀", "묵묵수행형": "🎯", "분위기메이커형": "🌟",
  "철벽약속형": "🤝", "에너자이저형": "💪", "스펀지흡수형": "🧠",
  "든든한실전형": "🛡️", "아이디어뱅크형": "💡", "만능재주꾼형": "🎨",
};



function SectionHeader({ title, count, onMore }: { title: string; count?: number; onMore?: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", margin: 0, letterSpacing: "-0.3px" }}>
        {title}
        {count != null && <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400, marginLeft: 6 }}>{count}</span>}
      </h2>
      {onMore && <button onClick={onMore} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer", padding: 0 }}>전체보기 →</button>}
    </div>
  );
}

function HorizontalScroll({ items, cardProps }: { items: Record<string, unknown>[]; cardProps: (item: Record<string, unknown>) => CardProps }) {
  return (
    <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingLeft: 16, paddingRight: 16, scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
      {items.map((item, i) => (
        <div key={String(item.id || item.user_id) + i} style={{ width: 240, flexShrink: 0 }}>
          <JobCard {...cardProps(item)} />
        </div>
      ))}
    </div>
  );
}

function ExploreContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type") as "worker" | "employer" | null;

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"worker" | "employer">(typeParam || "worker");
  const [showBothTabs, setShowBothTabs] = useState(true);
  const [myRegion, setMyRegion] = useState("");
  const [allItems, setAllItems] = useState<Record<string, unknown>[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>("추천순");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllSection, setShowAllSection] = useState<string | null>(null);

  interface SheetItem {
    id?: string; user_id?: string; image_url?: string;
    image_urls?: string[]; video_url?: string | null;
    employer_avatar?: string; worker_avatar?: string;
    business_name?: string; worker_type?: string; worker_name?: string;
    employer_name?: string; business_type?: string; desired_type?: string;
    trust_score?: number; match_score?: number;
    wage?: number; work_days?: string; region?: string; work_hours?: string;
    desired_region?: string; desired_wage?: number;
    tags?: string[] | string; meal_provided?: boolean;
    like_count?: number; view_count?: number;
    available_now?: boolean; is_long_term?: boolean;
    experience?: string; experience_months?: number;
    grade?: string; tagline?: string;
    is_urgent?: boolean; expires_at?: string;
    job_type?: string; work_start_date?: string; work_end_date?: string;
  }
  const [bottomSheet, setBottomSheet] = useState<SheetItem | null>(null);
  const [bsActiveMediaIndex, setBsActiveMediaIndex] = useState(0);
  const isFetching = useRef(false);

  // 필터 관련 상태 변수들
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [filterIndustry, setFilterIndustry] = useState<string>(""); // 업종
  const [filterJobType, setFilterJobType] = useState<string>(""); // 공고유형 (regular, short, urgent)
  const [filterWage, setFilterWage] = useState<number>(0); // 시급 기준
  const [filterWageNegotiable, setFilterWageNegotiable] = useState<boolean | null>(null); // 시급협의 여부
  const [filterDays, setFilterDays] = useState<string>(""); // 요일 (평일, 주말)
  const [filterMealProvided, setFilterMealProvided] = useState<boolean | null>(null); // 식사 제공
  const [filterParking, setFilterParking] = useState<boolean | null>(null); // 주차 가능
  
  // 구직자 관련 필터
  const [filterAvailableNow, setFilterAvailableNow] = useState<boolean | null>(null); // 즉시 근무
  const [filterLongTerm, setFilterLongTerm] = useState<string>(""); // 근무기간 (long, short)
  const [filterExperience, setFilterExperience] = useState<boolean | null>(null); // 경력 있음

  const resetFilters = () => {
    setFilterIndustry("");
    setFilterJobType("");
    setFilterWage(0);
    setFilterWageNegotiable(null);
    setFilterDays("");
    setFilterMealProvided(null);
    setFilterParking(null);
    setFilterAvailableNow(null);
    setFilterLongTerm("");
    setFilterExperience(null);
  };

  const isFilterActive = 
    filterIndustry !== "" ||
    filterJobType !== "" ||
    filterWage !== 0 ||
    filterWageNegotiable !== null ||
    filterDays !== "" ||
    filterMealProvided !== null ||
    filterParking !== null ||
    filterAvailableNow !== null ||
    filterLongTerm !== "" ||
    filterExperience !== null;

  useEffect(() => {
    setBsActiveMediaIndex(0);
  }, [bottomSheet]);

  useEffect(() => { init(); }, []);

  const init = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    let uid: string | null = null;
    if (session) {
      uid = session.user.id;
      setIsLoggedIn(true);
      setUserId(uid);
      const { data: userData } = await supabase.from("users").select("user_type").eq("id", uid).single();
      const dbType = userData?.user_type;
      setShowBothTabs(dbType === "both" ||
        (!!(localStorage.getItem("interview_result_basic_worker")) && !!(localStorage.getItem("interview_result_basic_employer"))));
      const mode = typeParam || (dbType === "employer" ? "employer" : "worker");
      setViewMode(mode as "worker" | "employer");
      if (mode === "worker") {
        const { data: wps } = await supabase.from("worker_profiles").select("desired_region").eq("user_id", uid).order("created_at", { ascending: false }).limit(1);
        const wp = wps?.[0] || null;
        setMyRegion(String(wp?.desired_region || ""));
      } else {
        const { data: eps } = await supabase.from("employer_profiles").select("region").eq("user_id", uid).order("created_at", { ascending: false }).limit(1);
        const ep = eps?.[0] || null;
        const { data: wps } = await supabase.from("worker_profiles").select("desired_region").eq("user_id", uid).order("created_at", { ascending: false }).limit(1);
        const wp = wps?.[0] || null;
        setMyRegion(String(ep?.region || wp?.desired_region || ""));
      }
      await fetchItems(mode as "worker" | "employer", uid);
    } else {
      setShowBothTabs(true);
      await fetchItems(typeParam || "worker", null);
    }
    setLoading(false);
  };

  const fetchItems = useCallback(async (mode: "worker" | "employer", uid: string | null) => {
    if (isFetching.current) return;
    isFetching.current = true;
    try {
      if (uid) {
        const res = await fetch("/api/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: uid, userType: mode }) });
        const data = await res.json();
        if (data.success && data.results?.length > 0) {
          setAllItems(data.results);
          setLikedIds(new Set<string>(data.results.filter((r: Record<string, unknown>) => r.is_liked).map((r: Record<string, unknown>) => String(r.id || r.user_id))));
          isFetching.current = false;
          return;
        }
      }
      await loadRaw(mode);
    } catch { await loadRaw(mode); }
    isFetching.current = false;
  }, []);

  const loadRaw = async (mode: "worker" | "employer") => {
    if (mode === "worker") {
      const { data } = await supabase.from("employer_profiles")
        .select("*, users!employer_profiles_user_id_fkey(avatar_url, name, nickname)")
        .eq("is_active", true).eq("is_deleted", false).neq("job_type", "urgent")
        .gte("expires_at", new Date().toISOString()).limit(1000);
      setAllItems((data || []).map(d => ({ ...d, id: d.id || d.user_id, employer_avatar: (d.users as Record<string, unknown>)?.avatar_url, employer_name: (d.users as Record<string, unknown>)?.nickname || (d.users as Record<string, unknown>)?.name, match_score: null })));
    } else {
      const { data } = await supabase.from("worker_profiles").select("*, users!worker_profiles_user_id_fkey(trust_score, avatar_url, name, nickname)").eq("is_active", true).limit(1000);
      setAllItems((data || []).filter(w => w.is_public !== false && (!w.job_status || w.job_status === "active" || w.job_status === "open")).map(d => ({ ...d, id: d.user_id, worker_avatar: (d.users as Record<string, unknown>)?.avatar_url, worker_name: (d.users as Record<string, unknown>)?.nickname || (d.users as Record<string, unknown>)?.name, trust_score: (d.users as Record<string, unknown>)?.trust_score ?? 50, match_score: null })));
    }
  };

  const handleViewMode = async (mode: "worker" | "employer") => {
    if (mode === viewMode) return;
    setViewMode(mode); setAllItems([]); setLoading(true); setShowAllSection(null); setSearchQuery(""); setBottomSheet(null);
    setSortBy("추천순");
    router.push(`/explore?type=${mode}`);
    await fetchItems(mode, userId);
    setLoading(false);
  };

  const handleLike = async (targetId: string, currentlyLiked: boolean) => {
    if (!isLoggedIn || !userId) { router.push("/login"); return; }
    const targetType = viewMode === "worker" ? "employer" : "worker";
    setLikedIds(prev => { const next = new Set(prev); if (currentlyLiked) next.delete(targetId); else next.add(targetId); return next; });
    setAllItems(prev => prev.map(item => { const id = String(item.id || item.user_id); if (id !== targetId) return item; return { ...item, like_count: Number(item.like_count || 0) + (currentlyLiked ? -1 : 1) }; }));
    await fetch("/api/likes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, targetId, targetType, action: currentlyLiked ? "unlike" : "like" }) });
  };

  const handleLovecall = async (targetId: string) => {
    if (!userId) { router.push("/login"); return; }
    router.push(`${viewMode === "worker" ? `/job/${targetId}` : `/worker/${targetId}`}?action=lovecall`);
  };

  const filtered = allItems.filter(item => {
    // 1. 검색어 필터링
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const nameStr = `${item.business_name || ""} ${item.worker_type || ""} ${item.worker_name || ""} ${item.employer_name || ""}`;
      const regionStr = `${item.region || ""} ${item.desired_region || ""}`;
      const typeStr = `${item.business_type || ""} ${item.desired_type || ""}`;
      
      const matchesSearch = nameStr.toLowerCase().includes(q)
        || regionStr.toLowerCase().includes(q)
        || typeStr.toLowerCase().includes(q);
        
      if (!matchesSearch) return false;
    }

    // 2. 공고 필터링 (viewMode === 'worker')
    if (viewMode === "worker") {
      if (filterIndustry && !String(item.business_type || "").includes(filterIndustry)) return false;
      if (filterJobType && item.job_type !== filterJobType) return false;
      if (filterWage > 0 && Number(item.wage || 0) < filterWage) return false;
      if (filterWageNegotiable !== null && item.wage_negotiable !== filterWageNegotiable) return false;
      if (filterDays) {
        const days = String(item.work_days || "");
        if (filterDays === "평일" && !days.includes("평일") && !["월", "화", "수", "목", "금"].some(d => days.includes(d))) return false;
        if (filterDays === "주말" && !days.includes("주말") && !["토", "일"].some(d => days.includes(d))) return false;
      }
      if (filterMealProvided !== null && item.meal_provided !== filterMealProvided) return false;
      if (filterParking !== null && item.parking !== filterParking) return false;
    }

    // 3. 구직자 필터링 (viewMode === 'employer')
    if (viewMode === "employer") {
      if (filterIndustry && !String(item.desired_type || "").includes(filterIndustry)) return false;
      if (filterAvailableNow !== null && item.available_now !== filterAvailableNow) return false;
      if (filterLongTerm) {
        const isLong = item.is_long_term === true;
        if (filterLongTerm === "long" && !isLong) return false;
        if (filterLongTerm === "short" && isLong) return false;
      }
      if (filterExperience !== null) {
        const hasExp = item.experience === "있음" || Number(item.experience_months || 0) > 0;
        if (filterExperience && !hasExp) return false;
        if (!filterExperience && hasExp) return false;
      }
      if (filterDays) {
        const days = String(item.work_days || item.available_days || "");
        if (filterDays === "평일" && !days.includes("평일") && !["월", "화", "수", "목", "금"].some(d => days.includes(d))) return false;
        if (filterDays === "주말" && !days.includes("주말") && !["토", "일"].some(d => days.includes(d))) return false;
      }
    }

    return true;
  });

  const formatDateBadge = (start: string, end?: string) => {
    const fmt = (d: string) => { const dt = new Date(d); return `${dt.getMonth()+1}/${dt.getDate()}`; };
    return end ? `${fmt(start)}~${fmt(end)}` : fmt(start);
  };

  const regionOrder = { "same-dong": 0, "same-gu": 1, "same-sido": 2, "other": 3 } as const;
  const getRegionMatchLevel = (base: string, target: string): keyof typeof regionOrder => {
    if (!base || !target) return "other";
    const bp = base.trim().split(/\s+/);
    const tp = target.trim().split(/\s+/);
    if (bp.length >= 3 && tp.length >= 3 && bp[2] === tp[2] && bp[1] === tp[1]) return "same-dong";
    if (bp.length >= 2 && tp.length >= 2 && bp[1] === tp[1]) return "same-gu";
    if (bp[0] && tp[0] && bp[0] === tp[0]) return "same-sido";
    return "other";
  };

  const urgencyScore = (item: Record<string, unknown>) => {
    const jt = String(item.job_type || "regular");
    if (jt === "urgent") return 4;
    if (jt === "short" && item.is_urgent) return 3;
    if (jt === "short") return 2;
    if (item.is_urgent) return 1;
    return 0;
  };

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "인기순") {
      const aR = getRegionMatchLevel(myRegion, String(a.region || a.desired_region || ""));
      const bR = getRegionMatchLevel(myRegion, String(b.region || b.desired_region || ""));
      if (regionOrder[aR] !== regionOrder[bR]) return regionOrder[aR] - regionOrder[bR];
      return (Number(b.like_count || 0) * 3 + Number(b.view_count || 0) * 0.5) - (Number(a.like_count || 0) * 3 + Number(a.view_count || 0) * 0.5);
    }
    if (sortBy === "긴급순") {
      const diff = urgencyScore(b) - urgencyScore(a);
      if (diff !== 0) return diff;
      const aD = a.work_start_date || a.expires_at;
      const bD = b.work_start_date || b.expires_at;
      if (aD && bD) return new Date(String(aD)).getTime() - new Date(String(bD)).getTime();
      if (aD) return -1;
      if (bD) return 1;
      return 0;
    }
    return Number(b.match_score ?? -1) - Number(a.match_score ?? -1);
  });

  // 탭별 상단 가로 섹션 데이터
  const topSectionItems = (() => {
    if (viewMode === "employer") {
      // 구직자탭: 항상 즉시출근 가능
      return sorted.filter(i => i.available_now).slice(0, 8);
    }
    if (sortBy === "추천순") {
      return sorted.filter(i => Number(i.like_count || 0) >= 3 || Number(i.view_count || 0) >= 20).slice(0, 8);
    }
    if (sortBy === "인기순") {
      return [...sorted].sort((a, b) => (Number(b.like_count || 0) * 3 + Number(b.view_count || 0) * 0.5) - (Number(a.like_count || 0) * 3 + Number(a.view_count || 0) * 0.5)).slice(0, 8);
    }
    if (sortBy === "긴급순") {
      return sorted.filter(i => urgencyScore(i) >= 2).slice(0, 8); // 단기/긴급대타만
    }
    return [];
  })();

  const topSectionTitle = (() => {
    if (viewMode === "employer") return "⚡ 즉시출근 가능";
    if (sortBy === "추천순") return "🔥 지금 인기 공고";
    if (sortBy === "인기순") return "❤ 많이 찜한 공고";
    if (sortBy === "긴급순") return "🚨 긴급 · 단기 모집";
    return "";
  })();

  const topSectionKey = `${viewMode}_${sortBy}`;

  const sectionData: Record<string, typeof sorted> = { top: topSectionItems, all: sorted };
  const fullSection = showAllSection ? (sectionData[showAllSection] || sorted) : null;

  const cardProps = (item: Record<string, unknown>): CardProps => ({
    item, mode: viewMode, isLoggedIn, myRegion,
    onLike: handleLike, onLovecall: handleLovecall, likedIds,
    onClick: () => {
      setBottomSheet(item as SheetItem);
      const targetId = String(item.id || item.user_id);
      const targetType = viewMode === "worker" ? "employer" : "worker";
      const viewKey = `viewed_${targetType}_${targetId}`;
      if (!sessionStorage.getItem(viewKey)) {
        sessionStorage.setItem(viewKey, "1");
        fetch("/api/views", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetId, targetType }) }).catch(() => {});
      }
    },
  });

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 90 }}>

      {/* 헤더 */}
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "rgba(24,24,27,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          {showBothTabs && (
            <div style={{ display: "flex", gap: 0, padding: "10px 16px 0" }}>
              {[{ key: "worker", label: "공고", icon: "🏪" }, { key: "employer", label: "구직자", icon: "🙋" }].map(tab => (
                <button key={tab.key} onClick={() => handleViewMode(tab.key as "worker" | "employer")}
                  style={{ flex: 1, padding: "8px 0", background: "none", border: "none", fontSize: 13, fontWeight: viewMode === tab.key ? 800 : 500, color: viewMode === tab.key ? "var(--text)" : "var(--text-muted)", cursor: "pointer", borderBottom: viewMode === tab.key ? `2px solid ${tab.key === "worker" ? "#8b5cf6" : "#ec4899"}` : "2px solid transparent", transition: "all 0.15s" }}>
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 16px 10px" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--text-muted)", pointerEvents: "none" }}>🔍</span>
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={viewMode === "worker" ? "아산 카페, 편의점 공고..." : "아산 알바생, 바리스타..."}
                  style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "9px 12px 9px 30px", color: "var(--text)", fontSize: 13, outline: "none" }} />
              </div>
              <button onClick={() => setFilterModalOpen(true)}
                style={{
                  padding: "9px 12px",
                  background: isFilterActive ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${isFilterActive ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 12,
                  color: isFilterActive ? "#c4b5fd" : "var(--text-muted)",
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontWeight: 600,
                  transition: "all 0.15s"
                }}>
                🎛️ 필터 {isFilterActive && <span style={{ background: "#8b5cf6", color: "#fff", borderRadius: "50%", width: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>!</span>}
              </button>
            </div>
            
            {isFilterActive && (
              <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "2px 0 6px", scrollbarWidth: "none" }}>
                {filterIndustry && <span style={{ fontSize: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "2px 8px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>업종: {filterIndustry}</span>}
                {filterJobType && <span style={{ fontSize: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "2px 8px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>유형: {filterJobType === "regular" ? "정기" : filterJobType === "short" ? "단기" : "긴급"}</span>}
                {filterWage > 0 && <span style={{ fontSize: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "2px 8px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>시급: {filterWage.toLocaleString()}원+</span>}
                {filterWageNegotiable === true && <span style={{ fontSize: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "2px 8px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>시급협의 가능</span>}
                {filterDays && <span style={{ fontSize: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "2px 8px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>요일: {filterDays}</span>}
                {filterMealProvided === true && <span style={{ fontSize: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "2px 8px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>식사제공</span>}
                {filterParking === true && <span style={{ fontSize: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "2px 8px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>주차가능</span>}
                {filterAvailableNow === true && <span style={{ fontSize: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "2px 8px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>즉시출근 가능</span>}
                {filterLongTerm && <span style={{ fontSize: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "2px 8px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>기간: {filterLongTerm === "long" ? "장기선호" : "단기대타"}</span>}
                {filterExperience === true && <span style={{ fontSize: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "2px 8px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>경력 있음</span>}
              </div>
            )}
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 4 }}>
                {SORT_OPTIONS.map(opt => (
                  <button key={opt.key} onClick={() => { setSortBy(opt.key); setShowAllSection(null); }}
                    style={{ padding: "6px 10px", background: sortBy === opt.key ? (viewMode === "worker" ? "rgba(139,92,246,0.2)" : "rgba(236,72,153,0.2)") : "rgba(255,255,255,0.06)", border: `1px solid ${sortBy === opt.key ? (viewMode === "worker" ? "rgba(139,92,246,0.5)" : "rgba(236,72,153,0.5)") : "rgba(255,255,255,0.08)"}`, borderRadius: 10, color: sortBy === opt.key ? (viewMode === "worker" ? "#c4b5fd" : "#fbcfe8") : "var(--text-muted)", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const, transition: "all 0.15s" }}>
                    {opt.key === "긴급순" && sortBy !== "긴급순" ? <span style={{ color: "#f87171" }}>{opt.icon} {opt.key}</span> : `${opt.icon} ${opt.key}`}
                  </button>
                ))}
              </div>
              
              {isFilterActive && (
                <button onClick={resetFilters} style={{ background: "none", border: "none", color: "#f87171", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                  🔄 필터 초기화
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.6 }}>✦</div>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{isLoggedIn ? "궁합 계산 중..." : "불러오는 중..."}</p>
          </div>
        ) : showAllSection ? (
          <div style={{ padding: "16px 16px" }}>
            <button onClick={() => setShowAllSection(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: "0 0 16px", display: "flex", alignItems: "center", gap: 4 }}>← 뒤로</button>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {(fullSection || []).map((item, i) => <JobCard key={String(item.id || item.user_id) + i} {...cardProps(item)} />)}
            </div>
          </div>
        ) : (
          <div style={{ padding: "16px 0" }}>

            {/* 상단 가로 섹션 - 탭/정렬에 따라 1개만 */}
            {topSectionItems.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ padding: "0 16px", marginBottom: 12 }}>
                  <SectionHeader
                    key={topSectionKey}
                    title={topSectionTitle}
                    count={topSectionItems.length}
                    onMore={() => setShowAllSection("top")}
                  />
                </div>
                <HorizontalScroll items={topSectionItems} cardProps={cardProps} />
              </div>
            )}

            {/* 전체 목록 */}
            <div style={{ padding: "0 16px" }}>
              <SectionHeader
                title={isLoggedIn
                  ? `✦ ${sortBy === "인기순" ? "인기" : sortBy === "긴급순" ? "긴급" : "추천"} ${viewMode === "worker" ? "공고" : "구직자"}`
                  : `전체 ${viewMode === "worker" ? "공고" : "구직자"}`}
                count={sorted.length}
              />
              {sorted.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <p style={{ color: "var(--text-muted)", fontSize: 14 }}>{searchQuery ? `"${searchQuery}" 검색 결과가 없어요` : "등록된 공고가 없어요"}</p>
                  {searchQuery && <button onClick={() => setSearchQuery("")} style={{ marginTop: 10, background: "var(--primary-light)", border: "1px solid var(--primary-border)", color: "#c4b5fd", padding: "7px 16px", borderRadius: 20, cursor: "pointer", fontSize: 13 }}>검색 초기화</button>}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {sorted.map((item, i) => <JobCard key={String(item.id || item.user_id) + i} {...cardProps(item)} />)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 바텀시트 */}
      {bottomSheet && (
        <div onClick={() => setBottomSheet(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "var(--surface)", borderRadius: "24px 24px 0 0", maxHeight: "88vh", overflowY: "auto", paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}>
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
            </div>
            {/* 바텀시트 히어로 */}
            {(() => {
              const bsMediaItems: { type: "image" | "video"; url: string }[] = [];
              if (bottomSheet.video_url) {
                bsMediaItems.push({ type: "video", url: bottomSheet.video_url });
              }
              if (Array.isArray(bottomSheet.image_urls) && bottomSheet.image_urls.length > 0) {
                bottomSheet.image_urls.forEach((url: string) => bsMediaItems.push({ type: "image", url }));
              } else if (bottomSheet.image_url) {
                bsMediaItems.push({ type: "image", url: bottomSheet.image_url });
              }

              const bsHasMedia = bsMediaItems.length > 0;
              const bsActiveMedia = bsMediaItems[bsActiveMediaIndex];

              return (
                <div style={{ position: "relative", height: 260, background: "#000", overflow: "hidden" }}>
                  {bsHasMedia ? (
                    bsActiveMedia.type === "video" ? (
                      <video src={bsActiveMedia.url} controls muted autoPlay loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", background: `url(${bsActiveMedia.url}) center/cover no-repeat` }} />
                    )
                  ) : (
                    <div style={{ width: "100%", height: "100%", background: viewMode === "worker" ? "linear-gradient(160deg, #1a1035 0%, #2d1b6e 50%, #1e1040 100%)" : "linear-gradient(160deg, #0a2020 0%, #0f4a3a 50%, #0a2820 100%)" }} />
                  )}
                  
                  <div style={{ position: "absolute", inset: 0, background: bsHasMedia ? "linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.7) 100%)" : "none", pointerEvents: "none" }} />
                  <button onClick={() => setBottomSheet(null)} style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)", border: "none", borderRadius: "50%", width: 32, height: 32, color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20 }}>✕</button>
                  
                  {bsMediaItems.length > 1 && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); setBsActiveMediaIndex(prev => (prev - 1 + bsMediaItems.length) % bsMediaItems.length); }}
                        style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 32, height: 32, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, zIndex: 20 }}>
                        ‹
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setBsActiveMediaIndex(prev => (prev + 1) % bsMediaItems.length); }}
                        style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 32, height: 32, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, zIndex: 20 }}>
                        ›
                      </button>
                      <div style={{ position: "absolute", bottom: 12, right: 12, background: "rgba(0,0,0,0.6)", borderRadius: 10, padding: "3px 6px", fontSize: 10, color: "#fff", fontWeight: 600, zIndex: 20 }}>
                        {bsActiveMediaIndex + 1} / {bsMediaItems.length}
                      </div>
                    </>
                  )}
                  
                  <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 6, zIndex: 20 }}>
                    {bottomSheet.job_type === "urgent" && (
                      <span style={{ fontSize: 11, fontWeight: 800, background: "rgba(239,68,68,0.9)", color: "#fff", padding: "4px 10px", borderRadius: 20, backdropFilter: "blur(8px)" }}>
                        🚨 긴급대타 {bottomSheet.work_start_date ? formatDateBadge(bottomSheet.work_start_date) : ""}
                      </span>
                    )}
                    {bottomSheet.job_type === "short" && (
                      <span style={{ fontSize: 11, fontWeight: 800, background: "rgba(251,146,60,0.9)", color: "#fff", padding: "4px 10px", borderRadius: 20, backdropFilter: "blur(8px)" }}>
                        📅 단기 {bottomSheet.work_start_date ? formatDateBadge(bottomSheet.work_start_date, bottomSheet.work_end_date) : ""}
                      </span>
                    )}
                    {bottomSheet.match_score != null && (() => {
                      const level = getMatchLevel(Number(bottomSheet.match_score));
                      return (
                        <div style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", border: `1px solid ${level.color}40`, borderRadius: 12, padding: "5px 10px", display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ fontSize: 16, fontWeight: 900, color: level.color }}>{String(bottomSheet.match_score)}</span>
                          <span style={{ fontSize: 9, color: level.color, fontWeight: 700 }}>{level.emoji} {level.label}</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })()}
            <div style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div onClick={() => { const uid = String(bottomSheet.user_id || ""); if (uid) { router.push(viewMode === "worker" ? `/employer/${uid}` : `/worker/${uid}`); setBottomSheet(null); } }} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flex: 1 }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, background: (viewMode === "worker" ? bottomSheet.employer_avatar : bottomSheet.worker_avatar) ? `url(${viewMode === "worker" ? bottomSheet.employer_avatar : bottomSheet.worker_avatar}) center/cover` : "rgba(255,255,255,0.1)", border: "2px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                    {!(viewMode === "worker" ? bottomSheet.employer_avatar : bottomSheet.worker_avatar) && (viewMode === "worker" ? "🏪" : "👤")}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 2px", letterSpacing: "-0.3px" }}>
                      {viewMode === "worker" ? String(bottomSheet.business_name || "") : String(bottomSheet.worker_type || bottomSheet.worker_name || "알바생")}
                    </h3>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                      {viewMode === "worker" ? String(bottomSheet.employer_name || bottomSheet.business_type || "") : String(bottomSheet.desired_type || "")}
                    </p>
                  </div>
                </div>
                {(() => { const grade = getGrade(Number(bottomSheet.trust_score ?? 50)); return <span style={{ fontSize: 11, fontWeight: 700, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "4px 10px", color: "var(--text-muted)", flexShrink: 0 }}>{grade.emoji} {grade.name}</span>; })()}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: viewMode === "worker" ? "1fr 1fr 1fr" : "1fr 1fr", gap: 8, marginBottom: 14 }}>
                {viewMode === "worker" ? [
                  { icon: "₩", label: "시급", value: `${Number(bottomSheet.wage || 0).toLocaleString()}원` },
                  { icon: "📅", label: bottomSheet.job_type === "short" || bottomSheet.job_type === "urgent" ? "날짜" : "요일", value: bottomSheet.work_start_date ? formatDateBadge(bottomSheet.work_start_date, bottomSheet.work_end_date) : String(bottomSheet.work_days || "협의") },
                  { icon: "📍", label: "위치", value: String(bottomSheet.region || "") },
                ].map(c => (
                  <div key={c.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "10px 12px" }}>
                    <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 3px" }}>{c.icon} {c.label}</p>
                    <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{c.value}</p>
                  </div>
                )) : [
                  { icon: "📍", label: "희망 지역", value: String(bottomSheet.desired_region || bottomSheet.region || "협의") },
                  { icon: "₩", label: "희망 시급", value: Number(bottomSheet.desired_wage) > 0 ? `${Number(bottomSheet.desired_wage).toLocaleString()}원↑` : "협의" },
                ].map(c => (
                  <div key={c.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "10px 12px" }}>
                    <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 3px" }}>{c.icon} {c.label}</p>
                    <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{c.value}</p>
                  </div>
                ))}
              </div>
              {bottomSheet.match_score != null && (() => {
                const s = Number(bottomSheet.match_score);
                const comment = s >= 85 ? "성향과 조건이 아주 잘 맞아요 💕" : s >= 75 ? "꽤 잘 맞는 편이에요 👍" : s >= 65 ? "괜찮은 매칭이에요 😊" : "조건을 잘 확인해보세요 💪";
                const level = getMatchLevel(s);
                return <div style={{ background: `${level.color}12`, border: `1px solid ${level.color}30`, borderRadius: 12, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 18 }}>{level.emoji}</span><p style={{ fontSize: 13, color: level.color, fontWeight: 600, margin: 0 }}>{comment}</p></div>;
              })()}
              {viewMode === "worker" && bottomSheet.tags && (() => {
                const tags = Array.isArray(bottomSheet.tags) ? bottomSheet.tags as string[] : JSON.parse(String(bottomSheet.tags || "[]")) as string[];
                if (!tags.length && !bottomSheet.meal_provided) return null;
                return <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>{tags.map((t: string) => <span key={t} style={{ fontSize: 11, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", color: "#c4b5fd", padding: "4px 10px", borderRadius: 20 }}>#{t}</span>)}{!!bottomSheet.meal_provided && <span style={{ fontSize: 11, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-muted)", padding: "4px 10px", borderRadius: 20 }}>🍱 식사 제공</span>}</div>;
              })()}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { const id = String(bottomSheet.id || bottomSheet.user_id); router.push(viewMode === "worker" ? `/job/${id}` : `/worker/${id}`); }} style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "13px", color: "var(--text-muted)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>상세보기 →</button>
                {isLoggedIn ? (
                  <button onClick={() => { handleLovecall(String(bottomSheet.id || bottomSheet.user_id)); setBottomSheet(null); }} style={{ flex: 2, background: viewMode === "worker" ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "linear-gradient(135deg, #ec4899, #be185d)", border: "none", borderRadius: 12, padding: "13px", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", letterSpacing: "-0.2px" }}>💌 러브콜 보내기</button>
                ) : (
                  <button onClick={() => router.push("/login")} style={{ flex: 2, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "13px", color: "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>🔒 로그인하고 지원하기</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!isLoggedIn && !loading && (
        <div style={{ position: "fixed", bottom: 70, left: 0, right: 0, padding: "0 16px", zIndex: 40 }}>
          <div style={{ maxWidth: 480, margin: "0 auto", background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", borderRadius: 16, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 4px 24px rgba(139,92,246,0.35)" }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 2px", color: "#fff" }}>궁합 점수 보고 싶어요?</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", margin: 0 }}>성향 분석하고 딱 맞는 공고 찾기</p>
            </div>
            <button onClick={() => router.push("/interview?type=worker")} style={{ background: "#fff", border: "none", color: "#7c3aed", fontWeight: 800, padding: "8px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12 }}>시작 →</button>
          </div>
        </div>
      )}

      {filterModalOpen && (
        <div onClick={() => setFilterModalOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "var(--surface)", borderRadius: "24px 24px 0 0", maxHeight: "80vh", overflowY: "auto", padding: "20px", paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>🎛️ 상세 필터 설정</h3>
              <button onClick={() => setFilterModalOpen(false)} style={{ background: "none", border: "none", color: "var(--text)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* 희망 직종 / 업종 */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8, color: "var(--text-muted)" }}>📂 희망 직무/업종</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["카페/음료", "편의점", "음식점", "서빙", "베이커리", "뷰티/미용", "매장관리", "기타"].map(ind => {
                    const isSelected = filterIndustry === ind;
                    return (
                      <button key={ind} onClick={() => setFilterIndustry(filterIndustry === ind ? "" : ind)}
                        style={{ padding: "8px 12px", borderRadius: 10, border: "none", background: isSelected ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: isSelected ? 700 : 400 }}>
                        {ind}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 요일 조건 */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8, color: "var(--text-muted)" }}>📅 근무 요일</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {["평일", "주말"].map(d => {
                    const isSelected = filterDays === d;
                    return (
                      <button key={d} onClick={() => setFilterDays(isSelected ? "" : d)}
                        style={{ flex: 1, padding: "8px 0", borderRadius: 10, border: "none", background: isSelected ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: isSelected ? 700 : 400 }}>
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              {viewMode === "worker" ? (
                <>
                  {/* 공고 유형 */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8, color: "var(--text-muted)" }}>🚨 공고 유형</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[
                        { key: "regular", label: "정기채용" },
                        { key: "short", label: "단기급구" },
                        { key: "urgent", label: "긴급대타" }
                      ].map(t => {
                        const isSelected = filterJobType === t.key;
                        return (
                          <button key={t.key} onClick={() => setFilterJobType(isSelected ? "" : t.key)}
                            style={{ flex: 1, padding: "8px 0", borderRadius: 10, border: "none", background: isSelected ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: isSelected ? 700 : 400 }}>
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 시급 범위 */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8, color: "var(--text-muted)" }}>💰 최소 시급 조건</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[
                        { val: 0, label: "무관" },
                        { val: 9860, label: "최저시급 이상" },
                        { val: 11000, label: "11,000원 이상" },
                        { val: 12000, label: "12,000원 이상" }
                      ].map(w => {
                        const isSelected = filterWage === w.val;
                        return (
                          <button key={w.label} onClick={() => setFilterWage(w.val)}
                            style={{ padding: "8px 12px", borderRadius: 10, border: "none", background: isSelected ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: isSelected ? 700 : 400 }}>
                            {w.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 시급 협의 / 복지 혜택 */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8, color: "var(--text-muted)" }}>⚡ 기타 세부 조건</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                        <input type="checkbox" checked={filterWageNegotiable === true} onChange={e => setFilterWageNegotiable(e.target.checked ? true : null)} style={{ width: 16, height: 16, accentColor: "#8b5cf6" }} />
                        시급 협의 가능 공고만 보기
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                        <input type="checkbox" checked={filterMealProvided === true} onChange={e => setFilterMealProvided(e.target.checked ? true : null)} style={{ width: 16, height: 16, accentColor: "#8b5cf6" }} />
                        🍱 식사 제공 공고만 보기
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                        <input type="checkbox" checked={filterParking === true} onChange={e => setFilterParking(e.target.checked ? true : null)} style={{ width: 16, height: 16, accentColor: "#8b5cf6" }} />
                        🚗 주차 가능 공고만 보기
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* 근무 기간 */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8, color: "var(--text-muted)" }}>⏳ 희망 근무 기간</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[
                        { key: "long", label: "장기선호" },
                        { key: "short", label: "단기/대타가능" }
                      ].map(t => {
                        const isSelected = filterLongTerm === t.key;
                        return (
                          <button key={t.key} onClick={() => setFilterLongTerm(isSelected ? "" : t.key)}
                            style={{ flex: 1, padding: "8px 0", borderRadius: 10, border: "none", background: isSelected ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: isSelected ? 700 : 400 }}>
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 경력 여부 */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8, color: "var(--text-muted)" }}>🏅 경력 사항</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[
                        { key: true, label: "경력자만" },
                        { key: false, label: "신입선호/무관" }
                      ].map(e => {
                        const isSelected = filterExperience === e.key;
                        return (
                          <button key={e.label} onClick={() => setFilterExperience(isSelected ? null : e.key)}
                            style={{ flex: 1, padding: "8px 0", borderRadius: 10, border: "none", background: isSelected ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: isSelected ? 700 : 400 }}>
                            {e.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 즉시 근무 여부 */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8, color: "var(--text-muted)" }}>⚡ 근무 가능 상태</label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                      <input type="checkbox" checked={filterAvailableNow === true} onChange={e => setFilterAvailableNow(e.target.checked ? true : null)} style={{ width: 16, height: 16, accentColor: "#8b5cf6" }} />
                      즉시 출근 가능 알바생만 보기
                    </label>
                  </div>
                </>
              )}
            </div>
            
            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button onClick={resetFilters} style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px", color: "var(--text-muted)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>초기화</button>
              <button onClick={() => setFilterModalOpen(false)} style={{ flex: 2, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", border: "none", borderRadius: 12, padding: "12px", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>적용하기</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ color: "var(--text-muted)", fontSize: 13 }}>로딩 중...</div></div>}>
      <ExploreContent />
    </Suspense>
  );
}
