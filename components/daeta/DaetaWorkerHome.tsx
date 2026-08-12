"use client";

/**
 * DaetaWorkerHome — 알바생 대타 홈 (DESIGN_PLAN.md P1)
 * 대타 가능 토글 → 들어온 요청(즉답) → 동네 대타 자리(Tier별 노출)
 */
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/useToast";
import AppHeader from "@/components/AppHeader";
import DaetaRoleTabBar from "@/components/daeta/DaetaRoleTabBar";
import TierBadge from "@/components/TierBadge";
import { getWorkerTier, DaetaTier } from "@/lib/daetaTier";
import { modalOverlay, modalSheet, btnPrimary, btnSecondary } from "@/lib/styles";
import { formatDaetaDateRange } from "@/lib/utils";


interface WorkerProfileLite {
  id: string;
  available_now: boolean;
  lat: number | null;
  lng: number | null;
}

interface IncomingRequest {
  matchId: string;
  postingId: string;
  businessName: string;
  region: string;
  workDate: string;
  workDateEnd?: string | null;
  workHours: string;
  wage: number;
  duty: string;
}

interface NearbyPosting {
  id: string;
  employerUserId: string;
  businessName: string;
  region: string;
  workDate: string;
  workDateEnd?: string | null;
  workHours: string;
  wage: number;
  duty: string;
  stage: number;
  distanceKm: number | null;
}

function toRad(d: number) { return d * Math.PI / 180; }
function calcDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

interface DaetaWorkerHomeProps {
  userId: string;
  roleView?: "employer" | "worker";
  onRoleChange?: (r: "employer" | "worker") => void;
}

