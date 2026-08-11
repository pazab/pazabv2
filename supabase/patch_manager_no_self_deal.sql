-- ============================================================
-- PAZAB v2 — 매니저 셀프딜링(자기 자신 승인/수정) 방지
-- 매니저가 자기 자신의 근태/시급/명세서를 스스로 승인·수정·발행하지 못하게
-- RLS/트리거 단에서도 막는다 (UI 가드는 app/employer/team/[id]/page.tsx,
-- app/payslip/page.tsx에 이미 적용됨 — 여긴 우회 방지용 서버 측 방어).
-- ============================================================

-- 1. team_members — 매니저가 wage/work_days/work_hours를 바꿀 때, 대상이 자기 자신이면 무조건 차단
CREATE OR REPLACE FUNCTION guard_team_member_update() RETURNS trigger AS $$
BEGIN
  IF auth.uid() = NEW.employer_id THEN
    RETURN NEW;
  END IF;

  IF NEW.member_role IS DISTINCT FROM OLD.member_role
     OR NEW.permissions IS DISTINCT FROM OLD.permissions THEN
    RAISE EXCEPTION '권한 항목은 사장님만 변경할 수 있습니다';
  END IF;

  IF NEW.wage IS DISTINCT FROM OLD.wage
     OR NEW.work_days IS DISTINCT FROM OLD.work_days
     OR NEW.work_hours IS DISTINCT FROM OLD.work_hours THEN
    IF auth.uid() = NEW.worker_id THEN
      RAISE EXCEPTION '본인의 시급/근무조건은 스스로 수정할 수 없습니다';
    END IF;
    IF NOT is_active_manager_of(NEW.employer_id, 'wage_edit') THEN
      RAISE EXCEPTION '시급/근무조건 수정 권한이 없습니다';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. attendance — 매니저용 INSERT/UPDATE/DELETE 정책에 "본인 기록 아님" 조건 추가
DROP POLICY IF EXISTS "attendance_insert_manager" ON attendance;
CREATE POLICY "attendance_insert_manager" ON attendance FOR INSERT WITH CHECK (
  attendance.worker_id != auth.uid()
  AND is_active_manager_of(attendance.employer_id, 'attendance_approve')
);

DROP POLICY IF EXISTS "attendance_update_manager" ON attendance;
CREATE POLICY "attendance_update_manager" ON attendance FOR UPDATE USING (
  attendance.worker_id != auth.uid()
  AND is_active_manager_of(attendance.employer_id, 'attendance_approve')
);

DROP POLICY IF EXISTS "attendance_delete_manager" ON attendance;
CREATE POLICY "attendance_delete_manager" ON attendance FOR DELETE USING (
  attendance.worker_id != auth.uid()
  AND is_active_manager_of(attendance.employer_id, 'attendance_approve')
);

-- 3. payslips — 매니저용 INSERT/UPDATE 정책에 "본인 명세서 아님" 조건 추가
DROP POLICY IF EXISTS "payslips_insert_manager" ON payslips;
CREATE POLICY "payslips_insert_manager" ON payslips FOR INSERT WITH CHECK (
  payslips.worker_id != auth.uid()
  AND is_active_manager_of(payslips.employer_id, 'payroll_confirm')
);

DROP POLICY IF EXISTS "payslips_update_manager" ON payslips;
CREATE POLICY "payslips_update_manager" ON payslips FOR UPDATE USING (
  payslips.worker_id != auth.uid()
  AND is_active_manager_of(payslips.employer_id, 'payroll_confirm')
);
