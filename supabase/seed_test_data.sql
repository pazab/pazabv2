-- ============================================================
-- PAZAB v2 — 테스트 시드 데이터 SQL
-- 데이터베이스에 테스트용 사장님, 알바생, 팀원, 긴급대타 공고를 등록합니다.
-- ============================================================

-- 1. auth.users 테이블에 테스트 계정 생성 (비밀번호: password123)
-- (만약 이미 존재하는 UUID라면 충돌하지 않도록 처리합니다.)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
VALUES
  ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'employer1@pazab.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"김사장"}', now(), now(), 'authenticated', 'authenticated'),
  ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 'worker1@pazab.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"이알바"}', now(), now(), 'authenticated', 'authenticated'),
  ('c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', 'worker2@pazab.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"박대타"}', now(), now(), 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

-- 2. users 테이블에 연동 데이터 추가
INSERT INTO users (id, nickname, phone, user_type, onboarded, bank_verified, bank_verified_at, created_at, updated_at)
VALUES
  ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', '김사장님', '010-1234-5678', 'employer', true, true, now(), now(), now()),
  ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', '이알바', '010-9876-5432', 'worker', true, false, null, now(), now()),
  ('c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', '박대타', '010-5555-5555', 'worker', true, false, null, now(), now())
ON CONFLICT (id) DO NOTHING;

-- 3. employer_profiles (사장님 매장 프로필) 등록 (충남 아산시 신창면)
INSERT INTO employer_profiles (user_id, business_name, business_type, description, region, sido, sigungu, eupmyeondong, address, lat, lng, hr_only, is_active, created_at, updated_at)
VALUES
  ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', '파스쿠찌 아산신창점', '카페', '순천향대학교 인근 신창사거리에 위치한 파스쿠찌 카페입니다.', '충남 아산시 신창면', '충남', '아산시', '신창면', '충남 아산시 신창면 순천향로 22', 36.7845, 126.9385, false, true, now(), now())
ON CONFLICT (user_id) DO NOTHING;

-- 4. worker_profiles (알바생 프로필) 등록 (김사장 매장 근처 배치)
INSERT INTO worker_profiles (user_id, name, birth_year, gender, bio, job_categories, available_days, available_hours, desired_wage, region, sido, sigungu, eupmyeondong, lat, lng, is_verified, verified_reason, is_active, created_at, updated_at)
VALUES
  ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', '이알바', 2002, 'male', '카페 바리스타 경력 1년, 편의점 야간 근무 경력 6개월이 있습니다. 약속을 소중히 지킵니다.', ARRAY['카페', '편의점'], ARRAY['mon', 'wed', 'fri'], '09:00~18:00', 10000, '충남 아산시 신창면', '충남', '아산시', '신창면', 36.7852, 126.9362, true, 'bank_verified', true, now(), now()),
  ('c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', '박대타', 2000, 'female', '당일 갑작스러운 긴급 대타 전문 알바생입니다. 조리가 빠르고 친절하게 일합니다.', ARRAY['카페', '서빙', '편의점'], ARRAY['sat', 'sun'], '12:00~22:00', 12000, '충남 아산시 신창면', '충남', '아산시', '신창면', 36.7820, 126.9400, true, 'team_history', true, now(), now())
ON CONFLICT (user_id) DO NOTHING;

-- 5. team_members (김사장의 매장 소속 직원으로 등록)
INSERT INTO team_members (employer_id, worker_id, nickname, role_desc, wage, work_hours, status, invite_status, invited_at, created_at, updated_at)
VALUES
  ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', '민우(주중알바)', '바리스타 & 오픈조', 9860, '월수금 09:00~15:00', 'active', 'joined', now(), now(), now())
ON CONFLICT DO NOTHING;

-- 6. daeta_postings (긴급 대타 모집 공고) 등록
INSERT INTO daeta_postings (user_id, business_name, business_type, region, address, lat, lng, work_date, work_hours, wage, duty, secure_option, short_code, status, created_at, expires_at)
VALUES
  ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', '파스쿠찌 아산신창점', '카페', '충남 아산시 신창면', '충남 아산시 신창면 순천향로 22', 36.7845, 126.9385, CURRENT_DATE + 1, '13:00 ~ 18:00', 12500, '매장 음료 제조, 카운터 주문 접수 및 홀 정리정돈', true, 'SOS119', 'pending', now(), now() + INTERVAL '24 hours')
ON CONFLICT DO NOTHING;
