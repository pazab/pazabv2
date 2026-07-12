-- 피드 게시글 테이블 생성
CREATE TABLE IF NOT EXISTS feed_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT,
  media_urls TEXT[] DEFAULT '{}',
  media_type TEXT DEFAULT 'image', -- 'image' | 'video'
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 피드 좋아요 테이블 생성
CREATE TABLE IF NOT EXISTS feed_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_post_id UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (feed_post_id, user_id)
);

-- 피드 댓글 테이블 생성
CREATE TABLE IF NOT EXISTS feed_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_post_id UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Realtime 동기화를 위해 REPLICA IDENTITY FULL 지정
ALTER TABLE feed_posts REPLICA IDENTITY FULL;
ALTER TABLE feed_likes REPLICA IDENTITY FULL;
ALTER TABLE feed_comments REPLICA IDENTITY FULL;

-- Row Level Security (RLS) 활성화
ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_comments ENABLE ROW LEVEL SECURITY;

-- 1. feed_posts 정책
DROP POLICY IF EXISTS "Anyone can select posts" ON feed_posts;
CREATE POLICY "Anyone can select posts" ON feed_posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own posts" ON feed_posts;
CREATE POLICY "Users can insert their own posts" ON feed_posts FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update/delete their own posts" ON feed_posts;
CREATE POLICY "Users can update/delete their own posts" ON feed_posts FOR ALL USING (auth.uid() = user_id);

-- 2. feed_likes 정책
DROP POLICY IF EXISTS "Anyone can select likes" ON feed_likes;
CREATE POLICY "Anyone can select likes" ON feed_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert likes" ON feed_likes;
CREATE POLICY "Users can insert likes" ON feed_likes FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own likes" ON feed_likes;
CREATE POLICY "Users can delete their own likes" ON feed_likes FOR DELETE USING (auth.uid() = user_id);

-- 3. feed_comments 정책
DROP POLICY IF EXISTS "Anyone can select comments" ON feed_comments;
CREATE POLICY "Anyone can select comments" ON feed_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert comments" ON feed_comments;
CREATE POLICY "Users can insert comments" ON feed_comments FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete/update their own comments" ON feed_comments;
CREATE POLICY "Users can delete/update their own comments" ON feed_comments FOR ALL USING (auth.uid() = user_id);
