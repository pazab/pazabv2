import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createNotification } from "@/lib/notify";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "인증되지 않은 사용자입니다." }, { status: 401 });
    }

    const { employerProfileId } = await req.json();
    if (!employerProfileId) {
      return NextResponse.json({ success: false, error: "employerProfileId 필요" }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from("store_follows")
      .select("id")
      .eq("user_id", user.id)
      .eq("employer_profile_id", employerProfileId)
      .maybeSingle();

    if (existing) {
      const { error: delErr } = await supabaseAdmin
        .from("store_follows")
        .delete()
        .eq("id", existing.id);
      if (delErr) throw delErr;
      return NextResponse.json({ success: true, following: false });
    }

    const { error: insertErr } = await supabaseAdmin
      .from("store_follows")
      .insert({ user_id: user.id, employer_profile_id: employerProfileId });
    if (insertErr) throw insertErr;

    // 매장 사장님에게 팔로우 알림 (본인 매장 본인이 팔로우하는 경우는 제외)
    const { data: store } = await supabaseAdmin
      .from("employer_profiles")
      .select("user_id, business_name")
      .eq("id", employerProfileId)
      .maybeSingle();
    const { data: follower } = await supabaseAdmin
      .from("users")
      .select("nickname")
      .eq("id", user.id)
      .maybeSingle();

    if (store && store.user_id !== user.id) {
      await createNotification({
        userId: store.user_id,
        type: "store_follow",
        title: `👋 ${follower?.nickname || "누군가"}님이 ${store.business_name} 매장을 팔로우했어요`,
        url: `/store/${employerProfileId}`
      });
    }

    return NextResponse.json({ success: true, following: true });
  } catch (error: any) {
    console.error("Error toggling store follow:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
