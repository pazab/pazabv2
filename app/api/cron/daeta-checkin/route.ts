import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/notify";
import { DaetaPostingRow } from "@/lib/daetaEscalation";
import { markNoShowAndReescalate } from "@/lib/daetaNoShow";
import { daetaDayCount } from "@/lib/utils";

// 대타 출근·퇴근 타임라인 크론 (5분 주기) — app/api/cron/checkin(정규 팀원용)과 동일한 검증된 패턴을
// 대타(daeta) 매칭에 이식. 정규직원은 +20분을 결근 기준으로 쓰지만, 대타는 그 시간에 반드시
// 사람이 있어야 하는 긴급성이 더 커서 +15분으로 더 타이트하게 잡음 (2026-08-13 결정).
// 파일명은 daeta-checkin이지만 이미 등록된 외부 크론(cron-job.org) URL을 그대로 재사용하기 위해
// 퇴근 체크아웃 리마인드 로직도 이 안에 같이 넣었음(2026-08-14) — 새 크론 등록 불필요.
const AUTO_NOSHOW_MIN = 15;

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    const auth = (req as any).headers?.get?.("authorization") || "";
    const cronSecret = process.env.CRON_SECRET || "";
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = getServiceClient();

  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayStr = kst.toISOString().split("T")[0];
  const nowMins = kst.getUTCHours() * 60 + kst.getUTCMinutes();

  const { data: matches, error } = await supabase
    .from("matches")
    .select("id, employer_id, worker_id, daeta_posting_id, progress_status, checked_in_at, noshow_extend_until")
    .not("daeta_posting_id", "is", null)
    .eq("progress_status", "accepted")
    .is("checked_in_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!matches || matches.length === 0) return NextResponse.json({ message: "No pending daeta check-ins" });

  const postingIds = Array.from(new Set(matches.map(m => m.daeta_posting_id)));
  const { data: postings } = await supabase
    .from("daeta_postings")
    .select("id, user_id, business_name, region, lat, lng, work_date, work_date_end, work_hours, wage, base_wage, max_urgent_pct, duty, status, escalation_stage, stage_updated_at, allow_new, created_at, expires_at")
    .in("id", postingIds);

  const postingById = new Map((postings || []).map(p => [p.id, p]));
  const results: any[] = [];

  for (const m of matches) {
    const posting = postingById.get(m.daeta_posting_id);
    if (!posting || posting.work_date !== todayStr) continue; // 오늘 시작하는 건만 판정(다일치는 첫날 기준)

    const startMatch = posting.work_hours?.match(/\b(\d{1,2}):(\d{2})\b/);
    if (!startMatch) continue;
    const startMins = parseInt(startMatch[1]) * 60 + parseInt(startMatch[2]);
    const diffMins = nowMins - startMins;
    const timeStr = `${startMatch[1].padStart(2, "0")}:${startMatch[2]}`;

    const extendActive = m.noshow_extend_until && new Date(m.noshow_extend_until).getTime() > Date.now();

    if (diffMins >= -12 && diffMins <= -8) {
      await createNotification({
        userId: m.worker_id, type: "daeta",
        title: "⏰ 대타 출근 10분 전입니다!",
        body: `${posting.business_name} 출근 시각은 ${timeStr}이에요. 도착하시면 아래 버튼으로 바로 출근 처리하세요.`,
        url: "/mypage/daeta-history?tab=worker",
        actions: [{ action: "daeta_checkin", title: "✅ 지금 출근" }],
        data: { matchId: m.id, actionType: "daeta_checkin" },
      });
      results.push({ matchId: m.id, action: "alert_10m_before" });
    } else if (diffMins >= -2 && diffMins <= 2) {
      await createNotification({
        userId: m.worker_id, type: "daeta",
        title: "📢 대타 출근 정시 알림",
        body: `${posting.business_name} 출근 예정 시각(${timeStr})이에요. 도착하셨다면 아래 버튼으로 바로 출근 처리하세요.`,
        url: "/mypage/daeta-history?tab=worker",
        actions: [{ action: "daeta_checkin", title: "✅ 지금 출근" }],
        data: { matchId: m.id, actionType: "daeta_checkin" },
      });
      results.push({ matchId: m.id, action: "alert_on_time" });
    } else if (diffMins >= 4 && diffMins <= 7) {
      await createNotification({
        userId: m.worker_id, type: "daeta",
        title: "⚠️ 출근 5분 지연 경고",
        body: `출근 시간이 5분 초과됐어요. ${AUTO_NOSHOW_MIN - 5}분 뒤 자동으로 노쇼 처리돼요. 서둘러 주세요!`,
        url: "/mypage/daeta-history?tab=worker",
        actions: [{ action: "daeta_checkin", title: "✅ 지금 출근" }],
        data: { matchId: m.id, actionType: "daeta_checkin" },
      });
      await createNotification({
        userId: m.employer_id, type: "daeta",
        title: "⚠️ 대타 출근 지연 알림",
        body: `${posting.business_name} 대타가 출근시각(${timeStr})이 5분 지나도록 출근하지 않았어요. ${AUTO_NOSHOW_MIN}분 넘으면 자동으로 다음 인력을 찾아드려요.`,
        url: "/mypage/daeta-history?tab=employer",
        actions: [{ action: "daeta_extend", title: "⏳ 10분만 더 기다리기" }],
        data: { matchId: m.id, actionType: "daeta_extend" },
      });
      results.push({ matchId: m.id, action: "alert_5m_late_warning" });
    } else if (diffMins >= AUTO_NOSHOW_MIN && !extendActive) {
      await markNoShowAndReescalate(supabase, m, posting as DaetaPostingRow, "auto");
      results.push({ matchId: m.id, action: "auto_noshow_reescalated" });
    }
  }

  // 퇴근 체크아웃 타임라인 — 출근했지만 아직 체크아웃 안 한 건. 노쇼처럼 자동판정할 근거는
  // 없으니(이미 근무를 한 상태) 원탭 알림으로 계속 유도만 하고, 오래 방치되면 사장님에게도 알림.
  const { data: checkoutPending } = await supabase
    .from("matches")
    .select("id, employer_id, worker_id, daeta_posting_id, checked_in_at, checked_out_at")
    .not("daeta_posting_id", "is", null)
    .eq("progress_status", "accepted")
    .not("checked_in_at", "is", null)
    .is("checked_out_at", null);

  if (checkoutPending && checkoutPending.length > 0) {
    const coPostingIds = Array.from(new Set(checkoutPending.map(m => m.daeta_posting_id)));
    const { data: coPostings } = await supabase
      .from("daeta_postings")
      .select("id, business_name, work_date, work_date_end, work_hours")
      .in("id", coPostingIds);
    const coPostingById = new Map((coPostings || []).map(p => [p.id, p]));

    for (const m of checkoutPending) {
      const posting = coPostingById.get(m.daeta_posting_id);
      if (!posting) continue;
      const endDateStr = posting.work_date_end || posting.work_date;
      if (endDateStr !== todayStr) continue; // 오늘 끝나는 건만 판정

      const endPart = posting.work_hours?.split("~")[1]?.trim();
      const endMatch = endPart?.match(/\b(\d{1,2}):(\d{2})\b/);
      if (!endMatch) continue;
      const endMins = parseInt(endMatch[1]) * 60 + parseInt(endMatch[2]);
      const diffMins = nowMins - endMins;
      const timeStr = `${endMatch[1].padStart(2, "0")}:${endMatch[2]}`;

      if (diffMins >= -12 && diffMins <= -8) {
        await createNotification({
          userId: m.worker_id, type: "daeta",
          title: "⏰ 대타 근무 종료 10분 전입니다!",
          body: `${posting.business_name} 근무 종료 시각은 ${timeStr}이에요. 마무리하시면 아래 버튼으로 바로 퇴근 처리하세요.`,
          url: "/mypage/daeta-history?tab=worker",
          actions: [{ action: "daeta_checkout", title: "🏁 지금 퇴근" }],
          data: { matchId: m.id, actionType: "daeta_checkout" },
        });
        results.push({ matchId: m.id, action: "checkout_alert_10m_before" });
      } else if (diffMins >= -2 && diffMins <= 2) {
        await createNotification({
          userId: m.worker_id, type: "daeta",
          title: "📢 대타 근무 종료 시각입니다",
          body: `${posting.business_name} 근무 종료 예정 시각(${timeStr})이에요. 퇴근하시면 아래 버튼으로 바로 처리하세요.`,
          url: "/mypage/daeta-history?tab=worker",
          actions: [{ action: "daeta_checkout", title: "🏁 지금 퇴근" }],
          data: { matchId: m.id, actionType: "daeta_checkout" },
        });
        results.push({ matchId: m.id, action: "checkout_alert_on_time" });
      } else if (diffMins >= 30 && diffMins <= 34) {
        await createNotification({
          userId: m.worker_id, type: "daeta",
          title: "⚠️ 퇴근 처리를 아직 안 하셨어요",
          body: `근무 종료 시각이 30분 지났어요. 잊지 말고 퇴근 처리해주세요 — 사장님 정산에 필요해요.`,
          url: "/mypage/daeta-history?tab=worker",
          actions: [{ action: "daeta_checkout", title: "🏁 지금 퇴근" }],
          data: { matchId: m.id, actionType: "daeta_checkout" },
        });
        await createNotification({
          userId: m.employer_id, type: "daeta",
          title: "⚠️ 대타 퇴근 처리 지연",
          body: `${posting.business_name} 대타가 종료시각(${timeStr})이 30분 지나도록 퇴근 처리를 안 했어요. 확인 후 필요하면 직접 정산해주세요.`,
          url: "/mypage/daeta-history?tab=employer",
          data: { matchId: m.id },
        });
        results.push({ matchId: m.id, action: "checkout_alert_30m_late" });
      }
    }
  }

  // 다일치(기간) 대타 2일차 이후 출근 모니터링 — 예전엔 1일차만 판정해서 2일차 이후 무단 불참은
  // 시스템이 아예 알 방법이 없었음. daeta_daily_attendance(1일차 이후부터 기록됨)로 "오늘" 출근
  // 여부를 확인한다. 다만 이 판정 경로는 아직 신규라 자동으로 노쇼 확정·계약 종료까지는 하지 않고
  // (오탐 시 되돌리기 어려운 정지 페널티까지 가는 건 부담) 사장님에게 알려서 직접 확인/신고하게 한다.
  const { data: multiDayMatches } = await supabase
    .from("matches")
    .select("id, employer_id, worker_id, daeta_posting_id, noshow_extend_until")
    .not("daeta_posting_id", "is", null)
    .eq("progress_status", "accepted")
    .not("checked_in_at", "is", null); // 최소 1일차는 출근한 건만 대상(안 그러면 위 1일차 로직이 이미 처리)

  if (multiDayMatches && multiDayMatches.length > 0) {
    const mdPostingIds = Array.from(new Set(multiDayMatches.map(m => m.daeta_posting_id)));
    const { data: mdPostings } = await supabase
      .from("daeta_postings")
      .select("id, business_name, work_date, work_date_end, work_hours")
      .in("id", mdPostingIds);
    const mdPostingById = new Map((mdPostings || []).map(p => [p.id, p]));

    for (const m of multiDayMatches) {
      const posting = mdPostingById.get(m.daeta_posting_id);
      if (!posting || !posting.work_date_end) continue;
      const days = daetaDayCount(posting.work_date, posting.work_date_end);
      if (days <= 1) continue; // 하루짜리는 위 로직이 이미 처리
      if (todayStr <= posting.work_date || todayStr > posting.work_date_end) continue; // 2일차~마지막날 사이만

      const { data: todayRow } = await supabase.from("daeta_daily_attendance")
        .select("checked_in_at").eq("match_id", m.id).eq("work_date", todayStr).maybeSingle();
      if (todayRow?.checked_in_at) continue; // 오늘 이미 출근함

      const startMatch = posting.work_hours?.match(/\b(\d{1,2}):(\d{2})\b/);
      if (!startMatch) continue;
      const startMins = parseInt(startMatch[1]) * 60 + parseInt(startMatch[2]);
      const diffMins = nowMins - startMins;
      const timeStr = `${startMatch[1].padStart(2, "0")}:${startMatch[2]}`;
      const extendActive = m.noshow_extend_until && new Date(m.noshow_extend_until).getTime() > Date.now();

      if (diffMins >= -12 && diffMins <= -8) {
        await createNotification({
          userId: m.worker_id, type: "daeta",
          title: "⏰ 대타 출근 10분 전입니다!",
          body: `${posting.business_name} 오늘도 근무일이에요. 출근 시각은 ${timeStr}이에요.`,
          url: "/mypage/daeta-history?tab=worker",
          actions: [{ action: "daeta_checkin", title: "✅ 지금 출근" }],
          data: { matchId: m.id, actionType: "daeta_checkin" },
        });
        results.push({ matchId: m.id, action: "multiday_alert_10m_before" });
      } else if (diffMins >= AUTO_NOSHOW_MIN && !extendActive) {
        await createNotification({
          userId: m.employer_id, type: "daeta",
          title: "🚨 오늘 대타 출근이 확인 안 돼요",
          body: `${posting.business_name} 대타가 오늘(${todayStr}) 출근 시각(${timeStr})이 ${AUTO_NOSHOW_MIN}분 넘게 지나도록 출근 처리가 안 됐어요. 확인 후 필요하면 노쇼로 신고해주세요 — 이미 완료한 날짜들은 자동으로 정산돼요.`,
          url: "/mypage/daeta-history?tab=employer",
          data: { matchId: m.id },
        });
        results.push({ matchId: m.id, action: "multiday_noshow_alert" });
      }
    }
  }

  return NextResponse.json({ message: "Daeta check-in cron completed", results });
}
