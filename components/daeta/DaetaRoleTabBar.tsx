"use client";

interface DaetaRoleTabBarProps {
  roleView: "employer" | "worker";
  onRoleChange: (r: "employer" | "worker") => void;
}

export default function DaetaRoleTabBar({ roleView, onRoleChange }: DaetaRoleTabBarProps) {
  return (
    <div style={{
      maxWidth: 480,
      margin: "0 auto",
      padding: "12px 16px 4px",
      display: "flex",
      justifyContent: "center"
    }}>
      <div style={{
        display: "flex",
        background: "rgba(24, 24, 30, 0.92)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: 22,
        padding: 4,
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3)",
        width: "100%",
      }}>
        <button
          onClick={() => onRoleChange("employer")}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 18,
            border: "none",
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
            background: roleView === "employer"
              ? "linear-gradient(135deg, #f97316, #ef4444)"
              : "none",
            color: roleView === "employer" ? "#fff" : "rgba(255, 255, 255, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            transition: "all 0.2s ease",
            boxShadow: roleView === "employer" ? "0 2px 8px rgba(249, 115, 22, 0.3)" : "none",
          }}
        >
          <i className="ti ti-building-store" aria-hidden="true" />
          🚨 대타 구하기 (사장님)
        </button>
        <button
          onClick={() => onRoleChange("worker")}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 18,
            border: "none",
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
            background: roleView === "worker"
              ? "linear-gradient(135deg, #7c3aed, #ec4899)"
              : "none",
            color: roleView === "worker" ? "#fff" : "rgba(255, 255, 255, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            transition: "all 0.2s ease",
            boxShadow: roleView === "worker" ? "0 2px 8px rgba(124, 58, 237, 0.3)" : "none",
          }}
        >
          <i className="ti ti-bolt" aria-hidden="true" />
          ⚡ 대타 뛰기 (알바생)
        </button>
      </div>
    </div>
  );
}
