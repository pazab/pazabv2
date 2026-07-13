"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
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
        const since = new Date(Date.now() - 8000).toISOString();

        // 새 러브콜 받은 것 (pending)
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
              showToast("💌 새 러브콜이 왔어요! MY에서 확인해보세요");
            } else {
              showToast("💌 러브콜을 보냈어요! 상대방의 수락을 기다려요");
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

      interval = setInterval(checkUpdates, 5000);
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
  }, [userId, checkUnread]);

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
      } else {
        setUserId(null);
      }
    });
  }, [pathname, checkUnread]);

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
  const tabs = [
    { icon: "ti-compass", label: "탐색", path: "/explore", active: pathname === "/" || pathname.startsWith("/explore") || pathname.startsWith("/job") || pathname.startsWith("/worker/") },
    { icon: "ti-bolt", label: "대타", path: "/daeta", active: pathname.startsWith("/daeta") },
    { icon: "ti-calendar-event", label: "근태", path: "/myteam", active: pathname.startsWith("/myteam"), center: true },
    { icon: "ti-message-2", label: "채팅", path: "/chat", active: pathname.startsWith("/chat"), badge: unreadCount },
    { icon: "ti-user-circle", label: "MY", path: "/mypage", active: pathname.startsWith("/mypage") || pathname.startsWith("/profile") || pathname.startsWith("/personality") || pathname.startsWith("/result") || pathname.startsWith("/interview") },
  ];

  return (
    <>
      {/* 토스트 알림 */}
      {toast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "rgba(24,24,27,0.97)", border: "1px solid var(--border)", color: "#fff", fontSize: 13, padding: "12px 20px", borderRadius: 20, zIndex: 300, whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(0,0,0,0.4)", maxWidth: "90vw", textAlign: "center" }}>
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
              본격적인 채팅 전에<br />AI 사전미팅으로 먼저 알아가볼까요? 😊
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => { setMatchModal(null); router.push(`/pre-meet/${matchModal.matchId}`); }}
                style={{ width: "100%", background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", border: "none", color: "#fff", fontWeight: 700, padding: 14, borderRadius: 14, fontSize: 15, cursor: "pointer" }}>
                🤖 AI 사전미팅 하기
              </button>
              <button onClick={() => { setMatchModal(null); router.push(`/chat/${matchModal.matchId}`); }}
                style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", fontWeight: 600, padding: 12, borderRadius: 14, fontSize: 14, cursor: "pointer" }}>
                💬 바로 채팅하기
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
        background: "rgba(24,24,27,0.96)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid var(--border)",
      }}>
        <div style={{ width: "100%", maxWidth: 480 }}>
          <div style={{ display: "flex", justifyContent: "space-around", alignItems: "flex-end", padding: "8px 4px calc(8px + env(safe-area-inset-bottom))" }}>
            {tabs.map(tab => {
              const isCenter = (tab as any).center;
              return isCenter ? (
                <button key={tab.label} onClick={() => handleTabClick(tab.path)}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", position: "relative", padding: "0 10px", marginBottom: 10, marginTop: -20, flexShrink: 0 }}>
                  <div style={{
                    width: 54, height: 54, borderRadius: "50%",
                    background: "linear-gradient(135deg, #7c3aed, #ec4899)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: tab.active
                      ? "0 0 0 3px rgba(139,92,246,0.35), 0 6px 20px rgba(139,92,246,0.5)"
                      : "0 4px 16px rgba(139,92,246,0.4)",
                    border: "3px solid rgba(24,24,27,0.96)",
                    transition: "box-shadow 0.2s",
                  }}>
                    <i className={`ti ${tab.icon}`} style={{ fontSize: 24, color: "#fff" }} aria-hidden="true" />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: tab.active ? "#c4b5fd" : "#8b5cf6" }}>{tab.label}</span>
                </button>
              ) : (
                <button key={tab.label} onClick={() => handleTabClick(tab.path)}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: "8px 14px 6px", position: "relative", flex: 1, transition: "opacity 0.15s" }}>
                  {/* 상단 액티브 인디케이터 바 */}
                  <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: tab.active ? 20 : 0, height: 2, borderRadius: 2, background: "linear-gradient(90deg, #8b5cf6, #ec4899)", transition: "width 0.25s ease" }} />
                  <div style={{ position: "relative" }}>
                    <i className={`ti ${tab.icon}`} style={{ fontSize: 22, color: tab.active ? "#a78bfa" : "#52525b", display: "block", transition: "color 0.2s" }} aria-hidden="true" />
                    {(tab as any).badge > 0 && (
                      <span style={{ position: "absolute", top: -3, right: -8, background: "linear-gradient(135deg, #ec4899, #f43f5e)", color: "#fff", fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 10, minWidth: 16, textAlign: "center", border: "1.5px solid rgba(24,24,27,0.96)" }}>
                        {(tab as any).badge > 99 ? "99+" : (tab as any).badge}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: tab.active ? 700 : 500, color: tab.active ? "#a78bfa" : "#52525b", transition: "color 0.2s" }}>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
