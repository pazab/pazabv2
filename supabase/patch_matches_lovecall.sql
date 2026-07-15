-- ============================================================
-- PAZAB v2 — MATCHES 테이블 러브콜/지원하기 누락 컬럼 추가 패치 SQL
-- Supabase SQL Editor에서 실행하시면 즉시 반영됩니다.
-- ============================================================

-- 1. matches 테이블 누락 컬럼 추가
ALTER TABLE matches 
  ADD COLUMN IF NOT EXISTS employer_interest boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS worker_interest boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS employer_profile_id uuid REFERENCES employer_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message text DEFAULT '',
  ADD COLUMN IF NOT EXISTS expired_at timestamptz DEFAULT (now() + interval '7 days');

-- 2. 신속한 조회를 위한 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_matches_job_id ON matches(job_id);
CREATE INDEX IF NOT EXISTS idx_matches_employer_profile_id ON matches(employer_profile_id);
