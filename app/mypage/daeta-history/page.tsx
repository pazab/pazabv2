"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import DaetaHistoryView from "@/components/daeta/DaetaHistoryView";

function DaetaHistoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as "worker" | "employer") || "worker";
  const focusMatchId = searchParams.get("matchId") || undefined;

  const [userId, setUserId] = useState<string | null>(null);
  // 사장님/알바생 양쪽 다 하는 계정(both)이 이 페이지에 링크를 타고 들어오면 딱 그 시점의
  // 역할로만 고정돼서, 예를 들어 사장님 진행중 건을 보다가 자기가 지원한 알바생 쪽 진행중
  // 건은 URL을 직접 고치지 않는 한 볼 방법이 없었음 — 페이지 안에서 바로 전환 가능하게.
  const [role, setRole] = useState<"worker" | "employer">(initialTab);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null));
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 80 }}>
      <AppHeader title="대타 이력" showBack onBack={() => router.push("/mypage")} />
      <div style={{ maxWidth: 480, margin: "0 auto", padding: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 18, background: "var(--surface2)", borderRadius: 18, padding: 6 }}>
          <button
            onClick={() => setRole("worker")}
            style={{
              flex: 1, padding: "16px 0", borderRadius: 13, border: "none", cursor: "pointer",
              background: role === "worker" ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "transparent",
              color: role === "worker" ? "#fff" : "var(--text-muted)",
              fontSize: 16, fontWeight: 900,
              boxShadow: role === "worker" ? "0 4px 14px rgba(139,92,246,0.3)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            ⚡ 알바생으로
          </button>
          <button
            onClick={() => setRole("employer")}
            style={{
              flex: 1, padding: "16px 0", borderRadius: 13, border: "none", cursor: "pointer",
              background: role === "employer" ? "linear-gradient(135deg, #f97316, #ef4444)" : "transparent",
              color: role === "employer" ? "#fff" : "var(--text-muted)",
              fontSize: 16, fontWeight: 900,
              boxShadow: role === "employer" ? "0 4px 14px rgba(249,115,22,0.3)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            🏪 사장님으로
          </button>
        </div>
        {userId && <DaetaHistoryView userId={userId} userType={role} embedded focusMatchId={focusMatchId} />}
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
