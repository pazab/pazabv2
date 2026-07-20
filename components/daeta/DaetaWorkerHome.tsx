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
import DaetaHistoryView from "@/components/daeta/DaetaHistoryView";
import TierBadge from "@/components/TierBadge";
import { getWorkerTier, DaetaTier } from "@/lib/daetaTier";

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

export default function DaetaWorkerHome({ userId }: { userId: string }) {
  const router = useRouter();
  const { showToast, ToastUI } = useToast();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<WorkerProfileLite | null>(null);
  const [myTier, setMyTier] = useState<DaetaTier>("tier2");
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [nearby, setNearby] = useState<NearbyPosting[]>([]);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    // 1) 내 프로필 (최신 active)
    const { data: profiles } = await supabase
      .from("worker_profiles")
      .select("id, available_now, lat, lng")
      .eq("user_id", userId)
      .eq("is_active", true)
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

    let incomingList: IncomingRequest[] = [];
    if (receivedMatches.length > 0) {
      const postingIds = receivedMatches.map((m: { daeta_posting_id: string }) => m.daeta_posting_id);
      const { data: postings } = await supabase
        .from("daeta_postings")
        .select("id, business_name, region, work_date, work_hours, wage, duty, status")
        .in("id", postingIds)
        .eq("status", "pending");
      const postingMap: Record<string, { business_name: string; region: string; work_date: string; work_hours: string; wage: number; duty: string }> = {};
      (postings || []).forEach((row: { id: string; business_name: string; region: string; work_date: string; work_hours: string; wage: number; duty: string }) => {
        postingMap[row.id] = row;
      });
      incomingList = receivedMatches
        .filter((m: { daeta_posting_id: string }) => postingMap[m.daeta_posting_id])
        .map((m: { id: string; daeta_posting_id: string }) => {
          const post = postingMap[m.daeta_posting_id];
          return {
            matchId: m.id,
            postingId: m.daeta_posting_id,
            businessName: post.business_name,
            region: post.region,
            workDate: post.work_date,
            workHours: post.work_hours,
            wage: post.wage,
            duty: post.duty,
          };
        });
    }
    setIncoming(incomingList);

    // 4) 동네 대타 자리 — Tier별 노출 규칙 (STRATEGY.md §4)
    //    Tier1: stage>=2 / Tier2: (stage>=3 && allow_new) 또는 stage 4
    const { data: openPostings } = await supabase
      .from("daeta_postings")
      .select("id, user_id, business_name, region, work_date, work_hours, wage, duty, lat, lng, escalation_stage, allow_new, status, expires_at")
      .eq("status", "pending")
      .neq("user_id", userId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(30);

    const visible = (openPostings || []).filter((row: { escalation_stage: number; allow_new: boolean }) => {
      const stage = row.escalation_stage || 1;
      if (tier === "tier1") return stage >= 2;
      return (stage >= 3 && row.allow_new) || stage >= 4;
    });

    const myLoc = p?.lat != null && p?.lng != null ? { lat: p.lat, lng: p.lng } : null;
    const nearbyList: NearbyPosting[] = visible
      .map((row: { id: string; user_id: string; business_name: string; region: string; work_date: string; work_hours: string; wage: number; duty: string; lat: number; lng: number; escalation_stage: number }) => ({
        id: row.id,
        employerUserId: row.user_id,
        businessName: row.business_name,
        region: row.region,
        workDate: row.work_date,
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

  const toggleAvailable = async () => {
    if (!profile) {
      showToast("먼저 마이페이지에서 알바 프로필을 만들어 주세요", "warning");
      router.push("/mypage");
      return;
    }
    const next = !profile.available_now;
    const { error } = await supabase
      .from("worker_profiles")
      .update({ available_now: next })
      .eq("id", profile.id);
    if (error) {
      showToast("변경 실패: " + error.message, "error");
      return;
    }
    setProfile({ ...profile, available_now: next });
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

  if (showHistory) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 500, overflowY: "auto" }}>
        <DaetaHistoryView userId={userId} userType="worker" onBack={() => setShowHistory(false)} />
      </div>
    );
  }

  const available = !!profile?.available_now;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg, #0a0a0f)", paddingBottom: 100 }}>
      <AppHeader title="대타" showBellAndMenu />

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px 0" }}>

        {/* 대타 가능 토글 */}
        <button
          onClick={toggleAvailable}
          style={{
            width: "100%",
            padding: "18px 20px",
            background: available
              ? "linear-gradient(135deg, rgba(34,197,94,0.18), rgba(34,197,94,0.08))"
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
            <div style={{ fontSize: 24 }}>{available ? "🟢" : "⚪"}</div>
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
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--text, #fff)", margin: "0 0 10px" }}>📥 나에게 온 대타 요청</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {incoming.map(r => (
                <div key={r.matchId} style={{ background: "rgba(251,146,60,0.07)", border: "1px solid rgba(251,146,60,0.3)", borderRadius: 18, padding: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: "var(--text, #fff)" }}>{r.businessName}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted, rgba(255,255,255,0.55))", margin: "4px 0 2px" }}>
                    {r.workDate} · {r.workHours} · {r.duty}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#fb923c", marginBottom: 12 }}>
                    시급 {r.wage.toLocaleString()}원
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => respond(r.matchId, "accept")}
                      disabled={actionLoading === r.matchId}
                      style={{ flex: 2, padding: "12px", background: "linear-gradient(135deg, #22c55e, #16a34a)", border: "none", borderRadius: 14, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: actionLoading === r.matchId ? 0.6 : 1 }}>
                      {actionLoading === r.matchId ? "처리 중..." : "✅ 수락 (계약 자동 작성)"}
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
          <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--text, #fff)", margin: "0 0 10px" }}>
            📍 지금 열려 있는 동네 대타
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
                          {p.workDate} · {p.workHours} · {p.duty}
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
                          background: applied ? "rgba(34,197,94,0.12)" : "linear-gradient(135deg, #f97316, #ef4444)",
                          border: applied ? "1px solid rgba(34,197,94,0.35)" : "none",
                          borderRadius: 14,
                          color: applied ? "#4ade80" : "#fff",
                          fontSize: 13,
                          fontWeight: 800,
                          cursor: applied ? "default" : "pointer",
                          opacity: actionLoading === p.id ? 0.6 : 1,
                        }}>
                        {applied ? "지원됨" : actionLoading === p.id ? "..." : "🚀 지원"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={() => setShowHistory(true)}
          style={{ width: "100%", padding: "14px", background: "var(--surface, rgba(255,255,255,0.04))", border: "1px solid var(--border, rgba(255,255,255,0.1))", borderRadius: 16, color: "var(--text, #fff)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          📋 내 대타 내역
        </button>
      </div>

      {ToastUI}
    </div>
  );
}
