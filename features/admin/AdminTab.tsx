
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { db } from '../../lib/db';
import { adminDb } from '../../lib/db/admin';
import { Advisor, Client, Product, Team, AppSettings, Subscription } from '../../types';
import { DirectorDashboard } from './components/DirectorDashboard';
import { UserManagement } from './components/UserManagement';
import { AdminSettings } from './components/AdminSettings';
import { SubscriptionManager } from './components/SubscriptionManager';
import { AiKnowledgeManager } from './components/AiKnowledgeManager';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { fetchGlobalActivity, Activity } from '../../lib/db/activities';

const REPAIR_SQL = `
-- REPAIR SCRIPT V22.1: MULTI-TENANT CONFIGURATION
-- Creates settings table if missing and fixes policies.

DO $$ 
BEGIN
  -- 1. Schema Checks
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'annual_goal') THEN
      ALTER TABLE profiles ADD COLUMN annual_goal numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'organization_id') THEN
      ALTER TABLE profiles ADD COLUMN organization_id text DEFAULT 'org_default';
  END IF;
  
  ALTER TABLE profiles ALTER COLUMN reporting_to TYPE text;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'profiles_reporting_to_fkey') THEN
    ALTER TABLE profiles DROP CONSTRAINT profiles_reporting_to_fkey;
  END IF;

  -- 1b. Create Organization Settings Table (If Missing)
  CREATE TABLE IF NOT EXISTS organization_settings (
      id text PRIMARY KEY,
      data jsonb DEFAULT '{}'::jsonb,
      updated_at timestamptz DEFAULT now(),
      updated_by uuid
  );
  
  -- Enable RLS on Settings
  ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;

END $$;

-- 2. SECURE FUNCTIONS
CREATE OR REPLACE FUNCTION get_my_claims()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims jsonb;
BEGIN
  SELECT jsonb_build_object(
    'role', role,
    'org_id', organization_id,
    'report_to', reporting_to,
    'is_admin', (role = 'admin' OR is_admin = true)
  ) INTO claims
  FROM profiles
  WHERE id = (select auth.uid());
  
  RETURN coalesce(claims, '{}'::jsonb);
END;
$$;

-- NEW: Secure Client Transfer Function (Bypasses RLS for clean handovers)
CREATE OR REPLACE FUNCTION transfer_client_owner(p_client_id uuid, p_new_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE clients
  SET user_id = p_new_user_id,
      updated_at = now(),
      data = jsonb_set(
        jsonb_set(data, '{_ownerId}', to_jsonb(p_new_user_id::text)),
        '{advisorId}', to_jsonb(p_new_user_id::text)
      )
  WHERE id = p_client_id;
END;
$$;

-- 3. DROP LEGACY POLICIES
-- Clean sweep to prevent conflicts
DROP POLICY IF EXISTS "Admins manage teams" ON teams;
DROP POLICY IF EXISTS "Everyone can view teams" ON teams;
DROP POLICY IF EXISTS "Teams_Read" ON teams;
DROP POLICY IF EXISTS "Teams_Write" ON teams;

DROP POLICY IF EXISTS "Fields_Owner_All" ON client_field_values;
DROP POLICY IF EXISTS "Fields_Select" ON client_field_values;
DROP POLICY IF EXISTS "Fields_Modify" ON client_field_values;

DROP POLICY IF EXISTS "Manage knowledge base" ON sproutly_knowledge;
DROP POLICY IF EXISTS "Knowledge_Select" ON sproutly_knowledge;
DROP POLICY IF EXISTS "Knowledge_Manage" ON sproutly_knowledge;
DROP POLICY IF EXISTS "Knowledge_Read" ON sproutly_knowledge;
DROP POLICY IF EXISTS "Knowledge_Write" ON sproutly_knowledge;

DROP POLICY IF EXISTS "Org_Settings_Read" ON organization_settings;
DROP POLICY IF EXISTS "Org_Settings_Write" ON organization_settings;
DROP POLICY IF EXISTS "Org_Settings_Update" ON organization_settings;
DROP POLICY IF EXISTS "Org_Settings_Insert" ON organization_settings;

DROP POLICY IF EXISTS "Templates_Manage" ON message_templates;

DROP POLICY IF EXISTS "Files_Select" ON client_files;
DROP POLICY IF EXISTS "Files_Insert" ON client_files;
DROP POLICY IF EXISTS "Files_Delete" ON client_files;

DROP POLICY IF EXISTS "Activities_Select" ON activities;
DROP POLICY IF EXISTS "Activities_Insert" ON activities;
DROP POLICY IF EXISTS "Activities_Delete" ON activities;

-- 4. RE-CREATE GRANULAR POLICIES

-- TEAMS
CREATE POLICY "Teams_Read" ON teams FOR SELECT USING (true);
CREATE POLICY "Teams_Insert" ON teams FOR INSERT WITH CHECK ((get_my_claims()->>'is_admin')::boolean = true);
CREATE POLICY "Teams_Update" ON teams FOR UPDATE USING ((get_my_claims()->>'is_admin')::boolean = true);
CREATE POLICY "Teams_Delete" ON teams FOR DELETE USING ((get_my_claims()->>'is_admin')::boolean = true);

-- FIELDS
CREATE POLICY "Fields_Select" ON client_field_values FOR SELECT
USING ( user_id = (select auth.uid()) OR (get_my_claims()->>'is_admin')::boolean = true );
CREATE POLICY "Fields_Insert" ON client_field_values FOR INSERT
WITH CHECK ( user_id = (select auth.uid()) OR (get_my_claims()->>'is_admin')::boolean = true );
CREATE POLICY "Fields_Update" ON client_field_values FOR UPDATE
USING ( user_id = (select auth.uid()) OR (get_my_claims()->>'is_admin')::boolean = true );
CREATE POLICY "Fields_Delete" ON client_field_values FOR DELETE
USING ( user_id = (select auth.uid()) OR (get_my_claims()->>'is_admin')::boolean = true );

-- KNOWLEDGE
CREATE POLICY "Knowledge_Read" ON sproutly_knowledge FOR SELECT USING (true);
CREATE POLICY "Knowledge_Insert" ON sproutly_knowledge FOR INSERT WITH CHECK ((get_my_claims()->>'is_admin')::boolean = true);
CREATE POLICY "Knowledge_Update" ON sproutly_knowledge FOR UPDATE USING ((get_my_claims()->>'is_admin')::boolean = true);
CREATE POLICY "Knowledge_Delete" ON sproutly_knowledge FOR DELETE USING ((get_my_claims()->>'is_admin')::boolean = true);

-- SETTINGS (Organization Scoped)
CREATE POLICY "Org_Settings_Read" ON organization_settings FOR SELECT USING (true);
CREATE POLICY "Org_Settings_Update" ON organization_settings FOR UPDATE USING ((get_my_claims()->>'is_admin')::boolean = true);
CREATE POLICY "Org_Settings_Insert" ON organization_settings FOR INSERT WITH CHECK ((get_my_claims()->>'is_admin')::boolean = true);

-- TEMPLATES
CREATE POLICY "Templates_Select" ON message_templates FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Templates_Insert" ON message_templates FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Templates_Update" ON message_templates FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Templates_Delete" ON message_templates FOR DELETE USING (user_id = (select auth.uid()));

-- FILES
CREATE POLICY "Files_Select" ON client_files FOR SELECT
USING ( user_id = (select auth.uid()) OR (get_my_claims()->>'is_admin')::boolean = true );
CREATE POLICY "Files_Insert" ON client_files FOR INSERT
WITH CHECK ( user_id = (select auth.uid()) OR (get_my_claims()->>'is_admin')::boolean = true );
CREATE POLICY "Files_Delete" ON client_files FOR DELETE
USING ( user_id = (select auth.uid()) OR (get_my_claims()->>'is_admin')::boolean = true );

-- ACTIVITIES
CREATE POLICY "Activities_Select" ON activities FOR SELECT
USING ( user_id = (select auth.uid()) OR (get_my_claims()->>'is_admin')::boolean = true );
CREATE POLICY "Activities_Insert" ON activities FOR INSERT
WITH CHECK ( user_id = (select auth.uid()) OR (get_my_claims()->>'is_admin')::boolean = true );
CREATE POLICY "Activities_Delete" ON activities FOR DELETE
USING ( user_id = (select auth.uid()) OR (get_my_claims()->>'is_admin')::boolean = true );

NOTIFY pgrst, 'reload config';
`;

