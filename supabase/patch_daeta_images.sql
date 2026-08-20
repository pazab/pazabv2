-- ============================================================
-- PAZAB v2 — daeta_postings 업무 사진 컬럼 추가
-- Supabase SQL Editor에서 실행
-- ============================================================

ALTER TABLE daeta_postings
  ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}';
