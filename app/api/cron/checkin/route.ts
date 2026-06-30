import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/notify";

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

  // 오늘 요일 근무인 active 직원 정보 모두 로드
  const { data: members, error: memError } = await supabase
    .from("team_members")
    .select(`id, worker_id, employer_id, work_days, work_hours, status`)
    .eq("status", "active")
    .like("work_days", `%${korDay}%`);

  if (memError) {
    return NextResponse.json({ error: memError.message }, { status: 500 });
  }

  if (!members || members.length === 0) {
    return NextResponse.json({ message: "No workers scheduled for today" });
  }

  const results: any[] = [];

  for (const m of members) {
    // work_hours 파싱 (예: "09:00~18:00 (휴게 ...)" 또는 "09:00-18:00")
    const match = m.work_hours?.match(/\b(\d{2}):(\d{2})\b/);
    if (!match) continue; // 출근 시간 정보 파싱 실패 시 스킵

    const startH = parseInt(match[1]);
    const startM = parseInt(match[2]);
    const startMins = startH * 60 + startM;

    // 분 차이 (현재 시간 - 출근 시간)
    const diffMins = nowMins - startMins;

    // 이 직원의 오늘 근태 기록 조회
    const { data: att } = await supabase
      .from("attendance")
      .select("id, status, check_in")
      .eq("team_member_id", m.id)
      .eq("work_date", todayStr)
      .maybeSingle();

    // 이미 출근한 기록이 있거나 결근 처리가 이미 되어 있다면 스킵
    if (att && (att.check_in || att.status === "absent")) {
      continue;
    }

    const timeStr = `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}`;

    // 5분 주기 크론에 따라 윈도우(범위)로 체크합니다.
    if (diffMins >= -12 && diffMins <= -8) {
      // 10분 전 알림
      await createNotification({
        userId: m.worker_id,
        type: "attendance",
        title: "⏰ 출근 10분 전입니다!",
        body: `오늘 출근 시각은 ${timeStr}입니다. 매장 근처에서 앱을 열어 출근 처리를 해 주세요.`,
        url: "/myteam"
      });
      results.push({ memberId: m.id, action: "alert_10m_before" });
    } else if (diffMins >= -2 && diffMins <= 2) {
      // 정시 알림
      await createNotification({
        userId: m.worker_id,
        type: "attendance",
        title: "📢 출근 정시 알림",
        body: `출근 예정 시각(${timeStr})입니다. GPS가 켜져 있는지 확인하고 매장에 도착하셨다면 앱을 열어주세요.`,
        url: "/myteam"
      });
      results.push({ memberId: m.id, action: "alert_on_time" });
    } else if (diffMins >= 4 && diffMins <= 7) {
      // +5분 지각 경고
      await createNotification({
        userId: m.worker_id,
        type: "attendance",
        title: "⚠️ 출근 5분 지연 경고",
        body: `출근 시간이 5분 초과되었습니다. 5분 뒤(출근 10분 초과) 지각 처리됩니다. 서둘러 주세요!`,
        url: "/myteam"
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
        // 알바생 알림
        await createNotification({
          userId: m.worker_id,
          type: "attendance",
          title: "❌ 미출근 결근 처리 안내",
          body: `오늘 출근 시각(${timeStr})으로부터 20분이 초과되어 자동으로 결근(absent) 처리되었습니다.`,
          url: "/myteam"
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
