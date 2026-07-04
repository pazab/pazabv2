"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useToast } from "@/lib/useToast";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import { getTrustGrade } from "@/lib/utils";

// ─────────────────────────────────────────────
// 근태 이력 타임라인 (아코디언, 기본 접힘)
// ─────────────────────────────────────────────
function AttendanceLogs({ memberId, refreshKey = 0 }: { memberId: string; refreshKey?: number }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.from("attendance_logs")
      .select("*, users!attendance_logs_actor_id_fkey(nickname, avatar_url)")
      .eq("team_member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }: { data: any }) => { setLogs(data || []); setLoading(false); });
  }, [memberId, refreshKey]);

  const actionMeta: Record<string, { label: string; color: string }> = {
    checkin:  { label: "출근 기록", color: "#10b981" },
    checkout: { label: "퇴근 기록", color: "#3b82f6" },
    update:   { label: "근태 수정", color: "#f59e0b" },
    delete:   { label: "근태 삭제", color: "#ef4444" },
  };
  const roleLabel: Record<string, string> = { employer: "사장님", worker: "알바생", system: "시스템" };
  const statusLabel: Record<string, string> = { normal: "정상출근", late: "지각", early_leave: "조퇴", absent: "결근", off: "휴무" };

  if (loading || logs.length === 0) return null;

  return (
    <div style={{ marginTop: 8, borderTop: "1px solid var(--border)" }}>
      {/* 아코디언 헤더 */}
      <button onClick={() => setOpen(v => !v)}
        style={{ width: "100%", background: "none", border: "none", padding: "12px 0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)" }}>📋 출퇴근 · 수정 이력 <span style={{ fontSize: 11, fontWeight: 400 }}>({logs.length}건)</span></span>
        <span style={{ fontSize: 14, color: "var(--text-muted)", transition: "transform 0.2s", display: "inline-block", transform: open ? "rotate(180deg)" : "none" }}>▼</span>
      </button>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 16 }}>
          {logs.map((log, i) => {
            const d = log.after_data || log.before_data || {};
            const meta = actionMeta[log.action] || { label: log.action, color: "#6b7280" };
            const name = log.users?.nickname || roleLabel[log.actor_role] || "알 수 없음";
            const workDate = d.work_date || "";
            const time = new Date(log.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
            const checkIn = d.check_in ? String(d.check_in).slice(11, 16) : "";
            const checkOut = d.check_out ? String(d.check_out).slice(11, 16) : "";

            return (
              <div key={log.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: meta.color, marginTop: 5 }} />
                  {i < logs.length - 1 && <div style={{ width: 1, flex: 1, background: "var(--border)", minHeight: 24, marginTop: 2 }} />}
                </div>
                <div style={{ flex: 1, background: "var(--surface2)", borderRadius: 10, padding: "8px 12px", marginBottom: 2 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: meta.color }}>{meta.label}</span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{time}</span>
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 4px" }}>
                    <strong style={{ color: "var(--text)" }}>{name}</strong>
                    {log.actor_role && <span style={{ marginLeft: 4, fontSize: 10, background: "var(--surface)", borderRadius: 4, padding: "1px 5px" }}>{roleLabel[log.actor_role] || log.actor_role}</span>}
                    {workDate && <span style={{ marginLeft: 6 }}>{workDate}</span>}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {d.status && (
                      <span style={{ fontSize: 10, background: "var(--surface)", borderRadius: 5, padding: "2px 7px", color: "var(--text-muted)" }}>
                        {statusLabel[d.status] || d.status}
                      </span>
                    )}
                    {checkIn && <span style={{ fontSize: 10, background: "var(--surface)", borderRadius: 5, padding: "2px 7px", color: "#10b981" }}>출근 {checkIn}</span>}
                    {checkOut && <span style={{ fontSize: 10, background: "var(--surface)", borderRadius: 5, padding: "2px 7px", color: "#3b82f6" }}>퇴근 {checkOut}</span>}
                    {d.actual_hours ? <span style={{ fontSize: 10, background: "var(--surface)", borderRadius: 5, padding: "2px 7px", color: "var(--text-muted)" }}>{d.actual_hours}h</span> : null}
                  </div>
                  {d.memo && <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "5px 0 0", background: "var(--surface)", borderRadius: 6, padding: "4px 8px", lineHeight: 1.5 }}>📝 {d.memo}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const ATTENDANCE_STATUS = [
  { id: "normal", label: "정상", color: "#10b981", bg: "#10b98120" },
  { id: "late", label: "지각", color: "#f59e0b", bg: "#f59e0b20" },
  { id: "early_leave", label: "조퇴", color: "#f59e0b", bg: "#f59e0b20" },
  { id: "absent", label: "결근", color: "#ef4444", bg: "#ef444420" },
  { id: "off", label: "휴무", color: "#6b7280", bg: "#6b728020" },
];

const PERSONALITY_EMOJI: Record<string, string> = {
  "폭풍처리형": "⚡", "꼼꼼탐정형": "🔍", "공감마스터형": "💕",
  "돌격대장형": "🚀", "묵묵수행형": "🎯", "분위기메이커형": "🌟",
  "균형조율형": "⚖️", "창의탐험형": "🎨", "장인기질형": "🔨",
  "안정추구형": "🛡️", "소통달인형": "💬", "열정폭발형": "🔥",
  "완벽주의형": "✨", "리더십형": "👑", "팀플레이어형": "🤝",
};

// ─────────────────────────────────────────────
// 접이식 섹션 헤더 컴포넌트
// ─────────────────────────────────────────────
function SectionHeader({ title, open, onToggle, badge }: { title: string; open: boolean; onToggle: () => void; badge?: string }) {
  return (
    <button onClick={onToggle}
      style={{ width: "100%", background: "none", border: "none", padding: "14px 0 10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <p style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", margin: 0 }}>{title}</p>
        {badge && <span style={{ fontSize: 11, background: "rgba(124,58,237,0.15)", color: "#c4b5fd", borderRadius: 20, padding: "2px 10px", fontWeight: 700 }}>{badge}</span>}
      </div>
      <span style={{ color: "var(--text-muted)", fontSize: 20, lineHeight: 1, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none", display: "block" }}>⌄</span>
    </button>
  );
}

// ─────────────────────────────────────────────
// 메인 페이지
// ─────────────────────────────────────────────
export default function TeamMemberPage() {
  const router = useRouter();
  const params = useParams();
  const memberId = params?.id as string;
  const { showToast, ToastUI } = useToast();

  const [member, setMember] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);

  // 아코디언 열림 상태
  const [payslipOpen, setPayslipOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(true);
  const [showResignModal, setShowResignModal] = useState(false);

  // 근태 입력 모달
  const [showAttModal, setShowAttModal] = useState(false);
  const [attDate, setAttDate] = useState(new Date().toISOString().split("T")[0]);
  const [attStatus, setAttStatus] = useState("normal");
  const [attNote, setAttNote] = useState("");
  const [attStart, setAttStart] = useState<string>("");
  const [attEnd, setAttEnd] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [attLogRefreshKey, setAttLogRefreshKey] = useState(0);

  // 근무조건 수정 모달
  const [showWorkModal, setShowWorkModal] = useState(false);
  const [editWage, setEditWage] = useState("");
  const [editWorkDays, setEditWorkDays] = useState("");
  const [editWorkHours, setEditWorkHours] = useState("");
  const [workSaving, setWorkSaving] = useState(false);

  // 급여 명세서 상태
  const [payslips, setPayslips] = useState<any[]>([]);
  const [payslipsLoading, setPayslipsLoading] = useState(false);

  // 달력 상태
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(now.getFullYear());

  useEffect(() => {
    if (memberId) loadMember();
  }, [memberId]);

  useEffect(() => {
    if (member?.id) loadAttendance(member.id, viewYear, viewMonth);
  }, [viewYear, viewMonth]);

  // Realtime 출퇴근 구독
  useEffect(() => {
    if (!memberId) return;
    const channel = supabase
      .channel(`attendance:${memberId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "attendance",
        filter: `team_member_id=eq.${memberId}`,
      }, () => {
        loadAttendance(memberId);
        setAttLogRefreshKey(k => k + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [memberId]);

  async function loadMember() {
    const { data } = await supabase.from("team_members")
      .select(`*, users!team_members_worker_id_fkey (nickname, avatar_url, worker_result, phone, email, trust_score)`)
      .eq("id", memberId).single();
    if (data) {
      let wage = data.wage;
      let work_days = data.work_days;
      let work_hours = data.work_hours;

      if (data.match_id) {
        const { data: contract } = await supabase.from("contracts")
          .select("wage, work_days, work_hours, contract_data")
          .eq("match_id", data.match_id)
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();

        if (contract) {
          const cd = contract.contract_data;
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
            if (cd.dailyHours) work_hours = cd.dailyHours;
          } else {
            if (contract.work_days) work_days = contract.work_days;
            if (contract.work_hours) work_hours = contract.work_hours;
          }
        }
      }

      setMember({ ...data, worker: (data as any).users, wage, work_days, work_hours });
      loadAttendance(data.id);
      loadContracts(data.employer_id, data.worker_id, data.id);
      loadPayslips(data.id);
    }
  }

  async function loadAttendance(tmId: string, year?: number, month?: number) {
    const y = year ?? viewYear;
    const m = month ?? viewMonth;
    const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const to = `${y}-${String(m + 1).padStart(2, "0")}-${new Date(y, m + 1, 0).getDate()}`;
    const { data } = await supabase.from("attendance")
      .select("*").eq("team_member_id", tmId)
      .gte("work_date", from).lte("work_date", to)
      .order("work_date", { ascending: false });
    setAttendance(data || []);
  }

  async function loadContracts(empId: string, wrkId: string, tmId?: string) {
    let q = supabase.from("contracts")
      .select("id, team_member_id, start_date, end_date, created_at, contract_data, worker_signed, employer_signed, status")
      .order("created_at", { ascending: false });
    if (tmId) {
      q = q.eq("team_member_id", tmId);
    } else {
      q = q.eq("employer_id", empId).eq("worker_id", wrkId);
    }
    const { data } = await q;
    setContracts(data || []);
    if (!data || data.length === 0) {
      setContractOpen(true);
    }
  }

  async function loadPayslips(tmId: string) {
    setPayslipsLoading(true);
    const { data } = await supabase.from("payslips")
      .select("*")
      .eq("team_member_id", tmId)
      .order("year", { ascending: false })
      .order("month", { ascending: false });
    setPayslips(data || []);
    setPayslipsLoading(false);
  }

  async function saveWorkCondition() {
    if (!member) return;
    setWorkSaving(true);
    const wage = editWage ? parseInt(editWage.replace(/,/g, "")) : null;
    const { error } = await supabase.from("team_members").update({
      wage: wage || null,
      work_days: editWorkDays || null,
      work_hours: editWorkHours || null,
    }).eq("id", member.id);
    if (error) { showToast("저장 오류: " + error.message, "error"); setWorkSaving(false); return; }
    setMember((prev: any) => ({ ...prev, wage: wage || prev.wage, work_days: editWorkDays || prev.work_days, work_hours: editWorkHours || prev.work_hours }));
    setShowWorkModal(false);
    setWorkSaving(false);
    showToast("근무조건이 수정됐어요");
  }

  async function saveAttendance() {
    if (!member) return;
    setSaving(true);
    const actualHours = (() => {
      if (["absent", "off"].includes(attStatus)) return 0;
      if (attStart && attEnd) {
        const [sh, sm] = attStart.split(":").map(Number);
        const [eh, em] = attEnd.split(":").map(Number);
        const mins = (eh * 60 + em) - (sh * 60 + sm);
        return mins > 0 ? Math.round(mins / 60 * 10) / 10 : null;
      }
      return null;
    })();

    const { error } = await supabase.from("attendance").upsert({
      team_member_id: member.id,
      employer_id: member.employer_id,
      worker_id: member.worker_id,
      work_date: attDate,
      status: attStatus,
      memo: attNote,
      check_in: ["absent", "off"].includes(attStatus) ? null : (attStart ? `${attDate}T${attStart}:00+09:00` : null),
      check_out: ["absent", "off"].includes(attStatus) ? null : (attEnd ? `${attDate}T${attEnd}:00+09:00` : null),
      actual_hours: actualHours,
    }, { onConflict: "team_member_id,work_date" });

    if (error) { showToast("저장 오류: " + error.message, "error"); setSaving(false); return; }

    const { data: savedAtt } = await supabase.from("attendance")
      .select("*").eq("team_member_id", member.id).eq("work_date", attDate).maybeSingle();
    await supabase.from("attendance_logs").insert({
      attendance_id: savedAtt?.id,
      team_member_id: member.id,
      action: "update",
      actor_id: member.employer_id,
      actor_role: "employer",
      after_data: { status: attStatus, check_in: attStart, check_out: attEnd, actual_hours: actualHours, memo: attNote, work_date: attDate },
    });

    if (attStatus === "absent") {
      const { data: u } = await supabase.from("users").select("trust_score").eq("id", member.worker_id).single();
      const next = Math.max(0, (u?.trust_score || 50) - 20);
      await supabase.from("users").update({ trust_score: next }).eq("id", member.worker_id);
      await supabase.from("trust_score_logs").insert({ user_id: member.worker_id, delta: -20, reason: "결근", category: "attendance" });
    } else if (attStatus === "late") {
      const { data: u } = await supabase.from("users").select("trust_score").eq("id", member.worker_id).single();
      const next = Math.max(0, (u?.trust_score || 50) - 3);
      await supabase.from("users").update({ trust_score: next }).eq("id", member.worker_id);
      await supabase.from("trust_score_logs").insert({ user_id: member.worker_id, delta: -3, reason: "지각(사장님 기록)", category: "attendance" });
    } else if (attStatus === "normal") {
      const { data: u } = await supabase.from("users").select("trust_score").eq("id", member.worker_id).single();
      const next = Math.min(100, (u?.trust_score || 50) + 1);
      await supabase.from("users").update({ trust_score: next }).eq("id", member.worker_id);
      await supabase.from("trust_score_logs").insert({ user_id: member.worker_id, delta: 1, reason: "정상 출근(사장님 확인)", category: "attendance" });
    }

    if (member.match_id) {
      const statusLabel: Record<string, string> = { normal: "출근", late: "지각", early_leave: "조퇴", absent: "결근", off: "휴무" };
      const timeInfo = attStart ? ` ${attStart}~${attEnd || "-"}` : "";
      const hoursInfo = actualHours ? ` (${actualHours}h)` : "";
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: member.match_id,
          senderId: member.employer_id,
          receiverId: member.worker_id,
          message: `📋 ${attDate} 근태가 수정됐어요\n상태: ${statusLabel[attStatus] || attStatus}${timeInfo}${hoursInfo}${attNote ? `\n메모: ${attNote}` : ""}`,
          messageType: "system",
        }),
      });
    }

    await loadAttendance(member.id);
    setAttLogRefreshKey(k => k + 1);
    setShowAttModal(false);
    setAttNote("");
    setSaving(false);
    showToast("근태가 저장됐어요");
  }

  // 달력 데이터
  const monthDays = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const monthAtt = attendance.filter(a => {
    const d = new Date(a.work_date);
    return d.getMonth() === viewMonth && d.getFullYear() === viewYear;
  });

  const getAttStatus = (day: number) => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return monthAtt.find(a => a.work_date === dateStr);
  };

  const thisMonthStats = {
    normal: monthAtt.filter(a => a.status === "normal").length,
    late: monthAtt.filter(a => a.status === "late").length,
    early_leave: monthAtt.filter(a => a.status === "early_leave").length,
    absent: monthAtt.filter(a => a.status === "absent").length,
  };

  const contractHours = member?.work_hours ? parseFloat(member.work_hours) : 8;
  const totalActualHours = monthAtt
    .filter(a => a.status !== "absent" && a.status !== "off")
    .reduce((sum, a) => sum + (a.actual_hours || contractHours), 0);
  const expectedHours = (thisMonthStats.normal + thisMonthStats.late + thisMonthStats.early_leave) * contractHours;
  const overtimeHours = Math.max(0, totalActualHours - expectedHours);
  const wage = member?.wage || 0;
  const regularPay = Math.min(totalActualHours, expectedHours) * wage;
  const overtimePay = overtimeHours * wage * 1.5;
  const estimatedPay = Math.round(regularPay + overtimePay);

  const todayStr = (() => {
    const d = new Date();
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().split("T")[0];
  })();

  const statusEmoji: Record<string, string> = { normal: "✅", late: "⏰", early_leave: "🔜", absent: "❌", off: "📅" };
  const statusShort: Record<string, string> = { normal: "출근", late: "지각", early_leave: "조퇴", absent: "결근", off: "휴무" };

  const workerName = member?.worker?.nickname || (member?.worker?.email ? member.worker.email.split("@")[0] : "팀원");
  const pType = member?.worker?.worker_result?.personalityType;
  const trustScore = member?.worker?.trust_score;
  const trustGrade = trustScore != null ? getTrustGrade(trustScore) : null;

  if (!member) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", maxWidth: 480, margin: "0 auto" }}>
      <AppHeader title="팀원 정보" showBack />
      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>로딩 중...</div>
      {ToastUI}
    </main>
  );

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", paddingBottom: 80 }}>
      <AppHeader title="팀원 정보" showBack />

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "12px 16px 0", display: "flex", flexDirection: "column", gap: 0 }}>

        {/* ── 프로필 헤더 카드 ── */}
        <div style={{ background: "var(--surface)", borderRadius: 18, padding: 0, border: "1px solid var(--border)", overflow: "hidden", marginBottom: 12 }}>
          {/* 그라데이션 상단 */}
          <div style={{ background: "linear-gradient(135deg,#7c3aed 60%,#ec4899)", padding: "18px 18px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.2)", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, border: "2px solid rgba(255,255,255,0.4)" }}>
                {member.worker?.avatar_url
                  ? <img src={member.worker.avatar_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ color: "#fff", fontWeight: 700 }}>{(PERSONALITY_EMOJI[pType] || workerName[0]?.toUpperCase() || "?")}</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <p style={{ fontSize: 17, fontWeight: 800, color: "#fff", margin: 0 }}>{workerName}</p>
                  {trustGrade && <span style={{ fontSize: 11, color: "#fff", opacity: 0.9, fontWeight: 700 }}>{trustGrade.emoji}</span>}
                  <span style={{ fontSize: 11, background: member.status === "active" ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)", color: "#fff", borderRadius: 20, padding: "2px 8px", fontWeight: 600 }}>
                    {member.status === "active" ? "재직중" : "퇴직"}
                  </span>
                </div>
                {pType && <p style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", margin: "0 0 2px" }}>{PERSONALITY_EMOJI[pType]} {pType}</p>}
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", margin: 0 }}>
                  입사일 {member.hire_date || "미설정"}
                </p>
              </div>
            </div>
          </div>

          {/* 근무 조건 3열 */}
          <div style={{ padding: "10px 16px 12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              {[
                { label: "시급", value: member.wage ? `${member.wage.toLocaleString()}원` : "미정" },
                { label: "근무요일", value: member.work_days || "미정" },
                { label: "근무시간", value: member.work_hours ? `${member.work_hours}시간` : "미정" },
              ].map(r => (
                <div key={r.label} style={{ textAlign: "center", background: "var(--surface2)", borderRadius: 10, padding: "8px 4px" }}>
                  <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 2px" }}>{r.label}</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", margin: 0 }}>{r.value}</p>
                </div>
              ))}
            </div>
            <button onClick={() => {
              setEditWage(member.wage ? String(member.wage) : "");
              setEditWorkDays(member.work_days || "");
              setEditWorkHours(member.work_hours ? String(member.work_hours) : "");
              setShowWorkModal(true);
            }}
              style={{ width: "100%", background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "6px", fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
              ✏️ 근무조건 수정
            </button>
          </div>

          {/* 하단 액션 버튼 */}
          <div style={{ display: "flex", borderTop: "1px solid var(--border)" }}>
            <button onClick={() => router.push(`/chat?worker=${member.worker_id}`)}
              style={{ flex: 1, background: "none", border: "none", padding: "11px", fontSize: 13, color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              💬 채팅
            </button>
            <div style={{ width: 1, background: "var(--border)" }} />
            <button onClick={() => router.push(`/payslip?tmId=${member.id}`)}
              style={{ flex: 1, background: "none", border: "none", padding: "11px", fontSize: 13, color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              📋 급여 발행
            </button>
          </div>
        </div>

        {/* ── 기본 정보 아코디언 ── */}
        <div style={{ borderBottom: "1px solid var(--border)" }}>
          <SectionHeader title="기본 정보" open={infoOpen} onToggle={() => setInfoOpen(v => !v)} />
          {infoOpen && (
            <div style={{ paddingBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {/* PAZ 호칭 */}
              <div style={{ background: "var(--surface)", borderRadius: 14, padding: 14, border: "1px solid var(--border)" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>🤖 PAZ 호칭</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 10px" }}>음성으로 PAZ에게 말할 때 쓸 이름이에요</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    defaultValue={member.nickname || ""}
                    id="member-nickname-input"
                    placeholder={`${workerName} (기본값)`}
                    style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px", color: "var(--text)", fontSize: 13, outline: "none" }}
                  />
                  <button onClick={async () => {
                    const val = (document.getElementById("member-nickname-input") as HTMLInputElement)?.value || "";
                    const { error } = await supabase.from("team_members").update({ nickname: val || null }).eq("id", member.id);
                    if (!error) showToast(val ? `"${val}"로 호칭 저장됐어요!` : "호칭이 초기화됐어요");
                  }}
                    style={{ background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", borderRadius: 10, padding: "8px 14px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                    저장
                  </button>
                </div>
              </div>

              {/* 상세 정보 */}
              <div style={{ background: "var(--surface)", borderRadius: 14, border: "1px solid var(--border)", overflow: "hidden" }}>
                {[
                  { label: "이번달 예상 급여", value: estimatedPay > 0 ? `${estimatedPay.toLocaleString()}원` : "-" },
                  { label: "이번달 근무시간", value: totalActualHours > 0 ? `${totalActualHours.toFixed(1)}시간` : "-" },
                  { label: "이번달 출근", value: `${thisMonthStats.normal + thisMonthStats.late}일` },
                ].map((row, i, arr) => (
                  <div key={i} style={{ padding: "11px 14px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{row.label}</span>
                    <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 700 }}>{row.value}</span>
                  </div>
                ))}
              </div>

              {/* 성향 */}
              {member.worker?.worker_result && (
                <div style={{ background: "var(--surface)", borderRadius: 14, padding: 14, border: "1px solid var(--border)" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", margin: "0 0 8px" }}>성향 분석</p>
                  <p style={{ fontSize: 13, color: "#7c3aed", fontWeight: 600, margin: "0 0 4px" }}>{PERSONALITY_EMOJI[pType]} {pType}</p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
                    {member.worker.worker_result.description?.slice(0, 120)}...
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 근태 관리 (항상 펼쳐짐) ── */}
        <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 20 }}>
          <div style={{ padding: "14px 0 12px" }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", margin: 0 }}>근태 관리</p>
          </div>

          {/* 월 선택 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <button onClick={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); }}
              style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)", padding: "0 8px" }}>‹</button>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{viewYear}년 {viewMonth + 1}월</span>
            <button onClick={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); }}
              disabled={`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}` >= todayStr.slice(0, 7)}
              style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)", padding: "0 8px", opacity: `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}` >= todayStr.slice(0, 7) ? 0.3 : 1 }}>›</button>
          </div>

          {/* 통계 4열 */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[
              { label: "출근", value: thisMonthStats.normal, color: "#10b981" },
              { label: "지각", value: thisMonthStats.late, color: "#f59e0b" },
              { label: "조퇴", value: thisMonthStats.early_leave, color: "#f59e0b" },
              { label: "결근", value: thisMonthStats.absent, color: "#ef4444" },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, background: "var(--surface)", borderRadius: 10, padding: "9px 4px", textAlign: "center", border: "1px solid var(--border)" }}>
                <p style={{ fontSize: 17, fontWeight: 700, color: s.color, margin: "0 0 2px" }}>{s.value}</p>
                <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* 급여 요약 카드 */}
          <div style={{ background: "linear-gradient(135deg,#7c3aed15,#ec489915)", borderRadius: 12, padding: "12px 14px", marginBottom: 12, border: "1px solid #7c3aed30" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: overtimeHours > 0 ? 6 : 0 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>총 근무시간</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{totalActualHours.toFixed(1)}시간</span>
            </div>
            {overtimeHours > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "#f59e0b" }}>초과근무 (×1.5)</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>{overtimeHours.toFixed(1)}시간</span>
              </div>
            )}
            <div style={{ borderTop: "1px solid #7c3aed30", paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>이번달 예상 급여</span>
              <span style={{ fontSize: 15, fontWeight: 900, color: "#7c3aed" }}>{estimatedPay > 0 ? estimatedPay.toLocaleString() + "원" : "-"}</span>
            </div>
          </div>

          {/* 달력 */}
          <div style={{ background: "var(--surface)", borderRadius: 14, padding: 10, border: "1px solid var(--border)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
              {["일", "월", "화", "수", "목", "금", "토"].map(d => (
                <div key={d} style={{ textAlign: "center", fontSize: 10, color: "var(--text-muted)", padding: "3px 0" }}>{d}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
              {Array(firstDay).fill(null).map((_, i) => <div key={`e${i}`} />)}
              {Array(monthDays).fill(null).map((_, i) => {
                const day = i + 1;
                const att = getAttStatus(day);
                const status = ATTENDANCE_STATUS.find(s => s.id === att?.status);
                const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isToday = dateStr === todayStr;
                const isFuture = dateStr > todayStr;
                const dayOfWeek = new Date(viewYear, viewMonth, day).getDay();
                const isSunday = dayOfWeek === 0;
                const isSaturday = dayOfWeek === 6;
                return (
                  <div key={day}
                    onClick={() => {
                      if (isFuture) return;
                      setAttDate(dateStr);
                      setAttStatus(att?.status || "normal");
                      setAttNote(att?.memo || "");
                      setAttStart(att?.check_in ? new Date(att.check_in).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "");
                      setAttEnd(att?.check_out ? new Date(att.check_out).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "");
                      setShowAttModal(true);
                    }}
                    style={{
                      borderRadius: 7, cursor: isFuture ? "default" : "pointer", overflow: "hidden",
                      background: isFuture ? "none" : status ? status.bg : isToday ? "#7c3aed20" : "var(--surface2)",
                      border: isFuture ? "none" : isToday ? "1.5px solid #7c3aed" : att ? `1px solid ${status?.color}40` : "1px solid transparent",
                      opacity: isFuture ? 0.3 : 1,
                      padding: "3px 2px 2px",
                    }}>
                    <div style={{ textAlign: "center", fontSize: 10, fontWeight: isToday ? 700 : 500, color: isToday ? "#7c3aed" : isSunday ? "#ef4444" : isSaturday ? "#3b82f6" : "var(--text)" }}>{day}</div>
                    {att ? (
                      <div style={{ textAlign: "center", fontSize: 8, color: status?.color, lineHeight: 1.3 }}>
                        {statusEmoji[att.status]}<br />{statusShort[att.status]}
                        {att.actual_hours && att.status !== "absent" && att.status !== "off" && <><br /><span style={{ fontSize: 7 }}>{att.actual_hours}h</span></>}
                        {att.memo && <><br /><span style={{ fontSize: 7, color: "#a78bfa" }}>📝</span></>}
                      </div>
                    ) : <div style={{ height: 22 }} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 근태 수정 이력 */}
          <AttendanceLogs memberId={member.id} refreshKey={attLogRefreshKey} />
        </div>

        {/* ── 급여 명세서 아코디언 ── */}
        <div style={{ borderBottom: "1px solid var(--border)" }}>
          <SectionHeader
            title="급여 명세서"
            open={payslipOpen}
            onToggle={() => setPayslipOpen(v => !v)}
            badge={payslips.length > 0 ? `${payslips.length}건` : undefined}
          />
          {payslipOpen && (
            <div style={{ paddingBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={contracts.length === 0 ? undefined : () => router.push(`/payslip?tmId=${member.id}`)}
                style={{ width: "100%", background: contracts.length === 0 ? "var(--surface2)" : "linear-gradient(135deg,#7c3aed,#ec4899)", border: contracts.length === 0 ? "1px solid var(--border)" : "none", borderRadius: 12, padding: 13, color: contracts.length === 0 ? "var(--text-muted)" : "#fff", fontSize: 14, fontWeight: 700, cursor: contracts.length === 0 ? "default" : "pointer" }}>
                {contracts.length === 0 ? "🔒 급여 명세서 발행 (계약서 작성 후 가능)" : "📋 이번달 급여 명세서 발행"}
              </button>
              {contracts.length === 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f59e0b10", border: "1px solid #f59e0b30", borderRadius: 10, padding: "10px 12px" }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
                  <p style={{ fontSize: 12, color: "#f59e0b", margin: 0, lineHeight: 1.5 }}>
                    계약서를 먼저 작성해야 정확한 급여 계산과 명세서 발행이 가능해요. 아래 <b>계약서</b> 탭에서 바로 작성할 수 있어요.
                  </p>
                </div>
              )}
              {payslipsLoading ? (
                <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>로딩 중...</p>
              ) : payslips.length === 0 ? (
                <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "12px 0" }}>발행된 명세서가 없어요</p>
              ) : payslips.map(p => (
                <div key={p.id} style={{ background: "var(--surface)", borderRadius: 12, padding: 13, border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{p.year}년 {p.month}월</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <span style={{ fontSize: 11, background: "#10b98120", color: "#10b981", borderRadius: 6, padding: "2px 8px" }}>✅ 발행됨</span>
                      {p.confirmed_at && <span style={{ fontSize: 11, background: "#60a5fa20", color: "#60a5fa", borderRadius: 6, padding: "2px 8px" }}>👁 확인됨</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                    <div><p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 2px" }}>근무일수</p><p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{p.work_days}일</p></div>
                    <div><p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 2px" }}>총 근무시간</p><p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{p.total_hours}h</p></div>
                    <div><p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 2px" }}>지급액</p><p style={{ fontSize: 14, fontWeight: 700, color: "#7c3aed", margin: 0 }}>{Number(p.total_pay).toLocaleString()}원</p></div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => router.push(`/payslip?id=${p.id}`)}
                      style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px", fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>📄 보기</button>
                    <button onClick={() => router.push(`/payslip?id=${p.id}`)}
                      style={{ flex: 1, background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", borderRadius: 8, padding: "8px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>✏️ 재발행</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 계약서 아코디언 ── */}
        <div style={{ borderBottom: "1px solid var(--border)" }}>
          <SectionHeader
            title="계약서"
            open={contractOpen}
            onToggle={() => setContractOpen(v => !v)}
            badge={contracts.length > 0 ? (contracts[0]?.worker_signed ? "✅ 서명완료" : "⏳ 서명대기") : undefined}
          />
          {contractOpen && (
            <div style={{ paddingBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {contracts.length === 0 ? (
                <div style={{ background: "var(--surface2)", borderRadius: 14, padding: "18px 16px", border: "1px solid var(--border)", marginBottom: 4 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 8px" }}>아직 계약서가 없어요</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[
                      { emoji: "⚖️", text: "근로기준법상 근로계약서 미교부 시 500만원 이하 벌금" },
                      { emoji: "💰", text: "계약서 기반으로 급여 명세서 자동 발행 가능" },
                      { emoji: "📅", text: "근무요일·시간이 확정돼야 출근 캘린더 자동 표시" },
                      { emoji: "🔒", text: "분쟁 발생 시 계약서가 유일한 법적 근거" },
                    ].map(({ emoji, text }) => (
                      <div key={text} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 13, flexShrink: 0 }}>{emoji}</span>
                        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>{text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                contracts.map((c, i) => {
                  const isLatest = i === 0 && c.status !== "superseded";
                  const isSuperseded = c.status === "superseded";
                  const isSigned = c.worker_signed;
                  const isPending = c.status === "pending" && !isSigned;
                  return (
                    <div key={c.id} style={{ background: "var(--surface)", borderRadius: 12, padding: 13, border: `1px solid ${isLatest ? "#7c3aed40" : "var(--border)"}`, opacity: isSuperseded ? 0.6 : 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                            {isSuperseded ? "📋 대체된 계약" : isLatest ? "📄 현재 계약" : "📋 이전 계약"}
                          </span>
                          {isSigned && !isSuperseded && <span style={{ fontSize: 10, background: "#10b98120", color: "#10b981", borderRadius: 6, padding: "1px 6px" }}>🎉 정상계약 완료</span>}
                          {isPending && <span style={{ fontSize: 10, background: "#f59e0b20", color: "#f59e0b", borderRadius: 6, padding: "1px 6px" }}>⏳ 서명대기</span>}
                          {isSuperseded && <span style={{ fontSize: 10, background: "var(--surface2)", color: "var(--text-muted)", borderRadius: 6, padding: "1px 6px" }}>🔒 대체됨</span>}
                        </div>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(c.created_at).toLocaleDateString("ko-KR")}</span>
                      </div>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px" }}>
                        {c.start_date || "-"} ~ {c.end_date || "기간 미정"}
                        {c.contract_data?.contractType && (
                          <span style={{ marginLeft: 8, fontSize: 11, background: "var(--surface2)", borderRadius: 6, padding: "1px 6px" }}>
                            {c.contract_data.contractType === "parttime" ? "단시간" : c.contract_data.contractType === "minor" ? "연소근로자" : "표준"}
                          </span>
                        )}
                      </p>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => router.push(`/contract/view?matchId=${c.match_id}`)}
                          style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px", fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
                          📄 보기
                        </button>
                        {isLatest && !isSuperseded && (
                          <button onClick={() => router.push(`/contract?matchId=${c.match_id}&mode=update`)}
                            style={{ flex: 1, background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", borderRadius: 8, padding: "8px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                            ✏️ 수정
                          </button>
                        )}
                        {(!isLatest || isSuperseded) && (
                          <span style={{ flex: 1, textAlign: "center", fontSize: 11, color: "var(--text-muted)", padding: "8px", alignSelf: "center" }}>🔒 이력 보존</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <button onClick={async () => {
                if (member.match_id) {
                  router.push(`/contract?matchId=${member.match_id}`);
                } else {
                  const { data: newMatch, error } = await supabase.from("matches").insert({
                    employer_id: member.employer_id,
                    worker_id: member.worker_id,
                    progress_status: "hired",
                    hire_confirmed_by_employer: true,
                    hire_confirmed_by_worker: true,
                    match_score: 0,
                  }).select("id").single();
                  if (error || !newMatch) { showToast("오류: " + error?.message, "error"); return; }
                  await supabase.from("team_members").update({ match_id: newMatch.id }).eq("id", member.id);
                  router.push(`/contract?matchId=${newMatch.id}`);
                }
              }}
                style={{ width: "100%", background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", borderRadius: 12, padding: 13, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                + 새 계약서 작성
              </button>
            </div>
          )}
        </div>

        {/* ── 퇴직 처리 ── */}
        <div style={{ paddingTop: 20 }}>
          <button onClick={() => setShowResignModal(true)}
            style={{ width: "100%", background: "none", border: "1px solid #ef444430", borderRadius: 12, padding: "12px", color: "#ef4444", fontSize: 13, cursor: "pointer" }}>
            🚪 퇴직 처리
          </button>
        </div>

      </div>

      {/* ── 근태 입력 모달 ── */}
      {showAttModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: "var(--surface)", borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--text)" }}>근태 입력</h3>
              <div style={{ display: "flex", gap: 6 }}>
                {getAttStatus(parseInt(attDate.split("-")[2])) ? (
                  <>
                    <span style={{ fontSize: 11, background: "#f59e0b20", color: "#f59e0b", borderRadius: 6, padding: "3px 8px" }}>✏️ 수정</span>
                    <button onClick={async () => {
                      if (!confirm("이 날의 근태 기록을 삭제할까요?")) return;
                      const existing = getAttStatus(parseInt(attDate.split("-")[2]));
                      if (existing?.id) {
                        await supabase.from("attendance_logs").insert({
                          attendance_id: existing.id,
                          team_member_id: member.id,
                          action: "delete",
                          actor_id: member.employer_id,
                          actor_role: "employer",
                          before_data: { status: existing.status, work_date: existing.work_date, check_in: existing.check_in, check_out: existing.check_out },
                        });
                        await supabase.from("attendance").delete().eq("id", existing.id);
                        await loadAttendance(member.id);
                        setAttLogRefreshKey(k => k + 1);
                      }
                      setShowAttModal(false);
                    }}
                      style={{ fontSize: 11, background: "#ef444420", color: "#ef4444", border: "none", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>
                      🗑️ 삭제
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: 11, background: "#7c3aed20", color: "#7c3aed", borderRadius: 6, padding: "3px 8px" }}>➕ 새 입력</span>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 6px" }}>날짜</p>
              <input type="date" value={attDate} max={new Date().toISOString().split("T")[0]}
                onChange={e => { const today = new Date().toISOString().split("T")[0]; if (e.target.value > today) return; setAttDate(e.target.value); }}
                style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", color: "var(--text)", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 6px" }}>상태</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ATTENDANCE_STATUS.map(s => (
                  <button key={s.id} onClick={() => setAttStatus(s.id)}
                    style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${attStatus === s.id ? s.color : "var(--border)"}`, background: attStatus === s.id ? s.bg : "none", color: attStatus === s.id ? s.color : "var(--text-muted)", fontSize: 13, fontWeight: attStatus === s.id ? 700 : 400, cursor: "pointer" }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {!["absent", "off"].includes(attStatus) && (() => {
              const timeOptions = Array.from({ length: 48 }, (_, i) => {
                const h = Math.floor(i / 2);
                const m = i % 2 === 0 ? "00" : "30";
                return `${String(h).padStart(2, "0")}:${m}`;
              });
              const selectStyle = { flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", color: "var(--text)", fontSize: 14, outline: "none", cursor: "pointer", appearance: "none" as const };
              return (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 8px" }}>근무 시간</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <select value={attStart} onChange={e => setAttStart(e.target.value)} style={selectStyle}>
                      <option value="">시작</option>
                      {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>~</span>
                    <select value={attEnd} onChange={e => setAttEnd(e.target.value)} style={selectStyle}>
                      <option value="">종료</option>
                      {timeOptions.filter(t => !attStart || t > attStart).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  {attStart && attEnd && (() => {
                    const [sh, sm] = attStart.split(":").map(Number);
                    const [eh, em] = attEnd.split(":").map(Number);
                    const mins = (eh * 60 + em) - (sh * 60 + sm);
                    if (mins <= 0) return null;
                    const hours = Math.round(mins / 60 * 10) / 10;
                    const overtime = Math.max(0, hours - (contractHours || 0));
                    return (
                      <div style={{ marginTop: 8, background: "var(--surface2)", borderRadius: 10, padding: "8px 12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>실제 근무시간</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{hours}시간</span>
                        </div>
                        {overtime > 0 && (
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                            <span style={{ fontSize: 12, color: "#f59e0b" }}>초과근무 (×1.5)</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b" }}>{overtime.toFixed(1)}시간</span>
                          </div>
                        )}
                        {member?.wage && (
                          <div style={{ borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>오늘 예상 급여</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#7c3aed" }}>
                              {Math.round((Math.min(hours, contractHours || hours) * member.wage) + (overtime * member.wage * 1.5)).toLocaleString()}원
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 6px" }}>메모 <span style={{ fontWeight: 400 }}>(선택)</span></p>
              <textarea value={attNote} onChange={e => setAttNote(e.target.value)}
                placeholder="예) 30분 지각, 조퇴 사유 등" rows={2}
                style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", color: "var(--text)", fontSize: 13, outline: "none", boxSizing: "border-box" as const, resize: "none", lineHeight: 1.6 }} />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowAttModal(false)}
                style={{ flex: 1, background: "var(--surface2)", border: "none", borderRadius: 12, padding: 14, color: "var(--text-muted)", fontSize: 14, cursor: "pointer" }}>취소</button>
              <button onClick={saveAttendance} disabled={saving}
                style={{ flex: 1, background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", borderRadius: 12, padding: 14, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 근무조건 수정 모달 ── */}
      {showWorkModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: "var(--surface)", borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 20px", color: "var(--text)" }}>근무조건 수정</h3>

            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 6px" }}>시급 (원)</p>
              <input
                type="number"
                value={editWage}
                onChange={e => setEditWage(e.target.value)}
                placeholder="예) 10030"
                style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", color: "var(--text)", fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 6px" }}>근무요일</p>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {["월", "화", "수", "목", "금", "토", "일"].map(d => {
                  const selected = editWorkDays.includes(d);
                  return (
                    <button key={d} onClick={() => {
                      if (selected) {
                        setEditWorkDays(prev => prev.split("·").filter(x => x !== d).join("·"));
                      } else {
                        const order = ["월", "화", "수", "목", "금", "토", "일"];
                        const current = editWorkDays ? editWorkDays.split("·") : [];
                        const next = [...current, d].sort((a, b) => order.indexOf(a) - order.indexOf(b));
                        setEditWorkDays(next.join("·"));
                      }
                    }}
                      style={{ flex: 1, padding: "8px 2px", borderRadius: 8, border: `1.5px solid ${selected ? "#7c3aed" : "var(--border)"}`, background: selected ? "#7c3aed20" : "none", color: selected ? "#7c3aed" : "var(--text-muted)", fontSize: 13, fontWeight: selected ? 700 : 400, cursor: "pointer" }}>
                      {d}
                    </button>
                  );
                })}
              </div>
              <input
                value={editWorkDays}
                onChange={e => setEditWorkDays(e.target.value)}
                placeholder="직접 입력 (예: 월·화·수·목·금)"
                style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", color: "var(--text)", fontSize: 13, outline: "none", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 6px" }}>하루 근무시간 (시간)</p>
              <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                {["4", "5", "6", "7", "8"].map(h => (
                  <button key={h} onClick={() => setEditWorkHours(h)}
                    style={{ padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${editWorkHours === h ? "#7c3aed" : "var(--border)"}`, background: editWorkHours === h ? "#7c3aed20" : "none", color: editWorkHours === h ? "#7c3aed" : "var(--text-muted)", fontSize: 13, fontWeight: editWorkHours === h ? 700 : 400, cursor: "pointer" }}>
                    {h}시간
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={editWorkHours}
                onChange={e => setEditWorkHours(e.target.value)}
                placeholder="직접 입력"
                style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", color: "var(--text)", fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowWorkModal(false)}
                style={{ flex: 1, background: "var(--surface2)", border: "none", borderRadius: 12, padding: 14, color: "var(--text-muted)", fontSize: 14, cursor: "pointer" }}>취소</button>
              <button onClick={saveWorkCondition} disabled={workSaving}
                style={{ flex: 1, background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", borderRadius: 12, padding: 14, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                {workSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {ToastUI}

      {/* ── 퇴직 확인 모달 ── */}
      {showResignModal && member && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "var(--surface)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 360 }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🚪</div>
              <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: "0 0 6px" }}>퇴직 처리</p>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
                <span style={{ fontWeight: 700, color: "#ef4444" }}>{workerName}</span>님을 퇴직 처리할까요?
              </p>
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.6 }}>
                근태·계약서 이력은 보존되며<br />팀원 목록에서 제외돼요
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowResignModal(false)}
                style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, fontSize: 14, color: "var(--text-muted)", cursor: "pointer" }}>
                취소
              </button>
              <button onClick={async () => {
                await supabase.from("team_members").update({ status: "resigned" }).eq("id", member.id);
                setShowResignModal(false);
                showToast("퇴직 처리됐어요", "success");
                setTimeout(() => router.back(), 1000);
              }}
                style={{ flex: 1, background: "#ef4444", border: "none", borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                퇴직 처리
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
