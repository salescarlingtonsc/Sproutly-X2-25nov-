import React, { useState } from 'react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { useToast } from '../../../contexts/ToastContext';

interface DbRepairModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const REPAIR_SCRIPT = `
-- 1. RESET & CLEANUP (Optional - Be Careful in Prod)
-- DROP TABLE IF EXISTS profiles CASCADE; 
-- Only uncomment the line above if you want to wipe data and start fresh.

-- 2. ENABLE ROW LEVEL SECURITY
alter table if exists public.profiles enable row level security;
alter table if exists public.clients enable row level security;
alter table if exists public.activities enable row level security;

-- 3. CRITICAL: SECURITY DEFINER FUNCTIONS (The Recursion Fix)
-- These functions run with elevated privileges to check roles without triggering RLS loops.

CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND (role = 'admin' OR is_admin = true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.check_is_manager_or_director()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND (role = 'manager' OR role = 'director' OR is_admin = true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS text AS $$
DECLARE
  org_id text;
BEGIN
  SELECT organization_id INTO org_id FROM profiles WHERE id = auth.uid();
  RETURN org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users on delete cascade not null primary key,
  email text,
  name text,
  role text default 'advisor',
  status text default 'pending',
  organization_id text default 'org_default',
  team_id text,
  reporting_to text,
  banding_percentage numeric default 50,
  annual_goal numeric default 120000,
  subscription_tier text default 'free',
  modules text[] default '{}',
  is_admin boolean default false,
  extra_slots numeric default 0,
  avatar text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Ensure critical columns exist even if table was already made
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_admin') THEN
        ALTER TABLE public.profiles ADD COLUMN is_admin boolean default false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='role') THEN
        ALTER TABLE public.profiles ADD COLUMN role text default 'advisor';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='organization_id') THEN
        ALTER TABLE public.profiles ADD COLUMN organization_id text default 'org_default';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='name') THEN
        ALTER TABLE public.profiles ADD COLUMN name text;
    END IF;
END $$;

-- 5. CLIENTS TABLE
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid not null primary key default gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id), -- The owner
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 6. ACTIVITIES TABLE
CREATE TABLE IF NOT EXISTS public.activities (
  id uuid not null primary key default gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  client_id uuid,
  type text,
  title text,
  message text,
  details jsonb,
  created_at timestamptz default now()
);

-- 7. SETTINGS TABLES
CREATE TABLE IF NOT EXISTS public.organization_settings (
  id text not null primary key, -- 'org_default' or specific org ID
  data jsonb not null default '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid not null primary key default gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  label text,
  content text,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.sproutly_knowledge (
  id uuid not null primary key default gen_random_uuid(),
  question text,
  answer text,
  category text,
  verified_by uuid,
  votes numeric default 0,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.crm_views (
  id uuid not null primary key default gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  name text,
  filters jsonb,
  sort jsonb,
  visible_column_ids text[],
  col_widths jsonb,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.client_files (
  id uuid not null primary key default gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  client_id uuid,
  name text,
  size_bytes numeric,
  mime_type text,
  storage_path text,
  category text,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.field_definitions (
  id uuid not null primary key default gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  key text,
  label text,
  type text,
  section text,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.client_field_values (
  id uuid not null primary key default gen_random_uuid(),
  client_id uuid,
  field_id uuid REFERENCES public.field_definitions(id),
  user_id uuid REFERENCES auth.users(id),
  value_text text,
  value_number numeric,
  value_bool boolean,
  value_date timestamptz,
  updated_at timestamptz default now(),
  UNIQUE(client_id, field_id)
);

-- 8. STORAGE BUCKET (If not exists)
insert into storage.buckets (id, name, public) 
values ('client-files', 'client-files', true)
on conflict (id) do nothing;

DROP POLICY IF EXISTS "Files Public Access" ON storage.objects;
create policy "Files Public Access" on storage.objects for select using ( bucket_id = 'client-files' );

DROP POLICY IF EXISTS "Files Upload Access" ON storage.objects;
create policy "Files Upload Access" on storage.objects for insert with check ( bucket_id = 'client-files' );

-- 9. RLS POLICIES (Recursion-Proofed)

-- Profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING ( true );

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK ( auth.uid() = id );

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING ( auth.uid() = id );

DROP POLICY IF EXISTS "Admins can update everyone" ON profiles;
CREATE POLICY "Admins can update everyone" ON profiles FOR UPDATE USING ( check_is_admin() );

-- Clients
DROP POLICY IF EXISTS "Users view own clients" ON clients;
CREATE POLICY "Users view own clients" ON clients FOR SELECT USING ( 
  auth.uid() = user_id OR 
  check_is_admin() OR 
  (check_is_manager_or_director() AND (data->>'organizationId') = get_my_org_id())
);

DROP POLICY IF EXISTS "Users insert own clients" ON clients;
CREATE POLICY "Users insert own clients" ON clients FOR INSERT WITH CHECK ( auth.uid() = user_id );

DROP POLICY IF EXISTS "Users update own clients" ON clients;
CREATE POLICY "Users update own clients" ON clients FOR UPDATE USING ( auth.uid() = user_id OR check_is_admin() );

DROP POLICY IF EXISTS "Users delete own clients" ON clients;
CREATE POLICY "Users delete own clients" ON clients FOR DELETE USING ( auth.uid() = user_id OR check_is_admin() );

-- Settings
DROP POLICY IF EXISTS "Read Settings" ON organization_settings;
CREATE POLICY "Read Settings" ON organization_settings FOR SELECT USING ( true );

DROP POLICY IF EXISTS "Update Settings" ON organization_settings;
CREATE POLICY "Update Settings" ON organization_settings FOR UPDATE USING ( check_is_admin() );

DROP POLICY IF EXISTS "Insert Settings" ON organization_settings;
CREATE POLICY "Insert Settings" ON organization_settings FOR INSERT WITH CHECK ( check_is_admin() );

-- Knowledge Base
DROP POLICY IF EXISTS "Read Knowledge" ON sproutly_knowledge;
CREATE POLICY "Read Knowledge" ON sproutly_knowledge FOR SELECT USING ( true );

DROP POLICY IF EXISTS "Manage Knowledge" ON sproutly_knowledge;
CREATE POLICY "Manage Knowledge" ON sproutly_knowledge FOR ALL USING ( check_is_admin() );

-- 10. NEW USER TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, status, organization_id)
  VALUES (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'full_name', 
    'advisor', 
    'active', 
    'org_default'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
`;

