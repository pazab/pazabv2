"use client";

/**
 * DaetaSosHome — 사장님 대타 SOS 홈 (DESIGN_PLAN.md P1)
 * 원버튼 요청 → 진행 중 요청 카드(에스컬레이션 단계 표시) → 직접 고르기(카드덱)는 보조 경로
 */
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/useToast";
import AppHeader from "@/components/AppHeader";
import DaetaRegisterModal from "@/components/daeta/DaetaRegisterModal";
import DaetaHistoryView from "@/components/daeta/DaetaHistoryView";

interface SosPosting {
  id: string;
  business_name: string;
  region: string;
  work_date: string;
  work_hours: string;
  wage: number;
  duty: string;
  escalation_stage: number;
  allow_new: boolean;
  status: string;
  created_at: string;
  stage_updated_at: string | null;
}

// 서버 기본 대기시간(lib/daetaEscalation.ts DEFAULT_CONFIG)과 동일 — 관리자 설정 변경 시 다소 어긋날 수 있는 근사치
const STAGE_WAIT_MIN: Record<number, number> = { 1: 10, 2: 30, 3: 30 };

interface PostingMatchMeta {
  total: number;
  acceptedMatchId: string | null;
  acceptedWorkerName: string | null;
}

const STAGE_STEPS = [
  { n: 1, label: "우리 팀", emoji: "👥" },
  { n: 2, label: "동네 검증", emoji: "✅" },
  { n: 3, label: "신규 포함", emoji: "🔵" },
  { n: 4, label: "공개 SOS", emoji: "📢" },
];

interface DaetaSosHomeProps {
  userId: string;
  userType: string;
  onOpenDeck: () => void;
}

