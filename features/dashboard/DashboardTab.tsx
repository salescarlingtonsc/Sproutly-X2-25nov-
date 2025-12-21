
import React, { useMemo, useState, useEffect } from 'react';
import { Client, UserProfile } from '../../types';
import { fmtSGD, toNum } from '../../lib/helpers';
import { getFinancialNewsBriefing, generateNextBestActions } from '../../lib/gemini';
import { fetchGlobalActivity } from '../../lib/db/activities';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer
} from 'recharts';

interface DashboardTabProps {
  user: UserProfile;
  clients: Client[];
  setActiveTab: (tab: string) => void;
  onLoadClient: (client: Client) => void;
  onNewClient: () => void;
}

const DashboardTab: React.FC<DashboardTabProps> = ({ user, clients, setActiveTab, onLoadClient, onNewClient }) => {
  const [loading, setLoading] = useState(true);
  const [news, setNews] = useState<any[]>([]);
  const [nbas, setNbas] = useState<any[]>([]);
  const [activityData, setActivityData] = useState<any[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const newsRes = await getFinancialNewsBriefing();
      if (newsRes && newsRes.news) setNews(newsRes.news.slice(0, 3));
      
      const logs = await fetchGlobalActivity();
      const dailyMap: Record<string, number> = {};
      logs.forEach(l => {
        const date = new Date(l.created_at).toLocaleDateString('en-US', { weekday: 'short' });
        dailyMap[date] = (dailyMap[date] || 0) + 1;
      });
      const chartPoints = Object.entries(dailyMap).map(([day, value]) => ({ day, value })).reverse();
      setActivityData(chartPoints.length > 0 ? chartPoints : [{ day: 'Today', value: 0 }]);

      if (clients.length > 0) {
        setLoadingAi(true);
        try {
          const nbaRes = await generateNextBestActions(clients);
          setNbas(nbaRes);
        } catch (e) {
          console.error("NBA Engine Error", e);
        } finally {
          setLoadingAi(false);
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [clients.length]);

  const stats = useMemo(() => {
    let totalPotential = 0;
    let totalAum = 0;
    let activeDeals = 0;
    let highStalenessCount = 0;
    
    clients.forEach(c => {
      const dealVal = toNum(c.followUp.dealValue, 0);
      const prob = toNum(c.followUp.conversionProbability, 0) / 100;
      totalPotential += (dealVal * prob);
      totalAum += toNum(c.investorState?.portfolioValue, 0) + toNum(c.cashflowState?.currentSavings, 0);
      
      if (['qualified', 'appt_set', 'proposal', 'closing'].includes(c.followUp.status)) {
        activeDeals++;
        // Staleness check
        if (c.followUp.lastContactedAt) {
          const last = new Date(c.followUp.lastContactedAt).getTime();
          if ((Date.now() - last) / (1000 * 60 * 60) > 48) highStalenessCount++;
        } else {
          highStalenessCount++;
        }
      }
    });

    const capacityPercent = Math.min(100, (activeDeals / 20) * 100); // Assume 20 deals is 100% capacity

    return { totalPotential, totalAum, capacityPercent, activeDeals, highStalenessCount };
  }, [clients]);

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto font-sans space-y-6 bg-[#F8FAFC] min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-gray-200 pb-6">
         <div>
            <div className="flex items-center gap-2 mb-2">
               <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quantum Engine v3.2</span>
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Executive Dashboard</h1>
            <p className="text-slate-500 text-sm">Orchestrating <span className="font-bold text-indigo-600">{clients.length}</span> client assets.</p>
         </div>
         <div className="flex gap-3">
            <button onClick={onNewClient} className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs shadow-lg hover:bg-slate-800 transition-all flex items-center gap-2">
               <span>＋</span> Initialize Intake
            </button>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
         <div className="lg:col-span-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Book Value (AUM)</div>
                  <div className="text-2xl font-black text-slate-900">{fmtSGD(stats.totalAum)}</div>
               </div>
               <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Weighted Pipeline</div>
                  <div className="text-2xl font-black text-indigo-600">{fmtSGD(stats.totalPotential)}</div>
               </div>
               
               <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Advisor Capacity</div>
                    <div className="text-2xl font-black text-slate-900">{stats.activeDeals} <span className="text-xs font-medium text-slate-400">/ 20 Deals</span></div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
                       <div className={`h-full transition-all duration-1000 ${stats.capacityPercent > 85 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${stats.capacityPercent}%` }}></div>
                    </div>
                  </div>
               </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
               <div className="flex justify-between items-center mb-6">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Workload Velocity</h3>
                  {stats.highStalenessCount > 0 && <span className="text-[10px] font-black text-red-500 bg-red-50 px-2 py-1 rounded-full animate-pulse">⚠️ {stats.highStalenessCount} STALE LEADS</span>}
               </div>
               <div className="h-[280px] w-full">
                  <ResponsiveContainer>
                     <AreaChart data={activityData}>
                        <defs>
                           <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                           </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={10} tick={{fill: '#9ca3af'}} />
                        <YAxis axisLine={false} tickLine={false} fontSize={10} tick={{fill: '#9ca3af'}} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }} />
                        <Area type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorActivity)" />
                     </AreaChart>
                  </ResponsiveContainer>
               </div>
            </div>
         </div>

         <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-2xl relative overflow-hidden h-full flex flex-col">
               <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl"></div>
               <div className="flex items-center justify-between mb-6 relative z-10">
                  <h3 className="text-xs font-black uppercase tracking-widest text-indigo-300">Sproutly Co-Pilot Actions</h3>
                  {loadingAi && <span className="text-[10px] animate-pulse text-emerald-400 font-mono">REASONING...</span>}
               </div>
               <div className="flex-1 space-y-4 relative z-10 overflow-y-auto custom-scrollbar">
                  {nbas.length > 0 ? nbas.map((nba, idx) => (
                     <div key={idx} className="p-4 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors cursor-pointer group" onClick={() => setActiveTab('crm')}>
                        <div className="flex justify-between items-start mb-2">
                           <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${nba.priority === 'CRITICAL' ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-indigo-50/20 text-indigo-300 border-indigo-500/40'}`}>
                              {nba.priority}
                           </span>
                        </div>
                        <h4 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">{nba.action}</h4>
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{nba.rationale}</p>
                     </div>
                  )) : (
                     <div className="h-full flex flex-col items-center justify-center text-center py-10 opacity-40">
                        <div className="text-4xl mb-2">🔭</div>
                        <p className="text-xs">Deep analysis complete. Pipeline stable.</p>
                     </div>
                  )}
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default DashboardTab;
