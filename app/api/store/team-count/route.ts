import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// team_members RLS는 본인(사장님/알바생) 전용이라, 매장홈에서 방문자에게
// "현재 근무 인원"을 보여주려면 서비스 롤로 개수만 집계해 반환한다 (개별 팀원 정보는 반환하지 않음)
export async function GET(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get("storeId");
    if (!storeId) return NextResponse.json({ error: "storeId 필요" }, { status: 400 });

    const { count, error } = await supabaseAdmin
      .from("team_members")
      .select("id", { count: "exact", head: true })
      .eq("employer_profile_id", storeId)
      .eq("status", "active");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, count: count || 0 });
  } catch (error: any) {
    console.error("team-count GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
