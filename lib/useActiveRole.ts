"use client";
import { useCallback, useEffect, useState } from "react";

export type ActiveRole = "worker" | "employer";

export const ACTIVE_ROLE_KEY = "pazab_active_role";
export const IS_BOTH_KEY = "pazab_is_both";
export const ROLE_CHANGE_EVENT = "pazab-role-change";
const KEY = ACTIVE_ROLE_KEY;

/**
 * useActiveRole — 'both' 계정의 현재 활성 모드(단일 소스, localStorage 전역 공유)
 * non-both 계정은 activeRole이 항상 자신의 userType으로 고정되고 localStorage는 건드리지 않는다.
 * IS_BOTH_KEY/ROLE_CHANGE_EVENT는 AppHeader/BottomNav 같은 전역 컴포넌트가 DB 조회 없이
 * "지금 both 계정이 어느 모드인지"를 즉시 읽고 반응(헤더/네비 틴트)할 수 있게 하기 위함.
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
    if (typeof window === "undefined" || userType === undefined) return;
    window.localStorage.setItem(IS_BOTH_KEY, isBoth ? "1" : "0");
    if (!isBoth) {
      setActiveRoleState((userType as ActiveRole) || defaultRole);
      return;
    }
    const stored = window.localStorage.getItem(KEY);
    if (stored === "worker" || stored === "employer") setActiveRoleState(stored);
  }, [isBoth, userType, defaultRole]);

  const setActiveRole = useCallback((role: ActiveRole) => {
    setActiveRoleState(role);
    if (isBoth) {
      window.localStorage.setItem(KEY, role);
      window.dispatchEvent(new CustomEvent(ROLE_CHANGE_EVENT, { detail: role }));
    }
  }, [isBoth]);

  return { activeRole, setActiveRole, isBoth };
}
