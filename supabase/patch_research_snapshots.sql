-- ============================================================
-- PAZAB v2 — 탈퇴 시 HEXACO/성향분석 파생값을 비식별 연구 데이터로 보존
--
-- 배경: 계정 탈퇴(app/api/withdraw/route.ts) 시 worker_profiles.hexaco_data /
-- employer_profiles.bio5_data 등 성향분석 원본을 null 처리하는데, 이걸 그냥
-- 지워버리면 매칭 알고리즘 개선·연구용으로 쓸 수 있었던 값까지 영구 소실된다.
-- 이 테이블은 개인 식별이 불가능한 파생값만 담고, users와 FK 연결이 전혀 없다
-- (재식별 경로 차단 — CLAUDE.md "PII 원본 저장 금지" 원칙과 동일한 이유).
-- 지역은 읍면동 단위를 버리고 시군구 단위까지만, 생년은 연대(decade) 단위까지만 남긴다.
--
-- Supabase SQL Editor에서 실행
-- ============================================================

CREATE TABLE IF NOT EXISTS research_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  role text NOT NULL CHECK (role IN ('worker', 'employer')),

  -- 비식별 처리된 인구통계 (동/읍/면 단위·정확한 생년월일 제외)
  region_bucket text,              -- 시/군/구 단위까지만 (예: '충남 아산시')
  age_decade text,                 -- 예: '1990년대생' — worker만 해당

  -- 성향분석 파생값 (원본 대화·자유서술 텍스트 제외, 구조화된 결과만)
  hexaco_data jsonb,
  bio5_data jsonb,
  analyzed_mbti text,

  -- 서비스 이용 파생 지표
  work_count integer,              -- worker: 완료한 근무 건수
  is_verified boolean,             -- worker: Tier1 검증 여부
  business_type text,              -- employer: 업종 (상호명 아님)

  account_created_at timestamptz,  -- 원 계정 가입 시점 (연구용 코호트 분석)
  snapshot_at timestamptz DEFAULT now() NOT NULL
);

-- RLS는 켜두되 SELECT/INSERT 정책을 아예 안 만든다 — service_role(서버 라우트)만
-- 접근 가능하고, 클라이언트(anon/authenticated)는 이 테이블에 닿을 수 없어야 한다.
ALTER TABLE research_snapshots ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_research_snapshots_role ON research_snapshots(role);
