-- ============================================================
-- PAZAB v2 — 매니저 근태 삭제 권한 추가
-- attendance_approve 권한을 가진 매니저가 근태 기록을 삭제할 수 있도록.
-- is_active_manager_of()는 patch_manager_permissions_fix.sql에서 생성한
-- RLS 재귀-안전 헬퍼 함수를 그대로 재사용.
-- ============================================================

DROP POLICY IF EXISTS "attendance_delete_manager" ON attendance;
CREATE POLICY "attendance_delete_manager" ON attendance FOR DELETE USING (
  is_active_manager_of(attendance.employer_id, 'attendance_approve')
);
