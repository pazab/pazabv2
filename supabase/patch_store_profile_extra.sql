-- ============================================================
-- 매장 홈 정보 확장: 영업시간 + 복지 태그(사장님 자율 선택형)
-- 실행: Supabase SQL Editor (clrjxxkgceluvzvrkvyl)
-- ============================================================

ALTER TABLE employer_profiles
  ADD COLUMN IF NOT EXISTS business_hours text,
  ADD COLUMN IF NOT EXISTS perks text[] DEFAULT '{}';

COMMENT ON COLUMN employer_profiles.business_hours IS '매장 홈 노출용 영업시간 자유 텍스트 (예: 매일 10:00-22:00)';
COMMENT ON COLUMN employer_profiles.perks IS '매장 홈 노출용 복지 태그 — 사장님이 직접 선택 (자율 opt-in, 미선택 시 비노출)';
