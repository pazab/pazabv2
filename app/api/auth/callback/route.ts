import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const code = sp.get('code')
  const next = sp.get('next') || '/explore'
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

  const cookieStore = await cookies()
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        )
      },
    },
  })

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
    )
  }

  // 세션 쿠키가 설정됐으므로 클라이언트 callback 페이지로 이동 (프로필 확인, 동의 모달 등)
  const dest = new URL('/auth/callback', request.url)
  if (next && next !== '/explore') {
    dest.searchParams.set('next', next)
  }
  return NextResponse.redirect(dest)
}
