import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Server Component용 클라이언트
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return new Proxy({}, {
      get(_, prop) {
        throw new Error(`Cannot access Server Supabase client property "${String(prop)}". Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) are missing.`)
      }
    }) as any
  }

  const cookieStore = await cookies()
  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { /* Server Component에서 set 불가 — 무시 */ }
        },
      },
    }
  )
}

// Service Role 클라이언트 (API Route 전용)
import { createClient } from '@supabase/supabase-js'
export function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return new Proxy({}, {
      get(_, prop) {
        throw new Error(`Cannot access Admin Supabase client property "${String(prop)}". Supabase environment variables or Service Role Key are missing.`)
      }
    }) as any
  }
  return createClient(
    url,
    key,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
