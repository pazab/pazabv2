-- ============================================================
-- 대타 SOS 최소 등록 리드타임 (근무 시작까지 최소 N분 전에만 등록 가능)
-- 실행: Supabase SQL Editor (clrjxxkgceluvzvrkvyl)
--
-- 에스컬레이션 사다리(stage1_wait_min 10 + stage2_wait_min 30 + stage3_wait_min 30 = 70분)가
-- 절반도 못 돌아갈 정도로 리드타임이 없으면(예: 10분 뒤 시작) 검증된 Tier1 인력에게 먼저
-- 노출될 기회조차 없이 바로 최광범위로 뿌려지는 게 무의미해짐 — 최소 60분은 확보하도록 함.
-- ============================================================

INSERT INTO daeta_sos_config (key, value, description) VALUES
  ('min_lead_minutes', 60, '대타 공고 등록 시 근무 시작까지 최소 확보해야 하는 시간(분)')
ON CONFLICT (key) DO NOTHING;
