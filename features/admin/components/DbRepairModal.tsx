import React, { useState, useEffect, useRef } from 'react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { useToast } from '../../../contexts/ToastContext';
import { supabase } from '../../../lib/supabase';

interface DbRepairModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// PART 1: NUCLEAR REPAIR
// Forces RLS off first to break loops, then cleans up.
const SCRIPT_PART_1 = `
-- NUCLEAR REPAIR SCRIPT v3.2 (Aggressive - Includes Writes)
-- 1. EMERGENCY BRAKE: Disable RLS to stop infinite loops immediately
ALTER TABLE IF EXISTS public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activities DISABLE ROW LEVEL SECURITY;

-- 2. FLUSH OLD POLICIES (Aggressive Cleanup)
DROP POLICY IF EXISTS "Enable read access for all users" ON profiles;
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON profiles;
DROP POLICY IF EXISTS "Enable update for users based on email" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update everyone" ON profiles;
DROP POLICY IF EXISTS "Users view own clients" ON clients;
DROP POLICY IF EXISTS "Users insert own clients" ON clients;
DROP POLICY IF EXISTS "Users update own clients" ON clients;
DROP POLICY IF EXISTS "Users delete own clients" ON clients;

-- 3. RE-DEFINE SECURITY DEFINER FUNCTIONS (Bypass RLS)
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean AS $$
BEGIN
  -- Security Definer allows this to run without triggering RLS on profiles
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND (role = 'admin' OR role = 'director' OR is_admin = true)
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

-- 4. ENSURE TABLES EXIST
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

-- Ensure columns exist
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

CREATE TABLE IF NOT EXISTS public.clients (
  id uuid not null primary key default gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

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

CREATE TABLE IF NOT EXISTS public.organization_settings (
  id text not null primary key,
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

-- 5. STORAGE
insert into storage.buckets (id, name, public) 
values ('client-files', 'client-files', true)
on conflict (id) do nothing;

DROP POLICY IF EXISTS "Files Public Access" ON storage.objects;
create policy "Files Public Access" on storage.objects for select using ( bucket_id = 'client-files' );

DROP POLICY IF EXISTS "Files Upload Access" ON storage.objects;
create policy "Files Upload Access" on storage.objects for insert with check ( bucket_id = 'client-files' );

-- 6. RE-ENABLE RLS WITH SAFE POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING ( true );
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK ( auth.uid() = id );
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING ( auth.uid() = id );
CREATE POLICY "Admins can update everyone" ON profiles FOR UPDATE USING ( check_is_admin() );

-- Clients
CREATE POLICY "Users view own clients" ON clients FOR SELECT USING ( 
  auth.uid() = user_id OR 
  check_is_admin() OR 
  (check_is_manager_or_director() AND (data->>'organizationId') = get_my_org_id())
);

CREATE POLICY "Users insert own clients" ON clients FOR INSERT WITH CHECK ( 
  auth.uid() = user_id OR check_is_admin() 
);

CREATE POLICY "Users update own clients" ON clients FOR UPDATE USING ( auth.uid() = user_id OR check_is_admin() );
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

-- 7. NEW USER TRIGGER
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

-- Drop trigger first to prevent conflicts
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
`;

// PART 2: INDEXES (Slow Execution)
// Run this second. It might timeout visually but will usually complete in background.
const SCRIPT_PART_2 = `
-- PART 2: PERFORMANCE INDEXES (Run this after Part 1)
-- This may take a moment to run on large databases.

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_org ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON public.clients(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON public.activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_data_gin ON public.clients USING GIN (data);
`;

