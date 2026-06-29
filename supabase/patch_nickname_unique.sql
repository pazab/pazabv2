-- nickname 고유성 보장 (대소문자 구분 없이)
-- 중복 닉네임이 있다면 먼저 확인
-- SELECT nickname, COUNT(*) FROM users WHERE nickname IS NOT NULL GROUP BY nickname HAVING COUNT(*) > 1;

-- unique index (대소문자 무시)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname_lower ON users (lower(nickname))
  WHERE nickname IS NOT NULL AND nickname != '';
