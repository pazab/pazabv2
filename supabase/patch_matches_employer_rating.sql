-- ============================================================
-- PAZAB v2 — MATCHES 테이블에 사장님 평가(별점) 컬럼 추가
-- 대타 완료 처리 시 사장님이 남기는 1~5점 평가(선택).
-- trust_score에 자동 반영되어 lib/daetaTier.ts의 Tier1 판정에 연동됨
-- (STRATEGY.md §4 "구현 갭" 대응).
-- Supabase SQL Editor에서 실행하시면 즉시 반영됩니다.
-- ============================================================

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS employer_rating smallint;

ALTER TABLE matches
  DROP CONSTRAINT IF EXISTS matches_employer_rating_check;

ALTER TABLE matches
  ADD CONSTRAINT matches_employer_rating_check CHECK (employer_rating IS NULL OR (employer_rating BETWEEN 1 AND 5));
