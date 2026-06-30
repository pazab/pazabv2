import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

// 중복 없는 닉네임 반환 헬퍼 (서버사이드용)
async function resolveUniqueNickname(supabase: any, base: string): Promise<string> {
  const clean = base.trim().slice(0, 18);
  const { data } = await supabase.from("users")
    .select("nickname").ilike("nickname", `${clean}%`).limit(30);
  const taken = new Set((data || []).map((r: any) => r.nickname?.toLowerCase()));
  if (!taken.has(clean.toLowerCase())) return clean;
  for (let i = 2; i <= 999; i++) {
    const candidate = `${clean}${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${clean}_${Date.now().toString(36)}`;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/explore";

  if (code) {
    const redirectUrl = `${origin}${next}`;
    let supabaseResponse = NextResponse.redirect(redirectUrl);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            const cookieHeader = request.headers.get("cookie") ?? "";
            return cookieHeader.split(";").map(c => {
              const [name, ...value] = c.trim().split("=");
              return { name, value: value.join("=") };
            });
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              supabaseResponse.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const { data: { session }, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("Exchange error:", exchangeError);
      return NextResponse.redirect(`${origin}/login?error=auth_code_exchange_failed`);
    }

    if (session) {
      const user = session.user;
      
      const { data: existingUser } = await supabase
        .from("users")
        .select("id, user_type, profile_completed")
        .eq("id", user.id)
        .maybeSingle();

      if (!existingUser) {
        const userEmail = user.email || user.user_metadata?.email || "";
        const userName = user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.user_name || "파잡유저";
        const uniqueNickname = await resolveUniqueNickname(supabase, userName);

        await supabase.from("users").insert({
          id: user.id,
          email: userEmail,
          name: userName,
          nickname: uniqueNickname,
          user_type: "worker",
          profile_completed: false,
          trust_score: 50,
          grade: "bronze",
          is_active: true,
        });

        const consentResponse = NextResponse.redirect(`${origin}/auth/consent`);
        supabaseResponse.cookies.getAll().forEach(c => {
          const originalCookie = supabaseResponse.cookies.get(c.name);
          consentResponse.cookies.set(c.name, c.value, {
            path: originalCookie?.path,
            domain: originalCookie?.domain,
            secure: originalCookie?.secure,
            httpOnly: originalCookie?.httpOnly,
            sameSite: originalCookie?.sameSite,
            expires: originalCookie?.expires,
            maxAge: originalCookie?.maxAge
          });
        });
        return consentResponse;
      }

      return supabaseResponse;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=no_auth_code`);
}
