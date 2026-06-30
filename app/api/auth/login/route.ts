import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const provider = sp.get('provider') as 'google' | 'kakao' | null
  const next = sp.get('next') || '/explore'

  if (provider !== 'google' && provider !== 'kakao') {
    return NextResponse.redirect(new URL('/login?error=invalid_provider', request.url))
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return NextResponse.redirect(new URL('/login?error=config_error', request.url))
  }

  // setAll 호출 시 쿠키를 모아뒀다가 redirect 응답에 직접 붙임
  const pendingCookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = []

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookies) { pendingCookies.push(...cookies) },
    },
  })

  const callbackUrl = new URL('/api/auth/callback', request.url)
  callbackUrl.searchParams.set('next', next)

  const oauthOptions: Parameters<typeof supabase.auth.signInWithOAuth>[0]['options'] = {
    redirectTo: callbackUrl.toString(),
  }
  if (provider === 'kakao') {
    oauthOptions.queryParams = { scope: 'profile_nickname profile_image account_email' }
  }

  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: oauthOptions })

  if (error || !data.url) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error?.message || 'oauth_failed')}`, request.url)
    )
  }

  const response = NextResponse.redirect(data.url)
  // code_verifier 등 PKCE 쿠키를 redirect 응답에 포함시켜야 브라우저가 보관함
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
  })
  return response
}
