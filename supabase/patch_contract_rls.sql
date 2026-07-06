-- 1. 알림(notifications) 테이블 누구나 INSERT 가능하도록 RLS 완화 (사장님이 알바생에게 알림 전송 허용)
DROP POLICY IF EXISTS notifications_insert_all ON notifications;
CREATE POLICY notifications_insert_all ON notifications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS notifications_own ON notifications;
DROP POLICY IF EXISTS notifications_select_own ON notifications;
CREATE POLICY notifications_select_own ON notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_update_own ON notifications;
CREATE POLICY notifications_update_own ON notifications FOR UPDATE USING (auth.uid() = user_id);


-- 2. 매칭(matches) 테이블 RLS 완화 (채팅방 개설을 위한 INSERT 권한 보장)
DROP POLICY IF EXISTS matches_insert_employer ON matches;
CREATE POLICY matches_insert_employer ON matches FOR INSERT WITH CHECK (auth.uid() = employer_id OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS matches_update_parties ON matches;
CREATE POLICY matches_update_parties ON matches FOR UPDATE USING (auth.uid() = employer_id OR auth.uid() = worker_id OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS matches_select_parties ON matches;
CREATE POLICY matches_select_parties ON matches FOR SELECT USING (auth.uid() = employer_id OR auth.uid() = worker_id OR auth.role() = 'authenticated');


-- 3. 계약서(contracts) 테이블 RLS 완화 (계약서 발행을 위한 INSERT/UPDATE 권한 보장)
DROP POLICY IF EXISTS contracts_insert_employer ON contracts;
CREATE POLICY contracts_insert_employer ON contracts FOR INSERT WITH CHECK (auth.uid() = employer_id OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS contracts_update_parties ON contracts;
CREATE POLICY contracts_update_parties ON contracts FOR UPDATE USING (auth.uid() = employer_id OR auth.uid() = worker_id OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS contracts_select_parties ON contracts;
CREATE POLICY contracts_select_parties ON contracts FOR SELECT USING (auth.uid() = employer_id OR auth.uid() = worker_id OR auth.role() = 'authenticated');


-- 4. 팀원(team_members) 테이블 UPDATE 권한 완화 (계약 상태 pending 업데이트 보장)
DROP POLICY IF EXISTS team_members_update_employer ON team_members;
CREATE POLICY team_members_update_employer ON team_members FOR UPDATE USING (auth.uid() = employer_id OR auth.role() = 'authenticated');
