"use client";

export default function ConfirmModal({ title, desc, confirmLabel, confirmColor, onConfirm, onCancel }: {
  title: string; desc: string; confirmLabel: string; confirmColor?: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: "var(--surface)", borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 640, margin: "0 auto" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>{title}</h3>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px", lineHeight: 1.6 }}>{desc}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onConfirm}
            style={{ flex: 1, background: confirmColor || "var(--primary)", border: "none", color: "#fff", fontWeight: 700, padding: 14, borderRadius: 12, cursor: "pointer", fontSize: 14 }}>
            {confirmLabel}
          </button>
          <button onClick={onCancel}
            style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)", fontWeight: 600, padding: 14, borderRadius: 12, cursor: "pointer", fontSize: 14 }}>
            아니요
          </button>
        </div>
      </div>
    </div>
  );
}
