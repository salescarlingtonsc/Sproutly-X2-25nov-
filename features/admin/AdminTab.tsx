
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
import { dbTemplates } from '../../lib/db/templates';
import { aiLearning } from '../../lib/db/aiLearning';

const REPAIR_SQL = `
-- REPAIR SCRIPT V14.0: TEAM ASSIGNMENT FIX
-- 1. Relax Schema for Team Assignments
-- This allows 'reporting_to' to store Team IDs (text) instead of just User IDs (uuid)
DO $$ 
BEGIN
  -- Alter type to text to support Team IDs
  ALTER TABLE profiles ALTER COLUMN reporting_to TYPE text;
  
  -- Drop Foreign Key if it exists (to allow non-user IDs like 'team_xxx')
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'profiles_reporting_to_fkey') THEN
    ALTER TABLE profiles DROP CONSTRAINT profiles_reporting_to_fkey;
  END IF;
EXCEPTION
  WHEN OTHERS THEN RAISE NOTICE 'Schema update skipped/failed: %', SQLERRM;
END $$;

-- 2. Secure Access Function
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
  WHERE id = auth.uid();
  
  RETURN coalesce(claims, '{}'::jsonb);
END;
$$;

-- 3. Reset Policies
DROP POLICY IF EXISTS "Profiles_Select_Hierarchy" ON profiles;
DROP POLICY IF EXISTS "Clients_Select_Hierarchy" ON clients;
DROP POLICY IF EXISTS "Profiles_Update_Hierarchy" ON profiles;
DROP POLICY IF EXISTS "Profiles_Insert_Hierarchy" ON profiles;
DROP POLICY IF EXISTS "Profiles_Delete_Hierarchy" ON profiles;
-- Drop existing client write policies if any
DROP POLICY IF EXISTS "Clients_Insert_Policy" ON clients;
DROP POLICY IF EXISTS "Clients_Update_Policy" ON clients;
DROP POLICY IF EXISTS "Clients_Delete_Policy" ON clients;

-- 4. PROFILES POLICIES
CREATE POLICY "Profiles_Select_Hierarchy" ON profiles FOR SELECT
USING (
  auth.uid() = id
  OR (get_my_claims()->>'is_admin')::boolean = true
  OR (
    (get_my_claims()->>'role') IN ('director', 'manager')
    AND organization_id = (get_my_claims()->>'org_id')
  )
);

CREATE POLICY "Profiles_Update_Hierarchy" ON profiles FOR UPDATE
USING (
  auth.uid() = id
  OR (get_my_claims()->>'is_admin')::boolean = true
  OR (
    (get_my_claims()->>'role') IN ('director', 'manager')
    AND organization_id = (get_my_claims()->>'org_id')
  )
);

CREATE POLICY "Profiles_Insert_Hierarchy" ON profiles FOR INSERT
WITH CHECK (
  (get_my_claims()->>'is_admin')::boolean = true
  OR (
    (get_my_claims()->>'role') IN ('director', 'manager')
    AND organization_id = (get_my_claims()->>'org_id')
  )
);

CREATE POLICY "Profiles_Delete_Hierarchy" ON profiles FOR DELETE
USING (
  (get_my_claims()->>'is_admin')::boolean = true
  OR (
    (get_my_claims()->>'role') = 'director' 
    AND organization_id = (get_my_claims()->>'org_id')
  )
);

-- 5. CLIENTS POLICIES (Data)
-- Allow Managers to see clients in their Org (filtered by UI logic)
CREATE POLICY "Clients_Select_Hierarchy" ON clients FOR SELECT
USING (
  user_id = auth.uid()
  OR (get_my_claims()->>'is_admin')::boolean = true
  OR (
    (get_my_claims()->>'role') IN ('director', 'manager')
    AND EXISTS (
      SELECT 1 FROM profiles owner
      WHERE owner.id = clients.user_id
      AND owner.organization_id = (get_my_claims()->>'org_id')
    )
  )
);

-- Allow Advisors to Insert their own clients
CREATE POLICY "Clients_Insert_Policy" ON clients FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  OR (get_my_claims()->>'is_admin')::boolean = true
);

-- Allow Advisors to Update their own clients
CREATE POLICY "Clients_Update_Policy" ON clients FOR UPDATE
USING (
  auth.uid() = user_id
  OR (get_my_claims()->>'is_admin')::boolean = true
  OR (
    (get_my_claims()->>'role') IN ('director', 'manager')
    AND EXISTS (
      SELECT 1 FROM profiles owner
      WHERE owner.id = clients.user_id
      AND owner.organization_id = (get_my_claims()->>'org_id')
    )
  )
);

-- Allow Advisors to Delete their own clients
CREATE POLICY "Clients_Delete_Policy" ON clients FOR DELETE
USING (
  auth.uid() = user_id
  OR (get_my_claims()->>'is_admin')::boolean = true
  OR (
    (get_my_claims()->>'role') IN ('director')
    AND EXISTS (
      SELECT 1 FROM profiles owner
      WHERE owner.id = clients.user_id
      AND owner.organization_id = (get_my_claims()->>'org_id')
    )
  )
);

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
    platforms: ['IG', 'FB', 'LinkedIn', 'Roadshow', 'Referral', 'Cold'],
    statuses: ['New Lead', 'Contacted', 'Appt Set', 'Client', 'Lost'],
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
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isRepairOpen, setIsRepairOpen] = useState(false);
  const [diagLog, setDiagLog] = useState<string[]>([]);
  const [diagStatus, setDiagStatus] = useState<'idle' | 'running' | 'success' | 'failure'>('idle');
  const [manualDeleteId, setManualDeleteId] = useState('');
  const isInitialMount = useRef(true);

  // Use a local ref to track the CURRENT USER's full profile to guide fetching
  const [fullCurrentUser, setFullCurrentUser] = useState<Advisor | null>(null);

  useEffect(() => { fetchData(); }, [user]);

  const fetchData = async () => {
    if (!supabase || !user) return;
    setLoading(true);
    try {
        // 1. Get Full Current User Profile First (To determine Organization Scope)
        const { data: myself } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        
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
        }

        // 2. Fetch Profiles (Scoped by Organization)
        let profileQuery = supabase.from('profiles').select('*');
        
        // ISOLATION LOGIC: 
        // If not Super Admin, ONLY fetch profiles in the SAME Organization.
        if (!isSuperAdmin) {
            profileQuery = profileQuery.eq('organization_id', userOrgId);
        }

        const { data: profiles } = await profileQuery;

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
                teamId: p.reporting_to, // In our schema, reporting_to holds the Team ID for advisors
                isAgencyAdmin: p.role === 'admin' || p.is_admin,
                subscriptionTier: p.subscription_tier || 'free',
                modules: p.modules || [],
                annualGoal: p.annual_goal || 0
            }));
            setAdvisors(mappedAdvisors);
        }

        // 3. Fetch Clients (Filtered by DB logic, but we reload here)
        const allClients = await db.getClients(); 
        setClients(allClients);
        
        // 4. Settings
        const sysSettings = await adminDb.getSystemSettings();
        if (sysSettings) {
            setProducts(sysSettings.products || MOCK_PRODUCTS);
            setTeams(sysSettings.teams || MOCK_TEAMS);
            setSettings(sysSettings.appSettings || DEFAULT_SETTINGS);
            if (sysSettings.subscription) setSubscription(sysSettings.subscription);
        }
        const logs = await fetchGlobalActivity(500); 
        setActivities(logs);

    } catch (e: any) {
        console.error("Sync Error:", e);
    } finally {
        setLoading(false);
        setTimeout(() => { isInitialMount.current = false; }, 1000);
    }
  };

  useEffect(() => {
      if (isInitialMount.current || loading) return;
      const timer = setTimeout(async () => {
          setSaveStatus('saving');
          try {
              await adminDb.saveSystemSettings({ products, teams, appSettings: settings, subscription });
              setSaveStatus('saved');
              setTimeout(() => setSaveStatus('idle'), 2000);
          } catch (e) {
              setSaveStatus('error');
          }
      }, 1500);
      return () => clearTimeout(timer);
  }, [products, teams, settings, subscription, loading]);

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
              // FIXED: Extract error message string to avoid [object Object]
              const errMsg = error.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
              toast.error(`Failed to update profile: ${errMsg}`);
              // In production, we might revert the optimistic update here
              throw error;
          }
      }
  };

  const handleAddAdvisor = async (newAdvisor: Advisor) => {
      // Optimistic update
      setAdvisors(prev => [...prev, newAdvisor]);
      
      if (supabase) {
          const { error } = await supabase.from('profiles').insert({
              id: newAdvisor.id, // Will fail if ID not valid UUID matching auth, but good for tracking
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
              // Graceful degradation for "Invite" scenarios
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
          addLog(`DIAGNOSTIC START (V14.0): ${new Date().toISOString()}`);
          
          let { data: sessionData } = await supabase.auth.getSession();
          if (!sessionData.session) {
              addLog("Session stale. Refreshing...", 'warn');
              await supabase.auth.refreshSession();
              sessionData = await supabase.auth.getSession();
          }

          // Check Secure Function
          const { error: funcErr } = await supabase.rpc('get_my_claims');
          if (funcErr) addLog("Secure Function Missing. Run Repair SQL.", 'error');
          else addLog("Secure Function OK.", 'success');

          const { error: colError } = await supabase.from('profiles').select('organization_id').limit(1);
          if (colError) addLog("Schema missing 'organization_id'. Run SQL.", 'error');
          else addLog("Hierarchy Schema OK.", 'success');

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
      toast.success("Repair SQL copied to clipboard.");
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
               <div className="flex items-center gap-2">
                  {saveStatus === 'saving' && <span className="text-[10px] text-indigo-500 font-bold animate-pulse">☁️ Syncing...</span>}
                  {saveStatus === 'saved' && <span className="text-[10px] text-emerald-600 font-bold">✓ Saved</span>}
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
                    onAddAdvisor={handleAddAdvisor} // Use the new persistent handler
                />
            )}
            {activeTab === 'settings' && (
                <AdminSettings 
                    products={products} settings={settings} advisors={advisors} 
                    onUpdateProducts={setProducts} onUpdateSettings={setSettings} onUpdateAdvisors={(updated) => setAdvisors(updated)}
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
            isOpen={isRepairOpen} onClose={() => setIsRepairOpen(false)} title="System Diagnostics & Repair (V14.0)"
            footer={
               <div className="flex gap-2 w-full">
                  <Button variant="ghost" onClick={() => setIsRepairOpen(false)}>Close</Button>
                  <Button variant="secondary" onClick={copyDebugSql}>2. Copy SQL</Button>
                  <Button variant="accent" onClick={runDiagnostics} isLoading={diagStatus === 'running'}>3. Run Check</Button>
               </div>
            }
        >
            <div className="p-4 bg-slate-900 rounded-xl text-white font-mono text-xs overflow-auto max-h-96">
                <div className="mb-4 space-y-2">
                    <p className="text-emerald-400 font-bold uppercase">Instructions (Update Permissions V14.0):</p>
                    <p>1. Click "Copy Repair SQL" below.</p>
                    <p>2. Go to Supabase &gt; SQL Editor.</p>
                    <p>3. Paste and Run. (This fixes Team Assignment logic).</p>
                    <p>4. Check console for "Hierarchy Schema OK".</p>
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
                        <span>📋</span> 1. Copy Repair SQL (V14.0)
                    </button>
                </div>
            </div>
        </Modal>
    </div>
  );
};

export default AdminTab;
