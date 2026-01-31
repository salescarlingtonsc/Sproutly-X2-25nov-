
-- ENTERPRISE SCHEMA v9.0 (DEADLOCK BUSTER)
-- Run this in Supabase SQL Editor to fix "Deadlock Detected" and "0 Leads".

-- 1. NUCLEAR OPTION: DISABLE RLS FIRST
-- This immediately stops any "Infinite Recursion" or "Deadlocks" caused by existing bad policies.
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE activities DISABLE ROW LEVEL SECURITY;

-- 2. CLEAN SLATE (Remove all old policies)
DROP POLICY IF EXISTS "clients_enterprise_visibility" ON clients;
DROP POLICY IF EXISTS "clients_visibility_v7" ON clients;
DROP POLICY IF EXISTS "clients_self" ON clients;
DROP POLICY IF EXISTS "clients_org" ON clients;
DROP POLICY IF EXISTS "profiles_enterprise_all" ON profiles;
DROP POLICY IF EXISTS "profiles_visibility_v7" ON profiles;
DROP POLICY IF EXISTS "profiles_self" ON profiles;
DROP POLICY IF EXISTS "profiles_org" ON profiles;
DROP POLICY IF EXISTS "activities_enterprise_access" ON activities;
DROP POLICY IF EXISTS "activities_access" ON activities;

-- 3. RECREATE HELPER FUNCTIONS (Anti-Recursion Mode)
-- We use SECURITY DEFINER to ensure these run with system privileges, bypassing RLS loops.
CREATE OR REPLACE FUNCTION public.get_auth_org_id()
RETURNS text AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text AS $$
  SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- 4. DATA REPAIR (Now safe to run because RLS is off)
-- Sync the DB 'user_id' to match the 'advisorId' in the JSON data.
UPDATE clients
SET user_id = (data->>'advisorId')::uuid
WHERE (data->>'advisorId') IS NOT NULL 
  AND (data->>'advisorId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND user_id != (data->>'advisorId')::uuid;

-- Sync Org IDs
UPDATE clients c
SET org_id = p.organization_id
FROM profiles p
WHERE c.user_id = p.id
  AND c.org_id != p.organization_id;

-- 5. RE-ENABLE SECURITY
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- 6. APPLY CLEAN POLICIES (Split for performance)

-- CLIENTS
CREATE POLICY "clients_self" ON clients
FOR ALL USING ( user_id = auth.uid() );

CREATE POLICY "clients_org" ON clients
FOR ALL USING (
  org_id = get_auth_org_id() 
  AND 
  get_auth_role() IN ('manager', 'director', 'admin')
);

-- PROFILES
CREATE POLICY "profiles_self" ON profiles
FOR ALL USING ( id = auth.uid() );

CREATE POLICY "profiles_org" ON profiles
FOR ALL USING ( organization_id = get_auth_org_id() );

-- ACTIVITIES
CREATE POLICY "activities_access" ON activities
FOR ALL USING (true);

-- 7. OPTIMIZE
ANALYZE;
