"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Member = {
  id: string;
  worker_id: string | null;
  status: string;
  hire_date: string | null;
  work_days: string | null;
  wage: number | null;
  wage_type?: string;
  work_hours: string | null;
  member_role: string;
  match_id: string | null;
  payslip_auto_issue: boolean;
  payslip_auto_issue_offset: number;
  payslip_payday_fallback: number;
  worker: { nickname: string | null; email: string | null; avatar_url: string | null } | null;
  contracts: Contract[];
  attendance_count: number;
  retention_expires: string | null; // hire_date + 3년
  team_documents?: any[];
};

type Contract = {
  id: string;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
  worker_signed: boolean;
  employer_signed: boolean;
  status: string;
  contract_data: Record<string, unknown> | null;
};

function addYears(dateStr: string, years: number): string {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split("T")[0];
}

function formatDate(str: string | null): string {
  if (!str) return "-";
  return str.slice(0, 10).replace(/-/g, ".");
}

function retentionStatus(expiresStr: string | null): { label: string; color: string } {
  if (!expiresStr) return { label: "기간 불명", color: "var(--text-muted)" };
  const now = new Date();
  const exp = new Date(expiresStr);
  const diffDays = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
  if (diffDays < 0) return { label: "보존기간 만료", color: "#f87171" };
  if (diffDays < 180) return { label: `${Math.ceil(diffDays / 30)}개월 남음`, color: "#fb923c" };
  return { label: `${Math.ceil(diffDays / 365 * 10) / 10}년 남음`, color: "#4ade80" };
}

