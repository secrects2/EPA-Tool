-- ============================================================================
-- EPA Tool — 總管理者角色系統 Migration
-- 在 Supabase SQL Editor 中執行此腳本
-- ============================================================================

-- 1. profiles 表新增 role 和 is_active 欄位
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'instructor' CHECK (role IN ('admin', 'instructor'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2. 更新 RLS 策略：admin 可讀取所有 profiles
DROP POLICY IF EXISTS "用户可读取自己的profile" ON profiles;
CREATE POLICY "使用者可讀取 profile" ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- admin 可更新所有 profiles（停用/啟用帳號）
DROP POLICY IF EXISTS "用户可更新自己的profile" ON profiles;
CREATE POLICY "使用者可更新 profile" ON profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 保留原有的插入策略
DROP POLICY IF EXISTS "用户可插入自己的profile" ON profiles;
CREATE POLICY "使用者可插入 profile" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());
