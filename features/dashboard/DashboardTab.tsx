
import React, { useState, useMemo } from 'react';
import { Client, Product, Benchmarks, UserProfile } from '../../types';
import { PieChart, Pie, Legend, Cell, BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardTabProps {
  user: UserProfile;
  clients: Client[];
  setActiveTab: (tab: string) => void;
  onLoadClient: (client: Client) => void;
  onNewClient: () => void;
}

type TimeFilter = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#6366f1'];

// Placeholder Products Data (In real app, fetch this)
const MOCK_PRODUCTS: Product[] = [
    { id: 'p1', name: 'Wealth Sol', provider: 'Pru', type: 'ILP', tiers: [{ min: 0, max: Infinity, rate: 0.5, dollarUp: 0 }] },
    { id: 'p2', name: 'Term Protect', provider: 'AIA', type: 'Term', tiers: [{ min: 0, max: Infinity, rate: 0.5, dollarUp: 0 }] }
];

const DEFAULT_BENCHMARKS: Benchmarks = { callsPerWeek: 15, apptsPerWeek: 5 };

const getDateRange = (filter: TimeFilter, offset: number = 0) => {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    start.setHours(0,0,0,0);
    
    if (filter === 'Daily') {
        start.setDate(now.getDate() - offset);
        end.setTime(start.getTime());
    } else if (filter === 'Weekly') {
        const day = now.getDay() || 7;
        start.setDate(now.getDate() - (day - 1) - (7 * offset));
        end.setTime(start.getTime());
        end.setDate(start.getDate() + 6);
    } else if (filter === 'Monthly') {
        start.setDate(1);
        start.setMonth(now.getMonth() - offset);
        end.setTime(start.getTime());
        end.setMonth(start.getMonth() + 1);
        end.setDate(0); 
    } else if (filter === 'Quarterly') {
        const currQ = Math.floor(now.getMonth() / 3);
        const targetQ = currQ - offset;
        start.setDate(1);
        start.setMonth(targetQ * 3);
        end.setTime(start.getTime());
        end.setMonth(start.getMonth() + 3);
        end.setDate(0);
    } else { 
        start.setFullYear(now.getFullYear() - offset, 0, 1);
        end.setFullYear(now.getFullYear() - offset, 11, 31);
    }
    end.setHours(23,59,59,999);
    return { start, end };
};

const DashboardTab: React.FC<DashboardTabProps> = ({ user, clients, onNewClient }) => {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('Monthly');
  const products = MOCK_PRODUCTS;
  const advisorBanding = user.bandingPercentage || 50;
  const benchmarks = DEFAULT_BENCHMARKS;

  const calculatePeriodStats = (offset: number) => {
      const { start, end } = getDateRange(timeFilter, offset);
      let commission = 0;
      let closures = 0;
      let calls = 0;
      let apptsSet = 0;
      let apptsMet = 0;

      clients.forEach(c => {
          (c.sales || []).forEach(sale => {
              const d = new Date(sale.date);
              if (d >= start && d <= end) {
                  closures++;
                  commission += (sale.premiumAmount || 0) * (advisorBanding / 100);
              }
          });
          if (c.milestones?.contactedAt) {
              const d = new Date(c.milestones.contactedAt);
              if (d >= start && d <= end) calls++;
          }
          if (c.milestones?.appointmentSetAt) {
              const d = new Date(c.milestones.appointmentSetAt);
              if (d >= start && d <= end) apptsSet++;
          }
          if (c.milestones?.appointmentMetAt) {
              const d = new Date(c.milestones.appointmentMetAt);
              if (d >= start && d <= end) apptsMet++;
          }
      });
      return { commission, closures, calls, apptsSet, apptsMet };
  };

  const currentStats = useMemo(() => calculatePeriodStats(0), [clients, timeFilter]);
  const prevStats = useMemo(() => calculatePeriodStats(1), [clients, timeFilter]);

  const getGrowth = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev) * 100;
  };

  const heldRate = currentStats.apptsSet > 0 ? (currentStats.apptsMet / currentStats.apptsSet) * 100 : 0;
  const prevHeldRate = prevStats.apptsSet > 0 ? (prevStats.apptsMet / prevStats.apptsSet) * 100 : 0;

  const benchmarkAnalysis = useMemo(() => {
      let targetCalls = benchmarks.callsPerWeek;
      let targetAppts = benchmarks.apptsPerWeek;
      if (timeFilter === 'Monthly') { targetCalls *= 4.3; targetAppts *= 4.3; }
      
      const callDeficit = targetCalls - currentStats.calls;
      const apptDeficit = targetAppts - currentStats.apptsSet;

      return { targetCalls: Math.round(targetCalls), targetAppts: Math.round(targetAppts), callDeficit, apptDeficit, catchUpCalls: Math.max(0, callDeficit), catchUpAppts: Math.max(0, apptDeficit) };
  }, [timeFilter, benchmarks, currentStats]);

  const productMix = useMemo(() => {
      const counts: Record<string, number> = {};
      const { start, end } = getDateRange(timeFilter, 0);
      clients.forEach(c => {
          (c.sales || []).forEach(sale => {
              const d = new Date(sale.date);
              if (d >= start && d <= end) counts[sale.productName || 'Unknown'] = (counts[sale.productName || 'Unknown'] || 0) + 1;
          });
      });
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [clients, timeFilter]);

  const pipelineData = useMemo(() => {
      return [
        { name: 'Leads', value: clients.length, fill: '#64748b' },
        { name: 'Contacted', value: clients.filter(c => c.stage !== 'New Lead').length, fill: '#3b82f6' },
        { name: 'Appt Set', value: clients.filter(c => c.milestones?.appointmentSetAt).length, fill: '#8b5cf6' },
        { name: 'Appt Met', value: clients.filter(c => c.milestones?.appointmentMetAt).length, fill: '#f59e0b' },
      ];
  }, [clients]);

  const GrowthBadge = ({ curr, prev, prefix = '', suffix = '' }: any) => {
      const growth = getGrowth(curr, prev);
      const isPos = growth >= 0;
      return (
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isPos ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                {isPos ? '↑' : '↓'} {Math.abs(growth).toFixed(0)}%
            </span>
            <span className="text-xs text-slate-400">vs prev {prefix}{prev.toLocaleString()}{suffix}</span>
          </div>
      )
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in pb-20 md:pb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Performance Pulse</h1>
                <p className="text-slate-500">Tracking against past performance.</p>
            </div>
            <div className="flex bg-white rounded-lg border border-slate-200 p-1 shadow-sm overflow-x-auto relative z-20">
                {['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'].map(tf => (
                    <button key={tf} onClick={() => setTimeFilter(tf as TimeFilter)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap cursor-pointer ${timeFilter === tf ? 'bg-slate-900 text-white shadow ring-1 ring-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}>{tf}</button>
                ))}
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Commission</p>
                <p className="text-3xl font-bold text-slate-900">${currentStats.commission.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                <GrowthBadge curr={currentStats.commission} prev={prevStats.commission} prefix="$" />
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Closures</p>
                <p className="text-3xl font-bold text-slate-900">{currentStats.closures}</p>
                <GrowthBadge curr={currentStats.closures} prev={prevStats.closures} />
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Held Rate</p>
                <p className="text-3xl font-bold text-slate-900">{heldRate.toFixed(0)}%</p>
                <GrowthBadge curr={heldRate} prev={prevHeldRate} suffix="%" />
            </div>
             <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Calls Made</p>
                <div className="flex items-baseline gap-1">
                    <p className="text-3xl font-bold text-slate-900">{currentStats.calls}</p>
                    <span className="text-sm text-slate-400 font-medium">/ {benchmarkAnalysis.targetCalls}</span>
                </div>
                <div className={`mt-2 text-xs font-medium inline-block px-2 py-1 rounded ${benchmarkAnalysis.callDeficit > 0 ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50'}`}>{benchmarkAnalysis.callDeficit > 0 ? `⚠ -${benchmarkAnalysis.callDeficit}` : '✓ On Track'}</div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Appts Set</p>
                <div className="flex items-baseline gap-1">
                    <p className="text-3xl font-bold text-slate-900">{currentStats.apptsSet}</p>
                    <span className="text-sm text-slate-400 font-medium">/ {benchmarkAnalysis.targetAppts}</span>
                </div>
                <div className={`mt-2 text-xs font-medium inline-block px-2 py-1 rounded ${benchmarkAnalysis.apptDeficit > 0 ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50'}`}>{benchmarkAnalysis.apptDeficit > 0 ? `⚠ -${benchmarkAnalysis.apptDeficit}` : '✓ On Track'}</div>
            </div>
        </div>

        {(benchmarkAnalysis.callDeficit > 0 || benchmarkAnalysis.apptDeficit > 0) && (
            <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                     <div className="p-3 bg-white/10 rounded-lg"><svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
                     <div><h3 className="font-bold text-lg text-white">Activity Gap Detected</h3><p className="text-slate-300 text-sm max-w-lg mt-1">You are trailing your {timeFilter.toLowerCase()} benchmarks. Increase daily volume to hit targets.</p></div>
                </div>
                <div className="flex gap-4">
                     {benchmarkAnalysis.callDeficit > 0 && <div className="bg-rose-500/20 border border-rose-500/50 px-4 py-3 rounded-lg text-center"><span className="block text-2xl font-bold text-white">+{Math.max(1, benchmarkAnalysis.catchUpCalls)}</span><span className="text-[10px] text-rose-200 uppercase font-bold tracking-wider">Extra Calls/Day</span></div>}
                     {benchmarkAnalysis.apptDeficit > 0 && <div className="bg-amber-500/20 border border-amber-500/50 px-4 py-3 rounded-lg text-center"><span className="block text-2xl font-bold text-white">+{Math.max(1, benchmarkAnalysis.catchUpAppts)}</span><span className="text-[10px] text-amber-200 uppercase font-bold tracking-wider">Appts Needed</span></div>}
                </div>
            </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                <h3 className="font-semibold text-slate-800 mb-2">Sales Mix ({timeFilter})</h3>
                <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart key={`pie-${timeFilter}`}>
                            <Pie data={productMix} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value">
                                {productMix.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={36} iconSize={8} wrapperStyle={{fontSize: '10px'}} />
                        </PieChart>
                    </ResponsiveContainer>
                    {productMix.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">No sales this period</div>}
                </div>
            </div>
            <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-semibold text-slate-800 mb-6">Total Pipeline Funnel</h3>
                <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart key={`bar-${timeFilter}`} data={pipelineData} margin={{top:10, right:10, bottom:0, left:0}}>
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                            <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                            <Bar dataKey="value" radius={[6, 6, 0, 0]}>{pipelineData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}</Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    </div>
  );
}

export default DashboardTab;
