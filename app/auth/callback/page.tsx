"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function CallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState("로그인 처리 중...");
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [userId, setUserId] = useState("");

  const handleConsent = async (agreed: boolean) => {
    if (agreed) {
      router.replace("/myteam");
    } else {
      if (userId) {
        await fetch("/api/withdraw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        await supabase.auth.signOut();
      }
      router.replace("/");
    }
  };

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      // 서버 라우트(/api/auth/callback)에서 이미 코드 교환 완료 → 세션 쿠키 존재
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await saveAndRedirect(session);
        return;
      }

      // 세션이 없으면 onAuthStateChange로 최대 5초 대기
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event: string, session: any) => {
          if (event === "SIGNED_IN" && session) {
            subscription.unsubscribe();
            await saveAndRedirect(session);
          }
        }
      );

      setTimeout(() => { subscription.unsubscribe(); router.replace("/login?error=session_timeout"); }, 5000);
    } catch (err: any) {
      console.error("Auth callback error:", err);
      router.replace("/login?error=" + encodeURIComponent(err.message || "unknown"));
    }
  };

  const resolveUniqueNickname = async (base: string): Promise<string> => {
    const clean = base.trim().slice(0, 18);
    const { data } = await supabase.from("users")
      .select("nickname").ilike("nickname", `${clean}%`).limit(30);
    const taken = new Set((data || []).map((r: any) => r.nickname?.toLowerCase()));
    if (!taken.has(clean.toLowerCase())) return clean;
    for (let i = 2; i <= 999; i++) {
      const candidate = `${clean}${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${clean}_${Date.now().toString(36)}`;
  };

  const saveAndRedirect = async (session: any) => {
    try {
      setStatus("프로필 확인 중...");
      const user = session.user;
      setUserId(user.id);

      const { data: existingUser } = await supabase
        .from("users").select("user_type, profile_completed").eq("id", user.id).maybeSingle();

      if (!existingUser) {
        const userEmail = user.email || user.user_metadata?.email || "";
        const userName = user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.user_name || "파잡유저";
        const uniqueNickname = await resolveUniqueNickname(userName);

        // user_type은 임시값 — 구글이든 카카오든 가입 경로와 무관하게 역할 선택은
        // /onboarding 한 곳에서만 한다. onboarded:false라 proxy.ts가 다음 요청에서
        // 바로 그리로 보내고, 실제 역할은 거기서 확정된다(app/onboarding/page.tsx).
        await supabase.from("users").insert({
          id: user.id,
          email: userEmail,
          name: userName,
          nickname: uniqueNickname,
          user_type: "worker",
          profile_completed: false,
          trust_score: 50,
          grade: "bronze",
          is_active: true,
          onboarded: false,
        });
      }

      const redirectTo = localStorage.getItem("login_redirect") || 
        new URLSearchParams(window.location.search).get("next") || "";

      if (!existingUser) {
        setShowConsentModal(true);
        setStatus("");
      } else {
        setStatus("이동 중...");
        router.replace(redirectTo && redirectTo !== "/" && !redirectTo.includes("localhost:3000/login") ? redirectTo.replace(window.location.origin, "") : "/myteam");
      }
    } catch (err: any) {
      console.error("Save and redirect error:", err);
      alert("데이터 저장 오류: " + err.message);
      router.replace("/");
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {showConsentModal ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "var(--surface)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 380 }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🔐</div>
              <h2 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 8px" }}>개인정보 수집 동의</h2>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, lineHeight: 1.7 }}>
                파잡 서비스 이용을 위해<br />
                개인정보 수집·이용에 동의해주세요.
              </p>
            </div>
            <div style={{ background: "var(--surface2)", borderRadius: 12, padding: 14, marginBottom: 16, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
              <p style={{ margin: "0 0 6px", fontWeight: 700, color: "var(--text)" }}>수집 항목</p>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                <li>이메일 주소, 이름 (소셜 계정 연동)</li>
                <li>서비스 이용 내역 및 근태 기록</li>
              </ul>
              <p style={{ margin: "12px 0 0 0", fontSize: 11 }}>* 서비스 제공 목적 이외에 타 용도로 절대 사용하지 않으며, 동의하지 않으실 경우 서비스 이용이 제한됩니다.</p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => handleConsent(false)}
                style={{ flex: 1, padding: 12, borderRadius: 10, cursor: "pointer", background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                거부 (탈퇴)
              </button>
              <button onClick={() => handleConsent(true)}
                style={{ flex: 1, padding: 12, borderRadius: 10, cursor: "pointer", background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", color: "#fff", fontWeight: 700 }}>
                동의하고 시작
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
          <p style={{ fontSize: 14, margin: 0 }}>{status}</p>
        </div>
      )}
    </main>
  );
}
