'use client'
import { createBrowserClient } from '@supabase/ssr'

// Client Component용 클라이언트 (싱글턴)
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.warn('Supabase URL or Anon Key is missing. Returning default browser client.')
    return createBrowserClient('', '')
  }
  return createBrowserClient(url, key)
}

// 기존 코드 호환용 alias (lib/supabase.ts 대체)
import { createClient } from '@supabase/supabase-js'

const getSupabaseClient = (() => {
  let instance: any = null
  return () => {
    if (instance) return instance

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key) {
      return new Proxy({}, {
        get(_, prop) {
          throw new Error(`Cannot access Supabase client property "${String(prop)}". Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) are missing.`)
        }
      })
    }

    instance = createClient(url, key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      }
    })
    return instance
  }
})()

export const supabase = new Proxy({}, {
  get(_, prop) {
    const client = getSupabaseClient()
    const value = client[prop]
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  }
}) as any