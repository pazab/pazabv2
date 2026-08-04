import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// 근로계약서 저장 시 근로자 개인정보(성명/생년월일/연락처/주소)를 users 테이블로 역sync.
// users 테이블 RLS가 본인 행만 쓰기 허용하므로, 사장님 브라우저 세션에서 직접
// 알바생(worker) 행을 업데이트하면 PostgREST가 에러 없이 조용히 0건 처리해버림 —
// 이 라우트에서 서비스 롤로 대신 처리하고, 실제 팀원 관계인지만 검증한다.
export async function POST(req: NextRequest) {
  try {
    const { teamMemberId, workerId, real_name, birth_date, phone, address, address_detail } = await req.json();
    if (!teamMemberId || !workerId) {
      return NextResponse.json({ error: "필수 정보 없음" }, { status: 400 });
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
    const { data: tm } = await supabase.from("team_members")
      .select("employer_id, worker_id")
      .eq("id", teamMemberId)
      .maybeSingle();

    if (!tm || tm.employer_id !== user.id || tm.worker_id !== workerId) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const update: Record<string, string> = {};
    if (real_name) update.real_name = real_name;
    if (birth_date) update.birth_date = birth_date;
    if (phone) update.phone = phone;
    if (address) update.address = address;
    if (address_detail) update.address_detail = address_detail;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: true });
    }

    const { error } = await supabase.from("users").update(update).eq("id", workerId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
