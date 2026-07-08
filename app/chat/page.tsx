"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

import AppHeader from "@/components/AppHeader";
import { btnPrimary } from "@/lib/styles";

const GRADE_EMOJI: Record<string, string> = { bronze: "🥉", silver: "🥈", gold: "🥇", platinum: "💎" };

export default function ChatListPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [chatrooms, setChatrooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (active) {
          localStorage.setItem("login_redirect", window.location.pathname);
          router.push("/login");
        }
        return;
      }
      if (!active) return;
      const uid = session.user.id;
      setUserId(uid);
      await fetchChatrooms(uid);
      if (!active) return;

      const channelName = `chat-list-${uid}-${Math.random().toString(36).substring(2, 9)}`;
      const newChannel = supabase.channel(channelName)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches" }, () => {
          if (active) fetchChatrooms(uid);
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chats" }, () => {
          if (active) fetchChatrooms(uid);
        });

      newChannel.subscribe();
      channel = newChannel;
    };
    init();
    return () => {
      active = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const fetchChatrooms = async (uid: string) => {
    try {
      let normalRooms: any[] = [];
      try {
        const res = await fetch(`/api/chatrooms?userId=${uid}`);
        const data = await res.json();
        if (data.success) normalRooms = data.data || [];
      } catch (err) {
        console.error("Error loading chatrooms api:", err);
      }

      // PAZ 정보 및 최근 대화 조회
      let userProfile = null;
      let lastPazMsg = null;
      try {
        const { data: u } = await supabase
          .from("users")
          .select("paz_name, paz_avatar, paz_photo_url")
          .eq("id", uid)
          .maybeSingle();
        userProfile = u;

        const { data: m } = await supabase
          .from("paz_chats")
          .select("content, created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        lastPazMsg = m;
      } catch (err) {
        console.error("Error loading paz history:", err);
      }

      const pazRoom = {
        id: "paz_chat",
        isPaz: true,
        counterpartName: userProfile?.paz_name || "PAZ",
        counterpartAvatar: userProfile?.paz_photo_url || null,
        pazAvatarEmoji: userProfile?.paz_avatar || "🤖",
        counterpartType: "paz",
        last_message: lastPazMsg?.content || "대화를 시작해보세요 🤖",
        last_message_at: lastPazMsg?.created_at || new Date().toISOString(),
        created_at: lastPazMsg?.created_at || new Date().toISOString(),
        unreadCount: 0,
      };

      setChatrooms([pazRoom, ...normalRooms]);
    } catch (e) {
      console.error("General error in fetchChatrooms:", e);
    }
    setLoading(false);
  };

  const formatTime = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return "방금";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
    return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 100 }}>
      <AppHeader title="채팅" />

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
            <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
          </div>
        ) : chatrooms.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>아직 채팅이 없어요</h3>
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20 }}>
              러브콜이 수락되면 채팅이 시작돼요
            </p>
            <button onClick={() => router.push("/explore")}
              style={{ ...btnPrimary, width: "auto", padding: "12px 24px" }}>
              탐색하러 가기 →
            </button>
          </div>
        ) : (
          <div>
            {chatrooms.map(room => {
              if (room.isPaz) {
                const pazAvatar = room.counterpartAvatar;
                return (
                  <button key={room.id} onClick={() => router.push("/paz")}
                    style={{
                      width: "100%",
                      background: "rgba(236, 72, 153, 0.06)",
                      border: "none",
                      borderBottom: "1px solid rgba(236, 72, 153, 0.2)",
                      padding: "16px 16px",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      transition: "all 0.15s"
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(236, 72, 153, 0.12)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(236, 72, 153, 0.06)")}>
                    {/* 아바타 */}
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #7c3aed, #ec4899)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 1,
                      flexShrink: 0,
                      overflow: "hidden",
                      boxShadow: "0 2px 8px rgba(236, 72, 153, 0.3)"
                    }}>
                      {pazAvatar ? (
                        <img src={pazAvatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <>
                          <i className="ti ti-robot" style={{ fontSize: 18, color: "#fff" }} aria-hidden="true" />
                          <span style={{ fontSize: 7, fontWeight: 900, color: "#fff", letterSpacing: 1 }}>PAZ</span>
                        </>
                      )}
                    </div>
                    {/* 내용 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "#fbcfe8" }}>{room.counterpartName}</span>
                          <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: "linear-gradient(135deg, #ec4899, #f43f5e)", padding: "1px 5px", borderRadius: 4 }}>AI</span>
                        </div>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatTime(room.last_message_at)}</span>
                      </div>
                      {/* 설명 & 상태 */}
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>언제나 대화 가능</span>
                        <span style={{ fontSize: 10, color: "var(--border)" }}>·</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#fbcfe8", background: "rgba(236,72,153,0.15)", padding: "2px 7px", borderRadius: 10 }}>AI 비서</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, fontWeight: 500 }}>
                          {room.last_message}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              }

              const status = room.progress_status || room.status;
              const statusConfig: Record<string, { label: string; color: string }> = {
                accepted: { label: "대화중", color: "#86efac" },
                interviewing: { label: "면접중", color: "#fbbf24" },
                hired: { label: "채용완료", color: "#c4b5fd" },
                failed: { label: "종료", color: "#71717a" },
                cancelled: { label: "취소", color: "#71717a" },
              };
              const statusInfo = statusConfig[status] || { label: "대기중", color: "#71717a" };

              return (
                <button key={room.id} onClick={() => router.push(`/chat/${room.id}`)}
                  style={{ width: "100%", background: "none", border: "none", borderBottom: "1px solid var(--border)", padding: "14px 16px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12, transition: "background 0.15s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(139,92,246,0.06)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                  {/* 아바타 */}
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg, #f59e0b, #ef4444)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0, overflow: "hidden" }}>
                    {room.counterpartAvatar ? (
                       <img src={room.counterpartAvatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span>{room.counterpartType === "employer" ? "🏪" : "👤"}</span>
                    )}
                  </div>
                  {/* 내용 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{room.counterpartName}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatTime(room.last_message_at)}</span>
                    </div>
                    {/* 날짜 + 공고명 + 상태 */}
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {new Date(room.created_at).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {room.businessName && (
                        <>
                          <span style={{ fontSize: 10, color: "var(--border)" }}>·</span>
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{room.businessName}</span>
                        </>
                      )}
                      <span style={{ fontSize: 10, color: "var(--border)" }}>·</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: statusInfo.color, background: `${statusInfo.color}20`, padding: "2px 7px", borderRadius: 10 }}>{statusInfo.label}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                        {room.last_message || "채팅을 시작해보세요 👋"}
                      </span>
                      {room.unreadCount > 0 && (
                        <span style={{ marginLeft: 8, background: "#8b5cf6", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, flexShrink: 0 }}>
                          {room.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

            {/* 일반 채팅방이 없는 경우 안내 배너 */}
            {chatrooms.length <= 1 && (
              <div style={{ textAlign: "center", padding: "48px 20px", marginTop: 20 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
                <h4 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px", color: "var(--text)" }}>일반 채팅방이 아직 없어요</h4>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
                  러브콜이 수락되면 여기에 사장님/알바생과의 채팅창이 열려요.
                </p>
                <button onClick={() => router.push("/explore")}
                  style={{ ...btnPrimary, width: "auto", padding: "8px 16px", fontSize: 12 }}>
                  탐색하러 가기
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      
    </main>
  );
}
