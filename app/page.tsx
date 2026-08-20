"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { btnPrimary, btnSecondary } from "@/lib/styles";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setIsLoggedIn(true);
          // 온보딩 여부 확인
          const { data: userData } = await supabase
            .from("users")
            .select("onboarded, user_type")
            .eq("id", session.user.id)
            .single();

          if (userData && userData.onboarded) {
            // DESIGN_PLAN.md P3: 알바생도 홈은 마이팀(내 근무) — 잡보드가 첫 화면이 되지 않게
            router.replace("/myteam");
          } else {
            router.replace("/onboarding");
          }
        } else {
          setIsLoggedIn(false);
          setLoading(false);
        }
      } catch (err) {
        console.error("Auth check error:", err);
        setLoading(false);
      }
    }
    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: "#0A0A0A", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#ffffff" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, fontWeight: 900, background: "linear-gradient(135deg, #8b5cf6, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 16 }}>
            PAZAB
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
            {[0, 150, 300].map(d => (
              <span key={d} style={{ width: 8, height: 8, borderRadius: "50%", background: "#8b5cf6", display: "inline-block", opacity: 0.6 }} />
            ))}
          </div>
        </div>
      </main>
    );
  }

  const features = [
    {
      icon: "⚡",
      accent: "#f97316",
      title: "1탭 긴급 대타 매칭",
      desc: "펑크가 나면 버튼 한 번으로 반경 10km 안의 검증된 인력에게 즉시 알림이 가고, 단계적으로 매칭 범위가 넓어져요.",
    },
    {
      icon: "✅",
      accent: "#22c55e",
      title: "검증된 인력만 먼저 매칭",
      desc: "모르는 사람 소개가 아니라 근태·팀 이력이 쌓인 사람을 빌려드려요. 팀 이력이나 대타 완료 이력이 있는 인력이 먼저 노출되고, 노쇼 위험은 자동으로 걸러져요.",
    },
    {
      icon: "📋",
      accent: "#8b5cf6",
      title: "출퇴근 & 급여 자동 정산",
      desc: "클릭 한 번으로 출퇴근이 기록되고, 근무 시간에 맞춰 주휴수당·세금까지 계산된 임금명세서가 자동으로 완성돼요.",
    },
  ];

  return (
    <main style={{ minHeight: "100vh", background: "#0A0A0A", color: "#ffffff", overflowX: "hidden", position: "relative" }}>
      {/* Background blobs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 1 }}>
        <div style={{ position: "absolute", top: "-14%", left: "-16%", width: 520, height: 520, borderRadius: "50%", background: "rgba(139, 92, 246, 0.10)", filter: "blur(130px)" }} />
        <div style={{ position: "absolute", bottom: "-12%", right: "-14%", width: 440, height: 440, borderRadius: "50%", background: "rgba(236, 72, 153, 0.07)", filter: "blur(110px)" }} />
        <div style={{ position: "absolute", top: "38%", left: "50%", transform: "translateX(-50%)", width: 320, height: 320, borderRadius: "50%", background: "rgba(249, 115, 22, 0.045)", filter: "blur(110px)" }} />
      </div>

      <div style={{ position: "relative", zIndex: 10, maxWidth: 480, margin: "0 auto", padding: "20px 16px 72px", display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        {/* Navigation Header */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 56, paddingTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <img src="/pazab-mark.svg" alt="" width={34} height={34} style={{ display: "block", marginLeft: -3 }} />
            <span style={{ fontSize: 22, fontWeight: 900, background: "linear-gradient(135deg, #8b5cf6, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-0.5px" }}>
              PAZAB
            </span>
          </div>
          <button
            onClick={() => router.push("/login")}
            style={{ ...btnSecondary, width: "auto", padding: "8px 16px", borderRadius: 12, fontSize: 13, background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)", color: "#ffffff" }}
          >
            로그인
          </button>
        </header>

        {/* Hero Section */}
        <section style={{ textAlign: "center", marginBottom: 44 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(139, 92, 246, 0.15)", border: "1px solid rgba(139, 92, 246, 0.3)",
            borderRadius: 20, padding: "6px 14px", fontSize: 12, color: "#c4b5fd", fontWeight: 700, marginBottom: 20,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#c4b5fd", flexShrink: 0 }} />
            초간편 근거리 대타 매칭 서비스
          </div>
          <h1 style={{ fontSize: 33, fontWeight: 900, lineHeight: 1.28, letterSpacing: "-1px", margin: "0 0 16px", color: "#f4f4f5" }}>
            알바생도, 사장님도<br />
            <span style={{ background: "linear-gradient(135deg, #a78bfa, #f0abfc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>파잡</span>으로 한 번에.
          </h1>
          <p style={{ fontSize: 15, color: "#a1a1aa", lineHeight: 1.65, margin: "0 auto 28px", maxWidth: 340 }}>
            펑크 난 대타 구인부터 검증된 인력 매칭, 출퇴근 기록과 급여 정산 자동화까지 스마트하게 시작하세요.
          </p>

          <button
            onClick={() => router.push("/auth/signup")}
            style={{
              ...btnPrimary,
              width: "100%",
              fontSize: 15,
              padding: "16px",
              background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
              boxShadow: "0 10px 28px rgba(139, 92, 246, 0.35)",
            }}
          >
            무료 회원가입
          </button>
          <button
            onClick={() => router.push("/login")}
            style={{ background: "none", border: "none", color: "#71717a", fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginTop: 14, padding: 4 }}
          >
            이미 계정이 있으신가요? <span style={{ color: "#c4b5fd" }}>로그인</span>
          </button>
        </section>

        {/* Feature Cards Grid */}
        <section style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 44 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: "#71717a", letterSpacing: "0.3px", marginBottom: 2, textTransform: "uppercase" }}>
            핵심 기능 둘러보기
          </h2>

          {features.map(f => (
            <div key={f.title} style={{
              display: "flex", gap: 14,
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.07)",
              borderRadius: 18, padding: 18,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 13, flexShrink: 0,
                background: `${f.accent}1f`, border: `1px solid ${f.accent}40`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19,
              }}>
                {f.icon}
              </div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: "2px 0 5px", color: "#f4f4f5" }}>{f.title}</h3>
                <p style={{ fontSize: 12.5, color: "#a1a1aa", lineHeight: 1.55, margin: 0 }}>
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* Footer */}
        <footer style={{ marginTop: "auto", textAlign: "center", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: 22 }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 12 }}>
            <button onClick={() => router.push("/terms")} style={{ background: "none", border: "none", color: "#71717a", fontSize: 12, cursor: "pointer" }}>이용약관</button>
            <span style={{ color: "#27272a", fontSize: 12 }}>|</span>
            <button onClick={() => router.push("/privacy")} style={{ background: "none", border: "none", color: "#71717a", fontSize: 12, cursor: "pointer" }}>개인정보처리방침</button>
          </div>
          <p style={{ fontSize: 11, color: "#52525b", margin: 0, lineHeight: 1.6 }}>
            © {new Date().getFullYear()} PAZAB. All rights reserved.<br />
            대타 매칭부터 근태·급여 관리까지, 사장님을 위한 스마트 HR 파트너.
          </p>
        </footer>
      </div>
    </main>
  );
}
