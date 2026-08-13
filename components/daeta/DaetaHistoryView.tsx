"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatDaetaDateRange, parseWorkHoursRange, daetaDayCount, calcDaetaCancelTrustPenalty } from "@/lib/utils";

interface DaetaHistoryViewProps {
  userId: string;
  userType: "worker" | "employer" | "both";
  onBack?: () => void;
  focusMatchId?: string;
  /** true면 마이페이지 섹션 등 다른 화면에 끼워넣는 용도 — 전체화면 헤더/최소높이를 생략 */
  embedded?: boolean;
}

export default function DaetaHistoryView({ userId, userType, onBack, focusMatchId, embedded }: DaetaHistoryViewProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<any[]>([]);
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);
  const [showUnpaidModal, setShowUnpaidModal] = useState<any>(null); // 임금 미지급 신고 팝업
  const [showAllRecords, setShowAllRecords] = useState(!focusMatchId);
  const [pendingAction, setPendingAction] = useState<{ type: "complete" | "noshow" | "cancel"; match: any } | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelPreview, setCancelPreview] = useState<{ trustPenalty: number; hoursUntilShift: number } | null>(null);
  const [completeRating, setCompleteRating] = useState(0);
  // 정산 확인 화면에서 사장님이 직접 확인/수정하는 근무시간 — 출퇴근 기록이 있으면 실제 시간을,
  // 없으면 예정 시간을 기본값으로 채워둠 (반자동: 자동계산 → 확인/수정 → 확정)
  const [completeHours, setCompleteHours] = useState("");
  // 취소 확인 화면에서 "상대방과 미리 합의된 취소예요" 체크박스 — 켜면 페널티 없이 처리됨
  const [cancelMutual, setCancelMutual] = useState(false);
  // "지난 기록"은 계속 쌓이는 정보라 최근 1건만 접어서 보여주고, 필요할 때만 펼쳐서 전체를 봄
  // (LoveCallSection.tsx와 동일한 접기 컨벤션). 펼쳤을 때도 너무 많으면 페이지 자체가
  // 한없이 길어지지 않도록 그 영역만 스크롤되게 함.
  const [pastExpanded, setPastExpanded] = useState(false);
  const PAST_COLLAPSED_COUNT = 1;
  const PAST_SCROLL_THRESHOLD = 5;

  const isEmployer = userType === "employer" || userType === "both";

  useEffect(() => {
    loadDaetaRecords();
  }, [userId, userType]);

  const loadDaetaRecords = async () => {
    setLoading(true);
    try {
      // 1. Fetch matches — userType이 명확하면(both가 아니면) 그 역할로 참여한 것만, 아니면 양쪽 다
      // 계속 쌓이기만 하는 이력 화면이라 상한선 없이 다 긁어오면 언젠간 느려짐 — 최근 200건으로 방어
      let matchQuery = supabase.from("matches").select("*").order("created_at", { ascending: false }).limit(200);
      if (userType === "employer") matchQuery = matchQuery.eq("employer_id", userId);
      else if (userType === "worker") matchQuery = matchQuery.eq("worker_id", userId);
      else matchQuery = matchQuery.or(`employer_id.eq.${userId},worker_id.eq.${userId}`);
      const { data: matches, error: matchesErr } = await matchQuery;

      if (matchesErr) throw matchesErr;

      const rawMatches = matches || [];
      // "이력"은 지난 기록(확정/완료/노쇼/취소)만 — 아직 결정 안 난 지원(pending)은 여기 섞이면
      // "완료·매칭 기록 없음"처럼 이상한 상태로 보임. pending 지원자는 이제 /daeta 홈의
      // "지원자 보기"(수락 대기 목록)가 전담하므로 이력에서는 제외한다.
      const daetaMatches = rawMatches.filter((m: any) => m.daeta_posting_id !== null && m.progress_status !== "pending");

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
          .select("id, business_name, business_type, region, wage, work_hours, work_date, work_date_end, lat, lng, employer_profile_id")
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
  // 출퇴근 기록이 있으면 실제 근무시간을, 없으면(체크인/아웃 누락 or 여러날짜 공고) 예정 시간×일수를
  // 기본값으로 — /api/daeta/complete의 서버 계산과 동일 기준. 사장님이 확인 화면에서 직접 고칠 수 있음.
  const computeSuggestedHours = (match: any): number => {
    const posting = match.daeta_postings;
    const scheduled = parseWorkHoursRange(posting?.work_hours) ?? 6;
    const days = posting ? daetaDayCount(posting.work_date, posting.work_date_end) : 1;
    if (days === 1 && match.checked_in_at && match.checked_out_at) {
      const actualMs = new Date(match.checked_out_at).getTime() - new Date(match.checked_in_at).getTime();
      return Math.max(0, Math.round((actualMs / 3600000) * 10) / 10);
    }
    return Math.round(scheduled * days * 10) / 10;
  };

  const openConfirm = async (type: "complete" | "noshow" | "cancel", match: any) => {
    setActionError("");
    if (type === "complete") {
      setCompleteRating(0);
      setCompleteHours(String(computeSuggestedHours(match)));
    }
    if (type === "cancel") {
      setCancelMutual(false);
      // 서버(app/api/daeta/cancel)와 동일 기준 — 근무 시작까지 남은 시간에 따라 신뢰점수만 차등 감점, 정지는 없음
      const posting = match.daeta_postings;
      let hoursUntilShift = 0;
      const startMatch = posting?.work_hours?.match(/\b(\d{1,2}):(\d{2})\b/);
      if (posting?.work_date && startMatch) {
        const shiftStart = new Date(`${posting.work_date}T${startMatch[1].padStart(2, "0")}:${startMatch[2]}:00+09:00`);
        hoursUntilShift = (shiftStart.getTime() - Date.now()) / 3600000;
      }
      setCancelPreview({ trustPenalty: calcDaetaCancelTrustPenalty(hoursUntilShift), hoursUntilShift });
    }
    setPendingAction({ type, match });
  };

  const runConfirmedAction = async () => {
    if (!pendingAction) return;
    setActionLoading(true);
    setActionError("");
    try {
      const endpoint = pendingAction.type === "cancel" ? "/api/daeta/cancel" : "/api/daeta/complete";
      const parsedHours = parseFloat(completeHours);
      const body = pendingAction.type === "cancel"
        ? { matchId: pendingAction.match.id, mutual: cancelMutual }
        : pendingAction.type === "complete"
        ? {
            matchId: pendingAction.match.id, action: "complete",
            ...(completeRating > 0 ? { rating: completeRating } : {}),
            ...(!isNaN(parsedHours) && parsedHours > 0 ? { hours: parsedHours } : {}),
          }
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

  // 알바생 원탭 출근 체크인 — 미출근 15분 경과 시 자동 노쇼 판정(app/api/cron/daeta-checkin)의 기준이 됨
  const handleDaetaCheckin = async (match: any) => {
    setActionError("");
    setActionLoading(true);
    try {
      const res = await fetch("/api/daeta/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: match.id }),
      });
      const result = await res.json();
      if (!res.ok) { setActionError(result.error || "출근 처리 중 오류가 발생했어요."); setActionLoading(false); return; }
      await loadDaetaRecords();
    } catch (err: any) {
      console.error(err);
      setActionError("출근 처리 중 오류가 발생했어요.");
    } finally {
      setActionLoading(false);
    }
  };

  // 알바생 원탭 퇴근 체크아웃 — checked_in_at과 짝을 이뤄 실제 근무시간 정산의 기준이 됨
  const handleDaetaCheckout = async (match: any) => {
    setActionError("");
    setActionLoading(true);
    try {
      const res = await fetch("/api/daeta/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: match.id }),
      });
      const result = await res.json();
      if (!res.ok) { setActionError(result.error || "퇴근 처리 중 오류가 발생했어요."); setActionLoading(false); return; }
      await loadDaetaRecords();
    } catch (err: any) {
      console.error(err);
      setActionError("퇴근 처리 중 오류가 발생했어요.");
    } finally {
      setActionLoading(false);
    }
  };

  // 사장님이 자동 노쇼 판정을 10분 미루기 — 알림의 원탭 버튼과 동일 엔드포인트
  const handleDaetaExtend = async (match: any) => {
    setActionError("");
    setActionLoading(true);
    try {
      const res = await fetch("/api/daeta/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: match.id }),
      });
      const result = await res.json();
      if (!res.ok) { setActionError(result.error || "연장 처리 중 오류가 발생했어요."); setActionLoading(false); return; }
      await loadDaetaRecords();
    } catch (err: any) {
      console.error(err);
      setActionError("연장 처리 중 오류가 발생했어요.");
    } finally {
      setActionLoading(false);
    }
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
      ? { color: "var(--text)" }
      : { padding: "16px", color: "var(--text)", background: "var(--bg)", minHeight: "100vh", maxWidth: 480, margin: "0 auto" }}>

      {!embedded && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          {onBack && (
            <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 16 }}>← 뒤로</button>
          )}
          <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>📋 내 대타 매칭 및 정산 관리</h2>
        </div>
      )}

      {focusMatchId && !showAllRecords && (
        <button onClick={() => setShowAllRecords(true)}
          style={{ background: "none", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 12, padding: "6px 12px", borderRadius: 10, cursor: "pointer", marginBottom: 12 }}>
          전체 대타 기록 보기
        </button>
      )}

      {loading ? (
        <p style={{ textAlign: "center", color: "var(--text-muted)", marginTop: 40 }}>기록을 불러오는 중...</p>
      ) : records.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "60px 0" }}>
          <p style={{ fontSize: 32, marginBottom: 10 }}>💤</p>
          <p style={{ fontSize: 14 }}>아직 완료되거나 매칭된 대타 기록이 없습니다.</p>
        </div>
      ) : (() => {
        const visibleRecords = records.filter((rec: any) => showAllRecords || !focusMatchId || rec.id === focusMatchId);
        // 진행중(accepted)과 지난 기록(완료/취소/노쇼/못구함)을 같은 카드 스타일로 뒤섞어 보여주면
        // 지금 실제로 신경 써야 할 게 뭔지 구분이 안 됨 — 섹션을 나누고, 각 섹션 안에서
        // 번호를 매겨 진짜 "목록"처럼 보이게 한다.
        const activeRecords = visibleRecords.filter((rec: any) => rec.progress_status === "accepted");
        const pastRecords = visibleRecords.filter((rec: any) => rec.progress_status !== "accepted");

        const renderCard = (rec: any, idx: number) => {
            const ep = rec.daeta_postings;
            const targetUser = rec.users; // 알바생 정보
            const isEmployerForRecord = rec.employer_id === userId;
            const isCompleted = rec.progress_status === "hired";
            const isCancelled = ["cancelled", "failed"].includes(rec.progress_status);
            const isPending = rec.progress_status === "accepted";

            // 일시 포맷
            const dateStr = ep?.work_date ? formatDaetaDateRange(ep.work_date, ep.work_date_end) : rec.created_at?.split("T")[0];

            const accentColor = isPending ? "#fb923c" : isCompleted ? "#22c55e" : "var(--border)";

            return (
              <div key={rec.id} style={{
                background: isPending ? "rgba(251,146,60,0.06)" : "var(--surface2)",
                border: `1px solid ${isPending ? "rgba(251,146,60,0.3)" : "var(--border)"}`,
                borderLeft: `4px solid ${accentColor}`,
                borderRadius: 18,
                padding: "16px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
                opacity: isCancelled ? 0.75 : 1,
                color: "var(--text)",
              }}>

                {/* 상단 상호명 & 상태 배지 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                        background: "var(--surface2, rgba(255,255,255,0.08))", border: "1px solid var(--border, rgba(255,255,255,0.12))",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, fontWeight: 800, color: "var(--text-muted, rgba(255,255,255,0.5))",
                      }}>
                        {idx}
                      </span>
                      {/* 날짜 — "언제 가야 하는지"가 가장 중요한 정보라 다른 뱃지보다 확실히 눈에 띄게 */}
                      <span style={{
                        fontSize: 13, fontWeight: 900, padding: "3px 10px", borderRadius: 20,
                        color: isPending ? "#fb923c" : "var(--text)",
                        background: isPending ? "rgba(251,146,60,0.18)" : "var(--surface2)",
                      }}>
                        📅 {dateStr}
                      </span>
                      <span style={{ fontSize: 10, color: "#a78bfa", background: "rgba(167,139,250,0.15)", padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>대타 긴급</span>
                      {isPending && (
                        <span style={{ fontSize: 10, color: "#fb923c", background: "rgba(251,146,60,0.18)", padding: "2px 8px", borderRadius: 20, fontWeight: 800 }}>🔥 진행중</span>
                      )}
                    </div>
                    <h3 style={{ fontSize: 16, fontWeight: 900, margin: "6px 0 2px" }}>
                      {rec._unmatched ? (
                        `⚡ ${ep?.business_name} — 지원자 없음`
                      ) : isEmployerForRecord ? (
                        <span onClick={() => router.push(`/worker/${rec.worker_id}`)}
                          style={{ cursor: "pointer", textDecoration: "underline", textDecorationColor: "var(--border)", textUnderlineOffset: 3 }}>
                          ⚡ 알바생: {targetUser?.nickname || "익명"}
                        </span>
                      ) : ep?.employer_profile_id ? (
                        <span onClick={() => router.push(`/store/${ep.employer_profile_id}`)}
                          style={{ cursor: "pointer", textDecoration: "underline", textDecorationColor: "var(--border)", textUnderlineOffset: 3 }}>
                          🏪 매장: {ep?.business_name}
                        </span>
                      ) : (
                        `🏪 매장: ${ep?.business_name}`
                      )}
                    </h3>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isCompleted ? "#4ade80" : isCancelled ? "#f87171" : "#fbbf24" }}>
                    {getStatusText(rec)}
                  </span>
                </div>

                {/* 알바생 입장 — 매장 위치. 진행중일 때만 지도까지 보여줌(가야 할 곳이니까), 지난 기록은 주소 텍스트면 충분 */}
                {!isEmployerForRecord && !rec._unmatched && ep?.region && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4, marginBottom: isPending && ep.lat != null && ep.lng != null ? 8 : 0 }}>
                      <i className="ti ti-map-pin" style={{ fontSize: 12 }} aria-hidden="true" /> {ep.region}
                    </div>
                    {isPending && ep.lat != null && ep.lng != null && (
                      <iframe
                        src={`/map.html?lat=${ep.lat}&lng=${ep.lng}&addr=${encodeURIComponent(ep.region || ep.business_name)}`}
                        style={{ width: "100%", height: 140, borderRadius: 12, border: "1px solid var(--border)" }} />
                    )}
                  </div>
                )}

                {/* 상세 근무 조건 */}
                <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "10px 12px", fontSize: 12, display: "flex", flexDirection: "column", gap: 4, marginBottom: 14, color: "var(--text)" }}>
                  <div>⏰ 시간: {ep?.work_hours}</div>
                  {rec.checked_in_at && (
                    <div>
                      🕐 실제 근무: {new Date(rec.checked_in_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                      {" ~ "}
                      {rec.checked_out_at ? new Date(rec.checked_out_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "근무 중"}
                    </div>
                  )}
                  <div>💼 담당업무: {ep?.business_type || "매장 서빙 및 관리"}</div>
                  <div>💰 약속시급: <strong style={{ color: "#c4b5fd" }}>{ep?.wage?.toLocaleString()}원</strong></div>
                  {isCompleted && rec.employer_rating != null && (
                    <div>⭐ 사장님 평가: <strong style={{ color: "#fbbf24" }}>{rec.employer_rating}/5</strong></div>
                  )}
                </div>

                {/* 상대방과 연락할 방법 — 예전엔 이 카드 어디에도 채팅 진입로가 없어서 매칭된
                    다음 서로 연락할 길이 없었음. accept 시점에 이미 채팅방(matches.id 기준)이
                    만들어져 있으니 그냥 열기만 하면 됨. */}
                {!rec._unmatched && (
                  <button onClick={() => router.push(`/chat/${rec.id}`)}
                    style={{
                      width: "100%", marginBottom: 10, background: isPending ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)",
                      border: isPending ? "none" : "1px solid var(--border)", borderRadius: 12, padding: "11px",
                      color: isPending ? "#fff" : "var(--text)", fontSize: 13, fontWeight: 800, cursor: "pointer",
                    }}>
                    💬 채팅하기
                  </button>
                )}

                {/* 서명 근로계약서 확인 링크 — 매칭 자체가 없던 건(_unmatched)은 계약서도 없어 생략 */}
                {!rec._unmatched && (
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <a href={`/api/contract?matchId=${rec.id}`} target="_blank" rel="noopener noreferrer"
                    style={{ flex: 1, textDecoration: "none", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px", textAlign: "center", fontSize: 12, color: "var(--text)", fontWeight: 700, display: "block" }}>
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
                  <>
                    <div style={{ fontSize: 11, color: rec.checked_out_at ? "#4ade80" : rec.checked_in_at ? "#60a5fa" : "#fbbf24", marginBottom: 8 }}>
                      {rec.checked_out_at
                        ? "✅ 퇴근 확인됨 — 실제 근무시간 기준으로 정산할 수 있어요"
                        : rec.checked_in_at
                        ? "🕐 출근 확인됨 · 아직 퇴근 전이에요"
                        : "⏳ 아직 출근 전이에요 — 출근시각 15분 초과 시 자동으로 다음 인력을 찾아드려요"}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => openConfirm("complete", rec)}
                        style={{ flex: 2, background: "linear-gradient(135deg, #22c55e, #16a34a)", border: "none", borderRadius: 12, padding: "12px", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                        ✅ 근무 완료 · 정산하기
                      </button>
                      {!rec.checked_in_at && (
                        <button onClick={() => handleDaetaExtend(rec)} disabled={actionLoading}
                          style={{ flex: 1, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 12, padding: "12px", color: "#fbbf24", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: actionLoading ? 0.6 : 1 }}>
                          ⏳ 10분만 더
                        </button>
                      )}
                      <button onClick={() => openConfirm("noshow", rec)}
                        style={{ flex: 1, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "12px", color: "#f87171", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        🚨 노쇼 신고
                      </button>
                    </div>
                  </>
                )}

                {/* 알바생 액션 버튼 (출근/퇴근 체크인·아웃 / 임금 미지급 신고) */}
                {!isEmployerForRecord && isPending && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                    {!rec.checked_in_at ? (
                      <button onClick={() => handleDaetaCheckin(rec)} disabled={actionLoading}
                        style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", border: "none", borderRadius: 12, padding: "12px", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: actionLoading ? 0.6 : 1 }}>
                        ✅ 출근했어요
                      </button>
                    ) : !rec.checked_out_at ? (
                      <>
                        <div style={{ textAlign: "center", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 12, padding: "10px", color: "#4ade80", fontSize: 12, fontWeight: 700 }}>
                          ✅ 출근 처리 완료 ({new Date(rec.checked_in_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })})
                        </div>
                        <button onClick={() => handleDaetaCheckout(rec)} disabled={actionLoading}
                          style={{ background: "linear-gradient(135deg, #f97316, #ef4444)", border: "none", borderRadius: 12, padding: "12px", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: actionLoading ? 0.6 : 1 }}>
                          🏁 퇴근했어요
                        </button>
                      </>
                    ) : (
                      <div style={{ textAlign: "center", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 12, padding: "10px", color: "#4ade80", fontSize: 12, fontWeight: 700 }}>
                        ✅ 퇴근 처리 완료 — 사장님 정산을 기다리고 있어요
                      </div>
                    )}
                    <button onClick={() => handleUnpaidReport(rec)}
                      style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "12px", color: "#f87171", fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
                      ⚠️ 임금 미지급 신고
                    </button>
                  </div>
                )}

                {/* 취소는 사장님·알바생 양쪽 다 — 확정 취소 페널티(정지+감점) 적용 */}
                {isPending && (
                  <button onClick={() => openConfirm("cancel", rec)}
                    style={{ width: "100%", marginTop: 8, background: "none", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 12, padding: "9px", borderRadius: 12, cursor: "pointer" }}>
                    🚫 이 대타 취소하기
                  </button>
                )}

              </div>
            );
        };

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {activeRecords.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#fb923c", margin: "2px 2px 0", display: "flex", alignItems: "center", gap: 6 }}>
                  🔥 진행중 <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>{activeRecords.length}건</span>
                </div>
                {activeRecords.map((rec: any, i: number) => renderCard(rec, i + 1))}
              </>
            )}
            {pastRecords.length > 0 && (
              <>
                <div style={{
                  fontSize: 12, fontWeight: 900, color: "var(--text-muted, rgba(255,255,255,0.5))",
                  margin: activeRecords.length > 0 ? "8px 2px 0" : "2px 2px 0",
                  paddingTop: activeRecords.length > 0 ? 10 : 0,
                  borderTop: activeRecords.length > 0 ? "1px solid var(--border, rgba(255,255,255,0.08))" : "none",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  지난 기록 <span style={{ fontSize: 11, fontWeight: 700 }}>{pastRecords.length}건</span>
                </div>
                {pastExpanded && pastRecords.length > PAST_SCROLL_THRESHOLD ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 480, overflowY: "auto", paddingRight: 4 }}>
                    {pastRecords.map((rec: any, i: number) => renderCard(rec, i + 1))}
                  </div>
                ) : (
                  (pastExpanded ? pastRecords : pastRecords.slice(0, PAST_COLLAPSED_COUNT)).map((rec: any, i: number) => renderCard(rec, i + 1))
                )}
                {pastRecords.length > PAST_COLLAPSED_COUNT && (
                  <button
                    onClick={() => setPastExpanded(v => !v)}
                    style={{
                      width: "100%", marginTop: 2, padding: "10px",
                      borderRadius: 12, background: "var(--surface2)", border: "1px solid var(--border)",
                      color: "var(--primary, #8b5cf6)", fontSize: 12, fontWeight: 800, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}
                  >
                    <span>{pastExpanded ? "접기" : `펼치기 (전체 ${pastRecords.length}건 보기)`}</span>
                    <i className={`ti ${pastExpanded ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 14 }} aria-hidden="true" />
                  </button>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* 완료(정산)/노쇼/취소 확인 모달 — 페널티·정산 내역을 미리 보여주고 명시적 동의를 받음 */}
      {pendingAction && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "24px", width: "100%", maxWidth: 360, color: "var(--text)" }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>
                {pendingAction.type === "complete" ? "💸" : pendingAction.type === "noshow" ? "🚨" : "🚫"}
              </div>
              <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>
                {pendingAction.type === "complete" ? "급여 지급을 완료하셨나요?"
                  : pendingAction.type === "noshow" ? "무단 노쇼로 신고할까요?"
                  : "확정된 대타를 취소할까요?"}
              </p>
              {pendingAction.type === "complete" && (() => {
                const posting = pendingAction.match.daeta_postings;
                const wage = posting?.wage || 0;
                const scheduledPerDay = parseWorkHoursRange(posting?.work_hours) ?? 6;
                const days = posting ? daetaDayCount(posting.work_date, posting.work_date_end) : 1;
                const scheduledTotal = Math.round(scheduledPerDay * days * 10) / 10;
                const parsedHours = parseFloat(completeHours) || 0;
                const overtimeHours = Math.max(0, Math.round((parsedHours - scheduledTotal) * 10) / 10);
                const regularHours = parsedHours - overtimeHours;
                const estimatedPay = Math.round(regularHours * wage + overtimeHours * wage * 1.5);
                const fromActualTimes = !!(pendingAction.match.checked_in_at && pendingAction.match.checked_out_at);
                return (
                  <>
                    <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, lineHeight: 1.7, background: "var(--surface2)", borderRadius: 12, padding: "10px 14px" }}>
                      확인 시 임금명세서가 자동 발행되고 알바생에게 알림이 가요.
                    </p>

                    <div style={{ marginTop: 12, textAlign: "left" }}>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
                        {fromActualTimes ? "실제 출퇴근 기록 기준 근무시간" : "출퇴근 기록이 없어 예정 시간 기준으로 채웠어요"} · 필요하면 수정하세요
                      </p>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={completeHours}
                          onChange={(e) => setCompleteHours(e.target.value)}
                          style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontWeight: 700, color: "var(--text)" }}
                        />
                        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>시간</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                        예정 {scheduledTotal}시간{overtimeHours > 0 ? ` · 초과근무 ${overtimeHours}시간 (할증 포함)` : ""}
                      </div>
                      {wage > 0 && (
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#4ade80", marginTop: 8, textAlign: "right" }}>
                          예상 정산액 약 {estimatedPay.toLocaleString()}원
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
              {pendingAction.type === "complete" && (
                <>
                  <div style={{ marginTop: 12 }}>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>이번 대타는 어땠나요? (선택 · 신뢰점수에 반영돼요)</p>
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
                  신고 시 알바생 신뢰점수가 <strong>-30점</strong> 감점되고 대타 참여가 최소 <strong>3일 정지</strong>돼요 (반복되면 더 길어져요). 매칭도 종료돼요.<br />허위 신고 시 불이익이 있을 수 있어요.
                </p>
              )}
              {pendingAction.type === "cancel" && cancelPreview && (
                <>
                  <div
                    onClick={() => setCancelMutual(v => !v)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                      background: "var(--surface2)", borderRadius: 12, padding: "10px 14px", marginBottom: 8, textAlign: "left",
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      border: `1.5px solid ${cancelMutual ? "var(--primary)" : "var(--border)"}`,
                      background: cancelMutual ? "var(--primary)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12,
                    }}>
                      {cancelMutual && "✓"}
                    </div>
                    <span style={{ fontSize: 13, color: "var(--text)" }}>🤝 상대방과 미리 합의된 취소예요</span>
                  </div>
                  <p style={{
                    fontSize: 13, margin: 0, lineHeight: 1.7, borderRadius: 12, padding: "10px 14px",
                    color: cancelMutual ? "var(--success)" : cancelPreview.trustPenalty >= 30 ? "#f87171" : "var(--text-muted)",
                    background: cancelMutual ? "var(--success-bg)" : cancelPreview.trustPenalty >= 30 ? "rgba(239,68,68,0.1)" : "var(--surface2)",
                    border: cancelMutual ? "1px solid var(--success-border)" : cancelPreview.trustPenalty >= 30 ? "1px solid rgba(239,68,68,0.25)" : "none",
                  }}>
                    {cancelMutual
                      ? <>합의된 취소로 처리돼서 <strong>페널티가 없어요.</strong></>
                      : cancelPreview.hoursUntilShift >= 24
                      ? <>근무 시작 24시간 전 취소라 <strong>신뢰점수 -{cancelPreview.trustPenalty}점</strong>만 반영돼요. 지원/등록 정지는 없어요.</>
                      : cancelPreview.hoursUntilShift >= 6
                      ? <>근무 시작이 얼마 안 남아서(24시간 이내) <strong>신뢰점수 -{cancelPreview.trustPenalty}점</strong>이 반영돼요. 지원/등록 정지는 없어요.</>
                      : <>근무 시작이 임박해서(6시간 이내) <strong>신뢰점수 -{cancelPreview.trustPenalty}점</strong>이 크게 반영돼요. 무단 노쇼는 아니라 지원/등록 정지는 없어요.</>}
                  </p>
                </>
              )}
              {actionError && <p style={{ fontSize: 12, color: "#f87171", marginTop: 8 }}>{actionError}</p>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setPendingAction(null); setActionError(""); }}
                style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, fontSize: 14, color: "var(--text-muted)", cursor: "pointer" }}>
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
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "24px", width: "100%", maxWidth: 360, color: "var(--text)" }}>
            <h3 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 16px", textAlign: "center", color: "#c4b5fd" }}>📊 대타 임금 명세서</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13, borderBottom: "1px dashed var(--border)", paddingBottom: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-muted)" }}>발행일</span><span>{selectedPayslip.issued_at?.split("T")[0]}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-muted)" }}>근무내역</span><span>단기 대타 (1일)</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-muted)" }}>근무시간</span><span>{selectedPayslip.total_hours}시간{selectedPayslip.overtime_hours > 0 ? ` (초과 ${selectedPayslip.overtime_hours}시간 포함)` : ""}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-muted)" }}>약정시급</span><span>{selectedPayslip.wage?.toLocaleString()}원</span></div>
              {selectedPayslip.overtime_pay > 0 && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-muted)" }}>기본급</span><span>{selectedPayslip.base_pay?.toLocaleString()}원</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-muted)" }}>초과근무수당</span><span>{selectedPayslip.overtime_pay?.toLocaleString()}원</span></div>
                </>
              )}
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
          <div style={{ background: "var(--surface)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 20, padding: "24px", width: "100%", maxWidth: 360, color: "var(--text)" }}>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 10 }}>⚖️</div>
            <h3 style={{ fontSize: 17, fontWeight: 900, margin: "0 0 10px", textAlign: "center", color: "#f87171" }}>임금 미지급 신고</h3>

            <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 12, textAlign: "center" }}>
              [신고 접수]를 누르면 사장님에게 알림이 가고, 파잡 관리자가 이 건을 검토합니다. 계정이 즉시 정지되진 않으며, 검토 후 조치돼요.
            </p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 20, textAlign: "center" }}>
              법적 대응이 필요하시면 고용노동부 민원마당 또는 가까운 지방고용노동청에 직접 임금체불 진정서를 접수하실 수 있어요. 체결된 표준근로계약서는 위 "계약서 확인" 버튼에서 내려받을 수 있습니다.
            </p>
            {actionError && <p style={{ fontSize: 12, color: "#f87171", marginBottom: 12, textAlign: "center" }}>{actionError}</p>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowUnpaidModal(null)}
                style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px", color: "var(--text)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
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
