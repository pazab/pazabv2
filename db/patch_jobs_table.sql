-- ================================================
-- patch_jobs_table.sql
-- 매장(employer_profiles) + 공고(jobs) 완전 분리
-- Supabase SQL Editor에서 실행
-- ================================================

-- 1. jobs 테이블 생성
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_profile_id UUID NOT NULL REFERENCES employer_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,

  -- 근무 조건
  wage INT,
  wage_negotiable BOOLEAN DEFAULT false,
  work_days TEXT,
  days_negotiable BOOLEAN DEFAULT false,
  work_hours TEXT,
  work_start_hour INT,
  work_end_hour INT,
  job_type TEXT DEFAULT 'regular',
  work_start_date DATE,
  work_end_date DATE,
  staff_count INT DEFAULT 1,

  -- 공고 옵션
  tags TEXT[],
  required_credentials JSONB,
  category_id UUID,
  category_ids UUID[],
  custom_category TEXT,
  meal_provided BOOLEAN DEFAULT false,
  parking BOOLEAN DEFAULT false,
  is_urgent BOOLEAN DEFAULT false,

  -- AI 분석
  tagline TEXT,
  employer_type TEXT,
  best_matches TEXT[],
  worst_matches TEXT[],
  caution TEXT,
  analyzed_mbti TEXT,
  bio5_data JSONB,
  hexaco_data JSONB,
  bot_knowledge TEXT,
  bot_interview_done BOOLEAN DEFAULT false,

  -- 통계
  like_count INT DEFAULT 0,
  view_count INT DEFAULT 0,

  -- 상태
  is_active BOOLEAN DEFAULT false,
  job_status TEXT DEFAULT 'active',
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1-b. 기존 jobs 테이블에 누락 컬럼 보완 (CREATE IF NOT EXISTS로 스킵된 경우 대비)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS like_count INT DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS wage_negotiable BOOLEAN DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS days_negotiable BOOLEAN DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_start_hour INT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_end_hour INT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_start_date DATE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_end_date DATE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS staff_count INT DEFAULT 1;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS required_credentials JSONB;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS category_id UUID;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS category_ids UUID[];
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS custom_category TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS meal_provided BOOLEAN DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parking BOOLEAN DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tagline TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS employer_type TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS best_matches TEXT[];
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS worst_matches TEXT[];
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS caution TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS analyzed_mbti TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS bio5_data JSONB;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS hexaco_data JSONB;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS bot_knowledge TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS bot_interview_done BOOLEAN DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_status TEXT DEFAULT 'active';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. 기존 employer_profiles 데이터 마이그레이션
INSERT INTO jobs (
  employer_profile_id, user_id,
  wage, wage_negotiable, work_days, days_negotiable,
  work_hours, work_start_hour, work_end_hour,
  job_type, work_start_date, work_end_date, staff_count,
  tags, required_credentials, category_id, category_ids, custom_category,
  meal_provided, parking, is_urgent,
  tagline, employer_type, best_matches, worst_matches, caution, analyzed_mbti,
  bio5_data, hexaco_data, bot_knowledge, bot_interview_done,
  like_count, view_count,
  is_active, job_status, expires_at, created_at
)
SELECT
  id, user_id,
  wage, COALESCE(wage_negotiable, false), work_days, COALESCE(days_negotiable, false),
  work_hours, work_start_hour, work_end_hour,
  COALESCE(job_type, 'regular'), work_start_date, work_end_date, COALESCE(staff_count, 1),
  tags, required_credentials, category_id, category_ids, custom_category,
  COALESCE(meal_provided, false), COALESCE(parking, false), COALESCE(is_urgent, false),
  tagline, employer_type, best_matches, worst_matches, caution, analyzed_mbti,
  bio5_data, hexaco_data, bot_knowledge, COALESCE(bot_interview_done, false),
  COALESCE(like_count, 0), COALESCE(view_count, 0),
  COALESCE(is_active, false), COALESCE(job_status, 'active'), expires_at, created_at
FROM employer_profiles
WHERE business_name IS NOT NULL
  AND (is_deleted IS NULL OR is_deleted = false);

-- 3. matches 에 job_id 추가 (신규 매칭부터 사용)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id);

-- 4. RLS
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs_select_public" ON jobs FOR SELECT USING (true);
CREATE POLICY "jobs_insert_own"    ON jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "jobs_update_own"    ON jobs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "jobs_delete_own"    ON jobs FOR DELETE USING (auth.uid() = user_id);

-- 5. Realtime
ALTER TABLE jobs REPLICA IDENTITY FULL;

-- 6. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jobs_updated_at ON jobs;
CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
