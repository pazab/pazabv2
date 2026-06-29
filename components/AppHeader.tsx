"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
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
}: AppHeaderProps) {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        supabase.from("users").select("avatar_url").eq("id", data.user.id).maybeSingle()
          .then(({ data: u }) => setAvatarUrl(u?.avatar_url || null));
      }
    });
  }, []);

  return (
    <div style={{
      ...(noSticky ? {} : { position: "sticky", top: 0, zIndex: 30 }),
      background: "rgba(24,24,27,0.97)",
      backdropFilter: "blur(12px)",
      borderBottom: "1px solid var(--border)",
    }}>
      {/* 상단 바 */}
      <div style={{
        maxWidth: 480, margin: "0 auto",
        padding: "12px 16px",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        {/* 뒤로가기 */}
        {showBack && (
          <button onClick={() => onBack ? onBack() : router.back()}
            style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer", padding: "0 4px", flexShrink: 0 }}>
            <i className="ti ti-arrow-left" style={{ fontSize: 20, display: "block" }} aria-hidden="true" />
          </button>
        )}

        {/* 로고 */}
        <button onClick={() => router.push("/explore")}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
          <span style={{ fontSize: 17, fontWeight: 900, background: "linear-gradient(135deg, #8b5cf6, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-0.5px" }}>
            PAZAB
          </span>
        </button>

        {/* 구분선 */}
        {title && (
          <>
            <div style={{ width: 1, height: 14, background: "var(--border)", flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", flexShrink: 0 }}>{title}</span>
          </>
        )}

        {/* 중간 공백 */}
        <div style={{ flex: 1 }} />

        {/* 오른쪽 액션 */}
        {rightActions}

        {/* 설정 버튼 (MY 페이지) */}
        {showSettings && (
          <button onClick={() => router.push("/settings")}
            style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 18, cursor: "pointer", padding: "0 2px" }}
            title="설정">
            <i className="ti ti-settings" style={{ fontSize: 18, display: "block" }} aria-hidden="true" />
          </button>
        )}

        {/* 대타 버튼 */}
        {!showBack && (
          <button onClick={() => router.push("/daeta")} title="대타"
            style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", marginRight: 2 }}>
            <svg width="54" height="27" viewBox="0 0 512 256" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="hFireFill" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="30%" stopColor="#ffe082" />
                  <stop offset="60%" stopColor="#ff9800" />
                  <stop offset="100%" stopColor="#ff3d00" />
                </linearGradient>
                <linearGradient id="hFireStroke" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ff6d00" />
                  <stop offset="100%" stopColor="#d84315" />
                </linearGradient>
              </defs>
              <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle"
                fontFamily="Pretendard, Apple SD Gothic Neo, Noto Sans KR, sans-serif"
                fontSize="140" fontWeight="900"
                fill="none" stroke="url(#hFireStroke)" strokeWidth="10" strokeLinejoin="round"
                transform="skewX(-12)">대타</text>
              <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle"
                fontFamily="Pretendard, Apple SD Gothic Neo, Noto Sans KR, sans-serif"
                fontSize="140" fontWeight="900"
                fill="url(#hFireFill)"
                transform="skewX(-12)">대타</text>
            </svg>
          </button>
        )}

        {/* 스도쿠 버튼 */}
        {!showBack && (
          <button onClick={() => router.push("/sudoku")} title="스도쿠"
            style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", marginRight: 6 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              {[0,1,2].map(br => [0,1,2].map(bc =>
                [0,1,2].map(r => [0,1,2].map(c => {
                  const x = (bc * 3 + c) * 2 + bc * 1
                  const y = (br * 3 + r) * 2 + br * 1
                  const isBox = (br + bc) % 2 === 0
                  return (
                    <rect key={`${br}${bc}${r}${c}`} x={x} y={y} width="2" height="2"
                      rx="0.3"
                      fill={isBox ? "rgba(139,92,246,0.75)" : "rgba(139,92,246,0.35)"}
                    />
                  )
                }))
              ))}
            </svg>
          </button>
        )}

        {/* 알림 벨 */}
        {!showBack && <NotificationBell />}

        {/* 프로필 아바타 (탐색 페이지) */}
        {!showSettings && !showBack && (
          <button onClick={() => router.push("/mypage")}
            style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", border: "1.5px solid var(--border)", background: "var(--surface2)", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
            {avatarUrl
              ? <img src={avatarUrl} alt="프로필" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <i className="ti ti-user-circle" style={{ fontSize: 16, color: "var(--text-muted)" }} aria-hidden="true" />}
          </button>
        )}
      </div>

      {/* 검색바 (탐색 페이지만) */}
      {showSearch && (
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px 8px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--surface2)",
            border: `1px solid ${searchFocused ? "#8b5cf6" : "var(--border)"}`,
            borderRadius: 18, padding: "4px 10px",
            transition: "border 0.2s",
          }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0 }}>🔍</span>
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
                color: "var(--text)", fontSize: 13, height: 28,
              }}
            />
            {searchValue && (
              <button onClick={() => { onSearchChange?.(""); inputRef.current?.focus(); }}
                style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer", padding: 0, flexShrink: 0 }}>
                ✕
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
