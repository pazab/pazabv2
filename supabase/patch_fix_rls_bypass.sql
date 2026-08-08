-- patch_contract_rls.sql이 "채팅방 개설/계약서 발행이 막힌다"는 문제를 `OR auth.role() = 'authenticated'`로
-- 땜질하면서, 로그인만 하면 누구나 남의 matches/contracts/team_members 행을 열람·수정할 수 있게 됐다.
-- (예: 타인 임금 변조, team_members.member_role을 'manager'로 바꿔 권한 상승 등)
--
-- 실제 조사 결과 matches/contracts는 client에서 직접 insert하는 코드가 없고 전부 API route(서비스 롤)를 거치므로
-- INSERT 정책의 "authenticated 우회"는애초에 불필요했다. UPDATE/SELECT도 당사자(employer_id/worker_id)로 충분하다.
-- 이 파일은 Supabase SQL Editor에서 수동 실행 필요.

-- 1. matches — 당사자만 (우회 제거)
DROP POLICY IF EXISTS matches_insert_employer ON matches;
CREATE POLICY matches_insert_employer ON matches FOR INSERT WITH CHECK (auth.uid() = employer_id OR auth.uid() = worker_id);

DROP POLICY IF EXISTS matches_update_parties ON matches;
CREATE POLICY matches_update_parties ON matches FOR UPDATE USING (auth.uid() = employer_id OR auth.uid() = worker_id);

DROP POLICY IF EXISTS matches_select_parties ON matches;
CREATE POLICY matches_select_parties ON matches FOR SELECT USING (auth.uid() = employer_id OR auth.uid() = worker_id);


-- 2. contracts — 당사자만 (우회 제거)
DROP POLICY IF EXISTS contracts_insert_employer ON contracts;
CREATE POLICY contracts_insert_employer ON contracts FOR INSERT WITH CHECK (auth.uid() = employer_id OR auth.uid() = worker_id);

DROP POLICY IF EXISTS contracts_update_parties ON contracts;
CREATE POLICY contracts_update_parties ON contracts FOR UPDATE USING (auth.uid() = employer_id OR auth.uid() = worker_id);

DROP POLICY IF EXISTS contracts_select_parties ON contracts;
CREATE POLICY contracts_select_parties ON contracts FOR SELECT USING (auth.uid() = employer_id OR auth.uid() = worker_id);


-- 3. team_members — 사장님 또는 본인(알바생)만 (우회 제거)
--    app/i/[code]/page.tsx의 초대수락 플로우가 알바생 본인 명의로 update하므로 worker_id도 포함해야 함
DROP POLICY IF EXISTS team_members_update_employer ON team_members;
CREATE POLICY team_members_update_employer ON team_members FOR UPDATE USING (auth.uid() = employer_id OR auth.uid() = worker_id);


-- 4. notifications — client에서 직접 insert하는 합법적 경로가 없음(전부 lib/notify.ts 서비스롤 경유).
--    WITH CHECK(true)는 누구나 타인 user_id로 가짜 알림(피싱 등)을 주입할 수 있게 하므로 본인 앞으로만 허용.
DROP POLICY IF EXISTS notifications_insert_all ON notifications;
CREATE POLICY notifications_insert_all ON notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
