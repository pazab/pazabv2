-- ============================================================
-- PAZAB v2 — 휴대폰 번호 기준 노쇼/신뢰점수 위반 이력 승계
--
-- 배경: 탈퇴 확정(lib/withdrawal.ts finalizeWithdrawal) 시 같은 id로 재로그인하면
-- (7일 쿨다운 후) trust_score 등 위반 이력이 그대로 남지만, 완전히 새 이메일로
-- 재가입하면 새 user id/새 users row라 이력이 전혀 없어 노쇼 이력 세탁이 가능했다.
-- 이 테이블은 전화번호 "원본"이 아니라 HMAC 해시(lib/phoneHash.ts)만 저장해서,
-- 위반 이력이 있는 번호로 다시 가입했을 때만 매칭·승계한다(PII 원본 저장 금지 원칙).
-- 위반 이력이 없는 탈퇴자는 애초에 이 테이블에 기록되지 않는다.
--
-- Supabase SQL Editor에서 실행
-- ============================================================

CREATE TABLE IF NOT EXISTS phone_violation_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  phone_hash text NOT NULL UNIQUE,       -- HMAC-SHA256(휴대폰 번호), 원본 아님

  no_show_count integer NOT NULL DEFAULT 0,      -- 누적 노쇼/위반(trust_score_logs delta<0) 건수
  worst_trust_score integer,                     -- 이 번호로 발생한 계정들 중 가장 낮았던 trust_score
  suspended_until timestamptz,                    -- 승계할 대타 참여 제한 시각(가장 늦은 것)
  last_violation_at timestamptz,

  source_user_ids uuid[] NOT NULL DEFAULT '{}',       -- 위반을 발생시킨 원 계정(들)
  applied_to_user_ids uuid[] NOT NULL DEFAULT '{}',   -- 이미 승계 적용된 재가입 계정(들) — 중복 적용 방지

  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- RLS는 켜두되 정책을 아예 안 만든다 — service_role(서버 라우트)만 접근 가능,
-- 클라이언트(anon/authenticated)는 이 테이블에 닿을 수 없어야 한다.
ALTER TABLE phone_violation_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_phone_violation_history_hash ON phone_violation_history(phone_hash);
