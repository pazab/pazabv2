-- ============================================================
-- 대타 SOS 휴게시간(근로기준법 제54조 준수) — 등록 시 입력, 정산 시 근무시간에서 차감
-- 실행: Supabase SQL Editor (clrjxxkgceluvzvrkvyl)
-- ============================================================

ALTER TABLE daeta_postings
  ADD COLUMN IF NOT EXISTS break_minutes integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN daeta_postings.break_minutes IS '근무 도중 부여하는 휴게시간(분). 근로기준법 54조 — 4시간↑ 30분, 8시간↑ 1시간 이상 법정 최소. 정산(/api/daeta/complete) 시 실제/예정 근무시간에서 이만큼 차감해서 임금 계산.';
