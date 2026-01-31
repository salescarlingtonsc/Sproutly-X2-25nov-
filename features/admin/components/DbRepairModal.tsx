
import React from 'react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { useToast } from '../../../contexts/ToastContext';
import { db } from '../../../lib/db';
import SyncInspectorModal from '../../../components/sync/SyncInspectorModal';
import { useAuth } from '../../../contexts/AuthContext';
import { syncInspector, SyncCausality } from '../../../lib/syncInspector';

interface DbRepairModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DbRepairModal: React.FC<DbRepairModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [showInspector, setShowInspector] = React.useState(false);
  
  const SCRIPT_SQL = `-- ENTERPRISE SCHEMA v9.0 (DEADLOCK BUSTER)
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

-- PROFILES: Org Colleagues
CREATE POLICY "profiles_org" ON profiles
FOR ALL USING ( organization_id = get_auth_org_id() );

-- ACTIVITIES
CREATE POLICY "activities_access" ON activities
FOR ALL USING (true);

-- 7. OPTIMIZE
ANALYZE;`;

  const runRepro = async () => {
      const causality: SyncCausality = { owner: 'UI', module: 'DbRepairModal', reason: 'Manual Repro' };
      
      try {
          syncInspector.log('info', 'REPRO_STEP' as any, 'enter', causality);
          
          if (!user) {
              alert("Please log in to run diagnostics.");
              return;
          }

          // DETERMINISTIC REPRO: Use strict UUID
          const reproId = db.generateUuid();
          const now = new Date().toISOString();
          
          // Generate heavy payload to slow down the request (~50kb -> ~500kb)
          // 5000 * 40 chars = 200kb. Let's make it 25000 for ~1MB JSON body
          const heavyPayload = Array(25000).fill("repro_data_block_padding_to_slow_network_transfer_latency_simulation").join("_");

          syncInspector.log('info', 'REPRO_STEP' as any, 'before_saveClient', causality, { id: reproId, size: 'Approx 1MB' });

          // 1. Queue the record
          await db.saveClient({
              id: reproId,
              name: `Repro Test ${reproId.substring(0, 5)}`,
              profile: { name: `Repro ${reproId.substring(0, 5)}` } as any,
              lastUpdated: now,
              notes: [{ id: 'heavy', content: heavyPayload, date: now, author: 'ReproBot' }]
          } as any, user.id, {
              owner: 'UI',
              module: 'DbRepairModal',
              reason: 'Manual Repro Trigger'
          });
          
          syncInspector.log('info', 'REPRO_STEP' as any, 'after_saveClient', causality, { id: reproId });

          // Explicit call to check flush path
          db.scheduleFlush('Manual Repro Flush');
          
          // 2. Alert user for app switch
          alert("HEAVY REPRO STARTED: ~1MB Payload Queued.\n\n>>> IMMEDIATELY SWITCH APPS NOW! <<<\n\nWait 5 seconds, then return to see 'Background Interruption' in Inspector.");
      } catch (err: any) {
          syncInspector.log('error', 'REPRO_ERR' as any, err.message, causality, { stack: err.stack });
          toast.error("Repro logic crashed. Check Inspector.");
      }
  };

  if (!isOpen) return null;

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} title="System Repair & Diagnostics"
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="space-y-6">
        <div className="bg-slate-900 rounded-xl p-4">
            <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">SQL Repair Script v9.0</span>
                <span className="text-[9px] text-slate-500">Fixes Deadlocks & Visibility</span>
            </div>
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
                <h4 className="font-bold text-amber-900 text-sm">HEAVY REPRO</h4>
                <p className="text-[10px] text-amber-700">Simulate slow sync</p>
            </button>
        </div>
      </div>
    </Modal>
    <SyncInspectorModal isOpen={showInspector} onClose={() => setShowInspector(false)} />
    </>
  );
};

export default DbRepairModal;
