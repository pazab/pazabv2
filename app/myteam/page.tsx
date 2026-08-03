"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import InviteBottomSheet from "@/components/InviteBottomSheet";
import StoreRegisterModal from "@/components/StoreRegisterModal";
import UserProfileBottomSheet from "@/components/UserProfileBottomSheet";

import { getTrustGrade, isWorkingOnDay, KOREAN_DAY_BY_INDEX } from "@/lib/utils";
import { sendPushNotification } from "@/lib/usePush";
import { cardStyle, cardInnerStyle, cardGradientStyle, btnPrimary, btnSecondary, modalOverlay, modalSheet } from "@/lib/styles";
import { getTaxRates, calcDailyWorkerTax, calcInsuranceEligibility, calcInsuranceDeduction } from "@/lib/taxRates";
import { addRole } from "@/lib/onboarding";
import { useActiveRole, ACTIVE_ROLE_KEY } from "@/lib/useActiveRole";
import RoleToggleButton from "@/components/RoleToggleButton";

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

// "HH:MM~HH:MM" 또는 "HH:MM-HH:MM" 형식의 근무시간에서 시작/종료를 분단위로 추출 (야간 근무처럼 종료<시작이면 게이팅 안 함)
function parseShiftRange(workHours: string | null | undefined): { startMins: number; endMins: number } | null {
  if (!workHours) return null;
  const m = workHours.replace(/\s+/g, "").match(/(\d{1,2}):(\d{2})[~-](\d{1,2}):(\d{2})/);
  if (!m) return null;
  return {
    startMins: parseInt(m[1]) * 60 + parseInt(m[2]),
    endMins: parseInt(m[3]) * 60 + parseInt(m[4]),
  };
}

