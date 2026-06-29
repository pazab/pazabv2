-- team_members에 member_role 추가 (staff/manager)
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS member_role text DEFAULT 'staff';
-- 기존 데이터 staff로 초기화
UPDATE team_members SET member_role = 'staff' WHERE member_role IS NULL;

-- 매니저도 같은 employer의 team_members INSERT/UPDATE 가능하도록 RLS 정책 추가
CREATE POLICY "team_members_manager_insert" ON team_members FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.worker_id = auth.uid()
      AND tm.employer_id = team_members.employer_id
      AND tm.member_role = 'manager'
      AND tm.status = 'active'
  )
);

CREATE POLICY "team_members_manager_update" ON team_members FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.worker_id = auth.uid()
      AND tm.employer_id = team_members.employer_id
      AND tm.member_role = 'manager'
      AND tm.status = 'active'
  )
);

-- invite_codes도 매니저가 생성 가능하도록
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL DEFAULT NULL;
