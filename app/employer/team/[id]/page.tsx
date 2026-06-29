"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useToast } from "@/lib/useToast";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";

// 근태 수정 이력 타임라인
function AttendanceLogs({ memberId, refreshKey = 0 }: { memberId: string; refreshKey?: number }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    supabase.from("attendance_logs")
      .select("*, users!attendance_logs_actor_id_fkey(nickname, avatar_url)")
      .eq("team_member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => { setLogs(data || []); setLoading(false); });
  }, [memberId, refreshKey]);

  const actionLabel: Record<string, string> = {
    checkin: "🟢 출근 기록",
    checkout: "🔴 퇴근 기록",
    update: "✏️ 근태 수정",
    delete: "🗑️ 근태 삭제",
  };

  const roleLabel: Record<string, string> = {
    employer: "사장님",
    worker: "알바생",
  };

  const visibleLogs = expanded ? logs : logs.slice(0, 5);

  if (loading) return null;
  if (logs.length === 0) return null;

  return (
    <div style={{ marginTop: 4 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", margin: "0 0 10px" }}>근태 수정 이력</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visibleLogs.map((log, i) => {
          const d = log.after_data || log.before_data || {};
          const actor = log.users;
          const name = actor?.nickname || roleLabel[log.actor_role] || "알 수 없음";
          const date = log.after_data?.work_date || log.before_data?.work_date || "";
          const time = new Date(log.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

          return (
            <div key={log.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              {/* 타임라인 선 */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: log.action === "delete" ? "#ef4444" : log.action === "update" ? "#f59e0b" : "#10b981", marginTop: 4 }} />
                {i < visibleLogs.length - 1 && <div style={{ width: 1, flex: 1, background: "var(--border)", minHeight: 20, marginTop: 2 }} />}
              </div>
              {/* 내용 */}
              <div style={{ flex: 1, background: "var(--surface2)", borderRadius: 10, padding: "8px 10px", marginBottom: 2 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)" }}>{actionLabel[log.action] || log.action}</span>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{time}</span>
                </div>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 2px" }}>
                  {name} · {date}
                </p>
                {d.status && <span style={{ fontSize: 10, background: "var(--surface)", borderRadius: 5, padding: "1px 6px", color: "var(--text-muted)" }}>
                  {({ normal:"출근", late:"지각", early_leave:"조퇴", absent:"결근", off:"휴무" } as any)[d.status] || d.status}
                  {d.check_in ? ` ${d.check_in}` : ""}
                  {d.check_out ? `~${d.check_out}` : ""}
                  {d.actual_hours ? ` (${d.actual_hours}h)` : ""}
                </span>}
                {d.memo && (
                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0", background: "var(--surface)", borderRadius: 6, padding: "4px 8px", lineHeight: 1.5 }}>
                    📝 {d.memo}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {logs.length > 5 && (
        <button onClick={() => setExpanded(!expanded)}
          style={{ width: "100%", background: "none", border: "1px solid var(--border)", borderRadius: 10, padding: "8px", fontSize: 12, color: "var(--text-muted)", cursor: "pointer", marginTop: 8 }}>
          {expanded ? "접기 ↑" : `더보기 (${logs.length - 5}개) ↓`}
        </button>
      )}
    </div>
  );
}

// 급여 탭 인라인 컴포넌트
function PayslipTab({ memberId, employerId, workerId, router }: { memberId:string; employerId:string; workerId:string; router:any }) {
  const [payslips, setPayslips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("payslips")
      .select("*")
      .eq("team_member_id", memberId)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .then(({ data }) => { setPayslips(data || []); setLoading(false); });
  }, [memberId]);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <button onClick={() => router.push(`/payslip?tmId=${memberId}`)}
        style={{ width:"100%", background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", borderRadius:14, padding:14, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
        📋 이번달 급여 명세서 발행
      </button>

      {loading ? (
        <p style={{ textAlign:"center", color:"var(--text-muted)", fontSize:13 }}>로딩 중...</p>
      ) : payslips.length === 0 ? (
        <div style={{ textAlign:"center", padding:"24px 0" }}>
          <p style={{ fontSize:13, color:"var(--text-muted)" }}>발행된 명세서가 없어요</p>
        </div>
      ) : payslips.map(p => (
        <div key={p.id} style={{ background:"var(--surface)", borderRadius:14, padding:14, border:"1px solid var(--border)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <span style={{ fontSize:14, fontWeight:700, color:"var(--text)" }}>{p.year}년 {p.month}월</span>
            <span style={{ fontSize:11, background:"#10b98120", color:"#10b981", borderRadius:6, padding:"2px 8px" }}>✅ 발행됨</span>
                {p.confirmed_at && <span style={{ fontSize:11, background:"#60a5fa20", color:"#60a5fa", borderRadius:6, padding:"2px 8px" }}>👁 확인됨</span>}
          </div>
          <div style={{ display:"flex", gap:12, marginBottom:10 }}>
            <div><p style={{ fontSize:10, color:"var(--text-muted)", margin:"0 0 2px" }}>근무일수</p><p style={{ fontSize:13, fontWeight:600, margin:0 }}>{p.work_days}일</p></div>
            <div><p style={{ fontSize:10, color:"var(--text-muted)", margin:"0 0 2px" }}>총 근무시간</p><p style={{ fontSize:13, fontWeight:600, margin:0 }}>{p.total_hours}h</p></div>
            <div><p style={{ fontSize:10, color:"var(--text-muted)", margin:"0 0 2px" }}>지급액</p><p style={{ fontSize:14, fontWeight:700, color:"#7c3aed", margin:0 }}>{Number(p.total_pay).toLocaleString()}원</p></div>
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <button onClick={() => router.push(`/payslip?id=${p.id}`)}
              style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"8px", fontSize:12, color:"var(--text-muted)", cursor:"pointer" }}>📄 보기</button>
            <button onClick={() => router.push(`/payslip?id=${p.id}`)}
              style={{ flex:1, background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", borderRadius:8, padding:"8px", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer" }}>✏️ 재발행</button>
          </div>
        </div>
      ))}
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

export default function TeamMemberPage() {
  const router = useRouter();
  const params = useParams();
  const memberId = params?.id as string;
  const { showToast, ToastUI } = useToast();

  const [member, setMember] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [tab, setTab] = useState<"info" | "attendance" | "payslip" | "contract">("info");
  const [showAttModal, setShowAttModal] = useState(false);
  const [showResignModal, setShowResignModal] = useState(false);
  const [attDate, setAttDate] = useState(new Date().toISOString().split("T")[0]);
  const [attStatus, setAttStatus] = useState("normal");
  const [attNote, setAttNote] = useState("");
  const [attStart, setAttStart] = useState<string>("");
  const [attEnd, setAttEnd] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [attLogRefreshKey, setAttLogRefreshKey] = useState(0);

  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(now.getFullYear());

  useEffect(() => {
    if (memberId) loadMember();
  }, [memberId]);

  // Realtime 출퇴근 구독
  useEffect(() => {
    if (!memberId) return;

    const channel = supabase
      .channel(`attendance:${memberId}`)
      .on("postgres_changes", {
        event: "*", // INSERT, UPDATE, DELETE 모두
        schema: "public",
        table: "attendance",
        filter: `team_member_id=eq.${memberId}`,
      }, () => {
        // 변경 감지 시 근태 데이터 자동 갱신
        loadAttendance(memberId);
        setAttLogRefreshKey(k => k + 1);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [memberId]);

  async function loadMember() {
    const { data } = await supabase.from("team_members")
      .select(`*, users!team_members_worker_id_fkey (nickname, avatar_url, worker_result, phone, email)`)
      .eq("id", memberId).single();
    if (data) {
      // contracts에서 실제 합의 조건 가져오기
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
          if (cd?.wage) wage = parseInt(String(cd.wage).replace(/,/g,""));
          else if (contract.wage) wage = contract.wage;

          if (cd) {
            if (cd.workDaysMode === "text" && cd.workDaysText) work_days = cd.workDaysText;
            else {
              const days = ["월","화","수","목","금","토","일"]
                .filter((_,i) => (cd as any)[`workDays${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]}`])
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
      loadContracts(data.employer_id, data.worker_id);
    }
  }

  async function loadAttendance(tmId: string) {
    const { data } = await supabase.from("attendance")
      .select("*").eq("team_member_id", tmId)
      .order("work_date", { ascending: false }).limit(60);
    setAttendance(data || []);
  }

  async function loadContracts(empId: string, wrkId: string) {
    const { data } = await supabase.from("contracts")
      .select("id, match_id, start_date, end_date, created_at, contract_data, worker_signed, employer_signed, status")
      .eq("employer_id", empId).eq("worker_id", wrkId)
      .order("created_at", { ascending: false });
    setContracts(data || []);
  }

  async function saveAttendance() {
    if (!member) return;
    setSaving(true);
    const actualHours = (() => {
      if (["absent","off"].includes(attStatus)) return 0;
      if (attStart && attEnd) {
        const [sh,sm] = attStart.split(":").map(Number);
        const [eh,em] = attEnd.split(":").map(Number);
        const mins = (eh*60+em) - (sh*60+sm);
        return mins > 0 ? Math.round(mins/60*10)/10 : null;
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
      check_in: ["absent","off"].includes(attStatus) ? null : (attStart ? `${attDate}T${attStart}:00+09:00` : null),
      check_out: ["absent","off"].includes(attStatus) ? null : (attEnd ? `${attDate}T${attEnd}:00+09:00` : null),
      actual_hours: actualHours,
    }, { onConflict: "team_member_id,work_date" });

    if (error) {
      showToast("저장 오류: " + error.message, "error");
      setSaving(false);
      return;
    }

    // 근태 로그 기록
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

    // trust_score 연동
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

    // trust_score 연동
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

    // 알바생에게 채팅 알림
    if (member.match_id) {
      const statusLabel: Record<string,string> = { normal:"출근", late:"지각", early_leave:"조퇴", absent:"결근", off:"휴무" };
      const timeInfo = attStart ? ` ${attStart}~${attEnd||"-"}` : "";
      const hoursInfo = actualHours ? ` (${actualHours}h)` : "";
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: member.match_id,
          senderId: member.employer_id,
          receiverId: member.worker_id,
          message: `📋 ${attDate} 근태가 수정됐어요\n상태: ${statusLabel[attStatus]||attStatus}${timeInfo}${hoursInfo}${attNote ? `\n메모: ${attNote}` : ""}`,
          messageType: "system",
        }),
      });
    }

    await loadAttendance(member.id);
    setAttLogRefreshKey(k => k + 1);
    setShowAttModal(false);
    setAttNote("");
    setSaving(false);
  }

  // 달력 데이터
  const monthDays = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const monthAtt = attendance.filter(a => {
    const d = new Date(a.work_date);
    return d.getMonth() === viewMonth && d.getFullYear() === viewYear;
  });

  const getAttStatus = (day: number) => {
    const dateStr = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    return monthAtt.find(a => a.work_date === dateStr);
  };

  const thisMonthStats = {
    normal: monthAtt.filter(a => a.status === "normal").length,
    late: monthAtt.filter(a => a.status === "late").length,
    early_leave: monthAtt.filter(a => a.status === "early_leave").length,
    absent: monthAtt.filter(a => a.status === "absent").length,
  };

  // 실제 근무시간 합계
  const contractHours = member?.work_hours ? parseFloat(member.work_hours) : 8;
  const totalActualHours = monthAtt
    .filter(a => a.status !== "absent" && a.status !== "off")
    .reduce((sum, a) => sum + (a.actual_hours || contractHours), 0);

  // 초과근무 시간
  const expectedHours = (thisMonthStats.normal + thisMonthStats.late + thisMonthStats.early_leave) * contractHours;
  const overtimeHours = Math.max(0, totalActualHours - expectedHours);

  // 예상 급여 (초과분 1.5배)
  const wage = member?.wage || 0;
  const regularPay = Math.min(totalActualHours, expectedHours) * wage;
  const overtimePay = overtimeHours * wage * 1.5;
  const estimatedPay = Math.round(regularPay + overtimePay);

  if (!member) return (
    <main style={{ minHeight:"100vh", background:"var(--bg)", maxWidth:480, margin:"0 auto" }}>
      <AppHeader title="팀원 정보" showBack />
      <div style={{ textAlign:"center", padding:"60px 0", color:"var(--text-muted)" }}>로딩 중...</div>
      {ToastUI}
    </main>
  );

  return (
    <main style={{ minHeight:"100vh", background:"var(--bg)", maxWidth:480, margin:"0 auto", paddingBottom:40 }}>
      <AppHeader title="팀원 정보" showBack />

      {/* 프로필 카드 */}
      <div style={{ padding:"16px 16px 0" }}>
        <div style={{ background:"var(--surface)", borderRadius:16, padding:16, border:"1px solid var(--border)", display:"flex", gap:14, alignItems:"center", marginBottom:16 }}>
          <div style={{ width:60, height:60, borderRadius:"50%", background:"linear-gradient(135deg,#7c3aed,#ec4899)", overflow:"hidden", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26 }}>
            {member.worker?.avatar_url
              ? <img src={member.worker.avatar_url} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              : <span style={{ color:"#fff", fontWeight:700, fontSize:22 }}>{(member.worker?.nickname || member.worker?.email || "?")[0].toUpperCase()}</span>
            }
          </div>
          <div style={{ flex:1 }}>
            <p style={{ fontSize:17, fontWeight:700, color:"var(--text)", margin:"0 0 3px" }}>{member.worker?.nickname || member.worker?.name || (member.worker?.email ? member.worker.email.split("@")[0] : "팀원")}</p>
            <p style={{ fontSize:12, color:"var(--text-muted)", margin:"0 0 6px" }}>
              입사일 {member.hire_date} · {member.work_days || "요일 미정"}
            </p>
            <div style={{ display:"flex", gap:6 }}>
              <span style={{ fontSize:11, background:"#7c3aed20", color:"#7c3aed", borderRadius:6, padding:"2px 8px" }}>
                시급 {member.wage?.toLocaleString() || "미정"}원
              </span>
              <span style={{ fontSize:11, background:"#10b98120", color:"#10b981", borderRadius:6, padding:"2px 8px" }}>
                {member.status === "active" ? "재직중" : "퇴직"}
              </span>
            </div>
          </div>
          <button onClick={() => router.push(`/chat?worker=${member.worker_id}`)}
            style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"8px 12px", fontSize:13, color:"var(--text-muted)", cursor:"pointer" }}>
            💬
          </button>
        </div>

        {/* 탭 */}
        <div style={{ display:"flex", background:"var(--surface2)", borderRadius:12, padding:3, marginBottom:16, gap:2 }}>
          {(["info", "attendance", "payslip", "contract"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex:1, background:tab===t ? "var(--surface)" : "none", border:"none", borderRadius:10, padding:"8px 2px", fontSize:11, fontWeight:tab===t ? 700 : 400, color:tab===t ? "var(--text)" : "var(--text-muted)", cursor:"pointer", transition:"all 0.15s" }}>
              {t === "info" ? "정보" : t === "attendance" ? "근태" : t === "payslip" ? "급여" : "계약서"}
            </button>
          ))}
        </div>

        {/* 기본 정보 탭 */}
        {tab === "info" && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

            {/* PAZ 호칭 설정 */}
            <div style={{ background:"var(--surface)", borderRadius:16, padding:16, border:"1px solid var(--border)" }}>
              <p style={{ fontSize:13, fontWeight:700, color:"var(--text)", margin:"0 0 4px" }}>🤖 PAZ 호칭</p>
              <p style={{ fontSize:11, color:"var(--text-muted)", margin:"0 0 10px" }}>
                음성으로 PAZ에게 말할 때 쓸 이름이에요 (예: 재훈이, 수진)
              </p>
              <div style={{ display:"flex", gap:8 }}>
                <input
                  defaultValue={member.nickname || ""}
                  id="member-nickname-input"
                  placeholder={`${member.worker?.nickname || "팀원"} (기본값)`}
                  style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"8px 12px", color:"var(--text)", fontSize:13, outline:"none" }}
                />
                <button onClick={async () => {
                  const val = (document.getElementById("member-nickname-input") as HTMLInputElement)?.value || "";
                  const { error } = await supabase.from("team_members")
                    .update({ nickname: val || null }).eq("id", member.id);
                  if (!error) showToast(val ? `"${val}"로 호칭 저장됐어요!` : "호칭이 초기화됐어요");
                }}
                  style={{ background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", borderRadius:10, padding:"8px 14px", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", flexShrink:0 }}>
                  저장
                </button>
              </div>
            </div>

            <div style={{ background:"var(--surface)", borderRadius:16, border:"1px solid var(--border)", overflow:"hidden" }}>
              {[
                { label:"근무 요일", value: member.work_days || "미정" },
                { label:"근무 시간", value: member.work_hours ? `${member.work_hours}시간/일` : "미정" },
                { label:"시급", value: member.wage ? `${member.wage.toLocaleString()}원` : "미정" },
                { label:"이번달 예상 급여", value: estimatedPay > 0 ? `${estimatedPay.toLocaleString()}원` : "-" },
                { label:"이번달 근무시간", value: totalActualHours > 0 ? `${totalActualHours.toFixed(1)}시간` : "-" },
              ].map((row, i, arr) => (
                <div key={i} style={{ padding:"12px 16px", borderBottom: i < arr.length-1 ? "1px solid var(--border)" : "none", display:"flex", justifyContent:"space-between" }}>
                  <span style={{ fontSize:13, color:"var(--text-muted)" }}>{row.label}</span>
                  <span style={{ fontSize:13, color:"var(--text)", fontWeight:600 }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* 성향 */}
            {member.worker?.worker_result && (
              <div style={{ background:"var(--surface)", borderRadius:16, padding:16, border:"1px solid var(--border)" }}>
                <p style={{ fontSize:13, fontWeight:700, color:"var(--text)", margin:"0 0 10px" }}>성향 분석</p>
                <p style={{ fontSize:13, color:"#7c3aed", fontWeight:600, margin:"0 0 4px" }}>
                  {member.worker.worker_result.personalityType}
                </p>
                <p style={{ fontSize:12, color:"var(--text-muted)", margin:0, lineHeight:1.6 }}>
                  {member.worker.worker_result.description?.slice(0, 100)}...
                </p>
              </div>
            )}

            {/* 퇴직 처리 */}
            <button onClick={() => setShowResignModal(true)}
              style={{ background:"none", border:"1px solid #ef444440", borderRadius:12, padding:"12px", color:"#ef4444", fontSize:13, cursor:"pointer" }}>
              🚪 퇴직 처리
            </button>
          </div>
        )}

        {/* 근태 탭 */}
        {tab === "attendance" && (
          <div>
            {/* 월 선택 */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
              <button onClick={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1); } else setViewMonth(m => m-1); }}
                style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"var(--text-muted)", padding:"0 8px" }}>‹</button>
              <span style={{ fontSize:15, fontWeight:700, color:"var(--text)" }}>{viewYear}년 {viewMonth+1}월</span>
              <button onClick={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1); } else setViewMonth(m => m+1); }}
                style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"var(--text-muted)", padding:"0 8px" }}>›</button>
            </div>

            {/* 통계 */}
            <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
              {[
                { label:"출근", value: thisMonthStats.normal, color:"#10b981" },
                { label:"지각", value: thisMonthStats.late, color:"#f59e0b" },
                { label:"조퇴", value: thisMonthStats.early_leave, color:"#f59e0b" },
                { label:"결근", value: thisMonthStats.absent, color:"#ef4444" },
              ].map(s => (
                <div key={s.label} style={{ flex:1, background:"var(--surface)", borderRadius:10, padding:"10px 6px", textAlign:"center", border:"1px solid var(--border)", minWidth:60 }}>
                  <p style={{ fontSize:18, fontWeight:700, color:s.color, margin:"0 0 2px" }}>{s.value}</p>
                  <p style={{ fontSize:10, color:"var(--text-muted)", margin:0 }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* 급여 요약 카드 */}
            <div style={{ background:"linear-gradient(135deg,#7c3aed15,#ec489915)", borderRadius:14, padding:"14px 16px", marginBottom:14, border:"1px solid #7c3aed30" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <span style={{ fontSize:12, color:"var(--text-muted)" }}>총 근무시간</span>
                <span style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>{totalActualHours.toFixed(1)}시간</span>
              </div>
              {overtimeHours > 0 && (
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                  <span style={{ fontSize:12, color:"#f59e0b" }}>초과근무 (×1.5)</span>
                  <span style={{ fontSize:13, fontWeight:700, color:"#f59e0b" }}>{overtimeHours.toFixed(1)}시간</span>
                </div>
              )}
              <div style={{ borderTop:"1px solid #7c3aed30", paddingTop:8, display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>이번달 예상 급여</span>
                <span style={{ fontSize:15, fontWeight:900, color:"#7c3aed" }}>
                  {estimatedPay > 0 ? estimatedPay.toLocaleString()+"원" : "-"}
                </span>
              </div>
            </div>

            {/* 달력 */}
            <div style={{ background:"var(--surface)", borderRadius:16, padding:12, border:"1px solid var(--border)", marginBottom:14 }}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3, marginBottom:6 }}>
                {["일","월","화","수","목","금","토"].map(d => (
                  <div key={d} style={{ textAlign:"center", fontSize:10, color:"var(--text-muted)", padding:"4px 0" }}>{d}</div>
                ))}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
                {Array(firstDay).fill(null).map((_,i) => <div key={`e${i}`} />)}
                {Array(monthDays).fill(null).map((_,i) => {
                  const day = i+1;
                  const att = getAttStatus(day);
                  const status = ATTENDANCE_STATUS.find(s => s.id === att?.status);
                  const isToday = day === now.getDate() && viewMonth === now.getMonth() && viewYear === now.getFullYear();
                  const statusEmoji: Record<string,string> = {
                    normal:"✅", late:"⏰", early_leave:"🔜", absent:"❌", off:"📅"
                  };
                  const statusShort: Record<string,string> = {
                    normal:"출근", late:"지각", early_leave:"조퇴", absent:"결근", off:"휴무"
                  };
                  const isFuture = new Date(viewYear, viewMonth, day) > new Date();
                  return (
                    <div key={day}
                      onClick={() => {
                        const today = new Date();
                        const clickedDate = new Date(viewYear, viewMonth, day);
                        if (clickedDate > today) return;
                        setAttDate(`${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`);
                        setAttStatus(att?.status || "normal");
                        setAttNote(att?.memo || "");
                        setAttStart(att?.check_in ? new Date(att.check_in).toLocaleTimeString("ko-KR", {hour:"2-digit", minute:"2-digit", hour12:false}) : "");
                        setAttEnd(att?.check_out ? new Date(att.check_out).toLocaleTimeString("ko-KR", {hour:"2-digit", minute:"2-digit", hour12:false}) : "");
                        setShowAttModal(true);
                      }}
                      style={{ borderRadius:8, cursor: isFuture ? "default" : "pointer", overflow:"hidden",
                        background: isFuture ? "none" : status ? status.bg : isToday ? "#7c3aed20" : "var(--surface2)",
                        border: isFuture ? "none" : isToday ? "1.5px solid #7c3aed" : att ? `1px solid ${status?.color}40` : "1px solid transparent",
                        opacity: isFuture ? 0.3 : 1,
                        padding:"4px 2px 3px",
                      }}>
                      <div style={{ textAlign:"center", fontSize:11, fontWeight: isToday ? 700 : 500,
                        color: status ? status.color : isToday ? "#7c3aed" : "var(--text)" }}>
                        {day}
                      </div>
                      {att ? (
                        <div style={{ textAlign:"center", fontSize:9, color: status?.color, lineHeight:1.3 }}>
                          {statusEmoji[att.status]}<br/>
                          {statusShort[att.status]}
                          {att.actual_hours && att.status !== "absent" && att.status !== "off" && (
                            <><br/><span style={{ fontSize:8 }}>{att.actual_hours}h</span></>
                          )}
                          {att.memo && (
                            <><br/><span style={{ fontSize:8, color:"#a78bfa" }}>📝</span></>
                          )}
                        </div>
                      ) : (
                        <div style={{ height:24 }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <button onClick={() => { setAttDate(new Date().toISOString().split("T")[0]); setAttStatus("normal"); setAttNote(""); setShowAttModal(true); }}
              style={{ width:"100%", background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", borderRadius:14, padding:14, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", marginBottom:20 }}>
              + 근태 입력
            </button>

            {/* 수정 이력 타임라인 */}
            <AttendanceLogs memberId={member.id} refreshKey={attLogRefreshKey} />
          </div>
        )}

        {/* 계약서 탭 */}
        {tab === "contract" && (
          <div>
            {contracts.length === 0 ? (
              <div style={{ textAlign:"center", padding:"40px 0", color:"var(--text-muted)" }}>
                <div style={{ fontSize:40, marginBottom:8 }}>📄</div>
                <p style={{ fontSize:14 }}>계약서가 없어요</p>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {contracts.map((c, i) => {
                  const isLatest = i === 0 && c.status !== "superseded";
                  const isSuperseded = c.status === "superseded";
                  const isSigned = c.worker_signed;
                  const isPending = c.status === "pending" && !isSigned;
                  return (
                    <div key={c.id} style={{ background:"var(--surface)", borderRadius:14, padding:14, border:`1px solid ${isLatest ? "#7c3aed40" : isSuperseded ? "var(--border)" : "var(--border)"}`, opacity: isSuperseded ? 0.6 : 1 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>
                            {isSuperseded ? "📋 대체된 계약" : isLatest ? "📄 현재 계약" : `📋 계약 ${contracts.filter(x=>x.status!=="superseded").length - contracts.filter(x=>x.status!=="superseded").indexOf(c)}`}
                          </span>
                          {isSigned && !isSuperseded && (
                            <span style={{ fontSize:10, background:"#10b98120", color:"#10b981", borderRadius:6, padding:"1px 6px" }}>✅ 서명완료</span>
                          )}
                          {isPending && (
                            <span style={{ fontSize:10, background:"#f59e0b20", color:"#f59e0b", borderRadius:6, padding:"1px 6px" }}>⏳ 서명대기</span>
                          )}
                          {isSuperseded && (
                            <span style={{ fontSize:10, background:"var(--surface2)", color:"var(--text-muted)", borderRadius:6, padding:"1px 6px" }}>🔒 대체됨</span>
                          )}
                        </div>
                        <span style={{ fontSize:11, color:"var(--text-muted)" }}>
                          {new Date(c.created_at).toLocaleDateString("ko-KR")}
                        </span>
                      </div>
                      <p style={{ fontSize:12, color:"var(--text-muted)", margin:"0 0 10px" }}>
                        {c.start_date || "-"} ~ {c.end_date || "기간 미정"}
                        {c.contract_data?.contractType && (
                          <span style={{ marginLeft:8, fontSize:11, background:"var(--surface2)", borderRadius:6, padding:"1px 6px" }}>
                            {c.contract_data.contractType === "parttime" ? "단시간" : c.contract_data.contractType === "minor" ? "연소근로자" : "표준"}
                          </span>
                        )}
                      </p>
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={() => router.push(`/contract/view?matchId=${c.match_id}`)}
                          style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"8px", fontSize:12, color:"var(--text-muted)", cursor:"pointer" }}>
                          📄 보기
                        </button>
                        {isLatest && !isSuperseded && (
                          <button onClick={() => router.push(`/contract?matchId=${c.match_id}&mode=update`)}
                            style={{ flex:1, background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", borderRadius:8, padding:"8px", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer" }}>
                            ✏️ 수정
                          </button>
                        )}
                        {(!isLatest || isSuperseded) && (
                          <span style={{ flex:1, textAlign:"center", fontSize:11, color:"var(--text-muted)", padding:"8px", alignSelf:"center" }}>
                            🔒 이력 보존
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button onClick={async () => {
              if (member.match_id) {
                router.push(`/contract?matchId=${member.match_id}`);
              } else {
                // match_id 없으면 새 match 생성 후 이동
                const { data: newMatch, error } = await supabase.from("matches").insert({
                  employer_id: member.employer_id,
                  worker_id: member.worker_id,
                  progress_status: "hired",
                  hire_confirmed_by_employer: true,
                  hire_confirmed_by_worker: true,
                  match_score: 0,
                }).select("id").single();
                if (error || !newMatch) {
                  showToast("오류: " + error?.message, "error");
                  return;
                }
                // team_members match_id 업데이트
                await supabase.from("team_members")
                  .update({ match_id: newMatch.id })
                  .eq("id", member.id);
                router.push(`/contract?matchId=${newMatch.id}`);
              }
            }}
              style={{ width:"100%", marginTop:14, background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", borderRadius:14, padding:14, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
              + 새 계약서 작성
            </button>
          </div>
        )}

        {/* 급여 탭 */}
        {tab === "payslip" && (
          <PayslipTab memberId={member.id} employerId={member.employer_id} workerId={member.worker_id} router={router} />
        )}
      </div>

      {/* 근태 입력 모달 */}
      {showAttModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
          <div style={{ background:"var(--surface)", borderRadius:"20px 20px 0 0", padding:24, width:"100%", maxWidth:480 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <h3 style={{ fontSize:16, fontWeight:700, margin:0, color:"var(--text)" }}>근태 입력</h3>
              <div style={{ display:"flex", gap:6 }}>
                {getAttStatus(parseInt(attDate.split("-")[2])) ? (
                  <>
                    <span style={{ fontSize:11, background:"#f59e0b20", color:"#f59e0b", borderRadius:6, padding:"3px 8px" }}>
                      ✏️ 수정
                    </span>
                    <button onClick={async () => {
                      if (!confirm("이 날의 근태 기록을 삭제할까요?")) return;
                      const existing = getAttStatus(parseInt(attDate.split("-")[2]));
                      if (existing?.id) {
                        // 삭제 로그
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
                      style={{ fontSize:11, background:"#ef444420", color:"#ef4444", border:"none", borderRadius:6, padding:"3px 8px", cursor:"pointer" }}>
                      🗑️ 삭제
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize:11, background:"#7c3aed20", color:"#7c3aed", borderRadius:6, padding:"3px 8px" }}>
                    ➕ 새 입력
                  </span>
                )}
              </div>
            </div>

            <div style={{ marginBottom:12 }}>
              <p style={{ fontSize:12, color:"var(--text-muted)", margin:"0 0 6px" }}>날짜</p>
              <input type="date" value={attDate}
                max={new Date().toISOString().split("T")[0]}
                onChange={e => {
                  const today = new Date().toISOString().split("T")[0];
                  if (e.target.value > today) return;
                  setAttDate(e.target.value);
                }}
                style={{ width:"100%", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"10px 12px", color:"var(--text)", fontSize:14, outline:"none", boxSizing:"border-box" }} />
            </div>

            <div style={{ marginBottom:12 }}>
              <p style={{ fontSize:12, color:"var(--text-muted)", margin:"0 0 6px" }}>상태</p>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {ATTENDANCE_STATUS.map(s => (
                  <button key={s.id} onClick={() => setAttStatus(s.id)}
                    style={{ padding:"6px 14px", borderRadius:20, border:`1.5px solid ${attStatus === s.id ? s.color : "var(--border)"}`, background:attStatus === s.id ? s.bg : "none", color:attStatus === s.id ? s.color : "var(--text-muted)", fontSize:13, fontWeight:attStatus === s.id ? 700 : 400, cursor:"pointer" }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 실제 근무시간 (결근/휴무 제외) */}
            {!["absent","off"].includes(attStatus) && (
              <div style={{ marginBottom:12 }}>
                <p style={{ fontSize:12, color:"var(--text-muted)", margin:"0 0 8px" }}>
                  근무 시간
                  {member?.work_hours && (
                    <span style={{ marginLeft:4, color:"var(--text-muted)", fontWeight:400 }}>
                      (계약: {member.work_hours}시간)
                    </span>
                  )}
                </p>
                {(() => {
                  const timeOptions = Array.from({length: 48}, (_, i) => {
                    const h = Math.floor(i/2);
                    const m = i%2 === 0 ? "00" : "30";
                    return `${String(h).padStart(2,"0")}:${m}`;
                  });
                  const selectStyle = { flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"10px 12px", color:"var(--text)", fontSize:14, outline:"none", cursor:"pointer", appearance:"none" as const, WebkitAppearance:"none" as const };
                  return (
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <select value={attStart} onChange={e => setAttStart(e.target.value)} style={selectStyle}>
                        <option value="">시작 시간</option>
                        {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <span style={{ color:"var(--text-muted)", fontSize:13, flexShrink:0 }}>~</span>
                      <select value={attEnd} onChange={e => setAttEnd(e.target.value)} style={selectStyle}>
                        <option value="">종료 시간</option>
                        {timeOptions.filter(t => !attStart || t > attStart).map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  );
                })()}
                {/* 자동 계산 결과 표시 */}
                {attStart && attEnd && (() => {
                  const [sh,sm] = attStart.split(":").map(Number);
                  const [eh,em] = attEnd.split(":").map(Number);
                  const mins = (eh*60+em) - (sh*60+sm);
                  if (mins <= 0) return null;
                  const hours = Math.round(mins/60*10)/10;
                  const overtime = Math.max(0, hours - (contractHours || 0));
                  return (
                    <div style={{ marginTop:8, background:"var(--surface2)", borderRadius:10, padding:"8px 12px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom: overtime > 0 ? 4 : 0 }}>
                        <span style={{ fontSize:12, color:"var(--text-muted)" }}>실제 근무시간</span>
                        <span style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>{hours}시간</span>
                      </div>
                      {overtime > 0 && (
                        <div style={{ display:"flex", justifyContent:"space-between" }}>
                          <span style={{ fontSize:12, color:"#f59e0b" }}>초과근무 (×1.5)</span>
                          <span style={{ fontSize:12, fontWeight:700, color:"#f59e0b" }}>{overtime.toFixed(1)}시간</span>
                        </div>
                      )}
                      {member?.wage && (
                        <div style={{ borderTop:"1px solid var(--border)", marginTop:6, paddingTop:6, display:"flex", justifyContent:"space-between" }}>
                          <span style={{ fontSize:12, color:"var(--text-muted)" }}>오늘 예상 급여</span>
                          <span style={{ fontSize:13, fontWeight:700, color:"#7c3aed" }}>
                            {Math.round((Math.min(hours,contractHours||hours) * member.wage) + (overtime * member.wage * 1.5)).toLocaleString()}원
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            <div style={{ marginBottom:20 }}>
              <p style={{ fontSize:12, color:"var(--text-muted)", margin:"0 0 6px" }}>메모 <span style={{ color:"var(--text-muted)", fontWeight:400 }}>(선택사항)</span></p>
              <textarea
                value={attNote}
                onChange={e => setAttNote(e.target.value)}
                placeholder="예) 30분 지각, 조퇴 사유: 병원, 특이사항 없음 등"
                rows={3}
                style={{ width:"100%", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"10px 12px", color:"var(--text)", fontSize:13, outline:"none", boxSizing:"border-box" as const, resize:"none", lineHeight:1.6 }}
              />
              <p style={{ fontSize:11, color:"var(--text-muted)", margin:"4px 0 0", textAlign:"right" as const }}>{attNote.length}/200</p>
            </div>

            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setShowAttModal(false)}
                style={{ flex:1, background:"var(--surface2)", border:"none", borderRadius:12, padding:14, color:"var(--text-muted)", fontSize:14, cursor:"pointer" }}>취소</button>
              <button onClick={saveAttendance} disabled={saving}
                style={{ flex:1, background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", borderRadius:12, padding:14, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
      {ToastUI}

      {/* 퇴직 확인 모달 */}
      {showResignModal && member && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div style={{ background:"var(--surface)", borderRadius:20, padding:24, width:"100%", maxWidth:360 }}>
            <div style={{ textAlign:"center", marginBottom:16 }}>
              <div style={{ fontSize:40, marginBottom:8 }}>🚪</div>
              <p style={{ fontSize:16, fontWeight:700, color:"var(--text)", margin:"0 0 6px" }}>퇴직 처리</p>
              <p style={{ fontSize:13, color:"var(--text-muted)", margin:0, lineHeight:1.6 }}>
                <span style={{ fontWeight:700, color:"#ef4444" }}>
                  {member.worker?.nickname || member.worker?.email?.split("@")[0] || "팀원"}
                </span>
                님을 퇴직 처리할까요?
              </p>
              <p style={{ fontSize:11, color:"var(--text-muted)", marginTop:8, lineHeight:1.6 }}>
                근태·계약서 이력은 보존되며<br/>팀원 목록에서 제외돼요
              </p>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setShowResignModal(false)}
                style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:12, padding:12, fontSize:14, color:"var(--text-muted)", cursor:"pointer" }}>
                취소
              </button>
              <button onClick={async () => {
                await supabase.from("team_members").update({ status: "resigned" }).eq("id", member.id);
                setShowResignModal(false);
                showToast("퇴직 처리됐어요", "success");
                setTimeout(() => router.back(), 1000);
              }}
                style={{ flex:1, background:"#ef4444", border:"none", borderRadius:12, padding:12, fontSize:14, fontWeight:700, color:"#fff", cursor:"pointer" }}>
                퇴직 처리
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
