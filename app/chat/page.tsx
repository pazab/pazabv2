"use client";

import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

import AppHeader from "@/components/AppHeader";
import { btnPrimary, chipStyle, chipSuccess, chipWarning, chipPrimary } from "@/lib/styles";

const GRADE_EMOJI: Record<string, string> = { bronze: "🥉", silver: "🥈", gold: "🥇", platinum: "💎" };

const mutedChip: CSSProperties = {
  ...chipStyle,
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  color: "var(--text-muted)",
};

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

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "8px 12px" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
            <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
          </div>
        ) : chatrooms.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>아직 채팅이 없어요</h3>
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20 }}>
              지원이 수락되면 채팅이 시작돼요
            </p>
            <button onClick={() => router.push("/explore")}
              style={{ ...btnPrimary, width: "auto", padding: "12px 24px" }}>
              탐색하러 가기 →
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {chatrooms.map(room => {
              if (room.isPaz) {
                const pazAvatar = room.counterpartAvatar;
                return (
                  <button key={room.id} onClick={() => router.push("/paz")}
                    style={{
                      width: "100%",
                      background: "var(--primary-light)",
                      border: "1px solid var(--primary-border)",
                      borderRadius: 18,
                      padding: "14px 16px",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      transition: "all 0.18s",
                      boxShadow: "var(--shadow-elevate)",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = "translateY(0)";
                    }}>
                    {/* 아바타 */}
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <div style={{
                        width: 50, height: 50, borderRadius: "50%",
                        background: "var(--primary)",
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center", gap: 1,
                        overflow: "hidden",
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
                      {/* 온라인 도트 */}
                      <div style={{ position: "absolute", bottom: 1, right: 1, width: 12, height: 12, borderRadius: "50%", background: "var(--success)", border: "2px solid var(--bg)" }} />
                    </div>
                    {/* 내용 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>{room.counterpartName}</span>
                          <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: "var(--accent)", padding: "2px 6px", borderRadius: 6, letterSpacing: 0.5 }}>AI</span>
                        </div>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>{formatTime(room.last_message_at)}</span>
                      </div>
                      <p style={{ fontSize: 13, color: "var(--text-sub)", margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
                        {room.last_message}
                      </p>
                      <span style={{ ...chipPrimary, fontWeight: 700 }}>AI 비서 · 언제나 대화 가능</span>
                    </div>
                  </button>
                );
              }

              const status = room.progress_status || room.status;
              const statusChipConfig: Record<string, { label: string; chip: CSSProperties }> = {
                accepted: { label: "대화중", chip: chipSuccess },
                interviewing: { label: "면접중", chip: chipWarning },
                hired: { label: "채용완료", chip: chipPrimary },
                failed: { label: "종료", chip: mutedChip },
                cancelled: { label: "취소", chip: mutedChip },
              };
              const statusInfo = statusChipConfig[status] || { label: "대기중", chip: mutedChip };
              const hasUnread = room.unreadCount > 0;

              return (
                <button key={room.id} onClick={() => router.push(`/chat/${room.id}`)}
                  style={{
                    width: "100%",
                    background: hasUnread ? "var(--primary-light)" : "var(--surface)",
                    border: `1px solid ${hasUnread ? "var(--primary-border)" : "var(--border)"}`,
                    borderRadius: 18,
                    padding: "14px 16px",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    transition: "all 0.18s",
                    boxShadow: "var(--shadow-elevate)",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = "translateY(0)";
                  }}>
                  {/* 아바타 */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{
                      width: 50, height: 50, borderRadius: room.counterpartType === "employer" ? "8px" : "50%",
                      background: "var(--surface2)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      overflow: "hidden",
                      boxShadow: hasUnread ? "0 0 0 2px var(--primary-border)" : "0 0 0 1.5px var(--border)",
                    }}>
                      {room.counterpartAvatar ? (
                        <img src={room.counterpartAvatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <i className={room.counterpartType === "employer" ? "ti ti-building-store" : "ti ti-user"}
                          style={{ fontSize: 22, color: "var(--text-muted)" }} aria-hidden="true" />
                      )}
                    </div>
                    {hasUnread && (
                      <div style={{ position: "absolute", bottom: 1, right: 1, width: 12, height: 12, borderRadius: "50%", background: "var(--primary)", border: "2px solid var(--bg)" }} />
                    )}
                  </div>
                  {/* 내용 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontSize: 15, fontWeight: hasUnread ? 800 : 700, color: "var(--text)" }}>{room.counterpartName}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>{formatTime(room.last_message_at)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                      {room.businessName && (
                        <span style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{room.businessName}</span>
                      )}
                      <span style={{ ...statusInfo.chip, flexShrink: 0 }}>{statusInfo.label}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, color: hasUnread ? "var(--text)" : "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, fontWeight: hasUnread ? 600 : 400 }}>
                        {room.last_message || "채팅을 시작해보세요 👋"}
                      </span>
                      {hasUnread && (
                        <span style={{ background: "var(--primary)", color: "#fff", fontSize: 11, fontWeight: 700, minWidth: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 11, flexShrink: 0, padding: "0 6px" }}>
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
              <div style={{ textAlign: "center", padding: "48px 20px", marginTop: 12 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
                <h4 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px", color: "var(--text)" }}>일반 채팅방이 아직 없어요</h4>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
                  지원이 수락되면 여기에 사장님/알바생과의 채팅창이 열려요.
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
