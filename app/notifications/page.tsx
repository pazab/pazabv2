"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

const TYPE_ICON: Record<string, string> = {
  invite:        "ti-user-plus",
  invite_joined: "ti-users",
  match:         "ti-heart",
  lovecall:      "ti-mail",
  daeta:         "ti-bolt",
  daeta_accept:  "ti-bolt",
  attendance:    "ti-clock",
  payslip:       "ti-receipt",
  contract:      "ti-file-description",
  feed_new_post: "ti-news",
  store_follow:  "ti-heart",
  system:        "ti-info-circle",
};

const TYPE_COLOR: Record<string, string> = {
  invite:        "#8b5cf6",
  invite_joined: "#8b5cf6",
  match:         "#ec4899",
  lovecall:      "#ec4899",
  daeta:         "#f97316",
  daeta_accept:  "#22c55e",
  attendance:    "#06b6d4",
  payslip:       "#22c55e",
  contract:      "#a78bfa",
  feed_new_post: "#ec4899",
  store_follow:  "#f472b6",
  system:        "#71717a",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    const res = await fetch("/api/notifications?limit=50");
    if (res.ok) {
      const { notifications } = await res.json();
      setItems(notifications ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAll = async () => {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    setItems(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const markOne = async (id: string) => {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleTap = (n: Notification) => {
    markOne(n.id);
    const url = (n.data?.url as string) ?? null;
    if (url) router.push(url);
  };

  const unreadCount = items.filter(n => !n.is_read).length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", paddingBottom: 80 }}>
      <AppHeader
        title="알림"
        showBack
        rightActions={
          unreadCount > 0 ? (
            <button
              onClick={markAll}
              style={{ background: "none", border: "none", color: "#8b5cf6", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "4px 8px" }}
            >
              모두 읽음
            </button>
          ) : undefined
        }
      />

      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)", fontSize: 14 }}>불러오는 중...</div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: "center", padding: 80 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔔</div>
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>아직 알림이 없어요</p>
          </div>
        ) : (
          <div>
            {items.map(n => {
              const icon = TYPE_ICON[n.type] ?? "ti-info-circle";
              const color = TYPE_COLOR[n.type] ?? "#71717a";
              return (
                <button
                  key={n.id}
                  onClick={() => handleTap(n)}
                  style={{
                    width: "100%", display: "flex", alignItems: "flex-start", gap: 12,
                    padding: "14px 16px",
                    background: n.is_read ? "transparent" : "rgba(139,92,246,0.06)",
                    border: "none", borderBottom: "1px solid var(--border)",
                    cursor: "pointer", textAlign: "left",
                    transition: "background 0.15s",
                  }}
                >
                  {/* 아이콘 */}
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                    background: `${color}1a`, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <i className={`ti ${icon}`} style={{ fontSize: 18, color }} aria-hidden="true" />
                  </div>

                  {/* 내용 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: n.is_read ? 400 : 700, color: "var(--text)", flex: 1 }}>
                        {n.title}
                      </span>
                      {!n.is_read && (
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#8b5cf6", flexShrink: 0 }} />
                      )}
                    </div>
                    {n.body && (
                      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {n.body}
                      </p>
                    )}
                    <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, display: "block" }}>
                      {timeAgo(n.created_at)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
