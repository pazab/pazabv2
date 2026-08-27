-- ============================================================
-- PAZAB v2 — 탈퇴 유예기간(cool-off) 지원
--
-- 배경: 지금까지 탈퇴 버튼을 누르면 즉시 익명화+로그인차단이 실행돼 되돌릴 방법이
-- 없었다. 이 컬럼이 채워지는 동안은 "탈퇴 신청" 상태 — 로그인은 계속 가능하고
-- 마이페이지에 취소 버튼이 뜬다. app/api/cron/finalize-withdrawal이 매일 이 값이
-- 7일 이상 지난 계정을 찾아 실제 익명화(app/api/withdraw의 기존 로직)를 실행한다.
--
-- Supabase SQL Editor에서 실행
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS withdrawal_requested_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_withdrawal_requested_at ON users(withdrawal_requested_at)
  WHERE withdrawal_requested_at IS NOT NULL;
