"use client"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"

/*
  스도쿠 독립 레이아웃
  - PAZAB BottomNav / PazFloatingButton / AuthGuard 없음
  - 자체 인증 가드만 포함
  - supabase 클라이언트만 공유 (교체 가능: lib/supabase.ts → 별도 클라이언트로 변경 가능)
*/

export default function SudokuLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        localStorage.setItem("login_redirect", pathname || "/sudoku")
        router.push("/login")
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (event === "TOKEN_REFRESHED" && !session)) {
        router.push("/login")
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return <>{children}</>
}
