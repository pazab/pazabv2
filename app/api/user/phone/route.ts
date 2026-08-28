import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { applyPhoneViolationHistory } from "@/lib/phoneViolationHistory";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 본인이 휴대폰 번호를 저장할 때(ResumeEditForm) 호출 — 그 번호로 과거(다른 계정)의
// 노쇼/신뢰점수 위반 이력이 있으면 이 계정에도 승계 적용한다. 사장님이 팀원 번호를
// 대신 저장하는 케이스는 app/api/team/personal-info에서 서비스롤로 직접 처리함.
// phone 컬럼 저장 자체는 호출부가 이미 처리했고, 여기는 승계 판정만 함.
export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();
    if (!phone || typeof phone !== "string") return NextResponse.json({ applied: false });

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

    const result = await applyPhoneViolationHistory(supabaseAdmin, user.id, phone);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[user/phone] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
