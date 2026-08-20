-- ============================================================
-- contracts.match_id 백필 — team_member_id로만 연결돼있던 기존 정규 계약에도 match_id 채우기
-- 실행: Supabase SQL Editor (clrjxxkgceluvzvrkvyl)
--
-- 문제: contracts가 두 가지 키로 matches에 연결되고 있었음 — 정규 계약은 team_member_id 경유,
-- 대타 자동계약(app/api/lovecall/route.ts)은 match_id 직접. matchId 하나만 들고 있는 화면
-- (채팅방 등)이 계약을 찾으려면 매번 "team_members 먼저 거쳐서 못 찾으면 포기" 식 이중 조회가
-- 필요했고, 실제로 app/chat/[id]/page.tsx의 loadContract/checkContractStatus가 이 이중 경로의
-- 폴백 조건을 잘못 짜서 대타 계약을 아예 못 찾던 버그로 이어졌었음(2026-08-20 수정).
--
-- 이 시점부터 app/contract/page.tsx doSave()가 정규 계약 저장(신규/수정) 시에도 match_id를
-- 항상 같이 채우도록 고쳤다 — 대타 자동계약은 이미 채우고 있었음. 이 스크립트는 그 전에 만들어진
-- 기존 정규 계약 행들만 한 번 소급 채운다(team_member_id는 그대로 유지 — employer/team, payslip,
-- cron 등 team_member 기준으로 계약을 조회하는 다른 화면들이 계속 그 컬럼을 씀).
-- ============================================================

UPDATE contracts c
SET match_id = tm.match_id
FROM team_members tm
WHERE c.team_member_id = tm.id
  AND c.match_id IS NULL
  AND tm.match_id IS NOT NULL;
