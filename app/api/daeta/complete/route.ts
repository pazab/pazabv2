import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createNotification } from "@/lib/notify";
import { daetaDayCount, parseWorkHoursRange } from "@/lib/utils";
import { DaetaPostingRow } from "@/lib/daetaEscalation";
import { markNoShowAndReescalate } from "@/lib/daetaNoShow";
import { calcSettlementPay, calcDailyTaxForPeriod, getIs5OrMore, settlePriorDailyAttendance } from "@/lib/daetaSettlement";
import { checkAndAwardDaetaBadges } from "@/lib/trustScore";

function todayKstStr(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];
}

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// 대타 확정 매칭의 마무리 처리 — 근무 완료(정산) 또는 노쇼 신고.
// components/daeta/DaetaHistoryView.tsx의 기존 정산/노쇼 로직과 동일하되, 채팅방에서도 바로 쓸 수 있도록
// 서버 라우트로 옮기고 알림 발송을 추가함(기존엔 로컬 alert만 뜨고 알바생에겐 아무 알림도 안 갔음).
export async function POST(req: NextRequest) {
  try {
    const { matchId, action, rating, hours: hoursOverride, adjustReason } = await req.json();
    if (!matchId || !["complete", "noshow"].includes(action)) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      return NextResponse.json({ error: "평점은 1~5 사이 정수여야 해요." }, { status: 400 });
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
    const { data: match } = await supabase
      .from("matches")
      .select("id, employer_id, worker_id, daeta_posting_id, employer_profile_id, progress_status, checked_in_at, checked_out_at")
      .eq("id", matchId)
      .maybeSingle();

    if (!match || !match.daeta_posting_id) {
      return NextResponse.json({ error: "대타 매칭을 찾을 수 없어요." }, { status: 404 });
    }
    if (user.id !== match.employer_id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    if (["cancelled", "failed", "hired"].includes(match.progress_status)) {
      return NextResponse.json({ error: "이미 종료된 매칭이에요." }, { status: 409 });
    }

    const { data: posting } = await supabase
      .from("daeta_postings")
      .select("id, user_id, business_name, region, lat, lng, work_date, work_date_end, work_hours, wage, base_wage, max_urgent_pct, duty, status, escalation_stage, stage_updated_at, allow_new, created_at, expires_at")
      .eq("id", match.daeta_posting_id)
      .maybeSingle();

    if (action === "complete") {
      // 근무 시작 전인데 정산부터 눌러버리는 걸 막음 — 출근 기록이 있으면(일찍 출근 등) 예외.
      // 클라이언트(DaetaHistoryView)에서도 막지만, API를 직접 호출하면 우회되므로 서버에서도 확인.
      if (!match.checked_in_at && posting?.work_date) {
        const startPart = posting.work_hours?.split("~")[0]?.trim();
        if (startPart) {
          const shiftStart = new Date(`${posting.work_date}T${startPart}:00+09:00`);
          if (!Number.isNaN(shiftStart.getTime()) && Date.now() < shiftStart.getTime()) {
            return NextResponse.json({ error: "아직 근무 시작 전이에요. 시작 시각 이후에 정산해 주세요." }, { status: 409 });
          }
        }
      }

      const wage = posting?.wage || 10030;
      // 예정 시간(공고에 적힌 시간대) — 분 단위까지 정확히 파싱. 실제 출퇴근 기록이 없을 때의
      // 폴백이자, 초과근무 여부를 판정하는 기준선.
      const scheduledHoursPerDay = parseWorkHoursRange(posting?.work_hours) ?? 6;
      // 시작일~종료일 기간 전체를 한 공고로 등록한 경우(work_date_end) 일수만큼 곱해서 정산
      const days = posting ? daetaDayCount(posting.work_date, posting.work_date_end) : 1;

      // 실제 출퇴근 기록이 있으면(하루짜리 공고 한정) 그 시간을 자동 기준선으로, 없으면 예정 시간×일수로 폴백.
      let autoHours: number;
      const fromActualTimes = days === 1 && !!match.checked_in_at && !!match.checked_out_at;
      if (fromActualTimes) {
        const actualMs = new Date(match.checked_out_at).getTime() - new Date(match.checked_in_at).getTime();
        autoHours = Math.max(0, Math.round((actualMs / 3600000) * 10) / 10);
      } else {
        autoHours = scheduledHoursPerDay * days;
      }
      // 퇴근 체크아웃 없이(예정 시간 기준으로만) 정산된 건은 나중에 분쟁이 생겼을 때 구분할 수 있도록
      // payslip.attendance_data에 항상 표시해 둠 — 실제 근무시간과 다를 수 있다는 신호.
      const checkoutMissing = days === 1 && !fromActualTimes;

      // 사장님이 확인 화면에서 이 값을 직접 수정해서 보낼 수도 있음(hoursOverride) — 계약/실제 기록과
      // 다르게 합의해서 정산하는 경우(예: 계약 4시간이지만 3시간만 하고 정산 합의). 메모 유무와 무관하게
      // "조정됐다는 사실 자체"는 항상 payslip.attendance_data에 남겨서 나중에 분쟁이 생겨도 근거가 있게 함.
      const hasOverride = typeof hoursOverride === "number" && hoursOverride > 0;
      const totalHours = hasOverride ? Math.round(hoursOverride * 10) / 10 : autoHours;
      const wasAdjusted = hasOverride && Math.abs(totalHours - autoHours) > 0.05;

      const is5OrMore = await getIs5OrMore(supabase, match.employer_profile_id);
      const { scheduledTotal, overtimeHours, basePay, overtimePay, totalPay } =
        calcSettlementPay(wage, scheduledHoursPerDay, days, totalHours, is5OrMore);
      // 일용근로소득세 원천징수 — 예전엔 이 계산이 아예 없어서 대타 정산이 항상 세전 금액 그대로
      // 지급 처리됐음(정규 팀원 일급 정산엔 이미 적용 중인 계산을 대타에도 동일하게 적용)
      const { incomeTax, localTax, totalDeductions, netPay } = calcDailyTaxForPeriod(totalPay, days);
      const now = new Date();

      // 동시 처리 가드 — "정산하기"를 빠르게 두 번 누르면(더블클릭, 다른 탭) 이 체크 없이는
      // payslip이 중복 발행될 수 있었음. accepted일 때만 hired로 원자적으로 전환하고, 이미
      // 누군가 먼저 처리했으면(0건 갱신) 여기서 멈춘다.
      const { data: claimResult, error: claimErr } = await supabase
        .from("matches")
        .update({ progress_status: "hired", ...(rating != null ? { employer_rating: rating } : {}) })
        .eq("id", matchId)
        .eq("progress_status", "accepted")
        .select("id");
      if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 });
      if (!claimResult || claimResult.length === 0) {
        return NextResponse.json({ error: "이미 처리된 매칭이에요." }, { status: 409 });
      }

      const { error: psErr } = await supabase.from("payslips").insert({
        employer_id: match.employer_id,
        worker_id: match.worker_id,
        match_id: match.id,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        wage,
        total_hours: totalHours,
        overtime_hours: overtimeHours,
        base_pay: basePay,
        overtime_pay: overtimePay,
        total_pay: totalPay,
        income_tax: incomeTax,
        local_tax: localTax,
        total_deductions: totalDeductions,
        deductions: totalDeductions,
        net_pay: netPay,
        status: "issued",
        issued_at: now.toISOString(),
        memo: days > 1 ? `긴급 대타 급여 정산 (${days}일치)` : "긴급 대타 급여 당일 정산",
        // 조정 사유는 사장님이 입력했을 때만 채움 — 아래 attendance_data는 사유 입력 여부와 무관하게
        // "자동 계산값과 다르게 정산됐다"는 사실 자체를 항상 남김(분쟁 시 근거용)
        correction_reason: wasAdjusted && adjustReason ? String(adjustReason).slice(0, 500) : null,
        attendance_data: {
          scheduled_hours: scheduledTotal,
          auto_calculated_hours: autoHours,
          settled_hours: totalHours,
          adjusted: wasAdjusted,
          adjusted_by: wasAdjusted ? match.employer_id : null,
          checkout_missing: checkoutMissing,
        },
      });
      if (psErr) {
        // 정산 확정(hired)은 이미 됐는데 명세서 발행이 실패하면 재시도할 방법이 없어지므로 되돌림
        await supabase.from("matches").update({ progress_status: "accepted" }).eq("id", matchId);
        return NextResponse.json({ error: psErr.message }, { status: 500 });
      }
      await supabase.from("daeta_postings").update({ status: "completed" }).eq("id", match.daeta_posting_id);

      // 평가가 아주 좋거나(4~5점) 아주 나쁘면(1~2점)만 신뢰점수에 반영 — 매 건마다 흔들리지 않도록
      if (rating != null && (rating >= 4 || rating <= 2)) {
        const delta = rating >= 4 ? 3 : -15;
        const { data: worker } = await supabase.from("users").select("trust_score").eq("id", match.worker_id).maybeSingle();
        const before = worker?.trust_score ?? 50;
        const after = Math.min(100, Math.max(0, before + delta));
        await supabase.from("users").update({ trust_score: after }).eq("id", match.worker_id);
        await supabase.from("trust_score_logs").insert({
          user_id: match.worker_id, delta, reason: `대타 완료 후 사장님 평가 ${rating}/5점`, before_score: before, after_score: after, ref_id: matchId,
        });
      }

      // 뱃지는 "표시" 실패가 정산 완료 자체를 막으면 안 되므로 별도로 감싸서 무시
      try {
        await checkAndAwardDaetaBadges(supabase, match.worker_id);
      } catch (badgeErr) {
        console.error("대타 뱃지 체크 실패:", badgeErr);
      }

      // 조정된 정산은 채팅 기록에도 시간 변경 사실을 남김 — 메모를 안 써도 이 메시지 자체가 증거가 됨
      const adjustNote = wasAdjusted
        ? `\n⏱️ 예정/실제 근무시간(${autoHours}시간)과 다르게 ${totalHours}시간으로 합의 정산됐어요.${adjustReason ? ` 사유: ${String(adjustReason).slice(0, 200)}` : ""}`
        : "";
      // "실수령액"은 세금 뗀 순지급액(net_pay)을 뜻함 — 예전엔 세전 총액(total_pay)을 실수령액이라고
      // 잘못 안내하고 있었음(세금 계산 자체가 없었으니까)
      const taxNote = totalDeductions > 0 ? ` (세금 ${totalDeductions.toLocaleString()}원 공제)` : "";
      await supabase.from("chats").insert({
        match_id: matchId,
        sender_id: match.employer_id,
        receiver_id: match.worker_id,
        message: (overtimePay > 0
          ? `💸 정산이 완료됐어요! 실수령액: ${netPay.toLocaleString()}원${taxNote} (초과근무 ${overtimeHours}시간 포함) — 수고하셨습니다.`
          : `💸 정산이 완료됐어요! 실수령액: ${netPay.toLocaleString()}원${taxNote} — 수고하셨습니다.`) + adjustNote,
        message_type: "system",
        is_read: false,
      });

      await createNotification({
        userId: match.worker_id,
        type: "payslip",
        title: "💸 대타 급여 정산 완료",
        body: (overtimePay > 0
          ? `대타 근무 정산이 완료됐어요. 실수령액: ${netPay.toLocaleString()}원${taxNote} (초과근무 ${overtimeHours}시간 포함)`
          : `대타 근무 정산이 완료됐어요. 실수령액: ${netPay.toLocaleString()}원${taxNote}`) + (wasAdjusted ? ` — ${autoHours}시간 대신 ${totalHours}시간으로 조정 정산` : ""),
        url: "/myteam",
        data: { matchId },
      });

      return NextResponse.json({ success: true, totalPay, netPay, totalDeductions, totalHours, overtimeHours, basePay, overtimePay, wage });
    } else {
      if (!posting) return NextResponse.json({ error: "대타 공고를 찾을 수 없어요." }, { status: 404 });
      const days = daetaDayCount(posting.work_date, posting.work_date_end);

      // 이미 출근한 알바생은 "노쇼"(당일 무단 불참)가 아님 — 실제로 왔고 얼마간 일했는데도 노쇼로
      // 신고하면 그 시간에 대한 급여가 통째로 사라지고 과한 페널티(-30점+정지)까지 붙어버림.
      // 조기퇴근/중도이탈 같은 문제는 "근무 완료·정산하기"로 실제 시간만큼 정산하고 낮은 평점(1~2점)으로
      // 트러스트 점수에 반영하는 쪽으로 유도한다.
      // 하루짜리는 matches.checked_in_at 하나로, 다일치는 "오늘" 출근했는지를 일별 출석표로 판정한다
      // (matches.checked_in_at은 1일차 값 하나뿐이라 다일치엔 그걸로 오늘 여부를 알 수 없음).
      if (days === 1) {
        if (match.checked_in_at) {
          return NextResponse.json({
            error: "이미 출근 처리된 알바생은 노쇼로 신고할 수 없어요. '근무 완료·정산하기'로 실제 근무시간만큼 정산해 주세요.",
          }, { status: 409 });
        }
      } else {
        const { data: todayRow } = await supabase.from("daeta_daily_attendance")
          .select("checked_in_at").eq("match_id", matchId).eq("work_date", todayKstStr()).maybeSingle();
        if (todayRow?.checked_in_at) {
          return NextResponse.json({
            error: "오늘은 이미 출근 처리됐어요. 노쇼로 신고할 수 없어요.",
          }, { status: 409 });
        }
        // 오늘 출근은 안 했지만 이전 날짜들에 정상 근무했다면, 노쇼로 계약 전체를 종료하기 전에
        // 그 완료된 날짜들부터 먼저 정산해서 급여가 사라지지 않게 함.
        await settlePriorDailyAttendance(supabase, match, posting, todayKstStr());
      }
      await markNoShowAndReescalate(supabase, match, posting as DaetaPostingRow, "manual");
      return NextResponse.json({ success: true });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
