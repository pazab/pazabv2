-- ================================================
-- patch_feed_store.sql
-- 피드 게시물을 특정 매장(employer_profiles)에 귀속시키고,
-- 매장을 팔로우할 수 있는 "매장 홈" 기능 지원
-- Supabase SQL Editor에서 실행
-- ================================================

-- 1. feed_posts에 employer_profile_id 추가 (다중 매장 사장님의 경우 어느 매장 글인지 구분)
ALTER TABLE feed_posts
  ADD COLUMN IF NOT EXISTS employer_profile_id uuid REFERENCES employer_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_feed_posts_employer_profile_id ON feed_posts(employer_profile_id);

-- 2. 매장 팔로우 테이블
CREATE TABLE IF NOT EXISTS store_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employer_profile_id UUID NOT NULL REFERENCES employer_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, employer_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_store_follows_employer_profile_id ON store_follows(employer_profile_id);

ALTER TABLE store_follows REPLICA IDENTITY FULL;
ALTER TABLE store_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can select store follows" ON store_follows;
CREATE POLICY "Anyone can select store follows" ON store_follows FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can follow stores" ON store_follows;
CREATE POLICY "Users can follow stores" ON store_follows FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unfollow stores" ON store_follows;
CREATE POLICY "Users can unfollow stores" ON store_follows FOR DELETE USING (auth.uid() = user_id);
