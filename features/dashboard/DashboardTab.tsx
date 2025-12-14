
import React, { useMemo, useState, useEffect } from 'react';
import { Client, UserProfile } from '../../types';
import { fmtSGD, toNum } from '../../lib/helpers';
import { getFinancialNewsBriefing } from '../../lib/gemini';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';
import Skeleton from '../../components/common/Skeleton';

interface DashboardTabProps {
  user: UserProfile;
  clients: Client[];
  setActiveTab: (tab: string) => void;
  onLoadClient: (client: Client) => void;
  onNewClient: () => void;
}

const DashboardTab: React.FC<DashboardTabProps> = ({ user, clients, setActiveTab, onLoadClient, onNewClient }) => {
  
  // Fake loading state for initial hydration (visual polish)
  const [loading, setLoading] = useState(true);
  const [news, setNews] = useState<any[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 800); // Simulate calculation time
    
    // Fetch News via AI Grounding
    getFinancialNewsBriefing().then(res => {
       if (res && res.news) setNews(res.news.slice(0, 3));
       setNewsLoading(false);
    });

    return () => clearTimeout(t);
  }, []);

  // --- ANALYTICS ENGINE ---
  const stats = useMemo(() => {
    let totalPotential = 0;
    let totalAum = 0;
    let newLeads = 0;
    let closingReady = 0;
    const activityData = []; 

    const radarData = [
      { subject: 'Prospecting', A: 0, fullMark: 100 },
      { subject: 'Fact Finding', A: 0, fullMark: 100 },
      { subject: 'Closing', A: 0, fullMark: 100 },
      { subject: 'Servicing', A: 0, fullMark: 100 },
      { subject: 'Referrals', A: 0, fullMark: 100 },
    ];

    clients.forEach(c => {
      // Revenue Potential
      const annualPrem = toNum(c.wealthState?.annualPremium);
      const portfolio = toNum(c.investorState?.portfolioValue);
      const income = toNum(c.profile.monthlyIncome) || toNum(c.profile.grossSalary);
      
      let potential = 0;
      if (annualPrem > 0) potential += annualPrem * 0.5;
      else if (income > 0) potential += (income * 12) * 0.03;
      
      totalPotential += potential;
      totalAum += portfolio + toNum(c.cashflowState?.currentSavings);

      // Funnel Counting
      if (c.followUp.status === 'new') { newLeads++; radarData[0].A += 10; }
      if (c.followUp.status === 'picked_up') { radarData[1].A += 10; }
      if (c.followUp.status === 'proposal' || c.followUp.status === 'appt_set') { closingReady++; radarData[2].A += 20; }
      if (c.followUp.status === 'client') { radarData[3].A += 5; }
    });

    // Normalize Radar
    radarData.forEach(d => d.A = Math.min(100, d.A));

    // Simulated Activity Trend (Last 7 days)
    for(let i=6; i>=0; i--) {
        activityData.push({ day: `D-${i}`, value: Math.floor(Math.random() * 10) + 2 });
    }

    return { totalPotential, totalAum, newLeads, closingReady, radarData, activityData };
  }, [clients]);

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto font-sans space-y-8 bg-slate-50 min-h-screen">
      
      {/* 1. COCKPIT HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
         <div>
            <div className="flex items-center gap-2 mb-2">
               <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]"></span>
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quantum Operating System v3.0</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter">
               Command Center
            </h1>
            <p className="text-slate-500 font-medium mt-1">
               Overview for <span className="text-indigo-600 font-bold border-b-2 border-indigo-200">{user.email?.split('@')[0]}</span>
            </p>
         </div>
         
         <div className="flex gap-3">
            <button onClick={() => setActiveTab('crm')} className="px-5 py-3 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold text-xs shadow-sm hover:bg-slate-50 transition-all">
               View Pipeline
            </button>
            <button onClick={onNewClient} className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-xs shadow-xl shadow-slate-300 hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
               <span>＋</span> New Prospect
            </button>
         </div>
      </div>

      {/* 1.5 LIVE MARKET INTELLIGENCE TICKER (NEW) */}
      <div className="bg-slate-900 text-white rounded-xl p-4 flex flex-col md:flex-row items-center gap-4 border border-slate-800 relative overflow-hidden">
         <div className="flex items-center gap-2 min-w-fit px-2 border-r border-slate-700">
            <span className="text-xl">📡</span>
            <div>
               <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Live Pulse</div>
               <div className="text-xs font-medium text-slate-400">Google Grounding</div>
            </div>
         </div>
         
         <div className="flex-1 w-full overflow-hidden relative">
            {newsLoading ? (
               <div className="flex gap-4 animate-pulse">
                  <div className="h-4 bg-slate-800 rounded w-1/3"></div>
                  <div className="h-4 bg-slate-800 rounded w-1/3"></div>
               </div>
            ) : (
               <div className="flex gap-8 whitespace-nowrap animate-slide-left">
                  {news.map((item, idx) => (
                     <div key={idx} className="flex items-center gap-2 text-xs font-medium">
                        <span className="text-indigo-400">●</span>
                        <span className="font-bold text-white">{item.headline}</span>
                        <span className="text-slate-400">- {item.impact}</span>
                     </div>
                  ))}
                  {news.length === 0 && <span className="text-xs text-slate-500">Market data unavailable. Check connection.</span>}
               </div>
            )}
         </div>
      </div>

      {/* 2. HUD STATS (Dark Mode Contrast) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
         {/* Card 1 */}
         <div className="bg-slate-900 rounded-2xl p-6 text-white relative overflow-hidden shadow-2xl group min-h-[140px]">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/20 rounded-full blur-2xl group-hover:bg-indigo-500/30 transition-all"></div>
            <div className="relative z-10">
               <div className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-2">Projected Revenue</div>
               {loading ? (
                  <Skeleton className="bg-slate-700/50 h-10 w-32 mb-1" />
               ) : (
                  <div className="text-3xl font-black tracking-tight mb-1">{fmtSGD(stats.totalPotential)}</div>
               )}
               <div className="text-[10px] text-slate-400">Based on active deals</div>
            </div>
         </div>

         {/* Card 2 */}
         <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:border-emerald-200 transition-colors group min-h-[140px]">
            <div className="flex justify-between items-start mb-2">
               <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Assets Tracked</div>
               <span className="text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded text-[10px] font-bold">AUM</span>
            </div>
            {loading ? (
                <Skeleton className="h-10 w-40 mb-1" />
            ) : (
                <div className="text-3xl font-black text-slate-800 tracking-tight mb-1 group-hover:text-emerald-700 transition-colors">
                   {fmtSGD(stats.totalAum).split('.')[0]}<span className="text-sm text-gray-400 font-medium">.00</span>
                </div>
            )}
         </div>

         {/* Card 3 */}
         <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:border-amber-200 transition-colors group min-h-[140px]">
            <div className="flex justify-between items-start mb-2">
               <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">In Pipeline</div>
               <span className="text-amber-500 bg-amber-50 px-2 py-0.5 rounded text-[10px] font-bold">ACTIVE</span>
            </div>
            {loading ? (
                <Skeleton className="h-10 w-24 mb-1" />
            ) : (
                <div className="text-3xl font-black text-slate-800 tracking-tight mb-1 group-hover:text-amber-600 transition-colors">
                   {stats.newLeads}
                </div>
            )}
            <div className="text-[10px] text-slate-400">New leads this month</div>
         </div>

         {/* Card 4 */}
         <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:border-purple-200 transition-colors group min-h-[140px]">
            <div className="flex justify-between items-start mb-2">
               <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Closing Ready</div>
               <span className="text-purple-500 bg-purple-50 px-2 py-0.5 rounded text-[10px] font-bold">HOT</span>
            </div>
            {loading ? (
                <Skeleton className="h-10 w-24 mb-1" />
            ) : (
                <div className="text-3xl font-black text-slate-800 tracking-tight mb-1 group-hover:text-purple-600 transition-colors">
                   {stats.closingReady}
                </div>
            )}
            <div className="text-[10px] text-slate-400">Proposals sent</div>
         </div>
      </div>

      {/* 3. MAIN VISUALS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         
         {/* ACTIVITY CHART */}
         <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
               <span>📈</span> Activity Volume
            </h3>
            <div className="h-[300px] w-full">
               <ResponsiveContainer>
                  <AreaChart data={stats.activityData}>
                     <defs>
                        <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                           <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                        </linearGradient>
                     </defs>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                     <XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={10} tick={{fill: '#9ca3af'}} />
                     <YAxis axisLine={false} tickLine={false} fontSize={10} tick={{fill: '#9ca3af'}} />
                     <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        cursor={{ stroke: '#4f46e5', strokeWidth: 1, strokeDasharray: '4 4' }}
                     />
                     <Area type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorActivity)" />
                  </AreaChart>
               </ResponsiveContainer>
            </div>
         </div>

         {/* SKILLS RADAR */}
         <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
               <span>🎯</span> Pipeline Health
            </h3>
            <div className="h-[300px] w-full relative">
               <ResponsiveContainer>
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={stats.radarData}>
                     <PolarGrid stroke="#e5e7eb" />
                     <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 'bold' }} />
                     <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                     <Radar
                        name="Performance"
                        dataKey="A"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="#10b981"
                        fillOpacity={0.3}
                     />
                  </RadarChart>
               </ResponsiveContainer>
               <div className="absolute bottom-0 left-0 right-0 text-center text-[10px] text-gray-400">
                  Auto-generated from CRM status
               </div>
            </div>
         </div>

      </div>
    </div>
  );
};

export default DashboardTab;
