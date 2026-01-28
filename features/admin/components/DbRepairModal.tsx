import { supabase } from '../../../lib/supabase';
import { Client } from '../../../types';
import { syncInspector, SyncCausality } from '../../../lib/syncInspector';
import Dexie, { type EntityTable } from 'dexie';

import React from 'react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { useToast } from '../../../contexts/ToastContext';
import { db } from '../../../lib/db';
import SyncInspectorModal from '../../../components/sync/SyncInspectorModal';
import { useAuth } from '../../../contexts/AuthContext';

interface DbRepairModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DbRepairModal: React.FC<DbRepairModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [showInspector, setShowInspector] = React.useState(false);
  
  const SCRIPT_SQL = `-- ENTERPRISE SCHEMA v6.3 (SYNTAX HARDENED + LAST CONTACT FIX)
-- Run this in the Supabase SQL Editor to restore lead visibility and fix numeric conversion errors.

-- 1. CLEANUP: Clear old problematic policies
DO $$ 
DECLARE 
  pol record; 
BEGIN 
  FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE tablename IN (
    'profiles', 'clients', 'activities', 'organization_settings', 
    'sproutly_knowledge', 'crm_views', 'client_files',
    'message_templates', 'field_definitions', 'client_field_values', 'teams'
  ) 
  LOOP 
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename); 
  END LOOP; 
END $$;

-- 2. PROFILES HARDENING: Ensure all Auth columns exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='role') THEN
        ALTER TABLE public.profiles ADD COLUMN role text DEFAULT 'advisor';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_admin') THEN
        ALTER TABLE public.profiles ADD COLUMN is_admin boolean DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='organization_id') THEN
        ALTER TABLE public.profiles ADD COLUMN organization_id text DEFAULT 'org_default';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='subscription_tier') THEN
        ALTER TABLE public.profiles ADD COLUMN subscription_tier text DEFAULT 'free';
    END IF;
END $$;

-- 3. CLIENTS NORMALIZATION: Add explicit columns for searchable data
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='name') THEN
        ALTER TABLE public.clients ADD COLUMN name text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='email') THEN
        ALTER TABLE public.clients ADD COLUMN email text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='phone') THEN
        ALTER TABLE public.clients ADD COLUMN phone text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='stage') THEN
        ALTER TABLE public.clients ADD COLUMN stage text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='org_id') THEN
        ALTER TABLE public.clients ADD COLUMN org_id text DEFAULT 'org_default';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='revenue_value') THEN
        ALTER TABLE public.clients ADD COLUMN revenue_value numeric DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='updated_at') THEN
        ALTER TABLE public.clients ADD COLUMN updated_at timestamptz DEFAULT now();
    END IF;
    -- FIX: Missing column causing sync errors
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='last_contact_at') THEN
        ALTER TABLE public.clients ADD COLUMN last_contact_at timestamptz;
    END IF;
END $$;

-- 4. SECURITY FUNCTIONS (Non-Recursive Enterprise Standard)
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND (role = 'admin' OR role = 'director' OR is_admin = true)
    );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS text AS $$
    SELECT COALESCE(organization_id, 'org_default') FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- 5. DATA RECOVERY: Sync new columns from the JSON blob
-- PATCH v6.2: Using NULLIF to prevent crash on empty strings in numeric fields
UPDATE public.clients 
SET 
  name = COALESCE(data->'profile'->>'name', data->>'name'),
  email = COALESCE(data->'profile'->>'email', data->>'email'),
  phone = COALESCE(data->'profile'->>'phone', data->>'phone'),
  stage = COALESCE(data->'followUp'->>'status', stage),
  revenue_value = COALESCE(
    NULLIF(data->'followUp'->>'dealValue', '')::numeric, 
    NULLIF(data->>'value', '')::numeric, 
    0
  ),
  org_id = COALESCE(org_id, (SELECT organization_id FROM profiles WHERE profiles.id = clients.user_id), 'org_default'),
  last_contact_at = (
    CASE 
      WHEN data->'followUp'->>'lastContactedAt' IS NOT NULL AND data->'followUp'->>'lastContactedAt' != '' 
      THEN (data->'followUp'->>'lastContactedAt')::timestamptz 
      ELSE NULL 
    END
  )
WHERE name IS NULL OR org_id = 'org_default' OR last_contact_at IS NULL;

-- Ensure every profile has an org ID
UPDATE public.profiles SET organization_id = 'org_default' WHERE organization_id IS NULL;

-- 6. APPLY ENTERPRISE RLS POLICIES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_enterprise_select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_enterprise_all" ON public.profiles FOR ALL USING (check_is_admin() OR auth.uid() = id);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients_enterprise_visibility" ON public.clients 
FOR ALL USING (
    user_id = auth.uid() OR 
    org_id = get_my_org_id() OR 
    check_is_admin()
);

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activities_enterprise_access" ON public.activities 
FOR ALL USING (user_id = auth.uid() OR check_is_admin());

-- 7. PERFORMANCE BOOSTERS
CREATE INDEX IF NOT EXISTS idx_clients_org_search ON clients(org_id, name);
CREATE INDEX IF NOT EXISTS idx_clients_revenue_sort ON clients(revenue_value DESC);
CREATE INDEX IF NOT EXISTS idx_clients_user_v6 ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_clients_last_contact ON clients(last_contact_at DESC);

ANALYZE;`;

  const runRepro = async () => {
      if (!user) {
          alert("Please log in to run diagnostics.");
          return;
      }

      // DETERMINISTIC REPRO: Use strict UUID
      const reproId = db.generateUuid();
      const now = new Date().toISOString();

      syncInspector.log('info', 'INIT', `Starting Deterministic Repro for ID: ${reproId}`, {
          owner: 'UI',
          module: 'DbRepairModal',
          reason: 'Manual Repro'
      });

      // 1. Queue the record
      await db.saveClient({
          id: reproId,
          name: `Repro Test ${reproId.substring(0, 5)}`,
          profile: { name: `Repro ${reproId.substring(0, 5)}` } as any,
          lastUpdated: now
      } as any, user.id, {
          owner: 'UI',
          module: 'DbRepairModal',
          reason: 'Manual Repro Trigger'
      });
      
      // 2. Alert user for app switch
      alert("REPRO SAVE SUCCESSFUL: Record enqueued.\n\nNOW IMMEDIATELY switch apps for 5 seconds, then return here to verify Foreground Sync Recovery.");
  };

  if (!isOpen) return null;

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} title="System Repair & Diagnostics"
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="space-y-6">
        <div className="bg-slate-900 rounded-xl p-4">
            <textarea className="w-full h-40 bg-transparent text-emerald-400 font-mono text-[10px] outline-none resize-none" readOnly value={SCRIPT_SQL} />
            <div className="flex justify-between mt-2">
                <button onClick={() => navigator.clipboard.writeText(SCRIPT_SQL)} className="text-xs text-white bg-white/20 px-3 py-1 rounded hover:bg-white/30">Copy SQL</button>
                <div className="text-[10px] text-slate-500 pt-1">Run in Supabase SQL Editor</div>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
            <button onClick={() => setShowInspector(true)} className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-left hover:bg-indigo-100 transition-colors">
                <div className="text-xl mb-2">🩺</div>
                <h4 className="font-bold text-indigo-900 text-sm">Open Inspector</h4>
                <p className="text-[10px] text-indigo-700">View real-time sync logs</p>
            </button>
            
            <button onClick={runRepro} className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-left hover:bg-amber-100 transition-colors">
                <div className="text-xl mb-2">🧪</div>
                <h4 className="font-bold text-amber-900 text-sm">REPRO SAVE</h4>
                <p className="text-[10px] text-amber-700">Queue item & wait for switch</p>
            </button>
        </div>
      </div>
    </Modal>
    <SyncInspectorModal isOpen={showInspector} onClose={() => setShowInspector(false)} />
    </>
  );
};

export default DbRepairModal;