-- ============================================================
-- PAZAB v2 — 법정보존기간 자동파기용 컬럼 추가
--
-- 배경: 계약서/임금명세서/근태기록/팀원서류는 근로기준법상 상대방(사장님·알바생)
-- 보호를 위해 탈퇴해도 삭제하지 않고 보존해왔는데(app/api/withdraw/route.ts),
-- 보존기간이 지난 뒤 실제로 파기하는 절차가 없어 사실상 무기한 보존 상태였다.
-- 이 컬럼은 탈퇴 시점에만 채워진다 — 양쪽 다 계속 활동 중인 관계는 아직 개인정보
-- 수집 목적(가게 운영/정산)이 끝난 게 아니므로 나이만으로 자동파기 대상이 되면 안 된다.
-- (app/api/cron/purge-expired에서 이 값이 지난 행만 하드 삭제)
--
-- Supabase SQL Editor에서 실행
-- ============================================================

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS retention_until timestamptz;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS retention_until timestamptz;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS retention_until timestamptz;
ALTER TABLE team_member_documents ADD COLUMN IF NOT EXISTS retention_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_contracts_retention_until ON contracts(retention_until) WHERE retention_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payslips_retention_until ON payslips(retention_until) WHERE retention_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_retention_until ON attendance(retention_until) WHERE retention_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_member_documents_retention_until ON team_member_documents(retention_until) WHERE retention_until IS NOT NULL;
