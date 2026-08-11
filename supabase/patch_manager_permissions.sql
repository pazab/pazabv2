-- ============================================================
-- PAZAB v2 — 매니저 세분화 권한(토글) 패치
-- Supabase SQL Editor에서 수동 실행 필요
-- ============================================================

-- 1. team_members.permissions jsonb 컬럼 추가
--    키: attendance_approve(근태 승인/수정) / wage_edit(시급/근무조건 수정)
--        payroll_confirm(정산/급여 확정) / sos_request(SOS 대타요청 발행)
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}'::jsonb;

-- ============================================================
-- 2. team_members — 매니저용 SELECT 정책
--    (뷰잉 자체는 권한 무관, member_role='manager'면 같은 employer 팀원 전체 조회 가능)
-- ============================================================
CREATE POLICY "team_members_select_manager" ON team_members FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.worker_id = auth.uid()
      AND tm.employer_id = team_members.employer_id
      AND tm.member_role = 'manager'
      AND tm.status = 'active'
  )
);

-- ============================================================
-- 3. team_members — BEFORE UPDATE 가드 트리거
--    patch_manager_role.sql의 매니저 UPDATE 정책이 컬럼 구분 없이 열려 있어서
--    (a) 매니저가 자기 자신의 member_role/permissions를 승격시키거나
--    (b) wage_edit 권한 없이 시급/근무조건을 바꾸는 걸 막는다.
-- ============================================================
CREATE OR REPLACE FUNCTION guard_team_member_update() RETURNS trigger AS $$
DECLARE
  actor_permissions jsonb;
BEGIN
  -- 사장님 본인이면 전부 허용
  IF auth.uid() = NEW.employer_id THEN
    RETURN NEW;
  END IF;

  -- 매니저가 member_role/permissions 자체를 바꾸는 건 금지 (자기 권한 상승 방지)
  IF NEW.member_role IS DISTINCT FROM OLD.member_role
     OR NEW.permissions IS DISTINCT FROM OLD.permissions THEN
    RAISE EXCEPTION '권한 항목은 사장님만 변경할 수 있습니다';
  END IF;

  -- 시급/근무조건 변경은 wage_edit 권한 필요
  IF NEW.wage IS DISTINCT FROM OLD.wage
     OR NEW.work_days IS DISTINCT FROM OLD.work_days
     OR NEW.work_hours IS DISTINCT FROM OLD.work_hours THEN
    SELECT tm.permissions INTO actor_permissions FROM team_members tm
      WHERE tm.worker_id = auth.uid()
        AND tm.employer_id = NEW.employer_id
        AND tm.member_role = 'manager'
        AND tm.status = 'active'
      LIMIT 1;
    IF COALESCE((actor_permissions->>'wage_edit')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '시급/근무조건 수정 권한이 없습니다';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_team_member_update ON team_members;
CREATE TRIGGER trg_guard_team_member_update
  BEFORE UPDATE ON team_members
  FOR EACH ROW EXECUTE FUNCTION guard_team_member_update();

-- ============================================================
-- 4. attendance — 매니저용 SELECT(무조건) + INSERT/UPDATE(attendance_approve 권한)
-- ============================================================
CREATE POLICY "attendance_select_manager" ON attendance FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.worker_id = auth.uid()
      AND tm.employer_id = attendance.employer_id
      AND tm.member_role = 'manager'
      AND tm.status = 'active'
  )
);

CREATE POLICY "attendance_insert_manager" ON attendance FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.worker_id = auth.uid()
      AND tm.employer_id = attendance.employer_id
      AND tm.member_role = 'manager'
      AND tm.status = 'active'
      AND COALESCE((tm.permissions->>'attendance_approve')::boolean, false)
  )
);

CREATE POLICY "attendance_update_manager" ON attendance FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.worker_id = auth.uid()
      AND tm.employer_id = attendance.employer_id
      AND tm.member_role = 'manager'
      AND tm.status = 'active'
      AND COALESCE((tm.permissions->>'attendance_approve')::boolean, false)
  )
);

-- ============================================================
-- 5. payslips — 매니저용 SELECT(무조건) + INSERT/UPDATE(payroll_confirm 권한)
-- ============================================================
CREATE POLICY "payslips_select_manager" ON payslips FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.worker_id = auth.uid()
      AND tm.employer_id = payslips.employer_id
      AND tm.member_role = 'manager'
      AND tm.status = 'active'
  )
);

CREATE POLICY "payslips_insert_manager" ON payslips FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.worker_id = auth.uid()
      AND tm.employer_id = payslips.employer_id
      AND tm.member_role = 'manager'
      AND tm.status = 'active'
      AND COALESCE((tm.permissions->>'payroll_confirm')::boolean, false)
  )
);

CREATE POLICY "payslips_update_manager" ON payslips FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.worker_id = auth.uid()
      AND tm.employer_id = payslips.employer_id
      AND tm.member_role = 'manager'
      AND tm.status = 'active'
      AND COALESCE((tm.permissions->>'payroll_confirm')::boolean, false)
  )
);

-- ============================================================
-- 6. daeta_postings — 매니저용 UPDATE(sos_request 권한, 수정/취소용)
--    INSERT는 기존 "authenticated면 누구나" 정책이 이미 있어서 별도 정책 불필요.
--    (posting.user_id는 앱 코드에서 항상 사장님 employer_id로 세팅)
-- ============================================================
CREATE POLICY "daeta_postings_update_manager" ON daeta_postings FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.worker_id = auth.uid()
      AND tm.employer_id = daeta_postings.user_id
      AND tm.member_role = 'manager'
      AND tm.status = 'active'
      AND COALESCE((tm.permissions->>'sos_request')::boolean, false)
  )
);
