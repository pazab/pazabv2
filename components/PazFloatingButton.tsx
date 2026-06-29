"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { subscribePush } from "@/lib/usePush";

const PEEK = 18;
const BTN = 52;

const THEMES: Record<string, { from: string; to: string }> = {
  purple: { from: "#7c3aed", to: "#ec4899" },
  blue: { from: "#0ea5e9", to: "#6366f1" },
  green: { from: "#10b981", to: "#0ea5e9" },
  pink: { from: "#ec4899", to: "#f43f5e" },
  gold: { from: "#f59e0b", to: "#ef4444" },
};

interface Bubble {
  id: number;
  text: string;
  type: "user" | "paz" | "confirm" | "status";
  action?: string;
}

export default function PazFloatingButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);
  const [pazAvatar, setPazAvatar] = useState("🤖");
  const [pazPhoto, setPazPhoto] = useState<string | null>(null);
  const [themeFrom, setThemeFrom] = useState("#7c3aed");
  const [themeTo, setThemeTo] = useState("#ec4899");

  // 음성/UI 상태
  const [isListening, setIsListening] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [loading, setLoading] = useState(false);

  // 드래그
  const [pos, setPos] = useState({ x: -1, y: -1 });
  const [isDragging, setIsDragging] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const hasDragged = useRef(false);
  const pressTimer = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const bubbleId = useRef(0);
  const userRef = useRef<any>(null);


  useEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const defaultPos = { x: vw - BTN - 20, y: vh - BTN - 100 };
    const saved = localStorage.getItem("paz_btn_pos_ratio");
    if (saved) {
      // 비율로 저장된 위치를 현재 화면 크기에 맞게 변환
      const ratio = JSON.parse(saved);
      const x = Math.min(Math.max(Math.round(ratio.rx * vw), 0), vw - BTN);
      const y = Math.min(Math.max(Math.round(ratio.ry * vh), 0), vh - BTN);
      setPos({ x, y });
      if (x < PEEK || x > vw - BTN - PEEK) setPeeking(true);
    } else {
      setPos(defaultPos);
    }

    // 화면 크기 변경 시 비율 기반으로 위치 재계산
    const handleResize = () => {
      const nvw = window.innerWidth;
      const nvh = window.innerHeight;
      const r = localStorage.getItem("paz_btn_pos_ratio");
      if (r) {
        const ratio = JSON.parse(r);
        const x = Math.min(Math.max(Math.round(ratio.rx * nvw), 0), nvw - BTN);
        const y = Math.min(Math.max(Math.round(ratio.ry * nvh), 0), nvh - BTN);
        setPos({ x, y });
      } else {
        setPos({ x: nvw - BTN - 20, y: nvh - BTN - 100 });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setLoggedIn(!!data.user);
      if (data.user) {
        userRef.current = data.user;
        loadPazSettings(data.user.id);
        // 푸시 구독 (이미 구독된 경우 스킵)
        if (typeof window !== "undefined" && "Notification" in window) {
          if (Notification.permission === "default") {
            setTimeout(() => subscribePush(data.user!.id), 3000);
          } else if (Notification.permission === "granted") {
            subscribePush(data.user.id);
          }
        }
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setLoggedIn(!!session);
      if (session) {
        userRef.current = session.user;
        loadPazSettings(session.user.id);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadPazSettings(userId: string) {
    const { data } = await supabase.from("users")
      .select("paz_avatar, paz_photo_url, paz_theme, user_type")
      .eq("id", userId).maybeSingle();
    if (data) {
      setPazAvatar(data.paz_avatar || "🤖");
      setPazPhoto(data.paz_photo_url || null);
      const t = THEMES[data.paz_theme || "purple"] || THEMES.purple;
      setThemeFrom(t.from);
      setThemeTo(t.to);
      // userType 저장
      if (userRef.current) (userRef.current as any)._userType = data.user_type;
    }
  }

  // 띠링 소리
  function playBeep() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  }

  // 말풍선 추가 (최대 2개 유지)
  function addBubble(text: string, type: Bubble["type"], action?: string) {
    const id = ++bubbleId.current;
    setBubbles(prev => {
      const next = [...prev, { id, text, type, action }];
      return next.slice(-2); // 최대 2개
    });
    return id;
  }

  function removeBubble(id: number) {
    setBubbles(prev => prev.filter(b => b.id !== id));
  }

  function clearBubbles() {
    setBubbles([]);
  }

  // 명령 vs 대화 분류 + 실행
  function matchIntent(text: string, userType?: string): { target: string; reply: string } | null {
    const t = text.replace(/\s/g, "").toLowerCase();

    // 공고 등록 (사장님) vs 공고 보기 (알바생) 구분
    const isJobRegisterIntent = ["공고올려", "공고등록", "공고내줘", "알바뽑", "직원뽑", "채용등록", "구인", "뽑을래", "등록해줘", "공고써"].some(k => t.includes(k));
    const isJobViewIntent = ["공고보기", "공고찾", "알바찾", "구직", "일자리찾", "탐색", "둘러", "검색"].some(k => t.includes(k));

    // "공고" 단독은 userType으로 구분
    const isJobGeneric = t.includes("공고") && !isJobRegisterIntent && !isJobViewIntent;

    if (isJobRegisterIntent || (isJobGeneric && (userType === "employer" || userType === "both"))) {
      return { target: "/employer/register", reply: "공고 등록 페이지로 이동할게요! 📋" };
    }
    if (isJobViewIntent || (isJobGeneric && userType === "worker")) {
      return { target: "/explore", reply: "탐색 페이지로 이동할게요! 🔍" };
    }
    if (isJobGeneric) {
      // userType 모를 때 → 탐색으로
      return { target: "/explore", reply: "공고 탐색 페이지로 이동할게요! 🔍" };
    }

    const rules: { keywords: string[]; target: string; reply: string }[] = [
      { keywords: ["채팅", "메시지", "대화목록", "채팅목록", "채팅열어"], target: "/chat", reply: "채팅 목록 열게요! 💬" },
      { keywords: ["탐색", "알바찾", "구직", "일자리", "둘러", "검색"], target: "/explore", reply: "탐색 페이지로 이동할게요! 🔍" },
      { keywords: ["성향", "분석", "인터뷰", "hexaco", "mbti"], target: "/personality", reply: "성향 분석 페이지로 이동할게요! 🔬" },
      { keywords: ["마이페이지", "내페이지", "my페이지", "프로필"], target: "/mypage", reply: "MY 페이지로 이동할게요! 👤" },
      { keywords: ["설정", "세팅", "setting"], target: "/settings", reply: "설정 열게요! ⚙️" },
      { keywords: ["paz", "파즈", "대화해", "상담", "물어볼", "코치"], target: "/paz", reply: "PAZ 대화방 열게요! 🤖" },
      { keywords: ["급여", "월급", "명세서", "임금", "페이", "정산"], target: "/payslip/list", reply: "급여 명세서 페이지로 이동할게요! 💰" },
      { keywords: ["팀관리", "팀원", "소속", "직원관리", "팀소속"], target: "/myteam", reply: "팀·소속 관리로 이동할게요! 👥" },
      { keywords: ["초대코드", "직원초대", "초대", "코드발급"], target: "/invite", reply: "직원 초대 코드 페이지로 이동할게요! 🎫" },
      { keywords: ["계약서", "근로계약", "계약"], target: "/contract", reply: "근로계약서 페이지로 이동할게요! 📄" },
    ];

    for (const rule of rules) {
      if (rule.keywords.some(k => t.includes(k))) {
        return { target: rule.target, reply: rule.reply };
      }
    }
    return null;
  }

  function handleVoiceInput(text: string) {
    const matched = matchIntent(text, (userRef.current as any)?._userType);
    if (matched) {
      addBubble(matched.reply, "paz");
      setTimeout(() => {
        clearBubbles();
        if (pathname?.startsWith("/paz") && !pathname?.includes("/settings")) {
          // 이미 PAZ 페이지에 있으면 이동 없이 이벤트만 발생
          window.dispatchEvent(new CustomEvent("paz-input", { detail: { text: matched.target === "/paz" ? text : "" } }));
        } else {
          router.push(matched.target);
        }
      }, 800);
    } else {
      addBubble("PAZ에서 대화할게요! 🤖", "paz");
      setTimeout(() => {
        clearBubbles();
        if (pathname?.startsWith("/paz") && !pathname?.includes("/settings")) {
          // 이미 PAZ 페이지에 있으면 이동 없이 바로 입력
          window.dispatchEvent(new CustomEvent("paz-input", { detail: { text } }));
        } else {
          router.push(`/paz?q=${encodeURIComponent(text)}`);
        }
      }, 800);
    }
  }

  // 음성 인식 시작
  function startListening() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { addBubble("크롬에서 사용해주세요", "status"); return; }

    playBeep();
    clearBubbles();
    setIsListening(true);
    addBubble("듣고 있어요...", "status");

    const recognition = new SR();
    recognition.lang = "ko-KR";
    recognition.continuous = false;
    recognition.interimResults = true;
    let finalText = "";
    let statusId = bubbleId.current;

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText = t;
        else interim = t;
      }
      // 상태 말풍선 → 인식 중 텍스트로 업데이트
      setBubbles(prev => prev.map(b =>
        b.id === statusId ? { ...b, text: finalText || interim || "듣고 있어요..." } : b
      ));
    };

    recognition.onend = async () => {
      setIsListening(false);
      if (finalText.trim()) {
        // 사용자 말풍선으로 바꾸기
        setBubbles(prev => prev.map(b =>
          b.id === statusId ? { ...b, type: "user", text: finalText } : b
        ));
        await handleVoiceInput(finalText.trim());
      } else {
        clearBubbles();
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      clearBubbles();
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  // 드래그 + 꾹 누르기
  function snapPosition(x: number, y: number) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clampedY = Math.max(80, Math.min(y, vh - BTN - 80));
    const SNAP = 40;
    let finalX = x, isPeeking = false;
    if (x < SNAP) { finalX = -BTN + PEEK; isPeeking = true; }
    else if (x > vw - BTN - SNAP) { finalX = vw - PEEK; isPeeking = true; }
    else finalX = Math.max(8, Math.min(x, vw - BTN - 8));
    return { x: finalX, y: clampedY, isPeeking };
  }

  function onPointerDown(e: React.PointerEvent) {
    hasDragged.current = false;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    setIsDragging(true);
    setPeeking(false);
    setShowMenu(false);

    // 꾹 누르기 0.6초
    pressTimer.current = setTimeout(() => {
      if (!hasDragged.current) {
        setShowMenu(true);
        setIsDragging(false);
      }
    }, 600);

    const onMove = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - (pos.x + dragOffset.current.x)) > 5 ||
          Math.abs(ev.clientY - (pos.y + dragOffset.current.y)) > 5) {
        hasDragged.current = true;
        clearTimeout(pressTimer.current);
      }
      setPos({ x: ev.clientX - dragOffset.current.x, y: ev.clientY - dragOffset.current.y });
    };
    const onUp = () => {
      clearTimeout(pressTimer.current);
      setIsDragging(false);
      setPos(prev => {
        const { x, y, isPeeking } = snapPosition(prev.x, prev.y);
        setPeeking(isPeeking);
        localStorage.setItem("paz_btn_pos_ratio", JSON.stringify({ rx: x/window.innerWidth, ry: y/window.innerHeight }));
        return { x, y };
      });
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function handleClick() {
    if (hasDragged.current || showMenu) return;
    if (peeking) {
      const vw = window.innerWidth;
      const newPos = { x: pos.x < 0 ? 20 : vw - BTN - 20, y: pos.y };
      setPos(newPos);
      setPeeking(false);
      localStorage.setItem("paz_btn_pos_ratio", JSON.stringify({ rx: newPos.x/window.innerWidth, ry: newPos.y/window.innerHeight }));
      return;
    }
    if (isListening) { stopListening(); return; }
    startListening();
  }

  const hidden = ["/login", "/signup", "/auth", "/sudoku", "/daeta"].some(p => pathname?.startsWith(p)) || pathname === "/";
  if (hidden || !loggedIn || pos.x === -1) return null;

  const pulseColor = isListening ? "#ef4444" : themeFrom;
  const btnBg = isListening ? "linear-gradient(135deg, #ef4444, #dc2626)" : `linear-gradient(135deg, ${themeFrom}, ${themeTo})`;
  const imgSize = Math.round(BTN * 0.65);

  const currentMode = typeof window !== "undefined" ? localStorage.getItem("current_mode") : null;
  const userType = (userRef.current as any)?._userType;
  const isEmployer = userType === "employer" || (userType === "both" && currentMode === "employer");

  const menuItems = [
    { icon: "ti-robot", label: "PAZ 대화방", sub: isEmployer ? "AI HR 에이전트" : "AI 커리어 코치", path: "/paz", color: "rgba(139,92,246,0.15)", iconColor: "#c4b5fd" },
    isEmployer
      ? { icon: "ti-clipboard-plus", label: "공고 등록", sub: "알바생 구인하기", path: "/employer/register", color: "rgba(236,72,153,0.15)", iconColor: "#f9a8d4" }
      : { icon: "ti-user-circle", label: "내 프로필", sub: "구직 조건 설정", path: "/worker/profile", color: "rgba(236,72,153,0.15)", iconColor: "#f9a8d4" },
    { icon: "ti-message-2", label: "채팅 목록", sub: "매칭된 대화", path: "/chat", color: "rgba(16,185,129,0.15)", iconColor: "#6ee7b7" },
    { icon: "ti-compass", label: "탐색", sub: isEmployer ? "구직자 찾기" : "공고 찾기", path: "/explore", color: "rgba(14,165,233,0.15)", iconColor: "#7dd3fc" },
    { icon: "ti-settings", label: "PAZ 설정", sub: "말투·스타일 변경", path: "/paz/settings", color: "rgba(113,113,122,0.15)", iconColor: "#a1a1aa", divider: true },
  ];

  return (
    <>
      {/* 클릭 외부 닫기 */}
      {showMenu && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setShowMenu(false)} />
      )}

      {/* 말풍선들 */}
      {bubbles.length > 0 && (
        <div style={{
          position: "fixed",
          left: Math.max(8, Math.min(pos.x - 80, window.innerWidth - 200)),
          top: pos.y - (bubbles.length * 52) - 12,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          zIndex: 101,
          pointerEvents: "none",
        }}>
          {bubbles.map(bubble => (
            <div key={bubble.id} style={{
              background: bubble.type === "user" ? `linear-gradient(135deg, ${themeFrom}, ${themeFrom}cc)` :
                          bubble.type === "confirm" ? "#1e1e2e" : "rgba(30,30,46,0.95)",
              color: "#fff",
              borderRadius: bubble.type === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 500,
              maxWidth: 200,
              backdropFilter: "blur(10px)",
              border: `1px solid ${bubble.type === "confirm" ? themeFrom : "rgba(255,255,255,0.1)"}`,
              boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              pointerEvents: bubble.type === "confirm" ? "auto" : "none",
              display: "flex",
              alignItems: "center",
              gap: 6,
              animation: "bubbleIn 0.2s ease-out",
            }}>
              {bubble.type === "status" && (
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", flexShrink: 0, animation: "pazPulse1 1s ease-in-out infinite" }} />
              )}
              {loading && bubble.type === "paz" && "⏳ "}
              {bubble.text}
              {bubble.type === "confirm" && (
                <div style={{ display: "flex", gap: 6, marginTop: 4, pointerEvents: "auto" }}>
                  <button onClick={() => {
                    const userBubble = bubbles.find(b => b.type === "user");
                    const pazBubble = bubbles.find(b => b.type === "paz");
                    const msg = userBubble?.text || pazBubble?.text || "";
                    clearBubbles();
                    router.push(`/paz${msg ? `?q=${encodeURIComponent(msg)}` : ""}`);
                  }}
                    style={{ background: themeFrom, border: "none", borderRadius: 8, padding: "3px 10px", color: "#fff", fontSize: 12, cursor: "pointer" }}>✅</button>
                  <button onClick={() => clearBubbles()}
                    style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, padding: "3px 10px", color: "#fff", fontSize: 12, cursor: "pointer" }}>❌</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 꾹 누르기 메뉴 */}
      {showMenu && (
        <div style={{
          position: "fixed",
          right: window.innerWidth - pos.x - BTN,
          bottom: window.innerHeight - pos.y + 12,
          background: "rgba(15,15,20,0.97)",
          borderRadius: 20,
          border: "1px solid rgba(139,92,246,0.25)",
          overflow: "hidden",
          zIndex: 102,
          backdropFilter: "blur(20px)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(139,92,246,0.1)",
          minWidth: 200,
        }}>
          {menuItems.map((item, i) => (
            <div key={i}>
              {item.divider && <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "2px 0" }} />}
              <button
                onClick={() => {
                  setShowMenu(false);
                  if (item.path === "/paz" && pathname?.startsWith("/paz") && !pathname?.includes("/settings")) return;
                  router.push(item.path);
                }}
                style={{
                  width: "100%", background: "none", border: "none",
                  padding: "12px 16px", cursor: "pointer", textAlign: "left",
                  display: "flex", alignItems: "center", gap: 12,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(139,92,246,0.08)")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}
              >
                <div style={{ width: 32, height: 32, borderRadius: 10, background: item.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <i className={`ti ${item.icon}`} style={{ fontSize: 16, color: item.iconColor }} aria-hidden="true" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#e4e4e7" }}>{item.label}</div>
                  <div style={{ fontSize: 10, color: "#71717a", marginTop: 1 }}>{item.sub}</div>
                </div>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 메인 버튼 */}
      <button
        onClick={handleClick}
        onPointerDown={onPointerDown}
        onContextMenu={e => e.preventDefault()}
        style={{
          position: "fixed",
          left: pos.x,
          top: pos.y,
          width: BTN,
          height: BTN,
          borderRadius: "50%",
          background: isListening ? "#ffffff" : "linear-gradient(135deg, #8b5cf6, #ec4899)",
          border: "none",
          cursor: isDragging ? "grabbing" : peeking ? "pointer" : "grab",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: isListening
            ? "0 0 32px rgba(255,255,255,0.4), 0 0 60px rgba(255,255,255,0.15)"
            : "0 0 28px rgba(139,92,246,0.6)",
          zIndex: 100,
          overflow: "visible",
          transition: isDragging ? "none" : "left 0.25s cubic-bezier(.34,1.56,.64,1), top 0.25s cubic-bezier(.34,1.56,.64,1), background 0.3s ease, box-shadow 0.3s",
          userSelect: "none",
          WebkitUserSelect: "none",
          touchAction: "none",
          opacity: peeking ? 0.75 : 1,
          WebkitTouchCallout: "none",
          animation: isDragging || isListening ? "none" : "morphBtn 4s ease-in-out infinite",
        } as any}
        title={peeking ? "탭하면 원위치" : isListening ? "탭하면 중지" : "탭하면 음성인식"}
      >
        {/* 내부 광택 (비활성만) */}
        {!isListening && (
          <div style={{
            position: "absolute", inset: 0,
            borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(255,255,255,0.15), transparent)",
            pointerEvents: "none",
          }} />
        )}

        {/* 아이콘 */}
        {!pazPhoto && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, position: "relative", zIndex: 1 }}>
            {isListening
              ? <i className="ti ti-microphone-off" style={{ fontSize: Math.round(BTN * 0.42), color: "#8b5cf6" }} aria-hidden="true" />
              : <i className="ti ti-robot" style={{ fontSize: Math.round(BTN * 0.42), color: "#fff" }} aria-hidden="true" />
            }
            <span style={{ fontSize: 8, fontWeight: 900, color: isListening ? "#8b5cf6" : "rgba(255,255,255,0.95)", letterSpacing: 1.5 }}>
              {isListening ? "STOP" : "PAZ"}
            </span>
          </div>
        )}

        {/* 커스텀 사진 */}
        {pazPhoto && (
          <div style={{ width: BTN * 0.75, height: BTN * 0.75, borderRadius: "50%", overflow: "hidden", flexShrink: 0, zIndex: 1 }}>
            <img src={pazPhoto} alt="PAZ" draggable={false} onContextMenu={e => e.preventDefault()} style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" } as React.CSSProperties} />
          </div>
        )}
      </button>

      <style>{`
        @keyframes specBar {
          from { transform: scaleY(0.3); opacity: 0.3; }
          to   { transform: scaleY(1.0); opacity: 1.0; }
        }
        @keyframes morphBtn {
          0%,100% { border-radius: 50%; box-shadow: 0 0 28px rgba(139,92,246,0.6); }
          33% { border-radius: 40% 60% 65% 35% / 35% 65% 40% 60%; box-shadow: 0 0 40px rgba(236,72,153,0.7); }
          66% { border-radius: 65% 35% 38% 62% / 60% 40% 62% 38%; box-shadow: 0 0 28px rgba(139,92,246,0.6); }
        }
        @keyframes pazPulse1 {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.2); opacity: 0.1; }
        }
        @keyframes bubbleIn {
          from { opacity: 0; transform: translateY(8px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .paz-btn img {
          -webkit-touch-callout: none;
          -webkit-user-drag: none;
          user-select: none;
          pointer-events: none;
        }
      `}</style>
    </>
  );
}
