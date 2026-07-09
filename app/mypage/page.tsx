"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import InviteBottomSheet from "@/components/InviteBottomSheet";

import AppHeader from "@/components/AppHeader";
import { Suspense } from "react";
import { BADGE_DEFS, GRADE_DEFS, getGrade, getBadgesByRole } from "@/lib/trustScore";
import { cardStyle, cardGradientStyle, cardInnerStyle, btnPrimary, btnSecondary, btnAccent, btnGhost, btnDanger, modalOverlay, modalSheet, modalCenter, toggleTrack, toggleThumb } from "@/lib/styles";
import { JobCard } from "@/components/JobCard";

const glassStyle: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.03)",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: 20,
  boxShadow: "0 4px 30px rgba(0, 0, 0, 0.2)",
};

const glassProfileCard: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(236, 72, 153, 0.12) 100%)",
  backdropFilter: "blur(20px)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: 24,
  boxShadow: "0 8px 32px rgba(139, 92, 246, 0.15)",
  padding: "20px 18px",
};

interface UserProfile {
  id: string; email: string; name: string; nickname?: string;
  user_type: "employer" | "worker" | "both";
  trust_score: number; grade: string; profile_completed: boolean;
  avatar_url?: string;
}
interface LoveCall {
  id: string; status: string; match_score: number; message: string;
  created_at: string; counterpart: any;
  employer_id: string; worker_id: string;
  isSent: boolean;
  myRole: string;
}

const GRADE_INFO: Record<string, { label: string; emoji: string; color: string }> = {
  bronze: { label: "브론즈", emoji: "🥉", color: "#fb923c" },
  silver: { label: "실버", emoji: "🥈", color: "#94a3b8" },
  gold: { label: "골드", emoji: "🥇", color: "#fbbf24" },
  platinum: { label: "플래티넘", emoji: "💎", color: "#60a5fa" },
};

function UserGradeBadge({ userId, trustScore, userType = "worker" }: { userId: string; trustScore: number; userType?: "worker" | "employer" | "both" }) {
  const [allBadges, setAllBadges] = useState<any[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<string | null>(null);

  const grade = getGrade(trustScore || 50);

  useEffect(() => {
    supabase.from("user_badges").select("badge_key").eq("user_id", userId)
      .then(({ data }: any) => {
        setAllBadges(data || []);
      });
  }, [userId]);

  const showWorker = userType === "worker" || userType === "both";
  const showEmployer = userType === "employer" || userType === "both";

  const workerBadges = getBadgesByRole(allBadges, "worker");
  const employerBadges = getBadgesByRole(allBadges, "employer");

  const scorePercent = Math.max(0, Math.min(100, trustScore || 50));
  const scoreColor = scorePercent >= 80 ? "#34d399" : scorePercent >= 50 ? "#a78bfa" : "#f87171";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 신뢰도 게이지 바 */}
      <div style={{ background: "var(--surface2)", borderRadius: 16, padding: "12px 14px", border: "1px solid var(--card-inner-border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-sub)", display: "flex", alignItems: "center", gap: 4 }}>
            🎯 종합 신뢰도
          </span>
          <span style={{ fontSize: 15, fontWeight: 900, color: scoreColor }}>{scorePercent}점</span>
        </div>
        <div style={{ width: "100%", height: 10, background: "var(--progress-track)", borderRadius: 6, overflow: "hidden", border: "1px solid var(--card-inner-border)" }}>
          <div style={{ width: `${scorePercent}%`, height: "100%", background: `linear-gradient(90deg, #ec4899, #8b5cf6)`, borderRadius: 6 }} />
        </div>
      </div>

      {showWorker && (
        <div style={{ borderBottom: showEmployer ? "1px dashed rgba(255,255,255,0.1)" : "none", paddingBottom: showEmployer ? 14 : 0 }}>
          {/* 알바생 타이틀 */}
          {userType === "both" && (
            <p style={{ fontSize: 12, fontWeight: 800, color: "var(--text-muted)", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
              <span>⚡</span> 알바생 신뢰등급
            </p>
          )}
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
          {userType === "both" && (
            <p style={{ fontSize: 12, fontWeight: 800, color: "var(--text-muted)", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
              <span>🏪</span> 사장님 신뢰등급
            </p>
          )}
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
        <div style={{ marginTop: 10, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12, padding: "10px 12px" }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: "#86efac", margin: "0 0 4px" }}>
            {BADGE_DEFS[selectedBadge].emoji} {BADGE_DEFS[selectedBadge].name}
          </p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 6px", lineHeight: 1.5 }}>{BADGE_DEFS[selectedBadge].desc}</p>
          <p style={{ fontSize: 11, color: "rgba(134,239,172,0.6)", margin: 0 }}>🎯 {BADGE_DEFS[selectedBadge].cond}</p>
        </div>
      )}
    </div>
  );
}

function WorkerProfileStatus({ userId, router, onUpdate }: { userId: string; router: any; onUpdate?: (p: any) => void }) {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("worker_profiles").select("*").eq("user_id", userId)
      .then(async ({ data }: any) => {
        const withCounts = await Promise.all((data || []).map(async (p: any) => {
          const { count } = await supabase.from("bot_chat_logs")
            .select("*", { count: "exact", head: true })
            .eq("worker_profile_id", p.id);
          return { ...p, newQuestionCount: count || 0 };
        }));
        setProfiles(withCounts);
        if (onUpdate && withCounts.length > 0) {
          onUpdate(withCounts[0]);
        }
        setLoading(false);
      });
  }, [userId]);

  const togglePublic = async (profileId: string, current: boolean) => {
    await supabase.from("worker_profiles").update({ is_public: !current, is_active: !current }).eq("id", profileId);
    setProfiles(prev => {
      const next = prev.map(p => p.id === profileId ? { ...p, is_public: !current, is_active: !current } : p);
      if (onUpdate) {
        const updated = next.find(p => p.id === profileId);
        if (updated) onUpdate(updated);
      }
      return next;
    });
  };

  const deleteProfile = async (profileId: string, setConfirmModal: any) => {
    setConfirmModal({
      title: "구직 공고를 삭제할까요?",
      desc: "삭제된 구직 정보는 복구할 수 없어요.",
      confirmLabel: "삭제하기",
      confirmColor: "rgba(239,68,68,0.8)",
      onConfirm: async () => {
        await supabase.from("worker_profiles").delete().eq("id", profileId);
        setProfiles(prev => prev.filter(p => p.id !== profileId));
        setConfirmModal(null);
      },
    });
  };

  if (loading) return <p style={{ color: "var(--text-muted)", fontSize: 13 }}>불러오는 중...</p>;

  if (!profiles.length) return (
    <div style={{ textAlign: "center", padding: "10px 0" }}>
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 12 }}>아직 구직 공고를 등록하지 않았어요</p>
      <button onClick={() => router.push("/worker/profile?edit=true&return=mypage&section=jobs")}
        style={{ background: "rgba(236,72,153,0.15)", border: "1px solid rgba(236,72,153,0.35)", color: "var(--pink-text)", fontWeight: 700, padding: "10px 20px", borderRadius: 12, cursor: "pointer", fontSize: 13 }}>
        구직 공고 등록하기 →
      </button>
    </div>
  );

  return (
    <WorkerProfileStatusInner profiles={profiles} userId={userId} router={router} togglePublic={togglePublic} deleteProfile={deleteProfile} />
  );
}

