/**
 * lib/inviteShare.ts — STEP 4: 알바생 초대 링크 텍스트 빌더
 */

export interface InviteShareParams {
  storeName: string
  nick: string
  code: string
}

/**
 * buildInviteText — 카톡 초대 텍스트 생성
 */
export function buildInviteText(p: InviteShareParams): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pazab.app'
  return (
    `${p.nick}님, ${p.storeName} 알바 관리 초대 🙌\n` +
    `근태·급여를 앱으로 받아보세요\n` +
    `👉 ${appUrl}/i/${p.code}`
  )
}

/**
 * shareInvite — 브라우저 공유 or 클립보드 복사
 */
export async function shareInvite(p: InviteShareParams): Promise<'shared' | 'copied'> {
  const text = buildInviteText(p)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pazab.app'

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: `${p.storeName} 알바 관리 초대`,
        text,
        url: `${appUrl}/i/${p.code}`,
      })
      return 'shared'
    } catch { /* 공유 취소 */ }
  }

  await navigator.clipboard.writeText(text)
  return 'copied'
}
