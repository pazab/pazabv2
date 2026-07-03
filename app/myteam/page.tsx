"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import InviteBottomSheet from "@/components/InviteBottomSheet";
import StoreRegisterModal from "@/components/StoreRegisterModal";
import DateWheelPicker from "@/components/DateWheelPicker";

import { getTrustGrade } from "@/lib/utils";
import { sendPushNotification } from "@/lib/usePush";
import { cardStyle, cardInnerStyle, cardGradientStyle, btnPrimary, btnSecondary, modalOverlay, modalSheet } from "@/lib/styles";

// 거리 계산 헬퍼 함수 (Haversine 공식)
function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // 지구 반지름(m)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 출퇴근 버튼 컴포넌트
function CheckInButton({ member, userId, onRefresh }: { member: any; userId: string; onRefresh?: () => void }) {
  const [todayAtt, setTodayAtt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  // KST 기준 오늘 날짜
  const today = (() => {
    const d = new Date();
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().split("T")[0];
  })();

  const storeLat = member.profile?.lat;
  const storeLng = member.profile?.lng;

  const checkLocation = () => {
    if (storeLat == null || storeLng == null) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const dist = getDistanceMeters(latitude, longitude, storeLat, storeLng);
        setDistance(dist);
        setGpsError(null);
        setGpsLoading(false);
      },
      (err) => {
        console.error(err);
        let errorMsg = "GPS 위치 정보를 가져올 수 없습니다.";
        if (err.code === err.PERMISSION_DENIED) {
          errorMsg = "위치 정보 권한이 거부되었습니다. 브라우저 위치 권한을 허용해 주세요.";
        }
        setGpsError(errorMsg);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    if (!member?.id) return;
    supabase.from("attendance")
      .select("*")
      .eq("team_member_id", member.id)
      .eq("work_date", today)
      .maybeSingle()
      .then(({ data }: { data: any }) => { setTodayAtt(data); setLoading(false); });

    checkLocation();
    const interval = setInterval(checkLocation, 20000); // 20초마다 위치 갱신
    return () => clearInterval(interval);
  }, [member?.id, storeLat, storeLng]);

  // 매장 좌표 정보가 아예 등록되어 있지 않다면 반경 체크 폴백 처리(버튼 무조건 활성)
  const hasStoreCoords = storeLat != null && storeLng != null;
  const isInRange = !hasStoreCoords || (distance !== null && distance <= 200);

  async function handleCheckIn() {
    if (!isInRange) {
      alert("📍 매장 반경 200m 외부에서는 출근할 수 없습니다.");
      return;
    }

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
      
      // 지각/정시 판정 얼럿 띄우기
      if (status === "late") {
        alert(`⏰ 지각으로 출근 처리되었습니다.\n(출근 시각: ${timeStr})`);
      } else {
        alert(`✅ 정상 출근 완료!\n(출근 시각: ${timeStr})`);
      }

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
    } else if (error) {
      alert("출근 처리 중 오류가 발생했습니다: " + error.message);
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
      
      alert("🔴 퇴근이 완료되었습니다. 오늘도 수고하셨습니다!");

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
    } else if (error) {
      alert("퇴근 처리 중 오류가 발생했습니다: " + error.message);
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
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button onClick={handleCheckIn} disabled={processing || !isInRange || gpsLoading}
            style={{
              width:"100%",
              background: !isInRange ? "var(--border)" : "linear-gradient(135deg,#10b981,#059669)",
              border:"none",
              borderRadius:14,
              padding:14,
              color:"#fff",
              fontSize:15,
              fontWeight:700,
              cursor: !isInRange ? "not-allowed" : "pointer",
              display:"flex",
              alignItems:"center",
              justifyContent:"center",
              gap:8,
              opacity: !isInRange ? 0.6 : 1
            }}
          >
            {processing ? "처리 중..." : gpsLoading ? "위치 확인 중..." : <>🟢 출근하기</>}
          </button>
          {hasStoreCoords && (
            <p style={{ fontSize: 11, color: isInRange ? "#10b981" : "var(--text-muted)", margin: "0 0 4px", textAlign: "center", fontWeight: 600 }}>
              {gpsLoading ? "📡 내 위치를 측정하고 있습니다..." :
               isInRange ? `✓ 매장 반경 내에 있습니다. (거리: ${Math.round(distance || 0)}m)` :
               `📍 매장 외부입니다. (거리: ${Math.round(distance || 0)}m / 200m 이내 가능)`}
            </p>
          )}
          {gpsError && (
            <p style={{ fontSize: 11, color: "#ef4444", margin: 0, textAlign: "center" }}>
              ⚠️ {gpsError} (GPS를 활성화해 주세요)
            </p>
          )}
        </div>
      )}
      {checkedIn && !checkedOut && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <div style={{ background:"#10b98115", borderRadius:12, padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13, color:"#10b981", fontWeight:600 }}>✅ 근무 중</span>
            <span style={{ fontSize:12, color:"var(--text-muted)" }}>{checkInTime} 출근</span>
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
              const dayOfWeek = new Date(viewYear, viewMonth, day).getDay();
              const isSunday = dayOfWeek === 0;
              const isSaturday = dayOfWeek === 6;
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
      .then(({ data }: { data: any }) => setLogs(data || []));
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
      .then(({ data }: { data: any }) => { setPayslips(data || []); setLoading(false); });
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
      .then(({ data }: { data: any }) => {
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
  const [myStores, setMyStores] = useState<any[]>([]);
  const [membersByStore, setMembersByStore] = useState<Record<string, any[]>>({});
  const [statsByStore, setStatsByStore] = useState<Record<string, { today: number; pending: number }>>({});
  const [teamOpen, setTeamOpen] = useState(false);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ store: any; members: any[] } | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const showToast = (msg: string, _type?: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(""), 3000); };

  // 알바생 데이터
  const [current, setCurrent] = useState<any[]>([]);
  const [workOpen, setWorkOpen] = useState(false);

  const userTypeRef = useRef<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: any }) => {
      if (!data.user) { router.push("/login"); return; }
      setUser(data.user);
      loadUserType(data.user.id);
    });

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      supabase.auth.getUser().then(({ data }: { data: any }) => {
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
    if (ut === "employer" || ut === "both") { setTeamOpen(true); loadTeam(uid); }
    if (ut === "worker" || ut === "both") { setWorkOpen(true); loadMyWork(uid); }
    setLoading(false);
  }

  async function openDeleteModal(store: any) {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) return;
    // employer_profile_id로 우선 조회, 없으면 employer_id 전체에서 조회
    let { data: members } = await supabase
      .from("team_members")
      .select(`id, worker_id, member_role, users!team_members_worker_id_fkey (nickname)`)
      .eq("employer_profile_id", store.id)
      .eq("status", "active");
    if (!members || members.length === 0) {
      // employer_profile_id 미연결 팀원도 포함 (단일 매장이거나 연결 안 된 케이스)
      const { data: all } = await supabase
        .from("team_members")
        .select(`id, worker_id, employer_profile_id, member_role, users!team_members_worker_id_fkey (nickname)`)
        .eq("employer_id", u.id)
        .eq("status", "active");
      // employer_profile_id가 이 매장이거나, null인 경우 포함
      members = (all || []).filter(
        (m: any) => m.employer_profile_id === store.id || m.employer_profile_id === null
      );
    }
    setDeleteTarget({ store, members: members || [] });
  }

  async function loadTeam(uid: string) {
    // 모든 매장 로드
    const { data: stores } = await supabase.from("employer_profiles")
      .select("id, business_name, business_type, region, wage, work_days, work_hours, is_active, image_url")
      .eq("user_id", uid).or("is_deleted.is.null,is_deleted.eq.false").not("business_name", "is", null)
      .order("created_at", { ascending: false });
    const storeList = stores || [];
    setMyStores(storeList);

    // 첫 진입 시 첫 번째 매장 활성화
    if (storeList.length > 0) {
      setActiveStoreId(storeList[0].id);
    }

    // 모든 팀원 로드 (employer_profile_id 포함)
    const { data } = await supabase.from("team_members")
      .select(`id, worker_id, employer_id, employer_profile_id, hire_date, status, wage, work_days, work_hours, member_role,
        users!team_members_worker_id_fkey (nickname, avatar_url, worker_result, email, trust_score)`)
      .eq("employer_id", uid).eq("status", "active")
      .order("hire_date", { ascending: false });
    if (!data) return;

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`;
    const todayStr = (() => {
      const d = new Date();
      const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
      return kst.toISOString().split("T")[0];
    })();

    const ids = data.map((m: any) => m.id);
    const { data: att } = ids.length > 0
      ? await supabase.from("attendance").select("team_member_id, status, work_date").in("team_member_id", ids).gte("work_date", monthStart)
      : { data: [] };

    const { data: contractsData } = ids.length > 0
      ? await supabase.from("contracts").select("team_member_id, worker_signed, status").in("team_member_id", ids).neq("status", "superseded")
      : { data: [] };

    const enriched = data.map((m: any) => {
      const cList = (contractsData || []).filter((c: any) => c.team_member_id === m.id);
      const contractStatus = cList.length === 0 ? "none" : cList.some((c: any) => c.worker_signed) ? "done" : "pending";
      return {
        ...m,
        worker: (m as any).users,
        thisMonth: att?.filter((a: any) => a.team_member_id === m.id && (a.status==="normal"||a.status==="late")).length || 0,
        late: att?.filter((a: any) => a.team_member_id === m.id && a.status==="late").length || 0,
        contractStatus,
      };
    });

    // 매장별로 팀원 그룹핑 (employer_profile_id 없으면 첫 매장에 배치)
    const firstStoreId = storeList[0]?.id;
    const grouped: Record<string, any[]> = {};
    for (const s of storeList) grouped[s.id] = [];
    for (const m of enriched) {
      const storeId = m.employer_profile_id && grouped[m.employer_profile_id] ? m.employer_profile_id : firstStoreId;
      if (storeId) grouped[storeId] = [...(grouped[storeId] || []), m];
    }
    setMembersByStore(grouped);

    // 매장별 통계
    const stats: Record<string, { today: number; pending: number }> = {};
    for (const s of storeList) {
      const sm = grouped[s.id] || [];
      const smIds = sm.map((m: any) => m.id);
      stats[s.id] = {
        today: att?.filter((a: any) => smIds.includes(a.team_member_id) && a.work_date === todayStr && ["normal","late","early_leave"].includes(a.status)).length || 0,
        pending: sm.filter((m: any) => m.contractStatus !== "done").length,
      };
    }
    setStatsByStore(stats);
    if (storeList.length > 0) setTeamOpen(true);
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
    done: { label:"🎉 정상계약 완료", color:"#10b981", bg:"#10b98115" },
  }[status] || { label:"⚠️ 미작성", color:"#ef4444", bg:"#ef444415" });

  return (
    <main style={{ minHeight:"100vh", background:"var(--bg)", paddingBottom:80 }}>
      {toastMsg && (
        <div style={{ position:"fixed", top:60, left:"50%", transform:"translateX(-50%)", background:"#1a1a2e", color:"#fff", borderRadius:20, padding:"10px 20px", fontSize:13, zIndex:2000, whiteSpace:"nowrap", pointerEvents:"none" }}>
          {toastMsg}
        </div>
      )}
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
                    {myStores.length > 0 && <span style={{ fontSize:12, background:"rgba(124,58,237,0.15)", color:"#c4b5fd", borderRadius:20, padding:"2px 10px", fontWeight:700 }}>매장 {myStores.length}곳</span>}
                    {myStores.length === 0 && <span style={{ fontSize:12, color:"var(--text-muted)", opacity:0.6 }}>없음</span>}
                  </div>
                  <span style={{ color:"var(--text-muted)", fontSize:22, lineHeight:1, transition:"transform 0.2s", transform: teamOpen ? "rotate(180deg)" : "none", display:"block" }}>⌄</span>
                </button>
                {teamOpen && (<>

                {/* 매장 없는 사장님 — 등록 CTA */}
                {myStores.length === 0 && (
                  <div style={{ ...cardStyle, padding:"32px 20px", textAlign:"center", marginBottom:10 }}>
                    <div style={{ fontSize:40, marginBottom:10 }}>🏪</div>
                    <p style={{ color:"var(--text)", fontSize:15, fontWeight:700, margin:"0 0 6px" }}>아직 매장이 없어요</p>
                    <p style={{ color:"var(--text-muted)", fontSize:13, margin:"0 0 18px" }}>매장을 등록하면 팀원을 초대하고 근태·급여를 관리할 수 있어요</p>
                    <button onClick={() => { setEditingStore(null); setStoreModalOpen(true); }}
                      style={{ background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", borderRadius:14, padding:"12px 28px", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                      매장 등록하기 →
                    </button>
                  </div>
                )}

                {/* Samsung Pass 스타일 — 비활성 카드 위에 쌓이고, 누르면 맨 아래로 내려와 전체 표시 */}
                {myStores.length > 0 && (() => {
                  const PEEK = 52; // 비활성 카드 한 장이 보이는 높이 (한 줄만)
                  const activeStore = myStores.find((s: any) => s.id === activeStoreId) || myStores[0];
                  const activeMembers = membersByStore[activeStore.id] || [];
                  const activeStats = statsByStore[activeStore.id] || { today:0, pending:0 };
                  // 비활성 카드들을 위에, 활성 카드를 맨 아래에 정렬
                  const sorted = [
                    ...myStores.filter((s: any) => s.id !== activeStore.id),
                    activeStore,
                  ];
                  const inactiveCount = sorted.length - 1;

                  const CARD_GRADIENTS = [
                    "linear-gradient(135deg,#4c1d95 0%,#5b21b6 100%)",
                    "linear-gradient(135deg,#1e40af 0%,#1d4ed8 100%)",
                    "linear-gradient(135deg,#065f46 0%,#047857 100%)",
                    "linear-gradient(135deg,#9d174d 0%,#be185d 100%)",
                    "linear-gradient(135deg,#92400e 0%,#b45309 100%)",
                    "linear-gradient(135deg,#1e3a5f 0%,#164e63 100%)",
                  ];

                  return (
                    <div>
                      <div style={{ position:"relative", height: inactiveCount * PEEK }}>
                        {/* 비활성 카드 — 절대 위치로 쌓임 */}
                        {sorted.slice(0, -1).map((store: any, i: number) => {
                          const storeMembers = membersByStore[store.id] || [];
                          const stats = statsByStore[store.id] || { today:0, pending:0 };
                          return (
                            <div
                              key={store.id}
                              onClick={() => setActiveStoreId(store.id)}
                              style={{
                                position:"absolute", top: i * PEEK, left:0, right:0,
                                height: PEEK,
                                overflow:"hidden",
                                borderRadius:16,
                                cursor:"pointer",
                                zIndex: inactiveCount - i,
                                background: CARD_GRADIENTS[i % CARD_GRADIENTS.length],
                                boxShadow:"0 4px 16px rgba(0,0,0,0.5)",
                              }}>
                              {/* 한 줄만 보이는 헤더 */}
                              <div style={{ display:"flex", alignItems:"center", gap:10, padding:"0 14px", height: PEEK }}>
                                <span style={{ fontSize:18, flexShrink:0 }}>{BIZ_EMOJI[store.business_type]||"🏪"}</span>
                                <span style={{ fontSize:13, fontWeight:700, color:"rgba(255,255,255,0.8)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{store.business_name}</span>
                                <span style={{ fontSize:11, color:"rgba(255,255,255,0.45)", whiteSpace:"nowrap", flexShrink:0 }}>{store.business_type||"업종미정"} · {storeMembers.length}명</span>
                                {stats.pending > 0 && <span style={{ width:7, height:7, borderRadius:"50%", background:"#ef4444", flexShrink:0 }} />}
                                <button onClick={e => { e.stopPropagation(); openDeleteModal(store); }}
                                  style={{ background:"rgba(0,0,0,0.25)", border:"none", borderRadius:"50%", width:22, height:22, display:"flex", alignItems:"center", justifyContent:"center", color:"rgba(255,255,255,0.7)", fontSize:12, cursor:"pointer", flexShrink:0, lineHeight:1 }}>
                                  ✕
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* 활성 카드 — 맨 아래, 전체 표시 */}
                      <div style={{ borderRadius:16, overflow:"hidden", boxShadow:"0 8px 32px rgba(124,58,237,0.35)" }}>
                        {/* 활성 카드 헤더 — 색상 */}
                        <div style={{ background:"linear-gradient(135deg,#7c3aed 0%,#a855f7 55%,#ec4899 100%)", height: PEEK, display:"flex", alignItems:"center", gap:10, padding:"0 14px" }}>
                          <span style={{ fontSize:20, flexShrink:0 }}>{BIZ_EMOJI[activeStore.business_type]||"🏪"}</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <p style={{ fontSize:14, fontWeight:800, color:"#fff", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{activeStore.business_name}</p>
                            <p style={{ fontSize:10, color:"rgba(255,255,255,0.65)", margin:0 }}>{activeStore.business_type||"업종미정"}{activeStore.address ? " · "+activeStore.address.slice(0,12) : ""}</p>
                          </div>
                          <button onClick={() => { setEditingStore(activeStore); setStoreModalOpen(true); }}
                            style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, padding:"5px 10px", color:"rgba(255,255,255,0.9)", fontSize:11, cursor:"pointer", flexShrink:0 }}>
                            ✏️ 수정
                          </button>
                          <button onClick={() => openDeleteModal(activeStore)}
                            style={{ background:"rgba(239,68,68,0.25)", border:"none", borderRadius:"50%", width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", color:"rgba(255,255,255,0.8)", fontSize:13, cursor:"pointer", flexShrink:0 }}>
                            ✕
                          </button>
                        </div>
                        {/* 통계 */}
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:1, background:"var(--border)" }}>
                          {[
                            { label:"총 팀원", value: activeMembers.length },
                            { label:"오늘 출근", value: activeStats.today },
                            { label:"계약 대기", value: activeStats.pending, alert: activeStats.pending > 0 },
                          ].map(s => (
                            <div key={s.label} style={{ background:"var(--surface)", padding:"9px 8px", textAlign:"center" }}>
                              <p style={{ fontSize:9, color:"var(--text-muted)", margin:"0 0 1px" }}>{s.label}</p>
                              <p style={{ fontSize:15, fontWeight:800, color: s.alert ? "#f87171" : "var(--text)", margin:0 }}>{s.value}</p>
                            </div>
                          ))}
                        </div>
                        {/* 초대 + 팀원 */}
                        <div style={{ background:"var(--surface)" }}>
                          <div style={{ padding:"10px 12px", borderBottom:"1px solid var(--border)", display:"flex", gap:8 }}>
                            <button onClick={() => setInviteOpen(true)}
                              style={{ flex:1, background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", borderRadius:10, padding:"9px", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                              📨 팀원 초대
                            </button>
                            <button onClick={() => router.push(`/employer/register?storeId=${activeStore.id}`)}
                              style={{ flex:1, background: activeStore.is_active ? "var(--surface2)" : "linear-gradient(135deg,#059669,#10b981)", border: activeStore.is_active ? "1px solid var(--border)" : "none", borderRadius:10, padding:"9px", color: activeStore.is_active ? "var(--text-muted)" : "#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                              {activeStore.is_active ? "📋 공고수정" : "📢 공고올리기"}
                            </button>
                          </div>
                          {activeMembers.length === 0 ? (
                            <div style={{ textAlign:"center", padding:"20px 0" }}>
                              <div style={{ fontSize:28, marginBottom:6 }}>👥</div>
                              <p style={{ color:"var(--text-muted)", fontSize:13, margin:0 }}>아직 팀원이 없어요</p>
                            </div>
                          ) : activeMembers.map((m: any) => {
                            const pType = m.worker?.worker_result?.personalityType;
                            const badge = contractBadge(m.contractStatus);
                            const name = m.worker?.nickname || (m.worker?.email ? m.worker.email.split("@")[0] : "팀원");
                            return (
                              <div key={m.id} style={{ padding:"10px 12px", borderTop:"1px solid var(--border)", display:"flex", gap:10, alignItems:"center" }}>
                                <div onClick={() => router.push(`/employer/team/${m.id}`)}
                                  style={{ width:40, height:40, borderRadius:"50%", background:"linear-gradient(135deg,#f59e0b,#ef4444)", overflow:"hidden", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, cursor:"pointer" }}>
                                  {m.worker?.avatar_url ? <img src={m.worker.avatar_url} style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : (PERSONALITY_EMOJI[pType]||"👤")}
                                </div>
                                <div onClick={() => router.push(`/employer/team/${m.id}`)} style={{ flex:1, minWidth:0, cursor:"pointer" }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
                                    <span style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>{name}</span>
                                    {m.member_role === "manager" && <span style={{ fontSize:10, background:"#f59e0b20", color:"#f59e0b", borderRadius:5, padding:"1px 5px", fontWeight:700 }}>매니저</span>}
                                    {m.worker?.trust_score != null && (() => { const g = getTrustGrade(m.worker.trust_score); return <span style={{ fontSize:10, color:g.color, fontWeight:700 }}>{g.emoji}</span>; })()}
                                  </div>
                                  <p style={{ fontSize:11, color:"var(--text-muted)", margin:"0 0 3px" }}>
                                    {m.work_days||"요일미정"} · {m.wage ? m.wage.toLocaleString()+"원" : "시급미정"} · 이번달 {m.thisMonth}일
                                  </p>
                                  <span onClick={e => { e.stopPropagation(); router.push(m.contractStatus==="none"?`/contract?memberId=${m.id}`:`/contract/view?memberId=${m.id}`); }}
                                    style={{ fontSize:11, borderRadius:5, padding:"2px 6px", background:badge.bg, color:badge.color, cursor:"pointer" }}>
                                    {badge.label}
                                  </span>
                                </div>
                                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
                                  <button onClick={async e => {
                                    e.stopPropagation();
                                    const newRole = m.member_role === "manager" ? "staff" : "manager";
                                    await supabase.from("team_members").update({ member_role: newRole }).eq("id", m.id);
                                    setMembersByStore(prev => {
                                      const u = { ...prev };
                                      u[activeStore.id] = (u[activeStore.id]||[]).map((tm: any) => tm.id === m.id ? { ...tm, member_role: newRole } : tm);
                                      return u;
                                    });
                                  }} style={{ background:m.member_role==="manager"?"#f59e0b20":"var(--surface2)", border:`1px solid ${m.member_role==="manager"?"#f59e0b":"var(--border)"}`, borderRadius:7, padding:"3px 7px", fontSize:10, color:m.member_role==="manager"?"#f59e0b":"var(--text-muted)", cursor:"pointer", fontWeight:600, whiteSpace:"nowrap" }}>
                                    {m.member_role === "manager" ? "해제" : "매니저"}
                                  </button>
                                  <button onClick={async e => {
                                    e.stopPropagation();
                                    await supabase.from("team_members").update({ status: "left" }).eq("id", m.id);
                                    setMembersByStore(prev => {
                                      const u = { ...prev };
                                      u[activeStore.id] = (u[activeStore.id]||[]).filter((tm: any) => tm.id !== m.id);
                                      return u;
                                    });
                                    showToast(`${name}님 퇴사 처리됐어요.`);
                                  }} style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:7, padding:"3px 7px", fontSize:10, color:"#f87171", cursor:"pointer", fontWeight:600, whiteSpace:"nowrap" }}>
                                    퇴사
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* 매장 추가 + 서류 보관함 */}
                      <button onClick={() => { setEditingStore(null); setStoreModalOpen(true); }}
                        style={{ width:"100%", marginTop:10, background:"none", border:"1.5px dashed var(--border)", borderRadius:14, padding:"10px", color:"var(--text-muted)", fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                        + 매장 추가하기
                      </button>
                      <button onClick={() => router.push("/employer/records")}
                        style={{ width:"100%", marginTop:6, background:"rgba(139,92,246,0.08)", border:"1px solid rgba(139,92,246,0.2)", borderRadius:14, padding:"10px", color:"var(--purple-text)", fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                        📂 직원 서류 보관함
                      </button>
                    </div>
                  );
                })()}
                </>)}
              </section>
            )}

          </div>
        )}
      </div>
      <InviteBottomSheet
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSuccess={() => {
          if (user?.id) loadTeam(user.id);
        }}
      />
      {/* 매장 삭제 확인 팝업 */}
      {deleteTarget && (() => {
        const { store, members: storeMembers } = deleteTarget;
        const hasMembers = storeMembers.length > 0;
        const doDelete = async () => {
          if (hasMembers) return; // 안전장치 — 팀원 있으면 삭제 불가
          const { error } = await supabase.from("employer_profiles")
            .update({ is_deleted: true, is_active: false })
            .eq("id", store.id).eq("user_id", user!.id);
          if (error) { showToast("삭제 실패: " + error.message, "error"); return; }
          setDeleteTarget(null);
          if (activeStoreId === store.id) setActiveStoreId(null);
          showToast("매장이 삭제됐어요.");
          if (user?.id) loadTeam(user.id);
        };
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 24px" }}>
            <div style={{ background:"var(--surface)", borderRadius:20, padding:"24px 20px", width:"100%", maxWidth:320 }}>
              <div style={{ fontSize:36, textAlign:"center", marginBottom:12 }}>🗑️</div>
              <p style={{ fontSize:16, fontWeight:800, color:"var(--text)", textAlign:"center", margin:"0 0 8px" }}>매장 삭제</p>
              {hasMembers ? (
                <>
                  <p style={{ fontSize:13, color:"var(--text-muted)", textAlign:"center", margin:"0 0 12px", lineHeight:1.5 }}>
                    재직 중인 팀원이 <strong style={{ color:"#f87171" }}>{storeMembers.length}명</strong> 있어요.<br/>
                    팀원 퇴직 처리 후 매장을 삭제할 수 있어요.
                  </p>
                  <div style={{ background:"var(--surface2)", borderRadius:10, padding:"8px 12px", marginBottom:16, maxHeight:120, overflowY:"auto" }}>
                    {storeMembers.map((m: any) => (
                      <div key={m.id} style={{ fontSize:12, color:"var(--text-muted)", padding:"3px 0", display:"flex", alignItems:"center", gap:6 }}>
                        <span>👤</span>
                        <span>{(m as any).users?.nickname || "팀원"}</span>
                        {m.member_role === "manager" && <span style={{ fontSize:10, color:"#f59e0b" }}>매니저</span>}
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setDeleteTarget(null)}
                    style={{ width:"100%", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:12, padding:"12px", fontSize:14, color:"var(--text-muted)", cursor:"pointer", fontWeight:600 }}>
                    확인
                  </button>
                </>
              ) : (
                <>
                  <p style={{ fontSize:13, color:"var(--text-muted)", textAlign:"center", margin:"0 0 20px", lineHeight:1.5 }}>
                    <strong style={{ color:"var(--text)" }}>{store.business_name}</strong><br/>매장을 삭제할까요?
                  </p>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={() => setDeleteTarget(null)}
                      style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:12, padding:"11px", fontSize:14, color:"var(--text-muted)", cursor:"pointer", fontWeight:600 }}>
                      취소
                    </button>
                    <button onClick={doDelete}
                      style={{ flex:1, background:"#ef4444", border:"none", borderRadius:12, padding:"11px", fontSize:14, color:"#fff", cursor:"pointer", fontWeight:700 }}>
                      삭제
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
      {storeModalOpen && user?.id && (
        <StoreRegisterModal
          userId={user.id}
          existingStore={editingStore || undefined}
          onClose={() => { setStoreModalOpen(false); setEditingStore(null); }}
          onSaved={() => {
            setStoreModalOpen(false);
            setEditingStore(null);
            if (user?.id) loadTeam(user.id);
          }}
        />
      )}
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
