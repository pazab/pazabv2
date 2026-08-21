import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const code = sp.get('code')
  const next = sp.get('next') || '/myteam'
  const errorParam = sp.get('error')
  const errorDesc = sp.get('error_description')

  if (errorParam) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorDesc || errorParam)}`, request.url)
    )
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=no_code', request.url))
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return NextResponse.redirect(new URL('/login?error=config_error', request.url))
  }

  // 세션 쿠키를 redirect 응답에 직접 붙이기 위해 모아둠
  const pendingCookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = []

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookies) { pendingCookies.push(...cookies) },
    },
  })

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
    )
  }

  const dest = new URL('/auth/callback', request.url)
  if (next && next !== '/myteam') {
    dest.searchParams.set('next', next)
  }

  const response = NextResponse.redirect(dest)
  // 세션 토큰 쿠키를 redirect 응답에 포함시켜야 클라이언트가 세션을 인식함
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
  })
  return response
}
