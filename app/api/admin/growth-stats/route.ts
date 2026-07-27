import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ADMIN_EMAIL = "pazab@kakao.com";

// STRATEGY.md §2/§11.4 — "사장님 1명 가입 → 직원 N명 Tier1 편입" 성장 지표 계측
export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || session.user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [newTeamMembersRes, availableNowRes, sosRes, sosSuccessRes] = await Promise.all([
    supabaseAdmin
      .from("team_members")
      .select("id", { count: "exact", head: true })
      .not("worker_id", "is", null)
      .gte("created_at", weekAgo),
    supabaseAdmin
      .from("worker_profiles")
      .select("id", { count: "exact", head: true })
      .eq("available_now", true),
    supabaseAdmin
      .from("daeta_postings")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgo),
    supabaseAdmin
      .from("matches")
      .select("id", { count: "exact", head: true })
      .not("daeta_posting_id", "is", null)
      .in("progress_status", ["accepted", "hired"])
      .gte("created_at", weekAgo),
  ]);

  return NextResponse.json({
    weekStart: weekAgo,
    newTeamMembers: newTeamMembersRes.count || 0,
    availableNowWorkers: availableNowRes.count || 0,
    daetaSosCount: sosRes.count || 0,
    daetaSuccessCount: sosSuccessRes.count || 0,
  });
}
