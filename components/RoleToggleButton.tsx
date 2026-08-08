"use client";
import { useState } from "react";
import { ActiveRole } from "@/lib/useActiveRole";

interface RoleToggleButtonProps {
  activeRole: ActiveRole;
  onChange: (role: ActiveRole) => void;
}

export default function RoleToggleButton({ activeRole, onChange }: RoleToggleButtonProps) {
  const next: ActiveRole = activeRole === "employer" ? "worker" : "employer";
  const isEmployer = activeRole === "employer";
  const [justSwitched, setJustSwitched] = useState<ActiveRole | null>(null);

  const handleClick = () => {
    onChange(next);
    setJustSwitched(next);
    setTimeout(() => setJustSwitched(null), 1800);
  };

  return (
    <>
      <button
        onClick={handleClick}
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

      {justSwitched && (
        <div style={{
          position: "fixed", top: 8, left: "50%", transform: "translateX(-50%)",
          zIndex: 300, pointerEvents: "none",
          background: justSwitched === "employer"
            ? "linear-gradient(135deg, #ec4899, #f472b6)"
            : "linear-gradient(135deg, #7c3aed, #a78bfa)",
          color: "#fff", fontSize: 13, fontWeight: 800,
          padding: "10px 18px", borderRadius: 20,
          boxShadow: "var(--shadow-elevate)",
          display: "flex", alignItems: "center", gap: 6,
          animation: "roleSwitchToast 1.8s ease forwards",
        }}>
          <span>{justSwitched === "employer" ? "🏪" : "👷"}</span>
          <span>{justSwitched === "employer" ? "사장님 모드로 전환했어요" : "알바생 모드로 전환했어요"}</span>
          <style>{`
            @keyframes roleSwitchToast {
              0% { opacity: 0; transform: translate(-50%, -10px); }
              12% { opacity: 1; transform: translate(-50%, 0); }
              80% { opacity: 1; transform: translate(-50%, 0); }
              100% { opacity: 0; transform: translate(-50%, -6px); }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
