import crypto from "crypto";

// 휴대폰 번호 원본을 저장하지 않고도, 탈퇴 후 다른 이메일로 재가입한 계정을 같은
// 번호로 매칭하기 위한 단방향 해시. 서버 전용 비밀키로 키잉된 HMAC-SHA256이라
// 이 값만으로는 원래 번호를 역산할 수 없다 (CLAUDE.md "PII 원본 저장 금지" 원칙).
function getSecret(): string {
  return process.env.PHONE_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY!;
}

// "010-1234-5678"과 "01012345678"이 같은 해시로 매칭되도록 숫자만 남긴다.
export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function hashPhone(phone: string): string {
  return crypto.createHmac("sha256", getSecret()).update(normalizePhoneDigits(phone)).digest("hex");
}
