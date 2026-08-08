import crypto from "crypto";

// 계좌번호 등 금융정보 저장용 대칭키 암호화 (AES-256-GCM). 서버 전용 — 클라이언트 번들에 절대 포함되면 안 됨.
const ALGO = "aes-256-gcm";
const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const secret = process.env.BANK_ENCRYPTION_KEY;
  if (!secret) throw new Error("BANK_ENCRYPTION_KEY 환경변수가 설정되지 않았습니다.");
  const buf = /^[0-9a-fA-F]{64}$/.test(secret)
    ? Buffer.from(secret, "hex")
    : Buffer.from(secret, "base64");
  if (buf.length !== 32) throw new Error("BANK_ENCRYPTION_KEY는 32바이트여야 합니다 (hex 64자 또는 base64).");
  return buf;
}

export function encryptBank(plain: string | null | undefined): string {
  if (!plain) return "";
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

// 레거시 평문 데이터와의 하위호환: enc:v1: 접두사가 없으면 암호화 이전에 저장된 평문으로 보고 그대로 반환
export function decryptBank(value: string | null | undefined): string {
  if (!value) return "";
  if (!value.startsWith(PREFIX)) return value;
  try {
    const key = getKey();
    const raw = Buffer.from(value.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return "🔒 복호화 오류";
  }
}
