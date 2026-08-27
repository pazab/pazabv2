/**
 * GET /api/cron/finalize-withdrawal — 유예기간(7일) 지난 탈퇴 신청 확정 처리 (매일 1회, cron-job.org)
 *
 * app/api/withdraw(신청)는 즉시 익명화하지 않고 users.withdrawal_requested_at만 찍어둔다.
 * 이 크론이 그 값이 7일 이상 지난 계정을 찾아 lib/withdrawal.ts의 finalizeWithdrawal
 * (실제 PII 익명화 + 재로그인 차단)을 실행한다.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { finalizeWithdrawal } from "@/lib/withdrawal";

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

const GRACE_PERIOD_DAYS = 7;

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    const auth = req.headers.get("authorization") || "";
    const cronSecret = process.env.CRON_SECRET || "";
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const sb = getServiceClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - GRACE_PERIOD_DAYS);

  const { data: dueUsers, error } = await sb
    .from("users")
    .select("id")
    .not("withdrawal_requested_at", "is", null)
    .lt("withdrawal_requested_at", cutoff.toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!dueUsers || dueUsers.length === 0) {
    return NextResponse.json({ message: "no withdrawals due", finalized: 0 });
  }

  const results: { userId: string; ok: boolean; error?: string }[] = [];
  for (const u of dueUsers) {
    try {
      await finalizeWithdrawal(u.id);
      results.push({ userId: u.id, ok: true });
    } catch (e: any) {
      console.error("[finalize-withdrawal] failed for", u.id, e);
      results.push({ userId: u.id, ok: false, error: e.message });
    }
  }

  return NextResponse.json({
    message: "finalize complete",
    finalized: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok),
  });
}
