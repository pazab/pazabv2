-- ============================================================
-- 근태(attendance) 중복 레코드 정리 + 재발 방지 유니크 제약
-- ============================================================
-- 원인: attendance(team_member_id, work_date)에 유니크 제약이 없는 상태로
--   1) 크론(app/api/cron/checkin)이 20분 미출근 시 absent 행을 upsert(onConflict
--      team_member_id,work_date)로 만들고,
--   2) 알바생이 뒤늦게 "출근하기"를 누르면 myteam.tsx의 handleCheckIn()이
--      기존 행 여부를 확인하지 않고 매번 새 INSERT를 해서,
-- 같은 팀원의 같은 날짜에 행이 2개 이상 쌓이는 문제가 있었음. 홈 화면의
-- "오늘 출근 X/Y"에서 분자(X)가 분모(Y)보다 커지는 현상("3/2")이 이 중복 때문에 발생.
-- patch_delete_policy.sql이 "중복 방지"라는 주석과 함께 DELETE 정책만 추가하고
-- 정작 유니크 제약은 빠뜨렸던 것으로 보임 — 이번에 마저 추가.

-- 1) 기존 중복 정리: 같은 (team_member_id, work_date) 조합 중 가장 최근 행 하나만 남김
--    (사장님이 나중에 수정한 행일수록 created_at이 늦으므로 최신 행을 신뢰)
DELETE FROM attendance a
WHERE EXISTS (
  SELECT 1 FROM attendance b
  WHERE b.team_member_id = a.team_member_id
    AND b.work_date = a.work_date
    AND (b.created_at, b.id) > (a.created_at, a.id)
);

-- 2) 재발 방지: 유니크 제약 추가
ALTER TABLE attendance
  ADD CONSTRAINT attendance_team_member_work_date_unique UNIQUE (team_member_id, work_date);