const DbRepairModal: React.FC<DbRepairModalProps> = ({ isOpen, onClose }) => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'part1' | 'part2'>('part1');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{success: boolean, message: string} | null>(null);
  const [statusText, setStatusText] = useState('');
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    if (isOpen) {
      setIsVerifying(false);
      setVerificationResult(null);
      setStatusText('');
    }
    return () => { isMountedRef.current = false; };
  }, [isOpen]);
  
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("SQL Script Copied to Clipboard!");
  };

  // TIMEOUT WRAPPER: If a query takes >5s, it's likely an infinite recursion loop.
  const withTimeout = async <T,>(promise: Promise<T>, ms: number = 5000): Promise<T> => {
      const timeout = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error("Operation timed out - Database Loop Detected")), ms)
      );
      return Promise.race([promise, timeout]);
  };

  const simulateAppSwitching = async () => {
    if (isVerifying) return;
    setIsVerifying(true);
    setVerificationResult(null);
    setStatusText("Initiating Full Stack Simulation...");
    
    try {
      if (!supabase) throw new Error("Supabase not configured");

      const userRes = await supabase.auth.getUser();
      const userId = userRes.data.user?.id;
      if (!userId) throw new Error("Authentication Check Failed: No User ID");

      // STEP 1: Check Security Function (Fast Read)
      if (isMountedRef.current) setStatusText("1/5 Checking Security Protocols...");
      // FIX: Added intermediate 'unknown' cast to satisfy TypeScript during Promise conversion
      const { error: rpcError } = await withTimeout((supabase.rpc('check_is_admin') as unknown) as Promise<any>, 3000) as any;
      if (rpcError) throw new Error(`Security RPC Broken: ${rpcError.message}`);

      // STEP 2: Read Profile (Select)
      if (isMountedRef.current) setStatusText("2/5 Simulating Profile Load...");
      // FIX: Added intermediate 'unknown' cast to satisfy TypeScript during Promise conversion
      const { error: profileError } = await withTimeout(
          (supabase.from('profiles').select('id').limit(1).single() as unknown) as Promise<any>
      , 5000) as any;
      
      if (profileError) {
          if (profileError.message.includes('recursion') || profileError.message.includes('stack depth')) {
              throw new Error("CRITICAL: Infinite Recursion Detected in 'profiles' (READ). Run Part 1 Script.");
          }
          if (profileError.code !== 'PGRST116') throw new Error(`Profile Access Error: ${profileError.message}`);
      }

      // STEP 3: Write Profile (Update) - Critical for recursion in UPDATE policies
      if (isMountedRef.current) setStatusText("3/5 Verifying Profile Write...");
      // FIX: Added intermediate 'unknown' cast to satisfy TypeScript during Promise conversion
      const { error: writeProfileError } = await withTimeout(
          (supabase.from('profiles').update({ updated_at: new Date().toISOString() }).eq('id', userId) as unknown) as Promise<any>
      , 5000) as any;
      if (writeProfileError) {
          if (writeProfileError.message.includes('recursion') || writeProfileError.message.includes('stack depth')) {
              throw new Error("CRITICAL: Infinite Recursion Detected in 'profiles' (WRITE). Run Part 1 Script.");
          }
          throw new Error(`Profile Write Failed: ${writeProfileError.message}`);
      }

      // STEP 4: Write Client (Insert & Delete) - Critical for "Save to Supabase"
      if (isMountedRef.current) setStatusText("4/5 Verifying Client Sync...");
      const dummyId = '00000000-0000-0000-0000-000000000000'; 
      // FIX: Added intermediate 'unknown' cast to satisfy TypeScript during Promise conversion
      const { error: writeClientError } = await withTimeout(
          (supabase.from('clients').upsert({ 
              id: dummyId,
              user_id: userId, 
              data: { name: 'Health Check Probe' }
          }) as unknown) as Promise<any>
      , 5000) as any;

      if (writeClientError) {
          if (writeClientError.message.includes('recursion') || writeClientError.message.includes('stack depth')) {
              throw new Error("CRITICAL: Infinite Recursion Detected in 'clients' (WRITE). Run Part 1 Script.");
          }
          throw new Error(`Client Save Failed: ${writeClientError.message}`);
      }
      
      // Cleanup dummy
      await supabase.from('clients').delete().eq('id', dummyId);

      // STEP 5: Force Connection Reset
      if (isMountedRef.current) setStatusText("5/5 Resetting Cloud Connection...");
      await supabase.auth.refreshSession();

      if (isMountedRef.current) {
          setVerificationResult({ success: true, message: "Simulation Passed: Database Healthy (Read/Write OK)." });
          toast.success("Database Verification Passed!");
      }
    } catch (e: any) {
      if (isMountedRef.current) {
          const isRecursion = e.message?.includes('Loop') || e.message?.includes('Recursion') || e.message?.includes('stack depth');
          
          setVerificationResult({ 
              success: false, 
              message: isRecursion 
                  ? "FAILURE: Infinite Loop Detected. You MUST run Part 1." 
                  : (e.message || "Verification Failed") 
          });
          
          if (!isRecursion) toast.error("Verification Failed");
      }
    } finally {
      if (isMountedRef.current) {
          setIsVerifying(false);
          setStatusText("");
      }
    }
  };

  if (!isOpen) return null;

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Database Repair Station"
      footer={
        <div className="flex gap-2 w-full justify-between items-center">
            <div className="text-[10px] text-slate-400 font-medium truncate max-w-[200px]">
                {isVerifying ? (
                    <span className="animate-pulse text-indigo-600">{statusText}</span>
                ) : verificationResult ? (
                    <span className={verificationResult.success ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
                        {verificationResult.message}
                    </span>
                ) : 'Run scripts sequentially.'}
            </div>
            <div className="flex gap-2">
                <Button 
                    variant="secondary" 
                    onClick={simulateAppSwitching} 
                    isLoading={isVerifying} 
                    leftIcon="⚡"
                    size="sm"
                >
                    Simulate & Verify
                </Button>
                <Button variant="primary" onClick={onClose} size="sm">Done</Button>
            </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">⚠️</span>
                <h4 className="font-bold text-amber-900 text-sm">Timeout Prevention Mode</h4>
            </div>
            <p className="text-xs text-amber-800 mb-3">
                If your app freezes when switching tabs, the database is in a "Recursion Loop". Use the <strong>Nuclear Script</strong> below to break the loop.
            </p>
            <ol className="list-decimal list-inside text-[10px] text-amber-800 space-y-1 bg-white/50 p-2 rounded border border-amber-100">
                <li>Copy <strong>Part 1</strong> → Paste in Supabase SQL Editor → Run.</li>
                <li>Copy <strong>Part 2</strong> → Paste in Supabase SQL Editor → Run.</li>
                <li>Click <strong>Simulate & Verify</strong> to confirm the fix.</li>
            </ol>
        </div>

        <div>
            <div className="flex border-b border-slate-200 mb-2">
                <button 
                    onClick={() => setActiveTab('part1')}
                    className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors ${activeTab === 'part1' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}
                >
                    Part 1: Nuclear Fix (Critical)
                </button>
                <button 
                    onClick={() => setActiveTab('part2')}
                    className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors ${activeTab === 'part2' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-400'}`}
                >
                    Part 2: Indexes (Optional)
                </button>
            </div>
            
            <div className="relative">
                <textarea 
                    className="w-full h-48 bg-slate-900 text-emerald-400 font-mono text-[10px] p-4 rounded-xl outline-none resize-none shadow-inner"
                    readOnly
                    value={activeTab === 'part1' ? SCRIPT_PART_1 : SCRIPT_PART_2}
                />
                <button 
                    onClick={() => handleCopy(activeTab === 'part1' ? SCRIPT_PART_1 : SCRIPT_PART_2)}
                    className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm transition-colors"
                >
                    Copy SQL
                </button>
            </div>
        </div>
      </div>
    </Modal>
  );
};

export default DbRepairModal;