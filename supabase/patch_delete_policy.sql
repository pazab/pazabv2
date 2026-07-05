-- ============================================================
-- PAZAB v2 — 근태 기록(attendance) 삭제 정책 추가 (중복 방지)
-- ============================================================

DROP POLICY IF EXISTS "attendance_delete_employer" ON attendance;

CREATE POLICY "attendance_delete_employer" ON attendance 
  FOR DELETE USING (auth.uid() = employer_id);
