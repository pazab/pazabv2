-- ============================================================
-- 서류함: 팀원별 등본/보건증/통장사본 업로드 보관
-- 계약서는 이미 contracts 테이블이 있으므로 여기 포함하지 않음.
-- 파일 자체는 기존 media 스토리지 버킷 재사용, 이 테이블은 메타데이터만 저장.
-- Supabase SQL Editor에서 실행
-- ============================================================

CREATE TABLE IF NOT EXISTS team_member_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_member_id uuid REFERENCES team_members(id) ON DELETE CASCADE NOT NULL,

  doc_type text NOT NULL CHECK (doc_type IN ('resident_registration', 'health_certificate', 'bank_copy')),
  -- resident_registration = 등본, health_certificate = 보건증, bank_copy = 통장사본

  file_url text NOT NULL,
  expires_at date DEFAULT NULL,        -- 보건증 만료일 (그 외 타입은 NULL)
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,

  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- 타입별로 최신 1건만 유지 (재업로드 시 갱신), 팀원당 문서타입 하나
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_member_documents_unique
  ON team_member_documents(team_member_id, doc_type);

ALTER TABLE team_member_documents ENABLE ROW LEVEL SECURITY;

-- 해당 팀원 관계의 사장님 또는 본인(알바생)만 조회 가능
CREATE POLICY "team_member_documents_select" ON team_member_documents FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.id = team_member_documents.team_member_id
      AND (tm.employer_id = auth.uid() OR tm.worker_id = auth.uid())
  )
);

-- 업로드/수정은 사장님만 (서류함 관리 주체)
CREATE POLICY "team_member_documents_insert" ON team_member_documents FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.id = team_member_documents.team_member_id AND tm.employer_id = auth.uid()
  )
);
CREATE POLICY "team_member_documents_update" ON team_member_documents FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.id = team_member_documents.team_member_id AND tm.employer_id = auth.uid()
  )
);
CREATE POLICY "team_member_documents_delete" ON team_member_documents FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.id = team_member_documents.team_member_id AND tm.employer_id = auth.uid()
  )
);

CREATE TRIGGER trg_team_member_documents_updated_at
  BEFORE UPDATE ON team_member_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_team_member_documents_tm ON team_member_documents(team_member_id);
