-- ============================================================
-- PAZAB v2 — 매니저 권한 RLS 재귀(infinite recursion) 버그 수정
-- patch_manager_permissions.sql 실행 후 필수로 이어서 실행
--
-- 원인: team_members_select_manager 정책이 team_members 자기 자신을
--       서브쿼리로 참조 → Postgres가 정책 평가 중 재귀를 감지해서
--       "infinite recursion detected in policy for relation team_members" 에러 발생.
--       이 에러 때문에 사장님 포함 전원의 team_members SELECT가 실패했고,
--       프론트 코드가 error를 확인 안 해서 콘솔 에러 없이 목록만 비어 보였음.
--       attendance/payslips/daeta_postings 정책과 UPDATE 트리거도 team_members를
--       서브쿼리로 참조하므로 같은 방식으로 걸릴 수 있어 전부 같이 고침.
--
-- 해결: SECURITY DEFINER 함수로 RLS를 우회해서 "매니저 여부+권한"만 확인하고,
--       모든 정책/트리거가 그 함수를 호출하도록 교체 (Supabase 공식 권장 패턴)
-- ============================================================

-- 1. RLS를 우회하는 헬퍼 함수 (SECURITY DEFINER → 함수 내부 SELECT는 RLS 재귀 안 걸림)
CREATE OR REPLACE FUNCTION is_active_manager_of(target_employer_id uuid, required_permission text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.worker_id = auth.uid()
      AND tm.employer_id = target_employer_id
      AND tm.member_role = 'manager'
      AND tm.status = 'active'
      AND (required_permission IS NULL OR COALESCE((tm.permissions->>required_permission)::boolean, false))
  );
$$;

-- 2. team_members — 재귀의 원인이었던 정책을 함수 기반으로 교체
DROP POLICY IF EXISTS "team_members_select_manager" ON team_members;
CREATE POLICY "team_members_select_manager" ON team_members FOR SELECT USING (
  is_active_manager_of(team_members.employer_id)
);

-- 3. attendance
DROP POLICY IF EXISTS "attendance_select_manager" ON attendance;
CREATE POLICY "attendance_select_manager" ON attendance FOR SELECT USING (
  is_active_manager_of(attendance.employer_id)
);

DROP POLICY IF EXISTS "attendance_insert_manager" ON attendance;
CREATE POLICY "attendance_insert_manager" ON attendance FOR INSERT WITH CHECK (
  is_active_manager_of(attendance.employer_id, 'attendance_approve')
);

DROP POLICY IF EXISTS "attendance_update_manager" ON attendance;
CREATE POLICY "attendance_update_manager" ON attendance FOR UPDATE USING (
  is_active_manager_of(attendance.employer_id, 'attendance_approve')
);

-- 4. payslips
DROP POLICY IF EXISTS "payslips_select_manager" ON payslips;
CREATE POLICY "payslips_select_manager" ON payslips FOR SELECT USING (
  is_active_manager_of(payslips.employer_id)
);

DROP POLICY IF EXISTS "payslips_insert_manager" ON payslips;
CREATE POLICY "payslips_insert_manager" ON payslips FOR INSERT WITH CHECK (
  is_active_manager_of(payslips.employer_id, 'payroll_confirm')
);

DROP POLICY IF EXISTS "payslips_update_manager" ON payslips;
CREATE POLICY "payslips_update_manager" ON payslips FOR UPDATE USING (
  is_active_manager_of(payslips.employer_id, 'payroll_confirm')
);

-- 5. daeta_postings
DROP POLICY IF EXISTS "daeta_postings_update_manager" ON daeta_postings;
CREATE POLICY "daeta_postings_update_manager" ON daeta_postings FOR UPDATE USING (
  is_active_manager_of(daeta_postings.user_id, 'sos_request')
);

-- 6. team_members BEFORE UPDATE 트리거 — 내부에서 team_members를 직접 SELECT하던 부분도
--    같은 재귀 위험이 있어 함수 호출로 교체
CREATE OR REPLACE FUNCTION guard_team_member_update() RETURNS trigger AS $$
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
    IF NOT is_active_manager_of(NEW.employer_id, 'wage_edit') THEN
      RAISE EXCEPTION '시급/근무조건 수정 권한이 없습니다';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
