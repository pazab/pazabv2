import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createNotification } from "@/lib/notify";
import { DaetaPostingRow, reescalateAfterDropout } from "@/lib/daetaEscalation";
import { calcDaetaCancelTrustPenalty, parseWorkHoursRange } from "@/lib/utils";
import { calcSettlementPay, calcDailyTaxForPeriod, getIs5OrMore } from "@/lib/daetaSettlement";

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// 확정된 대타를 사전에 알리고 취소하는 건 "무단 노쇼"보다는 가벼운 문제라고 판단해서(2026-08-14
// 재설계) 지원/등록 자체를 막는 하드 정지는 걸지 않음 — 통보 시점(근무 시작까지 남은 시간)에 따라
// 신뢰점수만 차등 감점한다. 반복되면 Tier1(✅검증) 문턱 아래로 자연 강등되는 정도로만 작동.
// 노쇼(당일 무단 불참)는 lib/daetaNoShow.ts가 담당하며 거기엔 정지가 실제로 걸림.
//
// 일방 취소 vs 합의 취소(2026-08-14 추가) — 채팅으로 미리 얘기가 끝난 취소까지 일방 취소와
// 똑같이 감점하는 건 억울함. 자진신고(체크박스) 방식으로 받되, 채팅 기록이 남아있으니 나중에
// 분쟁 시 대조 가능 — 별도 사유로 로그만 남기고 정말로 페널티 없이 처리(허위 신고 방지용
// 승인 핸드셰이크는 지금 단계에선 마찰 대비 효과가 크지 않다고 판단해 생략).
const CANCEL_REASON = "대타 확정 취소";
const MUTUAL_CANCEL_REASON = "대타 합의 취소";