const MOCK_PRODUCTS: Product[] = [
    { id: 'p1', name: 'Wealth Sol', provider: 'Pru', tiers: [{ min: 0, max: Infinity, rate: 0.5, dollarUp: 0 }] },
    { id: 'p2', name: 'Term Protect', provider: 'AIA', tiers: [{ min: 0, max: Infinity, rate: 0.6, dollarUp: 0 }] }
];

const MOCK_TEAMS: Team[] = [
    { id: 'team_alpha', name: 'Alpha Squad', leaderId: 'user_1' }
];

const MOCK_SUBSCRIPTION: Subscription = {
    planId: 'pro_individual',
    status: 'active',
    seats: 1,
    nextBillingDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString()
};

const DEFAULT_SETTINGS: AppSettings = {
    statuses: [
      'New Lead', 'Contacted', 'Picked Up', 
      'NPU 1', 'NPU 2', 'NPU 3', 'NPU 4', 'NPU 5', 'NPU 6',
      'Appt Set', 'Appt Met', 'Proposal', 'Pending Decision', 'Client', 'Case Closed', 'Lost'
    ],
    platforms: ['IG', 'FB', 'LinkedIn', 'Roadshow', 'Referral', 'Cold', 'Personal', 'Other'],
    campaigns: ["PS5 Giveaway", "DJI Drone", "Dyson Airwrap", "Retirement eBook", "Tax Masterclass"],
    benchmarks: { callsPerWeek: 50, apptsPerWeek: 15 }
};

