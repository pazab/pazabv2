import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 회원 탈퇴 — 개인정보(연락처/주소/생년월일/실명/프로필사진/HEXACO 결과 등)를 익명화하고
// 재로그인을 차단한다. 근로기준법상 보존 의무가 있는 계약서/임금명세서/근태 기록은 상대방(사장님·알바생)의
// 정산·분쟁 대비 기록이기도 해 삭제하지 않고, 사용자 식별 정보만 제거한다.
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

    // 1. users 개인정보 익명화 (계약서 등 다른 테이블이 FK로 참조하는 id 자체는 보존)
    const { error: userErr } = await supabaseAdmin.from("users").update({
      nickname: "탈퇴한 사용자",
      nickname_lower: null,
      real_name: null,
      avatar_url: null,
      phone: null,
      address: null,
      address_detail: null,
      birth_date: null,
      region: null,
      employer_bot_knowledge: null,
      worker_result: null,
      employer_result: null,
      onboarded: false,
    }).eq("id", userId);
    if (userErr) throw userErr;

    // 2. 프로필 비활성화 (탐색/매칭 노출 차단)
    await supabaseAdmin.from("worker_profiles")
      .update({ is_active: false, is_public: false, image_url: null })
      .eq("user_id", userId);
    await supabaseAdmin.from("employer_profiles")
      .update({ is_deleted: true })
      .eq("user_id", userId);

    // 3. 푸시 구독 해지
    await supabaseAdmin.from("push_subscriptions").delete().eq("user_id", userId);

    // 4. 재로그인 차단 (auth 계정 자체는 남기되 로그인 불가 처리 — 계약서 등 참조 무결성 보존)
    await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("withdraw error:", error);
    return NextResponse.json({ error: error.message || "탈퇴 처리 중 오류가 발생했어요." }, { status: 500 });
  }
}
