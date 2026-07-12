-- 피드 북마크(저장) 테이블 생성
CREATE TABLE IF NOT EXISTS feed_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_post_id UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (feed_post_id, user_id)
);

-- RLS 활성화
ALTER TABLE feed_bookmarks ENABLE ROW LEVEL SECURITY;

-- 본인의 북마크만 조회, 추가, 삭제가 가능하도록 RLS 정책 적용
DROP POLICY IF EXISTS "Users can manage their own bookmarks" ON feed_bookmarks;
CREATE POLICY "Users can manage their own bookmarks" ON feed_bookmarks
  FOR ALL USING (auth.uid() = user_id);
