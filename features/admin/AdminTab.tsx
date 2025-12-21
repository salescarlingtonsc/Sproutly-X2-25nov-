
import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { fetchGlobalActivity, Activity } from '../../lib/db/activities';
import { dbTemplates, DBTemplate } from '../../lib/db/templates';
import { TAB_DEFINITIONS, TIER_CONFIG } from '../../lib/config';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { DEFAULT_TEMPLATES, interpolateTemplate } from '../../lib/templates';
import { fmtTime, fmtDateTime } from '../../lib/helpers';
import { useToast } from '../../contexts/ToastContext';
import { runDiagnostics } from '../../lib/db/debug';

interface AdminUser {
  id: string;
  email: string;
  role: 'admin' | 'user' | 'viewer';
  subscription_tier: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  modules?: string[];
}

const AdminTab: React.FC = () => {
  const { user: authUser, refreshProfile } = useAuth();
  const toast = useToast();
  
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [diagnosticMsg, setDiagnosticMsg] = useState('Initializing Core...');
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  
  // Diagnostic State
  const [diagResults, setDiagResults] = useState<any>(null);
  const [isRunningDiag, setIsRunningDiag] = useState(false);

  const isAdmin = authUser?.role === 'admin' || authUser?.is_admin === true;

  useEffect(() => { refreshControlPanel(); }, []);
  
  const refreshControlPanel = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      setDiagnosticMsg('Syncing Governance Logic...');
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
         if (error.message.includes('stack depth')) {
            setDiagnosticMsg('RECURSION ERROR: Profiles check failed.');
            toast.error("Database Recursion Detected. Repair Required.");
            setIsSqlModalOpen(true); 
         }
         throw error;
      }
      setUsers(profiles || []);
      
      const logs = await fetchGlobalActivity();
      setActivities(logs);

      setDiagnosticMsg(`CLOUD SYNC: ACTIVE`);
    } catch (err: any) { 
      setDiagnosticMsg(`CRITICAL ERROR: ${err.message}`);
    } finally { 
      setLoading(false); 
    }
  };

  const handleRunDiagnostics = async () => {
     setIsRunningDiag(true);
     try {
        const res = await runDiagnostics();
        setDiagResults(res);
        if (res.status === 'healthy') toast.success("System Logic Verified.");
        else toast.error("Diagnostic found inconsistencies.");
     } catch (e) {
        toast.error("Diagnostic engine failure.");
     } finally {
        setIsRunningDiag(false);
     }
  };

  const handleUpdateUser = async () => {
    if (!editingUser || !supabase || !isAdmin) return;
    setSavingUser(true);
    try {
      const { error } = await supabase.from('profiles').update({
        role: editingUser.role,
        subscription_tier: editingUser.subscription_tier,
        modules: editingUser.modules,
        status: editingUser.status
      }).eq('id', editingUser.id);
      
      if (error) throw error;
      toast.success("Governance Updated.");
      await refreshControlPanel();
      setIsUserModalOpen(false);
    } catch (e: any) {
      toast.error(`Update failed: ${e.message}`);
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
      if (!isAdmin) return;
      if (!confirm("Permanently revoke access for this advisor? Data remains, but access ends.")) return;
      try {
          const { error } = await supabase.from('profiles').delete().eq('id', id);
          if (error) throw error;
          toast.success("User access revoked.");
          refreshControlPanel();
      } catch (e: any) {
          toast.error(e.message);
      }
  };

  const pulseMetrics = useMemo(() => {
     const tabUsage: Record<string, number> = {};
     activities.filter(a => a.type === 'system_navigation').forEach(a => {
        const tab = a.details?.tab_id || 'Other';
        const label = TAB_DEFINITIONS.find(t => t.id === tab)?.label || tab;
        tabUsage[label] = (tabUsage[label] || 0) + (a.details?.duration_sec || 0);
     });
     return Object.entries(tabUsage).sort((a,b) => b[1] - a[1]).slice(0, 4);
  }, [activities]);

  const repairSql = `-- Sproutly Database Repair Script (v6.0 - FINAL)
-- Objective: Absolute destruction of RLS recursion (Stack Depth errors)

-- 1. Create a strictly non-recursive SECURITY DEFINER master-check
-- Using explicit schema 'public' and setting search path for security.
CREATE OR REPLACE FUNCTION public.check_is_admin() 
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_is_admin boolean;
BEGIN
  -- Direct query bypassing RLS to break the infinite recursion cycle.
  SELECT role, is_admin INTO v_role, v_is_admin
  FROM profiles 
  WHERE id = auth.uid();
  
  RETURN (COALESCE(v_role, '') = 'admin' OR COALESCE(v_is_admin, false) = true);
END;
$$;

-- 2. Grant correct execution permissions
REVOKE EXECUTE ON FUNCTION public.check_is_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.check_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_is_admin() TO service_role;

-- 3. Reset RLS and Purge legacy policies for ALL core tables
DO $$ 
DECLARE 
  t text;
  tables_to_repair text[] := ARRAY[
    'profiles', 
    'clients', 
    'message_templates', 
    'activities', 
    'client_files', 
    'client_field_values', 
    'field_definitions', 
    'crm_views'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_repair LOOP
    -- Disable RLS temporarily to ensure safe drop of all policies
    EXECUTE 'ALTER TABLE ' || quote_ident(t) || ' DISABLE ROW LEVEL SECURITY';
    
    -- Drop EVERY policy currently associated with this table
    EXECUTE 'DO $pol$ DECLARE p record; BEGIN FOR p IN (SELECT policyname FROM pg_policies WHERE tablename = ' || quote_literal(t) || ') LOOP EXECUTE ''DROP POLICY IF EXISTS '' || quote_ident(p.policyname) || '' ON ' || quote_ident(t) || '''; END LOOP; END $pol$';
  END LOOP;
END $$;

-- 4. Re-apply Clean, Non-Recursive "Sproutly Standard" Policies
-- Profiles
CREATE POLICY "Profiles: Self Read" ON profiles FOR SELECT USING ( auth.uid() = id );
CREATE POLICY "Profiles: Admin Access" ON profiles FOR SELECT USING ( check_is_admin() );
CREATE POLICY "Profiles: Self Update" ON profiles FOR UPDATE USING ( auth.uid() = id );

-- Clients
CREATE POLICY "Clients: Owner Access" ON clients FOR ALL USING ( auth.uid() = user_id );
CREATE POLICY "Clients: Admin Access" ON clients FOR ALL USING ( check_is_admin() );

-- Message Templates
CREATE POLICY "Templates: Owner Access" ON message_templates FOR ALL USING ( auth.uid() = user_id );
CREATE POLICY "Templates: Admin Access" ON message_templates FOR ALL USING ( check_is_admin() );

-- Activities
CREATE POLICY "Activities: Owner Access" ON activities FOR ALL USING ( auth.uid() = user_id );
CREATE POLICY "Activities: Admin Access" ON activities FOR ALL USING ( check_is_admin() );

-- CRM Views
CREATE POLICY "Views: Owner Access" ON crm_views FOR ALL USING ( auth.uid() = user_id );

-- 5. Promote Current User to Admin (IMPORTANT)
-- This ensures the user executing the script remains an Admin in the application.
UPDATE profiles 
SET role = 'admin', is_admin = true, status = 'approved' 
WHERE id = auth.uid();

-- 6. Final Activation: Re-enable RLS on all repaired tables
DO $$ 
DECLARE 
  t text;
  tables_to_repair text[] := ARRAY[
    'profiles', 
    'clients', 
    'message_templates', 
    'activities', 
    'client_files', 
    'client_field_values', 
    'field_definitions', 
    'crm_views'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_repair LOOP
    EXECUTE 'ALTER TABLE ' || quote_ident(t) || ' ENABLE ROW LEVEL SECURITY';
  END LOOP;
END $$;

-- 7. Verification Results
SELECT 'Standard Protocol v6.0 Success' as status, check_is_admin() as identity_is_admin;`;

  if (loading) return (
    <div className="p-24 text-center space-y-4">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
      <p className="text-slate-400 font-black uppercase tracking-[0.4em] text-[10px]">{diagnosticMsg}</p>
    </div>
  );
  
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-12 pb-24 font-sans">
       {/* HEADER */}
       <div className="bg-slate-900 rounded-[2rem] p-8 text-white relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px]"></div>
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
             <div>
                <h2 className="text-3xl font-black tracking-tighter mb-2">Agency Control Center</h2>
                <div className="flex items-center gap-3">
                   <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                   <p className="text-indigo-300 text-[10px] font-bold uppercase tracking-widest">SYSTEM ONLINE</p>
                </div>
             </div>
             <div className="flex gap-4">
                <Button variant="ghost" className="text-white border-white/10" onClick={() => setIsSqlModalOpen(true)}>Repair Database</Button>
                <Button variant="ghost" className="text-white border-white/10" onClick={handleRunDiagnostics} isLoading={isRunningDiag}>Verify Integrity</Button>
                <Button variant="primary" className="bg-indigo-600 hover:bg-indigo-700 border-none" onClick={refreshControlPanel}>Sync Pulse</Button>
             </div>
          </div>
       </div>

       {/* GOVERNANCE FEED */}
       <div className="space-y-6">
          <div className="px-2">
             <h3 className="text-xl font-black text-slate-900 tracking-tight">Governance Feed</h3>
             <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Real-time audit of advisor interactions and protocol usage.</p>
          </div>
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
             {activities.slice(0, 15).map(a => {
                const advisor = users.find(u => u.id === a.user_id);
                return (
                  <div key={a.id} className="p-5 flex items-start gap-5 hover:bg-slate-50/50 transition-colors">
                     <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${a.type === 'outreach' ? 'bg-emerald-50 text-emerald-600' : a.type === 'file' ? 'bg-blue-50 text-blue-600' : 'bg-indigo-50 text-indigo-600'}`}>
                        {a.type === 'outreach' ? '💬' : a.type === 'file' ? '📁' : '⚡'}
                     </div>
                     <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                           <h4 className="text-sm font-black text-slate-800 truncate">{a.title}</h4>
                           <span className="text-[9px] font-black text-slate-300 uppercase shrink-0">{fmtTime(a.created_at)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                              {advisor ? advisor.email.split('@')[0] : `ID: ${a.user_id?.substring(0,8)}`}
                           </span>
                           {a.type === 'outreach' && a.details?.protocol_label && (
                              <span className="text-[9px] text-slate-400 font-bold bg-slate-100 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                                 Template: {a.details.protocol_label}
                              </span>
                           )}
                        </div>
                     </div>
                  </div>
                );
             })}
             {activities.length === 0 && <div className="p-12 text-center text-slate-300 italic text-sm">No recent activity detected.</div>}
          </div>
       </div>

       {/* AGENT GOVERNANCE */}
       <div className="space-y-6">
          <div className="px-2">
             <h3 className="text-xl font-black text-slate-900 tracking-tight">Agent Governance</h3>
             <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Manage access levels, subscription tiers, and manual overrides.</p>
          </div>
          <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
             <table className="w-full text-left">
                <thead className="bg-slate-50 text-[9px] uppercase font-black tracking-widest text-slate-400">
                   <tr>
                      <th className="px-8 py-4">Advisor</th>
                      <th className="px-8 py-4">Tier</th>
                      <th className="px-8 py-4">Status</th>
                      <th className="px-8 py-4 text-right">Actions</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                   {users.map(u => (
                      <tr key={u.id} className="hover:bg-slate-50/50 group transition-colors">
                         <td className="px-8 py-6">
                            <div className="font-bold text-slate-900 text-sm">{u.email}</div>
                            <div className="text-[9px] text-slate-300 font-mono uppercase">Joined: {fmtDateTime(u.created_at)}</div>
                         </td>
                         <td className="px-8 py-6">
                            <span className="text-[10px] font-bold text-slate-600 uppercase bg-slate-100 px-2 py-0.5 rounded-full">{u.subscription_tier}</span>
                         </td>
                         <td className="px-8 py-6">
                            <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-full border ${u.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : u.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{u.status}</span>
                         </td>
                         <td className="px-8 py-6 text-right">
                            <div className="flex justify-end gap-3">
                               <button onClick={() => { setEditingUser(u); setIsUserModalOpen(true); }} className="text-[10px] font-black uppercase text-indigo-600 hover:underline">Configure</button>
                               <button onClick={() => handleDeleteUser(u.id)} className="text-[10px] font-black uppercase text-red-500 hover:underline">Revoke</button>
                            </div>
                         </td>
                      </tr>
                   ))}
                </tbody>
             </table>
          </div>
       </div>

       {/* MODAL: USER MANAGEMENT */}
       <Modal 
          isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title="Governance Configuration"
          footer={<div className="flex gap-3"><Button variant="ghost" onClick={() => setIsUserModalOpen(false)}>Cancel</Button><Button variant="primary" onClick={handleUpdateUser} isLoading={savingUser}>Apply Logic</Button></div>}
       >
          <div className="space-y-8">
             <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Activation Status</label>
                   <select 
                     className="w-full p-3 bg-slate-50 rounded-xl font-bold outline-none border-2 border-transparent focus:border-indigo-500 text-sm"
                     value={editingUser?.status || 'pending'}
                     onChange={e => setEditingUser(u => u ? ({ ...u, status: e.target.value as any }) : null)}
                   >
                     <option value="pending">Pending Review</option>
                     <option value="approved">Activated (Full Access)</option>
                     <option value="rejected">Rejected (No Access)</option>
                   </select>
                </div>
                <div>
                   <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Subscription Tier</label>
                   <select 
                     className="w-full p-3 bg-slate-50 rounded-xl font-bold outline-none border-2 border-transparent focus:border-indigo-500 text-sm"
                     value={editingUser?.subscription_tier || 'free'}
                     onChange={e => setEditingUser(u => u ? ({ ...u, subscription_tier: e.target.value }) : null)}
                   >
                     {Object.keys(TIER_CONFIG).map(tier => (
                        <option key={tier} value={tier}>{tier.toUpperCase()}</option>
                     ))}
                   </select>
                </div>
             </div>
             <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-3 tracking-widest">Manual Module Overrides</label>
                <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                   {TAB_DEFINITIONS.filter(t => t.id !== 'admin').map(tab => (
                      <label key={tab.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer ${editingUser?.modules?.includes(tab.id) ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-transparent hover:border-slate-200'}`}>
                         <input type="checkbox" className="sr-only" checked={editingUser?.modules?.includes(tab.id) || false} onChange={() => {
                             const curr = editingUser?.modules || [];
                             const next = curr.includes(tab.id) ? curr.filter(x => x !== tab.id) : [...curr, tab.id];
                             setEditingUser(u => u ? ({...u, modules: next}) : null);
                         }} />
                         <span className="text-xs font-bold text-slate-700">{tab.icon} {tab.label}</span>
                      </label>
                   ))}
                </div>
             </div>
          </div>
       </Modal>

       {/* MODAL: SQL REPAIR */}
       <Modal 
          isOpen={isSqlModalOpen} onClose={() => setIsSqlModalOpen(false)} title="Database Repair Protocol"
          footer={<Button variant="primary" onClick={() => setIsSqlModalOpen(false)}>Acknowledged</Button>}
       >
          <div className="space-y-6">
             <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex gap-4 items-start">
                <div className="text-xl text-amber-600">⚠️</div>
                <div>
                   <h4 className="text-[10px] font-black uppercase text-amber-900 mb-1">Stack Depth Limit Exceeded</h4>
                   <p className="text-[11px] text-amber-700 leading-relaxed">
                     Your database has recursive RLS policies. This causes an infinite loop when checking permissions. Run the script below in your <b>Supabase SQL Editor</b> to resolve this immediately.
                   </p>
                </div>
             </div>
             
             <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Repair Script (v6.0 FINAL)</label>
                <div className="relative group">
                   <pre className="bg-slate-900 text-indigo-300 p-4 rounded-xl text-[10px] font-mono overflow-x-auto max-h-64 custom-scrollbar leading-relaxed">
                      {repairSql}
                   </pre>
                   <button 
                      onClick={() => { navigator.clipboard.writeText(repairSql); toast.success("Copied to clipboard"); }}
                      className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white text-[9px] px-2 py-1 rounded font-bold uppercase transition-all"
                   >
                      Copy Script
                   </button>
                </div>
             </div>

             <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-[10px] text-slate-500 italic">
                <b>Instructions:</b> Open your Supabase Dashboard &gt; SQL Editor &gt; New Query &gt; Paste &gt; Run. Refresh Sproutly once the query completes.
             </div>
          </div>
       </Modal>
    </div>
  );
};

export default AdminTab;
