"use client";
import { ActiveRole } from "@/lib/useActiveRole";

interface RoleToggleButtonProps {
  activeRole: ActiveRole;
  onChange: (role: ActiveRole) => void;
}

export default function RoleToggleButton({ activeRole, onChange }: RoleToggleButtonProps) {
  const next: ActiveRole = activeRole === "employer" ? "worker" : "employer";
  const isEmployer = activeRole === "employer";
  return (
    <button
      onClick={() => onChange(next)}
      title={isEmployer ? "알바생 모드로 전환" : "사장님 모드로 전환"}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        height: 34, padding: "0 12px", borderRadius: 17,
        background: isEmployer
          ? "linear-gradient(135deg, #ec4899, #f472b6)"
          : "linear-gradient(135deg, #7c3aed, #a78bfa)",
        border: "none",
        boxShadow: isEmployer ? "0 2px 8px rgba(236,72,153,0.35)" : "0 2px 8px rgba(124,58,237,0.35)",
        color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer",
        flexShrink: 0, whiteSpace: "nowrap",
      }}
    >
      <span>{isEmployer ? "🏪 사장님" : "👷 알바생"}</span>
      <i className="ti ti-arrows-exchange" style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }} aria-hidden="true" />
    </button>
  );
}
