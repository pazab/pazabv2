-- 아산신정호점 employer_profiles 행이 매장칩 목록에서 빠지는 이유 확인
SELECT id, business_name, is_deleted, is_active, user_id, created_at
FROM employer_profiles
WHERE id = (
  SELECT employer_profile_id FROM team_members
  WHERE id = '0d4a36ab-ae7e-4b2b-9867-2ab4c1068d37'
);

-- 참고: 이 사장님의 전체 매장 목록 (매장칩에 실제로 뜨는 것들)
SELECT id, business_name, is_deleted, is_active, created_at
FROM employer_profiles
WHERE user_id = (
  SELECT employer_id FROM team_members
  WHERE id = '0d4a36ab-ae7e-4b2b-9867-2ab4c1068d37'
)
ORDER BY created_at DESC;
