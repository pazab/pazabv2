/**
 * lib/daetaShare.ts — STEP 3: 카톡 공유 메시지 빌더
 */

export interface DaetaShareParams {
  storeName: string
  date: string          // '오늘' | '내일' | '6/30(월)'
  time: string          // '14:00~18:00'
  wage: number
  shortCode: string
}

/**
 * buildDaetaShareText — 카톡 공유용 텍스트 생성
 */
export function buildDaetaShareText(p: DaetaShareParams): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pazab.app'
  return (
    `🚨 [${p.storeName}] ${p.date} ${p.time} 대타 급구!\n` +
    `시급 ${p.wage.toLocaleString()}원\n` +
    `👉 ${appUrl}/d/${p.shortCode}`
  )
}

/**
 * shareDaeta — 브라우저 공유 API or 클립보드 복사 폴백
 */
export async function shareDaeta(p: DaetaShareParams): Promise<'shared' | 'copied'> {
  const text = buildDaetaShareText(p)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pazab.app'

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: `[${p.storeName}] 대타 급구!`,
        text,
        url: `${appUrl}/d/${p.shortCode}`,
      })
      return 'shared'
    } catch { /* 공유 취소 */ }
  }

  // 클립보드 복사 폴백
  await navigator.clipboard.writeText(text)
  return 'copied'
}
