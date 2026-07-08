-- ============================================================
-- PAZAB v2 — 급여명세서(payslips) 테이블 UPDATE RLS 정책 보완 패치
-- ============================================================

-- 1. 기존 UPDATE 정책이 존재하면 삭제
DROP POLICY IF EXISTS "payslips_update_employer" ON payslips;
DROP POLICY IF EXISTS "payslips_update_worker" ON payslips;
DROP POLICY IF EXISTS "payslips_update_team" ON payslips;

-- 2. 고용주가 자신의 명세서를 수정할 수 있는 정책 추가
CREATE POLICY "payslips_update_employer" ON payslips FOR UPDATE USING (
  auth.uid() = employer_id
);

-- 3. 피고용인(근로자)이 자신의 명세서를 확인/서명(수정)할 수 있는 정책 추가
CREATE POLICY "payslips_update_worker" ON payslips FOR UPDATE USING (
  auth.uid() = worker_id
);
