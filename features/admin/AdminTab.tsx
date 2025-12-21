
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
  const [savingUser, setSavingUser] = useState(false);

  const isAdmin = authUser?.role === 'admin';

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

      if (error) throw error;
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

  // Analytics Aggregation (Feature 5: Accurate Time-on-Task)
  const pulseMetrics = useMemo(() => {
     const tabUsage: Record<string, number> = {};
     activities.filter(a => a.type === 'system_navigation').forEach(a => {
        const tab = a.details?.tab_id || 'Other';
        // Normalize tab names for display
        const label = TAB_DEFINITIONS.find(t => t.id === tab)?.label || tab;
        tabUsage[label] = (tabUsage[label] || 0) + (a.details?.duration_sec || 0);
     });
     return Object.entries(tabUsage).sort((a,b) => b[1] - a[1]).slice(0, 4);
  }, [activities]);

  if (loading) return (
    <div className="p-24 text-center space-y-4">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
      <p className="text-slate-400 font-black uppercase tracking-[0.4em] text-[10px]">{diagnosticMsg}</p>
    </div>
  );
  
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-16 pb-24 font-sans">
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
             <Button variant="ghost" className="text-white border-white/10" onClick={refreshControlPanel}>Sync Pulse</Button>
          </div>
       </div>

       {/* FEATURE 5: PRODUCTIVITY PULSE (VISUAL ANALYTICS) */}
       <div className="space-y-6">
          <div className="px-2 flex justify-between items-end">
             <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Productivity Pulse</h3>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Aggregate time-on-task across all modules.</p>
             </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
             {pulseMetrics.map(([tab, sec]) => (
                <div key={tab} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between h-32 group hover:border-indigo-500 transition-all">
                   <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{tab}</div>
                   <div className="text-2xl font-black text-slate-800">{(sec / 60).toFixed(0)} <span className="text-xs text-slate-400">MINS</span></div>
                   <div className="w-full bg-slate-50 h-1 rounded-full overflow-hidden mt-2">
                      <div className="h-full bg-indigo-600 transition-all duration-1000" style={{ width: `${Math.min(100, (sec/1800)*100)}%` }}></div>
                   </div>
                </div>
             ))}
             {pulseMetrics.length === 0 && <div className="lg:col-span-4 p-12 text-center text-slate-300 italic text-sm">Waiting for telemetry data...</div>}
          </div>
       </div>

       {/* FEATURE 6: ACTIVITY MONITORING (VISIBLE OUTREACH TRACE) */}
       <div className="space-y-6">
          <div className="px-2">
             <h3 className="text-xl font-black text-slate-900 tracking-tight">Governance Feed</h3>
             <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Real-time audit of advisor interactions and protocol usage.</p>
          </div>
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
             {activities.slice(0, 15).map(a => (
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
                         <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{(a as any).profiles?.email?.split('@')[0]}</span>
                         {a.type === 'outreach' && a.details?.protocol_label && (
                            <span className="text-[9px] text-slate-400 font-bold bg-slate-100 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                               Template: {a.details.protocol_label}
                            </span>
                         )}
                         {a.type === 'system_navigation' && (
                            <span className="text-[9px] text-slate-400 italic">Active for {a.details.duration_sec}s</span>
                         )}
                      </div>
                   </div>
                </div>
             ))}
             {activities.length === 0 && <div className="p-12 text-center text-slate-300 italic text-sm">No recent activity detected.</div>}
          </div>
       </div>

       {/* TEAM ROSTER (Requirement 9) */}
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
    </div>
  );
};

export default AdminTab;
