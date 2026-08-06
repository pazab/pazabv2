import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createNotification } from "@/lib/notify";
import { daetaDayCount } from "@/lib/utils";

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
    const { matchId, action, rating } = await req.json();
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
      .select("id, employer_id, worker_id, daeta_posting_id, progress_status")
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
      .select("work_hours, wage, work_date, work_date_end")
      .eq("id", match.daeta_posting_id)
      .maybeSingle();

    if (action === "complete") {
      const hoursStr = posting?.work_hours || "12:00 ~ 18:00";
      const wage = posting?.wage || 10030;
      let hours = 6;
      try {
        const times = hoursStr.split("~");
        const sh = parseInt(times[0].split(":")[0]);
        const eh = parseInt(times[1].split(":")[0]);
        hours = eh > sh ? eh - sh : 24 - sh + eh;
      } catch {}
      // 시작일~종료일 기간 전체를 한 공고로 등록한 경우(work_date_end) 일수만큼 곱해서 정산
      const days = posting ? daetaDayCount(posting.work_date, posting.work_date_end) : 1;
      const totalHours = hours * days;
      const totalPay = wage * totalHours;
      const now = new Date();

      const { error: psErr } = await supabase.from("payslips").insert({
        employer_id: match.employer_id,
        worker_id: match.worker_id,
        match_id: match.id,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        wage,
        total_hours: totalHours,
        base_pay: totalPay,
        total_pay: totalPay,
        status: "issued",
        issued_at: now.toISOString(),
        memo: days > 1 ? `긴급 대타 급여 정산 (${days}일치)` : "긴급 대타 급여 당일 정산",
      });
      if (psErr) return NextResponse.json({ error: psErr.message }, { status: 500 });

      const { error: matchErr } = await supabase.from("matches").update({
        progress_status: "hired",
        ...(rating != null ? { employer_rating: rating } : {}),
      }).eq("id", matchId);
      if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 });
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

      await createNotification({
        userId: match.worker_id,
        type: "payslip",
        title: "💸 대타 급여 정산 완료",
        body: `대타 근무 정산이 완료됐어요. 실수령액: ${totalPay.toLocaleString()}원`,
        url: "/myteam",
        data: { matchId },
      });

      return NextResponse.json({ success: true, totalPay, hours, wage });
    } else {
      const { error: matchErr } = await supabase.from("matches").update({
        progress_status: "failed", message: "알바생 노쇼로 인한 구인 취소",
      }).eq("id", matchId);
      if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 });
      await supabase.from("daeta_postings").update({ status: "cancelled" }).eq("id", match.daeta_posting_id);

      const { data: worker } = await supabase.from("users").select("trust_score").eq("id", match.worker_id).maybeSingle();
      const before = worker?.trust_score ?? 50;
      const after = Math.max(0, before - 30);
      await supabase.from("users").update({ trust_score: after }).eq("id", match.worker_id);
      await supabase.from("trust_score_logs").insert({
        user_id: match.worker_id, delta: -30, reason: "대타 매칭 후 무단 노쇼 발생", before_score: before, after_score: after, ref_id: matchId,
      });

      await createNotification({
        userId: match.worker_id,
        type: "daeta",
        title: "🚨 대타 노쇼 신고 접수",
        body: "확정된 대타에 무단 노쇼로 신고되어 신뢰점수가 감점됐어요.",
        url: "/myteam",
        data: { matchId },
      });

      return NextResponse.json({ success: true });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
