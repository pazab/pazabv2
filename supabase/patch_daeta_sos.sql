-- ============================================================
-- 대타 SOS 에스컬레이션 (STRATEGY.md §6 / DESIGN_PLAN.md P1)
-- 실행: Supabase SQL Editor (clrjxxkgceluvzvrkvyl)
-- ============================================================

-- 1) daeta_postings 에스컬레이션 컬럼
ALTER TABLE daeta_postings
  ADD COLUMN IF NOT EXISTS escalation_stage integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS stage_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS allow_new boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN daeta_postings.escalation_stage IS '1=팀내 알림, 2=동네 Tier1 공개, 3=신규(Tier2) 포함, 4=공개 SOS';
COMMENT ON COLUMN daeta_postings.allow_new IS '사장님 opt-in: 신규(Tier2) 알바생에게도 노출 허용';

CREATE INDEX IF NOT EXISTS idx_daeta_escalation ON daeta_postings(status, escalation_stage);

-- 2) 에스컬레이션 타이밍/할증 설정 (숫자 하드코딩 금지 원칙)
CREATE TABLE IF NOT EXISTS daeta_sos_config (
  key text PRIMARY KEY,
  value integer NOT NULL,
  description text
);

ALTER TABLE daeta_sos_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daeta_sos_config_select_all" ON daeta_sos_config;
CREATE POLICY "daeta_sos_config_select_all" ON daeta_sos_config FOR SELECT USING (true);

INSERT INTO daeta_sos_config (key, value, description) VALUES
  ('stage1_wait_min', 10, '팀 내 알림 후 동네 Tier1 공개까지 대기(분)'),
  ('stage2_wait_min', 30, 'Tier1 공개 후 신규 포함/공개 SOS까지 대기(분)'),
  ('stage3_wait_min', 30, '신규 포함 후 공개 SOS 전환까지 대기(분)'),
  ('radius_km', 10, '동네 알림 반경(km)'),
  ('urgent_pct_same_day', 20, '당일 대타 긴급 할증 기본값(%)'),
  ('urgent_pct_3h', 30, '3시간 내 시작 대타 긴급 할증 기본값(%)')
ON CONFLICT (key) DO NOTHING;
