-- ============================================================
-- PAZAB v2 — 근태 감사 로그(attendance_logs) 누락 컬럼 추가
-- ============================================================

ALTER TABLE public.attendance_logs 
  ADD COLUMN IF NOT EXISTS attendance_id uuid REFERENCES public.attendance(id) ON DELETE SET NULL;
