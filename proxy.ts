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
  '/map.html',        // 정적 지도 뷰어 iframe (public/)
  '/map-picker.html',  // 정적 지도 핀 선택 iframe (public/) — SetNeighborhoodSheet
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

    // /api는 리다이렉트 대상에서 항상 제외 — fetch()가 307을 그대로 따라가버리면
    // /account/pending-deletion의 취소 버튼 같은 POST 호출이 HTML 응답을 JSON인 것처럼
    // 오인해 "성공"으로 잘못 처리하는 문제가 생긴다(API 라우트는 자체 인증을 처리함).
    if (user && !pathname.startsWith('/onboarding') && !pathname.startsWith('/auth') && !pathname.startsWith('/api')) {
      const { data: userData } = await supabase
        .from('users')
        .select('onboarded, withdrawal_requested_at')
        .eq('id', user.id)
        .maybeSingle()

      // 탈퇴 유예기간 중 → 전용 안내 페이지(취소/로그아웃만 가능) 말고는 전부 차단.
      // 온보딩보다 우선 — 떠나려는 계정에게 온보딩을 다시 시킬 이유가 없음.
      if (userData?.withdrawal_requested_at && !pathname.startsWith('/account/pending-deletion')) {
        const url = request.nextUrl.clone()
        url.pathname = '/account/pending-deletion'
        return NextResponse.redirect(url)
      }

      // 로그인 + 온보딩 미완료 → 온보딩으로
      if (userData && !userData.onboarded && !userData.withdrawal_requested_at) {
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