export default function DaetaSosHome({ userId, userType, onOpenDeck }: DaetaSosHomeProps) {
  const router = useRouter();
  const { showToast, ToastUI } = useToast();

  const [loading, setLoading] = useState(true);
  const [postings, setPostings] = useState<SosPosting[]>([]);
  const [matchMeta, setMatchMeta] = useState<Record<string, PostingMatchMeta>>({});
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [editingPostingId, setEditingPostingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const load = useCallback(async () => {
    const { data: rows } = await supabase
      .from("daeta_postings")
      .select("id, business_name, region, work_date, work_hours, wage, duty, escalation_stage, allow_new, status, created_at, stage_updated_at")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    const list = (rows || []) as SosPosting[];
    setPostings(list);

    if (list.length > 0) {
      const ids = list.map(p => p.id);
      const { data: matches } = await supabase
        .from("matches")
        .select("id, daeta_posting_id, worker_id, progress_status")
        .in("daeta_posting_id", ids)
        .in("progress_status", ["pending", "accepted", "hired"]);

      const meta: Record<string, PostingMatchMeta> = {};
      ids.forEach(id => { meta[id] = { total: 0, acceptedMatchId: null, acceptedWorkerName: null }; });

      const acceptedWorkerIds: string[] = [];
      (matches || []).forEach((m: { id: string; daeta_posting_id: string; worker_id: string; progress_status: string }) => {
        const entry = meta[m.daeta_posting_id];
        if (!entry) return;
        entry.total += 1;
        if (m.progress_status === "accepted" || m.progress_status === "hired") {
          entry.acceptedMatchId = m.id;
          acceptedWorkerIds.push(m.worker_id);
          (entry as PostingMatchMeta & { _workerId?: string })._workerId = m.worker_id;
        }
      });

      if (acceptedWorkerIds.length > 0) {
        const { data: users } = await supabase
          .from("users").select("id, nickname").in("id", acceptedWorkerIds);
        const nameMap: Record<string, string> = {};
        (users || []).forEach((u: { id: string; nickname: string }) => { nameMap[u.id] = u.nickname; });
        Object.values(meta).forEach(entry => {
          const wid = (entry as PostingMatchMeta & { _workerId?: string })._workerId;
          if (wid) entry.acceptedWorkerName = nameMap[wid] || "알바생";
        });
      }
      setMatchMeta(meta);
    } else {
      setMatchMeta({});
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // 확산 카운트다운 표시용 — 1분마다 재계산
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  function nextExpansionInfo(p: SosPosting): { label: string; minutesLeft: number } | null {
    const stage = p.escalation_stage || 1;
    if (stage >= 4) return null;
    if (stage === 2 && !p.allow_new) return null; // opt-in 안 하면 2→4 직행(대기 안내 스킵)
    const waitMin = STAGE_WAIT_MIN[stage];
    if (!waitMin) return null;
    const stageStart = new Date(p.stage_updated_at || p.created_at).getTime();
    const elapsedMin = (now - stageStart) / 60000;
    const minutesLeft = Math.max(0, Math.ceil(waitMin - elapsedMin));
    const label = stage === 1 ? "동네 ✅검증 인력 공개" : stage === 2 ? "🔵신규 알바생 공개" : "전체 공개 SOS";
    return { label, minutesLeft };
  }

  const fireSos = async (postingId: string) => {
    try {
      const res = await fetch("/api/daeta/sos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postingId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "SOS 발동 실패");
      if (data.teamNotified > 0) {
        showToast(`⚡ 우리 팀 ${data.teamNotified}명에게 가장 먼저 알렸어요!`);
      } else {
        showToast(`⚡ 팀원이 없어 동네 ✅검증 인력 ${data.nearbyNotified}명에게 바로 공개했어요!`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "SOS 발동 중 오류";
      showToast(message, "error");
    }
    await load();
  };

  const cancelPosting = (posting: SosPosting) => {
    setPendingConfirm({
      title: "대타 요청 취소",
      message: "이 대타 요청을 취소할까요? 진행 중인 알림·응답도 함께 종료돼요.",
      onConfirm: async () => {
        setPendingConfirm(null);
        const { error } = await supabase
          .from("daeta_postings")
          .update({ status: "cancelled" })
          .eq("id", posting.id);
        if (error) {
          showToast("취소 실패: " + error.message, "error");
        } else {
          showToast("대타 요청이 취소됐어요", "info");
          await load();
        }
      },
    });
  };

  if (showHistory) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 500, overflowY: "auto" }}>
        <DaetaHistoryView
          userId={userId}
          userType={userType as "worker" | "employer" | "both"}
          onBack={() => setShowHistory(false)}
        />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg, #0a0a0f)", paddingBottom: 100 }}>
      <AppHeader title="대타 SOS" showBellAndMenu />

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px 0" }}>

        {/* ⚡ 원버튼 SOS */}
        <button
          onClick={() => setShowRegisterModal(true)}
          style={{
            width: "100%",
            padding: "22px 20px",
            background: "linear-gradient(135deg, #f97316, #ef4444)",
            border: "none",
            borderRadius: 22,
            cursor: "pointer",
            boxShadow: "0 8px 32px rgba(249,115,22,0.4)",
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 10,
          }}
        >
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>⚡</div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px" }}>대타 구하기</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>펑크 났나요? 한 번이면 팀 → 동네 검증 인력 순으로 자동 알림</div>
          </div>
        </button>

        <p style={{ fontSize: 11, color: "var(--text-muted, rgba(255,255,255,0.4))", margin: "0 0 20px", textAlign: "center" }}>
          수락 즉시 단기 근로계약서까지 자동 작성돼요
        </p>

        {/* 진행 중 요청 카드 */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted, rgba(255,255,255,0.4))", fontSize: 13 }}>불러오는 중...</div>
        ) : postings.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--text, #fff)", margin: "0 0 10px" }}>🔥 진행 중인 요청</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {postings.map(p => {
                const meta = matchMeta[p.id] || { total: 0, acceptedMatchId: null, acceptedWorkerName: null };
                const stage = p.escalation_stage || 1;
                const visibleSteps = STAGE_STEPS.filter(s => s.n !== 3 || p.allow_new);
                return (
                  <div key={p.id} style={{ background: "var(--surface, rgba(255,255,255,0.04))", border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 18, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: "var(--text, #fff)" }}>{p.business_name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted, rgba(255,255,255,0.55))", marginTop: 3 }}>
                          {p.work_date} · {p.work_hours} · {p.duty}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#fb923c", marginTop: 3 }}>
                          시급 {p.wage.toLocaleString()}원
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => { setEditingPostingId(p.id); setShowRegisterModal(true); }}
                          style={{ background: "var(--surface2, rgba(255,255,255,0.08))", border: "1px solid var(--border, rgba(255,255,255,0.1))", borderRadius: 10, padding: "6px 10px", color: "var(--text, #fff)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          수정
                        </button>
                        <button
                          onClick={() => cancelPosting(p)}
                          style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 10, padding: "6px 10px", color: "#f87171", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          취소
                        </button>
                      </div>
                    </div>

                    {/* 에스컬레이션 스테퍼 */}
                    {meta.acceptedMatchId ? (
                      <button
                        onClick={() => router.push(`/chat/${meta.acceptedMatchId}`)}
                        style={{ width: "100%", padding: "12px", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 14, color: "#4ade80", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                        🎉 {meta.acceptedWorkerName}님 매칭 완료! 채팅으로 이동 →
                      </button>
                    ) : (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
                          {visibleSteps.map((s, i) => {
                            const active = stage >= s.n;
                            const current = stage === s.n;
                            return (
                              <div key={s.n} style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
                                <div style={{
                                  flex: 1,
                                  textAlign: "center",
                                  padding: "6px 2px",
                                  borderRadius: 10,
                                  background: current ? "rgba(251,146,60,0.15)" : active ? "rgba(255,255,255,0.06)" : "transparent",
                                  border: current ? "1px solid rgba(251,146,60,0.45)" : "1px solid transparent",
                                }}>
                                  <div style={{ fontSize: 12 }}>{s.emoji}</div>
                                  <div style={{ fontSize: 9, fontWeight: current ? 800 : 500, color: current ? "#fb923c" : active ? "var(--text, #fff)" : "var(--text-muted, rgba(255,255,255,0.3))", marginTop: 1 }}>
                                    {s.label}
                                  </div>
                                </div>
                                {i < visibleSteps.length - 1 && (
                                  <div style={{ width: 8, height: 1.5, background: active ? "rgba(251,146,60,0.5)" : "rgba(255,255,255,0.12)", flexShrink: 0 }} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "var(--text-muted, rgba(255,255,255,0.45))" }}>
                            {stage === 1 && "우리 팀에게 알림을 보냈어요"}
                            {stage === 2 && "동네 ✅검증 인력에게 공개 중"}
                            {stage === 3 && "🔵신규 알바생까지 공개 중"}
                            {stage === 4 && "모두에게 공개된 상태예요"}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 800, color: meta.total > 0 ? "#4ade80" : "var(--text-muted, rgba(255,255,255,0.45))" }}>
                            응답 {meta.total}건
                          </span>
                        </div>
                        {(() => {
                          const info = nextExpansionInfo(p);
                          if (!info) return null;
                          return (
                            <div style={{ marginTop: 8, fontSize: 11, color: "#fbbf24", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 10, padding: "6px 10px" }}>
                              ⏳ {info.minutesLeft <= 0 ? "곧" : `약 ${info.minutesLeft}분 후`} {info.label}로 확대돼요 — 원치 않으면 지금 취소하세요
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 보조 경로 */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onOpenDeck}
            style={{ flex: 1, padding: "14px", background: "var(--surface, rgba(255,255,255,0.04))", border: "1px solid var(--border, rgba(255,255,255,0.1))", borderRadius: 16, color: "var(--text, #fff)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            👀 직접 고르기
          </button>
          <button
            onClick={() => setShowHistory(true)}
            style={{ flex: 1, padding: "14px", background: "var(--surface, rgba(255,255,255,0.04))", border: "1px solid var(--border, rgba(255,255,255,0.1))", borderRadius: 16, color: "var(--text, #fff)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            📋 대타 내역
          </button>
        </div>
      </div>

      {showRegisterModal && (
        <DaetaRegisterModal
          userId={userId}
          postingId={editingPostingId}
          onClose={() => { setShowRegisterModal(false); setEditingPostingId(null); }}
          onSuccess={async (postingId) => {
            const wasEditing = !!editingPostingId;
            setShowRegisterModal(false);
            setEditingPostingId(null);
            if (!wasEditing && postingId) {
              await fireSos(postingId);
            } else {
              await load();
            }
          }}
        />
      )}

      {pendingConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 10000, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "var(--surface)", borderRadius: "24px 24px 0 0", padding: 24, width: "100%", maxWidth: 480, margin: "0 auto", borderTop: "1px solid rgba(255,255,255,0.08)", color: "var(--text, #fff)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 8px" }}>{pendingConfirm.title}</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px", lineHeight: 1.6 }}>{pendingConfirm.message}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={pendingConfirm.onConfirm}
                style={{ flex: 2, padding: "14px", background: "linear-gradient(135deg, #ef4444, #dc2626)", border: "none", borderRadius: 14, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                확인
              </button>
              <button onClick={() => setPendingConfirm(null)}
                style={{ flex: 1, padding: "14px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 14, color: "var(--text-muted)", fontWeight: 700, cursor: "pointer" }}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {ToastUI}
    </div>
  );
}