const AdminTab: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'settings' | 'ai_brain' | 'billing'>('overview');
  
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [teams, setTeams] = useState<Team[]>(MOCK_TEAMS);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [subscription, setSubscription] = useState<Subscription>(MOCK_SUBSCRIPTION);
  
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isRepairOpen, setIsRepairOpen] = useState(false);
  const [diagLog, setDiagLog] = useState<string[]>([]);
  const [diagStatus, setDiagStatus] = useState<'idle' | 'running' | 'success' | 'failure'>('idle');
  const [manualDeleteId, setManualDeleteId] = useState('');
  
  // Organization Context State
  const [availableOrgs, setAvailableOrgs] = useState<string[]>([]);
  const [configOrg, setConfigOrg] = useState<string>('');
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  
  const isInitialMount = useRef(true);
  const [fullCurrentUser, setFullCurrentUser] = useState<Advisor | null>(null);

  useEffect(() => { fetchData(); }, [user]);

  const fetchData = async () => {
    if (!supabase || !user) return;
    setLoading(true);
    setErrorState(null);
    try {
        const { data: myself, error: meErr } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        
        if (meErr) {
            if (meErr.code === 'PGRST116') {
               console.warn("User profile not found. UI will be restricted.");
            } else {
               throw meErr;
            }
        }
        
        let userOrgId = 'org_default';
        let isSuperAdmin = false;

        if (myself) {
            userOrgId = myself.organization_id || 'org_default';
            isSuperAdmin = myself.role === 'admin' || myself.is_admin === true;
            
            setFullCurrentUser({
                id: myself.id,
                name: myself.email?.split('@')[0] || 'Me',
                email: myself.email,
                role: myself.role,
                status: myself.status,
                bandingPercentage: myself.banding_percentage || 50,
                organizationId: userOrgId,
                isAgencyAdmin: isSuperAdmin || myself.role === 'director',
                subscriptionTier: myself.subscription_tier || 'free',
                teamId: myself.reporting_to
            });

            // Initialize available Orgs (Combine from Profiles and Settings)
            if (isSuperAdmin) {
                // 1. Get from Profiles
                const { data: profileOrgs } = await supabase.from('profiles').select('organization_id');
                // 2. Get from Settings Table
                const { data: settingsOrgs } = await supabase.from('organization_settings').select('id');
                
                const distinct = new Set<string>();
                distinct.add('org_default');
                if (profileOrgs) profileOrgs.forEach(p => p.organization_id && distinct.add(p.organization_id));
                if (settingsOrgs) settingsOrgs.forEach(s => distinct.add(s.id));
                
                const sortedOrgs = Array.from(distinct).sort();
                setAvailableOrgs(sortedOrgs);
            } else {
                setAvailableOrgs([userOrgId]);
            }
        }

        // Initialize target org if not set
        if (!configOrg) {
            setConfigOrg(userOrgId);
        }
        // Load initial settings
        await loadSettingsForOrg(configOrg || userOrgId);

        let profileQuery = supabase.from('profiles').select('*');
        if (!isSuperAdmin) {
            profileQuery = profileQuery.eq('organization_id', userOrgId);
        }

        const { data: profiles, error: profErr } = await profileQuery;
        
        if (profErr) {
            if (profErr.code === '42703') {
                throw new Error("Database Schema outdated (missing columns). Run DB Repair.");
            }
            throw profErr;
        }

        if (profiles) {
            const mappedAdvisors: Advisor[] = profiles.map(p => ({
                id: p.id,
                name: p.email?.split('@')[0] || 'Unknown',
                email: p.email,
                role: p.role || 'advisor',
                status: (p.status === 'approved' || p.status === 'active') ? 'active' : (p.status || 'pending'),
                bandingPercentage: p.banding_percentage || 50,
                avatar: (p.email?.[0] || 'U').toUpperCase(),
                joinedAt: p.created_at,
                organizationId: p.organization_id || 'org_default',
                teamId: p.reporting_to,
                isAgencyAdmin: p.role === 'admin' || p.is_admin,
                subscriptionTier: p.subscription_tier || 'free',
                modules: p.modules || [],
                annualGoal: p.annual_goal || 0
            }));
            setAdvisors(mappedAdvisors);
        }

        const allClients = await db.getClients(); 
        setClients(allClients);
        const logs = await fetchGlobalActivity(500); 
        setActivities(logs);

    } catch (e: any) {
        console.error("Sync Error:", e);
        setErrorState(e.message || "Failed to load admin data.");
        if (e.message?.includes('Schema') || e.message?.includes('column')) {
            setIsRepairOpen(true);
        }
    } finally {
        setLoading(false);
        setTimeout(() => { isInitialMount.current = false; }, 1000);
    }
  };

  const loadSettingsForOrg = async (orgId: string) => {
      const sysSettings = await adminDb.getSystemSettings(orgId);
      if (sysSettings) {
          setProducts(sysSettings.products || MOCK_PRODUCTS);
          setTeams(sysSettings.teams || MOCK_TEAMS);
          
          const mergedSettings = {
              ...DEFAULT_SETTINGS,
              ...(sysSettings.appSettings || {})
          };
          if (!mergedSettings.campaigns || mergedSettings.campaigns.length === 0) {
              mergedSettings.campaigns = DEFAULT_SETTINGS.campaigns;
          }
          setSettings(mergedSettings);
          if (sysSettings.subscription) setSubscription(sysSettings.subscription);
      } else {
          // Defaults for new orgs
          setSettings(DEFAULT_SETTINGS);
          setProducts(MOCK_PRODUCTS);
          setTeams(MOCK_TEAMS);
      }
  };

  const handleOrgSwitch = async (newOrg: string) => {
      if (newOrg === 'NEW') {
          const customId = prompt("Enter new Organization ID (e.g. agency_x):");
          if (customId) {
              const cleanId = customId.toLowerCase().replace(/[^a-z0-9_]/g, '_');
              setAvailableOrgs(prev => [...prev, cleanId].sort());
              setConfigOrg(cleanId);
              await loadSettingsForOrg(cleanId);
          }
          return;
      }
      setConfigOrg(newOrg);
      await loadSettingsForOrg(newOrg);
  };

  useEffect(() => {
      if (isInitialMount.current || loading || errorState) return;
      const timer = setTimeout(async () => {
          setSaveStatus('saving');
          try {
              // Save to CURRENTLY SELECTED Org Context
              await adminDb.saveSystemSettings({ products, teams, appSettings: settings, subscription }, configOrg);
              
              setSaveStatus('saved');
              setTimeout(() => setSaveStatus('idle'), 2000);
          } catch (e) {
              console.error("Save failed:", e);
              setSaveStatus('error');
          }
      }, 1500);
      return () => clearTimeout(timer);
  }, [products, teams, settings, subscription, loading, errorState, configOrg]);

  const handleUpdateAdvisor = async (updatedAdvisor: Advisor) => {
      setAdvisors(prev => prev.map(a => a.id === updatedAdvisor.id ? updatedAdvisor : a));
      if (supabase) {
          const { error } = await supabase.from('profiles').update({
              role: updatedAdvisor.role,
              status: updatedAdvisor.status,
              banding_percentage: updatedAdvisor.bandingPercentage,
              subscription_tier: updatedAdvisor.subscriptionTier,
              modules: updatedAdvisor.modules,
              is_admin: updatedAdvisor.role === 'admin',
              reporting_to: updatedAdvisor.teamId || null, 
              organization_id: updatedAdvisor.organizationId,
              annual_goal: updatedAdvisor.annualGoal
          }).eq('id', updatedAdvisor.id);
          
          if (error) {
              console.error("Profile update failed:", error);
              toast.error(`Failed to update profile: ${error.message}`);
          }
      }
  };

  const handleAddAdvisor = async (newAdvisor: Advisor) => {
      setAdvisors(prev => [...prev, newAdvisor]);
      if (supabase) {
          const { error } = await supabase.from('profiles').insert({
              id: newAdvisor.id,
              email: newAdvisor.email,
              role: newAdvisor.role,
              status: newAdvisor.status,
              organization_id: newAdvisor.organizationId,
              reporting_to: newAdvisor.teamId || null,
              banding_percentage: newAdvisor.bandingPercentage,
              subscription_tier: newAdvisor.subscriptionTier,
              modules: newAdvisor.modules,
              is_admin: newAdvisor.isAgencyAdmin
          });
          if (error) {
              console.warn("DB Insert Skipped (Auth Constraint):", error.message);
              toast.info("Invite sent. Profile will sync when user logs in.");
          } else {
              toast.success("Advisor profile created in database.");
          }
      }
  };

  const handleDeleteAdvisor = async (id: string) => {
      if (!confirm("Permanently delete this advisor?")) return;
      if (supabase && user) {
          try {
              await supabase.from('clients').update({ user_id: user.id }).eq('user_id', id);
              const { error, data } = await supabase.from('profiles').delete().eq('id', id).select('id');
              if (error) throw error;
              if (!data || data.length === 0) throw new Error("Delete failed (Silent Failure). Check permissions.");
              setAdvisors(prev => prev.filter(a => a.id !== id));
              toast.success("Advisor deleted.");
          } catch (e: any) {
              toast.error("Delete failed: " + e.message);
          }
      }
  };

  const handleUpdateClient = async (updatedClient: Client) => {
      setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
      try {
          if (updatedClient.advisorId) updatedClient._ownerId = updatedClient.advisorId;
          await db.saveClient(updatedClient, user?.id);
          toast.success("Client updated.");
      } catch (e) {
          toast.error("Failed to save client.");
      }
  };

  const handleImportLeads = async (newClients: Client[]) => {
      try {
          if (!supabase) throw new Error("No DB connection");
          const count = await db.createClientsBulk(newClients, newClients[0].advisorId || user?.id || '');
          toast.success(`Successfully imported ${count} leads.`);
          fetchData(); 
      } catch (e: any) {
          toast.error("Import failed: " + e.message);
      }
  };

  const runDiagnostics = async () => {
      if (!supabase || !user) return;
      setDiagStatus('running');
      setDiagLog([]);
      const logs: string[] = [];
      const addLog = (msg: string, status: 'info'|'success'|'error'|'warn' = 'info') => {
          const icon = status === 'success' ? '✅' : status === 'error' ? '❌' : status === 'warn' ? '⚠️' : 'ℹ️';
          const line = `${icon} ${msg}`;
          logs.push(line);
          setDiagLog(prev => [...prev, line]);
      };
      try {
          addLog(`DIAGNOSTIC START (V22.1): ${new Date().toISOString()}`);
          let { data: sessionData } = await supabase.auth.getSession();
          if (!sessionData.session) {
              addLog("Session stale. Refreshing...", 'warn');
              await supabase.auth.refreshSession();
              sessionData = await supabase.auth.getSession();
          }
          const { error: funcErr } = await supabase.rpc('get_my_claims');
          if (funcErr) addLog("Secure Function Missing. Run Repair SQL.", 'error');
          else addLog("Secure Function OK.", 'success');
          const { error: colError } = await supabase.from('profiles').select('organization_id, annual_goal').limit(1);
          if (colError) addLog("Schema missing columns (org/goal). Run SQL.", 'error');
          else addLog("Schema Columns OK.", 'success');
          
          // Check Settings Table
          const { error: setErr } = await supabase.from('organization_settings').select('id').limit(1);
          if (setErr) addLog("Settings Table Missing/Access Denied. Run SQL.", 'error');
          else addLog("Settings Table OK.", 'success');

          setDiagStatus('success');
          addLog("SYSTEM CHECK COMPLETE.", 'success');
      } catch (e: any) {
          setDiagStatus('failure');
          addLog(`CRITICAL FAILURE: ${e.message}`, 'error');
          toast.error("Diagnostic Failed: " + e.message);
      }
  };

  const handleManualDelete = async () => {
      if (!manualDeleteId) return;
      if (!confirm(`Manually DELETE item with ID: ${manualDeleteId}?`)) return;
      try {
          const { data, error } = await supabase!.rpc('delete_client_admin', { target_client_id: manualDeleteId });
          if (!error && data === true) {
              toast.success("Nuclear Delete Successful.");
              setManualDeleteId('');
              return;
          }
          const { error: clientErr, data: clientData } = await supabase!
            .from('clients')
            .delete()
            .eq('id', manualDeleteId)
            .select('id');
          if (!clientErr && clientData && clientData.length > 0) {
              toast.success("Deleted from Clients (Standard).");
              setManualDeleteId('');
              return;
          }
          toast.error("Could not delete. ID not found or Access Denied.");
      } catch (e: any) {
          toast.error("Manual delete failed: " + e.message);
      }
  };

  const copyDebugSql = () => {
      navigator.clipboard.writeText(REPAIR_SQL);
      toast.success("Repair SQL (V22.1) copied to clipboard.");
  };

  if (loading && !isRepairOpen) return <div className="p-20 text-center"><div className="animate-spin w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto"></div><p className="mt-4 text-slate-400 text-sm animate-pulse">Syncing Admin Core...</p></div>;

  const activeUser = fullCurrentUser || {
      id: user?.id || '',
      name: 'Admin',
      email: user?.email || '',
      role: 'admin',
      status: 'active',
      bandingPercentage: 100,
      joinedAt: new Date().toISOString(),
      isAgencyAdmin: true,
      organizationId: 'org_default'
  };

  const isSuperAdmin = activeUser.role === 'admin' || activeUser.isAgencyAdmin;

  // Filter advisors for Settings Tab (only show those in current config scope)
  const settingsAdvisors = advisors.filter(a => a.organizationId === configOrg);

  if (errorState && !isRepairOpen) {
      return (
          <div className="p-20 text-center flex flex-col items-center justify-center h-full">
              <div className="text-4xl mb-4">⚠️</div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Load Failed</h2>
              <p className="text-slate-500 max-w-md mx-auto mb-6">{errorState}</p>
              <button 
                  onClick={() => setIsRepairOpen(true)}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-bold shadow-lg hover:bg-indigo-700"
              >
                  Open Database Repair Tool
              </button>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 font-sans">
        <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-30">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
                {['overview', 'users', 'settings', 'ai_brain', 'billing'].map(tab => (
                    <button 
                        key={tab} onClick={() => setActiveTab(tab as any)} 
                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap capitalize ${activeTab === tab ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                    >
                        {tab.replace('_', ' ')}
                    </button>
                ))}
            </div>
            
            <div className="flex items-center gap-4">
               {isSuperAdmin ? (
                   <div className="flex items-center gap-2 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-200">
                       <span className="text-[10px] font-bold text-slate-400 uppercase">Context:</span>
                       <select 
                           value={configOrg} 
                           onChange={(e) => handleOrgSwitch(e.target.value)}
                           className="bg-transparent text-xs font-bold text-indigo-700 outline-none cursor-pointer"
                       >
                           {availableOrgs.map(o => <option key={o} value={o}>{o}</option>)}
                           <option value="NEW">+ New Config Scope</option>
                       </select>
                   </div>
               ) : (
                   <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                       Configuring: <span className="text-indigo-600">{configOrg}</span>
                   </span>
               )}

               <div className="flex items-center gap-2">
                  {saveStatus === 'saving' && <span className="text-[10px] text-indigo-500 font-bold animate-pulse">☁️ Syncing...</span>}
                  {saveStatus === 'saved' && <span className="text-[10px] text-emerald-600 font-bold">✓ Saved</span>}
                  {saveStatus === 'error' && (
                        <button 
                            onClick={() => setIsRepairOpen(true)}
                            className="text-[10px] text-red-600 font-bold flex items-center gap-1 bg-red-50 px-2 py-1 rounded-full hover:bg-red-100 transition-colors"
                            title="Click to troubleshoot"
                        >
                           ⚠️ <span className="hidden sm:inline">Failed</span>
                        </button>
                  )}
               </div>
               <div className="h-6 w-px bg-slate-200"></div>
               <button onClick={() => setIsRepairOpen(true)} className="text-xs text-white bg-rose-600 font-bold hover:bg-rose-700 px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-sm">
                  <span>🛠</span> DB Repair
               </button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto">
            {activeTab === 'overview' && (
                <DirectorDashboard 
                    clients={clients} advisors={advisors} teams={teams} currentUser={activeUser} 
                    activities={activities} products={products} onUpdateClient={handleUpdateClient} onImport={handleImportLeads}
                    onUpdateAdvisor={handleUpdateAdvisor}
                />
            )}
            {activeTab === 'users' && (
                <UserManagement 
                    advisors={advisors} teams={teams} currentUser={activeUser} 
                    onUpdateAdvisor={handleUpdateAdvisor} onDeleteAdvisor={handleDeleteAdvisor} onUpdateTeams={setTeams} 
                    onAddAdvisor={handleAddAdvisor} 
                />
            )}
            {activeTab === 'settings' && (
                <AdminSettings 
                    products={products} settings={settings} advisors={settingsAdvisors} 
                    onUpdateProducts={setProducts} onUpdateSettings={setSettings} onUpdateAdvisors={(updated) => setAdvisors(prev => prev.map(p => updated.find(u => u.id === p.id) || p))}
                />
            )}
            {activeTab === 'ai_brain' && <AiKnowledgeManager />}
            {activeTab === 'billing' && (
                <SubscriptionManager 
                    subscription={subscription} onUpdateSubscription={setSubscription} currentUser={activeUser} onUpdateUser={handleUpdateAdvisor} 
                />
            )}
        </div>

        <Modal 
            isOpen={isRepairOpen} onClose={() => setIsRepairOpen(false)} title="System Diagnostics & Repair (V22.1)"
            footer={
               <div className="flex gap-2 w-full">
                  <Button variant="ghost" onClick={() => setIsRepairOpen(false)}>Close</Button>
                  <Button variant="secondary" onClick={copyDebugSql}>2. Copy SQL (V22.1)</Button>
                  <Button variant="accent" onClick={runDiagnostics} isLoading={diagStatus === 'running'}>3. Run Check</Button>
               </div>
            }
        >
            <div className="p-4 bg-slate-900 rounded-xl text-white font-mono text-xs overflow-auto max-h-96">
                <div className="mb-4 space-y-2">
                    <p className="text-emerald-400 font-bold uppercase">Instructions (Deep Clean V22.1):</p>
                    <p>1. Click "Copy SQL" below.</p>
                    <p>2. Go to Supabase &gt; SQL Editor.</p>
                    <p>3. Paste and Run. (This creates the Organization Settings table & fixes policies).</p>
                    <p>4. Check console for "System Check Complete".</p>
                </div>
                {diagLog.length > 0 && (
                    <div className="space-y-1 mb-4 border-t border-slate-700 pt-4">
                        {diagLog.map((line, i) => <div key={i}>{line}</div>)}
                    </div>
                )}
                
                <div className="mt-4 pt-4 border-t border-slate-700">
                    <p className="text-rose-400 font-bold mb-2">Emergency Manual Delete</p>
                    <div className="flex gap-2">
                        <input 
                            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white w-full"
                            placeholder="Paste ID here..."
                            value={manualDeleteId}
                            onChange={(e) => setManualDeleteId(e.target.value)}
                        />
                        <button onClick={handleManualDelete} className="bg-rose-600 px-3 py-1 rounded text-white font-bold hover:bg-rose-700">NUKE</button>
                    </div>
                </div>

                <div className="border-t border-slate-700 pt-4 mt-4">
                    <button 
                        onClick={copyDebugSql}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-lg text-xs uppercase font-bold w-full flex items-center justify-center gap-2 shadow-lg"
                    >
                        <span>📋</span> 1. Copy Repair SQL (V22.1)
                    </button>
                </div>
            </div>
        </Modal>
    </div>
  );
};

export default AdminTab;
