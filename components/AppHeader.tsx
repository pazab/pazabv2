"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import NotificationBell from "@/components/NotificationBell";

interface AppHeaderProps {
  title?: string;
  showSearch?: boolean;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  onSearchSubmit?: (v: string) => void;
  rightActions?: React.ReactNode;
  showSettings?: boolean;
  showBack?: boolean;
  onBack?: () => void;
  noSticky?: boolean;
  showBellAndMenu?: boolean;
}

export default function AppHeader({
  title,
  showSearch = false,
  searchValue = "",
  onSearchChange,
  onSearchSubmit,
  rightActions,
  showSettings = false,
  showBack = false,
  onBack,
  noSticky = false,
  showBellAndMenu,
}: AppHeaderProps) {
  const router = useRouter();
  const [searchFocused, setSearchFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <div style={{
      ...(noSticky ? {} : { position: "sticky", top: 0, zIndex: 30 }),
      background: "var(--nav-bg)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderBottom: "1px solid var(--nav-border)",
    }}>
      {/* 상단 바 */}
      <div style={{
        maxWidth: 480, margin: "0 auto",
        padding: "10px 14px",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        {/* 뒤로가기 */}
        {showBack && (
          <button onClick={() => onBack ? onBack() : router.back()}
            style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
            <i className="ti ti-chevron-left" style={{ fontSize: 20, display: "block" }} aria-hidden="true" />
          </button>
        )}

        {/* 로고 → 역할별 홈(마이팀) */}
        <button onClick={() => router.push("/myteam")}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
          <span style={{ fontSize: 17, fontWeight: 900, background: "linear-gradient(135deg, #8b5cf6, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-0.5px" }}>
            PAZAB
          </span>
        </button>

        {/* 구분선 + 페이지 타이틀 */}
        {title && (
          <>
            <div style={{ width: 1, height: 14, background: "var(--border)", flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)", flexShrink: 0 }}>{title}</span>
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* 오른쪽 커스텀 액션 */}
        {rightActions}

        {/* 알림 벨 */}
        {(showBellAndMenu ?? !showBack) && <NotificationBell />}

        {/* ⋮ 메뉴 */}
        {(showBellAndMenu ?? !showBack) && (
          <div ref={menuRef} style={{ position: "relative" }}>
            <button onClick={() => setMenuOpen(v => !v)}
              style={{ width: 34, height: 34, borderRadius: "50%", background: menuOpen ? "var(--surface)" : "none", border: menuOpen ? "1px solid var(--border)" : "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
              <i className="ti ti-dots-vertical" style={{ fontSize: 20 }} aria-hidden="true" />
            </button>
            {menuOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", width: 190, boxShadow: "var(--shadow-elevate)", zIndex: 50 }}>
                {/* 동결군 — 탐색/피드: 톤다운, 대타 SOS는 하단 네비 중앙에 이미 있어 중복 노출 안 함 */}
                <div style={{ padding: "8px 16px 4px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.3 }}>
                  둘러보기
                </div>
                <button onClick={() => { setMenuOpen(false); router.push("/explore"); }}
                  style={{ width: "100%", background: "none", border: "none", padding: "11px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 10 }}>
                  <i className="ti ti-compass" style={{ fontSize: 15, opacity: 0.7 }} aria-hidden="true" /> 알바 탐색
                </button>
                <button onClick={() => { setMenuOpen(false); router.push("/feed"); }}
                  style={{ width: "100%", background: "none", border: "none", padding: "11px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--text-muted)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                  <i className="ti ti-news" style={{ fontSize: 15, opacity: 0.7 }} aria-hidden="true" /> 피드
                </button>
                <button onClick={() => { setMenuOpen(false); router.push("/settings"); }}
                  style={{ width: "100%", background: "none", border: "none", padding: "13px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--text)", fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}>
                  <i className="ti ti-settings" style={{ fontSize: 16 }} aria-hidden="true" /> 설정
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 검색바 (탐색 페이지만) */}
      {showSearch && (
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 14px 10px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "var(--surface)",
            border: `1.5px solid ${searchFocused ? "rgba(139,92,246,0.5)" : "var(--border)"}`,
            borderRadius: 22, padding: "7px 14px",
            transition: "border 0.18s, box-shadow 0.18s",
            boxShadow: searchFocused ? "0 0 0 3px rgba(139,92,246,0.08)" : "none",
          }}>
            <i className="ti ti-search" style={{ fontSize: 15, color: "var(--text-muted)", flexShrink: 0 }} aria-hidden="true" />
            <input
              ref={inputRef}
              value={searchValue}
              onChange={e => onSearchChange?.(e.target.value)}
              onKeyDown={e => e.key === "Enter" && onSearchSubmit?.(searchValue)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="직종, 지역, 매장 이름으로 검색"
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                color: "var(--text)", fontSize: 13, height: 26,
              }}
            />
            {searchValue && (
              <button onClick={() => { onSearchChange?.(""); inputRef.current?.focus(); }}
                style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: 0, flexShrink: 0, display: "flex", alignItems: "center" }}>
                <i className="ti ti-x" style={{ fontSize: 14 }} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
