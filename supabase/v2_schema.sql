-- ============================================================
-- PAZAB v2 — 통합 스키마 SQL
-- 새 Supabase 프로젝트에 한 번에 적용
-- 작성일: 2026-06-29
-- 핸드북 참조: docs/v2/PAZAB_HANDBOOK_FULL.md (STEP 1~6 DB 변경사항 전부 포함)
-- ============================================================

-- ============================================================
-- 0. Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. USERS
-- 기존 Supabase auth.users와 연동. 온보딩 상태·역할·계좌인증·HEXACO 포함.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 기본 정보
  nickname text,
  profile_image_url text,
  phone text,

  -- 역할 (STEP 1: NULL 허용 — 지연 확정)
  user_type text DEFAULT NULL,            -- NULL | 'employer' | 'worker' | 'both'
  role_inferred text DEFAULT NULL,        -- 행동 기반 잠정 추론값 (분석용 로깅)

  -- 온보딩 (STEP 1)
  onboarded boolean DEFAULT false,
  onboarding_data jsonb DEFAULT NULL,
  -- onboarding_data 구조:
  -- { region, lat, lng, industries:[...], availability:'weekday'|'weekend'|'any', created_at }

  -- 계좌 실명인증 (STEP 3: 사장님 필수 / 알바생 정산직전)
  bank_verified boolean DEFAULT false,
  bank_verified_at timestamptz DEFAULT NULL,

  -- HEXACO (STEP 5: 가입 동선 외부. 완료 추적)
  hexaco_done boolean DEFAULT false,
  hexaco_version text DEFAULT '5turn',   -- '5turn' | '10turn' (레거시)

  -- 성향 분석 결과 (기존 구조 유지)
  worker_result jsonb DEFAULT NULL,
  employer_result jsonb DEFAULT NULL,

  -- 알림 토큰
  push_token text,

  -- 카카오 연동 정보
  kakao_id text,

  -- 메타
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select_own" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "users_insert_own" ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================================
-- 2. WORKER_PROFILES
-- 알바생 프로필. 좌표·검증 상태 포함 (STEP 1·2·6)
-- ============================================================
CREATE TABLE IF NOT EXISTS worker_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE UNIQUE,

  -- 기본 프로필
  name text,
  birth_year integer,
  gender text,                         -- 'male' | 'female' | 'other'
  bio text,
  profile_image_url text,
  video_url text,

  -- 업종/직무 선호
  job_categories text[] DEFAULT '{}',
  available_days text[] DEFAULT '{}',  -- ['mon','tue',...,'sun']
  available_hours text,                -- 예: '09:00~18:00'
  desired_wage integer,

  -- 위치 (STEP 1·6: 주소검색으로 확보, GPS 강제 없음)
  region text,                         -- '충남 아산시 신창면'
  sido text,
  sigungu text,
  eupmyeondong text,
  lat double precision DEFAULT NULL,
  lng double precision DEFAULT NULL,

  -- 검증 상태 (STEP 2·3: Tier 판정용 캐시)
  is_verified boolean DEFAULT false,
  verified_reason text DEFAULT NULL,   -- 'team_history' | 'attendance' | 'bank_verified'

  -- HEXACO 데이터 (폴백 체인: profiles → users.worker_result.hexaco → DEFAULT)
  hexaco_data jsonb DEFAULT NULL,

  -- 활성 상태
  is_active boolean DEFAULT true,

  -- 메타
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE worker_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "worker_profiles_select_all"  ON worker_profiles FOR SELECT USING (true);
CREATE POLICY "worker_profiles_insert_own"  ON worker_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "worker_profiles_update_own"  ON worker_profiles FOR UPDATE USING (auth.uid() = user_id);

-- 좌표 인덱스 (STEP 6: nearby_workers RPC 성능)
CREATE INDEX IF NOT EXISTS idx_worker_lat_lng ON worker_profiles(lat, lng);
CREATE INDEX IF NOT EXISTS idx_worker_is_active ON worker_profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_worker_is_verified ON worker_profiles(is_verified);

