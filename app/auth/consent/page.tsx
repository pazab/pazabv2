"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { btnPrimary, btnSecondary } from "@/lib/styles";

export default function ConsentPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        setLoading(false);
      } else {
        router.replace("/login");
      }
    });
  }, []);

  const handleConsent = async (agreed: boolean) => {
    if (agreed) {
      router.replace("/explore");
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

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>불러오는 중...</p>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "var(--surface)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, border: "1px solid var(--border)" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔐</div>
          <h2 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 8px", color: "var(--text)" }}>개인정보 수집 동의</h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, lineHeight: 1.7 }}>
            파잡 서비스 이용을 위해<br />
            개인정보 수집·이용에 동의해주세요.
          </p>
        </div>

        <div style={{ background: "var(--surface2)", borderRadius: 12, padding: 14, marginBottom: 20, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
          <p style={{ margin: "0 0 6px", fontWeight: 700, color: "var(--text)" }}>수집 항목</p>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            <li>이메일 주소, 이름 (소셜 계정 연동)</li>
            <li>서비스 이용 내역 및 근태 기록</li>
          </ul>
          <p style={{ margin: "12px 0 0 0", fontSize: 11 }}>* 서비스 제공 목적 이외에 타 용도로 절대 사용하지 않으며, 동의하지 않으실 경우 서비스 이용이 제한됩니다.</p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => handleConsent(false)}
            style={{ ...btnSecondary, flex: 1, padding: 12, borderRadius: 10, cursor: "pointer" }}>
            거부 (탈퇴)
          </button>
          <button onClick={() => handleConsent(true)}
            style={{ ...btnPrimary, flex: 1, padding: 12, borderRadius: 10, cursor: "pointer", background: "linear-gradient(135deg,#7c3aed,#ec4899)" }}>
            동의하고 시작
          </button>
        </div>
      </div>
    </main>
  );
}
