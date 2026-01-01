
import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, PieChart, Pie, Legend } from 'recharts';
import { Client, Stage, Advisor, Product, Team } from '../../../types';
import { LeadImporter } from './LeadImporter';

interface DirectorDashboardProps {
  clients: Client[];
  advisors: Advisor[];
  teams: Team[];
  currentUser: Advisor;
  activeSeconds: number;
  products: Product[];
  onUpdateClient: (client: Client) => void;
  onImport: (newClients: Client[]) => void;
}

type TimeFilter = 'Monthly' | 'Quarterly' | 'Yearly' | 'All Time';
const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#6366f1'];

export const DirectorDashboard: React.FC<DirectorDashboardProps> = ({ clients, advisors, teams, currentUser, activeSeconds, products, onUpdateClient, onImport }) => {
  const [activeTab, setActiveTab] = useState<'analytics' | 'products' | 'activity' | 'leads'>('analytics');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('Monthly');
  const [showImporter, setShowImporter] = useState(false);
  const [filterAdvisor, setFilterAdvisor] = useState<string>('all');

  // --- Hierarchy Filter Logic ---
  const managedAdvisors = useMemo(() => {
      if (currentUser.isAgencyAdmin) return advisors;
      const myTeam = teams.find(t => t.leaderId === currentUser.id);
      if (!myTeam) return []; 
      return advisors.filter(a => a.teamId === myTeam.id);
  }, [advisors, teams, currentUser]);

  const managedClients = useMemo(() => {
      const managedAdvisorIds = managedAdvisors.map(a => a.id);
      return clients.filter(c => c.advisorId && managedAdvisorIds.includes(c.advisorId));
  }, [clients, managedAdvisors]);

  // --- Date Filtering Logic ---
  const filteredClients = useMemo(() => {
      if (timeFilter === 'All Time') return managedClients;
      const now = new Date();
      return managedClients.filter(c => {
          // Safeguard: Check if milestones exist before accessing properties
          if (!c.milestones?.createdAt) return false;
          const d = new Date(c.milestones.createdAt);
          const diffDays = (now.getTime() - d.getTime()) / (1000 * 3600 * 24);
          if (timeFilter === 'Monthly') return diffDays <= 30;
          if (timeFilter === 'Quarterly') return diffDays <= 90;
          if (timeFilter === 'Yearly') return diffDays <= 365;
          return true;
      });
  }, [managedClients, timeFilter]);

  // --- Analytics Logic ---
  const leads = filteredClients.length;
  // Added safeguards (?.milestones)
  const contacted = filteredClients.filter(c => c.milestones?.contactedAt || ([Stage.PICKED_UP, Stage.APPT_SET, Stage.APPT_MET, Stage.PENDING, Stage.CLOSED] as string[]).includes(c.stage)).length;
  const apptSet = filteredClients.filter(c => c.milestones?.appointmentSetAt || ([Stage.APPT_SET, Stage.APPT_MET, Stage.PENDING, Stage.CLOSED] as string[]).includes(c.stage)).length;
  const apptMet = filteredClients.filter(c => c.milestones?.appointmentMetAt || ([Stage.APPT_MET, Stage.PENDING, Stage.CLOSED] as string[]).includes(c.stage)).length;
  const closed = filteredClients.filter(c => c.stage === Stage.CLOSED || c.milestones?.closedAt).length;

  const funnelData = [
    { name: 'Leads', value: leads, fill: '#64748b' },
    { name: 'Contacted', value: contacted, fill: '#3b82f6' },
    { name: 'Appt Set', value: apptSet, fill: '#8b5cf6' },
    { name: 'Appt Met', value: apptMet, fill: '#f59e0b' },
    { name: 'Closed', value: closed, fill: '#10b981' },
  ];

  const contactRatio = leads > 0 ? (contacted / leads * 100).toFixed(1) : 0;
  const setRatio = contacted > 0 ? (apptSet / contacted * 100).toFixed(1) : 0;
  const closeRatio = apptMet > 0 ? (closed / apptMet * 100).toFixed(1) : 0;

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  // --- Product Logic ---
  const productStats = useMemo(() => {
      const providerRevenue: Record<string, number> = {};
      const productPerformance: Record<string, { count: number, revenue: number, name: string, provider: string }> = {};

      filteredClients.forEach(c => {
          c.sales?.forEach(sale => {
             const prod = products.find(p => p.id === sale.productId);
             if (prod) {
                 providerRevenue[prod.provider] = (providerRevenue[prod.provider] || 0) + sale.premiumAmount;
                 if (!productPerformance[prod.id]) {
                     productPerformance[prod.id] = { count: 0, revenue: 0, name: prod.name, provider: prod.provider };
                 }
                 productPerformance[prod.id].count += 1;
                 productPerformance[prod.id].revenue += sale.premiumAmount;
             }
          });
      });

      const providerData = Object.entries(providerRevenue).map(([name, value]) => ({ name, value }));
      const topProducts = Object.values(productPerformance).sort((a,b) => b.revenue - a.revenue).slice(0, 10);

      return { providerData, topProducts };
  }, [filteredClients, products]);

  // --- Pipeline Velocity Logic (Macro) ---
  const velocityData = React.useMemo(() => {
    const stageDurations: Record<string, number[]> = {};
    const stagesOrdered = [
        'New Lead', 'Picked Up', 
        'NPU 1', 'NPU 2', 'NPU 3', 'NPU 4', 'NPU 5', 'NPU 6',
        'Appt Set', 'Appt Met', 'Pending Decision'
    ];

    managedClients.forEach(c => {
        if (!c.stageHistory || c.stageHistory.length < 2) return;
        const sortedHistory = [...c.stageHistory].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        for (let i = 0; i < sortedHistory.length - 1; i++) {
            const current = sortedHistory[i];
            const next = sortedHistory[i+1];
            const diffTime = new Date(next.date).getTime() - new Date(current.date).getTime();
            const days = diffTime / (1000 * 3600 * 24);
            
            if (!stageDurations[current.stage]) stageDurations[current.stage] = [];
            stageDurations[current.stage].push(days);
        }
    });

    return stagesOrdered.map(stage => {
        const durations = stageDurations[stage] || [];
        const avg = durations.length > 0 
            ? durations.reduce((a,b) => a+b, 0) / durations.length 
            : 0;
        return { name: stage, avgDays: parseFloat(avg.toFixed(1)), count: durations.length };
    }).filter(d => d.name.includes('NPU') || d.name === 'New Lead' || d.name === 'Picked Up' || d.avgDays > 0);
  }, [managedClients]);

  // --- Agent Efficiency Logic (Micro) ---
  const agentEfficiency = useMemo(() => {
    return managedAdvisors.map(advisor => {
        const advisorClients = clients.filter(c => c.advisorId === advisor.id);
        
        let newLeadDurations: number[] = [];
        let npuDurations: number[] = [];

        advisorClients.forEach(c => {
            if (!c.stageHistory || c.stageHistory.length < 2) return;
            
            // Sort by date ascending
            const sortedHistory = [...c.stageHistory].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            for (let i = 0; i < sortedHistory.length - 1; i++) {
                const current = sortedHistory[i];
                const next = sortedHistory[i+1];
                const diffMs = new Date(next.date).getTime() - new Date(current.date).getTime();
                const diffHours = diffMs / (1000 * 60 * 60);
                const diffDays = diffHours / 24;

                // 1. New Lead Response Time
                if (current.stage === 'New Lead') {
                    newLeadDurations.push(diffHours);
                }

                // 2. NPU Stagnation (Time between NPU stages)
                if (current.stage.includes('NPU')) {
                    npuDurations.push(diffDays);
                }
            }
        });

        const avgResponseHours = newLeadDurations.length > 0 
            ? newLeadDurations.reduce((a,b) => a+b, 0) / newLeadDurations.length 
            : 0;

        const avgNpuDays = npuDurations.length > 0
            ? npuDurations.reduce((a,b) => a+b, 0) / npuDurations.length
            : 0;
        
        // Rating Logic
        let rating: 'Excellent' | 'Average' | 'Needs Coaching' | 'No Data' = 'No Data';
        if (newLeadDurations.length > 0) {
            if (avgResponseHours < 4 && avgNpuDays < 5) rating = 'Excellent';
            else if (avgResponseHours > 24 || avgNpuDays > 14) rating = 'Needs Coaching';
            else rating = 'Average';
        }

        return {
            id: advisor.id,
            name: advisor.name,
            avatar: advisor.avatar,
            avgResponseHours,
            avgNpuDays,
            leadsProcessed: newLeadDurations.length,
            npuMovements: npuDurations.length,
            rating
        };
    }).sort((a,b) => {
        // Sort: Active users first, then by speed
        if (a.leadsProcessed === 0 && b.leadsProcessed > 0) return 1;
        if (b.leadsProcessed === 0 && a.leadsProcessed > 0) return -1;
        return a.avgResponseHours - b.avgResponseHours;
    });
  }, [managedAdvisors, clients]);

  // --- Lead Management Logic ---
  const handleAssign = (clientId: string, newAdvisorId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (client) {
      onUpdateClient({ ...client, advisorId: newAdvisorId });
    }
  };

  const filteredLeadList = filterAdvisor === 'all' 
    ? managedClients 
    : managedClients.filter(c => c.advisorId === filterAdvisor);

  return (
    <div className="p-8 bg-slate-50 min-h-full animate-fade-in">
      {showImporter && (
        <LeadImporter 
          advisors={managedAdvisors} 
          onClose={() => setShowImporter(false)} 
          onImport={onImport} 
        />
      )}

      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
                {currentUser.isAgencyAdmin ? 'Agency Overview' : 'Team Performance'}
            </h1>
            <p className="text-slate-500">
                Viewing data for {managedAdvisors.length} advisors.
            </p>
          </div>
          
          <div className="flex gap-4">
             {/* Time Filter */}
             <div className="bg-white rounded-lg border border-slate-200 p-1 flex shadow-sm">
                 {['Monthly', 'Quarterly', 'Yearly', 'All Time'].map(tf => (
                    <button
                        key={tf}
                        onClick={() => setTimeFilter(tf as TimeFilter)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${timeFilter === tf ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
                    >
                        {tf}
                    </button>
                 ))}
             </div>

             <div className="bg-white p-1 rounded-xl border border-slate-200 flex shadow-sm">
                <button 
                onClick={() => setActiveTab('analytics')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'analytics' ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-900'}`}
                >
                Analytics
                </button>
                <button 
                onClick={() => setActiveTab('products')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'products' ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-900'}`}
                >
                Products
                </button>
                <button 
                onClick={() => setActiveTab('activity')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'activity' ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-900'}`}
                >
                Activity
                </button>
                <button 
                onClick={() => setActiveTab('leads')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'leads' ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-900'}`}
                >
                Leads
                </button>
            </div>
          </div>
        </header>

        {activeTab === 'analytics' && (
          <>
            {/* Top Level Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                 <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Team Activity</p>
                 <p className="text-3xl font-bold text-slate-900">{formatTime(activeSeconds)}</p>
                 <p className="text-xs text-emerald-600 mt-2 font-medium">Across {managedAdvisors.length} active agents</p>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                 <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Total Closure Vol</p>
                 <p className="text-3xl font-bold text-slate-900">
                    ${(filteredClients.filter(c => c.stage === Stage.CLOSED).reduce((a, b) => a + (b.value || 0), 0) / 1000).toFixed(1)}k
                 </p>
                 <p className="text-xs text-slate-400 mt-2">Weighted Pipeline ({timeFilter})</p>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                 <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Appt Efficiency</p>
                 <p className="text-3xl font-bold text-slate-900">{setRatio}%</p>
                 <p className="text-xs text-slate-500 mt-2">Contact → Appt Rate</p>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                 <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Close Rate</p>
                 <p className="text-3xl font-bold text-emerald-600">{closeRatio}%</p>
                 <p className="text-xs text-slate-500 mt-2">Appt Met → Closed</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-semibold text-slate-800 mb-6">Conversion Funnel</h3>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                       <XAxis type="number" hide />
                       <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 12}} />
                       <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                       <Bar dataKey="value" barSize={30} radius={[0, 4, 4, 0]}>
                          {funnelData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                       </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-slate-900 p-6 rounded-2xl text-white shadow-lg flex flex-col">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                   <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                   Coaching Cue
                </h3>
                <div className="flex-1">
                   <div className="mb-6">
                     <p className="text-xs text-slate-400 mb-1">Observation</p>
                     <p className="text-sm font-medium leading-relaxed">
                       High volume of leads ({leads}), but low appointment setting rate ({setRatio}%). 
                       Agent is making calls but struggling to bridge value.
                     </p>
                   </div>
                   <div className="mb-6">
                     <p className="text-xs text-slate-400 mb-1">Recommendation</p>
                     <p className="text-sm font-medium leading-relaxed text-emerald-300">
                       Focus weekly 1:1 on "The First 30 Seconds". Roleplay the opening hook. 
                       Review the top 3 drop-off calls.
                     </p>
                   </div>
                </div>
                <button className="w-full py-3 bg-white text-slate-900 rounded-xl text-sm font-bold hover:bg-slate-100 transition-colors">
                  Start Coaching Session
                </button>
              </div>
            </div>
          </>
        )}

        {/* PRODUCTS TAB */}
        {activeTab === 'products' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                    <h3 className="font-bold text-slate-800 mb-2">Revenue by Provider</h3>
                    <div className="flex-1 min-h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={productStats.providerData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {productStats.providerData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                 <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                     <h3 className="font-bold text-slate-800 mb-6">Top Selling Products</h3>
                     <div className="flex-1 overflow-auto">
                         <table className="w-full text-left text-sm">
                             <thead className="bg-slate-50 border-b border-slate-100">
                                 <tr>
                                     <th className="px-4 py-2 font-semibold text-slate-600">Product</th>
                                     <th className="px-4 py-2 font-semibold text-slate-600">Cases</th>
                                     <th className="px-4 py-2 font-semibold text-slate-600 text-right">Revenue</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-slate-50">
                                 {productStats.topProducts.map((p, idx) => (
                                     <tr key={idx}>
                                         <td className="px-4 py-3">
                                             <div className="font-medium text-slate-800">{p.name}</div>
                                             <div className="text-xs text-slate-500">{p.provider}</div>
                                         </td>
                                         <td className="px-4 py-3 font-mono text-slate-600">{p.count}</td>
                                         <td className="px-4 py-3 text-right font-bold text-emerald-600">${p.revenue.toLocaleString()}</td>
                                     </tr>
                                 ))}
                             </tbody>
                         </table>
                     </div>
                </div>
            </div>
        )}

        {/* ACTIVITY TRACKER (Formerly Velocity) */}
        {activeTab === 'activity' && (
            <div className="space-y-6">
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="mb-8">
                        <h3 className="text-lg font-bold text-slate-800">Pipeline Velocity</h3>
                        <p className="text-sm text-slate-500">Average days spent in each stage across all advisors.</p>
                    </div>
                    <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={velocityData} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="name" tick={{fontSize: 11}} angle={-45} textAnchor="end" height={60} />
                                <YAxis tick={{fontSize: 12}} />
                                <Tooltip 
                                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                    cursor={{fill: '#f8fafc'}}
                                />
                                <Bar dataKey="avgDays" radius={[4, 4, 0, 0]} barSize={40}>
                                    {velocityData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.avgDays > 14 ? '#ef4444' : entry.avgDays > 7 ? '#f59e0b' : '#3b82f6'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 bg-slate-50">
                        <h3 className="text-lg font-bold text-slate-800">Agent Efficiency Tracker</h3>
                        <p className="text-sm text-slate-500">Response times and NPU movement analysis.</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase text-xs tracking-wider">
                                    <th className="px-6 py-4 font-semibold">Advisor</th>
                                    <th className="px-6 py-4 font-semibold">Speed to Contact <span className="normal-case font-normal text-slate-400">(New → Contacted)</span></th>
                                    <th className="px-6 py-4 font-semibold">NPU Velocity <span className="normal-case font-normal text-slate-400">(Avg days per NPU stage)</span></th>
                                    <th className="px-6 py-4 font-semibold text-right">Efficiency Rating</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {agentEfficiency.map(agent => (
                                    <tr key={agent.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">{agent.avatar}</div>
                                                <div className="font-medium text-slate-900">{agent.name}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {agent.leadsProcessed > 0 ? (
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-sm font-bold ${agent.avgResponseHours < 4 ? 'text-emerald-600' : agent.avgResponseHours > 24 ? 'text-rose-600' : 'text-slate-700'}`}>
                                                        {agent.avgResponseHours < 24 
                                                            ? `${agent.avgResponseHours.toFixed(1)} hrs`
                                                            : `${(agent.avgResponseHours / 24).toFixed(1)} days`
                                                        }
                                                    </span>
                                                    <span className="text-xs text-slate-400">({agent.leadsProcessed} leads)</span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-400 text-xs italic">No data</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {agent.npuMovements > 0 ? (
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-sm font-bold ${agent.avgNpuDays < 5 ? 'text-emerald-600' : agent.avgNpuDays > 14 ? 'text-rose-600' : 'text-slate-700'}`}>
                                                        {agent.avgNpuDays.toFixed(1)} days
                                                    </span>
                                                    <span className="text-xs text-slate-400">avg. dwell time</span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-400 text-xs italic">No NPU history</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {agent.rating === 'Excellent' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">Excellent</span>}
                                            {agent.rating === 'Average' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">Average</span>}
                                            {agent.rating === 'Needs Coaching' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800">Needs Coaching</span>}
                                            {agent.rating === 'No Data' && <span className="text-slate-400 text-xs">-</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {/* LEADS TAB */}
        {activeTab === 'leads' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
             <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <h3 className="font-bold text-slate-800">Lead Assignment</h3>
                  <select 
                    value={filterAdvisor} 
                    onChange={e => setFilterAdvisor(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  >
                    <option value="all">All My Agents</option>
                    {managedAdvisors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <button 
                  onClick={() => setShowImporter(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  Import Leads
                </button>
             </div>
             
             <div className="overflow-x-auto">
               <table className="w-full text-left text-sm">
                 <thead className="bg-slate-50 border-b border-slate-100">
                   <tr>
                     <th className="px-6 py-3 font-semibold text-slate-500">Client Name</th>
                     <th className="px-6 py-3 font-semibold text-slate-500">Stage</th>
                     <th className="px-6 py-3 font-semibold text-slate-500">Value</th>
                     <th className="px-6 py-3 font-semibold text-slate-500">Current Advisor</th>
                     <th className="px-6 py-3 font-semibold text-slate-500">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {filteredLeadList.map(client => {
                     const currentAdvisor = advisors.find(a => a.id === client.advisorId);
                     return (
                       <tr key={client.id} className="hover:bg-slate-50/50 transition-colors">
                         <td className="px-6 py-3">
                           <div className="font-medium text-slate-900">{client.name}</div>
                           <div className="text-xs text-slate-400">{client.company}</div>
                         </td>
                         <td className="px-6 py-3">
                           <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                             {client.stage}
                           </span>
                         </td>
                         <td className="px-6 py-3 font-medium text-slate-600">${(client.value || 0).toLocaleString()}</td>
                         <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                               <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">
                                  {currentAdvisor?.avatar || '??'}
                               </div>
                               <span>{currentAdvisor?.name || 'Unassigned'}</span>
                            </div>
                         </td>
                         <td className="px-6 py-3">
                           <select 
                             value={client.advisorId || ''}
                             onChange={(e) => handleAssign(client.id, e.target.value)}
                             className="bg-white border border-slate-200 text-slate-600 text-xs rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                           >
                             <option value="" disabled>Re-assign...</option>
                             {managedAdvisors.map(adv => (
                               <option key={adv.id} value={adv.id}>{adv.name}</option>
                             ))}
                           </select>
                         </td>
                       </tr>
                     );
                   })}
                 </tbody>
               </table>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
