"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthGuard() {
  const router = useRouter();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED" && !session) {
        router.push("/login");
      }
    });

    // Refresh Token 에러 감지
    supabase.auth.getSession().then(({ error }) => {
      if (error?.message?.includes("Refresh Token Not Found") ||
          error?.message?.includes("Invalid Refresh Token")) {
        supabase.auth.signOut().then(() => router.push("/login"));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
