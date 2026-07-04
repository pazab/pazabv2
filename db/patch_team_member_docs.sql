-- team_members에 서류 제출 현황 컬럼 추가
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS docs_submitted JSONB DEFAULT '{}';
