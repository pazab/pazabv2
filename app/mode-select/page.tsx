"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ModeSelectPage() {
  const router = useRouter();

  const selectMode = (mode: "worker" | "employer") => {
    localStorage.setItem("current_mode", mode);
    router.replace("/myteam");
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "-20%", left: "-10%", width: 400, height: 400, borderRadius: "50%", background: "var(--primary)", opacity: 0.06, filter: "blur(100px)" }} />
        <div style={{ position: "absolute", bottom: "-20%", right: "-10%", width: 400, height: 400, borderRadius: "50%", background: "var(--accent)", opacity: 0.05, filter: "blur(100px)" }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 400, textAlign: "center" }}>
        <button onClick={() => router.push("/")}
          style={{ background: "linear-gradient(135deg, #8b5cf6, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", border: "none", fontSize: 26, fontWeight: 900, cursor: "pointer", marginBottom: 32, display: "block", width: "100%" }}>
          PAZAB
        </button>

        <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 8px" }}>오늘은 어떻게 시작할까요?</h2>
        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 32px" }}>언제든 MY 파잡에서 전환할 수 있어요</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <button onClick={() => selectMode("worker")}
            style={{ width: "100%", background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(139,92,246,0.05))", border: "1px solid var(--primary-border)", borderRadius: 20, padding: "24px 20px", textAlign: "left", cursor: "pointer", transition: "all 0.2s" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>⚡</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>알바생으로 시작</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>나한테 딱 맞는 알바 찾기</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["궁합 높은 매장 탐색", "지원하기", "조건 맞춤 추천"].map(t => (
                <span key={t} style={{ fontSize: 11, background: "var(--primary-light)", border: "1px solid var(--primary-border)", color: "#c4b5fd", padding: "3px 8px", borderRadius: 20 }}>{t}</span>
              ))}
            </div>
          </button>

          <button onClick={() => selectMode("employer")}
            style={{ width: "100%", background: "linear-gradient(135deg, rgba(236,72,153,0.12), rgba(236,72,153,0.04))", border: "1px solid rgba(236,72,153,0.3)", borderRadius: 20, padding: "24px 20px", textAlign: "left", cursor: "pointer", transition: "all 0.2s" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>👔</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>사장님으로 시작</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>우리 매장에 맞는 알바생 찾기</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["궁합 높은 알바생 탐색", "채용 제안하기", "성향 기반 추천"].map(t => (
                <span key={t} style={{ fontSize: 11, background: "rgba(236,72,153,0.15)", border: "1px solid rgba(236,72,153,0.3)", color: "#f9a8d4", padding: "3px 8px", borderRadius: 20 }}>{t}</span>
              ))}
            </div>
          </button>
        </div>
      </div>
    </main>
  );
}
