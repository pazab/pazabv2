import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { hideFromMarketplace, finalizeWithdrawal } from "@/lib/withdrawal";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 회원 탈퇴 — 기본은 즉시 익명화하지 않고 7일 유예기간을 둔다(실수 탈퇴 방지 + 되돌릴 기회).
// 로그인은 계속 허용하고(재로그인 차단은 확정 시점에만), 대신 공개 노출만 바로 차단한다.
// immediate:true면 유예기간을 건너뛰고 finalizeWithdrawal을 바로 실행한다 — 되돌릴 수 없음을
// 프론트(app/mypage)에서 별도 확인 모달로 한 번 더 확인시킨 뒤에만 호출돼야 한다.
// 실제 개인정보 익명화·로그인 차단은 app/api/cron/finalize-withdrawal이 7일 뒤 처리한다.
export async function POST(req: NextRequest) {
  try {
    const { userId, immediate } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId 필요" }, { status: 400 });

    const cookieStore = await cookies();
    const supabaseSession = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await supabaseSession.auth.getUser();
    if (!user || user.id !== userId) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    if (immediate === true) {
      await finalizeWithdrawal(userId);
      return NextResponse.json({ success: true });
    }

    const { error: userErr } = await supabaseAdmin.from("users")
      .update({ withdrawal_requested_at: new Date().toISOString() })
      .eq("id", userId);
    if (userErr) throw userErr;

    await hideFromMarketplace(userId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("withdraw request error:", error);
    return NextResponse.json({ error: error.message || "탈퇴 처리 중 오류가 발생했어요." }, { status: 500 });
  }
}
