"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [daetaUnread, setDaetaUnread] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [matchModal, setMatchModal] = useState<{ matchId: string } | null>(null);

  const shownMatches = useRef<Set<string>>(new Set());
  const shownPending = useRef<Set<string>>(new Set());
  const [toast, setToast] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);

  const checkUnread = useCallback(async (uid: string) => {
    try {
      const [workerRes, employerRes] = await Promise.all([
        supabase.from("matches").select("id").eq("worker_id", uid).eq("worker_left", false).in("progress_status", ["accepted", "interviewing", "hired"]),
        supabase.from("matches").select("id").eq("employer_id", uid).eq("employer_left", false).in("progress_status", ["accepted", "interviewing", "hired"]),
      ]);
      const activeMatchIds = [
        ...(workerRes.data || []).map((m: { id: string }) => m.id),
        ...(employerRes.data || []).map((m: { id: string }) => m.id),
      ];
      if (activeMatchIds.length === 0) {
        setUnreadCount(0);
        return;
      }
      const { count } = await supabase
        .from("chats")
        .select("*", { count: "exact", head: true })
        .eq("receiver_id", uid)
        .eq("is_read", false)
        .in("match_id", activeMatchIds);
      setUnreadCount(count || 0);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const checkDaetaUnread = useCallback(async (uid: string) => {
    try {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("type", "daeta")
        .eq("is_read", false);
      setDaetaUnread(count || 0);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  };

  // 러브콜 + 매칭 폴링 - 5초마다 확인
  useEffect(() => {
    let interval: any = null;
    const startPolling = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;

      // 초기 상태 로드 (처음엔 알림 안 띄움)
      const { data: existing } = await supabase
        .from("matches").select("id, progress_status")
        .or(`worker_id.eq.${uid},employer_id.eq.${uid}`);
      (existing || []).forEach((m: { id: string }) => {
        shownMatches.current.add(m.id);
        shownPending.current.add(m.id);
      });

      const checkUpdates = async () => {
        if (document.hidden) return; // 백그라운드 탭에서는 폴링 정지
        const since = new Date(Date.now() - 35000).toISOString();

        // 새 지원/채용제안 받은 것 (pending)
        const { data: newPending } = await supabase
          .from("matches").select("id, progress_status, worker_id, employer_id, initiated_by")
          .eq("progress_status", "pending")
          .or(`worker_id.eq.${uid},employer_id.eq.${uid}`)
          .gte("created_at", since);

        type MatchRow = { id: string; initiated_by: string };
        (newPending || []).forEach((m: MatchRow) => {
          if (!shownPending.current.has(m.id)) {
            shownPending.current.add(m.id);
            if (m.initiated_by !== uid) {
              showToast("📥 새 지원이 왔어요! MY에서 확인해보세요");
            } else {
              showToast("📤 지원을 완료했어요! 수락을 기다려요");
            }
          }
        });

        // 새 매칭 성사 (accepted)
        const { data: newAccepted } = await supabase
          .from("matches").select("id, progress_status, worker_id, employer_id")
          .eq("progress_status", "accepted")
          .or(`worker_id.eq.${uid},employer_id.eq.${uid}`)
          .gte("matched_at", since);

        (newAccepted || []).forEach((m: { id: string }) => {
          if (!shownMatches.current.has(m.id)) {
            shownMatches.current.add(m.id);
            setMatchModal({ matchId: m.id });
          }
        });
      };

      // 채팅 뱃지는 Realtime이 담당 — 매칭 토스트만 저빈도 폴링 (P5: 5초→30초)
      interval = setInterval(checkUpdates, 30000);
    };
    startPolling();
    return () => { if (interval) clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }

    let active = true;
    let chatChannel: ReturnType<typeof supabase.channel> | null = null;

    const initRealtime = async () => {
      // 새 채팅 실시간 감지
      const channelName = `chat-badge-${userId}-${Math.random().toString(36).substring(2, 9)}`;
      const newChannel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chats", filter: `receiver_id=eq.${userId}` },
          () => {
            if (active) checkUnread(userId);
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "chats", filter: `receiver_id=eq.${userId}` },
          () => {
            if (active) checkUnread(userId);
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          () => {
            if (active) checkDaetaUnread(userId);
          }
        );

      newChannel.subscribe();
      chatChannel = newChannel;
    };

    initRealtime();

    return () => {
      active = false;
      if (chatChannel) {
        supabase.removeChannel(chatChannel);
      }
    };
  }, [userId, checkUnread, checkDaetaUnread]);

  useEffect(() => {
    let lastY = 0;
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const diff = currentY - lastY;
        if (currentY > 50 && diff > 30) {
          setHidden(true);
        } else if (diff < -30 || currentY < 50) {
          setHidden(false);
        }
        lastY = currentY;
        ticking = false;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isHiddenPath = ["/login", "/signup", "/auth", "/", "/chat/", "/paz", "/sudoku"].some(p => pathname === p || (p !== "/" && pathname?.startsWith(p)));
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [userType, setUserType] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async (res) => {
      const session = res.data.session;
      setIsLoggedIn(!!session);
      if (session) {
        const uid = session.user.id;
        setUserId(uid);
        const { data } = await supabase.from("users").select("user_type").eq("id", uid).single();
        setUserType(data?.user_type || null);
        await checkUnread(uid);
        await checkDaetaUnread(uid);
      } else {
        setUserId(null);
      }
    });
  }, [pathname, checkUnread, checkDaetaUnread]);

  const handleTabClick = (path: string) => {
    const protectedPaths = ["/feed", "/chat", "/mypage", "/personality", "/interview", "/myteam", "/daeta"];
    const isProtected = protectedPaths.some(p => path.startsWith(p));
    // null이면 아직 세션 확인 중 - 잠깐 기다렸다 재시도
    if (isProtected && isLoggedIn === null) {
      supabase.auth.getSession().then((res) => {
        const session = res.data.session;
        setIsLoggedIn(!!session);
        if (!session) {
          localStorage.setItem("login_redirect", path);
          router.push("/login");
        } else {
          router.push(path);
        }
      });
      return;
    }
    if (isProtected && !isLoggedIn) {
      localStorage.setItem("login_redirect", path);
      router.push("/login");
      return;
    }
    router.push(path);
  };

  if (isHiddenPath || !isLoggedIn) return null;
  // 4탭 구조: [대타] [홈🏠 (중앙 포인트)] [채팅] [MY]
  // 피드 탭은 콜드스타트 단계라 네비에서 제거 — 밀도 낮은 전체피드 탐색은 "이 앱 죽었나"라는 인상만 줌.
  // /feed 페이지·소식 등록 자체는 그대로 남아있고(각자 프로필에서 접근), 동네 밀도 생기면 재노출 검토
  const tabs = [
    { icon: "ti-bolt", label: "대타", path: "/daeta", active: pathname.startsWith("/daeta"), isDaeta: true, badge: daetaUnread },
    { icon: "ti-home", label: "홈", path: "/myteam", active: pathname === "/" || pathname.startsWith("/myteam") || pathname.startsWith("/explore") || pathname.startsWith("/job") || pathname.startsWith("/worker/"), isHome: true },
    { icon: "ti-message-2", label: "채팅", path: "/chat", active: pathname.startsWith("/chat"), badge: unreadCount },
    { icon: "ti-user-circle", label: "MY", path: "/mypage", active: pathname.startsWith("/mypage") || pathname.startsWith("/profile") || pathname.startsWith("/personality") || pathname.startsWith("/result") || pathname.startsWith("/interview") },
  ];

  return (
    <>
      {/* 토스트 알림 */}
      {toast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "var(--nav-bg)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 13, padding: "12px 20px", borderRadius: 20, zIndex: 300, whiteSpace: "nowrap", boxShadow: "var(--shadow-elevate)", maxWidth: "90vw", textAlign: "center" }}>
          {toast}
        </div>
      )}

      {/* 매칭 성사 모달 */}
      {matchModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--surface)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 360, textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
            <h3 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 8px" }}>매칭 성사!</h3>
            <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 24px", lineHeight: 1.6 }}>
              대타 확정까지 빠르게 이야기해요
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => { setMatchModal(null); router.push(`/chat/${matchModal.matchId}`); }}
                style={{ width: "100%", background: "var(--primary)", border: "none", color: "#fff", fontWeight: 700, padding: 14, borderRadius: 14, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <i className="ti ti-message-circle" aria-hidden="true" /> 바로 채팅하기
              </button>
              <button onClick={() => { setMatchModal(null); router.push(`/pre-meet/${matchModal.matchId}`); }}
                style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)", fontWeight: 600, padding: 12, borderRadius: 14, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <i className="ti ti-robot" aria-hidden="true" /> AI 사전미팅으로 먼저 알아보기 (선택)
              </button>
              <button onClick={() => setMatchModal(null)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: 8 }}>
                나중에
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
        transform: hidden ? "translateY(100%)" : "translateY(0)",
        transition: "transform 0.3s ease",
        display: "flex", justifyContent: "center",
        background: "var(--nav-bg)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid var(--nav-border)",
      }}>
        <div style={{ width: "100%", maxWidth: 480 }}>
          <div style={{ display: "flex", justifyContent: "space-around", alignItems: "flex-end", padding: "8px 4px calc(8px + env(safe-area-inset-bottom))" }}>
            {tabs.map(tab => {
              const isDaeta = (tab as any).isDaeta;
              const isHome = (tab as any).isHome;
              const activeColor = isDaeta ? "#fb923c" : "#a78bfa";
              const barColor = isDaeta ? "#fb923c" : "var(--primary)";

              if (isHome) {
                return (
                  <button key={tab.label} onClick={() => handleTabClick(tab.path)}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                      background: "none", border: "none", cursor: "pointer",
                      padding: "0 6px 4px", position: "relative", flex: 1, marginTop: -14,
                    }}>
                    <div style={{
                      position: "relative",
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: tab.active
                        ? "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)"
                        : "linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(109,40,217,0.1) 100%)",
                      border: tab.active ? "2px solid rgba(255,255,255,0.4)" : "1.5px solid rgba(139,92,246,0.3)",
                      boxShadow: tab.active ? "0 6px 18px rgba(139,92,246,0.45)" : "0 4px 12px rgba(0,0,0,0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.25s ease",
                    }}>
                      <i className={`ti ${tab.icon}`} style={{ fontSize: 22, color: tab.active ? "#ffffff" : "#c4b5fd" }} aria-hidden="true" />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 800, color: tab.active ? "var(--primary, #8b5cf6)" : "var(--text-muted)", transition: "color 0.2s" }}>
                      {tab.label}
                    </span>
                  </button>
                );
              }

              return (
                <button key={tab.label} onClick={() => handleTabClick(tab.path)}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: "8px 10px 6px", position: "relative", flex: 1, transition: "opacity 0.15s" }}>
                  {/* 상단 액티브 인디케이터 바 */}
                  <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: tab.active ? 20 : 0, height: 2, borderRadius: 2, background: barColor, transition: "width 0.25s ease" }} />
                  <div style={{ position: "relative" }}>
                    <i className={`ti ${tab.icon}`} style={{ fontSize: 22, color: tab.active ? activeColor : isDaeta ? "#fb923c" : "var(--text-muted)", display: "block", transition: "color 0.2s" }} aria-hidden="true" />
                    {(tab as any).badge > 0 && (
                      <span style={{ position: "absolute", top: -3, right: -8, background: "var(--danger)", color: "#fff", fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 10, minWidth: 16, textAlign: "center", border: "1.5px solid var(--nav-bg)" }}>
                        {(tab as any).badge > 99 ? "99+" : (tab as any).badge}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: tab.active ? 800 : 500, color: tab.active ? activeColor : isDaeta ? "#fb923c" : "var(--text-muted)", transition: "color 0.2s" }}>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
