"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import DateWheelPicker from "@/components/DateWheelPicker";

import { getTrustGrade } from "@/lib/utils";
import { sendPushNotification } from "@/lib/usePush";
import { cardStyle, cardInnerStyle, cardGradientStyle, btnPrimary, btnSecondary, modalOverlay, modalSheet } from "@/lib/styles";

// 출퇴근 버튼 컴포넌트
function CheckInButton({ member, userId, onRefresh }: { member: any; userId: string; onRefresh?: () => void }) {
  const [todayAtt, setTodayAtt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // KST 기준 오늘 날짜
  const today = (() => {
    const d = new Date();
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().split("T")[0];
  })();

  useEffect(() => {
    if (!member?.id) return;
    supabase.from("attendance")
      .select("*")
      .eq("team_member_id", member.id)
      .eq("work_date", today)
      .maybeSingle()
      .then(({ data }) => { setTodayAtt(data); setLoading(false); });
  }, [member?.id]);

  async function handleCheckIn() {
    setProcessing(true);
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const h = kst.getUTCHours();
    const m2 = kst.getUTCMinutes();
    const timeStr = `${String(h).padStart(2,"0")}:${String(m2).padStart(2,"0")}`;
    const checkInTime = `${today}T${timeStr}:00+09:00`;

    // 지각 자동 판단 (work_hours가 "09:00-18:00" 형식일 때)
    let status = "normal";
    if (member?.work_hours && member.work_hours.includes(":")) {
      const startPart = member.work_hours.split("-")[0];
      const [startH, startM] = startPart.split(":").map(Number);
      if (!isNaN(startH)) {
        const contractMins = startH * 60 + (startM || 0);
        const checkInMins = h * 60 + m2;
        if (checkInMins > contractMins + 10) status = "late";
      }
    }

    const { data, error } = await supabase.from("attendance").insert({
      team_member_id: member.id,
      employer_id: member.employer_id,
      worker_id: userId,
      work_date: today,
      status,
      check_in: checkInTime,
      actual_hours: 0,
    }).select().single();

    if (!error && data) {
      setTodayAtt(data);
      onRefresh?.();
      // 사장님에게 푸시 알림
      sendPushNotification({ userId: member.employer_id, title: "✅ 출근 알림", body: `${(member as any)?.users?.nickname || "팀원"}님이 출근했어요`, url: `/employer/team/${member.id}`, tag: "attendance" });
      // 출근 로그
      await supabase.from("attendance_logs").insert({
        attendance_id: data.id,
        team_member_id: member.id,
        action: "checkin",
        actor_id: userId,
        actor_role: "worker",
        after_data: { status, check_in: checkInTime, work_date: today },
      });
      // trust_score 연동
      if (status === "normal") {
        const { data: u } = await supabase.from("users").select("trust_score").eq("id", userId).single();
        const next = Math.min(100, (u?.trust_score || 50) + 1);
        await supabase.from("users").update({ trust_score: next }).eq("id", userId);
        await supabase.from("trust_score_logs").insert({ user_id: userId, delta: 1, reason: "정상 출근", category: "attendance" });
      } else if (status === "late") {
        const { data: u } = await supabase.from("users").select("trust_score").eq("id", userId).single();
        const next = Math.max(0, (u?.trust_score || 50) - 3);
        await supabase.from("users").update({ trust_score: next }).eq("id", userId);
        await supabase.from("trust_score_logs").insert({ user_id: userId, delta: -3, reason: "지각", category: "attendance" });
      }
      const statusMsg = status === "late" ? "⏰ 지각으로 기록됐어요" : "✅ 출근했어요!";
      if (member.match_id) {
        await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matchId: member.match_id,
            senderId: userId,
            receiverId: member.employer_id,
            message: `${statusMsg}\n📅 ${today} ${timeStr}`,
            messageType: "system",
          }),
        });
      }
    }
    setProcessing(false);
  }

  async function handleCheckOut() {
    if (!todayAtt) return;
    setProcessing(true);
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const h = kst.getUTCHours();
    const m2 = kst.getUTCMinutes();
    const timeStr = `${String(h).padStart(2,"0")}:${String(m2).padStart(2,"0")}`;
    const checkOutTime = `${today}T${timeStr}:00+09:00`;

    const checkIn = new Date(todayAtt.check_in);
    const checkOut = new Date(checkOutTime);
    const diffHours = Math.round((checkOut.getTime() - checkIn.getTime()) / 36000) / 100;

    // 조퇴 자동 판단
    let status = todayAtt.status;
    const contractHours = member?.work_hours && !member.work_hours.includes(":") ? parseFloat(member.work_hours) : null;
    if (contractHours && diffHours < contractHours - 0.5) status = "early_leave";

    const { data, error } = await supabase.from("attendance")
      .update({ check_out: checkOutTime, actual_hours: diffHours, status })
      .eq("id", todayAtt.id)
      .select().single();

    if (!error && data) {
      setTodayAtt(data);
      onRefresh?.();
      // 사장님에게 푸시 알림
      sendPushNotification({ userId: member.employer_id, title: "🔴 퇴근 알림", body: `${(member as any)?.users?.nickname || "팀원"}님이 퇴근했어요 (${diffHours}h)`, url: `/employer/team/${member.id}`, tag: "attendance" });
      // 퇴근 로그
      await supabase.from("attendance_logs").insert({
        attendance_id: data.id,
        team_member_id: member.id,
        action: "checkout",
        actor_id: userId,
        actor_role: "worker",
        after_data: { status, check_out: checkOutTime, actual_hours: diffHours, work_date: today },
      });
      // 장기근무 뱃지 체크 (동일 팀원 90일 이상)
      const { count: dayCount } = await supabase.from("attendance")
        .select("*", { count: "exact", head: true })
        .eq("team_member_id", member.id)
        .eq("worker_id", userId)
        .in("status", ["normal", "late"]);
      if ((dayCount || 0) >= 90) {
        await supabase.from("user_badges")
          .upsert({ user_id: userId, badge_key: "longterm" },
            { onConflict: "user_id,badge_key", ignoreDuplicates: true });
      }
      // 즉시출근 뱃지 체크 (당일 출근 3회 이상)
      const { count: quickCount } = await supabase.from("attendance")
        .select("*", { count: "exact", head: true })
        .eq("worker_id", userId)
        .eq("status", "normal");
      if ((quickCount || 0) >= 3) {
        await supabase.from("user_badges")
          .upsert({ user_id: userId, badge_key: "quick" },
            { onConflict: "user_id,badge_key", ignoreDuplicates: true });
      }
      const statusMsg = status === "early_leave" ? "🔜 조퇴로 기록됐어요" : "🔴 퇴근했어요!";
      if (member.match_id) {
        await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matchId: member.match_id,
            senderId: userId,
            receiverId: member.employer_id,
            message: `${statusMsg}\n📅 ${today} ${timeStr}\n⏱ 근무 ${diffHours}시간`,
            messageType: "system",
          }),
        });
      }
    }
    setProcessing(false);
  }

  if (loading) return (
    <div style={{ marginBottom:12, height:52, background:"var(--surface2)", borderRadius:14, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <span style={{ fontSize:12, color:"var(--text-muted)" }}>출퇴근 확인 중...</span>
    </div>
  );

  const checkedIn = !!todayAtt?.check_in;
  const checkedOut = !!todayAtt?.check_out;
  const checkInTime = todayAtt?.check_in
    ? new Date(todayAtt.check_in).toLocaleTimeString("ko-KR", { hour:"2-digit", minute:"2-digit" })
    : null;
  const checkOutTime = todayAtt?.check_out
    ? new Date(todayAtt.check_out).toLocaleTimeString("ko-KR", { hour:"2-digit", minute:"2-digit" })
    : null;

  return (
    <div style={{ marginBottom:12 }}>
      {!checkedIn && (
        <button onClick={handleCheckIn} disabled={processing}
          style={{ width:"100%", background:"linear-gradient(135deg,#10b981,#059669)", border:"none", borderRadius:14, padding:14, color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          {processing ? "처리 중..." : <>🟢 출근하기</>}
        </button>
      )}
      {checkedIn && !checkedOut && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <div style={{ background:"#10b98115", borderRadius:12, padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13, color:"#10b981", fontWeight:600 }}>✅ 출근 완료</span>
            <span style={{ fontSize:12, color:"var(--text-muted)" }}>{checkInTime}</span>
          </div>
          <button onClick={handleCheckOut} disabled={processing}
            style={{ width:"100%", background:"linear-gradient(135deg,#ef4444,#dc2626)", border:"none", borderRadius:14, padding:14, color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer" }}>
            {processing ? "처리 중..." : "🔴 퇴근하기"}
          </button>
        </div>
      )}
      {checkedIn && checkedOut && (
        <div style={{ background:"var(--surface2)", borderRadius:12, padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:13, color:"var(--text-muted)", fontWeight:600 }}>✅ 오늘 근무 완료</span>
          <span style={{ fontSize:12, color:"var(--text-muted)" }}>{checkInTime} ~ {checkOutTime} ({todayAtt.actual_hours}h)</span>
        </div>
      )}
    </div>
  );
}

// 알바생 근태 탭 (달력 형태)
function WorkerAttendanceTab({ member, userId }: { member: any; userId: string }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [monthAtt, setMonthAtt] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAtt(); }, [viewYear, viewMonth, member?.id]);

  // Realtime 구독 - 사장님이 근태 수정하면 자동 갱신
  useEffect(() => {
    if (!member?.id) return;
    const channel = supabase
      .channel(`worker-att:${member.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "attendance",
        filter: `team_member_id=eq.${member.id}`,
      }, () => { loadAtt(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [member?.id]);

  async function loadAtt() {
    if (!member?.id) return;
    setLoading(true);
    const lastDay = new Date(viewYear, viewMonth+1, 0).getDate();
    const monthStr = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}`;
    const { data } = await supabase.from("attendance")
      .select("*").eq("team_member_id", member.id)
      .gte("work_date", `${monthStr}-01`)
      .lte("work_date", `${monthStr}-${String(lastDay).padStart(2,"0")}`)
      .order("work_date");
    setMonthAtt(data || []);
    setLoading(false);
  }

  const getAtt = (day: number) => {
    const dateStr = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    return monthAtt.find(a => a.work_date === dateStr);
  };

  const ATTENDANCE_STATUS = [
    { id:"normal", label:"출근", color:"#10b981", bg:"#10b98120" },
    { id:"late", label:"지각", color:"#f59e0b", bg:"#f59e0b20" },
    { id:"early_leave", label:"조퇴", color:"#f59e0b", bg:"#f59e0b20" },
    { id:"absent", label:"결근", color:"#ef4444", bg:"#ef444420" },
    { id:"off", label:"휴무", color:"#6b7280", bg:"#6b728020" },
  ];
  const statusEmoji: Record<string,string> = { normal:"✅", late:"⏰", early_leave:"🔜", absent:"❌", off:"📅" };
  const statusShort: Record<string,string> = { normal:"출근", late:"지각", early_leave:"조퇴", absent:"결근", off:"휴무" };

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const monthDays = new Date(viewYear, viewMonth+1, 0).getDate();
  const todayStr = (() => { const d = new Date(); const k = new Date(d.getTime()+9*60*60*1000); return k.toISOString().split("T")[0]; })();

  const thisMonthStats = {
    normal: monthAtt.filter(a => a.status==="normal").length,
    late: monthAtt.filter(a => a.status==="late").length,
    early_leave: monthAtt.filter(a => a.status==="early_leave").length,
    absent: monthAtt.filter(a => a.status==="absent").length,
  };
  const totalActualHours = monthAtt.reduce((s,a) => s+(parseFloat(a.actual_hours)||0), 0);
  const wage = member?.wage || 0;
  const contractH = parseFloat(member?.work_hours) || 8;
  const overtimeHours = Math.max(0, totalActualHours - (thisMonthStats.normal + thisMonthStats.late) * contractH);
  const estimatedPay = wage ? Math.round((totalActualHours - overtimeHours) * wage + overtimeHours * wage * 1.5) : 0;

  return (
    <div>
      {/* 월 선택 */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
        <button onClick={() => { if(viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1); }}
          style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"var(--text-muted)", padding:"0 8px" }}>‹</button>
        <span style={{ fontSize:15, fontWeight:700, color:"var(--text)" }}>{viewYear}년 {viewMonth+1}월</span>
        <button onClick={() => { if(viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1); }}
          disabled={`${viewYear}-${String(viewMonth+1).padStart(2,"0")}`>=todayStr.slice(0,7)}
          style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"var(--text-muted)", padding:"0 8px",
            opacity:`${viewYear}-${String(viewMonth+1).padStart(2,"0")}`>=todayStr.slice(0,7)?0.3:1 }}>›</button>
      </div>

      {/* 통계 */}
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" as const }}>
        {[
          { label:"출근", value:thisMonthStats.normal, color:"#10b981" },
          { label:"지각", value:thisMonthStats.late, color:"#f59e0b" },
          { label:"조퇴", value:thisMonthStats.early_leave, color:"#f59e0b" },
          { label:"결근", value:thisMonthStats.absent, color:"#ef4444" },
        ].map(s => (
          <div key={s.label} style={{ flex:1, background:"var(--surface)", borderRadius:10, padding:"10px 6px", textAlign:"center" as const, border:"1px solid var(--border)", minWidth:60 }}>
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
          <span style={{ fontSize:15, fontWeight:900, color:"#7c3aed" }}>{estimatedPay > 0 ? estimatedPay.toLocaleString()+"원" : "-"}</span>
        </div>
      </div>

      {/* 달력 */}
      <div style={{ background:"var(--surface)", borderRadius:16, padding:12, border:"1px solid var(--border)", marginBottom:14 }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3, marginBottom:6 }}>
          {["일","월","화","수","목","금","토"].map(d => (
            <div key={d} style={{ textAlign:"center" as const, fontSize:10, color:"var(--text-muted)", padding:"4px 0" }}>{d}</div>
          ))}
        </div>
        {loading ? <div style={{ textAlign:"center" as const, padding:"20px 0", color:"var(--text-muted)" }}>로딩 중...</div> : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
            {Array(firstDay).fill(null).map((_,i) => <div key={`e${i}`} />)}
            {Array(monthDays).fill(null).map((_,i) => {
              const day = i+1;
              const att = getAtt(day);
              const status = ATTENDANCE_STATUS.find(s => s.id === att?.status);
              const dateStr = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
              const isToday = dateStr === todayStr;
              const isFuture = dateStr > todayStr;
              return (
                <div key={day} style={{
                  borderRadius:8, overflow:"hidden", padding:"4px 2px 3px",
                  background:isFuture?"none":status?status.bg:isToday?"#7c3aed20":"var(--surface2)",
                  border:isFuture?"none":isToday?"1.5px solid #7c3aed":att?`1px solid ${status?.color}40`:"1px solid transparent",
                  opacity:isFuture?0.3:1,
                }}>
                  <div style={{ textAlign:"center" as const, fontSize:11, fontWeight:isToday?700:500,
                    color:status?status.color:isToday?"#7c3aed":"var(--text)" }}>{day}</div>
                  {att ? (
                    <div style={{ textAlign:"center" as const, fontSize:9, color:status?.color, lineHeight:1.3 }}>
                      {statusEmoji[att.status]}<br/>{statusShort[att.status]}
                      {att.actual_hours && att.status!=="absent" && att.status!=="off" && (
                        <><br/><span style={{ fontSize:8 }}>{att.actual_hours}h</span></>
                      )}
                      {att.memo && (
                        <><br/><span style={{ fontSize:8, color:"#a78bfa" }}>📝</span></>
                      )}
                    </div>
                  ) : <div style={{ height:24 }} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


function WorkerAttLogs({ memberId, refreshKey = 0 }: { memberId: string; refreshKey?: number }) {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("attendance_logs")
      .select("*").eq("team_member_id", memberId)
      .order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => setLogs(data || []));
  }, [memberId, refreshKey]);

  if (logs.length === 0) return null;

  const actionLabel: Record<string, string> = {
    checkin: "🟢 출근", checkout: "🔴 퇴근", update: "✏️ 수정됨", delete: "🗑️ 삭제됨",
  };

  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", margin: "0 0 8px" }}>근태 이력</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {logs.map(log => {
          const d = log.after_data || log.before_data || {};
          const time = new Date(log.created_at).toLocaleString("ko-KR", { month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit" });
          const who = log.actor_role === "worker" ? "내가" : "사장님이";
          return (
            <div key={log.id} style={{ background:"var(--surface2)", borderRadius:10, padding:"8px 10px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <span style={{ fontSize:11, fontWeight:600, color:"var(--text)" }}>{actionLabel[log.action]}</span>
                  <span style={{ fontSize:11, color:"var(--text-muted)", marginLeft:6 }}>{who} · {d.work_date}</span>
                </div>
                <span style={{ fontSize:10, color:"var(--text-muted)" }}>{time}</span>
              </div>
              {d.memo && (
                <p style={{ fontSize:11, color:"var(--text-muted)", margin:"4px 0 0", background:"var(--surface)", borderRadius:6, padding:"4px 8px", lineHeight:1.5 }}>
                  📝 {d.memo}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkerPayslipTab({ workerId, employerId, router }: { workerId:string; employerId:string; router:any }) {
  const [payslips, setPayslips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workerId || !employerId) { setLoading(false); return; }
    supabase.from("payslips")
      .select("*")
      .eq("worker_id", workerId)
      .eq("employer_id", employerId)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .then(({ data }) => { setPayslips(data || []); setLoading(false); });
  }, [workerId, employerId]);

  if (loading) return <p style={{ textAlign:"center", color:"var(--text-muted)", fontSize:13, padding:"16px 0" }}>로딩 중...</p>;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {payslips.length === 0 ? (
        <div style={{ textAlign:"center", padding:"24px 0" }}>
          <p style={{ fontSize:13, color:"var(--text-muted)" }}>발행된 급여 명세서가 없어요</p>
          <p style={{ fontSize:11, color:"var(--text-muted)", marginTop:4 }}>사장님이 명세서를 발행하면 여기서 확인할 수 있어요</p>
        </div>
      ) : payslips.map(p => (
        <div key={p.id} style={{ background:"var(--surface2)", borderRadius:12, padding:12, border:"1px solid var(--border)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <span style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>{p.year}년 {p.month}월</span>
            <div style={{ display:"flex", gap:4 }}>
              <span style={{ fontSize:11, background:"#10b98120", color:"#10b981", borderRadius:6, padding:"2px 6px" }}>✅ 발행됨</span>
              {p.confirmed_at && <span style={{ fontSize:11, background:"#60a5fa20", color:"#60a5fa", borderRadius:6, padding:"2px 6px" }}>👁 확인됨</span>}
            </div>
          </div>
          <div style={{ display:"flex", gap:10, marginBottom:8 }}>
            <div><p style={{ fontSize:10, color:"var(--text-muted)", margin:"0 0 2px" }}>근무</p><p style={{ fontSize:12, fontWeight:600, margin:0 }}>{p.work_days}일/{p.total_hours}h</p></div>
            <div><p style={{ fontSize:10, color:"var(--text-muted)", margin:"0 0 2px" }}>지급액</p><p style={{ fontSize:14, fontWeight:700, color:"#7c3aed", margin:0 }}>{Number(p.total_pay).toLocaleString()}원</p></div>
          </div>
          <button onClick={() => router.push(`/payslip?id=${p.id}&tab=mywork`)}
            style={{ width:"100%", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, padding:"7px", fontSize:12, color:"var(--text-muted)", cursor:"pointer" }}>
            📄 명세서 보기
          </button>
        </div>
      ))}
    </div>
  );
}

const STATUS_EMOJI: Record<string,string> = { normal:"✅", late:"⏰", early_leave:"🔜", absent:"❌", off:"📅" };
const STATUS_LABEL: Record<string,string> = { normal:"출근", late:"지각", early_leave:"조퇴", absent:"결근", off:"휴무" };
const STATUS_COLOR: Record<string,string> = { normal:"#10b981", late:"#f59e0b", early_leave:"#f59e0b", absent:"#ef4444", off:"#6b7280" };

function WorkerMemberScroll({ m, userId, router, onRefresh }: { m: any; userId: string; router: any; onRefresh?: () => void }) {
  const [recentAtt, setRecentAtt] = useState<any[]>([]);
  const [monthStats, setMonthStats] = useState({ days: 0, hours: 0, estPay: 0 });
  const [editHireDate, setEditHireDate] = useState(false);
  const [hireDateInput, setHireDateInput] = useState(m.hire_date || "");

  useEffect(() => {
    const now = new Date();
    const ms = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`;
    supabase.from("attendance")
      .select("work_date,status,actual_hours,check_in,check_out")
      .eq("team_member_id", m.id)
      .gte("work_date", ms)
      .order("work_date", { ascending: false })
      .then(({ data }) => {
        const att = data || [];
        setRecentAtt(att.slice(0, 5));
        const workDays = att.filter((a:any) => a.status !== "absent" && a.status !== "off").length;
        const totalH = att.reduce((s:number, a:any) => s + (parseFloat(a.actual_hours) || 0), 0);
        setMonthStats({ days: workDays, hours: Math.round(totalH * 10) / 10, estPay: m.wage ? Math.round(totalH * m.wage) : 0 });
      });
  }, [m.id]);

  const storeName = m.profile?.business_name || m.employer?.nickname || "매장";
  const now = new Date();
  const monthLabel = `${now.getFullYear()}년 ${now.getMonth()+1}월`;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {/* 매장 정보 카드 */}
      <div style={{ ...cardStyle, padding: 0, overflow:"hidden" }}>
        <div style={{ background:"linear-gradient(135deg,#ec4899 60%,#7c3aed)", padding:"16px 18px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <span style={{ fontSize:26 }}>{BIZ_EMOJI[m.profile?.business_type]||"🏪"}</span>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:16, fontWeight:800, color:"#fff", margin:"0 0 2px" }}>{storeName}</p>
              <p style={{ fontSize:11, color:"rgba(255,255,255,0.75)", margin:0 }}>
                {m.profile?.business_type} · {m.profile?.region||"위치미정"}
              </p>
            </div>
            <span style={{ fontSize:11, background:"rgba(255,255,255,0.2)", color:"#fff", borderRadius:20, padding:"3px 10px", fontWeight:600 }}>재직중</span>
          </div>
          {/* 근무 조건 */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
            {[
              { label:"시급", value: m.wage ? `${m.wage.toLocaleString()}원` : "미정" },
              { label:"근무요일", value: m.work_days || "미정" },
              { label:"근무시간", value: m.work_hours || "미정" },
            ].map(r => (
              <div key={r.label} style={{ background:"rgba(255,255,255,0.15)", borderRadius:10, padding:"8px 10px" }}>
                <p style={{ fontSize:10, color:"rgba(255,255,255,0.7)", margin:"0 0 2px" }}>{r.label}</p>
                <p style={{ fontSize:12, fontWeight:700, color:"#fff", margin:0 }}>{r.value}</p>
              </div>
            ))}
          </div>
        </div>
        {/* 입사일 */}
        <div style={{ padding:"10px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid var(--border)" }}>
          <span style={{ fontSize:12, color:"var(--text-muted)" }}>입사일</span>
          <button onClick={() => setEditHireDate(true)} style={{ fontSize:12, fontWeight:600, color: m.hire_date ? "var(--text)" : "#f59e0b", background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
            {hireDateInput || "미설정"} <span style={{ fontSize:10, color:"#7c3aed" }}>수정</span>
          </button>
        </div>
        {editHireDate && (
          <DateWheelPicker
            value={hireDateInput || new Date().toISOString().split("T")[0]}
            onChange={v => setHireDateInput(v)}
            onClose={() => setEditHireDate(false)}
            onConfirm={async v => {
              setHireDateInput(v);
              await supabase.from("team_members").update({ hire_date: v }).eq("id", m.id);
              setEditHireDate(false);
              onRefresh?.();
            }}
          />
        )}
        {/* 채팅 */}
        <button onClick={() => router.push(`/chat?employer=${m.employer_id}`)}
          style={{ width:"100%", background:"none", border:"none", padding:"12px 18px", fontSize:13, color:"var(--text-muted)", cursor:"pointer", textAlign:"left", display:"flex", alignItems:"center", gap:8 }}>
          <i className="ti ti-message" style={{ fontSize:16 }} /> 사장님과 채팅
        </button>
      </div>

      {/* 출퇴근 버튼 */}
      <CheckInButton member={m} userId={userId} onRefresh={onRefresh} />

      {/* 이번달 요약 */}
      <div style={{ ...cardStyle, padding:"14px 16px" }}>
        <p style={{ fontSize:12, fontWeight:700, color:"var(--text-muted)", margin:"0 0 12px" }}>{monthLabel} 요약</p>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
          {[
            { label:"근무일", value:`${monthStats.days}일` },
            { label:"총 시간", value:`${monthStats.hours}h` },
            { label:"예상 급여", value: monthStats.estPay ? `${monthStats.estPay.toLocaleString()}원` : "-" },
          ].map(r => (
            <div key={r.label} style={{ textAlign:"center" }}>
              <p style={{ fontSize:20, fontWeight:900, color:"#7c3aed", margin:"0 0 4px" }}>{r.value}</p>
              <p style={{ fontSize:10, color:"var(--text-muted)", margin:0 }}>{r.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 최근 근무 */}
      <div style={{ ...cardStyle, padding:"14px 16px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <p style={{ fontSize:12, fontWeight:700, color:"var(--text-muted)", margin:0 }}>최근 근무 기록</p>
          <span style={{ fontSize:11, color:"var(--text-muted)" }}>이번달</span>
        </div>
        {recentAtt.length === 0 ? (
          <p style={{ fontSize:12, color:"var(--text-muted)", textAlign:"center", padding:"12px 0", margin:0 }}>이번달 근무 기록이 없어요</p>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {recentAtt.map((a:any) => {
              const cin = a.check_in ? new Date(a.check_in).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"}) : "-";
              const cout = a.check_out ? new Date(a.check_out).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"}) : "-";
              return (
                <div key={a.work_date} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", background:"var(--surface2)", borderRadius:10 }}>
                  <span style={{ fontSize:14 }}>{STATUS_EMOJI[a.status]||"📅"}</span>
                  <div style={{ flex:1 }}>
                    <span style={{ fontSize:12, fontWeight:600, color:"var(--text)" }}>{a.work_date}</span>
                    <span style={{ fontSize:11, color:"var(--text-muted)", marginLeft:8 }}>{cin} ~ {cout}</span>
                  </div>
                  <span style={{ fontSize:11, color: STATUS_COLOR[a.status]||"var(--text-muted)", fontWeight:600 }}>
                    {STATUS_LABEL[a.status]||a.status} {a.actual_hours ? `${a.actual_hours}h` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const PERSONALITY_EMOJI: Record<string, string> = {
  "폭풍처리형":"⚡","꼼꼼탐정형":"🔍","공감마스터형":"💕",
  "돌격대장형":"🚀","묵묵수행형":"🎯","분위기메이커형":"🌟",
  "균형조율형":"⚖️","창의탐험형":"🎨","장인기질형":"🔨",
  "안정추구형":"🛡️","소통달인형":"💬","열정폭발형":"🔥",
  "완벽주의형":"✨","리더십형":"👑","팀플레이어형":"🤝",
};

const BIZ_EMOJI: Record<string, string> = {
  "카페/음료":"☕","식당/음식점":"🍽️","편의점/마트":"🏪",
  "뷰티/미용":"💄","물류/배송":"📦","사무/행정":"💼",
  "판매/매장":"🛍️","이벤트/행사":"🎪","교육/돌봄":"📚",
};

function MyTeamPageContent() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userType, setUserType] = useState<string>("");
  const [employerResult, setEmployerResult] = useState<any>(null);
  const [attRefreshKey, setAttRefreshKey] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // 사장님 데이터
  const [members, setMembers] = useState<any[]>([]);
  const [myStore, setMyStore] = useState<any>(null);
  const [teamOpen, setTeamOpen] = useState(false);

  // 알바생 데이터
  const [current, setCurrent] = useState<any[]>([]);
  const [workOpen, setWorkOpen] = useState(false);

  const userTypeRef = useRef<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push("/login"); return; }
      setUser(data.user);
      loadUserType(data.user.id);
    });

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      supabase.auth.getUser().then(({ data }) => {
        if (!data.user) return;
        const ut = userTypeRef.current;
        if (ut === "employer" || ut === "both") loadTeam(data.user.id);
        if (ut === "worker" || ut === "both") loadMyWork(data.user.id);
      });
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  async function loadUserType(uid: string) {
    const { data } = await supabase.from("users")
      .select("user_type, nickname, avatar_url, employer_result")
      .eq("id", uid).single();
    const ut = data?.user_type || "worker";
    setUserType(ut);
    userTypeRef.current = ut;
    if (data?.employer_result) setEmployerResult(data.employer_result);
    if (data) setUser((p: any) => ({ ...p, ...data }));
    if (ut === "employer" || ut === "both") loadTeam(uid);
    if (ut === "worker" || ut === "both") loadMyWork(uid);
    setLoading(false);
  }

  async function loadTeam(uid: string) {
    // 내 매장 정보
    const { data: storeData } = await supabase.from("employer_profiles")
      .select("id, business_name, business_type, region, wage, work_days, work_hours, is_active")
      .eq("user_id", uid).eq("is_deleted", false)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    setMyStore(storeData || null);

    const { data } = await supabase.from("team_members")
      .select(`id, worker_id, employer_id, hire_date, status, wage, work_days, work_hours, member_role,
        users!team_members_worker_id_fkey (nickname, avatar_url, worker_result, email, trust_score)`)
      .eq("employer_id", uid).eq("status", "active")
      .order("hire_date", { ascending: false });
    if (!data) return;

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`;
    const ids = data.map(m => m.id);
    const { data: att } = ids.length > 0
      ? await supabase.from("attendance").select("team_member_id, status").in("team_member_id", ids).gte("work_date", monthStart)
      : { data: [] };

    const enriched = data.map(m => ({
      ...m,
      worker: (m as any).users,
      thisMonth: att?.filter(a => a.team_member_id === m.id && (a.status==="normal"||a.status==="late")).length || 0,
      late: att?.filter(a => a.team_member_id === m.id && a.status==="late").length || 0,
      contractStatus: "none",
    }));
    setMembers(enriched);
    if (enriched.length > 0) setTeamOpen(true);
  }

  async function loadMyWork(uid: string) {
    const { data: activeData } = await supabase.from("team_members")
      .select(`id, wage, work_hours, work_days, hire_date, status, employer_id, role_desc, invite_status, created_at,
        users!team_members_employer_id_fkey (nickname, avatar_url)`)
      .eq("worker_id", uid).eq("status", "active")
      .order("created_at", { ascending: false });

    const empIds = (activeData||[]).map((d: any) => d.employer_id);
    const profiles: any[] = [];
    if (empIds.length > 0) {
      for (const empId of [...new Set(empIds)]) {
        const { data: ep } = await supabase.from("employer_profiles")
          .select("user_id, business_name, business_type, region")
          .eq("user_id", empId)
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        if (ep) profiles.push(ep);
      }
    }

    const mapped = (activeData||[]).map((d: any) => ({
      ...d,
      employer: d.users,
      profile: profiles.find((p: any) => p.user_id === d.employer_id),
      contractStatus: "none",
    }));
    setCurrent(mapped);
    if (mapped.length > 0) setWorkOpen(true);
  }

  const isEmployer = userType === "employer" || userType === "both";
  const isWorker = userType === "worker" || userType === "both";

  const contractBadge = (status: string) => ({
    none: { label:"⚠️ 계약서미작성", color:"#ef4444", bg:"#ef444415" },
    pending: { label:"⏳ 서명대기", color:"#f59e0b", bg:"#f59e0b15" },
    done: { label:"📄 계약완료", color:"#10b981", bg:"#10b98115" },
  }[status] || { label:"⚠️ 미작성", color:"#ef4444", bg:"#ef444415" });

  return (
    <main style={{ minHeight:"100vh", background:"var(--bg)", paddingBottom:80 }}>
      <AppHeader title="팀·소속" showBack />
      <div style={{ maxWidth:480, margin:"0 auto", padding:"12px 16px 0" }}>
        {loading ? (
          <div style={{ textAlign:"center", padding:"60px 0", color:"var(--text-muted)" }}>로딩 중...</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:24 }}>

            {/* ── 내 소속 (worker / both) ── */}
            {isWorker && (
              <section>
                <button onClick={() => setWorkOpen(v => !v)}
                  style={{ width:"100%", background:"none", border:"none", padding:"4px 0 12px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <p style={{ fontSize:16, fontWeight:800, color:"var(--text)", margin:0 }}>내 소속</p>
                    {current.length > 0 && <span style={{ fontSize:12, background:"rgba(236,72,153,0.15)", color:"#f9a8d4", borderRadius:20, padding:"2px 10px", fontWeight:700 }}>{current.length}곳</span>}
                    {current.length === 0 && <span style={{ fontSize:12, color:"var(--text-muted)", opacity:0.6 }}>없음</span>}
                  </div>
                  <span style={{ color:"var(--text-muted)", fontSize:22, lineHeight:1, transition:"transform 0.2s", transform: workOpen ? "rotate(180deg)" : "none", display:"block" }}>⌄</span>
                </button>
                {workOpen && (
                  current.length === 0 ? (
                    <div style={{ ...cardStyle, padding:"28px 16px", textAlign:"center" }}>
                      <div style={{ fontSize:36, marginBottom:8 }}>🏪</div>
                      <p style={{ color:"var(--text-muted)", fontSize:13, margin:"0 0 12px" }}>소속 매장이 없어요</p>
                      <button onClick={() => router.push("/explore")}
                        style={{ ...btnPrimary, width:"auto", padding:"8px 20px", fontSize:13 }}>
                        공고 탐색하기 →
                      </button>
                    </div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
                      {current.map(m => (
                        <WorkerMemberScroll key={m.id} m={m} userId={user?.id||""} router={router}
                          onRefresh={() => setAttRefreshKey(prev => ({ ...prev, [m.id]: (prev[m.id]||0)+1 }))} />
                      ))}
                    </div>
                  )
                )}
              </section>
            )}

            {/* ── 내 팀 (employer / both) ── */}
            {isEmployer && (
              <section>
                <button onClick={() => setTeamOpen(v => !v)}
                  style={{ width:"100%", background:"none", border:"none", padding:"4px 0 12px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <p style={{ fontSize:16, fontWeight:800, color:"var(--text)", margin:0 }}>내 팀</p>
                    {members.length > 0 && <span style={{ fontSize:12, background:"rgba(124,58,237,0.15)", color:"#c4b5fd", borderRadius:20, padding:"2px 10px", fontWeight:700 }}>팀원 {members.length}명</span>}
                    {members.length === 0 && <span style={{ fontSize:12, color:"var(--text-muted)", opacity:0.6 }}>없음</span>}
                  </div>
                  <span style={{ color:"var(--text-muted)", fontSize:22, lineHeight:1, transition:"transform 0.2s", transform: teamOpen ? "rotate(180deg)" : "none", display:"block" }}>⌄</span>
                </button>
                {teamOpen && (<>

                {/* 내 매장 카드 */}
                {myStore && (
                  <div style={{ ...cardStyle, padding:0, overflow:"hidden", marginBottom:10 }}>
                    <div style={{ background:"linear-gradient(135deg,#7c3aed 60%,#ec4899)", padding:"16px 18px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                        <span style={{ fontSize:26 }}>{BIZ_EMOJI[myStore.business_type]||"🏪"}</span>
                        <div style={{ flex:1 }}>
                          <p style={{ fontSize:16, fontWeight:800, color:"#fff", margin:"0 0 2px" }}>{myStore.business_name}</p>
                          <p style={{ fontSize:11, color:"rgba(255,255,255,0.75)", margin:0 }}>
                            {myStore.business_type} · {myStore.region||"위치미정"}
                          </p>
                        </div>
                        <span style={{ fontSize:11, background:"rgba(255,255,255,0.2)", color:"#fff", borderRadius:20, padding:"3px 10px", fontWeight:600 }}>
                          {myStore.is_active ? "모집중" : "비공개"}
                        </span>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                        {[
                          { label:"시급", value: myStore.wage ? `${myStore.wage.toLocaleString()}원` : "미정" },
                          { label:"근무요일", value: myStore.work_days || "미정" },
                          { label:"근무시간", value: myStore.work_hours || "미정" },
                        ].map(r => (
                          <div key={r.label} style={{ background:"rgba(255,255,255,0.15)", borderRadius:10, padding:"8px 10px" }}>
                            <p style={{ fontSize:10, color:"rgba(255,255,255,0.7)", margin:"0 0 2px" }}>{r.label}</p>
                            <p style={{ fontSize:12, fontWeight:700, color:"#fff", margin:0 }}>{r.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => router.push(`/employer/register?edit=true&jobId=${myStore.id}&return=myteam`)}
                      style={{ width:"100%", background:"none", border:"none", padding:"11px 18px", fontSize:12, color:"var(--text-muted)", cursor:"pointer", textAlign:"left", display:"flex", alignItems:"center", gap:8 }}>
                      ✏️ 매장 정보 수정
                    </button>
                  </div>
                )}

                {/* 팀원 수 + 초대 */}
                <div style={{ background:"linear-gradient(135deg,#7c3aed 60%,#ec4899)", borderRadius:16, padding:"14px 20px", marginBottom:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <p style={{ fontSize:11, color:"rgba(255,255,255,0.7)", margin:"0 0 2px" }}>현재 팀원</p>
                    <p style={{ fontSize:28, fontWeight:900, color:"#fff", margin:0 }}>{members.length}명</p>
                  </div>
                  <button onClick={() => router.push("/invite")}
                    style={{ background:"rgba(255,255,255,0.2)", border:"1px solid rgba(255,255,255,0.3)", borderRadius:12, padding:"8px 16px", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                    📨 초대하기
                  </button>
                </div>

                {members.length === 0 ? (
                  <div style={{ ...cardStyle, padding:"28px 16px", textAlign:"center" }}>
                    <div style={{ fontSize:36, marginBottom:8 }}>👥</div>
                    <p style={{ color:"var(--text-muted)", fontSize:13, margin:0 }}>아직 팀원이 없어요</p>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {members.map(m => {
                      const pType = m.worker?.worker_result?.personalityType;
                      const badge = contractBadge(m.contractStatus);
                      const name = m.worker?.nickname || (m.worker?.email ? m.worker.email.split("@")[0] : "팀원");
                      return (
                        <div key={m.id} style={{ ...cardStyle, padding:14, display:"flex", gap:12, alignItems:"center" }}>
                          <div onClick={() => router.push(`/employer/team/${m.id}`)}
                            style={{ width:48, height:48, borderRadius:"50%", background:"linear-gradient(135deg,#f59e0b,#ef4444)", overflow:"hidden", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, cursor:"pointer" }}>
                            {m.worker?.avatar_url
                              ? <img src={m.worker.avatar_url} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                              : (PERSONALITY_EMOJI[pType] || "👤")}
                          </div>
                          <div onClick={() => router.push(`/employer/team/${m.id}`)} style={{ flex:1, minWidth:0, cursor:"pointer" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                              <span style={{ fontSize:14, fontWeight:700, color:"var(--text)" }}>{name}</span>
                              {m.member_role === "manager" && <span style={{ fontSize:10, background:"#f59e0b20", color:"#f59e0b", borderRadius:6, padding:"1px 6px", fontWeight:700 }}>매니저</span>}
                              {pType && <span style={{ fontSize:10, background:"var(--surface2)", borderRadius:6, padding:"1px 6px", color:"var(--text-muted)" }}>{pType}</span>}
                              {m.worker?.trust_score != null && (() => {
                                const g = getTrustGrade(m.worker.trust_score);
                                return <span style={{ fontSize:10, color:g.color, fontWeight:700 }}>{g.emoji}</span>;
                              })()}
                            </div>
                            <p style={{ fontSize:11, color:"var(--text-muted)", margin:"0 0 5px" }}>
                              {m.work_days||"요일미정"} · {m.wage ? m.wage.toLocaleString()+"원" : "시급미정"} · 이번달 {m.thisMonth}일
                            </p>
                            <span style={{ fontSize:11, borderRadius:6, padding:"2px 7px", background:badge.bg, color:badge.color }}>{badge.label}</span>
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                            <button onClick={async e => {
                              e.stopPropagation();
                              const newRole = m.member_role === "manager" ? "staff" : "manager";
                              await supabase.from("team_members").update({ member_role: newRole }).eq("id", m.id);
                              setMembers((prev: any[]) => prev.map((tm: any) => tm.id === m.id ? { ...tm, member_role: newRole } : tm));
                            }} style={{ background: m.member_role==="manager"?"#f59e0b20":"var(--surface2)", border:`1px solid ${m.member_role==="manager"?"#f59e0b":"var(--border)"}`, borderRadius:8, padding:"4px 8px", fontSize:10, color: m.member_role==="manager"?"#f59e0b":"var(--text-muted)", cursor:"pointer", fontWeight:600, whiteSpace:"nowrap" }}>
                              {m.member_role === "manager" ? "매니저 해제" : "매니저 지정"}
                            </button>
                            <span style={{ color:"var(--text-muted)", fontSize:16, cursor:"pointer" }} onClick={() => router.push(`/employer/team/${m.id}`)}>›</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                </>)}
              </section>
            )}

          </div>
        )}
      </div>
    </main>
  );
}

export default function MyTeamPage() {
  return (
    <Suspense fallback={<div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}><p style={{ color:"var(--text-muted)" }}>로딩 중...</p></div>}>
      <MyTeamPageContent />
    </Suspense>
  );
}
