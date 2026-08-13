-- 대타 퇴근 체크아웃 + 실근무시간 기반 정산용 컬럼 추가 (2026-08-14)
-- checked_out_at: 알바생이 "퇴근했어요"를 누른 시각. checked_in_at(patch_daeta_noshow_auto.sql)과
-- 짝을 이뤄 app/api/daeta/complete에서 실제 근무시간(초과근무 포함) 정산에 사용됨.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS checked_out_at timestamptz;
