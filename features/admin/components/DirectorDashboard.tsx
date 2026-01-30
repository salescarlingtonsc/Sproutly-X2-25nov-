import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, PieChart, Pie, Legend } from 'recharts';
import { Client, Stage, Advisor, Product, Team } from '../../../types';
import { LeadImporter } from './LeadImporter';
import { ClientCard } from '../../crm/components/ClientCard';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { Activity } from '../../../lib/db/activities';
import { fmtSGD } from '../../../lib/helpers';
import { useToast } from '../../../contexts/ToastContext';
import { generateDirectorBriefing } from '../../../lib/gemini';
import { db } from '../../../lib/db';

interface DirectorDashboardProps {
  clients: Client[];
  advisors: Advisor[];
  teams: Team[];
  currentUser: Advisor;
  activities: Activity[];
  products: Product[];
  onUpdateClient: (client: Client) => void;
  onImport: (newClients: Client[]) => void;
  onUpdateAdvisor: (advisor: Advisor) => Promise<void>; 
}

type TimeFilter = 'This Month' | 'Last Month' | 'This Quarter' | 'This Year' | 'All Time';
const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#6366f1'];

export const DirectorDashboard: React.FC<DirectorDashboardProps> = ({ clients, advisors, teams, currentUser, activities, products, onUpdateClient, onImport, onUpdateAdvisor }) => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'analytics' | 'products' | 'activity' | 'leads'>('analytics');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('This Month');
  const [showImporter, setShowImporter] = useState(false);
  const [showGoalSetter, setShowGoalSetter] = useState(false);
  const [filterAdvisor, setFilterAdvisor] = useState<string>('all');
  
  const [leadSearch, setLeadSearch] = useState('');
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  
  const [showActivityBreakdown, setShowActivityBreakdown] = useState(false);
  const [showVolBreakdown, setShowVolBreakdown] = useState(false);
  const [showEffBreakdown, setShowEffBreakdown] = useState(false);
  const [showCloseBreakdown, setShowCloseBreakdown] = useState(false);

  const [goalUpdates, setGoalUpdates] = useState<Record<string, string | number>>({});
  const [isSavingGoals, setIsSavingGoals] = useState(false);

  const [aiInsight, setAiInsight] = useState<{bottleneck: string, coaching_tip: string, strategic_observation: string} | null>(null);
  const [isThinking, setIsThinking] = useState(false);

  // FIX: Ensure the current user is always available in the list, even if they are a manager without a team or assigned elsewhere
  const managedAdvisors = useMemo(() => {
      // 1. Super Admin or Agency Admin sees everyone
      if (currentUser?.isAgencyAdmin || currentUser?.role === 'admin') return advisors;
      
      let list: Advisor[] = [];
      
      // 2. If Manager/Lead, show their team members
      const myTeam = teams?.find(t => t.leaderId === currentUser?.id);
      if (myTeam) {
          list = advisors.filter(a => a.teamId === myTeam.id);
      }
      
      // 3. ALWAYS include self (for assigning leads to self)
      // Check if self is already in list (avoid duplicates)
      const selfInList = list.some(a => a.id === currentUser?.id);
      if (!selfInList) {
          const self = advisors.find(a => a.id === currentUser?.id) || currentUser;
          list.push(self);
      }
      
      return list;
  }, [advisors, teams, currentUser]);

  const activeManagedAdvisors = useMemo(() => {
      return managedAdvisors.filter(a => a.status === 'active' || a.status === 'approved');
  }, [managedAdvisors]);

  const managedClients = useMemo(() => {
      const managedAdvisorIds = new Set(managedAdvisors.map(a => a.id));
      return clients.filter(c => {
          const ownerId = c.advisorId || c._ownerId;
          return !ownerId || managedAdvisorIds.has(ownerId);
      });
  }, [clients, managedAdvisors]);

  const dateRange = useMemo(() => {
      const now = new Date();
      const start = new Date();
      const end = new Date();
      start.setHours(0,0,0,0);
      end.setHours(23,59,59,999);

      if (timeFilter === 'This Month') start.setDate(1); 
      else if (timeFilter === 'Last Month') { start.setMonth(now.getMonth() - 1); start.setDate(1); end.setDate(0); }
      else if (timeFilter === 'This Quarter') { const currQ = Math.floor(now.getMonth() / 3); start.setMonth(currQ * 3); start.setDate(1); }
      else if (timeFilter === 'This Year') { start.setMonth(0); start.setDate(1); }
      else { start.setFullYear(2000); }
      return { start, end };
  }, [timeFilter]);

  const breakdownStats = useMemo(() => {
      return managedAdvisors.map(adv => {
          const advClients = managedClients.filter(c => (c.advisorId || c._ownerId) === adv.id);
          let closureVol = 0; let contacted = 0; let apptSet = 0; let apptMet = 0; let closed = 0;

          advClients.forEach(c => {
              (c.sales || []).forEach(sale => {
                  const saleDate = new Date(sale.date);
                  if (saleDate >= dateRange.start && saleDate <= dateRange.end) closureVol += (sale.premiumAmount || 0);
              });

              if (c.milestones?.closedAt) { const d = new Date(c.milestones.closedAt); if (d >= dateRange.start && d <= dateRange.end) closed++; }
              if (c.milestones?.contactedAt) { const d = new Date(c.milestones.contactedAt); if (d >= dateRange.start && d <= dateRange.end) contacted++; }
              if (c.milestones?.appointmentSetAt) { const d = new Date(c.milestones.appointmentSetAt); if (d >= dateRange.start && d <= dateRange.end) apptSet++; }
              if (c.milestones?.appointmentMetAt) { const d = new Date(c.milestones.appointmentMetAt); if (d >= dateRange.start && d <= dateRange.end) apptMet++; }
          });

          return { advisor: adv, closureVol, contacted, apptSet, apptMet, closed, efficiency: contacted > 0 ? (apptSet / contacted) * 100 : 0, closeRate: apptMet > 0 ? (closed / apptMet) * 100 : 0 };
      }).sort((a, b) => b.closureVol - a.closureVol); 
  }, [managedAdvisors, managedClients, dateRange]);

  const totalClosureVol = breakdownStats.reduce((acc, curr) => acc + curr.closureVol, 0);
  const totalContacted = breakdownStats.reduce((acc, curr) => acc + curr.contacted, 0);
  const totalApptSet = breakdownStats.reduce((acc, curr) => acc + curr.apptSet, 0);
  const totalApptMet = breakdownStats.reduce((acc, curr) => acc + curr.apptMet, 0);
  const totalClosed = breakdownStats.reduce((acc, curr) => acc + curr.closed, 0);
  const avgEfficiency = totalContacted > 0 ? (totalApptSet / totalContacted * 100) : 0;
  const avgCloseRate = totalApptMet > 0 ? (totalClosed / totalApptMet * 100) : 0;

  const funnelData = [
    { name: 'Contacted', value: totalContacted, fill: '#3b82f6' },
    { name: 'Appt Set', value: totalApptSet, fill: '#8b5cf6' },
    { name: 'Appt Met', value: totalApptMet, fill: '#f59e0b' },
    { name: 'Closed', value: totalClosed, fill: '#10b981' },
  ];

  const activityStats = useMemo(() => {
      const stats: Record<string, { duration: number, lastActive: string }> = {};
      let totalSeconds = 0;
      activities.forEach(act => {
          const d = new Date(act.created_at);
          if (d >= dateRange.start && d <= dateRange.end) {
              if (managedAdvisors.find(a => a.id === act.user_id)) {
                  if (!stats[act.user_id || 'unknown']) stats[act.user_id || 'unknown'] = { duration: 0, lastActive: act.created_at };
                  const duration = act.details?.duration_sec || 0;
                  stats[act.user_id || 'unknown'].duration += duration;
                  totalSeconds += duration;
              }
          }
      });
      return { totalSeconds, breakdown: Object.entries(stats).map(([uid, data]) => {
          const advisor = managedAdvisors.find(a => a.id === uid);
          return { id: uid, name: advisor?.name || 'Unknown', email: advisor?.email, duration: data.duration, lastActive: data.lastActive };
      }).sort((a,b) => b.duration - a.duration) };
  }, [activities, managedAdvisors, dateRange]);

  const productStats = useMemo(() => {
      const providerRevenue: Record<string, number> = {};
      const productPerformance: Record<string, { count: number, revenue: number, name: string, provider: string }> = {};
      managedClients.forEach(c => {
          c.sales?.forEach(sale => {
             const saleDate = new Date(sale.date);
             if (saleDate >= dateRange.start && saleDate <= dateRange.end) {
                 const prod = products.find(p => p.id === sale.productId);
                 if (prod) {
                     providerRevenue[prod.provider] = (providerRevenue[prod.provider] || 0) + sale.premiumAmount;
                     if (!productPerformance[prod.id]) productPerformance[prod.id] = { count: 0, revenue: 0, name: prod.name, provider: prod.provider };
                     productPerformance[prod.id].count += 1; productPerformance[prod.id].revenue += sale.premiumAmount;
                 }
             }
          });
      });
      return { providerData: Object.entries(providerRevenue).map(([name, value]) => ({ name, value })), topProducts: Object.values(productPerformance).sort((a,b) => b.revenue - a.revenue).slice(0, 10) };
  }, [managedClients, products, dateRange]);

  const velocityData = useMemo(() => {
    const stageDurations: Record<string, number[]> = {};
    const stagesOrdered = ['New Lead', 'Picked Up', 'NPU', 'Appt Set', 'Appt Met', 'Pending Decision'];
    managedClients.forEach(c => {
        if (!c.stageHistory || c.stageHistory.length < 2) return;
        const sortedHistory = [...c.stageHistory].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        for (let i = 0; i < sortedHistory.length - 1; i++) {
            const current = sortedHistory[i]; const next = sortedHistory[i+1];
            const days = (new Date(next.date).getTime() - new Date(current.date).getTime()) / (1000 * 3600 * 24);
            const key = current.stage.includes('NPU') ? 'NPU' : current.stage;
            if (!stageDurations[key]) stageDurations[key] = []; stageDurations[key].push(days);
        }
    });
    return stagesOrdered.map(stage => {
        const durations = stageDurations[stage] || [];
        return { name: stage, avgDays: parseFloat((durations.length > 0 ? durations.reduce((a,b) => a+b, 0) / durations.length : 0).toFixed(1)), count: durations.length };
    }).filter(d => d.avgDays > 0);
  }, [managedClients]);

  const agentEfficiency = useMemo(() => {
    return managedAdvisors.map(advisor => {
        const advisorClients = clients.filter(c => (c.advisorId || c._ownerId) === advisor.id);
        let newLeadDurations: number[] = [];
        advisorClients.forEach(c => {
            if (c.milestones?.createdAt && c.milestones?.contactedAt) {
                const diff = new Date(c.milestones.contactedAt).getTime() - new Date(c.milestones.createdAt).getTime();
                if (diff > 0) newLeadDurations.push(diff / (1000 * 3600));
            }
        });
        const avgResponseHours = newLeadDurations.length > 0 ? newLeadDurations.reduce((a,b) => a+b, 0) / newLeadDurations.length : 0;
        return { id: advisor.id, name: advisor.name, avatar: advisor.avatar, avgResponseHours, leadsProcessed: newLeadDurations.length, rating: newLeadDurations.length === 0 ? 'No Data' : avgResponseHours < 4 ? 'Excellent' : avgResponseHours > 24 ? 'Needs Coaching' : 'Average' };
    }).sort((a,b) => a.avgResponseHours - b.avgResponseHours);
  }, [managedAdvisors, clients]);

  const handleAssign = (clientId: string, newAdvisorId: string) => {
    const client = clients.find(c => c.id === clientId);
    const advisor = advisors.find(a => a.id === newAdvisorId);
    if (client && advisor) {
        onUpdateClient({ ...client, advisorId: newAdvisorId, _ownerId: newAdvisorId, _ownerEmail: advisor.email });
        db.requestFlush(newAdvisorId, { owner: 'UI', module: 'DirectorDashboard', reason: 'admin_assignment' });
        toast.success(`Assigned to ${advisor.name}`);
    }
  };

  const handleGenerateInsight = async () => {
    setIsThinking(true);
    const insight = await generateDirectorBriefing({ totalClosureVol, totalContacted, avgEfficiency, avgCloseRate, topAdvisors: breakdownStats.slice(0, 3).map(b => ({name: b.advisor.name, volume: b.closureVol})), funnel: funnelData });
    setAiInsight(insight); setIsThinking(false);
  };

  const filteredLeadList = useMemo(() => {
    let list = filterAdvisor === 'all' ? managedClients : managedClients.filter(c => (c.advisorId || c._ownerId) === filterAdvisor);
    if (leadSearch) { const lower = leadSearch.toLowerCase(); list = list.filter(c => (c.name || c.profile?.name || '').toLowerCase().includes(lower) || (c.company || '').toLowerCase().includes(lower) || (c.phone || '').includes(lower)); }
    return list;
  }, [filterAdvisor, managedClients, leadSearch]);

  return (
    <div className="p-8 bg-slate-50 min-h-full animate-fade-in">
      {showImporter && <LeadImporter advisors={activeManagedAdvisors} onClose={() => setShowImporter(false)} onImport={onImport} />}
      {showActivityBreakdown && <Modal isOpen={showActivityBreakdown} onClose={() => setShowActivityBreakdown(false)} title="Team Activity" footer={<Button variant="ghost" onClick={() => setShowActivityBreakdown(false)}>Close</Button>}><div className="max-h-96 overflow-y-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-100 text-slate-500 text-xs text-left"><th className="py-2">Advisor</th><th className="py-2 text-right">Time</th></tr></thead><tbody className="divide-y divide-slate-50">{activityStats.breakdown.map((row, idx) => (<tr key={idx}><td className="py-3 font-medium">{row.name}</td><td className="py-3 text-right font-bold">{(row.duration/3600).toFixed(1)}h</td></tr>))}</tbody></table></div></Modal>}
      {showGoalSetter && <Modal isOpen={showGoalSetter} onClose={() => setShowGoalSetter(false)} title="Targets" footer={<div className="flex gap-2 w-full"><Button variant="ghost" onClick={() => setShowGoalSetter(false)}>Cancel</Button><Button variant="primary" onClick={async () => { setIsSavingGoals(true); for(const id in goalUpdates) { const a = advisors.find(x => x.id === id); if(a) await onUpdateAdvisor({...a, annualGoal: parseFloat(String(goalUpdates[id]))}); } toast.success("Goals updated"); setShowGoalSetter(false); setIsSavingGoals(false); }} isLoading={isSavingGoals}>Save</Button></div>}><div className="max-h-96 overflow-y-auto"><table className="w-full text-sm"><thead className="bg-slate-50 sticky top-0 border-b"><tr><th className="py-3 px-2">Advisor</th><th className="py-3 px-2 text-right">Goal ($)</th></tr></thead><tbody className="divide-y">{activeManagedAdvisors.map(adv => (<tr key={adv.id}><td className="py-3 px-2 font-bold text-xs">{adv.name}</td><td className="py-3 px-2 text-right"><input type="number" className="w-24 text-right p-1.5 border rounded" value={goalUpdates[adv.id] ?? adv.annualGoal} onChange={e => setGoalUpdates({...goalUpdates, [adv.id]: e.target.value})} /></td></tr>))}</tbody></table></div></Modal>}
      {viewingClient && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex justify-center p-4 animate-fade-in overflow-y-auto" onClick={() => setViewingClient(null)}><div className="w-full max-w-2xl min-h-0 h-fit my-auto animate-scale-in" onClick={e => e.stopPropagation()}><div className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col border max-h-[90dvh]"><ClientCard client={viewingClient} products={products} onUpdate={(u) => { onUpdateClient(u); setViewingClient(u); }} currentUser={currentUser} onDelete={async (id) => { await db.deleteClient(id); setViewingClient(null); }} onClose={() => setViewingClient(null)} /></div></div></div>}

      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div><h1 className="text-2xl font-bold text-slate-900">{currentUser?.isAgencyAdmin ? 'Agency Overview' : 'Team Performance'}</h1><p className="text-slate-500">Viewing {managedAdvisors.length} advisors.</p></div>
          <div className="flex gap-4"><div className="bg-white rounded-lg border border-slate-200 p-1 flex shadow-sm">{['This Month', 'Last Month', 'This Quarter', 'This Year', 'All Time'].map(tf => (<button key={tf} onClick={() => setTimeFilter(tf as TimeFilter)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${timeFilter === tf ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-900'}`}>{tf}</button>))}</div><div className="bg-white p-1 rounded-xl border flex shadow-sm">{['analytics', 'products', 'activity', 'leads'].map(tab => (<button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-4 py-2 text-sm font-medium rounded-lg transition-all capitalize ${activeTab === tab ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-900'}`}>{tab}</button>))}</div><button onClick={() => setShowGoalSetter(true)} className="bg-emerald-50 text-emerald-700 font-bold px-4 py-2 rounded-lg text-xs border border-emerald-100 shadow-sm flex items-center gap-2"><span>🎯</span> Targets</button></div>
        </header>

        {activeTab === 'analytics' && (
          <><div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10"><div onClick={() => setShowActivityBreakdown(true)} className="bg-white p-6 rounded-2xl border hover:shadow-md transition-all cursor-pointer group"><p className="text-xs font-semibold text-slate-400 uppercase mb-2">Team Activity</p><p className="text-3xl font-bold">{(activityStats.totalSeconds/3600).toFixed(1)}h</p></div><div onClick={() => setShowVolBreakdown(true)} className="bg-white p-6 rounded-2xl border hover:shadow-md transition-all cursor-pointer group"><p className="text-xs font-semibold text-slate-400 uppercase mb-2">Total Closure</p><p className="text-3xl font-bold">{fmtSGD(totalClosureVol).split('.')[0]}</p></div><div onClick={() => setShowEffBreakdown(true)} className="bg-white p-6 rounded-2xl border hover:shadow-md transition-all cursor-pointer group"><p className="text-xs font-semibold text-slate-400 uppercase mb-2">Appt Efficiency</p><p className="text-3xl font-bold">{avgEfficiency.toFixed(1)}%</p></div><div onClick={() => setShowCloseBreakdown(true)} className="bg-white p-6 rounded-2xl border hover:shadow-md transition-all cursor-pointer group"><p className="text-xs font-semibold text-slate-400 uppercase mb-2">Close Rate</p><p className="text-3xl font-bold text-emerald-600">{avgCloseRate.toFixed(1)}%</p></div></div><div className="grid grid-cols-1 lg:grid-cols-3 gap-8"><div className="lg:col-span-2 bg-white p-6 rounded-2xl border shadow-sm"><h3 className="font-semibold text-slate-800 mb-6">Conversion Funnel</h3><div className="h-80 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={funnelData} layout="vertical"><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} tick={{fontSize: 12}} /><Tooltip cursor={{fill: '#f8fafc'}} /><Bar dataKey="value" barSize={30} radius={[0, 4, 4, 0]}>{funnelData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.fill} />))}</Bar></BarChart></ResponsiveContainer></div></div><div className="bg-slate-900 p-6 rounded-2xl text-white shadow-lg flex flex-col relative overflow-hidden group"><div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/20 rounded-full blur-[60px]"></div><h3 className="font-semibold mb-4 flex items-center gap-2 relative z-10"><span>🧠</span> Strategic Insight</h3><div className="flex-1 relative z-10">{isThinking ? <div className="animate-pulse">Analyzing...</div> : aiInsight ? <div className="animate-in fade-in space-y-4"><div><p className="text-[10px] text-indigo-300 uppercase font-black">Bottleneck</p><p className="text-sm font-bold">{aiInsight.bottleneck}</p></div><div><p className="text-[10px] text-emerald-400 uppercase font-black">Coaching</p><p className="text-xs italic">"{aiInsight.coaching_tip}"</p></div></div> : <div className="text-sm text-slate-400">Ready for review.</div>}</div><button onClick={handleGenerateInsight} disabled={isThinking} className="w-full py-3 mt-4 bg-white text-slate-900 rounded-xl text-xs font-bold hover:bg-indigo-50 transition-colors shadow-lg relative z-10 disabled:opacity-50">{isThinking ? 'Thinking...' : 'Generate Director Brief'}</button></div></div></>
        )}

        {activeTab === 'leads' && (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden"><div className="p-4 border-b flex items-center justify-between"><div className="flex items-center gap-4"><h3 className="font-bold">Lead Assignment</h3><input type="text" placeholder="Search..." className="pl-4 pr-4 py-1.5 bg-slate-50 border rounded-lg text-xs outline-none w-48" value={leadSearch} onChange={e => setLeadSearch(e.target.value)} /><select value={filterAdvisor} onChange={e => setFilterAdvisor(e.target.value)} className="bg-slate-50 border rounded-lg text-sm px-3 py-1.5"><option value="all">All Agents</option>{activeManagedAdvisors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div><button onClick={() => setShowImporter(true)} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg shadow-sm">Import Leads</button></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 border-b"><tr><th className="px-6 py-3 font-semibold text-slate-500">Client Name</th><th className="px-6 py-3 font-semibold text-slate-500">Stage</th><th className="px-6 py-3 font-semibold text-slate-500">Value</th><th className="px-6 py-3 font-semibold text-slate-500">Current Advisor</th><th className="px-6 py-3 font-semibold text-slate-500">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredLeadList.map(client => { const currentAdvisor = advisors.find(a => a.id === (client.advisorId || client._ownerId)); return (<tr key={client.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => setViewingClient(client)}><td className="px-6 py-3"><div className="font-medium text-slate-900">{client.name}</div><div className="text-xs text-slate-400">{client.company}</div></td><td className="px-6 py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-slate-100">{client.stage}</span></td><td className="px-6 py-3 font-medium">${(client.value || 0).toLocaleString()}</td><td className="px-6 py-3"><div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">{currentAdvisor?.avatar || '??'}</div><span>{currentAdvisor?.name || 'Unassigned'}</span></div></td><td className="px-6 py-3" onClick={e => e.stopPropagation()}><select value={client.advisorId || client._ownerId || ''} onChange={e => handleAssign(client.id, e.target.value)} className="bg-white border text-slate-600 text-xs rounded px-2 py-1"><option value="" disabled>Re-assign...</option>{activeManagedAdvisors.map(adv => (<option key={adv.id} value={adv.id}>{adv.name}</option>))}</select></td></tr>); })}</tbody></table></div></div>
        )}
      </div>
    </div>
  );
};
