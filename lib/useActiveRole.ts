"use client";
import { useCallback, useEffect, useState } from "react";

export type ActiveRole = "worker" | "employer";

export const ACTIVE_ROLE_KEY = "pazab_active_role";
const KEY = ACTIVE_ROLE_KEY;

/**
 * useActiveRole — 'both' 계정의 현재 활성 모드(단일 소스, localStorage 전역 공유)
 * non-both 계정은 activeRole이 항상 자신의 userType으로 고정되고 localStorage는 건드리지 않는다.
 */
export function useActiveRole(userType: string | undefined, defaultRole: ActiveRole = "worker") {
  const isBoth = userType === "both";

  const [activeRole, setActiveRoleState] = useState<ActiveRole>(() => {
    if (!isBoth) return (userType as ActiveRole) || defaultRole;
    if (typeof window === "undefined") return defaultRole;
    const stored = window.localStorage.getItem(KEY);
    return stored === "worker" || stored === "employer" ? stored : defaultRole;
  });

  useEffect(() => {
    if (!isBoth) {
      setActiveRoleState((userType as ActiveRole) || defaultRole);
      return;
    }
    const stored = window.localStorage.getItem(KEY);
    if (stored === "worker" || stored === "employer") setActiveRoleState(stored);
  }, [isBoth, userType, defaultRole]);

  const setActiveRole = useCallback((role: ActiveRole) => {
    setActiveRoleState(role);
    if (isBoth) window.localStorage.setItem(KEY, role);
  }, [isBoth]);

  return { activeRole, setActiveRole, isBoth };
}