-- ============================================================
-- 3. EMPLOYER_PROFILES
-- 사장님 프로필. 좌표·HR전용 플래그 포함 (STEP 1·2·6)
-- ============================================================
CREATE TABLE IF NOT EXISTS employer_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE UNIQUE,

  -- 가게 정보
  business_name text,
  business_type text,                  -- '카페', '한식', '편의점' ...
  description text,
  business_image_url text,

  -- 위치 (STEP 1·6)
  region text,
  sido text,
  sigungu text,
  eupmyeondong text,
  address text,
  lat double precision DEFAULT NULL,
  lng double precision DEFAULT NULL,

  -- HR 플래그 (STEP 2: 공고 없이 HR만 사용 중인지)
  hr_only boolean DEFAULT true,         -- 가게셋업만=true, 공고올리면=false

  -- 공고 상태 (레거시 호환)
  job_status text DEFAULT 'closed',     -- 'open' | 'closed'

  -- 활성 상태
  is_active boolean DEFAULT true,

  -- 메타
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE employer_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employer_profiles_select_all"  ON employer_profiles FOR SELECT USING (true);
CREATE POLICY "employer_profiles_insert_own"  ON employer_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "employer_profiles_update_own"  ON employer_profiles FOR UPDATE USING (auth.uid() = user_id);

-- 좌표 인덱스 (STEP 6)
CREATE INDEX IF NOT EXISTS idx_employer_lat_lng ON employer_profiles(lat, lng);

-- ============================================================
-- 4. TEAM_MEMBERS
-- 사장님↔알바 팀. 별명 단독 등록 허용 (STEP 2·4)
-- ============================================================
CREATE TABLE IF NOT EXISTS team_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 사장님 (필수)
  employer_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,

  -- 알바생 (STEP 2: NULL 허용 — 별명만으로 먼저 등록)
  worker_id uuid REFERENCES users(id) ON DELETE SET NULL DEFAULT NULL,

  -- 기본 정보
  nickname text,                       -- 별명만 있을 때 표시용
  role_desc text,                      -- 포지션 설명 ('홀', '주방' 등)
  wage integer,
  work_hours text,                     -- 근무시간 패턴

  -- 상태
  status text DEFAULT 'active',        -- 'active' | 'inactive' | 'left'

  -- 초대 상태 (STEP 2·4: 별명→초대→수락 흐름)
  invite_status text DEFAULT 'none',   -- 'none' | 'invited' | 'joined'
  invited_at timestamptz DEFAULT NULL,

  -- 메타
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_members_select_team" ON team_members FOR SELECT USING (
  auth.uid() = employer_id OR auth.uid() = worker_id
);
CREATE POLICY "team_members_insert_employer" ON team_members FOR INSERT WITH CHECK (auth.uid() = employer_id);
CREATE POLICY "team_members_update_employer" ON team_members FOR UPDATE USING (auth.uid() = employer_id);

CREATE INDEX IF NOT EXISTS idx_team_members_employer ON team_members(employer_id);
CREATE INDEX IF NOT EXISTS idx_team_members_worker   ON team_members(worker_id);

-- ============================================================
-- 5. INVITE_CODES
-- 알바생 초대 코드 (STEP 4: 팀 편입용 확장)
-- ============================================================
CREATE TABLE IF NOT EXISTS invite_codes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,

  -- 발급자
  employer_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,

  -- 초대 대상 (STEP 4)
  team_member_id uuid REFERENCES team_members(id) ON DELETE SET NULL DEFAULT NULL,
  role text DEFAULT 'worker',          -- 'worker' | 'employer'

  -- 상태
  used_at timestamptz DEFAULT NULL,
  expires_at timestamptz DEFAULT NULL,

  -- 메타
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invite_codes_select_public"   ON invite_codes FOR SELECT USING (true);
CREATE POLICY "invite_codes_insert_employer" ON invite_codes FOR INSERT WITH CHECK (auth.uid() = employer_id);
CREATE POLICY "invite_codes_update_employer" ON invite_codes FOR UPDATE USING (auth.uid() = employer_id);

