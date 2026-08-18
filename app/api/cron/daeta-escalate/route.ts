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
  expireStalePostings,
} from "@/lib/daetaEscalation";

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
  const expired = await expireStalePostings(sb, now);

  return NextResponse.json({ advanced: results.length, results, expired: expired.length, expiredIds: expired });
}
