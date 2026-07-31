"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface DaetaHistoryViewProps {
  userId: string;
  userType: "worker" | "employer" | "both";
  onBack?: () => void;
}

export default function DaetaHistoryView({ userId, userType, onBack }: DaetaHistoryViewProps) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<any[]>([]);
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);
  const [showUnpaidModal, setShowUnpaidModal] = useState<any>(null); // 임금 미지급 신고 팝업
  
  const isEmployer = userType === "employer" || userType === "both";

  useEffect(() => {
    loadDaetaRecords();
  }, [userId]);

  const loadDaetaRecords = async () => {
    setLoading(true);
    try {
      // 1. Fetch matches
      const { data: matches, error: matchesErr } = await supabase
        .from("matches")
        .select("*")
        .or(`employer_id.eq.${userId},worker_id.eq.${userId}`)
        .order("created_at", { ascending: false });

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
          .select("id, business_name, business_type, region, wage, work_hours, work_date")
          .in("id", postingIds),
        supabase
          .from("users")
          .select("id, name, nickname, phone, trust_score")
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

      setRecords(enriched);
    } catch (err) {
      console.error("대타 기록 로딩 에러:", err);
    } finally {
      setLoading(false);
    }
  };

  // 1. 사장님: 급여 지급 완료 처리 (정산)
  const handlePayComplete = async (match: any) => {
    const hoursStr = match.daeta_postings?.work_hours || "12:00 ~ 18:00";
    const wage = match.daeta_postings?.wage || 10030;
    
    // 임시 근무 시간 계산 (기본 6시간)
    let hours = 6;
    try {
      const times = hoursStr.split("~");
      const sh = parseInt(times[0].split(":")[0]);
      const eh = parseInt(times[1].split(":")[0]);
      hours = eh > sh ? eh - sh : 24 - sh + eh;
    } catch {}

    const totalPay = wage * hours;

    const confirmed = window.confirm(
      `💸 ${match.users?.nickname || "알바생"} 님에게 대타 급여 지급을 완료하셨습니까?\n` +
      `정산액: ${totalPay.toLocaleString()}원 (${hours}시간 × ${wage.toLocaleString()}원)\n\n` +
      `확인 버튼을 누르면 알바생에게 명세서가 전송됩니다.`
    );
    if (!confirmed) return;

    try {
      const now = new Date();
      // 1) payslips 테이블에 자동 정산 내역 발행
      const { data: ps, error: psErr } = await supabase
        .from("payslips")
        .insert({
          employer_id: match.employer_id,
          worker_id: match.worker_id,
          match_id: match.id,
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          wage,
          total_hours: hours,
          base_pay: totalPay,
          total_pay: totalPay,
          status: "issued",
          issued_at: now.toISOString(),
          memo: "긴급 대타 급여 당일 정산",
        })
        .select()
        .single();

      if (psErr) throw psErr;

      // 2) matches 상태를 completed로 업데이트
      await supabase
        .from("matches")
        .update({ status: "completed", progress_status: "hired" })
        .eq("id", match.id);

      // 3) daeta_postings 상태를 completed로 업데이트
      if (match.daeta_posting_id) {
        await supabase
          .from("daeta_postings")
          .update({ status: "completed" })
          .eq("id", match.daeta_posting_id);
      }

      alert("💸 정산 및 임금명세서 자동 발행이 완료되었습니다!");
      loadDaetaRecords();
    } catch (err: any) {
      console.error(err);
      alert("정산 처리 중 오류가 발생했습니다: " + err.message);
    }
  };

  // 2. 사장님: 노쇼 신고
  const handleNoShow = async (match: any) => {
    const confirmed = window.confirm(
      `🚨 ${match.users?.nickname || "알바생"} 님을 무단 노쇼로 신고하시겠습니까?\n` +
      `신고 완료 시 해당 구직자는 파잡 서비스 이용이 즉시 정지되며, 신뢰도가 크게 하락합니다.\n\n` +
      `*허위 신고 시 사장님 계정이 정지될 수 있으니 신중히 처리해 주세요.`
    );
    if (!confirmed) return;

    try {
      // 1) matches 상태를 cancelled 처리
      await supabase
        .from("matches")
        .update({ status: "cancelled", progress_status: "failed", message: "알바생 노쇼로 인한 구인 취소" })
        .eq("id", match.id);

      // 2) daeta_postings 상태를 cancelled로 업데이트
      if (match.daeta_posting_id) {
        await supabase
          .from("daeta_postings")
          .update({ status: "cancelled" })
          .eq("id", match.daeta_posting_id);
      }

      // 2) 알바생 신뢰 크레딧 30점 차감 로직 연동 (users.trust_score 차감)
      const currentScore = match.users?.trust_score ?? 50;
      const nextScore = Math.max(0, currentScore - 30);
      await supabase
        .from("users")
        .update({ trust_score: nextScore })
        .eq("id", match.worker_id);

      // 3) 노쇼 로그 기록 (기본 trust_score_logs 테이블이 있는 경우)
      try {
        await supabase.from("trust_score_logs").insert({
          user_id: match.worker_id,
          delta: -30,
          reason: "대타 매칭 후 무단 노쇼 발생",
          category: "promise"
        });
      } catch (logErr) {
        console.warn("노쇼 로그 기록 실패:", logErr);
      }

      alert("🚨 노쇼 신고가 완료되었습니다.\n해당 알바생은 30일간 대타 구직이 차단되며 신뢰 점수가 30점 감점되었습니다.");
      loadDaetaRecords();
    } catch (err: any) {
      console.error(err);
      alert("노쇼 신고 처리 실패: " + err.message);
    }
  };

  // 3. 알바생: 임금 미지급 신고서 PDF 빌드
  const handleUnpaidReport = (match: any) => {
    setShowUnpaidModal(match);
  };

  const downloadLaborPetition = (match: any) => {
    // 목업 PDF 생성 및 가이드 안내
    alert(
      "📄 [고용노동부 임금체불 진정서 PDF]가 성공적으로 자동 작성되었습니다!\n\n" +
      `- 대상 매장: ${match.daeta_postings?.business_name}\n` +
      `- 미지급금: ${(match.daeta_postings?.wage || 10030) * 6}원 상당\n` +
      "- 첨부 증빙: 전자 서명 표준 근로계약서, 출퇴근 타임로그 및 대화 캡처\n\n" +
      "등록된 메일주소로 PDF 파일이 발송되었습니다. 다운로드하여 노동청 민원실에 접수해 주세요."
    );
    
    // 사장님 정지 블랙리스트 처리 (목업)
    supabase.from("users").update({ is_active: false }).eq("id", match.employer_id)
      .then(() => {
        alert("🔒 해당 매장 사장님의 파잡 전체 서비스 이용이 즉시 영구 정지(Blacklist)되었습니다.");
        setShowUnpaidModal(null);
        loadDaetaRecords();
      });
  };

  const getStatusText = (match: any) => {
    if (match.status === "completed") return "✅ 정산 완료";
    if (match.status === "cancelled") return "❌ 취소/노쇼";
    if (match.status === "accepted") return "🤝 근무 예정 / 정산 대기";
    return match.status;
  };

  return (
    <div style={{ padding: "16px", color: "#fff", background: "var(--bg)", minHeight: "100vh" }}>
      
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        {onBack && (
          <button onClick={onBack} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}>← 뒤로</button>
        )}
        <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>📋 내 대타 매칭 및 정산 관리</h2>
      </div>

      {loading ? (
        <p style={{ textAlign: "center", color: "#94a3b8", marginTop: 40 }}>기록을 불러오는 중...</p>
      ) : records.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "60px 0" }}>
          <p style={{ fontSize: 32, marginBottom: 10 }}>💤</p>
          <p style={{ fontSize: 14 }}>아직 완료되거나 매칭된 대타 기록이 없습니다.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {records.map((rec: any) => {
            const ep = rec.daeta_postings;
            const targetUser = rec.users; // 알바생 정보
            const isCompleted = rec.status === "completed";
            const isCancelled = rec.status === "cancelled";
            const isPending = rec.status === "accepted";

            // 일시 포맷
            const dateStr = ep?.work_date || rec.created_at?.split("T")[0];

            return (
              <div key={rec.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
                
                {/* 상단 상호명 & 상태 배지 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: 10, color: "#a78bfa", background: "rgba(167,139,250,0.15)", padding: "2px 8px", borderRadius: 20, fontWeight: 700, marginRight: 6 }}>대타 긴급</span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{dateStr}</span>
                    <h3 style={{ fontSize: 16, fontWeight: 900, margin: "6px 0 2px" }}>
                      {isEmployer ? `⚡ 알바생: ${targetUser?.nickname || "익명"}` : `🏪 매장: ${ep?.business_name}`}
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
                </div>

                {/* 서명 근로계약서 확인 링크 */}
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

                {/* 사장님 액션 버튼 (정산 / 노쇼 신고) */}
                {isEmployer && isPending && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={() => handlePayComplete(rec)}
                      style={{ flex: 2, background: "linear-gradient(135deg, #22c55e, #16a34a)", border: "none", borderRadius: 12, padding: "12px", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                      💸 급여 이체 완료 (정산 확정)
                    </button>
                    <button onClick={() => handleNoShow(rec)}
                      style={{ flex: 1, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "12px", color: "#f87171", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      🚨 노쇼 신고
                    </button>
                  </div>
                )}

                {/* 알바생 액션 버튼 (임금 미지급 신고) */}
                {!isEmployer && isPending && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={() => handleUnpaidReport(rec)}
                      style={{ flex: 1, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "12px", color: "#f87171", fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
                      ⚠️ 임금 미지급 (먹튀) 신고 및 법적 대응
                    </button>
                  </div>
                )}

              </div>
            );
          })}
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

      {/* 모달 2: 임금 미지급(먹튀) 대응 모달 */}
      {showUnpaidModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "#1c1c1e", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 20, padding: "24px", width: "100%", maxWidth: 360, color: "#fff" }}>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 10 }}>⚖️</div>
            <h3 style={{ fontSize: 17, fontWeight: 900, margin: "0 0 10px", textAlign: "center", color: "#f87171" }}>고용노동부 진정 절차 실행</h3>
            
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, marginBottom: 20, textAlign: "center" }}>
              근무 종료 24시간이 경과하여 사장님의 체불이 감지되었습니다. <strong>[신고 접수]</strong>를 누르면 파잡이 체결된 표준근로계약서를 기반으로 <strong>임금체불 진정서 PDF를 즉시 생성</strong>하고 사장님 계정을 영구 정지합니다.
            </p>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowUnpaidModal(null)}
                style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                취소
              </button>
              <button onClick={() => downloadLaborPetition(showUnpaidModal)}
                style={{ flex: 1, background: "#ef4444", border: "none", borderRadius: 12, padding: "12px", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                진정서 생성 및 신고
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
