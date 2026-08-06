-- ============================================================
-- daeta_postings 기간(연속 다일) 지원
-- 배경: 대타 SOS가 하루 단위(work_date 한 컬럼)로만 등록 가능해서,
--       이틀 이상 같은 시간대 커버가 필요하면 같은 사람이 공고 여러 건에
--       따로 지원해야 했고 중간 날짜를 다른 사람이 채가는 문제가 있었음.
--       work_date_end를 추가해 work_date(시작일)~work_date_end(종료일)
--       전체를 공고 1건으로 묶고, 수락 1번으로 기간 전체를 커버하게 함.
--       NULL이면 기존과 동일하게 하루짜리 공고.
-- Supabase SQL Editor에서 실행
-- ============================================================

ALTER TABLE daeta_postings
  ADD COLUMN IF NOT EXISTS work_date_end date;

COMMENT ON COLUMN daeta_postings.work_date_end IS '대타 근무 종료일 — NULL이면 work_date 하루만, 값 있으면 work_date~work_date_end 매일 같은 시간대를 한 공고로 커버 (2026-08-06)';
