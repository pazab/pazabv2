import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createNotification } from "@/lib/notify";
import { getBreakMinutesForDate } from "@/lib/utils";

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// 푸시 알림의 "지금 출근"/"지금 퇴근" 원탭 액션 버튼에서 호출되는 엔드포인트.
// 서비스워커(백그라운드)에서 호출되므로 GPS를 확인할 수 없음 — 본인 기기에만 오는
// 세션 쿠키(로그인 상태)를 근거로 본인 확인만 하고 처리한다 (앱 내 셀프 체크인의 GPS 반경 체크와는 다른 신뢰 모델).
export async function POST(req: NextRequest) {
  try {
    const { teamMemberId, action } = await req.json();
    if (!teamMemberId || !["checkin", "checkout"].includes(action)) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getServiceClient();
    const { data: member } = await supabase
      .from("team_members")
      .select("id, employer_id, worker_id, work_hours, status")
      .eq("id", teamMemberId)
      .maybeSingle();

    if (!member || member.status !== "active") {
      return NextResponse.json({ error: "팀원 정보를 찾을 수 없습니다." }, { status: 404 });
    }
    if (member.worker_id !== user.id) {
      return NextResponse.json({ error: "본인 근태만 처리할 수 있습니다." }, { status: 403 });
    }

    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const today = kst.toISOString().split("T")[0];
    const h = kst.getUTCHours();
    const mnt = kst.getUTCMinutes();
    const timeStr = `${String(h).padStart(2, "0")}:${String(mnt).padStart(2, "0")}`;

    if (action === "checkin") {
      const { data: existing } = await supabase
        .from("attendance")
        .select("id, check_in")
        .eq("team_member_id", teamMemberId)
        .eq("work_date", today)
        .maybeSingle();

      if (existing?.check_in) {
        return NextResponse.json({ message: "이미 출근 처리되어 있어요." });
      }

      // 지각 자동 판단 (work_hours가 "09:00~18:00" 형식일 때)
      let status = "normal";
      if (member.work_hours && member.work_hours.includes(":")) {
        const startPart = member.work_hours.split(/[-~]/)[0];
        const [startH, startM] = startPart.split(":").map(Number);
        if (!isNaN(startH)) {
          const contractMins = startH * 60 + (startM || 0);
          const checkInMins = h * 60 + mnt;
          if (checkInMins > contractMins + 10) status = "late";
        }
      }

      const checkInTime = `${today}T${timeStr}:00+09:00`;
      const { error } = await supabase.from("attendance").upsert(
        {
          team_member_id: teamMemberId,
          employer_id: member.employer_id,
          worker_id: member.worker_id,
          work_date: today,
          status,
          check_in: checkInTime,
          actual_hours: 0,
        },
        { onConflict: "team_member_id,work_date" }
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      await createNotification({
        userId: member.employer_id,
        type: "attendance",
        title: status === "late" ? "⏰ 팀원 지각 출근" : "✅ 팀원 출근",
        body: `${timeStr}에 출근 처리됐어요.`,
        url: `/employer/team/${teamMemberId}`,
      });

      return NextResponse.json({ success: true, status, time: timeStr });
    } else {
      const { data: existing } = await supabase
        .from("attendance")
        .select("id, check_in, check_out, status")
        .eq("team_member_id", teamMemberId)
        .eq("work_date", today)
        .maybeSingle();

      if (!existing?.check_in) {
        return NextResponse.json({ error: "출근 기록이 없어 퇴근 처리할 수 없어요." }, { status: 400 });
      }
      if (existing.check_out) {
        return NextResponse.json({ message: "이미 퇴근 처리되어 있어요." });
      }

      const checkIn = new Date(existing.check_in);
      const checkOutTime = `${today}T${timeStr}:00+09:00`;
      const checkOut = new Date(checkOutTime);
      const { data: memberContracts } = await supabase
        .from("contracts")
        .select("status, contract_data")
        .eq("team_member_id", teamMemberId)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false });
      const breakMinutes = getBreakMinutesForDate(memberContracts, today);
      const rawMs = checkOut.getTime() - checkIn.getTime() - breakMinutes * 60 * 1000;
      const diffHours = Math.max(0, Math.round(rawMs / 36000) / 100);

      let status = existing.status;
      const contractHours = member.work_hours && !member.work_hours.includes(":") ? parseFloat(member.work_hours) : null;
      if (contractHours && diffHours < contractHours - 0.5) status = "early_leave";

      const { error } = await supabase
        .from("attendance")
        .update({ check_out: checkOutTime, actual_hours: diffHours, status })
        .eq("id", existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      await createNotification({
        userId: member.employer_id,
        type: "attendance",
        title: "🔴 팀원 퇴근",
        body: `${timeStr}에 퇴근 처리됐어요. (근무 ${diffHours}시간)`,
        url: `/employer/team/${teamMemberId}`,
      });

      return NextResponse.json({ success: true, diffHours, time: timeStr });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