const DbRepairModal: React.FC<DbRepairModalProps> = ({ isOpen, onClose }) => {
  const toast = useToast();
  
  const handleCopy = () => {
    navigator.clipboard.writeText(REPAIR_SCRIPT);
    toast.success("SQL Script Copied to Clipboard!");
  };

  if (!isOpen) return null;

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Database Repair & Setup"
      footer={
        <div className="flex gap-2 w-full justify-end">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={handleCopy} leftIcon="📋">Copy Repair Script</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex items-start gap-3">
            <span className="text-xl">🛠️</span>
            <div>
                <h4 className="font-bold text-amber-900 text-sm">How to Fix Your Database</h4>
                <ol className="list-decimal list-inside text-xs text-amber-800 mt-2 space-y-1">
                    <li>Click <strong>"Copy Repair Script"</strong> below.</li>
                    <li>Go to your <strong>Supabase Dashboard</strong>.</li>
                    <li>Click <strong>SQL Editor</strong> in the left sidebar.</li>
                    <li>Paste the script into a new query.</li>
                    <li>Click <strong>RUN</strong>.</li>
                </ol>
            </div>
        </div>

        <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Repair Script Preview</label>
            <textarea 
                className="w-full h-64 bg-slate-900 text-emerald-400 font-mono text-[10px] p-4 rounded-xl outline-none resize-none shadow-inner"
                readOnly
                value={REPAIR_SCRIPT}
            />
        </div>
      </div>
    </Modal>
  );
};

export default DbRepairModal;