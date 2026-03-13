-- ============================================================================
-- ICOPE 前後測系統 — 完整 PostgreSQL Schema
-- 相容 Supabase PostgreSQL 15+
-- 在 Supabase SQL Editor 中執行此腳本
-- ============================================================================

-- ============================================================================
-- 1. 自訂 ENUM 型別
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE assessment_stage AS ENUM ('initial', 'post');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE gender_type AS ENUM ('male', 'female');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. 長者基本資料表
-- ============================================================================
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  id_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  gender gender_type NOT NULL,
  birth_date DATE NOT NULL,
  phone TEXT,
  chronic_diseases TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE patients IS '長者基本資料（ICOPE）';
COMMENT ON COLUMN patients.id_number IS '身分證字號（唯一）';
COMMENT ON COLUMN patients.name IS '姓名';
COMMENT ON COLUMN patients.gender IS '性別';
COMMENT ON COLUMN patients.birth_date IS '出生日期';
COMMENT ON COLUMN patients.phone IS '手機號碼';
COMMENT ON COLUMN patients.chronic_diseases IS '慢性疾病史（文字陣列）';
COMMENT ON COLUMN patients.instructor_id IS '負責指導員（醫事人員）ID';

-- ============================================================================
-- 3. 評估紀錄主表
-- ============================================================================
CREATE TABLE IF NOT EXISTS assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES profiles(id),
  stage assessment_stage NOT NULL DEFAULT 'initial',
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  follow_up_completed BOOLEAN NOT NULL DEFAULT false,
  post_test_completed BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE assessments IS '評估紀錄主表';
COMMENT ON COLUMN assessments.patient_id IS '關聯長者 ID';
COMMENT ON COLUMN assessments.instructor_id IS '負責醫事人員 ID';
COMMENT ON COLUMN assessments.stage IS '評估階段（初評 / 後測）';
COMMENT ON COLUMN assessments.assessed_at IS '評估日期';

-- ============================================================================
-- 4. 初評表（6 大面向布林值）
-- ============================================================================
CREATE TABLE IF NOT EXISTS primary_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL UNIQUE REFERENCES assessments(id) ON DELETE CASCADE,
  cognition BOOLEAN NOT NULL DEFAULT false,
  mobility BOOLEAN NOT NULL DEFAULT false,
  nutrition BOOLEAN NOT NULL DEFAULT false,
  vision BOOLEAN NOT NULL DEFAULT false,
  hearing BOOLEAN NOT NULL DEFAULT false,
  depression BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE primary_assessments IS '初評 — 6 大面向異常判定';
COMMENT ON COLUMN primary_assessments.cognition IS '認知功能是否異常';
COMMENT ON COLUMN primary_assessments.mobility IS '行動能力是否異常';
COMMENT ON COLUMN primary_assessments.nutrition IS '營養狀態是否異常';
COMMENT ON COLUMN primary_assessments.vision IS '視力是否異常';
COMMENT ON COLUMN primary_assessments.hearing IS '聽力是否異常';
COMMENT ON COLUMN primary_assessments.depression IS '是否有憂鬱傾向';

-- ============================================================================
-- 5. 複評表（各項詳細分數，允許 NULL）
-- ============================================================================
CREATE TABLE IF NOT EXISTS secondary_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL UNIQUE REFERENCES assessments(id) ON DELETE CASCADE,
  -- 認知評估
  ad8_score INTEGER CHECK (ad8_score IS NULL OR (ad8_score >= 0 AND ad8_score <= 8)),
  bht_score INTEGER,
  -- 行動評估
  sppb_score INTEGER CHECK (sppb_score IS NULL OR (sppb_score >= 0 AND sppb_score <= 12)),
  -- 營養評估
  mna_sf_score REAL CHECK (mna_sf_score IS NULL OR (mna_sf_score >= 0 AND mna_sf_score <= 14)),
  -- 憂鬱評估
  gds15_score INTEGER CHECK (gds15_score IS NULL OR (gds15_score >= 0 AND gds15_score <= 15)),
  -- 其他評估
  medication_result TEXT,
  social_care_result TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE secondary_assessments IS '複評 — 各項詳細評分（僅初評異常時觸發）';
COMMENT ON COLUMN secondary_assessments.ad8_score IS 'AD8 認知評估分數 (0-8，≥2 為異常)';
COMMENT ON COLUMN secondary_assessments.bht_score IS 'BHT 認知評估分數';
COMMENT ON COLUMN secondary_assessments.sppb_score IS 'SPPB 行動評估分數 (0-12，≤8 為異常)';
COMMENT ON COLUMN secondary_assessments.mna_sf_score IS 'MNA-SF 營養評估分數 (0-14，≤11 為異常)';
COMMENT ON COLUMN secondary_assessments.gds15_score IS 'GDS-15 憂鬱評估分數 (0-15，≥5 為異常)';
COMMENT ON COLUMN secondary_assessments.medication_result IS '用藥評估結果';
COMMENT ON COLUMN secondary_assessments.social_care_result IS '社會照護與支持評估結果';