export default function EmployerRecordsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "left">("all");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [attData, setAttData] = useState<Record<string, unknown>[]>([]);
  const [attLoading, setAttLoading] = useState(false);
  const [attMonth, setAttMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [memberPayslips, setMemberPayslips] = useState<any[]>([]);
  const [payslipLoading, setPayslipLoading] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState<Member | null>(null);

  async function loadMemberPayslips(tmId: string) {
    setPayslipLoading(true);
    const { data } = await supabase.from("payslips")
      .select("*")
      .eq("team_member_id", tmId)
      .order("year", { ascending: false, nullsFirst: false })
      .order("month", { ascending: false, nullsFirst: false });
    setMemberPayslips(data || []);
    setPayslipLoading(false);
  }

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    // 전·현직 팀원 전체
    const { data: tm } = await supabase.from("team_members")
      .select(`id, worker_id, match_id, status, hire_date, work_days, wage, work_hours, member_role,
        payslip_auto_issue, payslip_auto_issue_offset, payslip_payday_fallback,
        users!team_members_worker_id_fkey (nickname, email, avatar_url)`)
      .eq("employer_id", user.id)
      .order("created_at", { ascending: false });

    if (!tm) { setLoading(false); return; }

    const workerIds = tm.map((m: any) => m.worker_id).filter(Boolean);
    const tmIds = tm.map((m: any) => m.id);

    // 계약서 일괄 조회
    const { data: contracts } = workerIds.length > 0
      ? await supabase.from("contracts")
          .select("id, created_at, start_date, end_date, worker_signed, employer_signed, status, contract_data, worker_id, wage, wage_type, work_days, work_hours")
          .eq("employer_id", user.id).in("worker_id", workerIds)
          .neq("status", "cancelled")
          .order("created_at", { ascending: false })
      : { data: [] };

    // 근태 건수 일괄
    const { data: attCounts } = tmIds.length > 0
      ? await supabase.from("attendance")
          .select("team_member_id")
          .in("team_member_id", tmIds)
      : { data: [] };

    const countMap: Record<string, number> = {};
    (attCounts || []).forEach((a: any) => {
      countMap[a.team_member_id] = (countMap[a.team_member_id] || 0) + 1;
    });

    // 팀원 서류 일괄 조회
    const { data: teamDocs } = tmIds.length > 0
      ? await supabase.from("team_member_documents")
          .select("id, team_member_id, doc_type, file_url, expires_at")
          .in("team_member_id", tmIds)
      : { data: [] };

    const enriched: Member[] = tm.map((m: any) => {
      const mContracts = (contracts || []).filter((c: any) => c.worker_id === m.worker_id);
      
      let wage = m.wage;
      let wage_type = "hourly";
      let work_days = m.work_days;
      let work_hours = m.work_hours;

      const contract = mContracts.find((c: any) => c.status === "active") || mContracts[0];
      if (contract) {
        const cd = contract.contract_data;
        if (cd?.wageType) wage_type = cd.wageType === "month" ? "monthly" : cd.wageType === "day" ? "daily" : "hourly";
        else if (contract.wage_type) wage_type = contract.wage_type;
        if (cd?.wage) wage = parseInt(String(cd.wage).replace(/,/g, ""));
        else if (contract.wage) wage = contract.wage;
        if (cd) {
          if (cd.workDaysMode === "text" && cd.workDaysText) work_days = cd.workDaysText;
          else {
            const days = ["월", "화", "수", "목", "금", "토", "일"]
              .filter((_, i) => (cd as any)[`workDays${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}`])
              .join("·");
            if (days) work_days = days;
          }
          if (cd.workStart && cd.workEnd) {
            work_hours = `${cd.workStart} ~ ${cd.workEnd}`;
          } else if (cd.dailyHours) {
            work_hours = cd.dailyHours;
          }
        } else {
          if (contract.work_days) work_days = contract.work_days;
          if (contract.work_hours) work_hours = contract.work_hours;
        }
      }

      const hireDate = m.hire_date || m.created_at?.slice(0, 10);
      return {
        ...m,
        wage,
        wage_type,
        work_days,
        work_hours,
        worker: m.users || null,
        contracts: mContracts,
        attendance_count: countMap[m.id] || 0,
        retention_expires: hireDate ? addYears(hireDate, 3) : null,
        team_documents: (teamDocs || []).filter((d: any) => d.team_member_id === m.id),
      };
    });

    setMembers(enriched);
    setLoading(false);
  }

  async function loadAttendance(tmId: string, month: string) {
    setAttLoading(true);
    const [y, mo] = month.split("-");
    const from = `${y}-${mo}-01`;
    const toDate = new Date(Number(y), Number(mo), 0);
    const to = toDate.toISOString().split("T")[0];
    const { data } = await supabase.from("attendance")
      .select("work_date, status, check_in, check_out")
      .eq("team_member_id", tmId)
      .gte("work_date", from).lte("work_date", to)
      .order("work_date", { ascending: true });
    setAttData(data || []);
    setAttLoading(false);
  }

  const filtered = members.filter(m => {
    if (filter === "active") return m.status === "active";
    if (filter === "left") return m.status === "left";
    return true;
  });

  const STATUS_LABEL: Record<string, string> = { active: "재직", left: "퇴사", inactive: "휴직" };
  const STATUS_COLOR: Record<string, string> = { active: "#4ade80", left: "#f87171", inactive: "#fb923c" };
  const ATT_STATUS: Record<string, { label: string; color: string }> = {
    normal: { label: "정상", color: "#4ade80" },
    late: { label: "지각", color: "#fb923c" },
    absent: { label: "결근", color: "#f87171" },
    early_leave: { label: "조퇴", color: "#facc15" },
    holiday: { label: "휴무", color: "var(--text-muted)" },
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 80 }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>

        {/* 헤더 */}
        <div style={{ position: "sticky", top: 0, zIndex: 30, background: "var(--nav-bg)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--nav-border)", padding: "14px 16px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer", padding: 0, lineHeight: 1 }}>←</button>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 900, margin: 0 }}>📂 직원 서류 보관함</h1>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>근로기준법 3년 · 원천징수 5년 보존 의무</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {(["all", "active", "left"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding: "6px 14px", borderRadius: 20, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  background: filter === f ? "var(--primary)" : "var(--surface2)",
                  color: filter === f ? "#fff" : "var(--text-muted)" }}>
                {f === "all" ? "전체" : f === "active" ? "재직" : "퇴사"}
                <span style={{ marginLeft: 4, fontWeight: 400 }}>
                  {f === "all" ? members.length : members.filter(m => m.status === (f === "left" ? "left" : "active")).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-muted)", fontSize: 13 }}>불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <p style={{ fontSize: 28, marginBottom: 8 }}>📭</p>
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>직원 기록이 없어요</p>
          </div>
        ) : (
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map(m => {
              const name = m.worker?.nickname || m.worker?.email?.split("@")[0] || "팀원";
              const ret = retentionStatus(m.retention_expires);
              const hasContract = m.contracts.length > 0;
              const signedContract = m.contracts.find(c => c.worker_signed && c.employer_signed);
              return (
                <div key={m.id} onClick={() => router.push(`/employer/team/${m.id}`)}
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "14px 16px", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: m.worker?.avatar_url ? `url(${m.worker.avatar_url}) center/cover` : "linear-gradient(135deg,#7c3aed,#ec4899)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                      {!m.worker?.avatar_url && "👤"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 800 }}>{name}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[m.status] || "var(--text-muted)" }}>
                          {STATUS_LABEL[m.status] || m.status}
                        </span>
                        {m.member_role === "manager" && <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700 }}>매니저</span>}
                      </div>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 0" }}>
                        입사 {formatDate(m.hire_date)} · 근태 {m.attendance_count}건
                      </p>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: ret.color, textAlign: "right", flexShrink: 0 }}>
                      🗄️ {ret.label}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                    <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "7px 10px" }}>
                      <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 2px" }}>계약서</p>
                      <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: signedContract ? "#4ade80" : hasContract ? "#fb923c" : "#f87171" }}>
                        {signedContract ? "✅ 완료" : hasContract ? "⏳ 서명대기" : "❌ 없음"}
                      </p>
                    </div>
                    <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "7px 10px" }}>
                      <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 2px" }}>서류함</p>
                      <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: (m.team_documents?.length || 0) > 0 ? "#4ade80" : "var(--text-muted)" }}>
                        {(m.team_documents?.length || 0) > 0 ? `📁 ${m.team_documents?.length}건` : "미제출"}
                      </p>
                    </div>
                    <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "7px 10px" }}>
                      <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 2px" }}>시급</p>
                      <p style={{ fontSize: 12, fontWeight: 700, margin: 0 }}>{m.wage ? m.wage.toLocaleString() + "원" : "-"}</p>
                    </div>
                    <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "7px 10px" }}>
                      <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 2px" }}>보존만료</p>
                      <p style={{ fontSize: 12, fontWeight: 700, margin: 0 }}>{m.retention_expires ? formatDate(m.retention_expires) : "-"}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 상세 바텀시트 */}
      {selectedMember && (() => {
        const m = selectedMember;
        const name = m.worker?.nickname || m.worker?.email?.split("@")[0] || "팀원";
        const ret = retentionStatus(m.retention_expires);
        return (
          <div onClick={() => setSelectedMember(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "var(--surface)", borderRadius: "24px 24px 0 0", maxHeight: "88vh", overflowY: "auto", paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}>
              <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border)" }} />
              </div>

              <div style={{ padding: "12px 20px 0" }}>
                {/* 프로필 */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: m.worker?.avatar_url ? `url(${m.worker.avatar_url}) center/cover` : "linear-gradient(135deg,#7c3aed,#ec4899)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                    {!m.worker?.avatar_url && "👤"}
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 900 }}>{name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[m.status] || "var(--text-muted)" }}>
                        {STATUS_LABEL[m.status] || m.status}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "3px 0 0" }}>
                      입사 {formatDate(m.hire_date)} · 보존만료 <span style={{ color: ret.color, fontWeight: 700 }}>{formatDate(m.retention_expires)}</span>
                    </p>
                  </div>
                </div>

                {/* 근무 조건 */}
                <div style={{ background: "var(--surface2)", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 800, color: "var(--text-muted)", margin: "0 0 8px" }}>근무 조건</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[
                      { label: m.wage_type === "monthly" ? "월급" : m.wage_type === "daily" ? "일급" : m.wage_type === "weekly" ? "주급" : "시급", value: m.wage ? m.wage.toLocaleString() + "원" : "-" },
                      { label: "근무요일", value: m.work_days || "-" },
                      { label: "근무시간", value: m.work_hours || "-" },
                      { label: "직책", value: m.member_role === "manager" ? "매니저" : "스태프" },
                    ].map(row => (
                      <div key={row.label}>
                        <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 2px" }}>{row.label}</p>
                        <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{row.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 계약서 목록 */}
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 13, fontWeight: 800, margin: "0 0 8px" }}>📄 근로계약서</p>
                  {m.contracts.length === 0 ? (
                    <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "12px", textAlign: "center" }}>
                      <p style={{ fontSize: 13, color: "#f87171", margin: 0, fontWeight: 600 }}>❌ 계약서 없음 — 법적 위험</p>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>근로기준법 제17조: 근로조건 서면 명시 의무</p>
                    </div>
                  ) : m.contracts.map(c => (
                    <div key={c.id} onClick={() => router.push(`/contract/view?contractId=${c.id}`)}
                      style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, margin: "0 0 2px" }}>
                          {formatDate(c.start_date)}{c.end_date ? ` ~ ${formatDate(c.end_date)}` : " ~"}
                        </p>
                        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>작성 {formatDate(c.created_at)}</p>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: c.employer_signed ? "#4ade80" : "#fb923c" }}>
                          사장 {c.employer_signed ? "✅" : "⏳"}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: c.worker_signed ? "#4ade80" : "#fb923c" }}>
                          직원 {c.worker_signed ? "✅" : "⏳"}
                        </span>
                        {!c.worker_signed && (
                          <button onClick={async (e) => {
                            e.stopPropagation();
                            if (!m.match_id) {
                              alert("⚠️ 매치 정보가 없습니다.");
                              return;
                            }
                            const { data: { user } } = await supabase.auth.getUser();
                            if (!user) return;
                            
                            await fetch("/api/chat", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                matchId: m.match_id,
                                senderId: user.id,
                                receiverId: m.worker_id,
                                message: `⏳ [근로계약서 서명 요청]\n아직 근로계약서 서명이 완료되지 않았습니다. 아래 링크에서 확인 후 서명을 진행해 주세요.\n👉 http://localhost:3000/contract/view?contractId=${c.id}`,
                                messageType: "system",
                              }),
                            }).catch(() => {});
                            alert("🔔 알바생에게 계약서 서명 독촉 알림을 전송했습니다.");
                          }}
                            style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 6, padding: "2px 6px", fontSize: 10, color: "#f59e0b", fontWeight: 700, cursor: "pointer", marginTop: 2, outline: "none" }}>
                            🔔 서명 독촉
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 근태 기록 */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <p style={{ fontSize: 13, fontWeight: 800, margin: 0 }}>📅 근태 기록</p>
                    <input type="month" value={attMonth}
                      onChange={e => { setAttMonth(e.target.value); loadAttendance(m.id, e.target.value); }}
                      style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 8px", color: "var(--text)", fontSize: 12, cursor: "pointer" }} />
                  </div>
                  {attLoading ? (
                    <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "12px 0" }}>불러오는 중...</p>
                  ) : attData.length === 0 ? (
                    <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "12px", textAlign: "center" }}>
                      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>해당 월 근태 기록 없음</p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {attData.map((a: any) => {
                        const st = ATT_STATUS[a.status] || { label: a.status, color: "var(--text-muted)" };
                        return (
                          <div key={a.work_date} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface2)", borderRadius: 8, padding: "7px 12px" }}>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{formatDate(a.work_date)}</span>
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                              {a.check_in && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>출 {String(a.check_in).slice(0, 5)}</span>}
                              {a.check_out && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>퇴 {String(a.check_out).slice(0, 5)}</span>}
                              <span style={{ fontSize: 12, fontWeight: 700, color: st.color }}>{st.label}</span>
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                        {["normal", "late", "absent"].map(s => {
                          const cnt = attData.filter((a: any) => a.status === s).length;
                          const st = ATT_STATUS[s];
                          return cnt > 0 ? (
                            <span key={s} style={{ fontSize: 11, color: st.color }}>
                              {st.label} {cnt}일
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 급여 명세서 */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, margin: 0 }}>📋 급여 명세서</p>
                      <button onClick={() => setSettingsModalOpen(m)}
                        style={{ background: "none", border: "none", padding: "2px", cursor: "pointer", display: "flex", alignItems: "center", fontSize: 14 }}
                        title="자동 발행 설정">
                        ⚙️
                      </button>
                    </div>
                    <button onClick={() => router.push(`/payslip?tmId=${m.id}`)}
                      style={{ background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", borderRadius: 8, padding: "5px 12px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      ➕ 새 명세서 발행
                    </button>
                  </div>
                  {payslipLoading ? (
                    <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "12px 0" }}>불러오는 중...</p>
                  ) : memberPayslips.length === 0 ? (
                    <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "12px", textAlign: "center" }}>
                      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>발행된 급여 명세서 없음</p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {memberPayslips.map(ps => (
                        <div key={ps.id}
                          style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div>
                            <p style={{ fontSize: 12, fontWeight: 700, margin: "0 0 2px" }}>{ps.year}년 {ps.month}월</p>
                            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                              지급액: {Number(ps.total_pay || ps.total_amount || 0).toLocaleString()}원
                              {ps.net_pay && ` (실수령: ${Number(ps.net_pay).toLocaleString()}원)`}
                            </p>
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ fontSize: 10, background: ps.confirmed_at ? "#10b98120" : "#f59e0b20", color: ps.confirmed_at ? "#10b981" : "#f59e0b", borderRadius: 6, padding: "2px 6px", fontWeight: 700 }}>
                              {ps.confirmed_at ? "확인완료" : "서명대기"}
                            </span>
                            <button onClick={() => router.push(`/payslip?id=${ps.id}`)}
                              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "var(--text)", cursor: "pointer" }}>
                              보기
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 보존 안내 */}
                <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 12, padding: "12px 14px" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--purple-text)", margin: "0 0 4px" }}>📌 법정 보존 기간 안내</p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
                    근로계약서 · 임금대장 · 근태기록: 퇴직일로부터 <strong>3년</strong><br />
                    원천징수영수증: <strong>5년</strong> (소득세법 제163조)<br />
                    보존 만료일: <strong style={{ color: ret.color }}>{formatDate(m.retention_expires)}</strong>
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 자동 발행 예약 설정 모달 */}
      {settingsModalOpen && (() => {
        const m = settingsModalOpen;
        const signedContract = m.contracts.find(c => c.worker_signed && c.employer_signed);
        const contractPayday = (signedContract?.contract_data?.payDay as string) || null;

        return (
          <AutoIssueModalInner
            member={m}
            contractPayday={contractPayday}
            onClose={() => setSettingsModalOpen(null)}
            onSave={(updatedFields) => {
              const updatedMember = { ...m, ...updatedFields };
              setMembers(prev => prev.map(x => x.id === updatedMember.id ? updatedMember : x));
              if (selectedMember?.id === updatedMember.id) {
                setSelectedMember(updatedMember);
              }
              setSettingsModalOpen(null);
            }}
          />
        );
      })()}
    </main>
  );
}

