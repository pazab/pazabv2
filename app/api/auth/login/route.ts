import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

  const callbackUrl = new URL('/api/auth/callback', request.url)
  callbackUrl.searchParams.set('next', next)

  const options: Parameters<typeof supabase.auth.signInWithOAuth>[0]['options'] = {
    redirectTo: callbackUrl.toString(),
  }
  if (provider === 'kakao') {
    options.queryParams = { scope: 'profile_nickname profile_image account_email' }
  }

  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options })

  if (error || !data.url) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error?.message || 'oauth_failed')}`, request.url)
    )
  }

  return NextResponse.redirect(data.url)
}
