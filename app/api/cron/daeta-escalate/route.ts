/**
 * GET /api/cron/daeta-escalate — 대타 SOS 에스컬레이션 단계 자동 전진 (5분 주기, cron-job.org)
 * pending 공고의 대기시간 경과 시: ①팀내 → ②동네Tier1 → ③신규포함(opt-in) → ④공개 SOS
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  DaetaPostingRow,
  getSosConfig,
  advancePostingStage,
} from "@/lib/daetaEscalation";
import { createNotification } from "@/lib/notify";
import { formatDaetaDateRange } from "@/lib/utils";

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    const auth = req.headers.get("authorization") || "";
    const cronSecret = process.env.CRON_SECRET || "";
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const sb = getServiceClient();
  const now = new Date();

  const { data: postings, error } = await sb
    .from("daeta_postings")
    .select("*")
    .eq("status", "pending")
    .lt("escalation_stage", 4)
    .gt("expires_at", now.toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!postings || postings.length === 0) {
    return NextResponse.json({ message: "no pending postings", advanced: 0 });
  }

  const cfg = await getSosConfig(sb);
  const results: { id: string; from: number; to: number }[] = [];

  for (const posting of postings as DaetaPostingRow[]) {
    const from = posting.escalation_stage || 1;
    const to = await advancePostingStage(sb, posting, cfg, now);
    if (to !== null) results.push({ id: posting.id, from, to });
  }

  // 근무 시작 시각(expires_at)이 지나도록 아무도 못 구한 pending 공고 — 예전엔 사용자가 대타 화면을 직접 열 때만
  // 조용히 expired 처리돼서 아무도 안 열면 계속 방치되고, 사장님에게 실패 알림도 전혀 안 갔음. 크론에서 직접 처리.
  const expired = await expirePendingPostings(sb, now);

  return NextResponse.json({ advanced: results.length, results, expired: expired.length, expiredIds: expired });
}

async function expirePendingPostings(sb: ReturnType<typeof getServiceClient>, now: Date): Promise<string[]> {
  const { data: expiredPostings } = await sb
    .from("daeta_postings")
    .select("id, user_id, business_name, work_date, work_date_end, work_hours, wage")
    .eq("status", "pending")
    .lte("expires_at", now.toISOString());

  if (!expiredPostings || expiredPostings.length === 0) return [];

  const ids = expiredPostings.map((p: { id: string }) => p.id);
  await sb.from("daeta_postings").update({ status: "expired" }).in("id", ids);

  await Promise.all(expiredPostings.map((p: {
    id: string; user_id: string; business_name: string; work_date: string; work_date_end: string | null; work_hours: string; wage: number;
  }) =>
    createNotification({
      userId: p.user_id,
      type: "daeta",
      title: "😢 이번 대타는 결국 못 구했어요",
      body: `${p.business_name} ${formatDaetaDateRange(p.work_date, p.work_date_end)} ${p.work_hours} · 시급 ${p.wage.toLocaleString()}원 요청이 만료됐어요. 다시 등록하거나 아는 알바생에게 카톡으로 직접 요청해보세요.`,
      url: "/daeta",
      data: { daetaPostingId: p.id },
    })
  ));

  return ids;
}
