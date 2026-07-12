"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface ChatRoom {
  id: string;
  isPaz?: boolean;
  counterpartName: string;
  counterpartAvatar: string | null;
  counterpartType?: string;
  businessName?: string;
  last_message: string;
  last_message_at: string;
  unreadCount: number;
  progress_status: string;
  pazAvatarEmoji?: string;
}

interface ChatMessage {
  id: string;
  match_id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  message_type: string;
  is_read: boolean;
  created_at: string;
}

export default function FloatingChatWidget() {
  const router = useRouter();
  const pathname = usePathname();

  const [userId, setUserId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // 데이터 상태
  const [chatrooms, setChatrooms] = useState<ChatRoom[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMatch, setCurrentMatch] = useState<any>(null);
  const [counterpart, setCounterpart] = useState<any>(null);
  const [contractStatus, setContractStatus] = useState<"none" | "pending" | "done">("none");
  const [teamMemberId, setTeamMemberId] = useState<string | null>(null);

  // UI 상태
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messageListenerRef = useRef<any>(null);

  // 1. 현재 사용자 조회
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUserId(session.user.id);
        fetchUnreadCount(session.user.id);
      } else {
        setUserId(null);
      }
    });
  }, [pathname]);

  // 2. 전체 안읽은 메시지 수 조회
  const fetchUnreadCount = useCallback(async (uid: string) => {
    try {
      const [workerRes, employerRes] = await Promise.all([
        supabase.from("matches").select("id").eq("worker_id", uid).eq("worker_left", false).in("progress_status", ["accepted", "interviewing", "hired"]),
        supabase.from("matches").select("id").eq("employer_id", uid).eq("employer_left", false).in("progress_status", ["accepted", "interviewing", "hired"]),
      ]);

      const activeMatchIds = [
        ...(workerRes.data || []).map(m => m.id),
        ...(employerRes.data || []).map(m => m.id),
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
      console.error("Error fetching unread count:", e);
    }
  }, []);

  // 3. 실시간 안읽은 카운트 감지
  useEffect(() => {
    if (!userId) return;

    const channelName = `floating-chat-badge-${userId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chats", filter: `receiver_id=eq.${userId}` },
        () => {
          fetchUnreadCount(userId);
          if (isOpen && !activeMatchId) fetchChatrooms(userId);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chats", filter: `receiver_id=eq.${userId}` },
        () => {
          fetchUnreadCount(userId);
          if (isOpen && !activeMatchId) fetchChatrooms(userId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, isOpen, activeMatchId, fetchUnreadCount]);

  // 4. 채팅물 목록 로딩
  const fetchChatrooms = async (uid: string) => {
    try {
      setLoadingRooms(true);
      const res = await fetch(`/api/chatrooms?userId=${uid}`);
      const data = await res.json();
      
      let normalRooms: ChatRoom[] = [];
      if (data.success) {
        normalRooms = data.data || [];
      }

      // PAZ봇 조회
      const { data: userProfile } = await supabase
        .from("users")
        .select("paz_name, paz_avatar, paz_photo_url")
        .eq("id", uid)
        .maybeSingle();

      const { data: lastPazMsg } = await supabase
        .from("paz_chats")
        .select("content, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const pazRoom: ChatRoom = {
        id: "paz_chat",
        isPaz: true,
        counterpartName: userProfile?.paz_name || "PAZ",
        counterpartAvatar: userProfile?.paz_photo_url || null,
        pazAvatarEmoji: userProfile?.paz_avatar || "🤖",
        last_message: lastPazMsg?.content || "대화를 시작해보세요 🤖",
        last_message_at: lastPazMsg?.created_at || new Date().toISOString(),
        unreadCount: 0,
        progress_status: "accepted"
      };

      setChatrooms([pazRoom, ...normalRooms]);
    } catch (e) {
      console.error("Error fetching chatrooms:", e);
    } finally {
      setLoadingRooms(false);
    }
  };

  // 5. 개별 대화방 메시지 로딩
  const fetchMessages = async (matchId: string, uid: string) => {
    try {
      setLoadingMessages(true);
      const res = await fetch(`/api/chat?matchId=${matchId}&userId=${uid}`);
      const data = await res.json();
      if (data.success) {
        setMessages(data.data || []);
        setCounterpart(data.counterpart);
        setCurrentMatch(data.match);
        
        // 읽지 않은 메시지 읽음 처리
        await supabase
          .from("chats")
          .update({ is_read: true })
          .eq("match_id", matchId)
          .eq("receiver_id", uid)
          .eq("is_read", false);
        
        fetchUnreadCount(uid);

        // 계약 정보 조회
        if (data.match?.progress_status === "hired") {
          const { data: tm } = await supabase
            .from("team_members")
            .select("id, contract_status")
            .eq("match_id", matchId)
            .maybeSingle();
          if (tm) {
            setTeamMemberId(tm.id);
            if (tm.contract_status === "active") setContractStatus("done");
            else if (tm.contract_status === "pending") setContractStatus("pending");
            else setContractStatus("none");
          }
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMessages(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  // 6. 개별 대화방 실시간 구독
  useEffect(() => {
    if (!userId || !activeMatchId || activeMatchId === "paz_chat") {
      setMessages([]);
      return;
    }

    fetchMessages(activeMatchId, userId);

    // 메시지 삽입 실시간 구독
    const channelName = `floating-room-${activeMatchId}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chats", filter: `match_id=eq.${activeMatchId}` },
        (payload: any) => {
          setMessages(prev => {
            if (prev.some(m => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
          
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

          if (payload.new.receiver_id === userId) {
            // 들어온 메시지 즉시 읽음 처리
            supabase.from("chats")
              .update({ is_read: true })
              .eq("id", payload.new.id)
              .then(() => {
                setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, is_read: true } : m));
                fetchUnreadCount(userId);
              });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chats", filter: `match_id=eq.${activeMatchId}` },
        (payload: any) => {
          if (payload.new.is_read && payload.new.sender_id === userId) {
            setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, is_read: true } : m));
          }
        }
      )
      .subscribe();

    messageListenerRef.current = channel;

    return () => {
      if (messageListenerRef.current) {
        supabase.removeChannel(messageListenerRef.current);
      }
    };
  }, [activeMatchId, userId]);

  // 7. 메시지 전송
  const handleSendMessage = async () => {
    const msg = inputMessage.trim();
    if (!msg || !userId || sending || !activeMatchId) return;

    setInputMessage("");
    setSending(true);

    const isEmployer = currentMatch?.employer_id === userId;
    const counterpartId = isEmployer ? currentMatch?.worker_id : currentMatch?.employer_id;

    // 낙관적 업데이트
    const tempId = `temp-${Date.now()}`;
    const tempMsg: ChatMessage = {
      id: tempId,
      match_id: activeMatchId,
      sender_id: userId,
      receiver_id: counterpartId,
      message: msg,
      message_type: "text",
      is_read: false,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempMsg]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: activeMatchId,
          senderId: userId,
          receiverId: counterpartId,
          message: msg,
          messageType: "text"
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data?.id) {
          setMessages(prev => {
            const exists = prev.some(m => m.id === data.data.id);
            if (exists) return prev.filter(m => m.id !== tempId);
            return prev.map(m => m.id === tempId ? data.data : m);
          });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  // 대화방 켜기
  const handleOpenRoom = (room: ChatRoom) => {
    if (room.isPaz) {
      setIsOpen(false);
      router.push("/paz");
    } else {
      setActiveMatchId(room.id);
    }
  };

  // 위젯 토글
  const handleToggleWidget = () => {
    if (!isOpen) {
      setIsOpen(true);
      if (userId) fetchChatrooms(userId);
    } else {
      setIsOpen(false);
      setActiveMatchId(null);
    }
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

  // 위젯 비노출 경로 조건
  const isHiddenPath = ["/login", "/signup", "/auth", "/paz", "/sudoku", "/interview"].some(p => pathname === p || pathname?.startsWith(p));
  if (isHiddenPath || !userId) return null;

  const isEmployer = currentMatch?.employer_id === userId;
  const cpName = counterpart?.employer_profile?.business_name 
    ? `${counterpart.employer_profile.business_name} 사장님` 
    : (counterpart?.users?.nickname || "알 수 없음");

  const cpAvatar = counterpart?.employer_profile?.image_url 
    || counterpart?.worker_profile?.image_url 
    || counterpart?.users?.avatar_url 
    || null;

  return (
    <>
      {/* 플로팅 버튼 */}
      <button onClick={handleToggleWidget}
        style={{
          position: "fixed",
          bottom: 168,
          right: 16,
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
          border: "none",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: isOpen 
            ? "0 0 0 3px rgba(139,92,246,0.35), 0 8px 24px rgba(139,92,246,0.5)"
            : "0 4px 16px rgba(139,92,246,0.45)",
          cursor: "pointer",
          zIndex: 99,
          transition: "all 0.25s ease"
        }}>
        <i className={`ti ${isOpen ? "ti-x" : "ti-message-2"}`} style={{ fontSize: 24 }} aria-hidden="true" />
        
        {/* 전체 안읽은 뱃지 */}
        {!isOpen && unreadCount > 0 && (
          <span style={{
            position: "absolute",
            top: -2,
            right: -2,
            background: "linear-gradient(135deg, #f43f5e, #e11d48)",
            color: "#fff",
            fontSize: 9,
            fontWeight: 800,
            padding: "2px 6px",
            borderRadius: 10,
            border: "1.5px solid var(--bg)"
          }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* 대화 팝업 창 */}
      {isOpen && (
        <div className="fixed sm:absolute z-50 overflow-hidden flex flex-col bg-surface border border-border shadow-2xl transition-all duration-300
          inset-x-0 bottom-0 top-[15%] rounded-t-3xl sm:inset-auto sm:bottom-[232px] sm:right-6 sm:w-[360px] sm:h-[500px] sm:rounded-2xl"
          style={{ backdropFilter: "blur(8px)" }}>
          
          {activeMatchId === null ? (
            /* 1. 채팅 목록 뷰 */
            <>
              {/* 헤더 */}
              <div className="flex justify-between items-center px-4 py-3 border-b border-border bg-surface2/60">
                <span className="font-bold text-sm">채팅</span>
                <div className="flex items-center gap-2.5">
                  <button onClick={() => {
                    setIsOpen(false);
                    router.push("/chat");
                  }} className="text-text-muted hover:text-text flex items-center gap-1 text-[11px]" title="전체화면으로 보기">
                    <i className="ti ti-external-link text-xs" aria-hidden="true" />
                    <span className="font-bold">전체보기</span>
                  </button>
                  <button onClick={handleToggleWidget} className="text-text-muted hover:text-text">
                    <i className="ti ti-x text-lg" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* 목록 바디 */}
              <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
                {loadingRooms ? (
                  <div className="flex items-center justify-center h-48">
                    <span className="text-xs text-text-muted">불러오는 중...</span>
                  </div>
                ) : chatrooms.length === 0 ? (
                  <div className="text-center py-20 px-4">
                    <div className="text-3xl mb-2">💬</div>
                    <span className="text-xs text-text-muted">진행 중인 대화가 없습니다.</span>
                  </div>
                ) : (
                  chatrooms.map(room => {
                    const hasUnread = room.unreadCount > 0;
                    
                    if (room.isPaz) {
                      return (
                        <button key={room.id} onClick={() => handleOpenRoom(room)}
                          className="w-full text-left p-3 rounded-xl border border-primary/20 bg-primary-light flex items-center gap-3 transition hover:bg-primary-light/80">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-white text-lg">
                            {room.counterpartAvatar ? (
                              <img src={room.counterpartAvatar} alt="avatar" className="w-full h-full object-cover rounded-full" />
                            ) : (
                              <span>🤖</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-0.5">
                              <span className="font-bold text-xs text-primary">{room.counterpartName}</span>
                              <span className="text-[9px] text-primary bg-primary/10 px-1 py-0.2 rounded font-bold">AI</span>
                            </div>
                            <p className="text-[11px] text-text-sub truncate leading-normal">{room.last_message}</p>
                          </div>
                        </button>
                      );
                    }

                    return (
                      <button key={room.id} onClick={() => handleOpenRoom(room)}
                        className={`w-full text-left p-3 rounded-xl border flex items-center gap-3 transition hover:bg-surface2
                          ${hasUnread ? "bg-primary-light/40 border-primary/15" : "bg-surface border-border"}`}>
                        <div className="w-10 h-10 rounded-full bg-surface2 flex items-center justify-center text-lg flex-shrink-0 relative border border-border">
                          {room.counterpartAvatar ? (
                            <img src={room.counterpartAvatar} alt="avatar" className="w-full h-full object-cover rounded-full" />
                          ) : (
                            <span>{room.counterpartType === "employer" ? "🏪" : "👤"}</span>
                          )}
                          {hasUnread && (
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-primary border-2 border-surface" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-0.5">
                            <span className="font-bold text-xs text-text truncate">{room.counterpartName}</span>
                            <span className="text-[9px] text-text-muted">{formatTime(room.last_message_at)}</span>
                          </div>
                          <p className={`text-[11px] truncate leading-normal ${hasUnread ? "font-semibold text-text" : "text-text-sub"}`}>
                            {room.last_message}
                          </p>
                        </div>
                        {hasUnread && (
                          <span className="bg-primary text-white text-[9px] font-bold min-w-5 h-5 flex items-center justify-center rounded-full px-1">
                            {room.unreadCount}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            /* 2. 개별 채팅방 뷰 */
            <>
              {/* 헤더 */}
              <div className="flex justify-between items-center px-3 py-2.5 border-b border-border bg-surface2/60">
                <div className="flex items-center gap-2 min-w-0">
                  <button onClick={() => setActiveMatchId(null)} className="text-text-muted hover:text-text">
                    <i className="ti ti-chevron-left text-lg" aria-hidden="true" />
                  </button>
                  <div className="w-7 h-7 rounded-full overflow-hidden bg-surface border border-border flex items-center justify-center flex-shrink-0">
                    {cpAvatar ? (
                      <img src={cpAvatar} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm">{counterpart?.users?.user_type === "employer" ? "🏪" : "👤"}</span>
                    )}
                  </div>
                  <span className="font-bold text-xs text-text truncate">{cpName}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <button onClick={() => {
                    setIsOpen(false);
                    router.push(`/chat/${activeMatchId}`);
                  }} className="text-text-muted hover:text-text flex items-center gap-1 text-[11px]" title="전체화면으로 보기">
                    <i className="ti ti-external-link text-xs" aria-hidden="true" />
                    <span className="font-bold">채팅 상세</span>
                  </button>
                  <button onClick={handleToggleWidget} className="text-text-muted hover:text-text">
                    <i className="ti ti-x text-lg" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* 채용 확정 후 근로계약서 안내 배너 */}
              {currentMatch?.progress_status === "hired" && contractStatus !== "done" && (
                <div className="bg-gradient-to-r from-primary-light to-accent/5 p-2.5 border-b border-border flex flex-col gap-1.5 items-center text-center">
                  <span className="text-[11px] font-bold text-text">
                    {isEmployer 
                      ? "🎉 채용 완료! 근로계약서를 작성해주세요." 
                      : "🎉 채용 완료! 사장님이 근로계약서를 작성하고 있습니다."}
                  </span>
                  {isEmployer && teamMemberId && (
                    <button onClick={() => {
                      setIsOpen(false);
                      router.push(`/contract?memberId=${teamMemberId}&mode=update&from=chat`);
                    }}
                      className="bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-lg active:scale-95 transition">
                      📄 계약서 작성하러 가기
                    </button>
                  )}
                </div>
              )}

              {/* 메시지 스트림 */}
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 bg-surface2/30">
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-xs text-text-muted">채팅 로딩 중...</span>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.sender_id === userId;
                    const isSystem = msg.message_type === "system";

                    if (isSystem) {
                      return (
                        <div key={msg.id} className="flex justify-center my-1.5">
                          <div className="bg-primary-light border border-primary-border rounded-2xl px-4 py-2.5 text-[11px] text-purple-text text-center max-w-[90%] leading-relaxed whitespace-pre-line shadow-sm">
                            {msg.message}
                            
                            {/* 시스템 메시지 액션 유도 */}
                            {msg.message.includes("채용이 확정") && isEmployer && (
                              <button onClick={() => {
                                setIsOpen(false);
                                router.push(`/contract?matchId=${activeMatchId}&mode=update&from=chat`);
                              }}
                                className="mt-2 block mx-auto bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-lg">
                                ✏️ 계약서 작성하기
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={msg.id} className={`flex items-end gap-1.5 ${isMine ? "justify-end" : "justify-start"}`}>
                        
                        {/* 내 메시지일 때 시간 표시 */}
                        {isMine && (
                          <div className="flex flex-col items-end gap-0.5 text-[9px] text-text-muted flex-shrink-0">
                            {!msg.is_read && <span className="text-primary font-bold">1</span>}
                            <span>{new Date(msg.created_at).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", hour12: false })}</span>
                          </div>
                        )}

                        <div className={`max-w-[70%] px-3 py-2 text-xs leading-relaxed break-all shadow-sm
                          ${isMine 
                            ? "bg-gradient-to-tr from-primary to-purple-700 text-white rounded-[16px_16px_4px_16px]" 
                            : "bg-surface border border-border text-text rounded-[16px_16px_16px_4px]"}`}>
                          {msg.message}
                        </div>

                        {/* 상대 메시지일 때 시간 표시 */}
                        {!isMine && (
                          <span className="text-[9px] text-text-muted flex-shrink-0">
                            {new Date(msg.created_at).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", hour12: false })}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* 전송 입력 폼 */}
              <div className="p-2 border-t border-border bg-surface flex gap-1.5">
                <input type="text" placeholder="채팅을 입력하세요..."
                  value={inputMessage}
                  onChange={e => setInputMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSendMessage(); }}
                  disabled={sending}
                  className="flex-1 bg-surface2 border border-border text-xs px-3 py-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary" />
                <button onClick={handleSendMessage} disabled={sending || !inputMessage.trim()}
                  className="bg-primary text-white text-xs font-bold px-4 py-2 rounded-xl active:scale-95 transition disabled:opacity-50 flex items-center justify-center">
                  전송
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
