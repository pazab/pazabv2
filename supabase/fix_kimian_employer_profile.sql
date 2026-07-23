-- ============================================================
-- 김이안 team_members.employer_profile_id 데이터 보정
-- 원인: 채팅 채용확정(hire_accept) 경로가 employer_profile_id 없이
--       team_members를 생성해, 사장님의 "가장 최근 등록 매장"으로
--       잘못 폴백되어 온양점으로 연결된 상태 (코드는 이미 수정함).
-- Supabase SQL Editor에서 순서대로 실행
-- ============================================================

-- 1) 확인: 실행 전에 대상 행이 맞는지 먼저 확인하세요.
SELECT
  tm.id                    AS team_member_id,
  u.nickname, u.real_name,
  ep_current.business_name AS current_store,
  ep_target.id             AS target_employer_profile_id,
  ep_target.business_name  AS target_store
FROM team_members tm
JOIN users u ON u.id = tm.worker_id
LEFT JOIN employer_profiles ep_current ON ep_current.id = tm.employer_profile_id
JOIN employer_profiles ep_target
  ON ep_target.user_id = tm.employer_id
 AND ep_target.business_name = '파스쿠찌 아산신정호점'
WHERE (u.nickname = '김이안' OR u.real_name = '김이안')
  AND tm.status = 'active';

-- 2) 위 결과에서 current_store가 '파스쿠찌 온양점'(또는 NULL)이고
--    target_store가 '파스쿠찌 아산신정호점'인 게 맞으면 아래 실행.
UPDATE team_members tm
SET employer_profile_id = (
  SELECT ep.id FROM employer_profiles ep
  WHERE ep.user_id = tm.employer_id
    AND ep.business_name = '파스쿠찌 아산신정호점'
  LIMIT 1
)
FROM users u
WHERE tm.worker_id = u.id
  AND (u.nickname = '김이안' OR u.real_name = '김이안')
  AND tm.status = 'active';

-- 3) 확인: 정상 반영됐는지 재조회
SELECT tm.id, u.nickname, u.real_name, ep.business_name
FROM team_members tm
JOIN users u ON u.id = tm.worker_id
LEFT JOIN employer_profiles ep ON ep.id = tm.employer_profile_id
WHERE (u.nickname = '김이안' OR u.real_name = '김이안')
  AND tm.status = 'active';
