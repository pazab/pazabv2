import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// team_members RLS는 본인(사장님/알바생) 전용이라, 다른 사장님이 지원자의 근무이력을
// 조회하려면 서비스 롤로 우회하되 임금 등 민감 필드는 빼고 반환한다
export async function GET(req: NextRequest) {
  try {
    const workerId = req.nextUrl.searchParams.get("workerId");
    if (!workerId) return NextResponse.json({ error: "workerId 필요" }, { status: 400 });

    const { data: rows, error } = await supabaseAdmin
      .from("team_members")
      .select("id, employer_id, employer_profile_id, role_desc, hire_date, status, created_at, updated_at")
      .eq("worker_id", workerId)
      .order("hire_date", { ascending: false, nullsFirst: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!rows || rows.length === 0) return NextResponse.json({ success: true, history: [] });

    const profileIds = [...new Set(rows.map(r => r.employer_profile_id).filter(Boolean))] as string[];
    const employerIds = [...new Set(rows.map(r => r.employer_id).filter(Boolean))] as string[];

    const [{ data: profiles }, { data: employerUsers }] = await Promise.all([
      profileIds.length > 0
        ? supabaseAdmin.from("employer_profiles").select("id, business_name, business_type, region").in("id", profileIds)
        : Promise.resolve({ data: [] as any[] }),
      employerIds.length > 0
        ? supabaseAdmin.from("users").select("id, nickname").in("id", employerIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const profileMap = new Map((profiles || []).map(p => [p.id, p]));
    const userMap = new Map((employerUsers || []).map(u => [u.id, u]));

    const history = rows.map(r => {
      const profile = r.employer_profile_id ? profileMap.get(r.employer_profile_id) : null;
      const employerUser = userMap.get(r.employer_id);
      return {
        id: r.id,
        storeName: profile?.business_name || (employerUser?.nickname ? `${employerUser.nickname}님 매장` : "매장 정보 없음"),
        businessType: profile?.business_type || null,
        region: profile?.region || null,
        roleDesc: r.role_desc || null,
        hireDate: r.hire_date || null,
        endDate: r.status === "left" ? r.updated_at : null,
        status: r.status,
      };
    });

    return NextResponse.json({ success: true, history });
  } catch (error: any) {
    console.error("career-history GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
