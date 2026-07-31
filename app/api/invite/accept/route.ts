import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// invite_codes의 RLS(invite_codes_update_employer)가 employer_id 본인만 UPDATE를 허용해서,
// 정작 초대를 "수락"하는 알바생 쪽에서 used_at을 못 찍고 조용히 실패하던 문제.
// 이 호출만 서비스 롤로 대신 처리한다 (team_members 연결 등 나머지는 기존 클라이언트 로직 유지).
export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();
    if (!code) return NextResponse.json({ error: "code가 필요합니다." }, { status: 400 });

    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getServiceClient();
    const { data: invite } = await supabase
      .from("invite_codes")
      .select("code, used_at, expires_at")
      .eq("code", code)
      .maybeSingle();

    if (!invite) return NextResponse.json({ error: "유효하지 않은 초대 링크예요." }, { status: 404 });
    if (invite.used_at) return NextResponse.json({ message: "이미 사용된 초대 링크예요.", alreadyUsed: true });
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: "만료된 초대 링크예요." }, { status: 400 });
    }

    const { error } = await supabase
      .from("invite_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("code", code)
      .is("used_at", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
