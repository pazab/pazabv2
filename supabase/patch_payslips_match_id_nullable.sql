-- payslips.match_id FK를 nullable + ON DELETE SET NULL 로 재설정
-- 초대 직원(match_id 없음) 급여 발행 오류 수정

ALTER TABLE payslips
  DROP CONSTRAINT IF EXISTS payslips_match_id_fkey;

ALTER TABLE payslips
  ALTER COLUMN match_id DROP NOT NULL;

ALTER TABLE payslips
  ADD CONSTRAINT payslips_match_id_fkey
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL;
