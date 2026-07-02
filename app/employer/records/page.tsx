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
  work_hours: string | null;
  member_role: string;
  worker: { nickname: string | null; email: string | null; avatar_url: string | null } | null;
  contracts: Contract[];
  attendance_count: number;
  retention_expires: string | null; // hire_date + 3년
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

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    // 전·현직 팀원 전체
    const { data: tm } = await supabase.from("team_members")
      .select(`id, worker_id, status, hire_date, work_days, wage, work_hours, member_role,
        users!team_members_worker_id_fkey (nickname, email, avatar_url)`)
      .eq("employer_id", user.id)
      .order("created_at", { ascending: false });

    if (!tm) { setLoading(false); return; }

    const workerIds = tm.map((m: any) => m.worker_id).filter(Boolean);
    const tmIds = tm.map((m: any) => m.id);

    // 계약서 일괄 조회
    const { data: contracts } = workerIds.length > 0
      ? await supabase.from("contracts")
          .select("id, created_at, start_date, end_date, worker_signed, employer_signed, status, contract_data, worker_id")
          .eq("employer_id", user.id).in("worker_id", workerIds)
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

    const enriched: Member[] = tm.map((m: any) => {
      const mContracts = (contracts || []).filter((c: any) => c.worker_id === m.worker_id);
      const hireDate = m.hire_date || m.created_at?.slice(0, 10);
      return {
        ...m,
        worker: m.users || null,
        contracts: mContracts,
        attendance_count: countMap[m.id] || 0,
        retention_expires: hireDate ? addYears(hireDate, 3) : null,
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
                <div key={m.id} onClick={() => { setSelectedMember(m); loadAttendance(m.id, attMonth); }}
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "7px 10px" }}>
                      <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 2px" }}>계약서</p>
                      <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: signedContract ? "#4ade80" : hasContract ? "#fb923c" : "#f87171" }}>
                        {signedContract ? "✅ 완료" : hasContract ? "⏳ 서명대기" : "❌ 없음"}
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
                      { label: "시급", value: m.wage ? m.wage.toLocaleString() + "원" : "-" },
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
    </main>
  );
}
