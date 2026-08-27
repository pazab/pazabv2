import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { restoreMarketplaceVisibility } from "@/lib/withdrawal";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 탈퇴 유예기간(7일) 중 취소 — withdrawal_requested_at을 지우고 마켓플레이스 노출을 되돌린다.
// 유예기간이 지나 이미 확정(finalize-withdrawal)된 계정은 로그인 자체가 막혀있어 여기까지
// 올 수 없다.
export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();
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

    const { data: existing } = await supabaseAdmin.from("users")
      .select("withdrawal_requested_at").eq("id", userId).maybeSingle();
    if (!existing?.withdrawal_requested_at) {
      return NextResponse.json({ error: "진행 중인 탈퇴 신청이 없어요." }, { status: 400 });
    }

    const { error: userErr } = await supabaseAdmin.from("users")
      .update({ withdrawal_requested_at: null })
      .eq("id", userId);
    if (userErr) throw userErr;

    await restoreMarketplaceVisibility(userId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("withdraw cancel error:", error);
    return NextResponse.json({ error: error.message || "취소 처리 중 오류가 발생했어요." }, { status: 500 });
  }
}