function AutoIssueModalInner({
  member,
  contractPayday,
  onClose,
  onSave,
}: {
  member: Member;
  contractPayday: string | null;
  onClose: () => void;
  onSave: (updated: Partial<Member>) => void;
}) {
  const [enabled, setEnabled] = useState(member.payslip_auto_issue ?? false);
  const [offset, setOffset] = useState(member.payslip_auto_issue_offset ?? 0);
  const [fallbackPayday, setFallbackPayday] = useState(member.payslip_payday_fallback ?? 10);
  const [saving, setSaving] = useState(false);
  const [customOffsetOpen, setCustomOffsetOpen] = useState(![0, 1, 2, 3, 5].includes(member.payslip_auto_issue_offset ?? 0));
  const [customOffsetVal, setCustomOffsetVal] = useState(member.payslip_auto_issue_offset ?? 0);

  const saveSettings = async () => {
    setSaving(true);
    const finalOffset = customOffsetOpen ? customOffsetVal : offset;
    const { error } = await supabase
      .from("team_members")
      .update({
        payslip_auto_issue: enabled,
        payslip_auto_issue_offset: finalOffset,
        payslip_payday_fallback: fallbackPayday,
      })
      .eq("id", member.id);

    setSaving(false);
    if (error) {
      alert("설정 저장 실패: " + error.message);
      return;
    }
    onSave({
      payslip_auto_issue: enabled,
      payslip_auto_issue_offset: finalOffset,
      payslip_payday_fallback: fallbackPayday,
    });
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.6)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16
    }}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 20, width: "100%", maxWidth: 380, padding: 20,
        boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
        display: "flex", flexDirection: "column", gap: 16
      }}>
        {/* 헤더 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 15, fontWeight: 800 }}>⚙️ 명세서 자동 발행 설정</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "var(--text-muted)", cursor: "pointer", padding: 4 }}>✕</button>
        </div>

        {/* 안내 */}
        <div style={{ background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.15)", borderRadius: 12, padding: "10px 12px" }}>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 4px" }}>근무지 정산 정보</p>
          {contractPayday ? (
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--purple-text)", margin: 0 }}>
              📝 계약서 상 급여지급일: 매월 {contractPayday}일
            </p>
          ) : (
            <div>
              <p style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700, margin: "0 0 6px" }}>
                ⚠️ 서명 완료된 근로계약서가 없습니다.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>기본 지급일 수동 설정:</span>
                <input type="number" min={1} max={31} value={fallbackPayday}
                  onChange={e => setFallbackPayday(Math.max(1, Math.min(31, Number(e.target.value))))}
                  style={{ width: 60, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 6px", color: "var(--text)", fontSize: 12, outline: "none", textAlign: "center" }} />
                <span style={{ fontSize: 12 }}>일</span>
              </div>
            </div>
          )}
        </div>

        {/* 활성화 토글 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700 }}>급여명세서 자동 발행 활성화</span>
            <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "2px 0 0" }}>매월 지정일에 명세서를 자동 발행 및 발송합니다.</p>
          </div>
          <button onClick={() => setEnabled(!enabled)} style={{
            width: 44, height: 24, borderRadius: 12,
            background: enabled ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "var(--border)",
            border: "none", cursor: "pointer", position: "relative",
            transition: "background 0.2s"
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: "50%", background: "#fff",
              position: "absolute", top: 3, left: enabled ? 23 : 3,
              transition: "left 0.2s"
            }} />
          </button>
        </div>

        {/* 발행 시점 오프셋 설정 */}
        {enabled && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>📅 발행 시점 (지급일 기준)</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[
                { label: "당일", val: 0 },
                { label: "1일 전", val: 1 },
                { label: "2일 전", val: 2 },
                { label: "3일 전", val: 3 },
                { label: "5일 전", val: 5 },
              ].map(opt => {
                const active = !customOffsetOpen && offset === opt.val;
                return (
                  <button key={opt.val} onClick={() => { setCustomOffsetOpen(false); setOffset(opt.val); }}
                    style={{
                      background: active ? "rgba(124,58,237,0.15)" : "var(--surface2)",
                      border: active ? "1px solid #7c3aed" : "1px solid var(--border)",
                      color: active ? "var(--purple-text)" : "var(--text)",
                      borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", outline: "none"
                    }}>
                    {opt.label}
                  </button>
                );
              })}
              <button onClick={() => setCustomOffsetOpen(true)}
                style={{
                  background: customOffsetOpen ? "rgba(124,58,237,0.15)" : "var(--surface2)",
                  border: customOffsetOpen ? "1px solid #7c3aed" : "1px solid var(--border)",
                  color: customOffsetOpen ? "var(--purple-text)" : "var(--text)",
                  borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", outline: "none"
                }}>
                직접 입력
              </button>
            </div>

            {customOffsetOpen && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, background: "var(--surface2)", borderRadius: 10, padding: 8, border: "1px dashed var(--border)" }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>지급일 기준:</span>
                <input type="number" min={0} max={30} value={customOffsetVal}
                  onChange={e => setCustomOffsetVal(Math.max(0, Math.min(30, Number(e.target.value))))}
                  style={{ width: 60, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", color: "var(--text)", fontSize: 12, outline: "none", textAlign: "center" }} />
                <span style={{ fontSize: 12 }}>일 전에 자동 발행</span>
              </div>
            )}
          </div>
        )}

        {/* 저장 버튼 */}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={onClose}
            style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, fontSize: 13, fontWeight: 700, color: "var(--text)", cursor: "pointer" }}>
            취소
          </button>
          <button onClick={saveSettings} disabled={saving}
            style={{ flex: 2, background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", borderRadius: 12, padding: 12, fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
            {saving ? "저장 중..." : "설정 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
