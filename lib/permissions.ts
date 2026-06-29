import { SupabaseClient } from "@supabase/supabase-js";

/**
 * 초대장 보낼 수 있는 권한 확인
 * - employer (user_type = employer/both)
 * - 해당 매장의 manager (team_members.member_role = 'manager')
 */
export async function canSendInvite(
  supabase: SupabaseClient,
  userId: string,
  employerProfileId?: string
): Promise<{ allowed: boolean; employerId?: string; reason?: string }> {
  // 1. 사장님 본인
  const { data: u } = await supabase.from("users")
    .select("user_type").eq("id", userId).single();

  if (u?.user_type === "employer" || u?.user_type === "both") {
    return { allowed: true, employerId: userId };
  }

  // 2. 매니저 — 특정 매장의 manager인지 확인
  let q = supabase.from("team_members")
    .select("employer_id")
    .eq("worker_id", userId)
    .eq("member_role", "manager")
    .eq("status", "active");

  if (employerProfileId) {
    // employer_profile_id로 employer_id 조회
    const { data: ep } = await supabase.from("employer_profiles")
      .select("user_id").eq("id", employerProfileId).single();
    if (ep?.user_id) q = q.eq("employer_id", ep.user_id);
  }

  const { data: managed } = await q.limit(1);
  if (managed && managed.length > 0) {
    return { allowed: true, employerId: managed[0].employer_id };
  }

  return { allowed: false, reason: "초대 권한이 없습니다" };
}
