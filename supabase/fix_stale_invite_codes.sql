-- ============================================================
-- 예전 초대 수락 시도들이 RLS(invite_codes_update_employer)에 막혀서
-- used_at이 계속 null로 남아있던 것 정리
-- ============================================================
-- 원인: invite_codes UPDATE RLS 정책이 employer_id 본인만 허용해서, 알바생이
--   초대를 수락해도 used_at이 안 찍히고 계속 "미사용"으로 남음 (app/api/invite/accept
--   서버 라우트로 이미 수정 완료 — 이 파일은 그 버그로 쌓인 과거 테스트 잔해 정리용)
--
-- 대상: 효리수(delulu.archive.vibe@gmail.com, worker_id 923b8e88...)에게 발송됐던
--   오래된 미사용 초대 코드들. 이미 team_members 연결 자체는 (RLS 통과하는 부분이라)
--   실제로 반영됐었던 시도들이라 used_at만 정리하면 "받은 초대장" 배너에서 사라짐.

UPDATE invite_codes
SET used_at = now()
WHERE code IN ('PAZ-T3KJ', 'PAZ-XB9Q', 'PAZ-RERK', 'PAZ-ZT4T')
  AND used_at IS NULL;

-- 확인용
SELECT code, biz_name, employer_profile_id, used_at
FROM invite_codes
WHERE code IN ('PAZ-T3KJ', 'PAZ-XB9Q', 'PAZ-RERK', 'PAZ-ZT4T');
