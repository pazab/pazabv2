// 클라이언트 컴포넌트에서 계좌정보를 DB에 쓰기/읽기 직전 변환할 때 쓰는 헬퍼.
// 실제 암/복호화 키는 서버(/api/bank-crypto)에만 있음 — 여기선 네트워크 호출만 한다.

async function callBankCrypto(action: "encrypt" | "decrypt", values: (string | null | undefined)[]): Promise<string[]> {
  const res = await fetch("/api/bank-crypto", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, values: values.map(v => v || "") }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || `계좌정보 ${action === "encrypt" ? "암호화" : "복호화"} 실패`);
  return data.values as string[];
}

export function encryptBankFields(values: (string | null | undefined)[]): Promise<string[]> {
  return callBankCrypto("encrypt", values);
}

export function decryptBankFields(values: (string | null | undefined)[]): Promise<string[]> {
  return callBankCrypto("decrypt", values);
}
