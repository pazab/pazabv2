-- ============================================================
-- 대타 다일치(기간) 공고 일별 출퇴근 기록
-- 실행: Supabase SQL Editor (clrjxxkgceluvzvrkvyl)
--
-- matches.checked_in_at/checked_out_at는 매칭당 값이 하나뿐이라 하루짜리 대타에는 충분하지만,
-- 여러 날에 걸친 대타(work_date_end 있음)는 1일차 출근 기록만 남고 2일차 이후는 출근 여부를
-- 시스템이 전혀 알 방법이 없었음(자동 노쇼 크론도 1일차만 판정). 날짜별 출석 기록을 별도로 쌓아서
-- 이후 날짜의 노쇼 감지·정산에 쓴다.
-- ============================================================

CREATE TABLE IF NOT EXISTS daeta_daily_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, work_date)
);

ALTER TABLE daeta_daily_attendance REPLICA IDENTITY FULL;
CREATE INDEX IF NOT EXISTS idx_daeta_daily_attendance_match ON daeta_daily_attendance(match_id);

ALTER TABLE daeta_daily_attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daeta_daily_attendance_select_own" ON daeta_daily_attendance;
CREATE POLICY "daeta_daily_attendance_select_own" ON daeta_daily_attendance FOR SELECT
  USING (
    match_id IN (
      SELECT id FROM matches WHERE employer_id = auth.uid() OR worker_id = auth.uid()
    )
  );
-- INSERT/UPDATE/DELETE는 서비스롤(서버 라우트)에서만 수행 — 별도 정책 없이 기본 차단