function WorkerProfileStatusInner({ profiles, userId, router, togglePublic, deleteProfile }: any) {
  const [confirmModal, setConfirmModal] = useState<any>(null);

  return (
    <div>
      {[...profiles].sort((a, b) => {
        const order: Record<string, number> = { active: 0, matched: 1, completed: 2, cancelled: 3 };
        const ao = order[a.job_status || "active"] ?? 9;
        const bo = order[b.job_status || "active"] ?? 9;
        if (ao !== bo) return ao - bo;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }).map((profile: any) => (
        <div key={profile.id} style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 14, padding: 14, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 2px" }}>
                {profile.desired_type?.split(",").slice(0, 2).join(" · ") || "직종 미설정"}
              </p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                📍 {profile.desired_region || "지역 미설정"} · 💰 {(profile.desired_wage || 0).toLocaleString()}원↑
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {profile.job_status === "completed" ? (
                <span style={{ fontSize: 11, color: "#86efac", fontWeight: 600 }}>✅ 구직 완료</span>
              ) : profile.job_status === "matched" ? (
                <span style={{ fontSize: 11, color: "#fbbf24", fontWeight: 600 }}>🤝 매칭중</span>
              ) : (
                <>
                  <span style={{ fontSize: 11, color: profile.is_public !== false ? "#86efac" : "var(--text-muted)", fontWeight: 600 }}>
                    {profile.is_public !== false ? "구직중" : "비공개"}
                  </span>
                  <div onClick={() => togglePublic(profile.id, profile.is_public !== false)}
                    style={{ width: 44, height: 24, borderRadius: 12, background: profile.is_public !== false ? "#8b5cf6" : "var(--surface)", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0, border: "1px solid var(--border)" }}>
                    <div style={{ position: "absolute", top: 2, left: profile.is_public !== false ? 22 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
                  </div>
                </>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
            <div style={{ display: "flex", gap: 8 }}>
              {profile.job_status !== "completed" && (
                <button onClick={() => router.push(`/worker/profile?edit=true&profileId=${profile.id}&return=mypage&section=jobs`)}
                  style={{ flex: 1, background: "rgba(236,72,153,0.1)", border: "1px solid rgba(236,72,153,0.3)", color: "var(--pink-text)", fontSize: 12, fontWeight: 600, padding: "8px", borderRadius: 10, cursor: "pointer" }}>
                  ✏️ 수정
                </button>
              )}
              <button onClick={() => deleteProfile(profile.id, setConfirmModal)}
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontSize: 12, fontWeight: 600, padding: "8px 14px", borderRadius: 10, cursor: "pointer" }}>
                🗑️
              </button>
            </div>
            {profile.newQuestionCount > 0 && (
              <button onClick={() => router.push(`/worker/questions?profileId=${profile.id}`)}
                style={{ width: "100%", background: "var(--chip-purple-bg)", border: "1px solid var(--chip-purple-border)", color: "var(--purple-text)", fontSize: 12, fontWeight: 700, padding: "8px", borderRadius: 10, cursor: "pointer" }}>
                📬 사장님 질문 {profile.newQuestionCount}개 확인하기
              </button>
            )}
          </div>
        </div>
      ))}
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
    </div>
  );
}

function ConfirmModal({ title, desc, confirmLabel, confirmColor, onConfirm, onCancel }: {
  title: string; desc: string; confirmLabel: string; confirmColor?: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: "var(--surface)", borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 640, margin: "0 auto" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>{title}</h3>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px", lineHeight: 1.6 }}>{desc}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onConfirm}
            style={{ flex: 1, background: confirmColor || "linear-gradient(135deg, #8b5cf6, #7c3aed)", border: "none", color: "#fff", fontWeight: 700, padding: 14, borderRadius: 12, cursor: "pointer", fontSize: 14 }}>
            {confirmLabel}
          </button>
          <button onClick={onCancel}
            style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)", fontWeight: 600, padding: 14, borderRadius: 12, cursor: "pointer", fontSize: 14 }}>
            아니요
          </button>
        </div>
      </div>
    </div>
  );
}

function LoveCallSection({ title, calls, showRespond, respondingId, onRespond, onCancel, onDelete, onNavigate, onProgress, router }: {
  title: string; calls: any[]; showRespond: boolean;
  respondingId: string | null;
  onRespond: (id: string, action: "accept" | "reject") => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigate: (lc: any) => void;
  onProgress?: (id: string, action: string) => void;
  router: any;
}) {
  // 정렬: 진행중 > 대기중 > 성사됨 > 채용완료 > 기타
  const sortOrder: Record<string, number> = {
    interviewing: 0, accepted: 1, pending: 2,
    hired: 3, rejected: 4, cancelled: 5, failed: 6
  };
  const sorted = [...calls].sort((a, b) => {
    const as = sortOrder[a.progress_status || a.status] ?? 9;
    const bs = sortOrder[b.progress_status || b.status] ?? 9;
    if (as !== bs) return as - bs;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const getStatusInfo = (lc: any) => {
    const ps = lc.progress_status || lc.status;
    switch (ps) {
      case "interviewing": return { label: "📅 면접 진행중", color: "#fbbf24", bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.3)" };
      case "hired": return { label: "✅ 채용 확정", color: "#86efac", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.3)" };
      case "accepted": return { label: "🎉 매칭 성사", color: "var(--purple-text)", bg: "rgba(139,92,246,0.1)", border: "rgba(139,92,246,0.3)" };
      case "pending": return { label: "⏳ 대기중", color: "#fbbf24", bg: "rgba(251,191,36,0.05)", border: "var(--border)" };
      case "rejected": return { label: "거절됨", color: "#f87171", bg: "transparent", border: "var(--border)" };
      case "cancelled": return { label: "취소됨", color: "#6b7280", bg: "transparent", border: "var(--border)" };
      case "failed": return { label: "매칭 실패", color: "#6b7280", bg: "transparent", border: "var(--border)" };
      default: return { label: ps, color: "var(--text-muted)", bg: "transparent", border: "var(--border)" };
    }
  };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: 20, marginBottom: 12 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px" }}>{title}
        {calls.filter(lc => lc.status === "pending").length > 0 && (
          <span style={{ marginLeft: 8, background: "#8b5cf6", color: "#fff", fontSize: 10, padding: "2px 7px", borderRadius: 20 }}>
            {calls.filter(lc => lc.status === "pending").length}
          </span>
        )}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.map(lc => {
          const cp = lc.counterpart;
          const statusInfo = getStatusInfo(lc);
          const isWorkerRole = lc.myRole === "worker";
          const name = isWorkerRole ? cp?.business_name || "매장" : cp?.name || "알바생";
          const isActive = ["interviewing", "hired", "accepted"].includes(lc.progress_status || lc.status);
          return (
            <div key={lc.id} style={{ background: isActive ? statusInfo.bg : "rgba(0,0,0,0.12)", borderRadius: 14, padding: 12, border: `1px solid ${statusInfo.border}`, transition: "all 0.2s", position: "relative" }}>
              {/* cancelled/failed/rejected 상태 쓰레기통 */}
              {["cancelled", "failed", "rejected"].includes(lc.progress_status || lc.status) && (
                <button onClick={() => onDelete(lc.id)}
                  style={{ width: "100%", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", color: "#f87171", fontSize: 12, padding: "7px", borderRadius: 10, cursor: "pointer", marginTop: 4 }}>
                  🗑️ 기록 삭제
                </button>
              )}

              {/* 상단: 이름 + 상태 (클릭하면 상세로) */}
              <button onClick={() => onNavigate(lc)}
                style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 2px", color: "var(--text)" }}>
                    {isWorkerRole ? "🏪" : "⚡"} {name}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                    궁합 {lc.match_score}점 · {new Date(lc.created_at).toLocaleDateString("ko-KR")} · 탭하면 상세 보기
                  </p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: statusInfo.color, background: `${statusInfo.color}20`, padding: "3px 8px", borderRadius: 20, flexShrink: 0, whiteSpace: "nowrap" }}>
                  {statusInfo.label}
                </span>
              </button>

              {/* 공고 정보 */}
              {isWorkerRole && cp && (
                <div style={{ background: "rgba(0,0,0,0.12)", borderRadius: 10, padding: "8px 10px", marginBottom: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {cp.business_type && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>🏷️ {cp.business_type}</span>}
                  {cp.region && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>📍 {cp.region}</span>}
                  {cp.wage && <span style={{ fontSize: 11, color: "var(--purple-text)" }}>💰 {cp.wage.toLocaleString()}원</span>}
                  {cp.work_days && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>📅 {cp.work_days}</span>}
                </div>
              )}
              {!isWorkerRole && cp && (
                <div style={{ background: "rgba(0,0,0,0.12)", borderRadius: 10, padding: "8px 10px", marginBottom: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {cp.desired_type && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>🏷️ {cp.desired_type}</span>}
                  {cp.desired_region && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>📍 {cp.desired_region}</span>}
                  {cp.desired_wage && <span style={{ fontSize: 11, color: "var(--pink-text)" }}>💰 {cp.desired_wage.toLocaleString()}원↑</span>}
                </div>
              )}

              {/* 면접 일정 표시 */}
              {lc.interview_at && (
                <div style={{ background: "rgba(251,191,36,0.1)", borderRadius: 8, padding: "6px 10px", marginBottom: 8, fontSize: 12, color: "#fbbf24" }}>
                  📅 면접: {new Date(lc.interview_at).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {lc.interview_memo && ` · ${lc.interview_memo}`}
                </div>
              )}

              {lc.message && (
                <p style={{ fontSize: 12, color: "var(--text-sub)", background: "rgba(0,0,0,0.1)", borderRadius: 8, padding: "6px 10px", margin: "0 0 8px" }}>
                  💬 {lc.message}
                </p>
              )}

              {/* 수락/거절 버튼 */}
              {showRespond && lc.status === "pending" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => onRespond(lc.id, "accept")} disabled={respondingId === lc.id}
                    style={{ flex: 1, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", color: "#86efac", fontWeight: 700, padding: "8px", borderRadius: 10, cursor: "pointer", fontSize: 13 }}>
                    ✓ 수락
                  </button>
                  <button onClick={() => onRespond(lc.id, "reject")} disabled={respondingId === lc.id}
                    style={{ flex: 1, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontWeight: 700, padding: "8px", borderRadius: 10, cursor: "pointer", fontSize: 13 }}>
                    ✗ 거절
                  </button>
                </div>
              )}

              {/* 진행 단계 버튼 */}
              {(() => {
                const ps = lc.progress_status || lc.status;
                if (ps === "accepted") return (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => router.push(`/chat/${lc.id}`)}
                      style={{ flex: 1, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", border: "none", color: "#fff", fontWeight: 700, padding: "8px", borderRadius: 10, cursor: "pointer", fontSize: 12 }}>
                      💬 채팅하기
                    </button>
                    {onProgress && lc.myRole === "employer" && (
                      <button onClick={() => onProgress(lc.id, "interview")}
                        style={{ flex: 1, background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)", color: "#fbbf24", fontWeight: 700, padding: "8px", borderRadius: 10, cursor: "pointer", fontSize: 12 }}>
                        📅 면접 예약
                      </button>
                    )}
                  </div>
                );
                if (ps === "interviewing") return (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => router.push(`/chat/${lc.id}`)}
                      style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)", fontWeight: 600, padding: "8px", borderRadius: 10, cursor: "pointer", fontSize: 12 }}>
                      💬 채팅
                    </button>
                    {onProgress && lc.myRole === "employer" && (
                      <>
                        <button onClick={() => onProgress(lc.id, "hire")}
                          style={{ flex: 1, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", color: "#86efac", fontWeight: 700, padding: "8px", borderRadius: 10, cursor: "pointer", fontSize: 12 }}>
                          ✅ 채용 확정
                        </button>
                        <button onClick={() => onProgress(lc.id, "fail")}
                          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontWeight: 600, padding: "8px 10px", borderRadius: 10, cursor: "pointer", fontSize: 12 }}>
                          ✗
                        </button>
                      </>
                    )}
                  </div>
                );
                if (ps === "hired") return (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => router.push(`/chat/${lc.id}`)}
                      style={{ flex: 1, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#86efac", fontWeight: 600, padding: "8px", borderRadius: 10, cursor: "pointer", fontSize: 12 }}>
                      💬 채팅하기
                    </button>
                    <button onClick={() => onDelete(lc.id)}
                      style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontSize: 12, fontWeight: 600, padding: "8px 14px", borderRadius: 10, cursor: "pointer" }}>
                      🗑️
                    </button>
                  </div>
                );
                return null;
              })()}

              {/* 보낸것 취소 버튼 - 취소/실패/거절 상태 제외 */}
              {!showRespond && !["cancelled", "failed", "rejected", "hired"].includes(lc.progress_status || lc.status) && (
                <button onClick={() => onCancel(lc.id)}
                  style={{ width: "100%", background: "none", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontSize: 12, padding: "7px", borderRadius: 10, cursor: "pointer" }}>
                  러브콜 취소하기
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MyPageContent() {
  const router = useRouter();
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
  const [userId, setUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewType, setViewType] = useState<"worker" | "employer">(tabParam || "worker");
  const [loveCalls, setLoveCalls] = useState<LoveCall[]>([]);
  const [loveCallLoading, setLoveCallLoading] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [basicResult, setBasicResult] = useState<any>(null);
  const [advancedResult, setAdvancedResult] = useState<any>(null);
  const [hasWorkerInterview, setHasWorkerInterview] = useState(false);
  const [hasEmployerInterview, setHasEmployerInterview] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobLoading, setJobLoading] = useState(false);
  const [showRetryModal, setShowRetryModal] = useState(false);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [confirmModal, setConfirmModal] = useState<{
    title: string; desc: string; confirmLabel: string; confirmColor?: string; onConfirm: () => void;
  } | null>(null);

  const [myWorkerProfile, setMyWorkerProfile] = useState<any>(null);
  const [myEmployerProfile, setMyEmployerProfile] = useState<any>(null);
  const [showWorkerCalls, setShowWorkerCalls] = useState(false);
  const [showEmployerCalls, setShowEmployerCalls] = useState(false);

  useEffect(() => { fetchUser(); }, []);
  useEffect(() => { if (user) loadResultsForType(viewType, user.id); }, [viewType]);

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
        const newUser = {
          id: session.user.id, email: session.user.email,
          name: session.user.user_metadata?.full_name || "파잡유저",
          user_type: localStorage.getItem("pending_user_type") || "worker",
          profile_completed: false, trust_score: 50, grade: "bronze", is_active: true,
        };
        await supabase.from("users").upsert(newUser);
        userData = newUser as any;
      }
      setUser(userData);
      const uType = userData?.user_type || "worker";
      // tabParam 있으면 그걸로, 없으면 user_type으로
      if (!tabParam) setViewType(uType === "both" ? "worker" : uType as "worker" | "employer");
      loadResultsForType(tabParam || uType, session.user.id);
      const hw = !!(localStorage.getItem(`interview_result_basic_worker`) || localStorage.getItem(`interview_result_advanced_worker`));
      const he = !!(localStorage.getItem(`interview_result_basic_employer`) || localStorage.getItem(`interview_result_advanced_employer`));

      // DB에서도 확인 (다른 기기/카카오 로그인 대비)
      const { data: dbUser } = await supabase.from("users").select("worker_result, employer_result").eq("id", session.user.id).single();
      const hwDb = !!(dbUser?.worker_result);
      const heDb = !!(dbUser?.employer_result);

      setHasWorkerInterview(hw || hwDb);
      setHasEmployerInterview(he || heDb);
      fetchLoveCalls(session.user.id, uType);
      fetchJobs(session.user.id);

      // 구직 및 매장 공고 최신본 가져오기 (미리보기용)
      const { data: wps } = await supabase.from("worker_profiles").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false });
      const { data: eps } = await supabase.from("employer_profiles").select("*").eq("user_id", session.user.id).or("is_deleted.is.null,is_deleted.eq.false").not("business_name", "is", null).order("created_at", { ascending: false });
      setMyWorkerProfile(wps?.[0] || null);
      setMyEmployerProfile(eps?.[0] || null);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fetchJobs = async (uid: string) => {
    setJobLoading(true);
    try {
      const { data: rawJobs } = await supabase.from("jobs")
        .select("*, employer_profiles!inner(id, business_name, business_type, region, image_url, image_urls, is_deleted)")
        .eq("user_id", uid)
        .neq("job_type", "urgent")
        .neq("job_status", "closed")
        .order("created_at", { ascending: false });
      // 삭제된 매장의 공고 제외 + 매장 정보 flatten
      const flatJobs = (rawJobs || [])
        .filter((j: any) => !j.employer_profiles?.is_deleted)
        .map((j: any) => ({ ...j, ...j.employer_profiles, id: j.id, employer_profile_id: j.employer_profile_id }));
      const jobsWithLogs = await Promise.all(flatJobs.map(async (job: any) => {
        const { count } = await supabase.from("bot_chat_logs")
          .select("*", { count: "exact", head: true })
          .eq("employer_profile_id", job.employer_profile_id)
          .eq("bot_uncertain", true);
        return { ...job, newQuestionCount: count || 0 };
      }));
      setJobs(jobsWithLogs);
    } catch (err) { console.error(err); }
    finally { setJobLoading(false); }
  };

  const toggleJobActive = async (jobId: string, current: boolean) => {
    await supabase.from("jobs").update({ is_active: !current }).eq("id", jobId);
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, is_active: !current } : j));
  };

  const deleteJob = async (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    const isMatched = job?.job_status === "matched";
    setConfirmModal({
      title: isMatched ? "매칭 중인 공고를 마감할까요?" : "공고를 마감할까요?",
      desc: isMatched
        ? "진행 중인 매칭이 취소되고 공고가 내려가요. 매장 정보는 유지돼요."
        : "공고가 탐색에서 내려가요. 매장 정보는 유지되고 나중에 다시 올릴 수 있어요.",
      confirmLabel: "마감하기",
      confirmColor: "rgba(239,68,68,0.8)",
      onConfirm: async () => {
        if (isMatched) {
          await supabase.from("matches")
            .update({ status: "cancelled", progress_status: "cancelled" })
            .or(`job_id.eq.${jobId},employer_profile_id.eq.${job?.employer_profile_id}`);
        }
        await supabase.from("jobs").update({ is_active: false, job_status: "closed" }).eq("id", jobId);
        setJobs(prev => prev.filter(j => j.id !== jobId));
        setConfirmModal(null);
      },
    });
  };

  const handleCancel = async (matchId: string) => {
    setConfirmModal({
      title: "러브콜을 취소할까요?",
      desc: "취소 기록은 남아있고, 나중에 삭제할 수 있어요.",
      confirmLabel: "네, 취소할게요",
      confirmColor: "rgba(239,68,68,0.8)",
      onConfirm: async () => {
        try {
          const res = await fetch("/api/lovecall", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matchId, action: "cancel" }),
          });
          const data = await res.json();
          if (data.success) {
            setLoveCalls(prev => prev.map(lc => lc.id === matchId ? { ...lc, status: "cancelled", progress_status: "cancelled" } : lc));
          } else {
            alert("취소 실패: " + (data.error || "알 수 없는 오류"));
          }
        } catch (err) { console.error(err); }
        setConfirmModal(null);
      },
    });
  };

  const handleDelete = async (matchId: string) => {
    setConfirmModal({
      title: "기록을 삭제할까요?",
      desc: "삭제하면 복구할 수 없어요.",
      confirmLabel: "삭제하기",
      confirmColor: "rgba(239,68,68,0.8)",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/lovecall?matchId=${matchId}`, {
            method: "DELETE",
          });
          const data = await res.json();
          if (data.success) {
            setLoveCalls(prev => prev.filter(lc => lc.id !== matchId));
          } else {
            alert("삭제 실패: " + (data.error || "알 수 없는 오류"));
          }
        } catch (err) { console.error(err); }
        setConfirmModal(null);
      },
    });
  };

  const handleProgress = async (matchId: string, action: string) => {
    try {
      const res = await fetch("/api/lovecall", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, action }),
      });
      const data = await res.json();
      if (data.success) {
        setLoveCalls(prev => prev.map(lc =>
          lc.id === matchId ? { ...lc, progress_status: action === "interview" ? "interviewing" : action === "hire" ? "hired" : "failed" } : lc
        ));
      }
    } catch (err) { console.error(err); }
  };

  const fetchLoveCalls = async (uid: string, uType: string) => {
    setLoveCallLoading(true);
    try {
      const res = await fetch(`/api/lovecall?userId=${uid}&userType=${uType}`);
      const data = await res.json();
      if (data.success) setLoveCalls(data.data || []);
    } catch (err) { console.error(err); }
    finally { setLoveCallLoading(false); }
  };

  const [matchModal, setMatchModal] = useState<{ matchId: string } | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const handleWithdraw = async () => {
    if (!userId) return;
    setWithdrawing(true);
    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        await supabase.auth.signOut();
        router.replace("/");
      }
    } catch (e) {
      console.error("탈퇴 오류:", e);
    }
    setWithdrawing(false);
  };

  const handleRespond = async (matchId: string, action: "accept" | "reject") => {
    setRespondingId(matchId);
    try {
      const res = await fetch("/api/lovecall", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, action }),
      });
      const data = await res.json();
      if (data.success) {
        setLoveCalls(prev => prev.map(lc =>
          lc.id === matchId ? { ...lc, status: action === "accept" ? "accepted" : "rejected" } : lc
        ));
        if (action === "accept") {
          // 시스템 메시지 전송
          const lc = loveCalls.find(l => l.id === matchId);
          if (lc) {
            await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                matchId,
                senderId: userId,
                receiverId: lc.myRole === "worker" ? lc.employer_id : lc.worker_id,
                message: "🎉 매칭이 성사됐어요! 서로 인사를 나눠보세요 😊",
                messageType: "system",
              }),
            });
          }
          setMatchModal({ matchId });
        }
      }
    } catch (err) { console.error(err); }
    finally { setRespondingId(null); }
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
  const showBothTabs = (hasWorkerInterview && hasEmployerInterview) || user?.user_type === "both";

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 120 }}>
      <AppHeader title="MY" showSettings />

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px" }}>
        <div style={{ padding: "0 0px" }}>

        {/* 프로필 카드 */}
        <div style={{ ...glassProfileCard, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            {/* 아바타 + 업로드 */}
            <label style={{ cursor: "pointer", flexShrink: 0, position: "relative" }}>
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !user) return;
                const ext = file.name.split(".").pop();
                const path = `${user.id}.${ext}`;
                const { error } = await supabase.storage.from("media").upload(path, file, { upsert: true });
                console.log("upload error:", error);
                if (!error) {
                  const { data } = supabase.storage.from("media").getPublicUrl(path);
                  const avatarUrl = `${data.publicUrl}?t=${Date.now()}`;
                  console.log("publicUrl:", avatarUrl);
                  const { error: dbErr } = await supabase.from("users").update({ avatar_url: avatarUrl }).eq("id", user.id);
                  console.log("db error:", dbErr);
                  await supabase.from("worker_profiles").update({ image_url: avatarUrl }).eq("user_id", user.id);
                  await supabase.from("employer_profiles").update({ image_url: avatarUrl }).eq("user_id", user.id);
                  setUser(prev => prev ? { ...prev, avatar_url: avatarUrl } : prev);
                }
              }} />
               {(user as any).avatar_url ? (
                <img src={(user as any).avatar_url} alt="avatar"
                  style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--primary-border)" }} />
              ) : (
                <div style={{
                  width: 52, height: 52, borderRadius: "50%",
                  background: "linear-gradient(135deg, #f59e0b, #ef4444)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
                  border: "2px dashed var(--primary-border)"
                }}>
                  {user.user_type === "employer" ? "🏪" : "👤"}
                </div>
              )}
              <div style={{ position: "absolute", bottom: 0, right: 0, background: "#8b5cf6", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>
                ✏️
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
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-muted)", fontSize: 10, padding: "3px 8px", borderRadius: 20, cursor: "pointer" }}>
                  닉네임 변경
                </button>
                <button onClick={() => setShowWithdrawModal(true)}
                  style={{ background: "none", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171", fontSize: 10, padding: "3px 8px", borderRadius: 20, cursor: "pointer" }}>
                  탈퇴
                </button>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{authEmail}</p>
            </div>
          </div>
          <div style={{ ...cardInnerStyle, background: "var(--card-inner)", border: "1px solid var(--card-inner-border)", borderRadius: 16, padding: "14px 16px", marginBottom: 12 }}>
            {/* 등급 + 뱃지 */}
            <UserGradeBadge userId={user.id} trustScore={user.trust_score} userType={user.user_type} />
          </div>

        </div>

        {/* 팀·소속 바로가기 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <button onClick={() => router.push("/myteam")}
            style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 16, padding: "14px", textAlign: "left", display: "flex", flexDirection: "column", gap: 6, cursor: "pointer" }}>
            <span style={{ fontSize: 22 }}>👥</span>
            <p style={{ fontSize: 13, fontWeight: 800, margin: 0, color: "var(--purple-text)" }}>내 팀 · 소속</p>
            <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>소속 매장 및 팀원 관리</p>
          </button>
          <button onClick={() => setInviteOpen(true)}
            style={{ background: "rgba(236,72,153,0.08)", border: "1px solid rgba(236,72,153,0.2)", borderRadius: 16, padding: "14px", textAlign: "left", display: "flex", flexDirection: "column", gap: 6, cursor: "pointer" }}>
            <span style={{ fontSize: 22 }}>🎫</span>
            <p style={{ fontSize: 13, fontWeight: 800, margin: 0, color: "var(--pink-text)" }}>팀원 초대</p>
            <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>닉네임으로 초대하기</p>
          </button>
        </div>

        {/* 급여 명세서 바로가기 */}
        <button onClick={() => router.push("/payslip/list")}
          style={{ width: "100%", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 16, padding: "14px 16px", textAlign: "left", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 20 }}>
          <span style={{ fontSize: 22 }}>📋</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 800, margin: 0, color: "#10b981" }}>급여 명세서 보관함</p>
            <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>발행했거나 수령한 급여 명세서 전체 목록</p>
          </div>
        </button>

        {/* ── 알바생 섹션 (worker / both) ── */}
        {(user.user_type === "worker" || user.user_type === "both") && (() => {
          const wReceived = loveCalls.filter(lc => lc.myRole === "worker" && !lc.isSent);
          const wSent = loveCalls.filter(lc => lc.myRole === "worker" && lc.isSent);
          const wTotal = wReceived.length + wSent.length;
          const wPending = wReceived.filter(lc => lc.status === "pending").length;
          return (
            <section style={{ marginBottom: 20 }}>
              <div style={{ background: "linear-gradient(135deg,#ec4899 60%,#7c3aed)", borderRadius: 16, padding: "14px 18px", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: wTotal > 0 ? 10 : 0 }}>
                  <div>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", margin: "0 0 2px" }}>내 구직 활동</p>
                    <p style={{ fontSize: 18, fontWeight: 900, color: "#fff", margin: 0 }}>⚡ 알바생</p>
                  </div>
                  <button onClick={() => router.push("/worker/profile?edit=true&return=mypage&new=true")}
                    style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 12, padding: "8px 14px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    + 구직 공고
                  </button>
                </div>
                {/* 러브콜 배지 버튼 */}
                {!loveCallLoading && (
                  <button onClick={() => setShowWorkerCalls(v => !v)}
                    style={{ width: "100%", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
                      💌 러브콜
                      {wPending > 0 && <span style={{ background: "#fff", color: "#ec4899", fontSize: 10, fontWeight: 900, borderRadius: 20, padding: "1px 7px" }}>{wPending}개 대기</span>}
                      {wPending === 0 && wTotal > 0 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{wTotal}건</span>}
                      {wTotal === 0 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>없음</span>}
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, transition: "transform 0.2s", transform: showWorkerCalls ? "rotate(180deg)" : "none" }}>▾</span>
                  </button>
                )}
              </div>

              <div style={{ background: "var(--surface)", border: "1px solid rgba(236,72,153,0.18)", borderRadius: 16, padding: "16px", marginBottom: 10 }}>
                <WorkerProfileStatus userId={user.id} router={router} onUpdate={(p) => setMyWorkerProfile(p)} />
              </div>

              {showWorkerCalls && (
                <div>
                  {wReceived.length === 0 && wSent.length === 0 ? (
                    <div style={{ background: "var(--surface)", border: "1px solid rgba(236,72,153,0.12)", borderRadius: 16, padding: "20px 16px", textAlign: "center" }}>
                      <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 10px" }}>아직 러브콜이 없어요</p>
                      <button onClick={() => router.push("/explore?type=worker")}
                        style={{ background: "rgba(236,72,153,0.12)", border: "1px solid rgba(236,72,153,0.3)", color: "var(--pink-text)", padding: "7px 18px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                        매장 둘러보기 →
                      </button>
                    </div>
                  ) : (
                    <>
                      {wReceived.length > 0 && <LoveCallSection title="💌 받은 러브콜" calls={wReceived} showRespond={true} respondingId={respondingId} onRespond={handleRespond} onCancel={handleCancel} onNavigate={(lc) => router.push(`/job/${lc.employer_id}`)} onDelete={handleDelete} router={router} />}
                      {wSent.length > 0 && <LoveCallSection title="📤 보낸 러브콜" calls={wSent} showRespond={false} respondingId={respondingId} onRespond={handleRespond} onCancel={handleCancel} onNavigate={(lc) => router.push(`/job/${lc.employer_id}`)} onDelete={handleDelete} router={router} />}
                    </>
                  )}
                </div>
              )}
            </section>
          );
        })()}

        {/* ── 사장님 섹션 (employer / both) ── */}
        {(user.user_type === "employer" || user.user_type === "both") && (() => {
          const eReceived = loveCalls.filter(lc => lc.myRole === "employer" && !lc.isSent);
          const eSent = loveCalls.filter(lc => lc.myRole === "employer" && lc.isSent);
          const eTotal = eReceived.length + eSent.length;
          const ePending = eReceived.filter(lc => lc.status === "pending").length;
          return (
          <section style={{ marginBottom: 20 }}>
            <div style={{ background: "linear-gradient(135deg,#7c3aed 60%,#ec4899)", borderRadius: 16, padding: "14px 18px", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: !loveCallLoading ? 10 : 0 }}>
                <div>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", margin: "0 0 2px" }}>내 채용 활동</p>
                  <p style={{ fontSize: 18, fontWeight: 900, color: "#fff", margin: 0 }}>🏪 사장님</p>
                </div>
                <button onClick={() => router.push("/employer/register?return=mypage")}
                  style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 12, padding: "8px 14px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  + 매장 공고
                </button>
              </div>
              {!loveCallLoading && (
                <button onClick={() => setShowEmployerCalls(v => !v)}
                  style={{ width: "100%", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
                    💌 러브콜
                    {ePending > 0 && <span style={{ background: "#fff", color: "#7c3aed", fontSize: 10, fontWeight: 900, borderRadius: 20, padding: "1px 7px" }}>{ePending}개 대기</span>}
                    {ePending === 0 && eTotal > 0 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{eTotal}건</span>}
                    {eTotal === 0 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>없음</span>}
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, transition: "transform 0.2s", transform: showEmployerCalls ? "rotate(180deg)" : "none" }}>▾</span>
                </button>
              )}
            </div>

            {/* 매장 공고 카드 */}
            <div style={{ background: "var(--surface)", border: "1px solid rgba(124,58,237,0.18)", borderRadius: 16, padding: "16px", marginBottom: 10 }}>
              {jobLoading ? (
                <p style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", margin: 0 }}>불러오는 중...</p>
              ) : jobs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "12px 0" }}>
                  <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 10 }}>등록된 공고가 없어요</p>
                  <button onClick={() => router.push("/employer/register?return=mypage")}
                    style={{ background: "var(--chip-purple-bg)", border: "1px solid var(--chip-purple-border)", color: "var(--purple-text)", fontWeight: 700, padding: "10px 20px", borderRadius: 12, cursor: "pointer", fontSize: 13 }}>
                    공고 등록하기 →
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[...jobs].sort((a, b) => {
                    const order: Record<string, number> = { active: 0, matched: 1, completed: 2, cancelled: 3 };
                    return (order[a.job_status || "active"] ?? 9) - (order[b.job_status || "active"] ?? 9);
                  }).map(job => (
                    <div key={job.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 2px", color: "var(--text)" }}>{job.business_name}</p>
                          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{job.business_type} · {(job.region || "").split(" ").slice(0, 2).join(" ")} · {(job.wage || 0).toLocaleString()}원</p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          {job.job_status === "completed" ? (
                            <span style={{ fontSize: 11, color: "var(--success-text)", fontWeight: 600 }}>✅ 채용완료</span>
                          ) : job.job_status === "matched" ? (
                            <span style={{ fontSize: 11, color: "#d97706", fontWeight: 600 }}>🤝 매칭중</span>
                          ) : (
                            <>
                              <span style={{ fontSize: 11, color: job.is_active ? "var(--success-text)" : "var(--text-muted)", fontWeight: 700 }}>{job.is_active ? "모집중" : "비공개"}</span>
                              <div onClick={() => toggleJobActive(job.id, job.is_active)}
                                style={{ width: 40, height: 22, borderRadius: 11, background: job.is_active ? "#ec4899" : "var(--surface)", cursor: "pointer", position: "relative", transition: "background 0.2s", border: "1px solid var(--border)" }}>
                                <div style={{ position: "absolute", top: 2, left: job.is_active ? 19 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                        {!["completed", "matched"].includes(job.job_status) && (
                          <button onClick={() => router.push(`/employer/register?edit=true&jobId=${job.id}&return=mypage`)}
                            style={{ background: "rgba(236,72,153,0.1)", border: "1px solid rgba(236,72,153,0.3)", color: "var(--pink-text)", fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 8, cursor: "pointer" }}>
                            ✏️ 수정
                          </button>
                        )}
                        <button onClick={() => router.replace(`/employer/interview?profileId=${job.employer_profile_id}`)}
                          style={{ background: job.bot_interview_done ? "var(--chip-green-bg)" : "var(--chip-purple-bg)", border: `1px solid ${job.bot_interview_done ? "var(--chip-green-border)" : "var(--chip-purple-border)"}`, color: job.bot_interview_done ? "var(--success-text)" : "var(--purple-text)", fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 8, cursor: "pointer" }}>
                          {job.bot_interview_done ? "✅ 봇설정" : "🤖 봇설정"}
                        </button>
                        {job.newQuestionCount > 0 && (
                          <button onClick={() => router.push(`/employer/questions?profileId=${job.employer_profile_id}`)}
                            style={{ background: "rgba(236,72,153,0.1)", border: "1px solid rgba(236,72,153,0.3)", color: "var(--pink-text)", fontSize: 11, fontWeight: 700, padding: "6px 10px", borderRadius: 8, cursor: "pointer" }}>
                            📬 {job.newQuestionCount}개
                          </button>
                        )}
                        <button onClick={() => deleteJob(job.id)}
                          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 8, cursor: "pointer" }}>
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {showEmployerCalls && (
              <div>
                {eReceived.length === 0 && eSent.length === 0 ? (
                  <div style={{ background: "var(--surface)", border: "1px solid rgba(124,58,237,0.12)", borderRadius: 16, padding: "20px 16px", textAlign: "center" }}>
                    <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>아직 러브콜이 없어요</p>
                  </div>
                ) : (
                  <>
                    {eReceived.length > 0 && <LoveCallSection title="💌 받은 러브콜" calls={eReceived} showRespond={true} respondingId={respondingId} onRespond={handleRespond} onCancel={handleCancel} onNavigate={(lc) => router.push(`/worker/${lc.counterpart?.user_id || lc.worker_id}`)} onDelete={handleDelete} router={router} />}
                    {eSent.length > 0 && <LoveCallSection title="📤 보낸 러브콜" calls={eSent} showRespond={false} respondingId={respondingId} onRespond={handleRespond} onCancel={handleCancel} onNavigate={(lc) => router.push(`/worker/${lc.counterpart?.user_id || lc.worker_id}`)} onDelete={handleDelete} router={router} />}
                  </>
                )}
              </div>
            )}
          </section>
          );
        })()}

        {/* 로그아웃 */}
        <button onClick={handleLogout}
          style={{ ...btnDanger, borderRadius: 16 }}>
          로그아웃
        </button>

        {/* 역할 추가 */}
        {user?.user_type !== "both" && (
          <button onClick={async () => {
            const newType = "both";
            await supabase.from("users").update({ user_type: newType }).eq("id", user?.id);
            setUser((prev: any) => ({ ...prev, user_type: newType }));
          }}
            style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)", fontWeight: 600, padding: 12, borderRadius: 14, fontSize: 13, cursor: "pointer", marginTop: 8 }}>
            {user?.user_type === "worker" ? "🏪 사장님 역할 추가하기" : "⚡ 알바생 역할 추가하기"}
          </button>
        )}
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
                탈퇴 시 아래 데이터가 삭제됩니다.
              </p>
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
                {["프로필 및 성향분석 결과", "등록한 공고/구직 정보", "채팅 내용", "AI 봇 대화 기록"].map(item => (
                  <div key={item} style={{ fontSize: 12, color: "#f87171", marginBottom: 4 }}>✗ {item}</div>
                ))}
                <div style={{ borderTop: "1px solid rgba(239,68,68,0.2)", marginTop: 6, paddingTop: 6 }}>
                  <div style={{ fontSize: 11, color: "#71717a" }}>* 법령에 따라 매칭/거래 기록은 익명화 후 보관됩니다</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowWithdrawModal(false)}
                  style={{ ...btnSecondary, flex: 1 }}>
                  취소
                </button>
                <button onClick={handleWithdraw} disabled={withdrawing}
                  style={{ ...btnDanger, flex: 1 }}>
                  {withdrawing ? "처리 중..." : "탈퇴하기"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 닉네임 변경 모달 */}
        {showNicknameModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
            <div style={{ ...modalSheet, maxWidth: 640, margin: "0 auto" }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>닉네임 변경</h3>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>다른 사용자에게 표시되는 이름이에요</p>
              <input
                type="text"
                value={nicknameInput}
                onChange={e => setNicknameInput(e.target.value.slice(0, 20))}
                placeholder="닉네임 입력 (최대 20자)"
                autoFocus
                style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--primary-border)", borderRadius: 12, padding: "12px 16px", color: "var(--text)", fontSize: 15, outline: "none", boxSizing: "border-box", marginBottom: 6 }}
              />
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 16px", textAlign: "right" }}>{nicknameInput.length}/20</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={async () => {
                  const next = nicknameInput.trim();
                  if (!next || !user) return;
                  // 중복 체크 (본인 제외)
                  const { data: dup } = await supabase.from("users")
                    .select("id").ilike("nickname", next).neq("id", user.id).limit(1);
                  if (dup && dup.length > 0) {
                    setToastMsg("이미 사용 중인 닉네임이에요");
                    return;
                  }
                  await supabase.from("users").update({ nickname: next }).eq("id", user.id);
                  setUser(prev => prev ? { ...prev, nickname: next } : prev);
                  setShowNicknameModal(false);
                  setToastMsg("닉네임이 변경됐어요!");
                }}
                  style={{ ...btnPrimary, flex: 1 }}>
                  변경하기
                </button>
                <button onClick={() => setShowNicknameModal(false)}
                  style={{ ...btnSecondary, flex: 1 }}>
                  취소
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 매칭 성사 모달 */}
      {/* 토스트 메시지 */}
      {toastMsg && (
        <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", background: "rgba(24,24,27,0.95)", border: "1px solid var(--border)", color: "#fff", fontSize: 13, padding: "12px 20px", borderRadius: 20, zIndex: 200, whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
          {toastMsg}
        </div>
      )}

        {matchModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ background: "var(--surface)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 360, textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
              <h3 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 8px" }}>매칭 성사!</h3>
              <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 24px", lineHeight: 1.6 }}>
                본격적인 채팅 전에<br />AI 사전미팅으로 먼저 알아가볼까요? 😊
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button onClick={() => { setMatchModal(null); router.push(`/pre-meet/${matchModal.matchId}`); }}
                  style={{ width: "100%", background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", border: "none", color: "#fff", fontWeight: 700, padding: 14, borderRadius: 14, fontSize: 15, cursor: "pointer" }}>
                  🤖 AI 사전미팅 하기
                </button>
                <button onClick={() => { setMatchModal(null); router.push(`/chat/${matchModal.matchId}`); }}
                  style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", fontWeight: 600, padding: 12, borderRadius: 14, fontSize: 14, cursor: "pointer" }}>
                  💬 바로 채팅하기
                </button>
                <button onClick={() => {
                  setMatchModal(null);
                  setToastMsg("💬 채팅 탭에서 AI 사전미팅 또는 채팅을 시작할 수 있어요!");
                  setTimeout(() => setToastMsg(""), 3000);
                }}
                  style={{ width: "100%", background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: 8 }}>
                  나중에
                </button>
              </div>
            </div>
          </div>
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
      </div>
      </div>
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