-- ============================================================
-- 6. ATTENDANCE (근태)
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_member_id uuid REFERENCES team_members(id) ON DELETE CASCADE NOT NULL,
  employer_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  worker_id uuid REFERENCES users(id) ON DELETE CASCADE,

  work_date date NOT NULL,
  clock_in timestamptz,
  clock_out timestamptz,
  status text DEFAULT 'absent',        -- 'present' | 'absent' | 'late' | 'early_leave'
  memo text,

  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_select_team" ON attendance FOR SELECT USING (
  auth.uid() = employer_id OR auth.uid() = worker_id
);
CREATE POLICY "attendance_insert_employer" ON attendance FOR INSERT WITH CHECK (auth.uid() = employer_id);
CREATE POLICY "attendance_update_employer" ON attendance FOR UPDATE USING (auth.uid() = employer_id);

CREATE INDEX IF NOT EXISTS idx_attendance_team_member ON attendance(team_member_id);
CREATE INDEX IF NOT EXISTS idx_attendance_work_date   ON attendance(work_date);

-- ============================================================
-- 7. PAYSLIPS (급여명세서)
-- ============================================================
CREATE TABLE IF NOT EXISTS payslips (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employer_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  worker_id uuid REFERENCES users(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES team_members(id) ON DELETE SET NULL,

  pay_period_start date NOT NULL,
  pay_period_end date NOT NULL,
  base_wage integer NOT NULL,
  total_hours numeric(5,2),
  total_amount integer NOT NULL,
  deductions integer DEFAULT 0,
  net_amount integer NOT NULL,
  memo text,

  issued_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payslips_select_team" ON payslips FOR SELECT USING (
  auth.uid() = employer_id OR auth.uid() = worker_id
);
CREATE POLICY "payslips_insert_employer" ON payslips FOR INSERT WITH CHECK (auth.uid() = employer_id);

-- ============================================================
-- 8. JOB_POSTINGS (일반 공고 — employer_profiles.hr_only=false일 때)
-- ============================================================
CREATE TABLE IF NOT EXISTS job_postings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,

  title text NOT NULL,
  business_name text,
  business_type text,
  region text,
  address text,
  lat double precision,
  lng double precision,

  job_categories text[] DEFAULT '{}',
  required_days text[] DEFAULT '{}',
  work_hours text,
  wage integer,
  wage_type text DEFAULT 'hourly',     -- 'hourly' | 'daily' | 'monthly'
  description text,
  requirements text,

  image_urls text[] DEFAULT '{}',
  video_url text,

  status text DEFAULT 'open',          -- 'open' | 'closed' | 'paused'

  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_postings_select_open" ON job_postings FOR SELECT USING (status = 'open' OR auth.uid() = user_id);
CREATE POLICY "job_postings_insert_auth" ON job_postings FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "job_postings_update_own"  ON job_postings FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_job_postings_status  ON job_postings(status);
CREATE INDEX IF NOT EXISTS idx_job_postings_lat_lng ON job_postings(lat, lng);

-- ============================================================
-- 9. DAETA_POSTINGS (긴급 대타 공고 — STEP 3)
-- ============================================================
CREATE TABLE IF NOT EXISTS daeta_postings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,

  business_name text NOT NULL,
  business_type text NOT NULL,
  region text NOT NULL,
  address text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,

  work_date date NOT NULL,
  work_hours text NOT NULL,
  wage integer NOT NULL,
  duty text NOT NULL,
  secure_option boolean DEFAULT false,

  -- 딥링크 단축코드 (STEP 3)
  short_code text DEFAULT NULL,

  status text DEFAULT 'pending',       -- 'pending' | 'matched' | 'completed' | 'cancelled'

  created_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz NOT NULL
);

