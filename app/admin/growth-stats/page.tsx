"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const ADMIN_EMAIL = "pazab@kakao.com";

interface GrowthStats {
  weekStart: string;
  newTeamMembers: number;
  availableNowWorkers: number;
  daetaSosCount: number;
  daetaSuccessCount: number;
}

export default function GrowthStatsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<GrowthStats | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      if (session.user.email !== ADMIN_EMAIL) { router.push("/"); return; }

      const res = await fetch("/api/admin/growth-stats", {
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "오류 발생"); return; }
      setStats(json);
    } catch (e: any) {
      setError(e.message || "오류 발생");
    } finally {
      setLoading(false);
    }
  }

  const successRate = stats && stats.daetaSosCount > 0
    ? Math.round((stats.daetaSuccessCount / stats.daetaSosCount) * 100)
    : null;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", maxWidth: 480, margin: "0 auto", padding: "20px 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <button onClick={() => router.back()}
          style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>←</button>
        <div>
          <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: 0 }}>📈 성장 지표</p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>STRATEGY.md §2 — 사장님 1명 → 직원 N명 편입 검증</p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center" as const, padding: "40px 0", color: "var(--text-muted)" }}>
          <p>로딩 중...</p>
        </div>
      ) : error ? (
        <div style={{ textAlign: "center" as const, padding: "40px 0" }}>
          <p style={{ color: "#ef4444" }}>오류: {error}</p>
          <button onClick={load} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 10, background: "var(--surface2)", border: "none", color: "var(--text)", cursor: "pointer" }}>다시 시도</button>
        </div>
      ) : !stats ? null : (
        <>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 12px" }}>
            최근 7일 (~{new Date(stats.weekStart).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })})
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[
              { label: "신규 등록/초대 팀원", value: `${stats.newTeamMembers}명`, sub: "최근 7일", color: "#7c3aed" },
              { label: "대타 가능 켠 인원", value: `${stats.availableNowWorkers}명`, sub: "현재 전체", color: "#10b981" },
              { label: "대타 SOS 발생", value: `${stats.daetaSosCount}건`, sub: "최근 7일", color: "#f59e0b" },
              { label: "대타 성사", value: `${stats.daetaSuccessCount}건`, sub: successRate !== null ? `성사율 ${successRate}%` : "-", color: "#ef4444" },
            ].map(s => (
              <div key={s.label} style={{ background: "var(--surface)", borderRadius: 14, padding: 14, border: "1px solid var(--border)" }}>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 4px" }}>{s.label}</p>
                <p style={{ fontSize: 18, fontWeight: 800, color: s.color, margin: "0 0 2px" }}>{s.value}</p>
                <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>{s.sub}</p>
              </div>
            ))}
          </div>

          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 16, border: "1px solid var(--border)" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "0 0 8px" }}>읽는 법</p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 6px", lineHeight: 1.6 }}>
              "신규 등록/초대 팀원"이 0에 가깝게 오래 유지되면 HR-First 성장 루프(§2)가 실제로 안 돌고 있다는 신호입니다.
            </p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
              "대타 SOS 발생"은 있는데 "대타 성사"가 계속 낮으면 공급(Tier1/2 풀)이나 에스컬레이션 단계(§6) 쪽 문제일 가능성이 큽니다.
            </p>
          </div>
        </>
      )}
    </main>
  );
}
