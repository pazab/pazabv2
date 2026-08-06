-- ============================================================
-- 대타 공고 → 매장 홈 링크용 employer_profile_id 보완
-- 실행: Supabase SQL Editor (clrjxxkgceluvzvrkvyl)
-- ============================================================

ALTER TABLE daeta_postings
  ADD COLUMN IF NOT EXISTS employer_profile_id uuid REFERENCES employer_profiles(id);

-- 기존 공고 백필 — employer_profiles.user_id가 UNIQUE라 daeta_postings.user_id로 안전하게 역추적 가능
UPDATE daeta_postings dp
SET employer_profile_id = ep.id
FROM employer_profiles ep
WHERE dp.employer_profile_id IS NULL AND ep.user_id = dp.user_id;

COMMENT ON COLUMN daeta_postings.employer_profile_id IS '공고 카드의 "매장 홈 보기" 링크(/store/{id})용 — employer_profiles 참조';
