-- ============================================================
-- users 테이블에 재사용 가능한 계좌정보 SOT 추가
-- 실행: Supabase SQL Editor (clrjxxkgceluvzvrkvyl)
--
-- 문제: 계좌정보가 contracts.contract_data(계약 건별 jsonb)에만 저장돼서, 같은 사람이
-- 계약을 여러 번 맺을 때마다(정규직 재계약, 대타 여러 건 등) 매번 새로 입력→암호화→저장해야 했음.
-- 계좌를 바꿔도 과거 계약 건들은 그대로 남아있는 게 맞지만(계약은 서명 당시 조건이 고정돼야 함),
-- "지금 이 사람 계좌가 뭐였지"를 재사용할 수 있는 단일 소스가 없었던 게 진짜 문제.
--
-- 여기 추가하는 컬럼은 SOT(현재값)이고, contracts.contract_data.bankAccount/bankNumber는
-- 계약 체결 시점의 스냅샷 사본으로 계속 남는다 — 둘 다 유지, 역할만 분리.
-- lib/bankCryptoServer.ts의 AES-256-GCM(encryptBank/decryptBank)을 그대로 재사용.
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_number_enc text,
  ADD COLUMN IF NOT EXISTS bank_account_enc text;

COMMENT ON COLUMN users.bank_name IS '은행명 — 계좌번호 자체가 아니라 민감하지 않아 평문 저장';
COMMENT ON COLUMN users.bank_number_enc IS '계좌번호 (lib/bankCryptoServer.ts AES-256-GCM 암호화, enc:v1: 접두사)';
COMMENT ON COLUMN users.bank_account_enc IS '"은행명 계좌번호" 결합 표시용 문자열 (암호화) — contracts.contract_data.bankAccount와 동일 포맷';