export async function POST(req: NextRequest) {
  try {
    const { matchId, mutual } = await req.json();
    if (!matchId) return NextResponse.json({ error: "matchId 필요" }, { status: 400 });

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
    if (user.id !== match.employer_id && user.id !== match.worker_id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    if (["cancelled", "rejected", "failed"].includes(match.progress_status)) {
      return NextResponse.json({ error: "이미 종료된 매칭이에요." }, { status: 409 });
    }

    const isEmployerCancelling = user.id === match.employer_id;
    const counterpartId = isEmployerCancelling ? match.worker_id : match.employer_id;

    const { data: posting } = await supabase
      .from("daeta_postings")
      .select("id, user_id, business_name, region, lat, lng, work_date, work_date_end, work_hours, wage, base_wage, max_urgent_pct, duty, status, escalation_stage, stage_updated_at, allow_new, created_at, expires_at")
      .eq("id", match.daeta_posting_id)
      .maybeSingle();

    // 근무 시작까지 남은 시간 — 못 구하면(비정상 데이터) 임박 취소로 간주해 보수적으로 무겁게 매김
    let hoursUntilShift = 0;
    const startMatch = posting?.work_hours?.match(/\b(\d{1,2}):(\d{2})\b/);
    if (posting?.work_date && startMatch) {
      const shiftStart = new Date(`${posting.work_date}T${startMatch[1].padStart(2, "0")}:${startMatch[2]}:00+09:00`);
      hoursUntilShift = (shiftStart.getTime() - Date.now()) / 3600000;
    }
    const isMutual = mutual === true;
    const trustPenalty = isMutual ? 0 : calcDaetaCancelTrustPenalty(hoursUntilShift);

    // 이미 출근한 뒤 취소되면 그 시간만큼은 반드시 정산 — 예전엔 checked_in_at 여부와 무관하게
    // 그냥 cancelled 처리만 해서, 실제로 일한 시간에 대한 급여가 통째로 사라졌었음.
    let partialSettlement: { totalHours: number; totalPay: number } | null = null;
    if (match.checked_in_at && posting?.wage) {
      const scheduledHoursPerDay = parseWorkHoursRange(posting.work_hours) ?? 6;
      const endTime = match.checked_out_at ? new Date(match.checked_out_at) : new Date();
      const actualMs = endTime.getTime() - new Date(match.checked_in_at).getTime();
      const totalHours = Math.max(0, Math.round((actualMs / 3600000) * 10) / 10);
      if (totalHours > 0) {
        const is5OrMore = await getIs5OrMore(supabase, match.employer_profile_id);
        const { overtimeHours, basePay, overtimePay, totalPay } =
          calcSettlementPay(posting.wage, scheduledHoursPerDay, 1, totalHours, is5OrMore);
        const { incomeTax, localTax, totalDeductions, netPay } = calcDailyTaxForPeriod(totalPay, 1);
        const now = new Date();
        const { error: psErr } = await supabase.from("payslips").insert({
          employer_id: match.employer_id,
          worker_id: match.worker_id,
          match_id: match.id,
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          wage: posting.wage,
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
          memo: "출근 후 중도 취소 — 실근무시간 자동 정산",
          attendance_data: { auto_calculated_hours: totalHours, settled_hours: totalHours, adjusted: false, mid_cancel: true },
        });
        if (!psErr) partialSettlement = { totalHours, totalPay: netPay };
      }
    }

    // 페널티 적용: 신뢰점수만 차등 감점 (하드 정지 없음). 합의 취소는 페널티 없이 로그만 남김
    const { data: u } = await supabase.from("users").select("trust_score").eq("id", user.id).maybeSingle();
    const before = u?.trust_score ?? 50;
    const after = Math.max(0, before - trustPenalty);
    if (trustPenalty > 0) {
      await supabase.from("users").update({ trust_score: after }).eq("id", user.id);
    }
    await supabase.from("trust_score_logs").insert({
      user_id: user.id, delta: -trustPenalty, reason: isMutual ? MUTUAL_CANCEL_REASON : CANCEL_REASON, before_score: before, after_score: after, ref_id: matchId,
    });

    // 매칭·계약 취소 처리 — 누가·왜 취소했는지 message에 남겨야 이력 화면(DaetaHistoryView)에서
    // "사전 취소됨"이라고만 뜨지 않고 구체적인 사유를 보여줄 수 있음 (예전엔 이 컬럼이 항상 비어있었음)
    const cancelMessage = isMutual
      ? "상호 합의로 취소됨"
      : isEmployerCancelling
      ? "사장님이 사전 취소함"
      : "알바생이 사전 취소함";
    await supabase.from("matches").update({ progress_status: "cancelled", message: cancelMessage }).eq("id", matchId);
    await supabase.from("contracts").update({ status: "cancelled" }).eq("match_id", matchId).neq("status", "cancelled");

    // 채팅방에 취소 사실을 남김 — 체크인/체크아웃/정산완료는 전부 시스템 메시지를 남기는데
    // 취소만 빠져있어서, 나중에 채팅방을 다시 열어봐도 왜 매칭이 끝났는지 흔적이 전혀 없었음
    const settlementNote = partialSettlement
      ? `\n💸 이미 출근한 ${partialSettlement.totalHours}시간은 자동 정산돼서 ${partialSettlement.totalPay.toLocaleString()}원이 지급 처리됐어요.`
      : "";
    await supabase.from("chats").insert({
      match_id: matchId,
      sender_id: user.id,
      receiver_id: counterpartId,
      message: `🚫 ${cancelMessage} (${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })})` + settlementNote,
      message_type: "system",
      is_read: false,
    });

    // 상대방에게 알림
    await createNotification({
      userId: counterpartId,
      type: "daeta",
      title: isMutual ? "🤝 합의된 취소로 대타가 종료됐어요" : "😢 확정된 대타가 취소됐어요",
      body: (isMutual
        ? "서로 합의한 대로 이번 대타는 취소 처리됐어요."
        : (isEmployerCancelling ? "사장님 사정으로 대타가 취소됐어요." : "알바생 사정으로 대타가 취소됐어요."))
        + (partialSettlement ? ` (근무한 ${partialSettlement.totalHours}시간 자동 정산됨)` : ""),
      url: `/chat/${matchId}`,
      data: { matchId },
    });

    // 대타 공고 자체 처리 — 예전엔 여기서 daeta_postings를 아예 건드리지 않아서 노쇼보다도 못한
    // 대우였음(사전에 알려준 취소인데 재구인 시도조차 안 됨). 알바생이 취소했으면 노쇼와 동일하게
    // 즉시 재오픈+재확산(신뢰점수 페널티는 위에서 이미 별도 처리했으니 중복 감점 없음).
    // 사장님이 취소했으면 더 이상 구할 필요가 없다는 뜻이라 공고 자체를 종료.
    if (posting) {
      if (isEmployerCancelling) {
        await supabase.from("daeta_postings").update({ status: "cancelled" }).eq("id", posting.id);
      } else {
        await reescalateAfterDropout(
          supabase,
          posting as DaetaPostingRow,
          match.worker_id,
          "🔄 대타 취소 확인, 바로 대체 인력을 찾고 있어요",
          `${posting.business_name} 대타를 다시 넓혀서 요청했어요.`
        );
      }
    }

    return NextResponse.json({ success: true, trustPenalty, mutual: isMutual, hoursNotice: Math.round(hoursUntilShift * 10) / 10, partialSettlement });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
