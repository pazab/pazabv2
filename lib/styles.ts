import type { CSSProperties } from "react";

// ─── 카드 ───────────────────────────────────────────
export const cardStyle: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 20,
  padding: 16,
};

export const cardInnerStyle: CSSProperties = {
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 14,
};

export const cardGradientStyle: CSSProperties = {
  background: "var(--primary-light)",
  border: "1px solid var(--primary-border)",
  borderRadius: 20,
  padding: 20,
};

// ─── 버튼 (방향 A: 플랫 단색, 그라데이션은 --gradient-hero 하나만) ──
export const btnPrimary: CSSProperties = {
  background: "var(--primary)",
  border: "none",
  borderRadius: 16,
  padding: "14px 16px",
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  width: "100%",
};

export const btnSecondary: CSSProperties = {
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: "14px 16px",
  color: "var(--text-muted)",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  width: "100%",
};

export const btnAccent: CSSProperties = {
  background: "var(--accent)",
  border: "none",
  borderRadius: 16,
  padding: "14px 16px",
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  width: "100%",
};

// SOS·긴급 전용 히어로 버튼 — 그라데이션 예외를 쓸 수 있는 유일한 자리
export const btnHero: CSSProperties = {
  background: "var(--gradient-hero)",
  border: "none",
  borderRadius: 16,
  padding: "16px 18px",
  color: "#fff",
  fontWeight: 800,
  fontSize: 15,
  cursor: "pointer",
  width: "100%",
};

export const btnGhost: CSSProperties = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: "14px 16px",
  color: "var(--text-muted)",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  width: "100%",
};

export const btnDanger: CSSProperties = {
  background: "rgba(239,68,68,0.1)",
  border: "1px solid rgba(239,68,68,0.2)",
  borderRadius: 16,
  padding: "14px 16px",
  color: "#f87171",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  width: "100%",
};

export const btnSmall: CSSProperties = {
  borderRadius: 10,
  padding: "6px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  border: "none",
};

// ─── 칩 / 태그 ──────────────────────────────────────
export const chipStyle: CSSProperties = {
  borderRadius: 10,
  padding: "3px 8px",
  fontSize: 11,
  fontWeight: 600,
};

export const chipPrimary: CSSProperties = {
  ...chipStyle,
  background: "var(--primary-light)",
  border: "1px solid var(--primary-border)",
  color: "var(--purple-text)",
};

export const chipWarning: CSSProperties = {
  ...chipStyle,
  background: "var(--warning-bg)",
  border: "1px solid var(--warning-border)",
  color: "var(--warning)",
};

export const chipDanger: CSSProperties = {
  ...chipStyle,
  background: "var(--danger-bg)",
  border: "1px solid var(--danger-border)",
  color: "var(--danger)",
};

export const chipSuccess: CSSProperties = {
  ...chipStyle,
  background: "var(--success-bg)",
  border: "1px solid var(--success-border)",
  color: "var(--success)",
};

// ─── 섹션 헤더 ──────────────────────────────────────
export const sectionHeader: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  margin: "0 0 16px",
  color: "var(--text)",
};

// ─── 토글 스위치 ────────────────────────────────────
export const toggleTrack = (active: boolean): CSSProperties => ({
  width: 44,
  height: 24,
  borderRadius: 12,
  background: active ? "#8b5cf6" : "var(--surface)",
  cursor: "pointer",
  position: "relative",
  transition: "background 0.2s",
  flexShrink: 0,
  border: "1px solid var(--border)",
});

export const toggleThumb = (active: boolean): CSSProperties => ({
  position: "absolute",
  top: 2,
  left: active ? 22 : 2,
  width: 18,
  height: 18,
  borderRadius: "50%",
  background: "#fff",
  transition: "left 0.2s",
  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
});

// ─── 모달 ───────────────────────────────────────────
export const modalOverlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  zIndex: 200,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
};

export const modalSheet: CSSProperties = {
  background: "var(--surface)",
  borderRadius: "20px 20px 0 0",
  padding: 24,
  width: "100%",
  maxWidth: 480,
};

export const modalCenter: CSSProperties = {
  background: "var(--surface)",
  borderRadius: 20,
  padding: 24,
  width: "100%",
  maxWidth: 360,
};

// ─── 입력 ───────────────────────────────────────────
export const inputStyle: CSSProperties = {
  width: "100%",
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "12px 14px",
  color: "var(--text)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

// ─── 구분선 ─────────────────────────────────────────
export const divider: CSSProperties = {
  height: 1,
  background: "var(--border)",
  margin: "16px 0",
};