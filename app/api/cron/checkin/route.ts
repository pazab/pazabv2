import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/notify";
import { isWorkingOnDay } from "@/lib/utils";

// service_role 클라이언트 생성
const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function GET(req: Request) {
  // Vercel Cron은 Authorization: Bearer <CRON_SECRET> 헤더를 자동으로 전송함
  if (process.env.NODE_ENV === "production") {
    const auth = (req as any).headers?.get?.("authorization") || "";
    const cronSecret = process.env.CRON_SECRET || "";
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = getServiceClient();

  // KST 현재 시간
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayStr = kst.toISOString().split("T")[0]; // YYYY-MM-DD
  const nowH = kst.getUTCHours();
  const nowM = kst.getUTCMinutes();
  const nowMins = nowH * 60 + nowM;

  const dayIndex = kst.getUTCDay(); // 0: 일, 1: 월, ...
  const korDay = ["일", "월", "화", "수", "목", "금", "토"][dayIndex];

  // active 직원 전체 로드 후 오늘 요일 근무자만 JS에서 필터링
  // (work_days가 "월·화·수" 개별 나열이 아니라 "평일"/"주5일"/"매일" 같은 매크로로 저장된 경우
  //  DB LIKE 필터로는 못 걸러져서 결근 자동처리가 조용히 빠지던 버그 — isWorkingOnDay로 통일)
  const { data: allActiveMembers, error: memError } = await supabase
    .from("team_members")
    .select(`id, worker_id, employer_id, work_days, work_hours, status`)
    .eq("status", "active");

  if (memError) {
    return NextResponse.json({ error: memError.message }, { status: 500 });
  }

  const members = (allActiveMembers || []).filter(m => isWorkingOnDay(m.work_days, korDay));

  if (members.length === 0) {
    return NextResponse.json({ message: "No workers scheduled for today" });
  }

  const results: any[] = [];

  for (const m of members) {
    // work_hours 파싱 (예: "09:00~18:00 (휴게 ...)" 또는 "09:00-18:00")
    const match = m.work_hours?.match(/\b(\d{1,2}):(\d{2})\b/);
    const rangeMatch = m.work_hours?.match(/(\d{1,2}):(\d{2})[~-](\d{1,2}):(\d{2})/);

    // 이 직원의 오늘 근태 기록 조회
    const { data: att } = await supabase
      .from("attendance")
      .select("id, status, check_in, check_out")
      .eq("team_member_id", m.id)
      .eq("work_date", todayStr)
      .maybeSingle();

    // 이미 출근했고 아직 퇴근 전이면 → 퇴근 시간 알림(원탭 액션)만 체크
    if (att?.check_in && !att?.check_out) {
      if (rangeMatch) {
        const endH = parseInt(rangeMatch[3]);
        const endM = parseInt(rangeMatch[4]);
        const endMins = endH * 60 + endM;
        const diffFromEnd = nowMins - endMins;
        if (diffFromEnd >= -2 && diffFromEnd <= 2) {
          const endTimeStr = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
          await createNotification({
            userId: m.worker_id,
            type: "attendance",
            title: "🔴 퇴근 시간이에요!",
            body: `오늘 근무 종료 예정 시각(${endTimeStr})입니다. 아래 버튼으로 바로 퇴근 처리하세요.`,
            url: "/myteam",
            actions: [{ action: "checkout", title: "🔴 지금 퇴근" }],
            data: { teamMemberId: m.id, actionType: "checkout" },
          });
          results.push({ memberId: m.id, action: "alert_checkout_time" });
        }
      }
      continue;
    }

    // 이미 결근 처리가 되어 있다면 스킵
    if (att?.status === "absent") continue;
    if (!match) continue; // 출근 시간 정보 파싱 실패 시 스킵

    const startH = parseInt(match[1]);
    const startM = parseInt(match[2]);
    const startMins = startH * 60 + startM;

    // 분 차이 (현재 시간 - 출근 시간)
    const diffMins = nowMins - startMins;
    const timeStr = `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}`;
    const checkinAction = [{ action: "checkin", title: "✅ 지금 출근" }];

    // 5분 주기 크론에 따라 윈도우(범위)로 체크합니다.
    if (diffMins >= -12 && diffMins <= -8) {
      // 10분 전 알림
      await createNotification({
        userId: m.worker_id,
        type: "attendance",
        title: "⏰ 출근 10분 전입니다!",
        body: `오늘 출근 시각은 ${timeStr}입니다. 매장에 도착하시면 아래 버튼으로 바로 출근 처리하세요.`,
        url: "/myteam",
        actions: checkinAction,
        data: { teamMemberId: m.id, actionType: "checkin" },
      });
      results.push({ memberId: m.id, action: "alert_10m_before" });
    } else if (diffMins >= -2 && diffMins <= 2) {
      // 정시 알림
      await createNotification({
        userId: m.worker_id,
        type: "attendance",
        title: "📢 출근 정시 알림",
        body: `출근 예정 시각(${timeStr})입니다. 매장에 도착하셨다면 아래 버튼으로 바로 출근 처리하세요.`,
        url: "/myteam",
        actions: checkinAction,
        data: { teamMemberId: m.id, actionType: "checkin" },
      });
      results.push({ memberId: m.id, action: "alert_on_time" });
    } else if (diffMins >= 4 && diffMins <= 7) {
      // +5분 지각 경고 (알바생 & 사장님)
      await createNotification({
        userId: m.worker_id,
        type: "attendance",
        title: "⚠️ 출근 5분 지연 경고",
        body: `출근 시간이 5분 초과되었습니다. 5분 뒤(출근 10분 초과) 지각 처리됩니다. 서둘러 주세요!`,
        url: "/myteam",
        actions: checkinAction,
        data: { teamMemberId: m.id, actionType: "checkin" },
      });
      await createNotification({
        userId: m.employer_id,
        type: "attendance",
        title: "⚠️ 팀원 출근 지연 알림",
        body: `오늘 출근 예정인 팀원이 출근시각(${timeStr}) 5분이 지나도록 아직 출근하지 않았습니다.`,
        url: `/employer/team/${m.id}`
      });
      results.push({ memberId: m.id, action: "alert_5m_late_warning" });
    } else if (diffMins >= 20) {
      // +20분 미출근 -> 결근 자동 등록
      const { error: upsertErr } = await supabase
        .from("attendance")
        .upsert({
          team_member_id: m.id,
          employer_id: m.employer_id,
          worker_id: m.worker_id,
          work_date: todayStr,
          status: "absent",
          actual_hours: 0,
        }, { onConflict: "team_member_id,work_date" });

      if (!upsertErr) {
        // 알바생 알림 (자동결근 후에도 지금이라도 출근 처리하면 지각으로 정정됨)
        await createNotification({
          userId: m.worker_id,
          type: "attendance",
          title: "❌ 미출근 결근 처리 안내",
          body: `오늘 출근 시각(${timeStr})으로부터 20분이 초과되어 자동으로 결근(absent) 처리되었습니다. 지금이라도 출근하셨다면 아래 버튼을 눌러주세요.`,
          url: "/myteam",
          actions: checkinAction,
          data: { teamMemberId: m.id, actionType: "checkin" },
        });

        // 사장님 알림
        await createNotification({
          userId: m.employer_id,
          type: "attendance",
          title: "🚨 팀원 미출근 결근 처리 알림",
          body: `오늘 출근 예정이었던 팀원이 20분 내로 미출근하여 결근 처리되었습니다.`,
          url: `/employer/team/${m.id}`
        });

        // 근태 로그 기록
        const { data: savedAtt } = await supabase.from("attendance")
          .select("id").eq("team_member_id", m.id).eq("work_date", todayStr).maybeSingle();
        
        if (savedAtt?.id) {
          await supabase.from("attendance_logs").insert({
            attendance_id: savedAtt.id,
            team_member_id: m.id,
            action: "update",
            actor_id: m.employer_id,
            actor_role: "employer",
            after_data: { status: "absent", work_date: todayStr, memo: "20분 미출근으로 시스템 자동 결근" },
          });
        }

        results.push({ memberId: m.id, action: "auto_absent_processed" });
      } else {
        console.error("Auto absent processing error:", upsertErr);
        results.push({ memberId: m.id, action: "auto_absent_failed", error: upsertErr.message });
      }
    }
  }

  return NextResponse.json({ message: "Cron process completed", results });
}
