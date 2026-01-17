import React, { useState, useMemo } from 'react';
import { Client, Product, Benchmarks, UserProfile } from '../../types';
import { PieChart, Pie, Legend, Cell, BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import Modal from '../../components/ui/Modal';
import { fmtDateTime, fmtSGD } from '../../lib/helpers';
import Button from '../../components/ui/Button';

interface DashboardTabProps {
  user: UserProfile;
  clients: Client[];
  setActiveTab: (tab: string) => void;
  onLoadClient: (client: Client, redirect?: boolean) => void; 
  onNewClient: () => void;
}

type TimeFilter = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#6366f1'];

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

// New Helper for Financial Year Calculation
const getFYProgress = (annualGoal: number, clients: Client[]) => {
    const currentYear = new Date().getFullYear();
    const start = new Date(currentYear, 0, 1);
    const end = new Date(currentYear, 11, 31);
    const now = new Date();

    let totalRevenue = 0;
    
    clients.forEach(c => {
        (c.sales || []).forEach(sale => {
            // Use Inception Date if available, else Sale Date
            const dateStr = sale.inceptionDate || sale.date;
            if (!dateStr) return;
            
            const saleDate = new Date(dateStr);
            if (saleDate.getFullYear() === currentYear) {
                totalRevenue += (sale.grossRevenue || 0);
            }
        });
    });

    const percentComplete = Math.min(100, (totalRevenue / (annualGoal || 1)) * 100);
    
    // Pro-rata targets
    const dayOfYear = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const targetYTD = (annualGoal / 365) * dayOfYear;
    const gap = totalRevenue - targetYTD;
    
    // Time left
    const daysLeft = 365 - dayOfYear;
    const monthsLeft = 12 - now.getMonth();

    return {
        totalRevenue,
        percentComplete,
        targetYTD,
        gap,
        daysLeft,
        monthsLeft
    };
};

const DashboardTab: React.FC<DashboardTabProps> = ({ user, clients, onNewClient, onLoadClient, setActiveTab }) => {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('Monthly');
  const [activeBreakdown, setActiveBreakdown] = useState<{ title: string; items: any[]; type: 'currency' | 'text' } | null>(null);
  const [selectedAdvisor, setSelectedAdvisor] = useState<string>('All');

  const advisorBanding = user.bandingPercentage || 50;
  const benchmarks = DEFAULT_BENCHMARKS;

  // --- 1. EXTRACT ADVISORS (NEW) ---
  const availableAdvisors = useMemo(() => {
      const map = new Map<string, string>();
      clients.forEach(c => {
          if (c._ownerId) {
              // Prefer Email for display as requested
              const label = c._ownerEmail || `Advisor ${c._ownerId.slice(0, 4)}`;
              map.set(c._ownerId, label);
          }
      });
      return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [clients]);

  // --- 2. FILTER CLIENTS (NEW) ---
  const filteredClients = useMemo(() => {
      if (selectedAdvisor === 'All') return clients;
      // FIX: Check advisorId first (assignment), fallback to ownerId
      return clients.filter(c => (c.advisorId || c._ownerId) === selectedAdvisor);
  }, [clients, selectedAdvisor]);

  // --- FY GOAL TRACKER (Uses Filtered Clients) ---
  const fyStats = useMemo(() => {
      const annualGoal = user.annualGoal || 120000; 
      return getFYProgress(annualGoal, filteredClients);
  }, [user.annualGoal, filteredClients]);

  // --- ACTIVE LEADS CALCULATION ---
  const activeLeadsCount = useMemo(() => {
      return filteredClients.filter(c => !['client', 'case_closed', 'not_keen'].includes(c.followUp.status || '')).length;
  }, [filteredClients]);

  const calculatePeriodStats = (offset: number) => {
      const { start, end } = getDateRange(timeFilter, offset);
      let commission = 0;
      let closures = 0;
      let calls = 0;
      let apptsSet = 0;
      let apptsMet = 0;

      const commissionList: any[] = [];
      const closureList: any[] = [];
      const callList: any[] = [];
      const apptSetList: any[] = [];
      const apptMetList: any[] = [];

      filteredClients.forEach(c => {
          (c.sales || []).forEach(sale => {
              const d = new Date(sale.date);
              if (d >= start && d <= end) {
                  closures++;
                  // Calculate Commission based on Gross Revenue if available, else estimate
                  const gross = sale.grossRevenue || sale.premiumAmount; // Fallback
                  const comm = gross * (advisorBanding / 100);
                  commission += comm;
                  const item = { 
                      id: sale.id, 
                      name: c.profile.name, 
                      date: sale.date, 
                      value: comm, 
                      subtitle: `${sale.productName} ($${sale.premiumAmount})`,
                      client: c
                  };
                  commissionList.push(item);
                  closureList.push({ ...item, value: sale.premiumAmount });
              }
          });
          if (c.milestones?.contactedAt) {
              const d = new Date(c.milestones.contactedAt);
              if (d >= start && d <= end) {
                  calls++;
                  callList.push({ id: c.id, name: c.profile.name, date: c.milestones.contactedAt, value: 0, subtitle: c.phone, client: c });
              }
          }
          if (c.milestones?.appointmentSetAt) {
              const d = new Date(c.milestones.appointmentSetAt);
              if (d >= start && d <= end) {
                  apptsSet++;
                  apptSetList.push({ id: c.id, name: c.profile.name, date: c.milestones.appointmentSetAt, value: 0, subtitle: 'Appointment Set', client: c });
              }
          }
          if (c.milestones?.appointmentMetAt) {
              const d = new Date(c.milestones.appointmentMetAt);
              if (d >= start && d <= end) {
                  apptsMet++;
                  apptMetList.push({ id: c.id, name: c.profile.name, date: c.milestones.appointmentMetAt, value: 0, subtitle: 'Appointment Met', client: c });
              }
          }
      });

      // Sort lists by date descending
      const sortDesc = (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime();
      commissionList.sort(sortDesc);
      closureList.sort(sortDesc);
      callList.sort(sortDesc);
      apptSetList.sort(sortDesc);
      apptMetList.sort(sortDesc);

      return { 
          commission, closures, calls, apptsSet, apptsMet,
          commissionList, closureList, callList, apptSetList, apptMetList
      };
  };

  const currentStats = useMemo(() => calculatePeriodStats(0), [filteredClients, timeFilter, advisorBanding]);
  const prevStats = useMemo(() => calculatePeriodStats(1), [filteredClients, timeFilter, advisorBanding]);

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
      filteredClients.forEach(c => {
          (c.sales || []).forEach(sale => {
              const d = new Date(sale.date);
              if (d >= start && d <= end) counts[sale.productName || 'Unknown'] = (counts[sale.productName || 'Unknown'] || 0) + 1;
          });
      });
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredClients, timeFilter]);

  const pipelineData = useMemo(() => {
      return [
        { name: 'Leads', value: filteredClients.length, fill: '#64748b' },
        { name: 'Contacted', value: filteredClients.filter(c => c.stage !== 'New Lead').length, fill: '#3b82f6' },
        { name: 'Appt Set', value: filteredClients.filter(c => c.milestones?.appointmentSetAt).length, fill: '#8b5cf6' },
        { name: 'Appt Met', value: filteredClients.filter(c => c.milestones?.appointmentMetAt).length, fill: '#f59e0b' },
      ];
  }, [filteredClients]);

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

  const cardClasses = "bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 hover:ring-2 hover:ring-indigo-50 transition-all cursor-pointer group active:scale-[0.98]";

  const handleRowClick = (client: Client) => {
      onLoadClient(client, false); 
      setActiveTab('crm'); 
      setActiveBreakdown(null);
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in pb-20 md:pb-6">
        {/* GOAL TRACKER MODULE */}
        <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/20 rounded-full blur-[80px]"></div>
            
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-4 gap-8 items-center">
                {/* 1. Main Progress */}
                <div className="lg:col-span-1">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Financial Year Goal</h3>
                    <div className="text-4xl font-black tracking-tight">{fmtSGD(user.annualGoal || 120000)}</div>
                    <div className="mt-4 w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                        <div 
                            className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-1000 ease-out relative"
                            style={{ width: `${fyStats.percentComplete}%` }}
                        >
                            <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                        </div>
                    </div>
                    <div className="flex justify-between mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <span>{fyStats.percentComplete.toFixed(1)}% Achieved</span>
                        <span>{fmtSGD(fyStats.totalRevenue)}</span>
                    </div>
                </div>

                {/* 2. Run Rate Stats */}
                <div className="lg:col-span-2 grid grid-cols-3 gap-4 divide-x divide-white/10">
                    <div className="px-4 text-center">
                        <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Monthly Target</div>
                        <div className="text-xl font-bold text-white">
                            {fmtSGD((user.annualGoal || 120000) / 12)}
                        </div>
                        <div className="text-[9px] text-slate-500 mt-1">Run Rate Required</div>
                    </div>
                    <div className="px-4 text-center">
                        <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">YTD Status</div>
                        <div className={`text-xl font-bold ${fyStats.gap >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {fyStats.gap >= 0 ? '+' : ''}{fmtSGD(fyStats.gap)}
                        </div>
                        <div className="text-[9px] text-slate-500 mt-1">{fyStats.gap >= 0 ? 'Ahead of Schedule' : 'Behind Schedule'}</div>
                    </div>
                    <div className="px-4 text-center">
                        <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Time Remaining</div>
                        <div className="text-xl font-bold text-white">{fyStats.daysLeft} Days</div>
                        <div className="text-[9px] text-slate-500 mt-1">End of Fin. Year</div>
                    </div>
                </div>

                {/* 3. Motivation/Gap */}
                <div className="lg:col-span-1 bg-white/5 rounded-xl p-4 border border-white/10 backdrop-blur-sm">
                    {fyStats.gap < 0 ? (
                        <div>
                            <div className="text-rose-400 text-xs font-bold uppercase mb-1">⚠️ Gap Detected</div>
                            <p className="text-sm font-medium leading-snug">
                                You are <span className="text-rose-300 font-bold">{fmtSGD(Math.abs(fyStats.gap))}</span> off pace. Close <span className="text-white font-bold underline">2 extra cases</span> this month to realign.
                            </p>
                        </div>
                    ) : (
                        <div>
                            <div className="text-emerald-400 text-xs font-bold uppercase mb-1">🚀 Excellent Pace</div>
                            <p className="text-sm font-medium leading-snug">
                                You are <span className="text-emerald-300 font-bold">{fmtSGD(fyStats.gap)}</span> ahead! You're on track to hit <span className="text-white font-bold">{fmtSGD((user.annualGoal || 120000) * 1.1)}</span> this year.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* CONTROLS */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Performance Pulse</h1>
                <p className="text-slate-500">Activity & Pipeline tracking.</p>
            </div>
            
            <div className="flex gap-4">
                {/* ADVISOR FILTER (NEW) */}
                {availableAdvisors.length > 1 && (
                    <div className="relative">
                        <select 
                            value={selectedAdvisor}
                            onChange={(e) => setSelectedAdvisor(e.target.value)}
                            className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-bold py-1.5 pl-3 pr-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-indigo-300 transition-all cursor-pointer shadow-sm h-full"
                        >
                            <option value="All">All Advisors</option>
                            {availableAdvisors.map(adv => (
                                <option key={adv.id} value={adv.id}>{adv.name}</option>
                            ))}
                        </select>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[8px]">▼</div>
                    </div>
                )}

                {/* TIME FILTER */}
                <div className="flex bg-white rounded-lg border border-slate-200 p-1 shadow-sm overflow-x-auto relative z-20">
                    {['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'].map(tf => (
                        <button key={tf} onClick={() => setTimeFilter(tf as TimeFilter)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap cursor-pointer ${timeFilter === tf ? 'bg-slate-900 text-white shadow ring-1 ring-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}>{tf}</button>
                    ))}
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div 
                onClick={() => setActiveBreakdown({ title: 'Commission Breakdown', items: currentStats.commissionList, type: 'currency' })}
                className={cardClasses}
            >
                <div className="flex justify-between items-start">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Commission</p>
                    <span className="opacity-0 group-hover:opacity-100 text-indigo-500 text-xs font-bold transition-opacity">View ↗</span>
                </div>
                <p className="text-3xl font-bold text-slate-900">${currentStats.commission.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                <GrowthBadge curr={currentStats.commission} prev={prevStats.commission} prefix="$" />
            </div>
            
            <div 
                onClick={() => setActiveBreakdown({ title: 'Closures Breakdown', items: currentStats.closureList, type: 'currency' })}
                className={cardClasses}
            >
                <div className="flex justify-between items-start">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Closures</p>
                    <span className="opacity-0 group-hover:opacity-100 text-indigo-500 text-xs font-bold transition-opacity">View ↗</span>
                </div>
                <p className="text-3xl font-bold text-slate-900">{currentStats.closures}</p>
                <GrowthBadge curr={currentStats.closures} prev={prevStats.closures} />
            </div>

            <div 
                onClick={() => setActiveBreakdown({ title: 'Appointments Met (Held)', items: currentStats.apptMetList, type: 'text' })}
                className={cardClasses}
            >
                <div className="flex justify-between items-start">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Held Rate</p>
                    <span className="opacity-0 group-hover:opacity-100 text-indigo-500 text-xs font-bold transition-opacity">View Met ↗</span>
                </div>
                <p className="text-3xl font-bold text-slate-900">{heldRate.toFixed(0)}%</p>
                <GrowthBadge curr={heldRate} prev={prevHeldRate} suffix="%" />
            </div>

             <div 
                onClick={() => setActiveBreakdown({ title: 'Clients Contacted', items: currentStats.callList, type: 'text' })}
                className={`${cardClasses} relative overflow-hidden`}
            >
                <div className="flex justify-between items-start">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Calls Made</p>
                    <span className="opacity-0 group-hover:opacity-100 text-indigo-500 text-xs font-bold transition-opacity">View ↗</span>
                </div>
                <div className="flex items-baseline gap-1">
                    <p className="text-3xl font-bold text-slate-900">{currentStats.calls}</p>
                    <span className="text-sm text-slate-400 font-medium">/ {benchmarkAnalysis.targetCalls}</span>
                </div>
                <div className={`mt-2 text-xs font-medium inline-block px-2 py-1 rounded ${benchmarkAnalysis.callDeficit > 0 ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50'}`}>{benchmarkAnalysis.callDeficit > 0 ? `⚠ -${benchmarkAnalysis.callDeficit}` : '✓ On Track'}</div>
            </div>

            <div 
                onClick={() => setActiveBreakdown({ title: 'Appointments Set', items: currentStats.apptSetList, type: 'text' })}
                className={cardClasses}
            >
                <div className="flex justify-between items-start">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Appts Set</p>
                    <span className="opacity-0 group-hover:opacity-100 text-indigo-500 text-xs font-bold transition-opacity">View ↗</span>
                </div>
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

        {/* Breakdown Modal */}
        {activeBreakdown && (
            <Modal 
                isOpen={!!activeBreakdown} 
                onClose={() => setActiveBreakdown(null)} 
                title={`${activeBreakdown.title} (${timeFilter})`}
                footer={<Button variant="ghost" onClick={() => setActiveBreakdown(null)}>Close Breakdown</Button>}
            >
                <div className="max-h-96 overflow-y-auto custom-scrollbar">
                    {activeBreakdown.items.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 italic text-sm">No data recorded for this period.</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-100">
                                <tr>
                                    <th className="px-4 py-3 text-left font-bold text-slate-500 text-xs uppercase tracking-wider">Date</th>
                                    <th className="px-4 py-3 text-left font-bold text-slate-500 text-xs uppercase tracking-wider">Client</th>
                                    <th className="px-4 py-3 text-right font-bold text-slate-500 text-xs uppercase tracking-wider">
                                        {activeBreakdown.type === 'currency' ? 'Value' : 'Details'}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {activeBreakdown.items.map((item, i) => (
                                    <tr key={i} className="hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => handleRowClick(item.client)}>
                                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{fmtDateTime(item.date)}</td>
                                        <td className="px-4 py-3 font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{item.name}</td>
                                        <td className="px-4 py-3 text-right font-medium">
                                            {activeBreakdown.type === 'currency' ? (
                                                <div className="flex flex-col items-end">
                                                    <span className="text-emerald-600 font-bold">{fmtSGD(item.value)}</span>
                                                    <span className="text-[10px] text-slate-400">{item.subtitle}</span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-500 text-xs">{item.subtitle}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </Modal>
        )}
    </div>
  );
}

export default DashboardTab;