ALTER TABLE daeta_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daeta_postings_select_all"  ON daeta_postings FOR SELECT USING (true);
CREATE POLICY "daeta_postings_insert_auth" ON daeta_postings FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "daeta_postings_update_own"  ON daeta_postings FOR UPDATE USING (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daeta_short_code ON daeta_postings(short_code)
  WHERE short_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_daeta_status  ON daeta_postings(status);
CREATE INDEX IF NOT EXISTS idx_daeta_lat_lng ON daeta_postings(lat, lng);

-- ============================================================
-- 10. MATCHES
-- ============================================================
CREATE TABLE IF NOT EXISTS matches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  employer_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  worker_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  job_posting_id uuid REFERENCES job_postings(id) ON DELETE SET NULL DEFAULT NULL,
  daeta_posting_id uuid REFERENCES daeta_postings(id) ON DELETE SET NULL DEFAULT NULL,

  match_score integer DEFAULT 0,
  worker_tier text DEFAULT NULL,       -- STEP 3: SOS 시점 Tier 스냅샷
  status text DEFAULT 'pending',

  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matches_select_parties" ON matches FOR SELECT USING (
  auth.uid() = employer_id OR auth.uid() = worker_id
);
CREATE POLICY "matches_insert_employer" ON matches FOR INSERT WITH CHECK (auth.uid() = employer_id);
CREATE POLICY "matches_update_parties" ON matches FOR UPDATE USING (
  auth.uid() = employer_id OR auth.uid() = worker_id
);

CREATE INDEX IF NOT EXISTS idx_matches_employer ON matches(employer_id);
CREATE INDEX IF NOT EXISTS idx_matches_worker   ON matches(worker_id);
CREATE INDEX IF NOT EXISTS idx_matches_status   ON matches(status);

-- ============================================================
-- 11. CHATROOMS & MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS chatrooms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employer_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  worker_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  match_id uuid REFERENCES matches(id) ON DELETE SET NULL DEFAULT NULL,
  last_message text,
  last_message_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(employer_id, worker_id)
);

ALTER TABLE chatrooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chatrooms_select_parties" ON chatrooms FOR SELECT USING (
  auth.uid() = employer_id OR auth.uid() = worker_id
);
CREATE POLICY "chatrooms_insert_auth" ON chatrooms FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "chatrooms_update_parties" ON chatrooms FOR UPDATE USING (
  auth.uid() = employer_id OR auth.uid() = worker_id
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chatroom_id uuid REFERENCES chatrooms(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_select_parties" ON messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM chatrooms c WHERE c.id = chatroom_id
    AND (c.employer_id = auth.uid() OR c.worker_id = auth.uid())
  )
);
CREATE POLICY "messages_insert_auth" ON messages FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE INDEX IF NOT EXISTS idx_messages_chatroom ON messages(chatroom_id, created_at);

-- ============================================================
-- 12. CONTRACTS
-- ============================================================
CREATE TABLE IF NOT EXISTS contracts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employer_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  worker_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  team_member_id uuid REFERENCES team_members(id) ON DELETE SET NULL,

  contract_type text DEFAULT 'parttime',
  start_date date,
  end_date date,
  work_hours text,
  wage integer,
  wage_type text DEFAULT 'hourly',
  duties text,
  workplace_address text,

  employer_signed boolean DEFAULT false,
  worker_signed boolean DEFAULT false,
  employer_signed_at timestamptz,
  worker_signed_at timestamptz,

  pdf_url text,
  status text DEFAULT 'draft',

  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contracts_select_parties" ON contracts FOR SELECT USING (
  auth.uid() = employer_id OR auth.uid() = worker_id
);
CREATE POLICY "contracts_insert_employer" ON contracts FOR INSERT WITH CHECK (auth.uid() = employer_id);
CREATE POLICY "contracts_update_parties" ON contracts FOR UPDATE USING (
  auth.uid() = employer_id OR auth.uid() = worker_id
);

