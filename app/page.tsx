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
            router.replace(userData.user_type === "employer" ? "/myteam" : "/explore");
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

  return (
    <main style={{ minHeight: "100vh", background: "#0A0A0A", color: "#ffffff", overflowX: "hidden", position: "relative" }}>
      {/* Background blobs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 1 }}>
        <div style={{ position: "absolute", top: "-10%", left: "-10%", width: 500, height: 500, borderRadius: "50%", background: "rgba(139, 92, 246, 0.08)", filter: "blur(120px)" }} />
        <div style={{ position: "absolute", bottom: "-10%", right: "-10%", width: 400, height: 400, borderRadius: "50%", background: "rgba(236, 72, 153, 0.06)", filter: "blur(100px)" }} />
      </div>

      <div style={{ position: "relative", zIndex: 10, maxWidth: 480, margin: "0 auto", padding: "20px 16px 80px", display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        {/* Navigation Header */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 60, paddingTop: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 900, background: "linear-gradient(135deg, #8b5cf6, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-0.5px" }}>
            PAZAB
          </span>
          <button 
            onClick={() => router.push("/login")}
            style={{ ...btnSecondary, width: "auto", padding: "8px 16px", borderRadius: 12, fontSize: 13, background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)", color: "#ffffff" }}
          >
            로그인
          </button>
        </header>

        {/* Hero Section */}
        <section style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ display: "inline-block", background: "rgba(139, 92, 246, 0.15)", border: "1px solid rgba(139, 92, 246, 0.3)", borderRadius: 20, padding: "6px 14px", fontSize: 12, color: "#c4b5fd", fontWeight: 600, marginBottom: 16 }}>
            ⚡ 초간편 근거리 대타 매칭 서비스
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, lineHeight: 1.25, letterSpacing: "-1px", margin: "0 0 16px", background: "linear-gradient(to right, #ffffff, #e4e4e7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            알바생도, 사장님도<br />파잡으로 한 번에.
          </h1>
          <p style={{ fontSize: 15, color: "#a1a1aa", lineHeight: 1.6, margin: "0 auto 32px", maxWidth: 360 }}>
            펑크 난 대타 구인부터 출퇴근 기록, 급여 정산 자동화와 AI 매니저 PAZ의 가이드까지 스마트하게 시작하세요.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button 
              onClick={() => router.push("/auth/signup")} 
              style={{ ...btnPrimary, fontSize: 15, padding: "16px" }}
            >
              무료 회원가입
            </button>
            <button 
              onClick={() => router.push("/sudoku")} 
              style={{ ...btnSecondary, fontSize: 14, padding: "16px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.08)", color: "#a1a1aa" }}
            >
              🎮 수도쿠 게임하기 (비로그인 가능)
            </button>
          </div>
        </section>

        {/* Feature Cards Grid */}
        <section style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 48 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#ffffff", opacity: 0.9, marginBottom: 4 }}>
            핵심 기능 둘러보기
          </h2>

          {/* Feature 1 */}
          <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 20, padding: 20 }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>⚡</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>10초 긴급 대타 매칭</h3>
            <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.5, margin: 0 }}>
              가장 신속하게 대타가 필요할 때, 내 반경 10km 이내의 검증된 알바생들에게 푸시 알림과 딥링크를 보내 매칭합니다.
            </p>
          </div>

          {/* Feature 2 */}
          <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 20, padding: 20 }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>🧠</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>AI 매니저 PAZ</h3>
            <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.5, margin: 0 }}>
              AI 비서 PAZ가 알바생의 근태 패턴 분석, 신뢰 점수(Trust Score) 측정, 맞춤형 성향 분석 카드를 발행합니다.
            </p>
          </div>

          {/* Feature 3 */}
          <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 20, padding: 20 }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>📋</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>출퇴근 & 급여 자동 정산</h3>
            <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.5, margin: 0 }}>
              클릭 한 번으로 출퇴근 기록이 보관되며, 근무 시간에 연동되어 주휴수당 및 세금이 계산된 급여명세서가 자동으로 완성됩니다.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ marginTop: "auto", textAlign: "center", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 12 }}>
            <button onClick={() => router.push("/terms")} style={{ background: "none", border: "none", color: "#71717a", fontSize: 12, cursor: "pointer" }}>이용약관</button>
            <span style={{ color: "#27272a", fontSize: 12 }}>|</span>
            <button onClick={() => router.push("/privacy")} style={{ background: "none", border: "none", color: "#71717a", fontSize: 12, cursor: "pointer" }}>개인정보처리방침</button>
          </div>
          <p style={{ fontSize: 11, color: "#52525b", margin: 0, lineHeight: 1.5 }}>
            © {new Date().getFullYear()} PAZAB. All rights reserved.<br />
            알바 매칭부터 HR 관리까지, 스마트한 파트너 파잡.
          </p>
        </footer>
      </div>
    </main>
  );
}
