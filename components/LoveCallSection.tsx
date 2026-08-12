"use client";
import { useState } from "react";

export default function LoveCallSection({ title, calls, showRespond, respondingId, onRespond, onCancel, onNavigate, onDelete, router }: any) {
  const [expanded, setExpanded] = useState(false);

  const sorted = [...calls].sort((a, b) => {
    const statusPriority = (lc: any) => {
      const ps = lc.progress_status || lc.status;
      if (ps === "interviewing") return 1;
      if (ps === "accepted") return 2;
      if (ps === "pending") return 3;
      if (ps === "hired") return 4;
      return 5;
    };

    const as = statusPriority(a);
    const bs = statusPriority(b);
    if (as !== bs) return as - bs;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const visibleCalls = expanded ? sorted : sorted.slice(0, 1);
  const hasMore = sorted.length > 1;

  const getStatusInfo = (lc: any) => {
    const ps = lc.progress_status || lc.status;
    switch (ps) {
      case "interviewing": return { label: "📅 면접 진행중", color: "var(--warning)", bg: "var(--warning-bg)", border: "var(--warning-border)" };
      case "hired": return { label: "✅ 채용 확정", color: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)" };
      case "accepted": return { label: "🎉 매칭 성사", color: "var(--purple-text)", bg: "var(--chip-purple-bg)", border: "var(--chip-purple-border)" };
      case "pending": return { label: "⏳ 대기중", color: "var(--warning)", bg: "var(--warning-bg)", border: "var(--border)" };
      case "rejected": return { label: "거절됨", color: "var(--danger)", bg: "transparent", border: "var(--border)" };
      case "cancelled": return { label: "취소됨", color: "var(--text-muted)", bg: "transparent", border: "var(--border)" };
      case "failed": return { label: "매칭 실패", color: "var(--text-muted)", bg: "transparent", border: "var(--border)" };
      default: return { label: ps, color: "var(--text-muted)", bg: "transparent", border: "var(--border)" };
    }
  };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: 20, marginBottom: 12 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          {title}
          {calls.filter((lc: any) => (lc.progress_status || lc.status) === "pending").length > 0 && (
            <span style={{ marginLeft: 8, background: "var(--primary)", color: "#fff", fontSize: 10, padding: "2px 7px", borderRadius: 20 }}>
              {calls.filter((lc: any) => (lc.progress_status || lc.status) === "pending").length}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
          총 {sorted.length}건
        </span>
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visibleCalls.map((lc: any) => {
          const cp = lc.counterpart;
          const statusInfo = getStatusInfo(lc);
          const isWorkerRole = lc.myRole === "worker";
          const name = isWorkerRole ? cp?.business_name || "매장" : cp?.name || "알바생";
          const isActive = ["interviewing", "hired", "accepted"].includes(lc.progress_status || lc.status);
          return (
            <div key={lc.id} style={{ background: isActive ? statusInfo.bg : "var(--surface2)", borderRadius: 14, padding: 12, border: `1px solid ${statusInfo.border}`, transition: "all 0.2s", position: "relative" }}>
              {/* cancelled/failed/rejected 상태 쓰레기통 */}
              {["cancelled", "failed", "rejected"].includes(lc.progress_status || lc.status) && (
                <button onClick={() => onDelete(lc.id)}
                  style={{ width: "100%", background: "var(--danger-bg)", border: "1px solid var(--danger-border)", color: "var(--danger)", fontSize: 12, padding: "7px", borderRadius: 10, cursor: "pointer", marginTop: 4 }}>
                  🗑️ 기록 삭제
                </button>
              )}

              {/* 상단: 이름 + 상태 (클릭하면 상세로) */}
              <button onClick={() => onNavigate(lc)}
                style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 2px", color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{isWorkerRole ? "🏪" : "⚡"} {name}</span>
                    {lc.daeta_posting_id && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", background: "#f59e0b1a", padding: "2px 6px", borderRadius: 20, whiteSpace: "nowrap" }}>
                        🚨 대타에서 시작
                      </span>
                    )}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                    {new Date(lc.created_at).toLocaleDateString("ko-KR")} · 탭하면 상세 보기
                  </p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: statusInfo.color, background: `${statusInfo.color}20`, padding: "3px 8px", borderRadius: 20, flexShrink: 0, whiteSpace: "nowrap" }}>
                  {statusInfo.label}
                </span>
              </button>

              {/* 공고 정보 */}
              {isWorkerRole && cp && (
                <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "8px 10px", marginBottom: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {cp.business_type && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>🏷️ {cp.business_type}</span>}
                  {cp.region && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>📍 {cp.region}</span>}
                  {cp.wage && <span style={{ fontSize: 11, color: "var(--purple-text)" }}>💰 {cp.wage.toLocaleString()}원</span>}
                  {cp.work_days && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>📅 {cp.work_days}</span>}
                </div>
              )}
              {!isWorkerRole && cp && (
                <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "8px 10px", marginBottom: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {cp.desired_type && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>🏷️ {cp.desired_type}</span>}
                  {cp.desired_region && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>📍 {cp.desired_region}</span>}
                  {cp.desired_wage && <span style={{ fontSize: 11, color: "var(--pink-text)" }}>💰 {cp.desired_wage.toLocaleString()}원↑</span>}
                </div>
              )}

              {/* 면접 일정 표시 */}
              {lc.interview_at && (
                <div style={{ background: "var(--warning-bg)", borderRadius: 8, padding: "6px 10px", marginBottom: 8, fontSize: 12, color: "var(--warning)" }}>
                  📅 면접: {new Date(lc.interview_at).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {lc.interview_memo && ` · ${lc.interview_memo}`}
                </div>
              )}

              {lc.message && (
                <p style={{ fontSize: 12, color: "var(--text-sub)", background: "var(--surface2)", borderRadius: 8, padding: "6px 10px", margin: "0 0 8px" }}>
                  💬 {lc.message}
                </p>
              )}

              {/* 수락/거절 버튼 */}
              {showRespond && (lc.progress_status || lc.status) === "pending" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => onRespond(lc.id, "reject")} disabled={respondingId === lc.id}
                    style={{ flex: 1, background: "var(--danger-bg)", border: "1px solid var(--danger-border)", color: "var(--danger)", fontWeight: 700, padding: "10px", borderRadius: 12, cursor: "pointer", fontSize: 13 }}>
                    거절하기
                  </button>
                  <button onClick={() => onRespond(lc.id, "accept")} disabled={respondingId === lc.id}
                    style={{ flex: 2, background: "var(--primary)", border: "none", color: "#fff", fontWeight: 800, padding: "10px", borderRadius: 12, cursor: "pointer", fontSize: 13 }}>
                    {respondingId === lc.id ? "처리 중..." : "수락하기"}
                  </button>
                </div>
              )}

              {/* 진행 단계 버튼 */}
              {(() => {
                const ps = lc.progress_status || lc.status;
                if (ps === "accepted") return (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => router.push(`/chat/${lc.id}`)}
                      style={{ flex: 1, background: "var(--primary)", border: "none", color: "#fff", fontWeight: 700, padding: "8px", borderRadius: 10, cursor: "pointer", fontSize: 12 }}>
                      💬 채팅하기
                    </button>
                  </div>
                );
                if (ps === "interviewing") return (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => router.push(`/chat/${lc.id}`)}
                      style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)", fontWeight: 600, padding: "8px", borderRadius: 10, cursor: "pointer", fontSize: 12 }}>
                      💬 채팅
                    </button>
                  </div>
                );
                if (ps === "hired") return (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => router.push(`/chat/${lc.id}`)}
                      style={{ flex: 1, background: "var(--success-bg)", border: "1px solid var(--success-border)", color: "var(--success)", fontWeight: 600, padding: "8px", borderRadius: 10, cursor: "pointer", fontSize: 12 }}>
                      💬 채팅하기
                    </button>
                    <button onClick={() => onDelete(lc.id)}
                      style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)", color: "var(--danger)", fontSize: 12, fontWeight: 600, padding: "8px 14px", borderRadius: 10, cursor: "pointer" }}>
                      🗑️
                    </button>
                  </div>
                );
                return null;
              })()}

              {/* 보낸것 취소 버튼 - 취소/실패/거절 상태 제외. 대타 기원 매칭은 수락 즉시 자동계약이 체결돼서
                  여기서 그냥 취소하면 페널티(정지·감점) 없이 파기돼버림 — 채팅의 페널티 확인 절차로 유도 */}
              {!showRespond && !["cancelled", "failed", "rejected", "hired"].includes(lc.progress_status || lc.status) && (
                lc.daeta_posting_id ? (
                  <button onClick={() => router.push(`/chat/${lc.id}`)}
                    style={{ width: "100%", background: "none", border: "1px solid var(--danger-border)", color: "var(--danger)", fontSize: 12, padding: "7px", borderRadius: 10, cursor: "pointer" }}>
                    채팅에서 대타 취소하기 (페널티 안내)
                  </button>
                ) : (
                  <button onClick={() => onCancel(lc.id)}
                    style={{ width: "100%", background: "none", border: "1px solid var(--danger-border)", color: "var(--danger)", fontSize: 12, padding: "7px", borderRadius: 10, cursor: "pointer" }}>
                    {lc.myRole === "worker" ? "지원 취소하기" : "채용제안 취소하기"}
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "10px",
            borderRadius: 12,
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            color: "var(--primary, #8b5cf6)",
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6
          }}
        >
          <span>{expanded ? "접기" : `펼치기 (전체 ${sorted.length}개 보기)`}</span>
          <i className={`ti ${expanded ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 14 }} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
