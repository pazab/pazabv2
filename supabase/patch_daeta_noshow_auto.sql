-- 대타 자동 노쇼 판정 + 자동 재확산용 컬럼 추가 (2026-08-13)
-- checked_in_at: 알바생이 "출근했어요"를 누른 시각 (원탭 체크인)
-- noshow_extend_until: 사장님이 "10분만 더" 눌러서 자동판정을 미룬 만료 시각
ALTER TABLE matches ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS noshow_extend_until timestamptz;