-- ============================================================================
-- 6. 索引
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_patients_instructor ON patients(instructor_id);
CREATE INDEX IF NOT EXISTS idx_patients_id_number ON patients(id_number);
CREATE INDEX IF NOT EXISTS idx_assessments_patient ON assessments(patient_id);
CREATE INDEX IF NOT EXISTS idx_assessments_instructor ON assessments(instructor_id);
CREATE INDEX IF NOT EXISTS idx_assessments_stage ON assessments(stage);
CREATE INDEX IF NOT EXISTS idx_primary_assessment_id ON primary_assessments(assessment_id);
CREATE INDEX IF NOT EXISTS idx_secondary_assessment_id ON secondary_assessments(assessment_id);

-- ============================================================================
-- 7. RLS 策略
-- ============================================================================

-- patients
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_patients" ON patients;
CREATE POLICY "authenticated_select_patients" ON patients
  FOR SELECT TO authenticated
  USING (instructor_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "authenticated_insert_patients" ON patients;
CREATE POLICY "authenticated_insert_patients" ON patients
  FOR INSERT TO authenticated
  WITH CHECK (instructor_id = auth.uid());

DROP POLICY IF EXISTS "authenticated_update_patients" ON patients;
CREATE POLICY "authenticated_update_patients" ON patients
  FOR UPDATE TO authenticated
  USING (instructor_id = auth.uid() OR is_admin());

-- assessments
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_assessments" ON assessments;
CREATE POLICY "authenticated_select_assessments" ON assessments
  FOR SELECT TO authenticated
  USING (instructor_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "authenticated_insert_assessments" ON assessments;
CREATE POLICY "authenticated_insert_assessments" ON assessments
  FOR INSERT TO authenticated
  WITH CHECK (instructor_id = auth.uid());

DROP POLICY IF EXISTS "authenticated_update_assessments" ON assessments;
CREATE POLICY "authenticated_update_assessments" ON assessments
  FOR UPDATE TO authenticated
  USING (instructor_id = auth.uid() OR is_admin());

-- primary_assessments
ALTER TABLE primary_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_primary" ON primary_assessments;
CREATE POLICY "authenticated_select_primary" ON primary_assessments
  FOR SELECT TO authenticated
  USING (
    assessment_id IN (SELECT id FROM assessments WHERE instructor_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "authenticated_insert_primary" ON primary_assessments;
CREATE POLICY "authenticated_insert_primary" ON primary_assessments
  FOR INSERT TO authenticated
  WITH CHECK (
    assessment_id IN (SELECT id FROM assessments WHERE instructor_id = auth.uid())
  );

DROP POLICY IF EXISTS "authenticated_update_primary" ON primary_assessments;
CREATE POLICY "authenticated_update_primary" ON primary_assessments
  FOR UPDATE TO authenticated
  USING (
    assessment_id IN (SELECT id FROM assessments WHERE instructor_id = auth.uid())
    OR is_admin()
  );

-- secondary_assessments
ALTER TABLE secondary_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_secondary" ON secondary_assessments;
CREATE POLICY "authenticated_select_secondary" ON secondary_assessments
  FOR SELECT TO authenticated
  USING (
    assessment_id IN (SELECT id FROM assessments WHERE instructor_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "authenticated_insert_secondary" ON secondary_assessments;
CREATE POLICY "authenticated_insert_secondary" ON secondary_assessments
  FOR INSERT TO authenticated
  WITH CHECK (
    assessment_id IN (SELECT id FROM assessments WHERE instructor_id = auth.uid())
  );

DROP POLICY IF EXISTS "authenticated_update_secondary" ON secondary_assessments;
CREATE POLICY "authenticated_update_secondary" ON secondary_assessments
  FOR UPDATE TO authenticated
  USING (
    assessment_id IN (SELECT id FROM assessments WHERE instructor_id = auth.uid())
    OR is_admin()
  );

-- ============================================================================
-- 8. 自動更新 updated_at 觸發器
-- ============================================================================
DROP TRIGGER IF EXISTS update_patients_updated_at ON patients;
CREATE TRIGGER update_patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_assessments_updated_at ON assessments;
CREATE TRIGGER update_assessments_updated_at
    BEFORE UPDATE ON assessments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
