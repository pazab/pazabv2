"use client";
import type { useRouter } from "next/navigation";

export default function MatchSuccessModal({ matchId, router, onClose, onToast }: {
  matchId: string;
  router: ReturnType<typeof useRouter>;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "var(--surface)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 360, textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
        <h3 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 8px" }}>매칭 성사!</h3>
        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 24px", lineHeight: 1.6 }}>
          본격적인 채팅 전에<br />AI 사전미팅으로 먼저 알아가볼까요? 😊
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={() => { onClose(); router.push(`/pre-meet/${matchId}`); }}
            style={{ width: "100%", background: "var(--primary)", border: "none", color: "#fff", fontWeight: 700, padding: 14, borderRadius: 14, fontSize: 15, cursor: "pointer" }}>
            🤖 AI 사전미팅 하기
          </button>
          <button onClick={() => { onClose(); router.push(`/chat/${matchId}`); }}
            style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", fontWeight: 600, padding: 12, borderRadius: 14, fontSize: 14, cursor: "pointer" }}>
            💬 바로 채팅하기
          </button>
          <button onClick={() => {
            onClose();
            onToast("💬 채팅 탭에서 AI 사전미팅 또는 채팅을 시작할 수 있어요!");
          }}
            style={{ width: "100%", background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: 8 }}>
            나중에
          </button>
        </div>
      </div>
    </div>
  );
}
