-- employer_profiles: user_id UNIQUE 제약 제거 → 1사장 N업장 지원
-- 기존 UNIQUE 제약 이름 확인 후 제거
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'employer_profiles'::regclass
    AND contype = 'u'
    AND array_length(conkey, 1) = 1
    AND conkey[1] = (
      SELECT attnum FROM pg_attribute
      WHERE attrelid = 'employer_profiles'::regclass AND attname = 'user_id'
    );

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE employer_profiles DROP CONSTRAINT %I', constraint_name);
    RAISE NOTICE 'Dropped constraint: %', constraint_name;
  ELSE
    RAISE NOTICE 'No unique constraint on user_id found (already removed or never existed)';
  END IF;
END;
$$;

-- 인덱스 추가 (조회 성능)
CREATE INDEX IF NOT EXISTS idx_employer_profiles_user_id ON employer_profiles(user_id);

-- biz_reg_number, ceo_name, biz_address, biz_tel 컬럼이 없으면 추가
ALTER TABLE employer_profiles
  ADD COLUMN IF NOT EXISTS biz_reg_number text,
  ADD COLUMN IF NOT EXISTS ceo_name text,
  ADD COLUMN IF NOT EXISTS biz_address text,
  ADD COLUMN IF NOT EXISTS biz_tel text;
