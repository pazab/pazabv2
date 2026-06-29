/**
 * lib/shortcode.ts — STEP 3: 대타 딥링크 단축코드 생성
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * base62 단축코드 생성 (기본 6자리)
 * 공고 등록 시: genShortCode() → 중복조회 → 충돌이면 재생성
 */
export function genShortCode(len = 6): string {
  let s = ''
  for (let i = 0; i < len; i++) {
    s += ALPHABET[Math.floor(Math.random() * 62)]
  }
  return s
}

/**
 * 단축코드 유효성 검증
 */
export function isValidShortCode(code: string): boolean {
  return /^[0-9a-zA-Z]{4,10}$/.test(code)
}
