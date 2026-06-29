"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
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
        .from("matches").select("id, status")
        .or(`worker_id.eq.${uid},employer_id.eq.${uid}`);
      (existing || []).forEach(m => {
        shownMatches.current.add(m.id);
        shownPending.current.add(m.id);
      });

      const checkUpdates = async () => {
        const since = new Date(Date.now() - 8000).toISOString();

        // 새 러브콜 받은 것 (pending)
        const { data: newPending } = await supabase
          .from("matches").select("id, status, worker_id, employer_id, initiated_by")
          .eq("status", "pending")
          .or(`worker_id.eq.${uid},employer_id.eq.${uid}`)
          .gte("created_at", since);

        (newPending || []).forEach(m => {
          if (!shownPending.current.has(m.id)) {
            shownPending.current.add(m.id);
            // 받은 사람에게 알림
            if (m.initiated_by !== uid) {
              showToast("💌 새 러브콜이 왔어요! MY에서 확인해보세요");
            } else {
              showToast("💌 러브콜을 보냈어요! 상대방의 수락을 기다려요");
            }
          }
        });

        // 새 매칭 성사 (accepted)
        const { data: newAccepted } = await supabase
          .from("matches").select("id, status, worker_id, employer_id")
          .eq("status", "accepted")
          .or(`worker_id.eq.${uid},employer_id.eq.${uid}`)
          .gte("matched_at", since);

        (newAccepted || []).forEach(m => {
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
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;

      // 내가 나가지 않은 채팅방의 match_id 목록
      const [workerRes, employerRes] = await Promise.all([
        supabase.from("matches").select("id").eq("worker_id", uid).eq("worker_left", false).in("status", ["accepted", "interviewing", "hired"]),
        supabase.from("matches").select("id").eq("employer_id", uid).eq("employer_left", false).in("status", ["accepted", "interviewing", "hired"]),
      ]);
      const activeMatchIds = [
        ...(workerRes.data || []).map(m => m.id),
        ...(employerRes.data || []).map(m => m.id),
      ];

      if (activeMatchIds.length === 0) { setUnreadCount(0); return; }

      const { count } = await supabase
        .from("chats")
        .select("*", { count: "exact", head: true })
        .eq("receiver_id", uid)
        .eq("is_read", false)
        .in("match_id", activeMatchIds);
      setUnreadCount(count || 0);
    };
    check();
  }, [pathname]);

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

  const isHiddenPath = ["/login", "/signup", "/auth", "/", "/chat/", "/paz", "/sudoku", "/daeta"].some(p => pathname === p || (p !== "/" && pathname?.startsWith(p)));
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });
  }, [pathname]);

  const handleTabClick = (path: string) => {
    const protectedPaths = ["/chat", "/mypage", "/personality", "/interview"];
    const isProtected = protectedPaths.some(p => path.startsWith(p));
    // null이면 아직 세션 확인 중 - 잠깐 기다렸다 재시도
    if (isProtected && isLoggedIn === null) {
      supabase.auth.getSession().then(({ data: { session } }) => {
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
    { icon: "ti-message-2", label: "채팅", path: "/chat", active: pathname.startsWith("/chat"), badge: unreadCount },
    { icon: "ti-brain", label: "성향분석", path: "/personality", active: pathname.startsWith("/personality") || pathname.startsWith("/interview") || pathname.startsWith("/result") },
    { icon: "ti-user-circle", label: "MY", path: "/mypage", active: pathname.startsWith("/mypage") || pathname.startsWith("/profile") },
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
        background: "rgba(24,24,27,0.97)", backdropFilter: "blur(12px)",
        borderTop: "1px solid var(--border)",
      }}>
        <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", padding: "10px 8px 14px", maxWidth: 480, margin: "0 auto" }}>
          {tabs.map(tab => (
            <button key={tab.label} onClick={() => handleTabClick(tab.path)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: tab.active ? "rgba(139,92,246,0.13)" : "none", border: "none", cursor: "pointer", borderRadius: 14, padding: "8px 16px", position: "relative", transition: "background 0.2s" }}>
              <div style={{ position: "relative" }}>
                <i className={`ti ${tab.icon}`} style={{ fontSize: 22, color: tab.active ? "#8b5cf6" : "#52525b", display: "block" }} aria-hidden="true" />
                {(tab as any).badge > 0 && (
                  <span style={{ position: "absolute", top: -4, right: -8, background: "#ec4899", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 4px", borderRadius: 10, minWidth: 16, textAlign: "center" }}>
                    {(tab as any).badge > 99 ? "99+" : (tab as any).badge}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 10, fontWeight: tab.active ? 500 : 400, color: tab.active ? "#8b5cf6" : "#52525b" }}>{tab.label}</span>
            </button>
          ))}
        </div>
        </div>
      </div>
    </>
  );
}
