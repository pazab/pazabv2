// 웹 푸시 구독 훅
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribePush(userId: string): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.log("웹 푸시 미지원 브라우저");
      return false;
    }

    // 권한 요청
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    // Service Worker 등록
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    // 구독
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    // 서버에 저장
    await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, subscription }),
    });

    console.log("✅ 푸시 구독 완료");
    return true;
  } catch (e) {
    console.error("푸시 구독 오류:", e);
    return false;
  }
}

// 푸시 발송 헬퍼
export async function sendPushNotification({
  userId, title, body, url, tag
}: {
  userId: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
}) {
  try {
    await fetch("/api/push", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, title, body, url, tag }),
    });
  } catch (e) {
    console.error("푸시 발송 오류:", e);
  }
}
