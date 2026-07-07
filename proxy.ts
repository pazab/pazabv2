import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// 인증 없이 접근 가능한 공개 경로
const PUBLIC_PATHS = [
  '/',
  '/login',
  '/auth',
  '/api',      // API Route Handler 전체 (자체 인증 처리)
  '/terms',
  '/privacy',
  '/d',      // 대타 딥링크 (STEP 3)
  '/i',      // 초대 링크 (STEP 4)
  '/sudoku', // 수도쿠 (비로그인 허용)
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('Supabase URL or Anon Key is missing. Skipping auth check in middleware.')
      return supabaseResponse
    }

    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            )
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    const { pathname } = request.nextUrl

    // 비로그인 + 보호 경로 → 로그인으로
    if (!user && !isPublicPath(pathname)) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }

    // 로그인 + 온보딩 미완료 → 온보딩으로
    if (user && !pathname.startsWith('/onboarding') && !pathname.startsWith('/auth')) {
      const { data: userData } = await supabase
        .from('users')
        .select('onboarded')
        .eq('id', user.id)
        .maybeSingle()

      if (userData && !userData.onboarded) {
        const url = request.nextUrl.clone()
        url.pathname = '/onboarding'
        return NextResponse.redirect(url)
      }
    }
  } catch (err) {
    console.error('Proxy check exception occurred:', err)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