export default function DaetaWorkerHome({ userId, roleView, onRoleChange }: DaetaWorkerHomeProps) {
  const router = useRouter();
  const { showToast, ToastUI } = useToast();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<WorkerProfileLite | null>(null);
  const [myTier, setMyTier] = useState<DaetaTier>("tier2");
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [nearby, setNearby] = useState<NearbyPosting[]>([]);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<{ nickname?: string; avatar_url?: string; birth_date?: string | null } | null>(null);
  const [showBirthModal, setShowBirthModal] = useState(false);
  const [birthInput, setBirthInput] = useState("");
  const [savingBirth, setSavingBirth] = useState(false);

  const load = useCallback(async () => {
    const { data: u } = await supabase.from("users").select("nickname, avatar_url, birth_date").eq("id", userId).maybeSingle();
    if (u) setUserInfo(u);

    // 1) 내 프로필
    const { data: profiles } = await supabase
      .from("worker_profiles")
      .select("id, available_now, lat, lng")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);
    const p = (profiles?.[0] as WorkerProfileLite | undefined) || null;
    setProfile(p);

    // 2) 내 Tier
    const tier = await getWorkerTier(supabase, userId);
    setMyTier(tier);

    // 3) 들어온 대타 요청 (사장님이 나를 호출한 pending 매칭)
    const { data: matches } = await supabase
      .from("matches")
      .select("id, daeta_posting_id, initiated_by, progress_status")
      .eq("worker_id", userId)
      .not("daeta_posting_id", "is", null)
      .in("progress_status", ["pending"]);

    const receivedMatches = (matches || []).filter(
      (m: { initiated_by: string | null }) => m.initiated_by !== userId
    );
    const myApplied = (matches || []).filter(
      (m: { initiated_by: string | null }) => m.initiated_by === userId
    );
    setAppliedIds(new Set(myApplied.map((m: { daeta_posting_id: string }) => m.daeta_posting_id)));

    // 4) 나에게 전달된 대타 요청 공고 세부 정보 로드
    if (receivedMatches.length > 0) {
      const postingIds = receivedMatches.map((m: { daeta_posting_id: string }) => m.daeta_posting_id);
      const { data: postingRows } = await supabase
        .from("daeta_postings")
        .select("id, business_name, region, work_date, work_date_end, work_hours, wage, duty")
        .in("id", postingIds)
        .eq("status", "pending");

      const matchMap: Record<string, string> = {};
      receivedMatches.forEach((m: { id: string; daeta_posting_id: string }) => {
        matchMap[m.daeta_posting_id] = m.id;
      });

      const list: IncomingRequest[] = (postingRows || []).map((row: { id: string; business_name: string; region: string; work_date: string; work_date_end: string | null; work_hours: string; wage: number; duty: string }) => ({
        matchId: matchMap[row.id] || "",
        postingId: row.id,
        businessName: row.business_name,
        region: row.region,
        workDate: row.work_date,
        workDateEnd: row.work_date_end,
        workHours: row.work_hours,
        wage: row.wage,
        duty: row.duty,
      }));
      setIncoming(list);
    } else {
      setIncoming([]);
    }

    // 5) 내 동네/Tier 기준 주변 대타 공고 로드
    const { data: openPostingsRaw } = await supabase
      .from("daeta_postings")
      .select("id, user_id, business_name, region, work_date, work_date_end, work_hours, wage, duty, lat, lng, escalation_stage, allow_new, expires_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    // 근무 시작 시각(expires_at)이 지난 공고는 크론 없이 조회 시점에 만료 처리 — 응답자 없이 방치된 공고가
    // 목록에 영구히 남는 걸 막는다. status 갱신은 결과를 기다리지 않고 백그라운드로만 반영(fire-and-forget).
    const nowIso = new Date().toISOString();
    const expiredIds = (openPostingsRaw || [])
      .filter((row: { expires_at: string | null }) => row.expires_at && row.expires_at < nowIso)
      .map((row: { id: string }) => row.id);
    if (expiredIds.length > 0) {
      supabase.from("daeta_postings").update({ status: "expired" }).in("id", expiredIds);
    }
    const openPostings = (openPostingsRaw || []).filter((row: { expires_at: string | null }) => !row.expires_at || row.expires_at >= nowIso);

    const visible = (openPostings || []).filter((row: { escalation_stage: number; allow_new: boolean }) => {
      const stage = row.escalation_stage || 1;
      if (tier === "tier1") return stage >= 2;
      return (stage >= 3 && row.allow_new) || stage >= 4;
    });

    const myLoc = p?.lat != null && p?.lng != null ? { lat: p.lat, lng: p.lng } : null;
    const nearbyList: NearbyPosting[] = visible
      .map((row: { id: string; user_id: string; business_name: string; region: string; work_date: string; work_date_end: string | null; work_hours: string; wage: number; duty: string; lat: number; lng: number; escalation_stage: number }) => ({
        id: row.id,
        employerUserId: row.user_id,
        businessName: row.business_name,
        region: row.region,
        workDate: row.work_date,
        workDateEnd: row.work_date_end,
        workHours: row.work_hours,
        wage: row.wage,
        duty: row.duty,
        stage: row.escalation_stage || 1,
        distanceKm: myLoc ? calcDistance(myLoc, { lat: row.lat, lng: row.lng }) : null,
      }))
      .sort((a: NearbyPosting, b: NearbyPosting) => {
        if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
        return 0;
      });
    setNearby(nearbyList);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // 대타 가능을 켤 땐 생년월일이 있어야 함 — 야간 SOS 자동 필터(lib/daetaEscalation.ts)가
  // 생년월일 미확인자를 안전하게 제외하기 때문에, 미리 받아둬야 정당한 성인 후보가 새지 않음.
  // 끌 때는 게이트 없이 바로 처리.
  const toggleAvailable = async () => {
    const turningOn = !profile?.available_now;
    if (turningOn && !userInfo?.birth_date) {
      setBirthInput("");
      setShowBirthModal(true);
      return;
    }
    await performToggleAvailable();
  };

  const saveBirthAndToggle = async () => {
    if (!birthInput) { showToast("생년월일을 입력해주세요", "error"); return; }
    setSavingBirth(true);
    const { error } = await supabase.from("users").update({ birth_date: birthInput }).eq("id", userId);
    setSavingBirth(false);
    if (error) { showToast("저장 실패: " + error.message, "error"); return; }
    setUserInfo(prev => prev ? { ...prev, birth_date: birthInput } : prev);
    setShowBirthModal(false);
    await performToggleAvailable();
  };

  const performToggleAvailable = async () => {
    let currentProfile = profile;

    if (!currentProfile) {
      const { data: existing } = await supabase
        .from("worker_profiles")
        .select("id, available_now, lat, lng")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        currentProfile = existing;
      }
    }

    if (!currentProfile) {
      const { data: newP, error: upsertErr } = await supabase
        .from("worker_profiles")
        .upsert({
          user_id: userId,
          available_now: true,
          is_active: true,
          is_public: true,
        }, { onConflict: "user_id" })
        .select("id, available_now, lat, lng")
        .single();

      if (upsertErr || !newP) {
        showToast("알바 프로필 생성 실패: " + (upsertErr?.message || ""), "error");
        return;
      }
      setProfile(newP);
      showToast("🟢 대타 가능! 동네 SOS 알림을 받아요", "success");
      return;
    }

    const next = !currentProfile.available_now;
    const { error } = await supabase
      .from("worker_profiles")
      .update({ available_now: next, is_active: true, is_public: true })
      .eq("id", currentProfile.id);

    if (error) {
      showToast("변경 실패: " + error.message, "error");
      return;
    }
    setProfile({ ...currentProfile, available_now: next });
    showToast(next ? "🟢 대타 가능! 동네 SOS 알림을 받아요" : "⚪ 대타 알림을 껐어요", next ? "success" : "info");
  };

  const respond = async (matchId: string, action: "accept" | "reject") => {
    setActionLoading(matchId);
    try {
      const res = await fetch("/api/lovecall", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "처리 실패");
      if (action === "accept") {
        showToast("✅ 대타 확정! 근로계약서가 자동 작성됐어요");
        setTimeout(() => router.push(`/chat/${matchId}`), 1200);
      } else {
        showToast("요청을 거절했어요", "info");
      }
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "처리 중 오류";
      showToast(message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const apply = async (posting: NearbyPosting) => {
    setActionLoading(posting.id);
    try {
      const res = await fetch("/api/lovecall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employerId: posting.employerUserId,
          workerId: userId,
          senderType: "worker",
          daetaPostingId: posting.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "지원 실패");
      showToast("🚀 지원 완료! 사장님의 수락을 기다려요");
      setAppliedIds(prev => new Set([...prev, posting.id]));
    } catch (err) {
      const message = err instanceof Error ? err.message : "지원 중 오류";
      showToast(message, "error");
    } finally {
      setActionLoading(null);
    }
  };


  const available = !!profile?.available_now;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg, #0a0a0f)", paddingBottom: 100 }}>
      <AppHeader title="대타" showBellAndMenu />
      {roleView && onRoleChange && (
        <DaetaRoleTabBar roleView={roleView} onRoleChange={onRoleChange} />
      )}

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px 0" }}>

        {/* 대타 가능 토글 */}
        <button
          onClick={toggleAvailable}
          style={{
            width: "100%",
            padding: "18px 20px",
            background: available
              ? "var(--success-bg)"
              : "var(--surface, rgba(255,255,255,0.04))",
            border: available ? "1.5px solid rgba(34,197,94,0.5)" : "1px solid var(--border, rgba(255,255,255,0.1))",
            borderRadius: 20,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <i className={`ti ${available ? "ti-circle-filled" : "ti-circle"}`} style={{ fontSize: 24, color: available ? "var(--success)" : "var(--text-muted)" }} aria-hidden="true" />
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: "var(--text, #fff)" }}>
                {available ? "대타 가능" : "대타 알림 꺼짐"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted, rgba(255,255,255,0.5))", marginTop: 2 }}>
                {available ? "동네 SOS가 뜨면 바로 알림을 받아요" : "켜면 동네 대타 요청을 먼저 받아요"}
              </div>
            </div>
          </div>
          <div style={{
            width: 46, height: 26, borderRadius: 13, position: "relative", flexShrink: 0,
            background: available ? "#22c55e" : "rgba(255,255,255,0.15)",
            transition: "background 0.2s",
          }}>
            <div style={{
              position: "absolute", top: 3, left: available ? 23 : 3,
              width: 20, height: 20, borderRadius: "50%", background: "#fff",
              transition: "left 0.2s", boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
            }} />
          </div>
        </button>

        {/* 🟢 대타 활성화 시 노출되는 실시간 레이더 & 내 프로필 카드 미리보기 */}
        {available && (
          <div style={{
            background: "linear-gradient(135deg, rgba(34,197,94,0.14) 0%, rgba(16,185,129,0.06) 100%)",
            border: "1px solid rgba(34, 197, 94, 0.35)",
            borderRadius: 20,
            padding: 16,
            marginBottom: 16,
            boxShadow: "0 4px 20px rgba(34, 197, 94, 0.15)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ position: "relative", display: "flex", width: 10, height: 10 }}>
                  <span style={{ position: "absolute", display: "inline-flex", width: "100%", height: "100%", borderRadius: "50%", background: "#22c55e", opacity: 0.75, animation: "ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite" }} />
                  <span style={{ position: "relative", display: "inline-flex", width: 10, height: 10, borderRadius: "50%", background: "#22c55e" }} />
                </span>
                <span style={{ fontSize: 13, fontWeight: 900, color: "#4ade80", letterSpacing: "-0.3px" }}>
                  📡 실시간 대타 탐색망 감지 중
                </span>
              </div>
              <span style={{ fontSize: 10, background: "rgba(34,197,94,0.2)", color: "#86efac", padding: "3px 8px", borderRadius: 12, fontWeight: 800 }}>
                사장님 매칭 가능
              </span>
            </div>

            {/* 내 프로필 카드 미리보기 */}
            <div style={{
              background: "var(--surface, rgba(255,255,255,0.06))",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 14,
              padding: 12,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--primary, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 18, overflow: "hidden", flexShrink: 0, border: "2px solid rgba(34,197,94,0.6)" }}>
                {userInfo?.avatar_url ? (
                  <img src={userInfo.avatar_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span>{userInfo?.nickname?.[0]?.toUpperCase() || "👤"}</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text, #fff)" }}>
                    {userInfo?.nickname || "내 프로필"}
                  </span>
                  <TierBadge tier={myTier} size="sm" />
                </div>
                <p style={{ fontSize: 11, color: "var(--text-muted, rgba(255,255,255,0.6))", margin: 0 }}>
                  👁️ 사장님들에게 내 대타 카드가 1순위 추천 중
                </p>
              </div>
              <button
                onClick={() => router.push(`/worker/${userId}`)}
                style={{
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 10,
                  padding: "6px 10px",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                내 카드 보기
              </button>
            </div>
            <style>{`@keyframes ping { 75%,100%{transform:scale(2.2);opacity:0} }`}</style>
          </div>
        )}


        {/* 내 Tier + 승격 배너 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, padding: "0 4px" }}>
          <TierBadge tier={myTier} size="md" />
          {myTier === "tier2" && (
            <span style={{ fontSize: 11, color: "var(--text-muted, rgba(255,255,255,0.5))" }}>
              첫 대타를 완료하면 ✅검증 승격 + 우선 노출!
            </span>
          )}
        </div>

        {/* 들어온 요청 */}
        {incoming.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--text, #fff)", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}><i className="ti ti-inbox" aria-hidden="true" /> 나에게 온 대타 요청</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {incoming.map(r => (
                <div key={r.matchId} style={{ background: "rgba(251,146,60,0.07)", border: "1px solid rgba(251,146,60,0.3)", borderRadius: 18, padding: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: "var(--text, #fff)" }}>{r.businessName}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted, rgba(255,255,255,0.55))", margin: "4px 0 2px" }}>
                    {formatDaetaDateRange(r.workDate, r.workDateEnd)} · {r.workHours} · {r.duty}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#fb923c", marginBottom: 12 }}>
                    시급 {r.wage.toLocaleString()}원
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => respond(r.matchId, "accept")}
                      disabled={actionLoading === r.matchId}
                      style={{ flex: 2, padding: "12px", background: "var(--success)", border: "none", borderRadius: 14, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: actionLoading === r.matchId ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      {actionLoading === r.matchId ? "처리 중..." : (<><i className="ti ti-circle-check" aria-hidden="true" /> 수락 (계약 자동 작성)</>)}
                    </button>
                    <button
                      onClick={() => respond(r.matchId, "reject")}
                      disabled={actionLoading === r.matchId}
                      style={{ flex: 1, padding: "12px", background: "var(--surface2, rgba(255,255,255,0.06))", border: "1px solid var(--border, rgba(255,255,255,0.12))", borderRadius: 14, color: "var(--text-muted, rgba(255,255,255,0.6))", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      거절
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 동네 대타 자리 */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--text, #fff)", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
            <i className="ti ti-map-pin" aria-hidden="true" /> 지금 열려 있는 동네 대타
          </h3>
          {loading ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted, rgba(255,255,255,0.4))", fontSize: 13 }}>불러오는 중...</div>
          ) : nearby.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 0", background: "var(--surface, rgba(255,255,255,0.03))", borderRadius: 16, border: "1px dashed var(--border, rgba(255,255,255,0.1))" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>😴</div>
              <div style={{ fontSize: 13, color: "var(--text-muted, rgba(255,255,255,0.5))" }}>
                지금은 열린 대타가 없어요.<br />
                {myTier === "tier2"
                  ? "신규 등급은 사장님이 '신규 받기'를 켠 요청만 보여요."
                  : "SOS가 뜨면 검증 등급인 당신에게 가장 먼저 알려드려요."}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {nearby.map(p => {
                const applied = appliedIds.has(p.id);
                return (
                  <div key={p.id} style={{ background: "var(--surface, rgba(255,255,255,0.04))", border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 18, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: "var(--text, #fff)" }}>{p.businessName}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted, rgba(255,255,255,0.55))", margin: "4px 0 2px" }}>
                          {formatDaetaDateRange(p.workDate, p.workDateEnd)} · {p.workHours} · {p.duty}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "#fb923c" }}>
                            시급 {p.wage.toLocaleString()}원
                          </span>
                          {p.distanceKm != null && (
                            <span style={{ fontSize: 11, color: "var(--text-muted, rgba(255,255,255,0.45))" }}>
                              📍 {p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)}m` : `${p.distanceKm.toFixed(1)}km`}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => apply(p)}
                        disabled={applied || actionLoading === p.id}
                        style={{
                          flexShrink: 0,
                          padding: "10px 16px",
                          background: applied ? "rgba(34,197,94,0.12)" : "#fb923c",
                          border: applied ? "1px solid rgba(34,197,94,0.35)" : "none",
                          borderRadius: 14,
                          color: applied ? "#4ade80" : "#fff",
                          fontSize: 13,
                          fontWeight: 800,
                          cursor: applied ? "default" : "pointer",
                          opacity: actionLoading === p.id ? 0.6 : 1,
                          display: "flex", alignItems: "center", gap: 4,
                        }}>
                        {applied ? "지원됨" : actionLoading === p.id ? "..." : (<><i className="ti ti-send" aria-hidden="true" /> 지원</>)}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={() => router.push("/mypage/daeta-history?tab=worker")}
          style={{ width: "100%", padding: "14px", background: "var(--surface, rgba(255,255,255,0.04))", border: "1px solid var(--border, rgba(255,255,255,0.1))", borderRadius: 16, color: "var(--text, #fff)", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <i className="ti ti-list" aria-hidden="true" /> 내 대타 내역
        </button>
      </div>

      {/* 대타 가능 첫 활성화 시 생년월일 확인 — 야간 SOS 자동 필터(연소근로자 보호)를 위해 필요 */}
      {showBirthModal && (
        <div style={modalOverlay}>
          <div style={{ ...modalSheet, maxWidth: 360, margin: "0 auto" }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 8px", color: "var(--text)" }}>생년월일을 확인할게요</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px", lineHeight: 1.6 }}>
              근로기준법상 만 18세 미만은 야간(22시~06시) 근무가 제한돼요. 대타 가능을 켜기 전, 야간 SOS가 잘못 뜨지 않도록 생년월일만 확인할게요.
            </p>
            <input type="date" value={birthInput} onChange={e => setBirthInput(e.target.value)}
              style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", color: "var(--text)", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowBirthModal(false)} style={{ ...btnSecondary, flex: 1 }}>취소</button>
              <button onClick={saveBirthAndToggle} disabled={savingBirth || !birthInput} style={{ ...btnPrimary, flex: 1, opacity: (savingBirth || !birthInput) ? 0.6 : 1 }}>
                {savingBirth ? "저장 중..." : "확인하고 켜기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {ToastUI}
    </div>
  );
}
