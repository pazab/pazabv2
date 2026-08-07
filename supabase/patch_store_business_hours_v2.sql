-- ============================================================
-- 영업시간을 요일별 구조(jsonb)로 변경
-- patch_store_profile_extra.sql에서 text로 만들었던 걸 대체 — 이미 실행했어도 이 파일만 추가 실행하면 됨
-- 실행: Supabase SQL Editor (clrjxxkgceluvzvrkvyl)
-- ============================================================

ALTER TABLE employer_profiles DROP COLUMN IF EXISTS business_hours;
ALTER TABLE employer_profiles ADD COLUMN business_hours jsonb;

COMMENT ON COLUMN employer_profiles.business_hours IS '요일별 영업시간 — {"월":{"open":"10:00","close":"22:00","closed":false}, "화":{...}, ...}';
