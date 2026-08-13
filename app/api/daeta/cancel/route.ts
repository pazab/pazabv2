import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createNotification } from "@/lib/notify";
import { DaetaPostingRow, reescalateAfterDropout } from "@/lib/daetaEscalation";
import { calcDaetaCancelTrustPenalty } from "@/lib/utils";

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
      .select("id, employer_id, worker_id, daeta_posting_id, progress_status")
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

    // 매칭·계약 취소 처리
    await supabase.from("matches").update({ progress_status: "cancelled" }).eq("id", matchId);
    await supabase.from("contracts").update({ status: "cancelled" }).eq("match_id", matchId).neq("status", "cancelled");

    // 상대방에게 알림
    await createNotification({
      userId: counterpartId,
      type: "daeta",
      title: isMutual ? "🤝 합의된 취소로 대타가 종료됐어요" : "😢 확정된 대타가 취소됐어요",
      body: isMutual
        ? "서로 합의한 대로 이번 대타는 취소 처리됐어요."
        : (isEmployerCancelling ? "사장님 사정으로 대타가 취소됐어요." : "알바생 사정으로 대타가 취소됐어요."),
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

    return NextResponse.json({ success: true, trustPenalty, mutual: isMutual, hoursNotice: Math.round(hoursUntilShift * 10) / 10 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
