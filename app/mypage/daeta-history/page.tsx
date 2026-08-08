"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import DaetaHistoryView from "@/components/daeta/DaetaHistoryView";

function DaetaHistoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as "worker" | "employer") || "worker";
  const focusMatchId = searchParams.get("matchId") || undefined;

  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null));
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 80 }}>
      <AppHeader title="대타 이력" showBack onBack={() => router.push("/mypage")} />
      <div style={{ maxWidth: 480, margin: "0 auto", padding: 16 }}>
        {userId && <DaetaHistoryView userId={userId} userType={tab} embedded focusMatchId={focusMatchId} />}
      </div>
    </main>
  );
}

export default function DaetaHistoryPage() {
  return (
    <Suspense fallback={null}>
      <DaetaHistoryContent />
    </Suspense>
  );
}
