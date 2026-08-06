-- ============================================================
-- 대타 SOS 자동 할증(안 잡히면 escalation_stage 단계별로 시급 자동 인상)
-- 실행: Supabase SQL Editor (clrjxxkgceluvzvrkvyl)
-- ============================================================

-- 1) daeta_postings — base_wage(할증 계산 기준 원래 시급), max_urgent_pct(사장님이 등록 시 동의한 자동 할증 상한%)
ALTER TABLE daeta_postings
  ADD COLUMN IF NOT EXISTS base_wage integer,
  ADD COLUMN IF NOT EXISTS max_urgent_pct integer NOT NULL DEFAULT 0;

UPDATE daeta_postings SET base_wage = wage WHERE base_wage IS NULL;
ALTER TABLE daeta_postings ALTER COLUMN base_wage SET NOT NULL;

COMMENT ON COLUMN daeta_postings.base_wage IS '사장님이 등록 시 입력한 원래 시급 — 자동 할증은 항상 이 값 기준으로 재계산(wage는 자동 할증 적용된 현재 유효 시급)';
COMMENT ON COLUMN daeta_postings.max_urgent_pct IS '사장님이 등록 시 동의한 자동 할증 상한(%) — escalation_stage가 올라가도 이 이상은 절대 자동으로 오르지 않음. 기본 0=자동 할증 미동의';

-- 2) daeta_sos_config — 단계별 자동 할증 기본값(%, admin 튜닝 가능, 코드에 하드코딩 금지)
INSERT INTO daeta_sos_config (key, value, description) VALUES
  ('stage2_pct', 10, '2단계(동네 ✅검증 인력 공개) 도달 시 자동 할증 기본값(%) — 사장님의 max_urgent_pct 상한 내에서만 적용'),
  ('stage3_pct', 20, '3단계(🔵신규 포함) 도달 시 자동 할증 기본값(%) — 사장님의 max_urgent_pct 상한 내에서만 적용'),
  ('stage4_pct', 30, '4단계(공개 SOS) 도달 시 자동 할증 기본값(%) — 사장님의 max_urgent_pct 상한 내에서만 적용')
ON CONFLICT (key) DO NOTHING;
