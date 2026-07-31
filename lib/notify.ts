/**
 * lib/notify.ts — 서버사이드 알림 생성 헬퍼
 * Server Action / API Route 에서만 사용 (서비스롤 키 필요)
 */
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:hellopazab@gmail.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export type NotificationType =
  | "invite"        // 초대장 도착
  | "invite_joined" // 직원 수락
  | "match"         // 매칭 성사
  | "lovecall"      // 러브콜
  | "daeta"         // 대타 요청
  | "daeta_accept"  // 대타 수락
  | "attendance"    // 출퇴근 확인
  | "payslip"       // 임금명세서
  | "contract"      // 계약서
  | "feed_new_post" // 팔로우한 매장 새 소식
  | "store_follow"  // 매장 팔로우 알림
  | "system";       // 시스템

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  url?: string;
  actions?: { action: string; title: string }[];
}

/**
 * 알림 생성 + 웹푸쉬 발송 (푸쉬 실패해도 알림함엔 저장됨)
 */
export async function createNotification(params: CreateNotificationParams) {
  const supabase = getServiceClient();

  // 1. notifications 테이블에 저장
  const dataPayload = {
    ...(params.data || {}),
    ...(params.url ? { url: params.url } : {}),
  };
  const { error } = await supabase.from("notifications").insert({
    user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    data: Object.keys(dataPayload).length > 0 ? dataPayload : null,
  });
  if (error) console.error("[notify] insert error:", error);

  // 2. 웹 푸쉬 발송 (구독 있을 때만)
  try {
    const { data: sub } = await supabase
      .from("push_subscriptions")
      .select("subscription")
      .eq("user_id", params.userId)
      .maybeSingle();

    if (sub?.subscription) {
      await webpush.sendNotification(
        sub.subscription,
        JSON.stringify({
          title: params.title,
          body: params.body ?? "",
          url: params.url ?? "/notifications",
          tag: params.type,
          actions: params.actions ?? undefined,
          data: dataPayload,
        })
      );
    }
  } catch (e: any) {
    // 구독 만료(410) 시 삭제
    if (e?.statusCode === 410) {
      await supabase.from("push_subscriptions").delete().eq("user_id", params.userId);
    }
  }
}
