"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Suspense } from "react";
import { btnSecondary } from "@/lib/styles";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const errParam = searchParams.get("error");
    if (errParam) {
      setError(`로그인 실패 사유: ${errParam}`);
    }

    // 로그인 전 페이지 저장
    const from = searchParams.get("from") || document.referrer;
    if (from && !from.includes("/login") && !from.includes("/signup") && !from.includes("/auth")) {
      localStorage.setItem("login_redirect", from);
    }
    localStorage.removeItem("pending_user_type");
    localStorage.removeItem("current_mode");
    localStorage.removeItem("login_redirect");
  }, [searchParams]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch {
      setError("구글 로그인 중 오류가 발생했어요");
      setLoading(false);
    }
  };

  const handleKakaoLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const redirect = localStorage.getItem("login_redirect") || "";
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "kakao",
        options: {
          redirectTo: `${window.location.origin}/auth/callback${redirect ? `?next=${encodeURIComponent(redirect)}` : ""}`,
          queryParams: { scope: "profile_nickname profile_image account_email" },
        },
      });
      if (error) throw error;
    } catch {
      setError("카카오 로그인 중 오류가 발생했어요");
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      {/* 배경 효과 */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-30%", left: "-10%", width: 400, height: 400, borderRadius: "50%", background: "var(--primary)", opacity: 0.06, filter: "blur(100px)" }} />
        <div style={{ position: "absolute", bottom: "-20%", right: "-10%", width: 300, height: 300, borderRadius: "50%", background: "var(--accent)", opacity: 0.05, filter: "blur(80px)" }} />
      </div>

      <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: 360 }}>
        {/* 로고 */}
        <button onClick={() => router.push("/")} style={{ display: "block", textAlign: "center", width: "100%", marginBottom: 40, background: "none", border: "none", cursor: "pointer" }}>
          <div style={{ fontSize: 28, fontWeight: 900, background: "linear-gradient(135deg, #8b5cf6, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            PAZAB
          </div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 0" }}>알바의 모든 것, 파잡</p>
        </button>

        <h2 style={{ fontSize: 22, fontWeight: 900, textAlign: "center", margin: "0 0 8px" }}>로그인</h2>
        <p style={{ fontSize: 14, color: "var(--text-sub)", textAlign: "center", margin: "0 0 28px" }}>
          소셜 계정으로 간편하게 시작하세요
        </p>

        {/* 구글 로그인 */}
        <button onClick={handleGoogleLogin} disabled={loading}
          style={{ ...btnSecondary, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, background: "#fff", color: "#333", opacity: loading ? 0.6 : 1, marginBottom: 12, fontSize: 15 }}>
          <GoogleIcon />
          {loading ? "로그인 중..." : "Google로 로그인"}
        </button>

        {/* 카카오 로그인 */}
        <button onClick={handleKakaoLogin} disabled={loading}
          style={{ ...btnSecondary, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, background: "#FEE500", color: "#191919", opacity: loading ? 0.6 : 1, marginBottom: 12, fontSize: 15 }}>
          <KakaoIcon />
          {loading ? "로그인 중..." : "카카오로 로그인"}
        </button>

        {error && <p style={{ color: "#f87171", fontSize: 13, textAlign: "center", marginBottom: 12 }}>{error}</p>}

        <div style={{ textAlign: "center", marginTop: 24 }}>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>처음이신가요? </span>
          <button onClick={() => router.push("/signup")}
            style={{ background: "none", border: "none", color: "var(--primary)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            회원가입
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button onClick={() => router.push("/")}
            style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}>
            홈으로 돌아가기
          </button>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg)" }} />}>
      <LoginContent />
    </Suspense>
  );
}

function KakaoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#191919" d="M12 3C6.48 3 2 6.48 2 10.8c0 2.76 1.72 5.19 4.32 6.63L5.28 21l4.44-2.31C10.44 18.9 11.22 19 12 19c5.52 0 10-3.48 10-8.2C22 6.48 17.52 3 12 3z"/>
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18c-.75 1.48-1.18 3.15-1.18 4.93s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
