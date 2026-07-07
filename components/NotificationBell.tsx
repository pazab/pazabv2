"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function NotificationBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 초기 미읽음 수
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      setUnread(count ?? 0);

      // Realtime 구독으로 실시간 업데이트
      channel = supabase
        .channel(`notif-bell-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          async (payload: any) => {
            if (payload.eventType === "INSERT") {
              setUnread(prev => prev + 1);
            } else {
              const { count } = await supabase
                .from("notifications")
                .select("*", { count: "exact", head: true })
                .eq("user_id", user.id)
                .eq("is_read", false);
              setUnread(count ?? 0);
            }
          }
        )
        .subscribe();
    };

    init();
    return () => { channel?.unsubscribe(); };
  }, []);

  // 알림함 페이지에 있으면 배지 숨김
  const onNotifPage = pathname === "/notifications";

  return (
    <button
      onClick={() => router.push("/notifications")}
      style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: "0 2px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
      title="알림"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={onNotifPage ? "#8b5cf6" : "var(--text-muted)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {unread > 0 && !onNotifPage && (
        <span style={{
          position: "absolute", top: -3, right: -5,
          background: "#ec4899", color: "#fff",
          fontSize: 9, fontWeight: 700,
          padding: "1px 4px", borderRadius: 10,
          minWidth: 16, textAlign: "center",
          lineHeight: "14px",
        }}>
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
