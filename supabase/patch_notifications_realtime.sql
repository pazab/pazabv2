-- ============================================================
-- PAZAB v2 — 실시간 수신(Realtime) 활성화 패치
-- Supabase SQL Editor에서 실행
-- ============================================================

-- 1. supabase_realtime publication에 테이블 추가 (실시간 브로드캐스트 활성화)
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE team_members;

-- 2. 복제 ID를 FULL로 설정해 데이터 변경/삭제 시에도 모든 컬럼을 실시간 전달하도록 보장
ALTER TABLE notifications REPLICA IDENTITY FULL;
ALTER TABLE team_members REPLICA IDENTITY FULL;
