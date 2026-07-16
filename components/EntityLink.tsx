"use client";

import { useRouter } from "next/navigation";

interface EntityLinkProps {
  href: string;
  avatarUrl?: string | null;
  fallbackEmoji?: string;
  fallbackGradient?: string;
  name: string;
  label: string;
  variant?: "hero" | "content" | "chip";
  avatarShape?: "circle" | "square";
  onClick?: () => void;
}

export function EntityLink({
  href,
  avatarUrl,
  fallbackEmoji = "👤",
  fallbackGradient = "linear-gradient(135deg,#8b5cf6,#7c3aed)",
  name,
  label,
  variant = "content",
  avatarShape = "circle",
  onClick,
}: EntityLinkProps) {
  const router = useRouter();

  const handleClick = () => {
    onClick?.();
    router.push(href);
  };

  const shapeRadius = avatarShape === "square" ? "6px" : "50%";

  if (variant === "chip") {
    return (
      <span
        onClick={(e) => { e.stopPropagation(); handleClick(); }}
        style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "var(--primary-light, rgba(139,92,246,0.12))", border: "1px solid var(--primary-border, rgba(139,92,246,0.25))", borderRadius: 20, padding: "2px 7px", cursor: "pointer", flexShrink: 0 }}
      >
        <div style={{ width: 14, height: 14, borderRadius: shapeRadius, background: avatarUrl ? `url(${avatarUrl}) center/cover` : fallbackGradient, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, overflow: "hidden" }}>
          {!avatarUrl && fallbackEmoji}
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, color: "var(--primary, #8b5cf6)", letterSpacing: "0.2px" }}>
          {name}{label ? ` ${label}` : ""}
        </span>
      </span>
    );
  }

  const isHero = variant === "hero";

  return (
    <button
      onClick={handleClick}
      className="transition-all hover:opacity-80 active:scale-95 duration-150"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: isHero ? "rgba(0,0,0,0.35)" : "var(--surface2)",
        backdropFilter: isHero ? "blur(8px)" : undefined,
        border: isHero ? "1px solid rgba(255,255,255,0.15)" : "1px solid var(--border)",
        borderRadius: 20,
        padding: "6px 12px",
        cursor: "pointer",
      }}
    >
      <div style={{ width: 24, height: 24, borderRadius: shapeRadius, background: avatarUrl ? `url(${avatarUrl}) center/cover` : fallbackGradient, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, overflow: "hidden" }}>
        {!avatarUrl && fallbackEmoji}
      </div>
      <span style={{ fontSize: 12, color: isHero ? "rgba(255,255,255,0.9)" : "var(--text)", fontWeight: 600, whiteSpace: "nowrap" }}>
        {name}{label ? ` ${label}` : ""}
      </span>
    </button>
  );
}
