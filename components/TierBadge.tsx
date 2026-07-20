"use client";

/**
 * TierBadge — 대타 2-Tier 신뢰 배지 (DESIGN_PLAN.md P2)
 * ✅검증(그린) / 🔵신규(블루) / 노쇼위험낮음(HEXACO 기반, Tier1 전용 추가 배지)
 * 대타 카드·탐색·프로필 전 화면에서 이 컴포넌트만 사용할 것.
 */
import type { DaetaTier } from "@/lib/daetaTier";

interface TierBadgeProps {
  tier: DaetaTier;
  size?: "sm" | "md";
  /** HEXACO 정직성·성실성 기반 노쇼 예측 통과 시 true (Tier1에만 표시됨) */
  noShowSafe?: boolean;
}

export default function TierBadge({ tier, size = "sm", noShowSafe = false }: TierBadgeProps) {
  const isT1 = tier === "tier1";
  const fontSize = size === "sm" ? 10 : 12;
  const padding = size === "sm" ? "3px 8px" : "4px 10px";

  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    fontSize,
    fontWeight: 800,
    padding,
    borderRadius: 20,
    lineHeight: 1,
    whiteSpace: "nowrap",
  };

  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      <span style={{
        ...base,
        background: isT1 ? "rgba(34,197,94,0.15)" : "rgba(59,130,246,0.15)",
        border: `1px solid ${isT1 ? "rgba(34,197,94,0.4)" : "rgba(59,130,246,0.4)"}`,
        color: isT1 ? "#4ade80" : "#93c5fd",
      }}>
        {isT1 ? "✅ 검증" : "🔵 신규"}
      </span>
      {isT1 && noShowSafe && (
        <span style={{
          ...base,
          background: "rgba(139,92,246,0.15)",
          border: "1px solid rgba(139,92,246,0.4)",
          color: "#c4b5fd",
        }}>
          🛡️ 노쇼 위험 낮음
        </span>
      )}
    </span>
  );
}
