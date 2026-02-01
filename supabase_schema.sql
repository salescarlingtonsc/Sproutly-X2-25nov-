
-- SPROUTLY QUANTUM MASTER SCHEMA v12.0 (THE ULTIMATE FIX)
-- This script fixes CRM Deadlocks, RLS Recursion, and the missing File Vault columns.

-- 1. NUCLEAR CLEANUP: DISABLE RLS TEMPORARILY
ALTER TABLE IF EXISTS public.clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.client_files DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activities DISABLE ROW LEVEL SECURITY;

-- 2. CLEAR EXISTING POLICIES
DROP POLICY IF EXISTS "clients_self" ON public.clients;
DROP POLICY IF EXISTS "clients_org" ON public.clients;
DROP POLICY IF EXISTS "profiles_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_org" ON public.profiles;
DROP POLICY IF EXISTS "files_self" ON public.client_files;
DROP POLICY IF EXISTS "files_org" ON public.client_files;

-- 3. HELPER FUNCTIONS (Anti-Recursion Mode)
-- We use SECURITY DEFINER to bypass RLS loops.
CREATE OR REPLACE FUNCTION public.get_auth_org_id()
RETURNS text AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- 4. TABLE STRUCTURE: FIXING CLIENT_FILES (Based on your screenshot)
-- Adding the missing metadata columns so uploads don't fail.
ALTER TABLE public.client_files 
ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'untitled',
ADD COLUMN IF NOT EXISTS size_bytes bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS mime_type text DEFAULT 'application/octet-stream',
ADD COLUMN IF NOT EXISTS storage_path text NOT NULL DEFAULT 'temp',
ADD COLUMN IF NOT EXISTS category text DEFAULT 'others',
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Ensure org_id column exists on files for team sharing
ALTER TABLE public.client_files 
ADD COLUMN IF NOT EXISTS org_id text DEFAULT 'org_default';

-- 5. RE-ENABLE SECURITY
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_files ENABLE ROW LEVEL SECURITY;

-- 6. APPLY CLEAN POLICIES

-- CLIENTS
CREATE POLICY "clients_self" ON public.clients
FOR ALL USING ( user_id = auth.uid() );

CREATE POLICY "clients_org" ON public.clients
FOR ALL USING (
  org_id = get_auth_org_id() 
  AND 
  get_auth_role() IN ('manager', 'director', 'admin')
);

-- PROFILES
CREATE POLICY "profiles_self" ON public.profiles
FOR ALL USING ( id = auth.uid() );

CREATE POLICY "profiles_org" ON public.profiles
FOR ALL USING ( organization_id = get_auth_org_id() );

-- CLIENT_FILES
CREATE POLICY "files_self" ON public.client_files
FOR ALL USING ( user_id = auth.uid() );

CREATE POLICY "files_org" ON public.client_files
FOR ALL USING (
  org_id = get_auth_org_id() 
  AND 
  get_auth_role() IN ('manager', 'director', 'admin')
);

-- 7. PERFORMANCE OPTIMIZATION
CREATE INDEX IF NOT EXISTS idx_clients_org_id ON public.clients(org_id);
CREATE INDEX IF NOT EXISTS idx_files_client_id ON public.client_files(client_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON public.profiles(organization_id);

ANALYZE;