-- ============================================================
-- 13. SUDOKU
-- ============================================================
CREATE TABLE IF NOT EXISTS sudoku_ratings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  rating integer DEFAULT 1000,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE sudoku_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sudoku_ratings_select_all" ON sudoku_ratings FOR SELECT USING (true);
CREATE POLICY "sudoku_ratings_insert_own" ON sudoku_ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sudoku_ratings_update_own" ON sudoku_ratings FOR UPDATE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS sudoku_records (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  difficulty text NOT NULL,
  time_seconds integer NOT NULL,
  rating_before integer,
  rating_after integer,
  rating_delta integer,
  solved boolean DEFAULT true,
  opponent_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE sudoku_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sudoku_records_select_own" ON sudoku_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sudoku_records_insert_own" ON sudoku_records FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sudoku_records_user ON sudoku_records(user_id, created_at);

-- ============================================================
-- 14. PAZ_MEMORY
-- ============================================================
CREATE TABLE IF NOT EXISTS paz_memory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  memory_type text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE paz_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paz_memory_own" ON paz_memory FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_paz_memory_user ON paz_memory(user_id, memory_type);

-- ============================================================
-- 15. NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb DEFAULT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_own" ON notifications FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at);

-- ============================================================
-- 16. RPC FUNCTIONS
-- ============================================================

-- nearby_workers: 좌표 박스 필터 (STEP 3·6)
CREATE OR REPLACE FUNCTION nearby_workers(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision DEFAULT 10
) RETURNS SETOF worker_profiles AS $$
  SELECT * FROM worker_profiles
  WHERE lat BETWEEN p_lat - (p_radius_km / 111.0) AND p_lat + (p_radius_km / 111.0)
    AND lng BETWEEN p_lng - (p_radius_km / 88.0)  AND p_lng + (p_radius_km / 88.0)
    AND is_active = true;
$$ LANGUAGE sql STABLE;

-- ============================================================
-- 17. TRIGGERS — updated_at 자동갱신
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at             BEFORE UPDATE ON users             FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_worker_profiles_updated_at   BEFORE UPDATE ON worker_profiles   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_employer_profiles_updated_at BEFORE UPDATE ON employer_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_team_members_updated_at      BEFORE UPDATE ON team_members      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_matches_updated_at           BEFORE UPDATE ON matches           FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_sudoku_ratings_updated_at    BEFORE UPDATE ON sudoku_ratings    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 18. 0번 레퍼런스 시드 (출시 전 1회 실행 — 개발자 매장 셋업)
-- ============================================================
-- 아래 주석을 해제하고 실제 user_id 값으로 교체 후 실행하세요.
--
-- UPDATE employer_profiles
--   SET business_name = '파스쿠찌 신창점',
--       business_type = '카페',
--       region = '충남 아산시 신창면',
--       sido = '충남', sigungu = '아산시', eupmyeondong = '신창면',
--       lat = 36.78, lng = 126.95,
--       hr_only = true
--   WHERE user_id = '{개발자_USER_ID}';
--
-- INSERT INTO team_members (employer_id, worker_id, nickname, invite_status)
-- VALUES
--   ('{개발자_USER_ID}', '{알바1_USER_ID}', '재훈이', 'joined'),
--   ('{개발자_USER_ID}', '{알바2_USER_ID}', '수진',   'joined');
--
-- UPDATE worker_profiles
--   SET is_verified = true, verified_reason = 'team_history'
--   WHERE user_id IN ('{알바1_USER_ID}', '{알바2_USER_ID}');

-- ============================================================
-- END OF SCHEMA
-- ============================================================
