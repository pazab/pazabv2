-- ============================================================
-- daeta_postings.required_credentials 누락 컬럼 보완
-- 원인: patch_missing_columns.sql이 required_credentials를
--       employer_profiles에만 추가하고 daeta_postings에는 빠뜨림.
--       DaetaRegisterModal.tsx가 daeta_postings insert/update 시
--       이 컬럼을 사용하므로 반드시 필요.
-- Supabase SQL Editor에서 실행
-- ============================================================

ALTER TABLE daeta_postings
  ADD COLUMN IF NOT EXISTS required_credentials jsonb DEFAULT '[]';

COMMENT ON COLUMN daeta_postings.required_credentials IS '대타 공고 필수/우대 자격 요건 목록 (JSON 배열)';
