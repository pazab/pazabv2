-- ============================================================
-- PAZAB v2 — 급여명세서(payslips) 테이블 보완 패치
-- ============================================================

-- 1. 기존 컬럼들 NULLABLE 변경 (새 스키마 호환성)
ALTER TABLE payslips ALTER COLUMN pay_period_start DROP NOT NULL;
ALTER TABLE payslips ALTER COLUMN pay_period_end DROP NOT NULL;
ALTER TABLE payslips ALTER COLUMN base_wage DROP NOT NULL;
ALTER TABLE payslips ALTER COLUMN total_amount DROP NOT NULL;
ALTER TABLE payslips ALTER COLUMN net_amount DROP NOT NULL;

-- 2. 새 컬럼 추가
ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS year integer,
  ADD COLUMN IF NOT EXISTS month integer,
  ADD COLUMN IF NOT EXISTS wage integer,
  ADD COLUMN IF NOT EXISTS overtime_hours numeric,
  ADD COLUMN IF NOT EXISTS base_pay integer,
  ADD COLUMN IF NOT EXISTS overtime_pay integer,
  ADD COLUMN IF NOT EXISTS total_pay integer,
  ADD COLUMN IF NOT EXISTS work_days integer,
  ADD COLUMN IF NOT EXISTS attendance_data jsonb,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'issued',
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS match_id uuid REFERENCES matches(id) ON DELETE SET NULL,
  
  -- 세금 및 공제 정보 컬럼 추가
  ADD COLUMN IF NOT EXISTS income_tax integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS local_tax integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS health_insurance integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employment_insurance integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS national_pension integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_deductions integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_pay integer,
  ADD COLUMN IF NOT EXISTS correction_reason text;

-- 3. upsert 지원을 위한 UNIQUE 제약 조건 추가
-- 기존 제약 조건이 있으면 삭제 후 재생성
ALTER TABLE payslips DROP CONSTRAINT IF EXISTS payslips_employer_worker_year_month_unique;
ALTER TABLE payslips ADD CONSTRAINT payslips_employer_worker_year_month_unique UNIQUE (employer_id, worker_id, year, month);

-- 4. team_members 테이블에 급여명세서 자동 발행 설정 컬럼 추가
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS payslip_auto_issue boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS payslip_auto_issue_offset integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payslip_payday_fallback integer DEFAULT 10;
