"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getGrade, BADGE_DEFS } from "@/lib/trustScore";

export default function AdminTrustPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { init(); }, []);

  const ADMIN_EMAIL = "pazab@kakao.com";

  const init = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email !== ADMIN_EMAIL) { router.replace("/"); return; }

    const res = await fetch("/api/admin/trust", {
      headers: { authorization: `Bearer ${session.access_token}` }
    });
    const json = await res.json();
    setData(json);
    setLoading(false);
  };

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
    </main>
  );

  const badgeMap: Record<string, string[]> = {};
  data?.badges?.forEach((b: any) => {
    if (!badgeMap[b.user_id]) badgeMap[b.user_id] = [];
    badgeMap[b.user_id].push(b.badge_key);
  });

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "20px 16px", maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <button onClick={() => router.push("/admin/ai-stats")}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20 }}>←</button>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>🏅 신뢰 시스템 어드민</h1>
      </div>

      {/* 요약 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
        {[
          { label: "전체 유저", value: data?.users?.length || 0 },
          { label: "평균 점수", value: Math.round(data?.users?.reduce((s: number, u: any) => s + (u.trust_score || 50), 0) / (data?.users?.length || 1)) },
          { label: "뱃지 발급", value: data?.badges?.length || 0 },
          { label: "최근 이벤트", value: data?.logs?.length || 0 },
        ].map(card => (
          <div key={card.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px" }}>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 6px" }}>{card.label}</p>
            <p style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* 유저 목록 */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>유저 신뢰 현황</h2>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface2)" }}>
                {["닉네임", "등급", "점수", "뱃지", "타입"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "var(--text-muted)", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.users?.map((u: any) => {
                const grade = getGrade(u.trust_score || 50);
                const badges = badgeMap[u.id] || [];
                return (
                  <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{u.nickname || u.email?.split("@")[0]}</td>
                    <td style={{ padding: "10px 14px" }}>{grade.emoji} {grade.name}</td>
                    <td style={{ padding: "10px 14px", color: "var(--text-muted)" }}>{u.trust_score || 50}</td>
                    <td style={{ padding: "10px 14px" }}>
                      {badges.map(b => (
                        <span key={b} style={{ marginRight: 4 }}>{BADGE_DEFS[b]?.emoji}</span>
                      ))}
                      {badges.length === 0 && <span style={{ color: "var(--text-muted)" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--text-muted)" }}>{u.user_type}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 최근 점수 이벤트 */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>최근 점수 변동</h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {data?.logs?.slice(0, 20).map((log: any, i: number) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: log.delta > 0 ? "#86efac" : "#f87171", minWidth: 40 }}>
                {log.delta > 0 ? "+" : ""}{log.delta}
              </span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, margin: "0 0 2px" }}>{log.reason}</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{log.category}</p>
              </div>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {new Date(log.created_at).toLocaleDateString("ko-KR")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}