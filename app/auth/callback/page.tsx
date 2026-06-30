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
      // 동의 → explore로
      router.replace("/explore");
    } else {
      // 거부 → 자동 탈퇴
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
      const sp = new URLSearchParams(window.location.search);
      const code = sp.get("code");

      if (code) {
        setStatus("인증 토큰 교환 중...");
        const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
        if (exchangeData.session) {
          await saveAndRedirect(exchangeData.session);
          return;
        }
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        await saveAndRedirect(session);
        return;
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event: string, session: any) => {
          if (event === "SIGNED_IN" && session) {
            subscription.unsubscribe();
            await saveAndRedirect(session);
          }
        }
      );

      setTimeout(() => { subscription.unsubscribe(); router.replace("/"); }, 5000);
    } catch (err: any) {
      console.error("Auth callback verification error:", err);
      alert("로그인 에러 상세: " + (err.message || JSON.stringify(err)));
      router.replace("/");
    }
  };

  // 중복 없는 닉네임 반환 — 겹치면 이름2, 이름3 ...
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
      const userType = localStorage.getItem("pending_user_type") || "worker";

      // 유저 저장
      const { data: existingUser } = await supabase
        .from("users").select("user_type, profile_completed").eq("id", user.id).single();

      if (!existingUser) {
        const userEmail = user.email ||
          user.user_metadata?.email || "";
        const userName = user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.user_metadata?.user_name || "파잡유저";

        // 중복 닉네임 방지: 겹치면 숫자 붙이기
        const uniqueNickname = await resolveUniqueNickname(userName);

        await supabase.from("users").insert({
          id: user.id, email: userEmail,
          name: userName,
          nickname: uniqueNickname,
          user_type: userType, profile_completed: false,
          trust_score: 50, grade: "bronze", is_active: true,
        });
      }


      // current_mode 설정
      const dbType = existingUser?.user_type || userType;
      const safeMode = dbType === "both" ? "worker" : dbType;
      if (!localStorage.getItem("current_mode")) {
        localStorage.setItem("current_mode", safeMode);
      }

      // 인터뷰 결과 확인
      const hasWorkerBasic = !!localStorage.getItem("interview_result_basic_worker");
      const hasWorkerAdvanced = !!localStorage.getItem("interview_result_advanced_worker");
      const hasEmployerBasic = !!localStorage.getItem("interview_result_basic_employer");
      const hasEmployerAdvanced = !!localStorage.getItem("interview_result_advanced_employer");
      const hasWorker = hasWorkerBasic || hasWorkerAdvanced;
      const hasEmployer = hasEmployerBasic || hasEmployerAdvanced;

      // 이전 페이지로 돌아가기 (로그인 전 저장된 URL)
      const redirectTo = localStorage.getItem("login_redirect") || 
        new URLSearchParams(window.location.search).get("next") || "";

      // 결과가 있고 프로필 미완성이면 결과 페이지
      const profileIncomplete = !existingUser?.profile_completed;
      if ((hasWorker || hasEmployer) && profileIncomplete) {
        // 둘 다 있으면 모드 선택
        if (hasWorker && hasEmployer) {
          setStatus("모드 선택 중...");
          router.replace("/mode-select");
          return;
        }
        // 하나만 있으면 해당 결과로
        if (hasWorkerAdvanced) {
          router.replace("/result?type=worker&level=2");
        } else if (hasWorkerBasic) {
          router.replace("/result?type=worker&level=1");
        } else if (hasEmployerAdvanced) {
          router.replace("/result?type=employer&level=2");
        } else if (hasEmployerBasic) {
          router.replace("/result?type=employer&level=1");
        }
        return;
      }

      // 결과 없으면
      if (redirectTo && redirectTo !== "/" && !redirectTo.includes("localhost:3000/login")) {
        setStatus("이전 페이지로 이동 중...");
        router.replace(redirectTo.replace(window.location.origin, ""));
      } else if (!existingUser) {
        // 신규 가입 → 동의 팝업
        setShowConsentModal(true);
        setStatus("");
      } else {
        setStatus("탐색 페이지로 이동 중...");
        router.replace("/explore");
      }

    } catch (err) {
      console.error("Save and redirect db error:", err);
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
              이메일, 닉네임, 성향분석 결과, 매칭 이력
              <p style={{ margin: "8px 0 6px", fontWeight: 700, color: "var(--text)" }}>이용 목적</p>
              알바생-사장님 매칭 서비스 제공
              <p style={{ margin: "8px 0 6px", fontWeight: 700, color: "var(--text)" }}>보유 기간</p>
              회원 탈퇴 시까지
            </div>

            <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginBottom: 16 }}>
              자세한 내용은{" "}
              <a href="/privacy" target="_blank" style={{ color: "#c4b5fd", textDecoration: "underline" }}>개인정보처리방침</a>을 확인하세요
            </p>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => handleConsent(false)}
                style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)", fontWeight: 600, padding: 14, borderRadius: 12, cursor: "pointer", fontSize: 14 }}>
                거부 (탈퇴)
              </button>
              <button onClick={() => handleConsent(true)}
                style={{ flex: 2, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", border: "none", color: "#fff", fontWeight: 700, padding: 14, borderRadius: 12, cursor: "pointer", fontSize: 14 }}>
                동의하고 시작하기
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>⚡</div>
          <p style={{ color: "var(--text-sub)", fontWeight: 500 }}>{status}</p>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 16 }}>
            {[0, 150, 300].map(d => (
              <span key={d} style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--primary)", display: "inline-block", opacity: 0.5 }} />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
