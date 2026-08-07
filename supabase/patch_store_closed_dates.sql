-- ============================================================
-- 특정 날짜 휴무(명절 연휴, 임시 휴무 등) — 요일별 정기 영업시간과 별개
-- 실행: Supabase SQL Editor (clrjxxkgceluvzvrkvyl)
-- ============================================================

ALTER TABLE employer_profiles
  ADD COLUMN IF NOT EXISTS closed_dates jsonb DEFAULT '[]';

COMMENT ON COLUMN employer_profiles.closed_dates IS '특정 날짜 휴무 — [{"date":"2026-09-16","reason":"추석연휴"}, ...], lib/businessHours.ts ClosedDate 타입 참조';
