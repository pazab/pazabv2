import { SupabaseClient } from "@supabase/supabase-js";

export type ManagerPermissions = {
  attendance_approve?: boolean;
  wage_edit?: boolean;
  payroll_confirm?: boolean;
  sos_request?: boolean;
};

export type EmployerContext = {
  employerId: string;
  employerProfileId: string | null;
  teamMemberId: string | null;
  isOwner: boolean;
  isManager: boolean;
  permissions: ManagerPermissions;
};

/**
 * 로그인한 사용자가 사장님 본인인지, 아니면 특정 사장님의 매니저인지 판별해서
 * 실제로 조회/조작해야 할 employer_id와 권한 목록을 반환한다.
 * - 사장님 본인(user_type = employer/both): 모든 권한 true 취급
 * - 매니저(team_members.member_role = 'manager', status = 'active'): permissions jsonb 그대로 반환
 * - 둘 다 아니면 null
 */
export async function getEmployerContext(
  supabase: SupabaseClient,
  userId: string
): Promise<EmployerContext | null> {
  const { data: u } = await supabase.from("users")
    .select("user_type").eq("id", userId).single();

  if (u?.user_type === "employer" || u?.user_type === "both") {
    return {
      employerId: userId,
      employerProfileId: null,
      teamMemberId: null,
      isOwner: true,
      isManager: false,
      permissions: {
        attendance_approve: true,
        wage_edit: true,
        payroll_confirm: true,
        sos_request: true,
      },
    };
  }

  const { data: managed } = await supabase.from("team_members")
    .select("id, employer_id, employer_profile_id, permissions")
    .eq("worker_id", userId)
    .eq("member_role", "manager")
    .eq("status", "active")
    .limit(1);

  if (managed && managed.length > 0) {
    const m = managed[0];
    return {
      employerId: m.employer_id,
      employerProfileId: m.employer_profile_id ?? null,
      teamMemberId: m.id,
      isOwner: false,
      isManager: true,
      permissions: (m.permissions as ManagerPermissions) || {},
    };
  }

  return null;
}

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
