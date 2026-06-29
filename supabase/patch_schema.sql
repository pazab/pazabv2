-- ============================================================
-- PAZAB v2 — 데이터베이스 스키마 패치 SQL
-- 프론트엔드 코드(mypage, explore 등)가 참조하는 누락된 테이블 및 컬럼을 보완합니다.
-- Supabase SQL Editor에서 실행하시면 즉시 반영됩니다.
-- ============================================================

-- 1. users 테이블 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trust_score integer DEFAULT 50;
ALTER TABLE users ADD COLUMN IF NOT EXISTS grade text DEFAULT 'bronze';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;

-- 2. employer_profiles 테이블 컬럼 추가
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false NOT NULL;
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS job_type text DEFAULT 'regular';
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS wage integer;
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS wage_negotiable boolean DEFAULT false;
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS work_days text;
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS work_hours text;
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS is_urgent boolean DEFAULT false;
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS is_long_term boolean DEFAULT false;
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS meal_provided boolean DEFAULT false;
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS parking boolean DEFAULT false;
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}';
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS employer_type text;
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS hexaco_data jsonb;
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0;
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS like_count integer DEFAULT 0;

-- 3. worker_profiles 테이블 컬럼 추가
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true;
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS experience text;
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS experience_months integer DEFAULT 0;
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS available_now boolean DEFAULT false;
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS grade text DEFAULT 'bronze';
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS trust_score integer DEFAULT 50;
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS tagline text;
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0;
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS like_count integer DEFAULT 0;
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS desired_region text;
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS desired_type text;
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS worker_type text;

-- 4. matches 테이블 컬럼 추가
ALTER TABLE matches ADD COLUMN IF NOT EXISTS progress_status text DEFAULT 'pending';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS interview_at timestamptz;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS interview_memo text;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS employer_left boolean DEFAULT false;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS worker_left boolean DEFAULT false;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS matched_at timestamptz DEFAULT now();
ALTER TABLE matches ADD COLUMN IF NOT EXISTS initiated_by uuid REFERENCES users(id);

-- 5. chats 테이블 생성 (메시지 보관용)
CREATE TABLE IF NOT EXISTS chats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id uuid REFERENCES matches(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  receiver_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  message text NOT NULL,
  message_type text DEFAULT 'text' NOT NULL,
  is_read boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chats_select_parties ON chats;
CREATE POLICY chats_select_parties ON chats FOR SELECT USING (
  auth.uid() = sender_id OR auth.uid() = receiver_id
);
DROP POLICY IF EXISTS chats_insert_auth ON chats;
CREATE POLICY chats_insert_auth ON chats FOR INSERT WITH CHECK (
  auth.uid() = sender_id
);
DROP POLICY IF EXISTS chats_update_parties ON chats;
CREATE POLICY chats_update_parties ON chats FOR UPDATE USING (
  auth.uid() = sender_id OR auth.uid() = receiver_id
);

-- 6. user_badges 테이블 생성
CREATE TABLE IF NOT EXISTS user_badges (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  badge_key text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, badge_key)
);
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_badges_select_all ON user_badges;
CREATE POLICY user_badges_select_all ON user_badges FOR SELECT USING (true);
DROP POLICY IF EXISTS user_badges_insert_admin ON user_badges;
CREATE POLICY user_badges_insert_admin ON user_badges FOR ALL USING (true);

-- 7. bot_chat_logs 테이블 생성 (AI 상담 로그 보관용)
CREATE TABLE IF NOT EXISTS bot_chat_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employer_profile_id uuid REFERENCES employer_profiles(id) ON DELETE SET NULL,
  worker_profile_id uuid REFERENCES worker_profiles(id) ON DELETE SET NULL,
  business_type text,
  question text,
  answer text,
  category text,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  bot_uncertain boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE bot_chat_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bot_chat_logs_all ON bot_chat_logs;
CREATE POLICY bot_chat_logs_all ON bot_chat_logs FOR ALL USING (true);
