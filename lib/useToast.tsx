"use client";
import { useState, useCallback } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);

  const showToast = useCallback((msg: string, type: ToastType = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const ToastUI = toast ? (
    <div style={{
      position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, maxWidth: 320, width: "calc(100% - 48px)",
      background: toast.type === "error" ? "#ef4444"
        : toast.type === "warning" ? "#f59e0b"
        : toast.type === "info" ? "#3b82f6"
        : "#10b981",
      color: "#fff", borderRadius: 14, padding: "12px 18px",
      fontSize: 13, fontWeight: 600, textAlign: "center" as const,
      boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
    }}>
      {toast.msg}
    </div>
  ) : null;

  return { showToast, ToastUI };
}
