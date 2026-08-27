"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ConfirmModal from "@/components/ConfirmModal";

// proxy.ts가 withdrawal_requested_at이 찍힌 계정을 로그인 시 여기로만 들여보낸다 —
// 취소하거나 로그아웃하는 것 외엔 아무것도 못 하게 막는 전용 화면.
export default function PendingDeletionPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [requestedAt, setRequestedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [deletingNow, setDeletingNow] = useState(false);
  const [showImmediateConfirm, setShowImmediateConfirm] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }

      const { data } = await supabase.from("users")
        .select("withdrawal_requested_at").eq("id", session.user.id).maybeSingle();

      if (!data?.withdrawal_requested_at) {
        // 이미 취소됐거나(다른 탭 등) 해당 없는 상태 — 정상 화면으로
        router.replace("/mypage");
        return;
      }
      setUserId(session.user.id);
      setRequestedAt(data.withdrawal_requested_at);
      setLoading(false);
    })();
  }, [router]);

  const handleCancel = async () => {
    if (!userId) return;
    setCanceling(true);
    try {
      const res = await fetch("/api/withdraw/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        router.replace("/mypage");
        return;
      }
      setToastMsg("취소 처리 중 오류가 발생했어요. 다시 시도해주세요.");
    } catch (e) {
      console.error("탈퇴 취소 오류:", e);
      setToastMsg("취소 처리 중 오류가 발생했어요. 다시 시도해주세요.");
    }
    setCanceling(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  const handleDeleteNow = async () => {
    if (!userId) return;
    setShowImmediateConfirm(false);
    setDeletingNow(true);
    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, immediate: true }),
      });
      if (res.ok) {
        await supabase.auth.signOut();
        router.replace("/");
        return;
      }
      setToastMsg("삭제 처리 중 오류가 발생했어요. 다시 시도해주세요.");
    } catch (e) {
      console.error("즉시 삭제 오류:", e);
      setToastMsg("삭제 처리 중 오류가 발생했어요. 다시 시도해주세요.");
    }
    setDeletingNow(false);
  };

  if (loading || !requestedAt) {
    return <main style={{ minHeight: "100vh", background: "var(--bg)" }} />;
  }

  const finalizeAt = new Date(new Date(requestedAt).getTime() + 7 * 24 * 60 * 60 * 1000);
  const daysLeft = Math.max(0, Math.ceil((finalizeAt.getTime() - Date.now()) / 86400000));

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", flexDirection: "column", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 420, margin: "0 auto", width: "100%", textAlign: "center" }}>
        <p style={{ fontSize: 40, margin: "0 0 12px" }}>🚪</p>
        <h1 style={{ fontSize: 19, fontWeight: 800, margin: "0 0 8px" }}>탈퇴 처리 예정이에요</h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 4px" }}>
          <strong style={{ color: "var(--danger)" }}>D-{daysLeft}</strong> · {finalizeAt.toLocaleDateString("ko-KR")}에 계정이 정리돼요
        </p>
        <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7, margin: "12px 0 28px" }}>
          그때까지는 파잡의 다른 기능을 이용할 수 없어요.<br />
          계속 쓰시려면 지금 탈퇴를 취소해주세요.
        </p>

        <button onClick={handleCancel} disabled={canceling}
          style={{ width: "100%", padding: "14px 0", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #7c3aed, #ec4899)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>
          {canceling ? "처리 중..." : "탈퇴 취소하고 계속 이용하기"}
        </button>
        <button onClick={handleLogout}
          style={{ width: "100%", padding: "12px 0", borderRadius: 14, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer" }}>
          로그아웃
        </button>
        <button onClick={() => setShowImmediateConfirm(true)} disabled={deletingNow}
          style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 11, textDecoration: "underline", padding: "16px 0 0", width: "100%", cursor: "pointer" }}>
          {deletingNow ? "처리 중..." : "기다리지 않고 지금 바로 삭제할게요"}
        </button>

        {toastMsg && (
          <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 16 }}>{toastMsg}</p>
        )}
      </div>

      {showImmediateConfirm && (
        <ConfirmModal
          title="정말 지금 바로 삭제할까요?"
          desc="남은 유예기간을 기다리지 않고 즉시 처리돼요. 이후엔 취소할 수 없어요."
          confirmLabel="즉시 삭제"
          confirmColor="#ef4444"
          onConfirm={handleDeleteNow}
          onCancel={() => setShowImmediateConfirm(false)}
        />
      )}
    </main>
  );
}