// 출퇴근 버튼 컴포넌트
function CheckInButton({ member, userId, onRefresh }: { member: any; userId: string; onRefresh?: () => void }) {
  const [todayAtt, setTodayAtt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [showOffScheduleConfirm, setShowOffScheduleConfirm] = useState(false);
  const [showCheckOutConfirm, setShowCheckOutConfirm] = useState(false);
  const [showCheckOutSuccess, setShowCheckOutSuccess] = useState(false);
  const [checkOutSuccessData, setCheckOutSuccessData] = useState<any>(null);

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

  // 오늘이 이 팀원의 정규 근무요일인지 (대타/추가근무면 아래 시간대 제한을 아예 적용하지 않음 — 요일이 다르면 저장된 근무시간 자체가 오늘 것이 아니라서)
  const todayKo = KOREAN_DAY_BY_INDEX[new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay()];
  const isScheduledToday = isWorkingOnDay(member?.work_days, todayKo);

  // 근무 종료 시각이 지났는데 아직 출근을 안 눌렀으면 셀프 출근을 막고 사장님 수정으로 유도
  // (지난 근무를 뒤늦게 셀프 체크인하면 시간이 꼬여서 "오늘 출근" 집계가 어긋나던 문제)
  const shiftRange = parseShiftRange(member?.work_hours);
  const nowMinsKst = (() => {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kst.getUTCHours() * 60 + kst.getUTCMinutes();
  })();
  const pastShiftEnd = !!(isScheduledToday && shiftRange && shiftRange.endMins > shiftRange.startMins && nowMinsKst > shiftRange.endMins);

  // 출근 10분 전 알림(크론)이 나가는 시점과 맞춰서, 그 전엔 셀프 체크인도 막음 (너무 이른 출근 찍기 방지)
  const beforeShiftStart = !!(isScheduledToday && shiftRange && nowMinsKst < shiftRange.startMins - 10);
  const shiftStartLabel = shiftRange ? `${String(Math.floor(shiftRange.startMins / 60)).padStart(2, "0")}:${String(shiftRange.startMins % 60).padStart(2, "0")}` : null;

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

    // 크론이 미리 만들어둔 absent 행 등 그날 기존 기록이 있을 수 있어 insert 대신 upsert로 덮어씀
    // (예전엔 매번 insert라서 같은 날짜에 행이 중복 생성되던 버그가 있었음)
    const { data, error } = await supabase.from("attendance").upsert({
      team_member_id: member.id,
      employer_id: member.employer_id,
      worker_id: userId,
      work_date: today,
      status,
      check_in: checkInTime,
      actual_hours: 0,
    }, { onConflict: "team_member_id,work_date" }).select().single();

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
      if (status === "late") {
        sendPushNotification({
          userId: member.employer_id,
          title: "⏰ 지각 출근 알림",
          body: `${(member as any)?.users?.nickname || "팀원"}님이 지각으로 출근했어요 (${timeStr})`,
          url: `/employer/team/${member.id}`,
          tag: "attendance"
        });
      } else {
        sendPushNotification({
          userId: member.employer_id,
          title: "✅ 출근 알림",
          body: `${(member as any)?.users?.nickname || "팀원"}님이 출근했어요 (${timeStr})`,
          url: `/employer/team/${member.id}`,
          tag: "attendance"
        });
      }
      
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
      
      const estimatedPay = member?.wage ? Math.round(diffHours * member.wage) : null;
      setCheckOutSuccessData({ diffHours, timeStr, estimatedPay });
      setShowCheckOutSuccess(true);

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
      {!checkedIn && pastShiftEnd && (() => {
        const RESOLVED_LABEL: Record<string, string> = { normal: "정상 출근", late: "지각 출근", early_leave: "조퇴", off: "휴무" };
        const resolvedStatus = todayAtt?.status && todayAtt.status !== "absent" ? RESOLVED_LABEL[todayAtt.status] : null;
        const isAbsent = todayAtt?.status === "absent";
        return (
          <div style={{
            background: isAbsent ? "rgba(239,68,68,0.08)" : resolvedStatus ? "rgba(16,185,129,0.08)" : "var(--surface2)",
            border: isAbsent ? "1px solid rgba(239,68,68,0.3)" : resolvedStatus ? "1px solid rgba(16,185,129,0.3)" : "none",
            borderRadius:14, padding:"12px 14px", textAlign:"center",
          }}>
            {isAbsent ? (
              <>
                <p style={{ fontSize:13, color:"var(--danger)", margin:0, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                  <i className="ti ti-x" aria-hidden="true" /> 결근으로 자동 처리됐어요
                </p>
                <p style={{ fontSize:11, color:"var(--text-muted)", margin:"4px 0 0" }}>사장님께도 알림이 갔어요. 실제로 근무하셨다면 사장님께 정정을 요청해 주세요</p>
              </>
            ) : resolvedStatus ? (
              <>
                <p style={{ fontSize:13, color:"#10b981", margin:0, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                  <i className="ti ti-circle-check" aria-hidden="true" /> {resolvedStatus}으로 처리됐어요
                </p>
                <p style={{ fontSize:11, color:"var(--text-muted)", margin:"4px 0 0" }}>사장님이 근태를 직접 기록해 주셨어요</p>
              </>
            ) : (
              <>
                <p style={{ fontSize:13, color:"var(--text-muted)", margin:0, fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                  <i className="ti ti-clock-off" aria-hidden="true" /> 오늘 근무 시간이 지났어요
                </p>
                <p style={{ fontSize:11, color:"var(--text-muted)", margin:"4px 0 0" }}>출근 기록이 필요하면 사장님께 확인 요청해 주세요</p>
              </>
            )}
          </div>
        );
      })()}
      {!checkedIn && !pastShiftEnd && beforeShiftStart && (
        <div style={{ background:"var(--surface2)", borderRadius:14, padding:"12px 14px", textAlign:"center" }}>
          <p style={{ fontSize:13, color:"var(--text-muted)", margin:0, fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            <i className="ti ti-clock" aria-hidden="true" /> 출근 10분 전부터 체크인할 수 있어요
          </p>
          <p style={{ fontSize:11, color:"var(--text-muted)", margin:"4px 0 0" }}>예정 출근 시각 {shiftStartLabel} · 알림도 이때부터 가요</p>
        </div>
      )}
      {!checkedIn && !pastShiftEnd && !beforeShiftStart && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button onClick={() => { if (!isScheduledToday) { setShowOffScheduleConfirm(true); } else { handleCheckIn(); } }} disabled={processing || !isInRange || gpsLoading}
            style={{
              width:"100%",
              background: !isInRange ? "var(--border)" : "var(--success)",
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
            {processing ? "처리 중..." : gpsLoading ? "위치 확인 중..." : <><i className="ti ti-login-2" aria-hidden="true" /> 출근하기</>}
          </button>
          {hasStoreCoords && (
            <p style={{ fontSize: 11, color: isInRange ? "#10b981" : "var(--text-muted)", margin: "0 0 4px", textAlign: "center", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              {gpsLoading ? (<><i className="ti ti-broadcast" aria-hidden="true" /> 내 위치를 측정하고 있습니다...</>) :
               isInRange ? (<><i className="ti ti-check" aria-hidden="true" /> 매장 반경 내에 있습니다. (거리: {Math.round(distance || 0)}m)</>) :
               (<><i className="ti ti-map-pin" aria-hidden="true" /> 매장 외부입니다. (거리: {Math.round(distance || 0)}m / 200m 이내 가능)</>)}
            </p>
          )}
          {gpsError && (
            <p style={{ fontSize: 11, color: "#ef4444", margin: 0, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <i className="ti ti-alert-triangle" aria-hidden="true" /> {gpsError} (GPS를 활성화해 주세요)
            </p>
          )}
        </div>
      )}
      {checkedIn && !checkedOut && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <div style={{ background:"#10b98115", borderRadius:12, padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13, color:"#10b981", fontWeight:600, display:"flex", alignItems:"center", gap:4 }}><i className="ti ti-circle-check" aria-hidden="true" /> 근무 중</span>
            <span style={{ fontSize:12, color:"var(--text-muted)" }}>{checkInTime} 출근</span>
          </div>
          <button onClick={() => setShowCheckOutConfirm(true)} disabled={processing}
            style={{ width:"100%", background:"var(--danger)", border:"none", borderRadius:14, padding:14, color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            {processing ? "처리 중..." : (<><i className="ti ti-logout" aria-hidden="true" /> 퇴근하기</>)}
          </button>
        </div>
      )}
      {checkedIn && checkedOut && (
        <div style={{ background:"var(--surface2)", borderRadius:12, padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:13, color:"var(--text-muted)", fontWeight:600, display:"flex", alignItems:"center", gap:4 }}><i className="ti ti-circle-check" aria-hidden="true" /> 오늘 근무 완료</span>
          <span style={{ fontSize:12, color:"var(--text-muted)" }}>{checkInTime} ~ {checkOutTime} ({todayAtt.actual_hours}h)</span>
        </div>
      )}
      {showOffScheduleConfirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:500, display:"flex", alignItems:"flex-end", justifyContent:"center" }}
          onClick={() => setShowOffScheduleConfirm(false)}>
          <div style={{ background:"var(--surface)", borderRadius:"20px 20px 0 0", padding:"24px 20px 36px", width:"100%", maxWidth:480 }}
            onClick={e => e.stopPropagation()}>
            <p style={{ fontSize:15, fontWeight:800, color:"var(--text)", marginBottom:6, display:"flex", alignItems:"center", gap:6 }}>
              <i className="ti ti-calendar-exclamation" aria-hidden="true" /> 오늘은 정규 근무일이 아니에요
            </p>
            <p style={{ fontSize:13, color:"var(--text-muted)", marginBottom:20, lineHeight:1.6 }}>
              등록된 근무요일({member?.work_days || "요일 미정"})에 오늘이 없어요.<br/>
              대타·추가 근무 등으로 출근하는 게 맞다면 계속 진행해 주세요.
            </p>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setShowOffScheduleConfirm(false)}
                style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:14, padding:14, color:"var(--text-muted)", fontSize:14, fontWeight:600, cursor:"pointer" }}>
                취소
              </button>
              <button onClick={() => { setShowOffScheduleConfirm(false); handleCheckIn(); }}
                style={{ flex:1, background:"var(--primary)", border:"none", borderRadius:14, padding:14, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                맞아요, 출근할게요
              </button>
            </div>
          </div>
        </div>
      )}
      {showCheckOutConfirm && (() => {
        const now = new Date();
        const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        const h = kst.getUTCHours();
        const m2 = kst.getUTCMinutes();
        const timeStr = `${String(h).padStart(2,"0")}:${String(m2).padStart(2,"0")}`;

        const checkIn = todayAtt?.check_in ? new Date(todayAtt.check_in) : new Date();
        const checkOut = new Date(`${today}T${timeStr}:00+09:00`);
        const diffHours = Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 36000) / 100);
        const estimatedPay = member?.wage ? Math.round(diffHours * member.wage) : null;

        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:500, display:"flex", alignItems:"flex-end", justifyContent:"center" }}
            onClick={() => setShowCheckOutConfirm(false)}>
            <div style={{ background:"var(--surface)", borderRadius:"24px 24px 0 0", padding:"24px 20px 36px", width:"100%", maxWidth:480, borderTop:"1px solid var(--border)" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ width:40, height:4, background:"var(--border)", borderRadius:2, margin:"0 auto 16px" }} />

              <p style={{ fontSize:17, fontWeight:800, color:"var(--text)", marginBottom:4, display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:20 }}>🔴</span> 오늘 근무를 마칠까요?
              </p>
              <p style={{ fontSize:12, color:"var(--text-muted)", marginBottom:18, lineHeight:1.5 }}>
                퇴근 처리 후에는 출퇴근 시간이 기록되고 사장님에게 알림이 발송됩니다.
              </p>

              <div style={{ background:"var(--surface2)", borderRadius:16, padding:"14px 16px", marginBottom:20, display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:12, color:"var(--text-muted)" }}>출근 시각</span>
                  <span style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>{checkInTime || "-"}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:12, color:"var(--text-muted)" }}>퇴근 시각 (현재)</span>
                  <span style={{ fontSize:13, fontWeight:700, color:"#ef4444" }}>{timeStr}</span>
                </div>
                <div style={{ borderTop:"1px dashed var(--border)", paddingTop:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>오늘 총 근무시간</span>
                  <span style={{ fontSize:15, fontWeight:900, color:"#7c3aed" }}>{diffHours}시간</span>
                </div>
                {estimatedPay != null && estimatedPay > 0 && (
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(124,58,237,0.08)", padding:"8px 12px", borderRadius:10, marginTop:2 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:"#7c3aed" }}>오늘 예상 정산액</span>
                    <span style={{ fontSize:14, fontWeight:900, color:"#7c3aed" }}>{estimatedPay.toLocaleString()}원</span>
                  </div>
                )}
              </div>

              <div style={{ display:"flex", gap:10 }}>
                <button onClick={() => setShowCheckOutConfirm(false)}
                  style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:14, padding:14, color:"var(--text-muted)", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                  취소
                </button>
                <button onClick={() => { setShowCheckOutConfirm(false); handleCheckOut(); }} disabled={processing}
                  style={{ flex:1.5, background:"var(--danger)", border:"none", borderRadius:14, padding:14, color:"#fff", fontSize:14, fontWeight:800, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                  {processing ? "처리 중..." : (<><i className="ti ti-logout" aria-hidden="true" /> 퇴근 확정하기</>)}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {showCheckOutSuccess && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:600, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
          onClick={() => setShowCheckOutSuccess(false)}>
          <div style={{ background:"var(--surface)", borderRadius:24, padding:"28px 24px 24px", width:"100%", maxWidth:380, textAlign:"center", border:"1px solid var(--border)", boxShadow:"var(--shadow-elevate)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width:64, height:64, borderRadius:"50%", background:"linear-gradient(135deg,#10b981,#059669)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", fontSize:32, color:"#fff", boxShadow:"0 6px 20px rgba(16,185,129,0.3)" }}>
              👏
            </div>

            <h3 style={{ fontSize:18, fontWeight:900, color:"var(--text)", margin:"0 0 6px" }}>
              오늘 하루도 수고하셨습니다!
            </h3>
            <p style={{ fontSize:13, color:"var(--text-muted)", margin:"0 0 20px", lineHeight:1.5 }}>
              무사히 퇴근 처리가 완료되었습니다.<br/>조심히 퇴근하시고 편안한 시간 되세요!
            </p>

            {checkOutSuccessData && (
              <div style={{ background:"var(--surface2)", borderRadius:16, padding:"14px 16px", marginBottom:20, textAlign:"left" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ fontSize:12, color:"var(--text-muted)" }}>총 근무시간</span>
                  <span style={{ fontSize:13, fontWeight:800, color:"var(--text)" }}>{checkOutSuccessData.diffHours}시간</span>
                </div>
                {checkOutSuccessData.estimatedPay != null && checkOutSuccessData.estimatedPay > 0 && (
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:12, color:"var(--text-muted)" }}>오늘 예상 일급</span>
                    <span style={{ fontSize:13, fontWeight:800, color:"#10b981" }}>{checkOutSuccessData.estimatedPay.toLocaleString()}원</span>
                  </div>
                )}
              </div>
            )}

            <button onClick={() => setShowCheckOutSuccess(false)}
              style={{ width:"100%", background:"var(--primary)", border:"none", borderRadius:14, padding:14, color:"#fff", fontSize:14, fontWeight:800, cursor:"pointer" }}>
              확인
            </button>
          </div>
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
  const statusIcon: Record<string,string> = { normal:"ti-circle-check", late:"ti-clock", early_leave:"ti-door-exit", absent:"ti-x", off:"ti-calendar-off" };
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
  const wageType = member?.wage_type || "hourly";
  const contractH = parseFloat(member?.work_hours) || 8;
  const workedDays = thisMonthStats.normal + thisMonthStats.late + thisMonthStats.early_leave;
  const expectedHours = workedDays * contractH;
  const overtimeHours = Math.max(0, totalActualHours - expectedHours);
  const scheduledDaysInMonth = (() => {
    if (!member?.work_days) return 0;
    const WORK_DAY_MAP: Record<string, number> = { 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6, 일: 0 };
    const scheduledDayNums = new Set<number>();
    for (const [label, num] of Object.entries(WORK_DAY_MAP)) {
      if (member.work_days.includes(label)) scheduledDayNums.add(num);
    }
    if (scheduledDayNums.size === 0) return 0;
    let count = 0;
    for (let d = 1; d <= monthDays; d++) {
      if (scheduledDayNums.has(new Date(viewYear, viewMonth, d).getDay())) count++;
    }
    return count;
  })();
  const estimatedPay = (() => {
    if (wageType === "monthly") {
      const dailyRate = scheduledDaysInMonth > 0 ? wage / scheduledDaysInMonth : 0;
      const base = Math.round(dailyRate * workedDays);
      const hourlyEquiv = wage / 209;
      const overtime = Math.round(overtimeHours * hourlyEquiv * 1.5);
      return base + overtime;
    } else if (wageType === "daily") {
      const base = workedDays * wage;
      const hourlyEquiv = contractH > 0 ? wage / contractH : 0;
      const overtime = Math.round(overtimeHours * hourlyEquiv * 1.5);
      return base + overtime;
    } else {
      const regularPay = Math.min(totalActualHours, expectedHours) * wage;
      const overtimePay = overtimeHours * wage * 1.5;
      return Math.round(regularPay + overtimePay);
    }
  })();

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
      <div style={{ background:"var(--primary-light)", borderRadius:14, padding:"14px 16px", marginBottom:14, border:"1px solid var(--primary-border)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <span style={{ fontSize:12, color:"var(--text-muted)" }}>총 근무시간</span>
          <span style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>{totalActualHours.toFixed(1)}시간</span>
        </div>
        {overtimeHours > 0 && (
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
            <span style={{ fontSize:12, color:"var(--warning)" }}>초과근무 (×1.5)</span>
            <span style={{ fontSize:13, fontWeight:700, color:"var(--warning)" }}>{overtimeHours.toFixed(1)}시간</span>
          </div>
        )}
        <div style={{ borderTop:"1px solid var(--primary-border)", paddingTop:8, display:"flex", justifyContent:"space-between" }}>
          <span style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>이번달 예상 급여</span>
          <span style={{ fontSize:15, fontWeight:900, color:"var(--primary)" }}>{estimatedPay > 0 ? estimatedPay.toLocaleString()+"원" : "-"}</span>
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
                      <i className={`ti ${statusIcon[att.status]}`} aria-hidden="true" /><br/>{statusShort[att.status]}
                      {att.actual_hours && att.status!=="absent" && att.status!=="off" && (
                        <><br/><span style={{ fontSize:8 }}>{att.actual_hours}h</span></>
                      )}
                      {att.memo && (
                        <><br/><i className="ti ti-note" style={{ fontSize:8, color:"#a78bfa" }} aria-hidden="true" /></>
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
    checkin: "출근", checkout: "퇴근", update: "수정됨", delete: "삭제됨",
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
                  {d.memo}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkerPayslipTab({ workerId, employerId, router, teamMemberId }: { workerId:string; employerId:string; router:any; teamMemberId?:string }) {
  const [payslips, setPayslips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandPayslips, setExpandPayslips] = useState(false);

  useEffect(() => {
    let q = supabase.from("payslips").select("*");
    if (teamMemberId) {
      q = q.eq("team_member_id", teamMemberId);
    } else {
      if (!workerId || !employerId) { setLoading(false); return; }
      q = q.eq("worker_id", workerId).eq("employer_id", employerId);
    }
    q.order("year", { ascending: false, nullsFirst: false })
      .order("month", { ascending: false, nullsFirst: false })
      .then(({ data }: { data: any }) => { setPayslips(data || []); setLoading(false); });
  }, [workerId, employerId, teamMemberId]);

  if (loading) return <p style={{ textAlign:"center", color:"var(--text-muted)", fontSize:13, padding:"16px 0" }}>로딩 중...</p>;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {payslips.length === 0 ? (
        <div style={{ textAlign:"center", padding:"24px 0" }}>
          <p style={{ fontSize:13, color:"var(--text-muted)" }}>발행된 임금 명세서가 없어요</p>
          <p style={{ fontSize:11, color:"var(--text-muted)", marginTop:4 }}>사장님이 명세서를 발행하면 여기서 확인할 수 있어요</p>
        </div>
      ) : (
        <>
          {(expandPayslips ? payslips : payslips.slice(0, 1)).map(p => (
            <div key={p.id} style={{ background:"var(--surface2)", borderRadius:12, padding:12, border:"1px solid var(--border)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <span style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>{p.year}년 {p.month}월</span>
                <div style={{ display:"flex", gap:4 }}>
                  {p.status === "confirmed" || p.confirmed_at ? (
                    <span style={{ fontSize:11, background:"rgba(16,185,129,0.2)", border:"1px solid rgba(16,185,129,0.4)", color:"#10b981", borderRadius:20, padding:"3px 9px", fontWeight:800, display:"flex", alignItems:"center", gap:4 }}>
                      <i className="ti ti-circle-check" style={{ fontSize:11 }} aria-hidden="true" /> 확인됨
                    </span>
                  ) : p.status === "correction_requested" ? (
                    <span style={{ fontSize:12, background:"rgba(239,68,68,0.25)", border:"1px solid rgba(239,68,68,0.5)", color:"#ef4444", borderRadius:20, padding:"4px 10px", fontWeight:800, display:"flex", alignItems:"center", gap:4 }}>
                      <i className="ti ti-alert-triangle" style={{ fontSize:12 }} aria-hidden="true" /> 수정요청됨
                    </span>
                  ) : (
                    <span style={{ fontSize:12, background:"rgba(245,158,11,0.25)", border:"1px solid rgba(245,158,11,0.5)", color:"#f59e0b", borderRadius:20, padding:"4px 10px", fontWeight:800, display:"flex", alignItems:"center", gap:4 }}>
                      <i className="ti ti-clock-hour-4" style={{ fontSize:12 }} aria-hidden="true" /> 확인대기
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display:"flex", gap:10, marginBottom:8 }}>
                <div><p style={{ fontSize:10, color:"var(--text-muted)", margin:"0 0 2px" }}>근무</p><p style={{ fontSize:12, fontWeight:600, margin:0 }}>{p.work_days}일/{p.total_hours}h</p></div>
                <div><p style={{ fontSize:10, color:"var(--text-muted)", margin:"0 0 2px" }}>지급액</p><p style={{ fontSize:14, fontWeight:700, color:"#7c3aed", margin:0 }}>{Number(p.total_pay).toLocaleString()}원</p></div>
              </div>
              <button onClick={() => router.push(`/payslip?id=${p.id}&tab=mywork`)}
                style={{ width:"100%", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, padding:"7px", fontSize:12, color:"var(--text-muted)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                <i className="ti ti-file-text" aria-hidden="true" /> 명세서 보기
              </button>
            </div>
          ))}
          {payslips.length > 1 && (
            <button
              type="button"
              onClick={() => setExpandPayslips(!expandPayslips)}
              style={{
                width: "100%",
                marginTop: 8,
                background: "var(--primary-light, rgba(139,92,246,0.12))",
                border: "1px solid var(--primary-border, rgba(139,92,246,0.3))",
                borderRadius: 12,
                padding: "8px",
                color: "var(--primary, #8b5cf6)",
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                outline: "none"
              }}
            >
              <span>{expandPayslips ? "명세서 접기" : `명세서 더보기 (외 ${payslips.length - 1}건)`}</span>
              <i className={`ti ${expandPayslips ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 13, fontWeight: 900 }} aria-hidden="true" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

const STATUS_ICON: Record<string,string> = { normal:"ti-circle-check", late:"ti-clock", early_leave:"ti-door-exit", absent:"ti-x", off:"ti-calendar-off" };
const STATUS_LABEL: Record<string,string> = { normal:"출근", late:"지각", early_leave:"조퇴", absent:"결근", off:"휴무" };
const STATUS_COLOR: Record<string,string> = { normal:"#10b981", late:"#f59e0b", early_leave:"#f59e0b", absent:"#ef4444", off:"#6b7280" };

function WorkerMemberScroll({ m, userId, router, onRefresh, forceOpenDocs, accentGradient }: { m: any; userId: string; router: any; onRefresh?: () => void; forceOpenDocs?: boolean; accentGradient?: string }) {
  const [recentAtt, setRecentAtt] = useState<any[]>([]);
  const [monthStats, setMonthStats] = useState({ days: 0, hours: 0, estPay: 0, netPay: 0 });
  const [contracts, setContracts] = useState<any[]>([]);
  const nowForView = new Date();
  const [viewYear, setViewYear] = useState(nowForView.getFullYear());
  const [viewMonth, setViewMonth] = useState(nowForView.getMonth()); // 0-indexed
  const [expandRecentAtt, setExpandRecentAtt] = useState(false);
  const [expandContracts, setExpandContracts] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [selectedTimetableDay, setSelectedTimetableDay] = useState<string>(() => {
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return days[new Date().getDay()];
  });

  useEffect(() => {
    if (forceOpenDocs) setDocsOpen(true);
  }, [forceOpenDocs]);

  useEffect(() => {
    const y = viewYear;
    const ms = `${y}-${String(viewMonth+1).padStart(2,"0")}-01`;
    const me = `${y}-${String(viewMonth+1).padStart(2,"0")}-${String(new Date(y, viewMonth+1, 0).getDate()).padStart(2,"0")}`;
    Promise.all([
      supabase.from("attendance")
        .select("work_date,status,actual_hours,check_in,check_out")
        .eq("team_member_id", m.id)
        .gte("work_date", ms)
        .lte("work_date", me)
        .order("work_date", { ascending: false }),
      getTaxRates(y)
    ]).then(([attRes, rates]) => {
      const att = attRes.data || [];
      setRecentAtt(att.slice(0, 31));
      const contractHours = m.work_hours ? parseFloat(m.work_hours) : 8;
      const workedDays = att.filter((a:any) => ["normal", "late", "early_leave"].includes(a.status)).length;
      const totalActualHours = att.filter((a:any) => a.status !== "absent" && a.status !== "off")
        .reduce((sum: number, a:any) => sum + (parseFloat(a.actual_hours) || contractHours), 0);

      const WORK_DAY_MAP: Record<string, number> = { 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6, 일: 0 };
      const scheduledDayNums = new Set<number>();
      if (m.work_days) {
        for (const [label, num] of Object.entries(WORK_DAY_MAP)) {
          if (m.work_days.includes(label)) scheduledDayNums.add(num);
        }
      }
      const scheduledDaysInMonth = (() => {
        if (scheduledDayNums.size === 0) return 0;
        const days = new Date(y, viewMonth + 1, 0).getDate();
        let count = 0;
        for (let d = 1; d <= days; d++) {
          if (scheduledDayNums.has(new Date(y, viewMonth, d).getDay())) count++;
        }
        return count;
      })();

      const expectedHours = workedDays * contractHours;
      const overtimeHours = Math.max(0, totalActualHours - expectedHours);
      const wage = m.wage || 0;
      const wageType = m.wage_type || "hourly";

      const estPay = (() => {
        if (wageType === "monthly") {
          const dailyRate = scheduledDaysInMonth > 0 ? wage / scheduledDaysInMonth : 0;
          const base = Math.round(dailyRate * workedDays);
          const hourlyEquiv = wage / 209;
          const overtime = Math.round(overtimeHours * hourlyEquiv * 1.5);
          return base + overtime;
        } else if (wageType === "daily") {
          const base = workedDays * wage;
          const hourlyEquiv = contractHours > 0 ? wage / contractHours : 0;
          const overtime = Math.round(overtimeHours * hourlyEquiv * 1.5);
          return base + overtime;
        } else {
          const regularPay = Math.min(totalActualHours, expectedHours) * wage;
          const overtimePay = overtimeHours * wage * 1.5;
          return Math.round(regularPay + overtimePay);
        }
      })();

      let deductions = 0;
      if (estPay > 0 && rates) {
        if (wageType === "daily") {
          let incomeTax = 0;
          let localTax = 0;
          const workDaysList = att.filter((a:any) => a.status !== "absent" && a.status !== "off");
          workDaysList.forEach((a:any) => {
            const dailyHours = parseFloat(a.actual_hours) || contractHours;
            const dailyPay = Math.round(dailyHours * wage);
            const tax = calcDailyWorkerTax(dailyPay);
            incomeTax += tax.incomeTax;
            localTax += tax.localTax;
          });
          deductions = incomeTax + localTax;
        } else {
          const eligibility = calcInsuranceEligibility({
            monthlyHours: totalActualHours,
            contractMonths: 0,
            isDailyWorker: false
          });
          const ins = calcInsuranceDeduction(estPay, rates, eligibility);
          deductions = ins.total;
        }
      }

      setMonthStats({
        days: workedDays,
        hours: Math.round(totalActualHours * 10) / 10,
        estPay: estPay,
        netPay: Math.max(0, estPay - deductions)
      });
    });
    supabase.from("contracts")
      .select("id, start_date, end_date, worker_signed, employer_signed, status, created_at, contract_data")
      .eq("team_member_id", m.id)
      .in("status", ["pending", "active"])
      .order("created_at", { ascending: false })
      .then(({ data }: { data: any }) => setContracts(data || []));
  }, [m.id, viewYear, viewMonth]);

  const storeName = m.profile?.business_name || m.employer?.nickname || "매장";
  const monthLabel = `${viewYear}년 ${viewMonth+1}월`;
  const isCurrentMonthView = (() => {
    const n = new Date();
    return viewYear === n.getFullYear() && viewMonth === n.getMonth();
  })();

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {/* 매장 정보 카드 */}
      <div style={{ ...cardStyle, padding: 0, overflow:"hidden" }}>
        {/* 헤더 — 매장별 고유 색상은 여기까지만 */}
        <div style={{ background: accentGradient || "var(--primary)", padding:"16px 18px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <i className={`ti ${BIZ_ICON[m.profile?.business_type]||"ti-building-store"}`} style={{ fontSize:26, color:"#fff" }} aria-hidden="true" />
            <div style={{ flex:1 }}>
              <p style={{ fontSize:16, fontWeight:800, color:"#fff", margin:"0 0 2px" }}>{storeName}</p>
              <p style={{ fontSize:11, color:"rgba(255,255,255,0.75)", margin:0 }}>
                {m.profile?.business_type} · {m.profile?.region||"위치미정"}
              </p>
            </div>
            <span style={{ fontSize:11, background:"rgba(255,255,255,0.2)", color:"#fff", borderRadius:20, padding:"3px 10px", fontWeight:600 }}>재직중</span>
          </div>
        </div>

        {/* 급여 + 요일별 근무 시간표 — 중립 배경 */}
        <div style={{ padding:"14px 18px", borderBottom:"1px solid var(--border)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={{ fontSize:12, color:"var(--text-muted)" }}>
              {m.wage_type === "monthly" ? "월급" : m.wage_type === "daily" ? "일급" : m.wage_type === "weekly" ? "주급" : "시급"}
            </span>
            <span style={{ fontSize:14, fontWeight:800, color:"var(--text)" }}>{m.wage ? `${m.wage.toLocaleString()}원` : "미정"}</span>
          </div>

          {/* 📅 요일별 근무 시간표 — 사장님 "우리 매장"과 동일한 패턴 */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={{ fontSize:11, fontWeight:700, color:"var(--text-muted)", display:"flex", alignItems:"center", gap:4 }}><i className="ti ti-calendar" aria-hidden="true" /> 요일별 근무 시간표</span>
            <div style={{ display:"flex", gap:3 }}>
              {["월","화","수","목","금","토","일"].map(day => {
                const isSelected = selectedTimetableDay === day;
                return (
                  <button key={day} type="button" onClick={() => setSelectedTimetableDay(day)}
                    style={{
                      width:24, height:24, borderRadius:"50%", border:"none", fontSize:10, fontWeight:800, cursor:"pointer",
                      background: isSelected ? (accentGradient || "var(--primary)") : "var(--surface2)",
                      color: isSelected ? "#fff" : "var(--text-muted)",
                      display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.15s",
                    }}>
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          {(() => {
            const parseHours = (hoursStr: string | null | undefined) => {
              const match = (hoursStr || "").match(/(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/);
              if (!match) return null;
              const startHour = parseInt(match[1]);
              const startMin = parseInt(match[2]);
              const endHour = parseInt(match[3]);
              const endMin = parseInt(match[4]);
              return { start: startHour + startMin / 60, end: endHour + endMin / 60, label: `${match[1]}:${match[2]}~${match[3]}:${match[4]}` };
            };
            const latestContract = contracts.find(c => c.status === "active") || contracts[0];
            const cd = latestContract?.contract_data;
            const cleanWorkHours = (m.work_hours || "").replace(/\s+/g, "");
            const hoursStr = cleanWorkHours.includes("~") || cleanWorkHours.includes("-")
              ? cleanWorkHours.replace("-", "~")
              : (cd?.workStart && cd?.workEnd ? `${cd.workStart.replace(/\s+/g,"")}~${cd.workEnd.replace(/\s+/g,"")}` : null);
            const parsed = parseHours(hoursStr);
            const plainHours = !parsed && m.work_hours ? (parseFloat(m.work_hours) || cd?.dailyHours || cd?.work_hours) : null;
            const isWorkDay = !!m.work_days?.includes(selectedTimetableDay);

            if (!isWorkDay) {
              return (
                <div style={{ padding:"16px 0", textAlign:"center", background:"var(--surface2)", borderRadius:10, border:"1px dashed var(--border)" }}>
                  <p style={{ color:"var(--text-muted)", fontSize:11, margin:0 }}>이 요일은 근무일이 아니에요</p>
                </div>
              );
            }

            let left = 0, width = 0;
            if (parsed) {
              const startClamp = Math.max(8, Math.min(24, parsed.start));
              const endClamp = Math.max(8, Math.min(24, parsed.end));
              left = ((startClamp - 8) / 16) * 100;
              width = ((endClamp - startClamp) / 16) * 100;
            }

            return (
              <div style={{ position:"relative", paddingBottom:6 }}>
                {/* 시간 축 (08시~24시) */}
                <div style={{ display:"flex", marginLeft:72, marginBottom:8, position:"relative", height:14 }}>
                  {Array.from({ length: 9 }).map((_, hIdx) => {
                    const hour = 8 + hIdx * 2;
                    const leftPercent = (hIdx / 8) * 100;
                    return (
                      <span key={hour} style={{ position:"absolute", left:`${leftPercent}%`, transform:"translateX(-50%)", fontSize:9, color:"var(--text-muted)", fontWeight:700 }}>
                        {String(hour).padStart(2,"0")}
                      </span>
                    );
                  })}
                </div>
                {/* 근무 트랙 */}
                <div style={{ display:"flex", alignItems:"center" }}>
                  <div style={{ width:64, fontSize:11, fontWeight:700, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginRight:8 }}>
                    {storeName}
                  </div>
                  <div style={{ flex:1, height:22, background:"var(--surface2)", borderRadius:12, position:"relative", overflow:"hidden", border:"1px solid var(--border)" }}>
                    {parsed ? (
                      <div style={{ position:"absolute", left:`${left}%`, width:`${width}%`, height:"100%", background: accentGradient || "var(--primary)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, color:"#fff", fontWeight:700 }}>
                        {width > 15 && parsed.label}
                      </div>
                    ) : (
                      <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", paddingLeft:8, fontSize:9, color:"var(--text-muted)", fontStyle:"italic" }}>
                        {plainHours ? `${plainHours}시간` : "시간 협의"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* 입사일 — 근속기간 계산 기준이 되는 공식 기록이라 알바생 본인은 수정 불가, 사장님만 수정 가능 */}
        <div style={{ padding:"10px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid var(--border)" }}>
          <span style={{ fontSize:12, color:"var(--text-muted)" }}>입사일</span>
          <span style={{ fontSize:12, fontWeight:600, color: m.hire_date ? "var(--text)" : "#f59e0b" }}>
            {m.hire_date || "미설정"}
          </span>
        </div>
        {/* 채팅 */}
        <button onClick={() => router.push(`/chat?employer=${m.employer_id}`)}
          style={{ width:"100%", background:"none", border:"none", padding:"12px 18px", fontSize:13, color:"var(--text-muted)", cursor:"pointer", textAlign:"left", display:"flex", alignItems:"center", gap:8 }}>
          <i className="ti ti-message" style={{ fontSize:16 }} /> 사장님과 채팅
        </button>
      </div>

      {/* 출퇴근 버튼 */}
      <CheckInButton member={m} userId={userId} onRefresh={onRefresh} />

      {/* 월별 요약 — 좌우로 넘겨서 이전 달도 확인 가능 */}
      <div style={{ ...cardStyle, padding:"14px 16px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
          <button onClick={() => setViewMonth(v => { if (v === 0) { setViewYear(y => y - 1); return 11; } return v - 1; })}
            style={{ width:32, height:32, borderRadius:"50%", background:"rgba(124,58,237,0.14)", border:"none", fontSize:20, fontWeight:900, cursor:"pointer", color:"#8b5cf6", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }} aria-label="이전 달">‹</button>
          <p style={{ fontSize:13, fontWeight:800, color:"var(--text)", margin:0 }}>{monthLabel} 요약</p>
          <button onClick={() => { if (!isCurrentMonthView) setViewMonth(v => { if (v === 11) { setViewYear(y => y + 1); return 0; } return v + 1; }); }}
            disabled={isCurrentMonthView}
            style={{ width:32, height:32, borderRadius:"50%", background: isCurrentMonthView ? "var(--surface2)" : "rgba(124,58,237,0.14)", border:"none", fontSize:20, fontWeight:900, cursor: isCurrentMonthView ? "default" : "pointer", color: isCurrentMonthView ? "var(--border)" : "#8b5cf6", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }} aria-label="다음 달">›</button>
        </div>
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
        {monthStats.estPay > 0 && monthStats.netPay > 0 && monthStats.netPay !== monthStats.estPay && (
          <div style={{ borderTop: "1px dashed rgba(124,58,237,0.3)", marginTop: 12, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display:"flex", alignItems:"center", gap:4 }}><i className="ti ti-coin" aria-hidden="true" /> 예상 실수령액 (세후)</span>
            <span style={{ fontSize: 14, fontWeight: 900, color: "#10b981" }}>{monthStats.netPay.toLocaleString()}원</span>
          </div>
        )}
      </div>

      {/* ── 서류함: 근태·계약서·명세서 묶음, 기본 접힘 ── */}
      <div style={{ ...cardStyle, padding:0, overflow:"hidden" }}>
        <button onClick={() => setDocsOpen(v => !v)}
          style={{ width:"100%", background:"none", border:"none", padding:"14px 16px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ display:"flex", alignItems:"center", gap:8 }}>
            <i className="ti ti-folder" style={{ fontSize:16, color:"var(--text-muted)" }} aria-hidden="true" />
            <span style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>서류함</span>
            <span style={{ fontSize:11, color:"var(--text-muted)" }}>근태·계약서·명세서</span>
          </span>
          <div style={{ display:"flex", alignItems:"center", gap:6, color: docsOpen ? "#f87171" : "var(--primary, #8b5cf6)", fontSize:12, fontWeight:800 }}>
            <span>{docsOpen ? "접기" : "펼치기"}</span>
            <i className={`ti ${docsOpen ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize:16 }} aria-hidden="true" />
          </div>
        </button>
      {docsOpen && (
      <div style={{ padding:"0 16px 16px", display:"flex", flexDirection:"column", gap:12 }}>

      {/* 최근 근무 */}
      <div style={{ ...cardInnerStyle, padding:"14px 16px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <p style={{ fontSize:12, fontWeight:700, color:"var(--text-muted)", margin:0 }}>최근 근무 기록</p>
          <span style={{ fontSize:11, color:"var(--text-muted)" }}>{monthLabel}</span>
        </div>
        {recentAtt.length === 0 ? (
          <p style={{ fontSize:12, color:"var(--text-muted)", textAlign:"center", padding:"12px 0", margin:0 }}>{monthLabel} 근무 기록이 없어요</p>
        ) : (
          <>
            <div style={{
              display:"flex", flexDirection:"column", gap:6,
              ...(expandRecentAtt ? { maxHeight: 280, overflowY: "auto" as const, paddingRight: 2 } : {}),
            }}>
              {(expandRecentAtt ? recentAtt : recentAtt.slice(0, 1)).map((a:any) => {
                const cin = a.check_in ? new Date(a.check_in).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"}) : "-";
                const cout = a.check_out ? new Date(a.check_out).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"}) : "-";
                return (
                  <div key={a.work_date} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", background:"var(--surface2)", borderRadius:10 }}>
                    <i className={`ti ${STATUS_ICON[a.status]||"ti-calendar"}`} style={{ fontSize:14 }} aria-hidden="true" />
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
            {recentAtt.length > 1 && (
              <button
                type="button"
                onClick={() => setExpandRecentAtt(!expandRecentAtt)}
                style={{
                  width: "100%",
                  marginTop: 8,
                  background: "var(--primary-light, rgba(139,92,246,0.12))",
                  border: "1px solid var(--primary-border, rgba(139,92,246,0.3))",
                  borderRadius: 12,
                  padding: "8px",
                  color: "var(--primary, #8b5cf6)",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  outline: "none"
                }}
              >
                <span>{expandRecentAtt ? "접기" : `근태 더보기 (외 ${recentAtt.length - 1}건)`}</span>
                <i className={`ti ${expandRecentAtt ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 13, fontWeight: 900 }} aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </div>
      {/* 계약서 */}
      <div style={{ ...cardInnerStyle, padding:"14px 16px" }}>
        <p style={{ fontSize:12, fontWeight:700, color:"var(--text-muted)", margin:"0 0 10px", display:"flex", alignItems:"center", gap:4 }}><i className="ti ti-file-text" aria-hidden="true" /> 근로계약서</p>
        {contracts.length === 0 ? (
          <p style={{ fontSize:12, color:"var(--text-muted)", textAlign:"center", padding:"12px 0", margin:0 }}>아직 계약서가 없어요</p>
        ) : (
          <>
            {(expandContracts ? contracts : contracts.slice(0, 1)).map((c: any) => {
              const isActive = c.status !== "superseded";
              const isSigned = c.worker_signed && c.employer_signed;
              const isPending = !c.worker_signed && c.employer_signed;
              return (
                <div key={c.id} style={{ background:"var(--surface2)", borderRadius:10, padding:"10px 12px", border:`1px solid ${isActive ? "#7c3aed40" : "var(--border)"}`, marginBottom:6, opacity: isActive ? 1 : 0.6 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:"var(--text)" }}>
                      {isActive ? "현재 계약" : "이전 계약"}
                    </span>
                    <span style={{
                      fontSize: isPending ? 12 : 10, borderRadius:20, padding: isPending ? "4px 10px" : "2px 7px", fontWeight:800,
                      display:"flex", alignItems:"center", gap:4,
                      background: isSigned ? "rgba(16,185,129,0.2)" : isPending ? "rgba(245,158,11,0.25)" : "var(--surface)",
                      border: isSigned ? "1px solid rgba(16,185,129,0.4)" : isPending ? "1px solid rgba(245,158,11,0.5)" : "1px solid var(--border)",
                      color: isSigned ? "#10b981" : isPending ? "#f59e0b" : "var(--text-muted)" }}>
                      {isPending && <i className="ti ti-clock-hour-4" style={{ fontSize:12 }} aria-hidden="true" />}
                      {isSigned ? "서명완료" : isPending ? "서명대기" : "미서명"}
                    </span>
                  </div>
                  <p style={{ fontSize:11, color:"var(--text-muted)", margin:"0 0 8px" }}>
                    {c.start_date || "-"} ~ {c.end_date || "기간 미정"}
                    {c.contract_data?.contractType && (
                      <span style={{ marginLeft:6, fontSize:10, background:"var(--surface)", borderRadius:5, padding:"1px 5px" }}>
                        {c.contract_data.contractType === "parttime" ? "단시간" : "표준"}
                      </span>
                    )}
                  </p>
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={() => router.push(`/contract/view?contractId=${c.id}`)}
                      style={{ flex:1, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, padding:"7px", fontSize:12, color:"var(--text-muted)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                      <i className="ti ti-file-text" aria-hidden="true" /> 보기
                    </button>
                    {isPending && (
                      <button onClick={() => router.push(`/contract/view?contractId=${c.id}`)}
                        style={{ flex:2, background:"var(--primary)", border:"none", borderRadius:8, padding:"7px", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                        <i className="ti ti-signature" aria-hidden="true" /> 서명하기
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {contracts.length > 1 && (
              <button
                type="button"
                onClick={() => setExpandContracts(!expandContracts)}
                style={{
                  width: "100%",
                  marginTop: 8,
                  background: "var(--primary-light, rgba(139,92,246,0.12))",
                  border: "1px solid var(--primary-border, rgba(139,92,246,0.3))",
                  borderRadius: 12,
                  padding: "8px",
                  color: "var(--primary, #8b5cf6)",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  outline: "none"
                }}
              >
                <span>{expandContracts ? "이전 계약 접기" : `이전 계약 보기 (외 ${contracts.length - 1}건)`}</span>
                <i className={`ti ${expandContracts ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 13, fontWeight: 900 }} aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </div>

      {/* 임금 명세서 */}
      <div style={{ ...cardInnerStyle, padding:"14px 16px" }}>
        <p style={{ fontSize:12, fontWeight:700, color:"var(--text-muted)", margin:"0 0 10px", display:"flex", alignItems:"center", gap:4 }}><i className="ti ti-report-money" aria-hidden="true" /> 임금 명세서</p>
        <WorkerPayslipTab teamMemberId={m.id} workerId={userId} employerId={m.employer_id} router={router} />
      </div>

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

const BIZ_ICON: Record<string, string> = {
  "카페/음료":"ti-coffee","식당/음식점":"ti-tools-kitchen-2","편의점/마트":"ti-building-store",
  "뷰티/미용":"ti-sparkles","물류/배송":"ti-truck-delivery","사무/행정":"ti-briefcase",
  "판매/매장":"ti-shopping-bag","이벤트/행사":"ti-confetti","교육/돌봄":"ti-school",
};

function MyTeamPageContent() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userType, setUserType] = useState<string>("");
  const { activeRole, setActiveRole, isBoth } = useActiveRole(userType);
  const loadedModesRef = useRef<Set<"employer" | "worker">>(new Set());
  const [employerResult, setEmployerResult] = useState<any>(null);
  const [attRefreshKey, setAttRefreshKey] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // 사장님 데이터
  const [myStores, setMyStores] = useState<any[]>([]);
  const [membersByStore, setMembersByStore] = useState<Record<string, any[]>>({});
  const [statsByStore, setStatsByStore] = useState<Record<string, { today: number; scheduled: number; pending: number }>>({});
  const [teamOpen, setTeamOpen] = useState(true);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);
  const [activeWorkStoreId, setActiveWorkStoreId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ store: any; members: any[] } | null>(null);
  const [cancelContractTarget, setCancelContractTarget] = useState<{ memberId: string; contractId: string; name: string } | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const [activeQuickProfile, setActiveQuickProfile] = useState<string | null>(null);
  const showToast = (msg: string, _type?: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(""), 3000); };
  const [resignTarget, setResignTarget] = useState<{ member: any; name: string; hasWorkedThisMonth: boolean; hasPayslipThisMonth: boolean; uncoveredWorkDays: number } | null>(null);
  const [selectedTimetableDay, setSelectedTimetableDay] = useState<string>(() => {
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return days[new Date().getDay()];
  });

  // 알바생 데이터
  const [current, setCurrent] = useState<any[]>([]);
  const [pendingInvites, setPendingInvites] = useState<{ code: string; bizName: string }[]>([]);
  const [pastWorks, setPastWorks] = useState<any[]>([]);
  const [workOpen, setWorkOpen] = useState(true);
  const [pastWorkOpen, setPastWorkOpen] = useState(false);
  const [highlightMemberId, setHighlightMemberId] = useState<string | null>(null);
  const memberRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!highlightMemberId || !workOpen) return;
    const t = setTimeout(() => {
      memberRefs.current[highlightMemberId]?.scrollIntoView({ behavior: "smooth", block: "start" });
      setHighlightMemberId(null);
    }, 150);
    return () => clearTimeout(t);
  }, [highlightMemberId, workOpen]);

  const hasStore = myStores.length > 0;
  const hasEmployee = hasStore && (myStores.some(s => s.activeJob !== null) || Object.values(membersByStore).flat().length > 0);
  const hasContract = hasStore && Object.values(membersByStore).flat().some(m => m.contractStatus === "done" || m.contractStatus === "pending");
  const onboardingCompleted = hasStore && hasEmployee && hasContract;

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
        const m = ut === "both" ? (window.localStorage.getItem(ACTIVE_ROLE_KEY) || "worker") : ut;
        if (m === "employer") loadTeam(data.user.id);
        if (m === "worker") loadMyWork(data.user.id);
      });
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Realtime 구독: team_members 변경 감지 시 현재 활성 모드 화면만 갱신 (비활성 모드는 구독 안 함)
  useEffect(() => {
    if (!user || !userType) return;
    const mode = isBoth ? activeRole : (userType === "employer" ? "employer" : "worker");

    const channel = supabase
      .channel(`team-members-realtime-${user.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "team_members" },
        (payload: any) => {
          if (mode === "employer" && (payload.new?.employer_id === user.id || payload.old?.employer_id === user.id)) {
            loadTeam(user.id);
          }
          if (mode === "worker" && (payload.new?.worker_id === user.id || payload.old?.worker_id === user.id)) {
            loadMyWork(user.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, userType, isBoth, activeRole]);

  // both 계정이 모드를 전환할 때, 아직 로드 안 한 쪽 데이터를 최초 1회만 지연 로드
  useEffect(() => {
    if (!isBoth || !user?.id) return;
    if (loadedModesRef.current.has(activeRole)) return;
    loadedModesRef.current.add(activeRole);
    if (activeRole === "employer") {
      loadTeam(user.id).then((res: any[] | undefined) => setTeamOpen(!(res && res.length > 0)));
    } else {
      loadMyWork(user.id).then((res: any[] | undefined) => setWorkOpen(!(res && res.length > 0)));
      loadPastWorks(user.id);
      loadPendingInvites(user.id);
    }
  }, [activeRole, isBoth, user?.id]);

  // 초대 수락은 /i/[code]로 나갔다가 돌아오는 흐름이라, 탭이 다시 보일 때 배너를 새로고침
  // (돌아와도 페이지가 리마운트 안 되면 수락 전 상태 그대로 남아있는 문제)
  useEffect(() => {
    if (!user?.id) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") loadPendingInvites(user.id);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [user?.id]);

  async function loadUserType(uid: string) {
    const { data } = await supabase.from("users")
      .select("user_type, nickname, avatar_url, employer_result")
      .eq("id", uid).single();
    const ut = data?.user_type || "worker";
    setUserType(ut);
    userTypeRef.current = ut;
    if (data?.employer_result) setEmployerResult(data.employer_result);
    if (data) setUser((p: any) => ({ ...p, ...data }));

    // both 계정은 활성 모드 하나만 즉시 로드 — 반대 모드는 전환 시점에 지연 로드(위 useEffect)
    const initialMode: "employer" | "worker" = ut === "employer" ? "employer"
      : ut === "worker" ? "worker"
      : (typeof window !== "undefined" && window.localStorage.getItem(ACTIVE_ROLE_KEY) === "employer") ? "employer"
      : "worker";
    loadedModesRef.current.add(initialMode);

    let loadedStores: any[] = [];
    let loadedWork: any[] = [];

    if (initialMode === "employer") {
      loadedStores = (await loadTeam(uid)) || [];
    } else {
      loadedWork = (await loadMyWork(uid)) || [];
      await loadPastWorks(uid);
      await loadPendingInvites(uid);
    }

    const hasStores = loadedStores.length > 0;
    const hasWork = loadedWork.length > 0;

    // 디폴트 접힘/펼침: 데이터 있으면 접어서 요약만, 없으면 펼쳐서 온보딩 CTA 노출
    if (!hasStores && !hasWork) {
      setTeamOpen(true);
      setWorkOpen(true);
    } else {
      setTeamOpen(hasStores);
      setWorkOpen(hasWork);
    }

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
    // 모든 매장 로드 (순수 매장 정보만)
    const { data: stores } = await supabase.from("employer_profiles")
      .select("*")
      .eq("user_id", uid).or("is_deleted.is.null,is_deleted.eq.false").not("business_name", "is", null)
      .order("created_at", { ascending: false });
    const storeList = stores || [];

    // 각 매장의 최신 공고 로드
    const storeIds = storeList.map((s: any) => s.id);
    const { data: jobsData } = storeIds.length > 0
      ? await supabase.from("jobs")
          .select("id, employer_profile_id, wage, work_days, work_hours, is_active, job_status")
          .in("employer_profile_id", storeIds)
          .order("created_at", { ascending: false })
      : { data: [] };

    // employer_profile_id 기준 최신 공고 1개씩 매핑
    const jobByStore: Record<string, any> = {};
    for (const j of (jobsData || [])) {
      if (!jobByStore[j.employer_profile_id]) jobByStore[j.employer_profile_id] = j;
    }

    // 매장에 activeJob 병합
    const storesWithJobs = storeList.map((s: any) => ({ ...s, activeJob: jobByStore[s.id] || null }));
    setMyStores(storesWithJobs);

    // 첫 진입 시: 이전에 선택했던 매장 복원, 없으면 첫 번째
    if (storeList.length > 0) {
      const saved = sessionStorage.getItem("myteam_activeStoreId");
      const restored = saved && storeList.find((s: any) => s.id === saved) ? saved : storeList[0].id;
      setActiveStoreId(restored);
    }

    // 모든 팀원 로드 (employer_profile_id 포함)
    const { data } = await supabase.from("team_members")
      .select(`id, worker_id, employer_id, employer_profile_id, hire_date, status, wage, work_days, work_hours, member_role, contract_status,
        users!team_members_worker_id_fkey (nickname, avatar_url, worker_result, email, trust_score)`)
      .eq("employer_id", uid).eq("status", "active")
      .order("hire_date", { ascending: false });
    if (!data) return;

    // 각 팀원의 최신 계약서 로드
    const teamMemberIds = data.map((m: any) => m.id);
    const { data: memberContracts } = teamMemberIds.length > 0
      ? await supabase.from("contracts")
          .select("team_member_id, wage, wage_type, work_days, work_hours, contract_data, status")
          .in("team_member_id", teamMemberIds)
          .neq("status", "cancelled")
          .order("created_at", { ascending: false })
      : { data: [] };

    const contractByMember: Record<string, any> = {};
    for (const c of (memberContracts || [])) {
      if (!contractByMember[c.team_member_id]) {
        contractByMember[c.team_member_id] = c;
      }
    }

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`;
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayStr = kstNow.toISOString().split("T")[0];
    const todayKo = KOREAN_DAY_BY_INDEX[kstNow.getUTCDay()];

    const ids = data.map((m: any) => m.id);
    const { data: att } = ids.length > 0
      ? await supabase.from("attendance").select("team_member_id, status, work_date, check_in, check_out, actual_hours").in("team_member_id", ids).gte("work_date", monthStart)
      : { data: [] };

    const enriched = data.map((m: any) => {
      let wage = m.wage;
      let wage_type = "hourly";
      let work_days = m.work_days;
      let work_hours = m.work_hours;

      const contract = contractByMember[m.id];
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

      const contractStatus = m.contract_status === "active" ? "done"
        : m.contract_status === "pending" ? "pending" : "none";
      const todayAtt = att?.find((a: any) => a.team_member_id === m.id && a.work_date === todayStr);
      return {
        ...m,
        wage,
        wage_type,
        work_days,
        work_hours,
        worker: (m as any).users,
        todayAtt,
        thisMonth: att?.filter((a: any) => a.team_member_id === m.id && (a.status==="normal"||a.status==="late")).length || 0,
        late: att?.filter((a: any) => a.team_member_id === m.id && a.status==="late").length || 0,
        contractStatus,
      };
    });

    // 매장별로 팀원 그룹핑
    // employer_profile_id null인 팀원은 가장 오래된 매장(DESC 정렬의 마지막)에 배치
    const oldestStoreId = storeList[storeList.length - 1]?.id;
    const grouped: Record<string, any[]> = {};
    for (const s of storeList) grouped[s.id] = [];
    for (const m of enriched) {
      const storeId = m.employer_profile_id && grouped[m.employer_profile_id] ? m.employer_profile_id : oldestStoreId;
      if (storeId) grouped[storeId] = [...(grouped[storeId] || []), m];
    }
    setMembersByStore(grouped);

    // 매장별 통계
    const stats: Record<string, { today: number; scheduled: number; pending: number }> = {};
    for (const s of storeList) {
      const sm = grouped[s.id] || [];
      const smIds = sm.map((m: any) => m.id);
      stats[s.id] = {
        today: att?.filter((a: any) => smIds.includes(a.team_member_id) && a.work_date === todayStr && ["normal","late","early_leave"].includes(a.status)).length || 0,
        // 근무요일이 명확히 설정 + 오늘이 포함된 팀원 수 (요일 미설정 팀원은 분모에서 제외 — 오탐 방지)
        scheduled: sm.filter((m: any) => isWorkingOnDay(m.work_days, todayKo)).length,
        pending: sm.filter((m: any) => m.contractStatus !== "done").length,
      };
    }
    setStatsByStore(stats);
    return storeList;
  }

  async function upgradeToBoth(targetType: "worker" | "employer") {
    if (!user) return;
    const next = await addRole(supabase, user.id, targetType);
    setUserType(next);
    userTypeRef.current = next;
    setActiveRole(targetType);
    showToast(targetType === "worker" ? "🙋‍♂️ 알바생 역할이 추가되었습니다!" : "💼 사장님 역할이 추가되었습니다!");

    loadedModesRef.current.add(targetType);
    if (targetType === "worker") {
      await loadMyWork(user.id);
      await loadPastWorks(user.id);
      await loadPendingInvites(user.id);
    } else {
      await loadTeam(user.id);
    }
  }

  async function handleResign(member: any, name: string) {
    // 1. 퇴사일 기준 당월(KST) 임금 명세서 발행 여부 확인
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const currentYear = kst.getUTCFullYear();
    const currentMonth = kst.getUTCMonth() + 1;
    const monthStart = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
    const monthEnd = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(new Date(currentYear, currentMonth, 0).getDate()).padStart(2, "0")}`;

    // 당월 출근 기록이 1건이라도 있는지 먼저 확인
    const { data: attRows } = await supabase
      .from("attendance")
      .select("id")
      .eq("team_member_id", member.id)
      .gte("work_date", monthStart)
      .lte("work_date", monthEnd)
      .not("status", "in", '("absent","off")')
      .limit(1);

    const hasWorkedThisMonth = attRows && attRows.length > 0;

    if (hasWorkedThisMonth) {
      // 실제 근무 이력이 있는 달 → 임금 명세서 발행 필수
      const { data: slips, error: slipsErr } = await supabase
        .from("payslips")
        .select("id")
        .eq("team_member_id", member.id)
        .eq("year", currentYear)
        .eq("month", currentMonth)
        .limit(1);

      if (slipsErr) {
        alert("급여 발행 내역 검증 중 오류가 발생했습니다: " + slipsErr.message);
        return;
      }

      if (!slips || slips.length === 0) {
        alert(`⚠️ 퇴사 처리 불가\n\n${name}님의 이번 달(${currentYear}년 ${currentMonth}월) 근무 기록이 있습니다.\n임금 명세서를 먼저 발행한 후 퇴사 처리해 주세요.`);
        return;
      }
    }
    // 당월 출근 기록이 없으면 임금 명세서 없이 퇴사 처리 허용

    // 2. 퇴사 처리 진행
    const { error } = await supabase
      .from("team_members")
      .update({ status: "left" })
      .eq("id", member.id);

    if (error) {
      alert("퇴사 처리 중 오류가 발생했습니다: " + error.message);
      return;
    }

    setMembersByStore(prev => {
      const u = { ...prev };
      for (const k of Object.keys(u)) {
        u[k] = u[k].filter((tm: any) => tm.id !== member.id);
      }
      return u;
    });

    showToast(`${name}님 퇴사 처리됐어요.`);

    // 1. 상대방(알바생)에게 푸시 알림 전송
    if (member.worker_id) {
      const activeStore = myStores.find(s => s.id === activeStoreId);
      sendPushNotification({
        userId: member.worker_id,
        title: "🔴 퇴사 처리 완료",
        body: `${activeStore?.business_name || "매장"}에서 퇴사 처리되었습니다.`,
        url: `/worker/mywork`,
        tag: "resignation"
      });
    }

    // 2. 1:1 대화방에 시스템 메시지 전송
    if (member.match_id && user) {
      const employerName = user.nickname || "사장님";
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: member.match_id,
          senderId: user.id,
          receiverId: member.worker_id,
          message: `[시스템] ${employerName} 사장님이 ${name}님을 퇴사 처리하였습니다.\n이후 근무 기록 및 톡 공유가 종료됩니다.`,
          messageType: "system",
        }),
      });
    }
  }

  async function loadMyWork(uid: string) {
    const { data: activeData } = await supabase.from("team_members")
      .select(`id, wage, work_hours, work_days, hire_date, status, employer_id, employer_profile_id, role_desc, invite_status, created_at, contract_status,
        users!team_members_employer_id_fkey (nickname, avatar_url)`)
      .eq("worker_id", uid).eq("status", "active")
      .order("created_at", { ascending: false });

    // 각 소속의 최신 계약서 로드
    const tmIds = (activeData||[]).map((d: any) => d.id);
    const { data: memberContracts } = tmIds.length > 0
      ? await supabase.from("contracts")
          .select("team_member_id, wage, wage_type, work_days, work_hours, contract_data, status")
          .in("team_member_id", tmIds)
          .neq("status", "cancelled")
          .order("created_at", { ascending: false })
      : { data: [] };

    const contractByMember: Record<string, any> = {};
    for (const c of (memberContracts || [])) {
      if (!contractByMember[c.team_member_id]) {
        contractByMember[c.team_member_id] = c;
      }
    }

    // 확인 대기 중인 임금 명세서 (발행됐지만 알바생이 아직 확인 안 함)
    const { data: pendingSlips } = tmIds.length > 0
      ? await supabase.from("payslips")
          .select("team_member_id")
          .in("team_member_id", tmIds)
          .is("confirmed_at", null)
          .neq("status", "confirmed")
      : { data: [] };
    const payslipPendingSet = new Set((pendingSlips || []).map((p: any) => p.team_member_id));

    const profileIds = [...new Set((activeData||[]).map((d: any) => d.employer_profile_id).filter(Boolean))];
    const empIdFallbacks = [...new Set((activeData||[]).filter((d: any) => !d.employer_profile_id).map((d: any) => d.employer_id))];
    const profiles: any[] = [];
    if (profileIds.length > 0) {
      const { data: eps } = await supabase.from("employer_profiles")
        .select("id, user_id, business_name, business_type, region")
        .in("id", profileIds);
      if (eps) profiles.push(...eps);
    }
    for (const empId of empIdFallbacks) {
      const { data: ep } = await supabase.from("employer_profiles")
        .select("id, user_id, business_name, business_type, region")
        .eq("user_id", empId)
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      if (ep) profiles.push(ep);
    }

    const mapped = (activeData||[]).map((d: any) => {
      let wage = d.wage;
      let wage_type = "hourly";
      let work_days = d.work_days;
      let work_hours = d.work_hours;

      const contract = contractByMember[d.id];
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

      const contractStatus = d.contract_status === "active" ? "done"
        : d.contract_status === "pending" ? "pending" : "none";

      return {
        ...d,
        wage,
        wage_type,
        work_days,
        work_hours,
        employer: d.users,
        profile: profiles.find((p: any) => d.employer_profile_id ? p.id === d.employer_profile_id : p.user_id === d.employer_id),
        contractStatus,
        payslipPending: payslipPendingSet.has(d.id),
      };
    });
    setCurrent(mapped);

    // 첫 진입 시: 이전에 선택했던 매장 카드 복원, 없으면 첫 번째
    if (mapped.length > 0) {
      const saved = sessionStorage.getItem("myteam_activeWorkStoreId");
      const restored = saved && mapped.find((s: any) => s.id === saved) ? saved : mapped[0].id;
      setActiveWorkStoreId(restored);
    }

    return mapped;
  }

  async function loadPastWorks(uid: string) {
    const { data: leftData } = await supabase.from("team_members")
      .select(`id, wage, work_hours, work_days, hire_date, status, employer_id, employer_profile_id, role_desc, invite_status, created_at, updated_at, contract_status,
        users!team_members_employer_id_fkey (nickname, avatar_url)`)
      .eq("worker_id", uid).eq("status", "left")
      .order("updated_at", { ascending: false });

    // 각 소속의 최신 계약서 로드
    const tmIds = (leftData||[]).map((d: any) => d.id);
    const { data: memberContracts } = tmIds.length > 0
      ? await supabase.from("contracts")
          .select("team_member_id, wage, wage_type, work_days, work_hours, contract_data, status")
          .in("team_member_id", tmIds)
          .neq("status", "cancelled")
          .order("created_at", { ascending: false })
      : { data: [] };

    const contractByMember: Record<string, any> = {};
    for (const c of (memberContracts || [])) {
      if (!contractByMember[c.team_member_id]) {
        contractByMember[c.team_member_id] = c;
      }
    }

    // employer_profile_id가 있으면 그 매장을 직접 조회, 없으면 employer_id의 첫 매장 폴백
    const profileIds = [...new Set((leftData||[]).map((d: any) => d.employer_profile_id).filter(Boolean))];
    const empIdFallbacks = [...new Set((leftData||[]).filter((d: any) => !d.employer_profile_id).map((d: any) => d.employer_id))];
    const profiles: any[] = [];
    if (profileIds.length > 0) {
      const { data: eps } = await supabase.from("employer_profiles")
        .select("id, user_id, business_name, business_type, region")
        .in("id", profileIds);
      if (eps) profiles.push(...eps);
    }
    for (const empId of empIdFallbacks) {
      const { data: ep } = await supabase.from("employer_profiles")
        .select("id, user_id, business_name, business_type, region")
        .eq("user_id", empId)
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      if (ep) profiles.push(ep);
    }

    const mapped = (leftData||[]).map((d: any) => {
      let wage = d.wage;
      let wage_type = "hourly";
      let work_days = d.work_days;
      let work_hours = d.work_hours;

      const contract = contractByMember[d.id];
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

      const contractStatus = d.contract_status === "active" ? "done"
        : d.contract_status === "pending" ? "pending" : "none";

      return {
        ...d,
        wage,
        wage_type,
        work_days,
        work_hours,
        employer: d.users,
        profile: profiles.find((p: any) => d.employer_profile_id ? p.id === d.employer_profile_id : p.user_id === d.employer_id),
        contractStatus,
      };
    });

    setPastWorks(mapped);
    return mapped;
  }

  // 받은 초대장 중 아직 수락 안 한 것 — 알림만으로는 놓치기 쉬워서 홈에도 노출
  async function loadPendingInvites(uid: string) {
    const { data: notifs } = await supabase
      .from("notifications")
      .select("id, data, created_at")
      .eq("user_id", uid)
      .eq("type", "invite")
      .order("created_at", { ascending: false })
      .limit(20);

    const codes = [...new Set(
      (notifs || [])
        .map((n: any) => (n.data?.url as string | undefined)?.match(/\/i\/([A-Za-z0-9-]+)/)?.[1])
        .filter((c: any): c is string => !!c)
    )];

    if (codes.length === 0) { setPendingInvites([]); return; }

    const { data: invites } = await supabase
      .from("invite_codes")
      .select("code, biz_name, used_at, expires_at")
      .in("code", codes)
      .is("used_at", null);

    const nowIso = new Date().toISOString();
    const valid = (invites || []).filter((iv: any) => !iv.expires_at || iv.expires_at > nowIso);
    setPendingInvites(valid.map((iv: any) => ({ code: iv.code, bizName: iv.biz_name || "매장" })));
  }

  const mode: "employer" | "worker" = isBoth ? activeRole : (userType === "employer" ? "employer" : "worker");

  // 접힌 헤더 한 줄 요약용 (오늘의 요약 카드를 따로 두지 않고 헤더 서브텍스트에 압축)
  const teamEmployeeCount = Object.values(membersByStore).flat().length;
  const teamTodayCount = myStores.reduce((sum, s) => sum + (statsByStore[s.id]?.today || 0), 0);
  const teamScheduledCount = myStores.reduce((sum, s) => sum + (statsByStore[s.id]?.scheduled || 0), 0);
  const teamPendingCount = myStores.reduce((sum, s) => sum + (statsByStore[s.id]?.pending || 0), 0);
  const workPendingCount = current.filter((m: any) => m.contractStatus !== "done").length;
  const workPayslipPendingCount = current.filter((m: any) => m.payslipPending).length;

  // 상태 배너(지각/결근/미출근/계약확인) 클릭 시 해당 매장을 활성화하고 팀원 행으로 스크롤 이동
  const [highlightTeamMemberId, setHighlightTeamMemberId] = useState<string | null>(null);
  const teamMemberRowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!highlightTeamMemberId || !teamOpen) return;
    const t = setTimeout(() => {
      teamMemberRowRefs.current[highlightTeamMemberId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightTeamMemberId(null);
    }, 200);
    return () => clearTimeout(t);
  }, [highlightTeamMemberId, teamOpen, activeStoreId]);

  const jumpToTeamMember = (memberId: string) => {
    const storeId = Object.entries(membersByStore).find(([, arr]) => (arr as any[]).some((x: any) => x.id === memberId))?.[0];
    if (!storeId) return;
    setTeamOpen(true);
    setActiveStoreId(storeId);
    sessionStorage.setItem("myteam_activeStoreId", storeId);
    setHighlightTeamMemberId(memberId);
  };

  const jumpToWorkStore = (memberId: string) => {
    setWorkOpen(true);
    setActiveWorkStoreId(memberId);
    sessionStorage.setItem("myteam_activeWorkStoreId", memberId);
    setHighlightMemberId(memberId);
  };

  const contractBadge = (status: string) => ({
    none: { label:"계약서미작성", color:"#ef4444", bg:"rgba(239,68,68,0.25)", border:"1px solid rgba(239,68,68,0.5)", icon:"ti-alert-triangle" },
    pending: { label:"서명대기", color:"#f59e0b", bg:"rgba(245,158,11,0.25)", border:"1px solid rgba(245,158,11,0.5)", icon:"ti-clock-hour-4" },
    done: { label:"정상계약 완료", color:"#10b981", bg:"rgba(16,185,129,0.2)", border:"1px solid rgba(16,185,129,0.4)", icon:"ti-circle-check" },
  }[status] || { label:"미작성", color:"#ef4444", bg:"rgba(239,68,68,0.25)", border:"1px solid rgba(239,68,68,0.5)", icon:"ti-alert-triangle" });

  return (
    <main style={{ minHeight:"100vh", background:"var(--bg)", paddingBottom:160 }}>
      <style>{`
        .team-member-row:active {
          background-color: var(--surface2) !important;
          transform: scale(0.985);
        }
      `}</style>
      {toastMsg && (
        <div style={{ position:"fixed", top:60, left:"50%", transform:"translateX(-50%)", background:"#1a1a2e", color:"#fff", borderRadius:20, padding:"10px 20px", fontSize:13, zIndex:2000, whiteSpace:"nowrap", pointerEvents:"none" }}>
          {toastMsg}
        </div>
      )}

      {cancelContractTarget && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:500, display:"flex", alignItems:"flex-end" }}
          onClick={() => setCancelContractTarget(null)}>
          <div style={{ background:"var(--surface)", borderRadius:"20px 20px 0 0", padding:"24px 20px 36px", width:"100%", maxWidth:480, margin:"0 auto" }}
            onClick={e => e.stopPropagation()}>
            <p style={{ fontSize:15, fontWeight:700, color:"var(--text)", marginBottom:6 }}>
              ⏳ {cancelContractTarget.name} — 서명 대기중
            </p>
            <p style={{ fontSize:13, color:"var(--text-muted)", marginBottom:20, lineHeight:1.6 }}>
              아직 알바생이 계약서에 서명하지 않았어요.<br/>
              발행을 취소하면 계약서가 무효 처리돼요.
            </p>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setCancelContractTarget(null)}
                style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:14, padding:14, color:"var(--text-muted)", fontSize:14, cursor:"pointer" }}>
                닫기
              </button>
              <button onClick={() => { setCancelContractTarget(null); router.push(`/contract/view?memberId=${cancelContractTarget.memberId}`); }}
                style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:14, padding:14, color:"var(--text)", fontSize:14, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                <i className="ti ti-file-text" aria-hidden="true" /> 계약서 보기
              </button>
              <button onClick={async () => {
                const { memberId, contractId } = cancelContractTarget;
                setCancelContractTarget(null);
                if (contractId) await supabase.from("contracts").update({ status:"cancelled" }).eq("id", contractId);
                await supabase.from("team_members").update({ contract_status:"none" }).eq("id", memberId);
                setMembersByStore(prev => {
                  const u = { ...prev };
                  for (const k of Object.keys(u)) {
                    u[k] = u[k].map((tm: any) => tm.id === memberId ? { ...tm, contract_status:"none", contractStatus:"none" } : tm);
                  }
                  return u;
                });
                showToast("계약서 발행이 취소됐어요.");
              }}
                style={{ flex:1, background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:14, padding:14, color:"#ef4444", fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                <i className="ti ti-trash" aria-hidden="true" /> 발행 취소
              </button>
            </div>
          </div>
        </div>
      )}

      {resignTarget && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:500, display:"flex", alignItems:"flex-end" }}
          onClick={() => setResignTarget(null)}>
          <div style={{ background:"var(--surface)", borderRadius:"20px 20px 0 0", padding:"24px 20px 36px", width:"100%", maxWidth:480, margin:"0 auto" }}
            onClick={e => e.stopPropagation()}>
            <p style={{ fontSize:16, fontWeight:800, color:"var(--danger)", marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
              <i className="ti ti-alert-triangle" aria-hidden="true" /> 정말 퇴사 처리하시겠습니까?
            </p>
            <p style={{ fontSize:14, fontWeight:700, color:"var(--text)", marginBottom:10 }}>
              [{resignTarget.name}] 님을 매장에서 퇴사 처리합니다.
            </p>

            {/* 이번 달 급여 정산 상태 안내 */}
            {resignTarget.hasWorkedThisMonth && !resignTarget.hasPayslipThisMonth ? (
              <div style={{ borderRadius:10, padding:"10px 14px", marginBottom:14, border:"1px solid rgba(245,158,11,0.4)", background:"rgba(245,158,11,0.08)" }}>
                <p style={{ fontSize:12, fontWeight:700, color:"#f59e0b", margin:"0 0 4px", display:"flex", alignItems:"center", gap:4 }}><i className="ti ti-alert-triangle" aria-hidden="true" /> 이번 달 근무 기록이 있습니다</p>
                <p style={{ fontSize:11, color:"var(--text-muted)", margin:"0 0 10px", lineHeight:1.5 }}>
                  퇴사 처리 전에 <strong>이번 달 임금 명세서를 먼저 발행</strong>해 주세요.<br/>급여 미정산 상태로는 퇴사 처리가 되지 않습니다.
                </p>
                <button onClick={() => { const id = resignTarget.member.id; setResignTarget(null); router.push(`/payslip?tmId=${id}`); }}
                  style={{ width:"100%", background:"#f59e0b", border:"none", borderRadius:10, padding:"9px", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                  <i className="ti ti-file-text" aria-hidden="true" /> 임금 명세서 발행하러 가기
                </button>
              </div>
            ) : resignTarget.hasWorkedThisMonth && resignTarget.uncoveredWorkDays > 0 ? (
              <div style={{ borderRadius:10, padding:"10px 14px", marginBottom:14, border:"1px solid rgba(245,158,11,0.4)", background:"rgba(245,158,11,0.08)" }}>
                <p style={{ fontSize:12, fontWeight:700, color:"#f59e0b", margin:"0 0 4px", display:"flex", alignItems:"center", gap:4 }}><i className="ti ti-alert-triangle" aria-hidden="true" /> 명세서 발행 이후 근무 기록 {resignTarget.uncoveredWorkDays}건이 반영 안 됐어요</p>
                <p style={{ fontSize:11, color:"var(--text-muted)", margin:"0 0 10px", lineHeight:1.5 }}>
                  발행된 명세서 이후에 추가로 근무한 날이 있어요. 그대로 퇴사 처리하면 이 근무분은 급여에서 누락될 수 있습니다. 재발행 후 진행을 권장해요.
                </p>
                <button onClick={() => { const id = resignTarget.member.id; setResignTarget(null); router.push(`/payslip?tmId=${id}`); }}
                  style={{ width:"100%", background:"#f59e0b", border:"none", borderRadius:10, padding:"9px", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                  <i className="ti ti-file-text" aria-hidden="true" /> 임금 명세서 재발행하러 가기
                </button>
              </div>
            ) : resignTarget.hasWorkedThisMonth ? (
              <div style={{ borderRadius:10, padding:"10px 14px", marginBottom:14, border:"1px solid rgba(16,185,129,0.3)", background:"rgba(16,185,129,0.08)" }}>
                <p style={{ fontSize:12, fontWeight:700, color:"#10b981", margin:"0 0 4px", display:"flex", alignItems:"center", gap:4 }}><i className="ti ti-circle-check" aria-hidden="true" /> 이번 달 임금 명세서 발행 완료 — 퇴사 처리 가능</p>
                <p style={{ fontSize:11, color:"var(--text-muted)", margin:0, lineHeight:1.5 }}>
                  이번 달 근무분이 임금 명세서에 반영됐어요. 퇴사 처리를 진행할 수 있습니다.
                </p>
              </div>
            ) : (
              <div style={{ borderRadius:10, padding:"10px 14px", marginBottom:14, border:"1px solid rgba(16,185,129,0.3)", background:"rgba(16,185,129,0.08)" }}>
                <p style={{ fontSize:12, fontWeight:700, color:"#10b981", margin:"0 0 4px", display:"flex", alignItems:"center", gap:4 }}><i className="ti ti-circle-check" aria-hidden="true" /> 이번 달 출근 기록 없음 — 즉시 퇴사 처리 가능</p>
                <p style={{ fontSize:11, color:"var(--text-muted)", margin:0, lineHeight:1.5 }}>
                  이번 달 실제 출근 내역이 없어 임금 명세서 없이 퇴사 처리할 수 있습니다.
                </p>
              </div>
            )}

            <div style={{ background:"var(--surface2)", borderRadius:12, padding:"12px 14px", marginBottom:20, border:"1px solid var(--border)" }}>
              <p style={{ fontSize:12, color:"var(--text-muted)", margin:"0 0 6px", fontWeight:700, display:"flex", alignItems:"center", gap:4 }}>
                <i className="ti ti-bulb" aria-hidden="true" /> 법적 서류 보존 안내
              </p>
              <p style={{ fontSize:11, color:"var(--text-muted)", margin:0, lineHeight:1.5 }}>
                • 작성된 <strong>근로계약서</strong>와 <strong>임금명세서/지급내역</strong>은 근로기준법 및 관련 법령에 의거하여 <strong>법적 보존 연한(3년~5년) 동안 안전하게 보존</strong>되며, 퇴사 처리 후에도 필요 시 양측 모두 언제든지 열람할 수 있습니다.
              </p>
              <p style={{ fontSize:11, color:"var(--text-muted)", margin:"8px 0 0", lineHeight:1.5 }}>
                • 퇴사 완료 시 해당 직원과의 근무 현황 및 1:1 대화방이 종료되며, 직원에게 퇴사 처리 알림이 전송됩니다.
              </p>
            </div>

            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setResignTarget(null)}
                style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:14, padding:14, color:"var(--text-muted)", fontSize:14, fontWeight:600, cursor:"pointer" }}>
                취소
              </button>
              <button onClick={async () => {
                const target = resignTarget.member;
                const name = resignTarget.name;
                setResignTarget(null);
                await handleResign(target, name);
              }}
                disabled={resignTarget.hasWorkedThisMonth && !resignTarget.hasPayslipThisMonth}
                style={{ flex:1, background: (resignTarget.hasWorkedThisMonth && !resignTarget.hasPayslipThisMonth) ? "var(--border)" : "var(--danger)", border:"none", borderRadius:14, padding:14, color: (resignTarget.hasWorkedThisMonth && !resignTarget.hasPayslipThisMonth) ? "var(--text-muted)" : "#fff", fontSize:14, fontWeight:700, cursor: (resignTarget.hasWorkedThisMonth && !resignTarget.hasPayslipThisMonth) ? "not-allowed" : "pointer", opacity: (resignTarget.hasWorkedThisMonth && !resignTarget.hasPayslipThisMonth) ? 0.6 : 1, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                <i className="ti ti-alert-triangle" aria-hidden="true" /> 퇴사 처리 확정
              </button>
            </div>
          </div>
        </div>
      )}
      <AppHeader title="홈" showBellAndMenu
        rightActions={isBoth ? <RoleToggleButton activeRole={activeRole} onChange={setActiveRole} /> : undefined} />
      <div style={{ maxWidth:480, margin:"0 auto", padding:"12px 16px 0" }}>
        {loading ? (
          <div style={{ textAlign:"center", padding:"60px 0", color:"var(--text-muted)" }}>로딩 중...</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:24 }}>

            {/* ── 받은 초대장 — 알림만으로는 놓치기 쉬워서 홈에도 상시 노출 ── */}
            {mode === "worker" && pendingInvites.length > 0 && (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {pendingInvites.map(inv => (
                  <div key={inv.code} style={{
                    border:"1.5px solid rgba(245,158,11,0.45)", borderRadius:18, padding:"14px 16px",
                    background:"linear-gradient(135deg, rgba(245,158,11,0.12), rgba(236,72,153,0.06))",
                    display:"flex", alignItems:"center", gap:12,
                  }}>
                    <div style={{ width:38, height:38, borderRadius:12, background:"rgba(245,158,11,0.18)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <i className="ti ti-mail-opened" style={{ fontSize:18, color:"#f59e0b" }} aria-hidden="true" />
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:13, fontWeight:800, color:"var(--text)", margin:"0 0 2px" }}>{inv.bizName}에서 팀원 초대장이 왔어요</p>
                      <p style={{ fontSize:11, color:"var(--text-muted)", margin:0 }}>확인/조치가 필요해요 · 수락해야 소속이 연결돼요</p>
                    </div>
                    <button onClick={() => router.push(`/i/${inv.code}`)}
                      style={{ flexShrink:0, background:"#f59e0b", border:"none", borderRadius:10, padding:"9px 14px", color:"#fff", fontSize:12, fontWeight:800, cursor:"pointer", whiteSpace:"nowrap" }}>
                      확인하기
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ── 대타 SOS 퀵 액션 (DESIGN_PLAN.md P4: 홈에서 펑크 즉시 대응) ── */}
            {mode === "employer" ? (
              <button onClick={() => router.push("/daeta")}
                style={{ width:"100%", padding:"16px 18px", background:"var(--gradient-hero)", border:"none", borderRadius:18, cursor:"pointer", display:"flex", alignItems:"center", gap:12, boxShadow:"var(--shadow-elevate)" }}>
                <div style={{ width:40, height:40, borderRadius:"50%", background:"rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}><i className="ti ti-bolt" style={{ color:"#fff" }} aria-hidden="true" /></div>
                <div style={{ textAlign:"left", flex:1 }}>
                  <div style={{ fontSize:15, fontWeight:900, color:"#fff" }}>펑크 났나요? 대타 구하기</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.85)", marginTop:2 }}>팀 → 동네 검증 인력 순 자동 알림 · 계약서까지 원스톱</div>
                </div>
                <span style={{ color:"#fff", fontSize:18, fontWeight:900 }}>→</span>
              </button>
            ) : (
              <button onClick={() => router.push("/daeta")}
                style={{ width:"100%", padding:"14px 18px", background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.35)", borderRadius:18, cursor:"pointer", display:"flex", alignItems:"center", gap:12 }}>
                <i className="ti ti-circle-filled" style={{ fontSize:20, flexShrink:0, color:"var(--success)" }} aria-hidden="true" />
                <div style={{ textAlign:"left", flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:"var(--text)" }}>동네 대타로 바로 벌기</div>
                  <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>눌러서 대타 가능 켜면 동네 SOS를 가장 먼저 받아요</div>
                </div>
                <span style={{ color:"#4ade80", fontSize:16, fontWeight:900 }}>→</span>
              </button>
            )}

            {/* ── 내 소속 (worker / both) ── */}
            {mode === "worker" && (
              <section>
                <button onClick={() => setWorkOpen(v => !v)}
                  style={{ width:"100%", background:"none", border:"none", padding:"4px 0 12px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:34, height:34, borderRadius:10, background:"var(--accent)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}><i className="ti ti-briefcase" style={{ color:"#fff" }} aria-hidden="true" /></div>
                    <div>
                      <p style={{ fontSize:16, fontWeight:900, color:"var(--text)", margin:0, letterSpacing:"-0.3px" }}>내 직장</p>
                      <p style={{ fontSize:11, color:"var(--text-muted)", margin:0 }}>{current.length > 0 ? `${current.length}곳 재직 중` : "소속 없음"}</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: workOpen ? "#f87171" : "var(--primary, #8b5cf6)", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                    <span>{workOpen ? "접기" : "펼치기"}</span>
                    <i className={`ti ${workOpen ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 16, fontWeight: 900 }} aria-hidden="true" />
                  </div>
                </button>

                {/* 🟢/⚠️ 확인/조치가 필요한 항목 배너 — 우리 매장(사장님)과 동일한 패턴 */}
                {current.length > 0 && (workPendingCount > 0 || workPayslipPendingCount > 0) && (
                  <div style={{
                    background: "linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(245,158,11,0.08) 100%)",
                    border: "1.5px solid rgba(239,68,68,0.3)",
                    borderRadius: 16,
                    padding: "14px 16px",
                    marginBottom: 10,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 20 }}>⚠️</span>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 900, color: "#ef4444", margin: 0, letterSpacing: "-0.2px" }}>
                          확인/조치가 필요한 항목이 있어요
                        </p>
                        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 0" }}>
                          {workPendingCount > 0 && `계약확인 ${workPendingCount}건 `}
                          {workPayslipPendingCount > 0 && `명세서확인 ${workPayslipPendingCount}건`}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {current.filter((m: any) => m.contractStatus !== "done").map((m: any) => (
                        <span key={`c_${m.id}`} onClick={() => jumpToWorkStore(m.id)}
                          style={{ fontSize: 10, background: "#7c3aed20", color: "#7c3aed", border: "1px solid #7c3aed40", padding: "3px 8px", borderRadius: 8, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                          📄 {m.profile?.business_name || "매장"} (계약확인)
                        </span>
                      ))}
                      {current.filter((m: any) => m.payslipPending).map((m: any) => (
                        <span key={`p_${m.id}`} onClick={() => jumpToWorkStore(m.id)}
                          style={{ fontSize: 10, background: "#10b98120", color: "#10b981", border: "1px solid #10b98140", padding: "3px 8px", borderRadius: 8, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                          💰 {m.profile?.business_name || "매장"} (명세서확인)
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 통계 그리드 — 펼쳤을 때 나오는 매장별 카드 통계와 동일한 스타일 */}
                {current.length > 0 && (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", background:"var(--surface)", borderRadius:14, overflow:"hidden", border:"1px solid var(--border)", marginBottom:12 }}>
                    {[
                      { label:"재직 매장", value: current.length, icon:"ti-briefcase", onClick: () => setWorkOpen(true) },
                      {
                        label:"계약 확인", value: workPendingCount, alert: workPendingCount > 0, icon:"ti-file-text",
                        onClick: workPendingCount > 0 ? () => {
                          const pending = current.find((m: any) => m.contractStatus !== "done");
                          if (pending) jumpToWorkStore(pending.id);
                        } : undefined,
                      },
                      {
                        label:"명세서 확인", value: workPayslipPendingCount, alert: workPayslipPendingCount > 0, icon:"ti-receipt",
                        onClick: workPayslipPendingCount > 0 ? () => {
                          const pending = current.find((m: any) => m.payslipPending);
                          if (pending) jumpToWorkStore(pending.id);
                        } : undefined,
                      },
                    ].map((s, idx) => (
                      <div key={s.label} onClick={s.onClick} style={{
                        background: s.alert ? "rgba(239,68,68,0.06)" : "transparent",
                        borderLeft: idx > 0 ? "1px solid var(--border)" : "none",
                        padding:"10px 4px", textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:3,
                        cursor: s.onClick ? "pointer" : "default",
                      }}>
                        <i className={`ti ${s.icon}`} style={{ fontSize:14, color: s.alert ? "var(--danger)" : "var(--text-muted)" }} aria-hidden="true" />
                        <p style={{ fontSize:9, color:"var(--text-muted)", margin:0 }}>{s.label}</p>
                        <p style={{ fontSize:16, fontWeight:800, color: s.alert ? "var(--danger)" : "var(--text)", margin:0 }}>{s.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {workOpen && (
                  current.length === 0 ? (
                    <div style={{ ...cardStyle, padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ color:"var(--text-muted)", fontSize:13 }}>소속 매장이 없어요</span>
                      <button onClick={() => router.push("/explore")}
                        style={{ background:"var(--primary)", border:"none", borderRadius:20, padding:"5px 14px", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", whiteSpace:"nowrap" }}>
                        공고 탐색 →
                      </button>
                    </div>
                  ) : (() => {
                    // Samsung Pass 스타일 스택카드 — 사장님 "우리 매장"과 동일한 패턴 (겹쳐쌓기 + 매장별 고유 그라데이션)
                    const PEEK = 52;
                    const activeStore = current.find((s: any) => s.id === activeWorkStoreId) || current[0];
                    const sorted = [
                      ...current.filter((s: any) => s.id !== activeStore.id),
                      activeStore,
                    ];
                    const inactiveCount = sorted.length - 1;

                    const CARD_GRADIENTS = [
                      "linear-gradient(135deg,#991b1b 0%,#dc2626 100%)",
                      "linear-gradient(135deg,#1e40af 0%,#2563eb 100%)",
                      "linear-gradient(135deg,#065f46 0%,#16a34a 100%)",
                      "linear-gradient(135deg,#5b21b6 0%,#9333ea 100%)",
                      "linear-gradient(135deg,#9a3412 0%,#ea580c 100%)",
                      "linear-gradient(135deg,#155e75 0%,#0891b2 100%)",
                      "linear-gradient(135deg,#9d174d 0%,#db2777 100%)",
                      "linear-gradient(135deg,#3f6212 0%,#65a30d 100%)",
                    ];
                    const getStoreGradient = (store: any) => {
                      const origIdx = current.findIndex((s: any) => s.id === store.id);
                      const safeIdx = origIdx >= 0 ? origIdx : 0;
                      return CARD_GRADIENTS[safeIdx % CARD_GRADIENTS.length];
                    };
                    const switchActive = (id: string) => {
                      setActiveWorkStoreId(id);
                      sessionStorage.setItem("myteam_activeWorkStoreId", id);
                    };

                    return (
                      <div>
                        <div style={{ position:"relative", height: inactiveCount * PEEK }}>
                          {/* 비활성 매장 — 절대 위치로 쌓임 */}
                          {sorted.slice(0, -1).map((store: any, i: number) => (
                            <div key={store.id}
                              onClick={() => switchActive(store.id)}
                              style={{
                                position:"absolute", top: i * PEEK, left:0, right:0,
                                height: PEEK, overflow:"hidden", borderRadius:16, cursor:"pointer",
                                zIndex: inactiveCount - i,
                                background: getStoreGradient(store),
                                boxShadow:"0 4px 16px rgba(0,0,0,0.5)",
                              }}>
                              <div style={{ display:"flex", alignItems:"center", gap:10, padding:"0 14px", height: PEEK }}>
                                <i className={`ti ${BIZ_ICON[store.profile?.business_type]||"ti-building-store"}`} style={{ fontSize:18, flexShrink:0, color:"#fff" }} aria-hidden="true" />
                                <span style={{ fontSize:13, fontWeight:700, color:"rgba(255,255,255,0.85)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{store.profile?.business_name || "매장"}</span>
                                <span style={{ fontSize:11, color:"rgba(255,255,255,0.5)", whiteSpace:"nowrap", flexShrink:0 }}>{store.profile?.business_type || "업종미정"}</span>
                                {(store.contractStatus !== "done" || store.payslipPending) && <span style={{ width:7, height:7, borderRadius:"50%", background:"#ef4444", flexShrink:0 }} />}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* 활성 매장 — 맨 아래, 전체 카드 표시 */}
                        <div ref={el => { memberRefs.current[activeStore.id] = el; }} style={{ borderRadius:16, overflow:"hidden" }}>
                          <WorkerMemberScroll m={activeStore} userId={user?.id||""} router={router}
                            accentGradient={getStoreGradient(activeStore)}
                            forceOpenDocs={activeStore.id === highlightMemberId}
                            onRefresh={() => setAttRefreshKey(prev => ({ ...prev, [activeStore.id]: (prev[activeStore.id]||0)+1 }))} />
                        </div>
                      </div>
                    );
                  })()
                )}
              </section>
            )}

            {/* ── 이전 근무 이력 (worker / both) — 현재 근무 중인 곳과 헷갈리지 않게 기본 접힘 ── */}
            {mode === "worker" && pastWorks.length > 0 && (
              <section style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <button onClick={() => setPastWorkOpen(v => !v)}
                  style={{ width:"100%", background:"none", border:"none", padding:0, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: pastWorkOpen ? 12 : 0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <p style={{ fontSize:15, fontWeight:800, color:"var(--text)", margin:0, display:"flex", alignItems:"center", gap:6 }}><i className="ti ti-history" aria-hidden="true" /> 이전 근무 이력 (경력)</p>
                    <span style={{ fontSize:11, background:"rgba(124,58,237,0.15)", color:"#c4b5fd", borderRadius:20, padding:"2px 8px", fontWeight:700 }}>{pastWorks.length}곳</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: pastWorkOpen ? "#f87171" : "var(--primary, #8b5cf6)", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                    <span>{pastWorkOpen ? "접기" : "펼치기"}</span>
                    <i className={`ti ${pastWorkOpen ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 16, fontWeight: 900 }} aria-hidden="true" />
                  </div>
                </button>
                {pastWorkOpen && (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {pastWorks.map(m => {
                    const storeName = m.profile?.business_name || m.employer?.nickname || "이전 매장";
                    const bizType = m.profile?.business_type || "기타 업종";
                    const hireDate = m.hire_date || "입사일 미정";
                    const resignDate = m.updated_at 
                      ? new Date(new Date(m.updated_at).getTime() + 9 * 60 * 60 * 1000).toISOString().split("T")[0] 
                      : "퇴사일 미정";

                    return (
                      <div key={m.id} style={{ ...cardStyle, padding:"14px 16px", display:"flex", flexDirection:"column", gap:10, background:"var(--surface2)", opacity: 0.9 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                          <div>
                            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                              <span style={{ fontSize:14, fontWeight:800, color:"var(--text)" }}>{storeName}</span>
                              <span style={{ fontSize:10, background:"rgba(239,68,68,0.1)", color:"var(--danger)", borderRadius:6, padding:"1px 6px", fontWeight:700 }}>퇴직</span>
                            </div>
                            <p style={{ fontSize:11, color:"var(--text-muted)", margin:0 }}>
                              {bizType} · {m.role_desc || "스태프"}
                            </p>
                          </div>
                          <span style={{ fontSize:11, color:"var(--text-muted)", fontWeight:600 }}>
                            {hireDate} ~ {resignDate}
                          </span>
                        </div>

                        <div style={{ display:"flex", gap:8, borderTop:"1px solid var(--border)", paddingTop:10, marginTop:2 }}>
                          <button onClick={() => router.push(`/contract/view?memberId=${m.id}`)}
                            style={{ flex:1, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, padding:"6px", fontSize:11, color:"var(--text-muted)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                            <i className="ti ti-file-text" aria-hidden="true" /> 근로계약서 조회
                          </button>
                        </div>
                        <WorkerPayslipTab teamMemberId={m.id} workerId={user?.id||""} employerId={m.employer_id} router={router} />
                      </div>
                    );
                  })}
                </div>
                )}
              </section>
            )}

            {!isBoth && mode === "worker" && (
              <div style={{
                ...cardStyle,
                padding: "16px",
                background: "rgba(124, 58, 237, 0.04)",
                border: "1px dashed rgba(124, 58, 237, 0.25)",
                borderRadius: 16,
                display: "flex",
                flexDirection: "row",
                gap: 12,
                alignItems: "center",
                marginTop: -10,
                marginBottom: 10
              }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--purple-text)", margin: "0 0 2px", display:"flex", alignItems:"center", gap:4 }}><i className="ti ti-building-store" aria-hidden="true" /> 매장 운영하세요?</p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>사장님 역할을 추가하면 직원 구인이 가능해요</p>
                </div>
                <button onClick={() => upgradeToBoth("employer")}
                  style={{
                    background: "var(--primary)",
                    border: "none", borderRadius: 20, padding: "6px 14px",
                    color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0
                  }}>
                  추가하기 →
                </button>
              </div>
            )}

            {/* ── 내 팀 (employer / both) ── */}
            {mode === "employer" && (
              <section>
                <button onClick={() => setTeamOpen(v => !v)}
                  style={{ width:"100%", background:"none", border:"none", padding:"4px 0 12px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:34, height:34, borderRadius:10, background:"var(--primary)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}><i className="ti ti-building-store" style={{ color:"#fff" }} aria-hidden="true" /></div>
                    <div>
                      <p style={{ fontSize:16, fontWeight:900, color:"var(--text)", margin:0, letterSpacing:"-0.3px" }}>우리 매장</p>
                      <p style={{ fontSize:11, color:"var(--text-muted)", margin:0 }}>{myStores.length > 0 ? `${myStores.length}곳 운영 중` : "매장 없음"}</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: teamOpen ? "#f87171" : "var(--primary, #8b5cf6)", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                    <span>{teamOpen ? "접기" : "펼치기"}</span>
                    <i className={`ti ${teamOpen ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 16, fontWeight: 900 }} aria-hidden="true" />
                  </div>
                </button>

                {/* 🟢/⚠️ 1초 안심 상태 대시보드 배너 (접혀있을 때도 전 매장 상태 즉시 파악) */}
                {myStores.length > 0 && (() => {
                  const todayKo = KOREAN_DAY_BY_INDEX[new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay()];
                  const allMembers = Object.values(membersByStore).flat();
                  const scheduledToday = allMembers.filter((m: any) => isWorkingOnDay(m.work_days, todayKo));
                  const nowMinsKstBanner = (() => {
                    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
                    return kst.getUTCHours() * 60 + kst.getUTCMinutes();
                  })();
                  // 출근 예정 시각 10분 전까지는 "출근대기"로 안 셈 (아직 정상 대기 상태)
                  const isDueIn = (m: any) => {
                    const range = parseShiftRange(m.work_hours);
                    if (!range) return true;
                    return nowMinsKstBanner >= range.startMins - 10;
                  };

                  const lates = scheduledToday.filter((m: any) => m.todayAtt?.status === "late");
                  const absents = scheduledToday.filter((m: any) => m.todayAtt?.status === "absent");
                  const uncheckedIn = scheduledToday.filter((m: any) => !m.todayAtt?.check_in && m.todayAtt?.status !== "absent" && isDueIn(m));
                  const pendingContracts = allMembers.filter((m: any) => m.contractStatus !== "done");
                  const missingHireDate = allMembers.filter((m: any) => !m.hire_date);

                  const hasIssues = lates.length > 0 || absents.length > 0 || uncheckedIn.length > 0 || pendingContracts.length > 0 || missingHireDate.length > 0;
                  const checkedInCount = scheduledToday.filter((m: any) => !!m.todayAtt?.check_in).length;

                  return (
                    <div style={{ marginBottom: 14 }}>
                      {!hasIssues ? (
                        <div style={{
                          background: "linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(5,150,105,0.08) 100%)",
                          border: "1.5px solid rgba(16,185,129,0.35)",
                          borderRadius: 16,
                          padding: "14px 16px",
                          marginBottom: 10,
                          boxShadow: "0 4px 12px rgba(16,185,129,0.1)"
                        }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 20 }}>🟢</span>
                              <div>
                                <p style={{ fontSize: 14, fontWeight: 900, color: "#10b981", margin: 0, letterSpacing: "-0.2px" }}>
                                  오늘 모든 매장 이상 없음!
                                </p>
                                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 0" }}>
                                  출근 {checkedInCount}/{scheduledToday.length}명 · 지각/결근/계약미확인 0건
                                </p>
                              </div>
                            </div>
                            <span style={{ fontSize: 10, background: "#10b98125", color: "#10b981", padding: "4px 8px", borderRadius: 8, fontWeight: 800 }}>
                              안심 가동 중
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          background: "linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(245,158,11,0.08) 100%)",
                          border: "1.5px solid rgba(239,68,68,0.3)",
                          borderRadius: 16,
                          padding: "14px 16px",
                          marginBottom: 10,
                          boxShadow: "0 4px 12px rgba(239,68,68,0.08)"
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 20 }}>⚠️</span>
                            <div>
                              <p style={{ fontSize: 14, fontWeight: 900, color: "#ef4444", margin: 0, letterSpacing: "-0.2px" }}>
                                오늘 확인/조치가 필요한 항목이 있어요
                              </p>
                              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 0" }}>
                                {lates.length > 0 && `지각 ${lates.length}건 `}
                                {absents.length > 0 && `결근 ${absents.length}건 `}
                                {uncheckedIn.length > 0 && `출근대기 ${uncheckedIn.length}건 `}
                                {pendingContracts.length > 0 && `계약확인 ${pendingContracts.length}건 `}
                                {missingHireDate.length > 0 && `입사일 미입력 ${missingHireDate.length}건`}
                              </p>
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                            {lates.map((m: any) => (
                              <span key={`late_${m.id}`} onClick={() => jumpToTeamMember(m.id)} style={{ fontSize: 10, background: "#f59e0b20", color: "#d97706", border: "1px solid #f59e0b40", padding: "3px 8px", borderRadius: 8, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                                ⏰ {m.worker?.nickname || "팀원"} (지각)
                              </span>
                            ))}
                            {uncheckedIn.map((m: any) => (
                              <span key={`unc_${m.id}`} onClick={() => jumpToTeamMember(m.id)} style={{ fontSize: 10, background: "var(--surface2)", color: "var(--text-muted)", border: "1px solid var(--border)", padding: "3px 8px", borderRadius: 8, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                                ⏳ {m.worker?.nickname || "팀원"} (미출근)
                              </span>
                            ))}
                            {absents.map((m: any) => (
                              <span key={`abs_${m.id}`} onClick={() => jumpToTeamMember(m.id)} style={{ fontSize: 10, background: "#ef444420", color: "#ef4444", border: "1px solid #ef444440", padding: "3px 8px", borderRadius: 8, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                                ❌ {m.worker?.nickname || "팀원"} (결근)
                              </span>
                            ))}
                            {pendingContracts.length > 0 && (
                              <span onClick={() => jumpToTeamMember(pendingContracts[0].id)} style={{ fontSize: 10, background: "#7c3aed20", color: "#7c3aed", border: "1px solid #7c3aed40", padding: "3px 8px", borderRadius: 8, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                                📄 미확인 계약서 {pendingContracts.length}건
                              </span>
                            )}
                            {missingHireDate.map((m: any) => (
                              <span key={`hd_${m.id}`} onClick={() => jumpToTeamMember(m.id)} style={{ fontSize: 10, background: "#f59e0b20", color: "#d97706", border: "1px solid #f59e0b40", padding: "3px 8px", borderRadius: 8, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                                📅 {m.worker?.nickname || "팀원"} (입사일 미입력)
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", background:"var(--surface)", borderRadius:14, overflow:"hidden", border:"1px solid var(--border)" }}>
                        {[
                          { label:"매장", value: myStores.length, icon:"ti-building-store" },
                          { label:"직원", value: teamEmployeeCount, icon:"ti-users" },
                          { label:"오늘 출근", value: `${teamTodayCount}/${teamScheduledCount}`, icon:"ti-calendar-check" },
                          {
                            label:"계약 확인", value: teamPendingCount, alert: teamPendingCount > 0, icon:"ti-file-text",
                            onClick: pendingContracts.length > 0 ? () => jumpToTeamMember(pendingContracts[0].id) : undefined,
                          },
                        ].map((s, idx) => (
                          <div key={s.label} onClick={s.onClick} style={{
                            background: s.alert ? "rgba(239,68,68,0.06)" : "transparent",
                            borderLeft: idx > 0 ? "1px solid var(--border)" : "none",
                            padding:"10px 4px", textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:3,
                            cursor: s.onClick ? "pointer" : "default",
                          }}>
                            <i className={`ti ${s.icon}`} style={{ fontSize:14, color: s.alert ? "var(--danger)" : "var(--text-muted)" }} aria-hidden="true" />
                            <p style={{ fontSize:9, color:"var(--text-muted)", margin:0 }}>{s.label}</p>
                            <p style={{ fontSize:16, fontWeight:800, color: s.alert ? "var(--danger)" : "var(--text)", margin:0 }}>{s.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {teamOpen && (<>

                {/* 사장님 온보딩 가이드 (미완료 시 상단 노출) */}
                {!onboardingCompleted && (
                  <div style={{
                    ...cardStyle,
                    padding: "16px 18px",
                    marginBottom: 14,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 18,
                    boxShadow: "var(--shadow-elevate)",
                  }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ display:"flex", alignItems:"center", gap:6 }}><i className="ti ti-rocket" aria-hidden="true" /> 사장님 3단계 시작 가이드</span>
                      <span style={{ fontSize: 10, background: "rgba(124,58,237,0.12)", color: "var(--purple-text)", borderRadius: 10, padding: "2px 8px", fontWeight: 700 }}>
                        {[hasStore, hasEmployee, hasContract].filter(Boolean).length} / 3 완료
                      </span>
                    </p>

                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {/* 1단계: 매장 등록 */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: "50%",
                            background: hasStore ? "#10b981" : "var(--border)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: "#fff", fontWeight: 700
                          }}>
                            {hasStore ? "✓" : "1"}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: hasStore ? "var(--text-muted)" : "var(--text)", textDecoration: hasStore ? "line-through" : "none" }}>
                            매장 등록하기
                          </span>
                        </div>
                        {!hasStore && (
                          <button onClick={() => { setEditingStore(null); setStoreModalOpen(true); }}
                            style={{
                              background: "var(--primary)",
                              border: "none", borderRadius: 20, padding: "4px 12px",
                              color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer"
                            }}>
                            등록하기
                          </button>
                        )}
                      </div>

                      {/* 2단계: 직원 초대 or 공고 */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: "50%",
                            background: hasEmployee ? "#10b981" : "var(--border)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: "#fff", fontWeight: 700
                          }}>
                            {hasEmployee ? "✓" : "2"}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: hasEmployee ? "var(--text-muted)" : (hasStore ? "var(--text)" : "var(--text-muted)"), textDecoration: hasEmployee ? "line-through" : "none" }}>
                            직원 초대 or 공고 올리기
                          </span>
                        </div>
                        {hasStore && !hasEmployee && (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => router.push(`/employer/register?storeId=${activeStoreId || myStores[0]?.id}`)}
                              style={{
                                background: "var(--surface2)", border: "1px solid var(--border)",
                                borderRadius: 20, padding: "4px 10px",
                                color: "var(--text)", fontSize: 9, fontWeight: 700, cursor: "pointer"
                              }}>
                              공고 올리기
                            </button>
                            <button onClick={() => setInviteOpen(true)}
                              style={{
                                background: "var(--primary)",
                                border: "none", borderRadius: 20, padding: "4px 10px",
                                color: "#fff", fontSize: 9, fontWeight: 700, cursor: "pointer"
                              }}>
                              직원 초대
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 3단계: 근로계약서 작성 */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: "50%",
                            background: hasContract ? "#10b981" : "var(--border)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: "#fff", fontWeight: 700
                          }}>
                            {hasContract ? "✓" : "3"}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: hasContract ? "var(--text-muted)" : (hasEmployee ? "var(--text)" : "var(--text-muted)"), textDecoration: hasContract ? "line-through" : "none" }}>
                            근로계약서 작성 완료하기
                          </span>
                        </div>
                        {hasEmployee && !hasContract && (() => {
                          const firstMember = Object.values(membersByStore).flat()[0];
                          return firstMember ? (
                            <button onClick={() => router.push(`/contract?memberId=${firstMember.id}`)}
                              style={{
                                background: "var(--primary)",
                                border: "none", borderRadius: 20, padding: "4px 12px",
                                color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer"
                              }}>
                              계약서 작성
                            </button>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Samsung Pass 스타일 스택카드 복원 — 색상환에서 확실히 떨어진 8색 그라데이션(2026-07-26: 아코디언 방식 반려, 그라데이션 카드로 재환원) */}
                {myStores.length > 0 && (() => {
                  const PEEK = 52; // 비활성 카드 한 장이 보이는 높이 (한 줄만)
                  const activeStore = myStores.find((s: any) => s.id === activeStoreId) || myStores[0];
                  const activeMembers = membersByStore[activeStore.id] || [];
                  const activeStats = statsByStore[activeStore.id] || { today:0, scheduled:0, pending:0 };
                  // 비활성 카드들을 위에, 활성 카드를 맨 아래에 정렬
                  const sorted = [
                    ...myStores.filter((s: any) => s.id !== activeStore.id),
                    activeStore,
                  ];
                  const inactiveCount = sorted.length - 1;

                  // 색상환에서 확실히 떨어진 8색 그라데이션 — 각 매장의 고유 인덱스에 고정 할당
                  const CARD_GRADIENTS = [
                    "linear-gradient(135deg,#991b1b 0%,#dc2626 100%)",
                    "linear-gradient(135deg,#1e40af 0%,#2563eb 100%)",
                    "linear-gradient(135deg,#065f46 0%,#16a34a 100%)",
                    "linear-gradient(135deg,#5b21b6 0%,#9333ea 100%)",
                    "linear-gradient(135deg,#9a3412 0%,#ea580c 100%)",
                    "linear-gradient(135deg,#155e75 0%,#0891b2 100%)",
                    "linear-gradient(135deg,#9d174d 0%,#db2777 100%)",
                    "linear-gradient(135deg,#3f6212 0%,#65a30d 100%)",
                  ];

                  const getStoreGradient = (store: any) => {
                    const origIdx = myStores.findIndex((s: any) => s.id === store.id);
                    const safeIdx = origIdx >= 0 ? origIdx : 0;
                    return CARD_GRADIENTS[safeIdx % CARD_GRADIENTS.length];
                  };

                  return (
                    <div>
                      <div style={{ position:"relative", height: inactiveCount * PEEK }}>
                        {/* 비활성 카드 — 절대 위치로 쌓임 */}
                        {sorted.slice(0, -1).map((store: any, i: number) => {
                          const storeMembers = membersByStore[store.id] || [];
                          const stats = statsByStore[store.id] || { today:0, scheduled:0, pending:0 };
                          return (
                            <div
                              key={store.id}
                              onClick={() => { setActiveStoreId(store.id); sessionStorage.setItem("myteam_activeStoreId", store.id); }}
                              style={{
                                position:"absolute", top: i * PEEK, left:0, right:0,
                                height: PEEK,
                                overflow:"hidden",
                                borderRadius:16,
                                cursor:"pointer",
                                zIndex: inactiveCount - i,
                                background: getStoreGradient(store),
                                boxShadow:"0 4px 16px rgba(0,0,0,0.5)",
                              }}>
                              {/* 한 줄만 보이는 헤더 */}
                              <div style={{ display:"flex", alignItems:"center", gap:10, padding:"0 14px", height: PEEK }}>
                                <i className={`ti ${BIZ_ICON[store.business_type]||"ti-building-store"}`} style={{ fontSize:18, flexShrink:0, color:"#fff" }} aria-hidden="true" />
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

                      {/* 활성 카드 — 맨 아래, 선택된 매장의 고유 그라데이션 색상 유지하며 전체 표시 */}
                      <div style={{ borderRadius:16, overflow:"hidden", boxShadow:"0 8px 32px rgba(0,0,0,0.3)" }}>
                        {/* 활성 카드 헤더 — 선택된 매장 고유 그라데이션 */}
                        <div style={{ background: getStoreGradient(activeStore), height: PEEK, display:"flex", alignItems:"center", gap:10, padding:"0 14px" }}>
                          <i className={`ti ${BIZ_ICON[activeStore.business_type]||"ti-building-store"}`} style={{ fontSize:20, flexShrink:0, color:"#fff" }} aria-hidden="true" />
                          <div style={{ flex:1, minWidth:0 }}>
                            <p style={{ fontSize:14, fontWeight:800, color:"#fff", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{activeStore.business_name}</p>
                            <p style={{ fontSize:10, color:"rgba(255,255,255,0.65)", margin:0 }}>{activeStore.business_type||"업종미정"}{activeStore.address ? " · "+activeStore.address.slice(0,12) : ""}</p>
                          </div>
                          <button onClick={() => { setEditingStore(activeStore); setStoreModalOpen(true); }}
                            style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, padding:"5px 10px", color:"rgba(255,255,255,0.9)", fontSize:11, cursor:"pointer", flexShrink:0, whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:4 }}>
                            <i className="ti ti-pencil" aria-hidden="true" /> 수정
                          </button>
                          <button onClick={() => openDeleteModal(activeStore)}
                            style={{ background:"rgba(239,68,68,0.25)", border:"none", borderRadius:"50%", width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", color:"rgba(255,255,255,0.8)", fontSize:13, cursor:"pointer", flexShrink:0 }}>
                            ✕
                          </button>
                        </div>
                        {/* 통계 */}
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", background:"var(--surface)", borderBottom:"1px solid var(--border)" }}>
                          {[
                            { label:"총 팀원", value: activeMembers.length, icon:"ti-users" },
                            { label:"오늘 출근", value: `${activeStats.today ?? 0}/${activeStats.scheduled ?? 0}`, icon:"ti-calendar-check" },
                            { label:"계약 대기", value: activeStats.pending, alert: activeStats.pending > 0, icon:"ti-file-text" },
                          ].map((s, sIdx) => (
                            <div key={s.label} style={{
                              background: s.alert ? "rgba(239,68,68,0.06)" : "transparent",
                              borderRight: sIdx < 2 ? "1px solid var(--border)" : "none",
                              padding:"10px 8px", textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:3,
                            }}>
                              <i className={`ti ${s.icon}`} style={{ fontSize:14, color: s.alert ? "var(--danger)" : "var(--text-muted)" }} aria-hidden="true" />
                              <p style={{ fontSize:9, color:"var(--text-muted)", margin:0 }}>{s.label}</p>
                              <p style={{ fontSize:16, fontWeight:800, color: s.alert ? "var(--danger)" : "var(--text)", margin:0 }}>{s.value}</p>
                            </div>
                          ))}
                        </div>

                        {/* ⚡ 오늘 출근 현황 리얼타임 카드 */}
                        {(() => {
                          const todayKo = KOREAN_DAY_BY_INDEX[new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay()];
                          const todayScheduledMembers = activeMembers.filter((m: any) => isWorkingOnDay(m.work_days, todayKo));
                          if (todayScheduledMembers.length === 0) return null;
                          const nowMinsKstToday = (() => {
                            const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
                            return kst.getUTCHours() * 60 + kst.getUTCMinutes();
                          })();

                          return (
                            <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "14px 16px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
                                  <i className="ti ti-clock-play" style={{ color: "#7c3aed" }} aria-hidden="true" /> 오늘 근무자 현황 ({todayScheduledMembers.length}명)
                                </span>
                                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>{todayKo}요일</span>
                              </div>

                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {todayScheduledMembers.map((m: any) => {
                                  const name = m.worker?.nickname || "팀원";
                                  const attRec = m.todayAtt;
                                  const isCheckedIn = !!attRec?.check_in;
                                  const isCheckedOut = !!attRec?.check_out;
                                  const status = attRec?.status;

                                  // 출근 10분 전부터만 "미출근/승인" 취급 — 그 전엔 그냥 "출근 예정"(정상)
                                  const shiftRangeM = parseShiftRange(m.work_hours);
                                  const beforeShiftStartM = !!(shiftRangeM && nowMinsKstToday < shiftRangeM.startMins - 10);

                                  let badgeBg = "#f59e0b18";
                                  let badgeColor = "#f59e0b";
                                  let badgeText = "⏳ 미출근";
                                  let timeText = m.work_hours || "시간 미정";

                                  if (status === "absent") {
                                    badgeBg = "#ef444418";
                                    badgeColor = "#ef4444";
                                    badgeText = "❌ 결근";
                                  } else if (!isCheckedIn && beforeShiftStartM) {
                                    badgeBg = "var(--surface2)";
                                    badgeColor = "var(--text-muted)";
                                    badgeText = "🕐 출근 예정";
                                  } else if (isCheckedIn && !isCheckedOut) {
                                    if (status === "late") {
                                      badgeBg = "#f59e0b20";
                                      badgeColor = "#d97706";
                                      badgeText = "⏰ 근무 중 (지각)";
                                    } else {
                                      badgeBg = "#10b98120";
                                      badgeColor = "#10b981";
                                      badgeText = "✅ 근무 중";
                                    }
                                    timeText = `${new Date(attRec.check_in).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })} 출근`;
                                  } else if (isCheckedIn && isCheckedOut) {
                                    badgeBg = "var(--surface2)";
                                    badgeColor = "var(--text-muted)";
                                    badgeText = "🔴 퇴근 완료";
                                    timeText = `${attRec.actual_hours || 0}시간 근무`;
                                  }

                                  return (
                                    <div key={m.id} style={{ background: "var(--surface2)", borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#7c3aed20", color: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>
                                          {name.slice(0, 1)}
                                        </div>
                                        <div>
                                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{name}</span>
                                            <span style={{ fontSize: 10, background: badgeBg, color: badgeColor, padding: "2px 6px", borderRadius: 6, fontWeight: 700 }}>
                                              {badgeText}
                                            </span>
                                          </div>
                                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{timeText}</span>
                                        </div>
                                      </div>

                                      {!isCheckedIn && status !== "absent" && !beforeShiftStartM && (
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            const todayStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];
                                            const now = new Date();
                                            const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
                                            const h = String(kst.getUTCHours()).padStart(2, "0");
                                            const min = String(kst.getUTCMinutes()).padStart(2, "0");
                                            const checkInTime = `${todayStr}T${h}:${min}:00+09:00`;

                                            const { error } = await supabase.from("attendance").upsert({
                                              team_member_id: m.id,
                                              employer_id: m.employer_id,
                                              worker_id: m.worker_id,
                                              work_date: todayStr,
                                              status: "normal",
                                              check_in: checkInTime,
                                              actual_hours: 0,
                                            }, { onConflict: "team_member_id,work_date" });

                                            if (!error) {
                                              showToast(`${name}님의 출근을 승인했습니다!`);
                                              sendPushNotification({
                                                userId: m.worker_id,
                                                title: "✅ 출근 승인 완료",
                                                body: `사장님이 오늘 출근을 승인했습니다. 퇴근 시 앱에서 퇴근 버튼을 눌러주세요!`,
                                                url: "/myteam",
                                                tag: "attendance"
                                              });
                                              if (user) loadTeam(user.id);
                                            } else {
                                              showToast("출근 승인 오류: " + error.message, "error");
                                            }
                                          }}
                                          style={{
                                            background: "#10b981",
                                            color: "#fff",
                                            border: "none",
                                            borderRadius: 8,
                                            padding: "6px 12px",
                                            fontSize: 11,
                                            fontWeight: 700,
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 4
                                          }}
                                        >
                                          <i className="ti ti-check" aria-hidden="true" /> 출근 승인
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        {/* 📅 요일별 근무 시간표 타임라인 */}
                        <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "14px 16px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", display:"flex", alignItems:"center", gap:6 }}><i className="ti ti-calendar" aria-hidden="true" /> 요일별 근무 시간표</span>
                            {/* 요일 선택 칩 */}
                            <div style={{ display: "flex", gap: 3 }}>
                              {["월", "화", "수", "목", "금", "토", "일"].map(day => {
                                const isSelected = selectedTimetableDay === day;
                                return (
                                  <button
                                    key={day}
                                    type="button"
                                    onClick={() => setSelectedTimetableDay(day)}
                                    style={{
                                      width: 24,
                                      height: 24,
                                      borderRadius: "50%",
                                      border: "none",
                                      fontSize: 10,
                                      fontWeight: 800,
                                      cursor: "pointer",
                                      background: isSelected ? "var(--primary)" : "var(--surface2)",
                                      color: isSelected ? "#fff" : "var(--text-muted)",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      transition: "all 0.15s"
                                    }}
                                  >
                                    {day}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* 시간표 본체 */}
                          {(() => {
                            const parseHours = (hoursStr: string) => {
                              const match = (hoursStr || "").match(/(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/);
                              if (match) {
                                const startHour = parseInt(match[1]);
                                const startMin = parseInt(match[2]);
                                const endHour = parseInt(match[3]);
                                const endMin = parseInt(match[4]);
                                return {
                                  start: startHour + startMin / 60,
                                  end: endHour + endMin / 60,
                                  label: `${match[1]}:${match[2]}~${match[3]}:${match[4]}`
                                };
                              }
                              return null;
                            };

                            const dayMembers = activeMembers.filter(m => isWorkingOnDay(m.work_days, selectedTimetableDay));

                            if (dayMembers.length === 0) {
                              return (
                                <div style={{ padding: "16px 0", textAlign: "center", background: "rgba(255,255,255,0.01)", borderRadius: 10, border: "1px dashed rgba(255,255,255,0.05)" }}>
                                  <p style={{ color: "var(--text-muted)", fontSize: 11, margin: 0 }}>이 요일에는 예정된 근무자가 없어요</p>
                                </div>
                              );
                            }

                            return (
                              <div style={{ position: "relative", paddingBottom: 6 }}>
                                {/* 시간 축 피드 (08시 ~ 24시, 8구간) */}
                                <div style={{ display: "flex", marginLeft: 72, marginBottom: 8, paddingBottom: 4, position: "relative", height: 14 }}>
                                  {Array.from({ length: 9 }).map((_, hIdx) => {
                                    const hour = 8 + hIdx * 2;
                                    const leftPercent = (hIdx / 8) * 100;
                                    return (
                                      <span key={hour} style={{ position: "absolute", left: `${leftPercent}%`, transform: "translateX(-50%)", fontSize: 9, color: "var(--text-muted)", fontWeight: 700 }}>
                                        {String(hour).padStart(2, "0")}
                                      </span>
                                    );
                                  })}
                                </div>

                                {/* 타임라인 그리드 세로 가이드라인 */}
                                <div style={{ position: "absolute", top: 14, bottom: 0, left: 72, right: 0, pointerEvents: "none", zIndex: 0 }}>
                                  {Array.from({ length: 9 }).map((_, gIdx) => {
                                    const leftPercent = (gIdx / 8) * 100;
                                    return (
                                      <div
                                        key={gIdx}
                                        style={{
                                          position: "absolute",
                                          left: `${leftPercent}%`,
                                          top: 0,
                                          bottom: 0,
                                          width: 1,
                                          borderLeft: "1px dashed rgba(255,255,255,0.04)"
                                        }}
                                      />
                                    );
                                  })}
                                </div>

                                {/* 근무자 리스트 행 */}
                                <div style={{ display: "flex", flexDirection: "column", gap: 8, position: "relative", zIndex: 1 }}>
                                  {dayMembers.map(m => {
                                    const parsed = parseHours(m.work_hours);
                                    let left = 0;
                                    let width = 0;
                                    if (parsed) {
                                      const startClamp = Math.max(8, Math.min(24, parsed.start));
                                      const endClamp = Math.max(8, Math.min(24, parsed.end));
                                      left = ((startClamp - 8) / 16) * 100;
                                      width = ((endClamp - startClamp) / 16) * 100;
                                    }

                                    const name = m.worker?.nickname || "팀원";

                                    return (
                                      <div key={m.id} style={{ display: "flex", alignItems: "center" }}>
                                        {/* 이름 */}
                                        <div style={{ width: 64, fontSize: 11, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>
                                          {name}
                                        </div>
                                        {/* 트랙 */}
                                        <div style={{ flex: 1, height: 22, background: "rgba(255,255,255,0.02)", borderRadius: 12, position: "relative", overflow: "hidden", border: "1px solid rgba(255,255,255,0.03)" }}>
                                          {parsed ? (
                                            <div
                                              style={{
                                                position: "absolute",
                                                left: `${left}%`,
                                                width: `${width}%`,
                                                height: "100%",
                                                background: "var(--primary)",
                                                borderRadius: 10,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                fontSize: 9,
                                                color: "#fff",
                                                fontWeight: 800,
                                                whiteSpace: "nowrap",
                                                overflow: "hidden"
                                              }}
                                              title={`${name}: ${parsed.label}`}
                                            >
                                              {width > 15 && parsed.label}
                                            </div>
                                          ) : (
                                            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", paddingLeft: 8, fontSize: 9, color: "var(--text-muted)", fontStyle: "italic" }}>
                                              시간 협의
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* 초대 + 팀원 */}
                        <div style={{ background:"var(--surface)" }}>
                          <div style={{ padding:"10px 12px", borderBottom:"1px solid var(--border)", display:"flex", gap:8 }}>
                            <button onClick={() => setInviteOpen(true)}
                              style={{ flex:1, background:"var(--primary)", border:"none", borderRadius:10, padding:"9px", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                              <i className="ti ti-mail-forward" aria-hidden="true" /> 팀원 초대
                            </button>
                            <button onClick={() => router.push(`/employer/register?storeId=${activeStore.id}`)}
                              style={{ flex:1, background: activeStore.activeJob?.is_active ? "var(--surface2)" : "var(--success)", border: activeStore.activeJob?.is_active ? "1px solid var(--border)" : "none", borderRadius:10, padding:"9px", color: activeStore.activeJob?.is_active ? "var(--text-muted)" : "#fff", fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                              {activeStore.activeJob?.is_active ? (<><i className="ti ti-clipboard-text" aria-hidden="true" /> 공고수정</>) : (<><i className="ti ti-speakerphone" aria-hidden="true" /> 공고올리기</>)}
                            </button>
                          </div>
                          {activeMembers.length === 0 ? (
                            <div style={{ padding:"10px 0" }}>
                              <p style={{ color:"var(--text-muted)", fontSize:13, margin:0 }}>아직 팀원이 없어요</p>
                            </div>
                          ) : activeMembers.map((m: any) => {
                            const pType = m.worker?.worker_result?.personalityType;
                            const badge = contractBadge(m.contractStatus);
                            const name = m.worker?.nickname || (m.worker?.email ? m.worker.email.split("@")[0] : "팀원");
                            return (
                              <div key={m.id}
                                ref={el => { teamMemberRowRefs.current[m.id] = el; }}
                                onClick={() => router.push(`/employer/team/${m.id}`)}
                                className="team-member-row"
                                style={{
                                  padding:"12px 14px",
                                  borderTop:"1px solid var(--border)",
                                  display:"flex",
                                  gap:10,
                                  alignItems:"center",
                                  cursor:"pointer",
                                  transition:"background-color 0.1s ease, transform 0.1s ease",
                                }}>
                                <div onClick={(e) => { e.stopPropagation(); setActiveQuickProfile(m.worker_id); }}
                                  style={{ width:40, height:40, borderRadius:"50%", background:"var(--accent)", overflow:"hidden", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, cursor:"pointer" }}>
                                  {m.worker?.avatar_url ? <img src={m.worker.avatar_url} style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : PERSONALITY_EMOJI[pType] ? PERSONALITY_EMOJI[pType] : <i className="ti ti-user" aria-hidden="true" />}
                                </div>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
                                    <span style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>{name}</span>
                                    {m.member_role === "manager" && <span style={{ fontSize:10, background:"#f59e0b20", color:"#f59e0b", borderRadius:5, padding:"1px 5px", fontWeight:700 }}>매니저</span>}
                                    {m.worker?.trust_score != null && (() => { const g = getTrustGrade(m.worker.trust_score); return <span style={{ fontSize:10, color:g.color, fontWeight:700 }}>{g.emoji}</span>; })()}
                                  </div>
                                  <p style={{ fontSize:11, color:"var(--text-muted)", margin:"0 0 3px" }}>
                                    {m.work_days||"요일미정"} · {(() => {
                                      if (!m.work_hours) return "시간미정";
                                      if (m.work_hours.includes("~") || m.work_hours.includes("-")) {
                                        return m.work_hours.replace(/\s+/g, "");
                                      }
                                      const num = parseFloat(m.work_hours);
                                      return !isNaN(num) ? `${num}시간` : m.work_hours;
                                    })()} · {m.wage ? `${m.wage_type === "monthly" ? "월급" : m.wage_type === "daily" ? "일급" : m.wage_type === "weekly" ? "주급" : "시급"} ${m.wage.toLocaleString()}원` : "급여미정"} · 이번달 {m.thisMonth}일
                                  </p>
                                  <span onClick={async e => {
                                    e.stopPropagation();
                                    if (m.contractStatus === "none") {
                                      router.push(`/contract?memberId=${m.id}`);
                                    } else if (m.contractStatus === "pending") {
                                      const { data: c } = await supabase.from("contracts")
                                        .select("id").eq("team_member_id", m.id).eq("status","pending")
                                        .order("created_at",{ascending:false}).limit(1).maybeSingle();
                                      const name = m.worker?.nickname || "팀원";
                                      setCancelContractTarget({ memberId: m.id, contractId: c?.id || "", name });
                                    } else {
                                      router.push(`/contract/view?memberId=${m.id}`);
                                    }
                                  }}
                                    style={{ fontSize:12, borderRadius:20, padding:"4px 10px", fontWeight:800, background:badge.bg, border:badge.border, color:badge.color, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:4 }}>
                                    <i className={`ti ${badge.icon}`} style={{ fontSize:12 }} aria-hidden="true" /> {badge.label}
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
                                    const name = m.worker?.nickname || "팀원";
                                    const now = new Date();
                                    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
                                    const y = kst.getUTCFullYear();
                                    const mo = kst.getUTCMonth() + 1;
                                    const monthStart = `${y}-${String(mo).padStart(2,"0")}-01`;
                                    const monthEnd = `${y}-${String(mo).padStart(2,"0")}-${String(new Date(y, mo, 0).getDate()).padStart(2,"0")}`;
                                    const { data: attRows } = await supabase.from("attendance").select("work_date")
                                      .eq("team_member_id", m.id).gte("work_date", monthStart).lte("work_date", monthEnd)
                                      .not("status", "in", '("absent","off")');
                                    const hasWorkedThisMonth = !!(attRows && attRows.length > 0);

                                    let hasPayslipThisMonth = false;
                                    let uncoveredWorkDays = 0;
                                    if (hasWorkedThisMonth) {
                                      const { data: slips } = await supabase.from("payslips")
                                        .select("attendance_data")
                                        .eq("team_member_id", m.id).eq("year", y).eq("month", mo)
                                        .order("issued_at", { ascending: false }).limit(1);
                                      hasPayslipThisMonth = !!(slips && slips.length > 0);
                                      if (hasPayslipThisMonth) {
                                        const coveredDates = new Set((slips![0].attendance_data || []).map((a: any) => a.work_date));
                                        uncoveredWorkDays = (attRows || []).filter((a: any) => !coveredDates.has(a.work_date)).length;
                                      }
                                    }
                                    setResignTarget({ member: m, name, hasWorkedThisMonth, hasPayslipThisMonth, uncoveredWorkDays });
                                  }} style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:7, padding:"3px 7px", fontSize:10, color:"var(--danger)", cursor:"pointer", fontWeight:600, whiteSpace:"nowrap" }}>
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
                        <i className="ti ti-folder" aria-hidden="true" /> 직원 서류 보관함
                      </button>
                    </div>
                  );
                })()}
                </>)}
              </section>
            )}

            {userType === "employer" && (
              <div style={{
                ...cardStyle,
                padding: "16px",
                background: "rgba(236,72,153,0.04)",
                border: "1px dashed rgba(236,72,153,0.25)",
                borderRadius: 16,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                alignItems: "center",
                textAlign: "center",
                marginTop: 10,
                marginBottom: 10
              }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--pink-text)", margin: "0 0 2px" }}>🙋‍♂️ 알바도 구하고 싶으신가요?</p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>알바생 역할을 추가하면 구직 공고를 탐색하고 지원할 수 있습니다.</p>
                </div>
                <button onClick={() => upgradeToBoth("worker")}
                  style={{
                    background: "var(--accent)",
                    border: "none", borderRadius: 20, padding: "6px 16px",
                    color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer"
                  }}>
                  알바생 역할 추가하기 →
                </button>
              </div>
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
        defaultStoreId={activeStoreId || undefined}
      />
      {/* 매장 삭제 확인 팝업 */}
      {deleteTarget && (() => {
        const { store, members: storeMembers } = deleteTarget;
        const hasMembers = storeMembers.length > 0;
        const doDelete = async () => {
          if (hasMembers) return; // 안전장치 — 팀원 있으면 삭제 불가
          // 해당 매장의 모든 공고 비활성화
          await supabase.from("jobs").update({ is_active: false }).eq("employer_profile_id", store.id);
          const { error } = await supabase.from("employer_profiles")
            .update({ is_deleted: true })
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
              <div style={{ fontSize:36, textAlign:"center", marginBottom:12, color:"var(--danger)" }}><i className="ti ti-trash" aria-hidden="true" /></div>
              <p style={{ fontSize:16, fontWeight:800, color:"var(--text)", textAlign:"center", margin:"0 0 8px" }}>매장 삭제</p>
              {hasMembers ? (
                <>
                  <p style={{ fontSize:13, color:"var(--text-muted)", textAlign:"center", margin:"0 0 12px", lineHeight:1.5 }}>
                    재직 중인 팀원이 <strong style={{ color:"var(--danger)" }}>{storeMembers.length}명</strong> 있어요.<br/>
                    팀원 퇴직 처리 후 매장을 삭제할 수 있어요.
                  </p>
                  <div style={{ background:"var(--surface2)", borderRadius:10, padding:"8px 12px", marginBottom:16, maxHeight:120, overflowY:"auto" }}>
                    {storeMembers.map((m: any) => (
                      <div key={m.id} style={{ fontSize:12, color:"var(--text-muted)", padding:"3px 0", display:"flex", alignItems:"center", gap:6 }}>
                        <i className="ti ti-user" aria-hidden="true" />
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

      {activeQuickProfile && (
        <UserProfileBottomSheet
          userId={activeQuickProfile}
          onClose={() => setActiveQuickProfile(null)}
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
