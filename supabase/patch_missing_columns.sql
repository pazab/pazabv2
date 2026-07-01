-- ============================================================
-- PAZAB v2 — 누락 컬럼 보완 패치
-- 코드에서 참조하지만 v2_schema.sql + 기존 패치에 없는 컬럼들
-- Supabase SQL Editor에서 실행
-- ============================================================

-- employer_profiles 누락 컬럼
ALTER TABLE employer_profiles
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS address_detail text,
  ADD COLUMN IF NOT EXISTS category_id uuid,
  ADD COLUMN IF NOT EXISTS category_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS custom_category text,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS staff_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS work_start_hour integer,
  ADD COLUMN IF NOT EXISTS work_end_hour integer,
  ADD COLUMN IF NOT EXISTS work_start_date date,
  ADD COLUMN IF NOT EXISTS work_end_date date,
  ADD COLUMN IF NOT EXISTS days_negotiable boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS bio5_data jsonb,
  ADD COLUMN IF NOT EXISTS tagline text,
  ADD COLUMN IF NOT EXISTS best_matches text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS worst_matches text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS caution text,
  ADD COLUMN IF NOT EXISTS analyzed_mbti text,
  ADD COLUMN IF NOT EXISTS bot_knowledge text,
  ADD COLUMN IF NOT EXISTS bot_interview_done boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS bot_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS required_credentials jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS employer_bot_knowledge text,
  ADD COLUMN IF NOT EXISTS geo_radius_meters integer DEFAULT 200;

-- users 누락 컬럼
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS real_name text,
  ADD COLUMN IF NOT EXISTS employer_bot_knowledge text,
  ADD COLUMN IF NOT EXISTS nickname_lower text;

-- worker_profiles 누락 컬럼
ALTER TABLE worker_profiles
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS sido text,
  ADD COLUMN IF NOT EXISTS sigungu text,
  ADD COLUMN IF NOT EXISTS eupmyeondong text,
  ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS work_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hexaco_data jsonb,
  ADD COLUMN IF NOT EXISTS bio5_data jsonb,
  ADD COLUMN IF NOT EXISTS analyzed_mbti text,
  ADD COLUMN IF NOT EXISTS tagline text,
  ADD COLUMN IF NOT EXISTS best_matches text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS worst_matches text[] DEFAULT '{}';

-- team_members 누락 컬럼
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS member_role text DEFAULT 'worker',
  ADD COLUMN IF NOT EXISTS contract_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS match_id uuid,
  ADD COLUMN IF NOT EXISTS employer_profile_id uuid REFERENCES employer_profiles(id);

-- attendance 누락 컬럼
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS team_member_id uuid,
  ADD COLUMN IF NOT EXISTS employer_id uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS worker_id uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS work_date date,
  ADD COLUMN IF NOT EXISTS check_in timestamptz,
  ADD COLUMN IF NOT EXISTS check_out timestamptz,
  ADD COLUMN IF NOT EXISTS actual_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS memo text;

-- attendance_logs 테이블 (없으면 생성)
CREATE TABLE IF NOT EXISTS attendance_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_member_id uuid,
  action text,
  actor_id uuid REFERENCES users(id),
  actor_role text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attendance_logs_all ON attendance_logs;
CREATE POLICY attendance_logs_all ON attendance_logs FOR ALL USING (true);

-- notifications 테이블 (없으면 생성)
CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  body text,
  url text,
  tag text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_select_own ON notifications;
CREATE POLICY notifications_select_own ON notifications FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS notifications_insert_all ON notifications;
CREATE POLICY notifications_insert_all ON notifications FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS notifications_update_own ON notifications;
CREATE POLICY notifications_update_own ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- tax_rates 테이블 (없으면 생성)
CREATE TABLE IF NOT EXISTS tax_rates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  year integer NOT NULL,
  health_insurance_rate numeric,
  employment_insurance_rate numeric,
  national_pension_rate numeric,
  industrial_accident_rate numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(year)
);
ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tax_rates_select_all ON tax_rates;
CREATE POLICY tax_rates_select_all ON tax_rates FOR SELECT USING (true);

-- push_subscriptions 테이블 (없으면 생성)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text,
  auth text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_sub_own ON push_subscriptions;
CREATE POLICY push_sub_own ON push_subscriptions FOR ALL USING (auth.uid() = user_id);
