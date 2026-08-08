"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { formatDaetaDateRange } from "@/lib/utils";

interface DaetaHistoryViewProps {
  userId: string;
  userType: "worker" | "employer" | "both";
  onBack?: () => void;
  focusMatchId?: string;
  /** true면 마이페이지 섹션 등 다른 화면에 끼워넣는 용도 — 전체화면 헤더/최소높이를 생략 */
  embedded?: boolean;
}

export default function DaetaHistoryView({ userId, userType, onBack, focusMatchId, embedded }: DaetaHistoryViewProps) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<any[]>([]);
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);
  const [showUnpaidModal, setShowUnpaidModal] = useState<any>(null); // 임금 미지급 신고 팝업
  const [showAllRecords, setShowAllRecords] = useState(!focusMatchId);
  const [pendingAction, setPendingAction] = useState<{ type: "complete" | "noshow" | "cancel"; match: any } | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelPreview, setCancelPreview] = useState<{ suspendDays: number; trustPenalty: number } | null>(null);
  const [completeRating, setCompleteRating] = useState(0);

  const isEmployer = userType === "employer" || userType === "both";

  useEffect(() => {
    loadDaetaRecords();
  }, [userId, userType]);

  const loadDaetaRecords = async () => {
    setLoading(true);
    try {
      // 1. Fetch matches — userType이 명확하면(both가 아니면) 그 역할로 참여한 것만, 아니면 양쪽 다
      let matchQuery = supabase.from("matches").select("*").order("created_at", { ascending: false });
      if (userType === "employer") matchQuery = matchQuery.eq("employer_id", userId);
      else if (userType === "worker") matchQuery = matchQuery.eq("worker_id", userId);
      else matchQuery = matchQuery.or(`employer_id.eq.${userId},worker_id.eq.${userId}`);
      const { data: matches, error: matchesErr } = await matchQuery;

      if (matchesErr) throw matchesErr;

      const rawMatches = matches || [];
      const daetaMatches = rawMatches.filter((m: any) => m.daeta_posting_id !== null);

      if (daetaMatches.length === 0) {
        setRecords([]);
        return;
      }

      // 2. Fetch unique daeta_postings and users in parallel
      const postingIds = Array.from(new Set(daetaMatches.map((m: any) => m.daeta_posting_id)));
      const workerIds = Array.from(new Set(daetaMatches.map((m: any) => m.worker_id)));

      const [postingsRes, usersRes] = await Promise.all([
        supabase
          .from("daeta_postings")
          .select("id, business_name, business_type, region, wage, work_hours, work_date, work_date_end")
          .in("id", postingIds),
        supabase
          .from("users")
          .select("id, nickname, real_name, phone, trust_score")
          .in("id", workerIds)
      ]);

      if (postingsRes.error) throw postingsRes.error;
      if (usersRes.error) throw usersRes.error;

      const postings = postingsRes.data || [];
      const users = usersRes.data || [];

      // 3. Enrich matches with postings and users
      const joinedMatches = daetaMatches.map((m: any) => {
        const posting = postings.find((p: any) => p.id === m.daeta_posting_id);
        const user = users.find((u: any) => u.id === m.worker_id);
        return {
          ...m,
          daeta_postings: posting || null,
          users: user || null
        };
      }).filter((m: any) => m.daeta_postings !== null);

      // 각 매칭에 대한 임금명세서(payslip) 존재 여부 병합
      const matchIds = joinedMatches.map((m: any) => m.id);
      let payslips: any[] = [];
      if (matchIds.length > 0) {
        const { data } = await supabase
          .from("payslips")
          .select("*")
          .in("match_id", matchIds);
        payslips = data || [];
      }

      const enriched = joinedMatches.map((m: any) => {
        const ps = payslips.find((p: any) => p.match_id === m.id);
        return {
          ...m,
          payslip: ps || null,
        };
      });

      // 지원자가 단 한 명도 없어 matches 행 자체가 없는 채로 만료된 내 공고 — 그동안 여기 목록에서 완전히 안 보였음
      let unmatchedRecords: any[] = [];
      if (isEmployer) {
        const matchedPostingIds = new Set(daetaMatches.map((m: any) => m.daeta_posting_id));
        const { data: myExpired } = await supabase
          .from("daeta_postings")
          .select("id, business_name, business_type, region, wage, work_hours, work_date, work_date_end, status, user_id, created_at")
          .eq("user_id", userId)
          .eq("status", "expired");
        unmatchedRecords = (myExpired || [])
          .filter((p: any) => !matchedPostingIds.has(p.id))
          .map((p: any) => ({
            id: `posting-${p.id}`,
            employer_id: p.user_id,
            worker_id: null,
            daeta_posting_id: p.id,
            progress_status: "expired_no_match",
            daeta_postings: p,
            users: null,
            payslip: null,
            created_at: p.created_at,
            _unmatched: true,
          }));
      }

      setRecords([...enriched, ...unmatchedRecords].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    } catch (err: any) {
      console.error("대타 기록 로딩 에러:", err?.message || err?.code || err);
    } finally {
      setLoading(false);
    }
  };

  // 완료(정산)·노쇼·취소는 모두 app/api/daeta 라우트로 통일 — 서버에서 권한 검증 + 알림 발송까지 처리.
  // (예전엔 여기서 클라이언트가 직접 matches.status 컬럼을 update했는데, 그 컬럼이 애초에 존재하지 않아
  // 매번 조용히 실패하고 있었음 — progress_status만 갱신되는 서버 라우트로 교체해 실제로 동작하게 함)
  const openConfirm = async (type: "complete" | "noshow" | "cancel", match: any) => {
    setActionError("");
    if (type === "complete") setCompleteRating(0);
    if (type === "cancel") {
      const lookbackStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase.from("trust_score_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("reason", "대타 확정 취소").gte("created_at", lookbackStart);
      const tiers = [{ suspendDays: 0, trustPenalty: 0 }, { suspendDays: 3, trustPenalty: 10 }, { suspendDays: 7, trustPenalty: 15 }, { suspendDays: 14, trustPenalty: 20 }];
      setCancelPreview(tiers[Math.min(count ?? 0, tiers.length - 1)]);
    }
    setPendingAction({ type, match });
  };

  const runConfirmedAction = async () => {
    if (!pendingAction) return;
    setActionLoading(true);
    setActionError("");
    try {
      const endpoint = pendingAction.type === "cancel" ? "/api/daeta/cancel" : "/api/daeta/complete";
      const body = pendingAction.type === "cancel"
        ? { matchId: pendingAction.match.id }
        : pendingAction.type === "complete"
        ? { matchId: pendingAction.match.id, action: "complete", ...(completeRating > 0 ? { rating: completeRating } : {}) }
        : { matchId: pendingAction.match.id, action: pendingAction.type };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) { setActionError(result.error || "처리 중 오류가 발생했어요."); setActionLoading(false); return; }

      setPendingAction(null);
      await loadDaetaRecords();
    } catch (err: any) {
      console.error(err);
      setActionError("처리 중 오류가 발생했어요.");
    } finally {
      setActionLoading(false);
    }
  };

  // 3. 알바생: 임금 미지급 신고서 PDF 빌드
  const handleUnpaidReport = (match: any) => {
    setActionError("");
    setShowUnpaidModal(match);
  };

  // 예전엔 검증 없이 즉시 사장님 계정을 영구정지시키고, 실제로 접수도 안 한 "정부 진정서"를
  // 접수했다고 알리는 코드였음 — 앱이 직접 처벌하지 않고, 이력 기록 + 양쪽 알림만 하고
  // 실제 정지 여부는 관리자가 사람이 검토해서 판단하도록 변경.
  const reportUnpaidWage = async (match: any) => {
    setActionLoading(true);
    setActionError("");
    try {
      const res = await fetch("/api/daeta/report-unpaid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: match.id }),
      });
      const result = await res.json();
      if (!res.ok) { setActionError(result.error || "신고 접수 중 오류가 발생했어요."); setActionLoading(false); return; }
      setShowUnpaidModal(null);
      await loadDaetaRecords();
    } catch (err: any) {
      console.error(err);
      setActionError("신고 접수 중 오류가 발생했어요.");
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusText = (match: any) => {
    if (match.progress_status === "hired") return "✅ 정산 완료";
    if (["cancelled", "failed"].includes(match.progress_status)) return "❌ 취소/노쇼";
    if (match.progress_status === "accepted") return "🤝 근무 예정 / 정산 대기";
    if (match.progress_status === "expired_no_match") return "😢 못 구함 (지원자 없음)";
    return match.progress_status;
  };

  return (
    <div style={embedded
      ? { color: "#fff" }
      : { padding: "16px", color: "#fff", background: "var(--bg)", minHeight: "100vh", maxWidth: 480, margin: "0 auto" }}>

      {!embedded && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          {onBack && (
            <button onClick={onBack} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}>← 뒤로</button>
          )}
          <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>📋 내 대타 매칭 및 정산 관리</h2>
        </div>
      )}

      {focusMatchId && !showAllRecords && (
        <button onClick={() => setShowAllRecords(true)}
          style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", color: "#94a3b8", fontSize: 12, padding: "6px 12px", borderRadius: 10, cursor: "pointer", marginBottom: 12 }}>
          전체 대타 기록 보기
        </button>
      )}

      {loading ? (
        <p style={{ textAlign: "center", color: "#94a3b8", marginTop: 40 }}>기록을 불러오는 중...</p>
      ) : records.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "60px 0" }}>
          <p style={{ fontSize: 32, marginBottom: 10 }}>💤</p>
          <p style={{ fontSize: 14 }}>아직 완료되거나 매칭된 대타 기록이 없습니다.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {records
            .filter((rec: any) => showAllRecords || !focusMatchId || rec.id === focusMatchId)
            .map((rec: any) => {
            const ep = rec.daeta_postings;
            const targetUser = rec.users; // 알바생 정보
            const isEmployerForRecord = rec.employer_id === userId;
            const isCompleted = rec.progress_status === "hired";
            const isCancelled = ["cancelled", "failed"].includes(rec.progress_status);
            const isPending = rec.progress_status === "accepted";

            // 일시 포맷
            const dateStr = ep?.work_date ? formatDaetaDateRange(ep.work_date, ep.work_date_end) : rec.created_at?.split("T")[0];

            return (
              <div key={rec.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
                
                {/* 상단 상호명 & 상태 배지 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: 10, color: "#a78bfa", background: "rgba(167,139,250,0.15)", padding: "2px 8px", borderRadius: 20, fontWeight: 700, marginRight: 6 }}>대타 긴급</span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{dateStr}</span>
                    <h3 style={{ fontSize: 16, fontWeight: 900, margin: "6px 0 2px" }}>
                      {rec._unmatched ? `⚡ ${ep?.business_name} — 지원자 없음` : isEmployerForRecord ? `⚡ 알바생: ${targetUser?.nickname || "익명"}` : `🏪 매장: ${ep?.business_name}`}
                    </h3>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isCompleted ? "#4ade80" : isCancelled ? "#f87171" : "#fbbf24" }}>
                    {getStatusText(rec)}
                  </span>
                </div>

                {/* 상세 근무 조건 */}
                <div style={{ background: "rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px", fontSize: 12, display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
                  <div>⏰ 시간: {ep?.work_hours}</div>
                  <div>💼 담당업무: {ep?.business_type || "매장 서빙 및 관리"}</div>
                  <div>💰 약속시급: <strong style={{ color: "#c4b5fd" }}>{ep?.wage?.toLocaleString()}원</strong></div>
                  {isCompleted && rec.employer_rating != null && (
                    <div>⭐ 사장님 평가: <strong style={{ color: "#fbbf24" }}>{rec.employer_rating}/5</strong></div>
                  )}
                </div>

                {/* 서명 근로계약서 확인 링크 — 매칭 자체가 없던 건(_unmatched)은 계약서도 없어 생략 */}
                {!rec._unmatched && (
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <a href={`/api/contract?matchId=${rec.id}`} target="_blank" rel="noopener noreferrer"
                    style={{ flex: 1, textDecoration: "none", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px", textAlign: "center", fontSize: 12, color: "#fff", fontWeight: 700, display: "block" }}>
                    📄 체결된 표준근로계약서 확인
                  </a>
                  {rec.payslip && (
                    <button onClick={() => setSelectedPayslip(rec.payslip)}
                      style={{ flex: 1, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 12, padding: "10px", color: "#c4b5fd", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      📊 임금 명세서 확인
                    </button>
                  )}
                </div>
                )}

                {/* 사장님 액션 버튼 (정산 / 노쇼 신고) */}
                {isEmployerForRecord && isPending && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <button onClick={() => openConfirm("complete", rec)}
                      style={{ flex: 2, background: "linear-gradient(135deg, #22c55e, #16a34a)", border: "none", borderRadius: 12, padding: "12px", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                      💸 급여 이체 완료 (정산 확정)
                    </button>
                    <button onClick={() => openConfirm("noshow", rec)}
                      style={{ flex: 1, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "12px", color: "#f87171", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      🚨 노쇼 신고
                    </button>
                  </div>
                )}

                {/* 알바생 액션 버튼 (임금 미지급 신고) */}
                {!isEmployerForRecord && isPending && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={() => handleUnpaidReport(rec)}
                      style={{ flex: 1, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "12px", color: "#f87171", fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
                      ⚠️ 임금 미지급 (먹튀) 신고 및 법적 대응
                    </button>
                  </div>
                )}

                {/* 취소는 사장님·알바생 양쪽 다 — 확정 취소 페널티(정지+감점) 적용 */}
                {isPending && (
                  <button onClick={() => openConfirm("cancel", rec)}
                    style={{ width: "100%", marginTop: 8, background: "none", border: "1px solid rgba(255,255,255,0.15)", color: "#94a3b8", fontSize: 12, padding: "9px", borderRadius: 12, cursor: "pointer" }}>
                    🚫 이 대타 취소하기
                  </button>
                )}

              </div>
            );
          })}
        </div>
      )}

      {/* 완료(정산)/노쇼/취소 확인 모달 — 페널티·정산 내역을 미리 보여주고 명시적 동의를 받음 */}
      {pendingAction && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "24px", width: "100%", maxWidth: 360, color: "#fff" }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>
                {pendingAction.type === "complete" ? "💸" : pendingAction.type === "noshow" ? "🚨" : "🚫"}
              </div>
              <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>
                {pendingAction.type === "complete" ? "급여 지급을 완료하셨나요?"
                  : pendingAction.type === "noshow" ? "무단 노쇼로 신고할까요?"
                  : "확정된 대타를 취소할까요?"}
              </p>
              {pendingAction.type === "complete" && (
                <>
                  <p style={{ fontSize: 13, color: "#94a3b8", margin: 0, lineHeight: 1.7, background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "10px 14px" }}>
                    확인 시 임금명세서가 자동 발행되고 알바생에게 알림이 가요.
                  </p>
                  <div style={{ marginTop: 12 }}>
                    <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>이번 대타는 어땠나요? (선택 · 신뢰점수에 반영돼요)</p>
                    <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button key={n} onClick={() => setCompleteRating(n)}
                          style={{ background: "none", border: "none", fontSize: 26, cursor: "pointer", padding: 2, lineHeight: 1, filter: n <= completeRating ? "none" : "grayscale(1) opacity(0.35)" }}>
                          ⭐
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {pendingAction.type === "noshow" && (
                <p style={{ fontSize: 13, color: "#f87171", margin: 0, lineHeight: 1.7, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "10px 14px" }}>
                  신고 시 알바생 신뢰점수가 <strong>-30점</strong> 감점되고 매칭이 종료돼요.<br />허위 신고 시 불이익이 있을 수 있어요.
                </p>
              )}
              {pendingAction.type === "cancel" && cancelPreview && (
                cancelPreview.suspendDays > 0 || cancelPreview.trustPenalty > 0 ? (
                  <p style={{ fontSize: 13, color: "#f87171", margin: 0, lineHeight: 1.7, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "10px 14px" }}>
                    지금 취소하면 <strong>대타 {isEmployer ? "등록" : "지원"} {cancelPreview.suspendDays}일 정지</strong> + <strong>신뢰점수 -{cancelPreview.trustPenalty}점</strong>이 적용돼요.
                  </p>
                ) : (
                  <p style={{ fontSize: 13, color: "#94a3b8", margin: 0, lineHeight: 1.7, background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "10px 14px" }}>
                    최근 90일 내 첫 취소라 페널티 없이 처리돼요. 다음 취소부터는 정지+감점이 적용됩니다.
                  </p>
                )
              )}
              {actionError && <p style={{ fontSize: 12, color: "#f87171", marginTop: 8 }}>{actionError}</p>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setPendingAction(null); setActionError(""); }}
                style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, padding: 12, fontSize: 14, color: "#94a3b8", cursor: "pointer" }}>
                아니오
              </button>
              <button onClick={runConfirmedAction} disabled={actionLoading}
                style={{ flex: 1, background: pendingAction.type === "complete" ? "linear-gradient(135deg, #22c55e, #16a34a)" : "#ef4444", border: "none", borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 700, color: "#fff", cursor: actionLoading ? "default" : "pointer", opacity: actionLoading ? 0.7 : 1 }}>
                {actionLoading ? "처리 중..." : pendingAction.type === "complete" ? "완료 및 정산" : pendingAction.type === "noshow" ? "노쇼 신고" : "동의하고 취소"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 모달 1: 임금 명세서 모달 */}
      {selectedPayslip && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "24px", width: "100%", maxWidth: 360, color: "#fff" }}>
            <h3 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 16px", textAlign: "center", color: "#c4b5fd" }}>📊 대타 임금 명세서</h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13, borderBottom: "1px dashed rgba(255,255,255,0.1)", paddingBottom: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(255,255,255,0.5)" }}>발행일</span><span>{selectedPayslip.issued_at?.split("T")[0]}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(255,255,255,0.5)" }}>근무내역</span><span>단기 대타 (1일)</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(255,255,255,0.5)" }}>근무시간</span><span>{selectedPayslip.total_hours}시간</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(255,255,255,0.5)" }}>약정시급</span><span>{selectedPayslip.wage?.toLocaleString()}원</span></div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>실지급액 (세전)</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: "#4ade80" }}>{selectedPayslip.total_pay?.toLocaleString()}원</span>
            </div>

            <button onClick={() => setSelectedPayslip(null)}
              style={{ width: "100%", background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", border: "none", borderRadius: 12, padding: "12px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              확인 완료
            </button>
          </div>
        </div>
      )}

      {/* 모달 2: 임금 미지급 신고 모달 */}
      {showUnpaidModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "#1c1c1e", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 20, padding: "24px", width: "100%", maxWidth: 360, color: "#fff" }}>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 10 }}>⚖️</div>
            <h3 style={{ fontSize: 17, fontWeight: 900, margin: "0 0 10px", textAlign: "center", color: "#f87171" }}>임금 미지급 신고</h3>

            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, marginBottom: 12, textAlign: "center" }}>
              [신고 접수]를 누르면 사장님에게 알림이 가고, 파잡 관리자가 이 건을 검토합니다. 계정이 즉시 정지되진 않으며, 검토 후 조치돼요.
            </p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, marginBottom: 20, textAlign: "center" }}>
              법적 대응이 필요하시면 고용노동부 민원마당 또는 가까운 지방고용노동청에 직접 임금체불 진정서를 접수하실 수 있어요. 체결된 표준근로계약서는 위 "계약서 확인" 버튼에서 내려받을 수 있습니다.
            </p>
            {actionError && <p style={{ fontSize: 12, color: "#f87171", marginBottom: 12, textAlign: "center" }}>{actionError}</p>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowUnpaidModal(null)}
                style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                취소
              </button>
              <button onClick={() => reportUnpaidWage(showUnpaidModal)} disabled={actionLoading}
                style={{ flex: 1, background: "#ef4444", border: "none", borderRadius: 12, padding: "12px", color: "#fff", fontSize: 12, fontWeight: 800, cursor: actionLoading ? "default" : "pointer", opacity: actionLoading ? 0.7 : 1 }}>
                {actionLoading ? "처리 중..." : "신고 접수"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
