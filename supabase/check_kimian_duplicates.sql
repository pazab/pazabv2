-- 김이안 명의의 team_members 행이 여러 개 있는지 확인 (중복/구버전 레코드 여부)
SELECT tm.id AS team_member_id, tm.status, tm.employer_profile_id,
       ep.business_name, tm.created_at, tm.updated_at
FROM team_members tm
JOIN users u ON u.id = tm.worker_id
LEFT JOIN employer_profiles ep ON ep.id = tm.employer_profile_id
WHERE (u.nickname = '김이안' OR u.real_name = '김이안')
ORDER BY tm.created_at DESC;
