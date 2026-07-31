-- ============================================================
-- 효리수(delulu.archive.vibe@gmail.com) team_members 오버라이드 복구
-- ============================================================
-- 원인: app/i/[code]/page.tsx의 초대 수락 로직이 "이미 이 사장님 소속인지"를
--   employer_id + worker_id + status='active'로만 체크하고 employer_profile_id(매장)는
--   안 봐서, 탕정역점 소속 효리수를 아산신정호점에 초대 → 수락하자 기존 탕정역점
--   team_members 레코드(cee7f146...)를 새로 만들지 않고 그대로 덮어써버림.
--   (원인 코드는 이미 수정 완료 — 이 파일은 이미 망가진 기존 레코드 1건 복구용)
--
-- 복구 근거: 같은 team_member_id(cee7f146...)에 연결된 활성 계약서
--   (id: ebaef68a-e50d-4639-820d-800c77f1dd7c, status='active')가 안 건드려진 채
--   그대로 남아있어서, 거기 적힌 원본 값(탕정역점/월급 180만원/월~금/8시간)을
--   그대로 되돌리면 됨. 4~7월 출퇴근 기록(09:00~18:00, 평일만)과도 정확히 일치.

UPDATE team_members
SET
  employer_profile_id = 'f6c846ac-539b-4c26-b89d-1ab37ada882a', -- 파스쿠찌 탕정역점
  wage = 1800000,
  work_hours = '8',
  work_days = '월·화·수·목·금'
WHERE id = 'cee7f146-c419-4e7f-a192-02b3362f47ef';

-- 확인용
SELECT id, employer_profile_id, wage, work_hours, work_days, status
FROM team_members
WHERE id = 'cee7f146-c419-4e7f-a192-02b3362f47ef';
