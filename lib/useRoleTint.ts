"use client";
import { useEffect, useState } from "react";
import { ACTIVE_ROLE_KEY, IS_BOTH_KEY, ROLE_CHANGE_EVENT, type ActiveRole } from "@/lib/useActiveRole";

// AppHeader/BottomNav처럼 전역에 항상 떠있는 컴포넌트가, DB 조회 없이 localStorage만 읽어서
// "지금 both 계정이 어느 모드인지" 파악 — 페이지(마이페이지 등)가 useActiveRole로 값을 쓸 때만 갱신됨.
function readTint(): ActiveRole | null {
  if (typeof window === "undefined") return null;
  const isBoth = window.localStorage.getItem(IS_BOTH_KEY) === "1";
  if (!isBoth) return null;
  const role = window.localStorage.getItem(ACTIVE_ROLE_KEY);
  return role === "employer" ? "employer" : role === "worker" ? "worker" : null;
}

export function useRoleTint(): ActiveRole | null {
  const [tint, setTint] = useState<ActiveRole | null>(readTint);

  useEffect(() => {
    const read = () => setTint(readTint());
    read();
    window.addEventListener(ROLE_CHANGE_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(ROLE_CHANGE_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  return tint;
}
