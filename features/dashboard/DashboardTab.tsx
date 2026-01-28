import React, { useState, useMemo } from 'react';
import { Client, Product, Benchmarks, UserProfile } from '../../types';
import { PieChart, Pie, Legend, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import Modal from '../../components/ui/Modal';
import { fmtDateTime, fmtSGD, toNum } from '../../lib/helpers';
import Button from '../../components/ui/Button';
import { db } from '../../lib/db';

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

const getFYProgress = (annualGoal: number, clients: Client[]) => {
    const currentYear = new Date().getFullYear();
    let totalRevenue = 0;
    
    clients.forEach(c => {
        (c.sales || []).forEach(sale => {
            const dateStr = sale.inceptionDate || sale.date;
            if (!dateStr) return;
            const saleDate = new Date(dateStr);
            if (saleDate.getFullYear() === currentYear) {
                totalRevenue += (sale.grossRevenue || 0);
            }
        });
    });

    const percentComplete = Math.min(100, (totalRevenue / (annualGoal || 1)) * 100);
    const startOfYear = new Date(currentYear, 0, 1);
    const dayOfYear = Math.floor((Date.now() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
    const targetYTD = (annualGoal / 365) * dayOfYear;
    const gap = totalRevenue - targetYTD;
    const daysLeft = 365 - dayOfYear;

    return { totalRevenue, percentComplete, targetYTD, gap, daysLeft };
};

const DashboardTab: React.FC<DashboardTabProps> = ({ user, clients, onLoadClient, setActiveTab }) => {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('Monthly');
  const [activeBreakdown, setActiveBreakdown] = useState<{ title: string; items: any[]; type: 'currency' | 'text' } | null>(null);
  const [selectedAdvisor, setSelectedAdvisor] = useState<string>('All');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const advisorBanding = user.bandingPercentage || 50;
  const benchmarks = DEFAULT_BENCHMARKS;

  const handleManualRefresh = async () => {
      setIsRefreshing(true);
      await db.getClients(user.id);
      // Let the event listener handle the state update in App.tsx
      setTimeout(() => setIsRefreshing(false), 1000);
  };

  const availableAdvisors = useMemo(() => {
      const map = new Map<string, string>();
      clients.forEach(c => {
          const id = c.advisorId || c._ownerId;
          if (id) {
              const label = c._ownerEmail || `Advisor ${id.slice(0, 4)}`;
              map.set(id, label);
          }
      });
      return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [clients]);

  const filteredClients = useMemo(() => {
      if (selectedAdvisor === 'All') return clients;
      return clients.filter(c => (c.advisorId || c._ownerId) === selectedAdvisor);
  }, [clients, selectedAdvisor]);

  // --- TOP LEVEL KPI BLOCK ---
  const kpiStats = useMemo(() => {
      // Aggressive safety filter for active leads
      const activeLeads = filteredClients.filter(c => {
          const status = c.followUp?.status || c.stage || 'new';
          return !['client', 'case_closed', 'not_keen'].includes(status.toLowerCase());
      });
      
      const totalExpRevenue = filteredClients.reduce((acc, c) => acc + (toNum(c.value) || 0), 0);
      const avgDealValue = activeLeads.length > 0 ? totalExpRevenue / activeLeads.length : 0;
      const actionableOpps = filteredClients.filter(c => (c.momentumScore || 0) > 70).length;

      return {
          totalExpRevenue,
          activeLeadsCount: activeLeads.length,
          avgDealValue,
          actionableOpps,
          activeLeads,
          totalDatabaseCount: filteredClients.length
      };
  }, [filteredClients]);

  const fyStats = useMemo(() => {
      const annualGoal = user.annualGoal || 120000; 
      return getFYProgress(annualGoal, filteredClients);
  }, [user.annualGoal, filteredClients]);

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
                  const gross = sale.grossRevenue || sale.premiumAmount;
                  const comm = gross * (advisorBanding / 100);
                  commission += comm;
                  commissionList.push({ id: sale.id, name: c.profile.name, date: sale.date, value: comm, subtitle: `${sale.productName} ($${sale.premiumAmount})`, client: c });
                  closureList.push({ id: sale.id, name: c.profile.name, date: sale.date, value: sale.premiumAmount, subtitle: sale.productName, client: c });
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

      return { commission, closures, calls, apptsSet, apptsMet, commissionList, closureList, callList, apptSetList, apptMetList };
  };

  const currentStats = useMemo(() => calculatePeriodStats(0), [filteredClients, timeFilter, advisorBanding]);
  const prevStats = useMemo(() => calculatePeriodStats(1), [filteredClients, timeFilter, advisorBanding]);

  const getGrowth = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev) * 100;
  };

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
        <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/20 rounded-full blur-[80px]"></div>
            
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-4 gap-8 items-center">
                <div className="lg:col-span-1">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Financial Year Goal</h3>
                    <div className="text-4xl font-black tracking-tight">{fmtSGD(user.annualGoal || 120000)}</div>
                    <div className="mt-4 w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-1000 relative" style={{ width: `${fyStats.percentComplete}%` }}></div>
                    </div>
                    <div className="flex justify-between mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <span>{fyStats.percentComplete.toFixed(1)}% Achieved</span>
                        <span>{fmtSGD(fyStats.totalRevenue)}</span>
                    </div>
                </div>

                <div className="lg:col-span-2 grid grid-cols-3 gap-4 divide-x divide-white/10">
                    <div className="px-4 text-center">
                        <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Monthly Target</div>
                        <div className="text-xl font-bold text-white">{fmtSGD((user.annualGoal || 120000) / 12)}</div>
                    </div>
                    <div className="px-4 text-center">
                        <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">YTD Status</div>
                        <div className={`text-xl font-bold ${fyStats.gap >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {fyStats.gap >= 0 ? '+' : ''}{fmtSGD(fyStats.gap)}
                        </div>
                    </div>
                    <div className="px-4 text-center">
                        <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Time Remaining</div>
                        <div className="text-xl font-bold text-white">{fyStats.daysLeft} Days</div>
                    </div>
                </div>

                <div className="lg:col-span-1 bg-white/5 rounded-xl p-4 border border-white/10 backdrop-blur-sm">
                    {fyStats.gap < 0 ? (
                        <p className="text-sm font-medium leading-snug">You are <span className="text-rose-300 font-bold">{fmtSGD(Math.abs(fyStats.gap))}</span> off pace.</p>
                    ) : (
                        <p className="text-sm font-medium leading-snug text-emerald-300">Excellent! You are ahead by <span className="text-white font-bold">{fmtSGD(fyStats.gap)}</span>.</p>
                    )}
                </div>
            </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-800">Performance Pulse</h1>
                <button 
                    onClick={handleManualRefresh}
                    disabled={isRefreshing}
                    className={`p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-all ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`}
                    title="Force Data Sync"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
            </div>
            <div className="flex gap-4">
                {availableAdvisors.length > 1 && (
                    <select value={selectedAdvisor} onChange={(e) => setSelectedAdvisor(e.target.value)} className="bg-white border border-slate-200 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg outline-none shadow-sm">
                        <option value="All">All Advisors</option>
                        {availableAdvisors.map(adv => <option key={adv.id} value={adv.id}>{adv.name}</option>)}
                    </select>
                )}
                <div className="flex bg-white rounded-lg border border-slate-200 p-1 shadow-sm">
                    {['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'].map(tf => (
                        <button key={tf} onClick={() => setTimeFilter(tf as TimeFilter)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${timeFilter === tf ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-900'}`}>{tf}</button>
                    ))}
                </div>
            </div>
        </div>

        {/* --- DYNAMIC KPI SUMMARY GRID --- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div onClick={() => setActiveBreakdown({ title: 'Total Expected Revenue', items: kpiStats.activeLeads.map(l => ({ name: l.profile.name, subtitle: l.stage, value: toNum(l.value), client: l })), type: 'currency' })} className={cardClasses}>
                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Total Exp. Revenue</p>
                <p className="text-3xl font-black text-slate-900">{fmtSGD(kpiStats.totalExpRevenue).split('.')[0]}</p>
                <div className="text-[10px] text-indigo-500 font-bold mt-2 uppercase">Unrealized Pipeline</div>
            </div>
            
            <div onClick={() => setActiveBreakdown({ title: 'Active Pipeline Leads', items: kpiStats.activeLeads.map(l => ({ name: l.profile.name, subtitle: l.stage, value: 0, client: l })), type: 'text' })} className={cardClasses}>
                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Pipeline Active</p>
                <div className="flex items-center gap-2">
                    <p className="text-3xl font-black text-slate-900">{kpiStats.activeLeadsCount}</p>
                    {kpiStats.activeLeadsCount === 0 && kpiStats.totalDatabaseCount > 0 && (
                        <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded font-bold uppercase">Pipeline Clear</span>
                    )}
                </div>
                <div className="text-[10px] text-slate-400 font-bold mt-2 uppercase">In Conversion Funnel</div>
            </div>

            <div className={cardClasses}>
                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Total Clients</p>
                <p className="text-3xl font-black text-slate-900">{kpiStats.totalDatabaseCount}</p>
                <div className="text-[10px] text-slate-400 font-bold mt-2 uppercase">Full Database Size</div>
            </div>

            <div className={`${cardClasses} bg-emerald-50/50 border-emerald-100`}>
                <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Actionable Opps</p>
                <p className="text-3xl font-black text-emerald-700">{kpiStats.actionableOpps}</p>
                <div className="text-[10px] text-emerald-600 font-bold mt-2 uppercase">Momentum Score > 70</div>
            </div>
        </div>

        {/* --- ACTIVITY BREAKDOWNS --- */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div onClick={() => setActiveBreakdown({ title: 'Commission Breakdown', items: currentStats.commissionList, type: 'currency' })} className={cardClasses}>
                <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Commission</p>
                <p className="text-3xl font-bold text-slate-900">${currentStats.commission.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                <GrowthBadge curr={currentStats.commission} prev={prevStats.commission} prefix="$" />
            </div>
            <div onClick={() => setActiveBreakdown({ title: 'Closures Breakdown', items: currentStats.closureList, type: 'currency' })} className={cardClasses}>
                <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Closures</p>
                <p className="text-3xl font-bold text-slate-900">{currentStats.closures}</p>
                <GrowthBadge curr={currentStats.closures} prev={prevStats.closures} />
            </div>
            <div className={cardClasses}>
                <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Held Rate</p>
                <p className="text-3xl font-bold text-slate-900">{((currentStats.apptsMet / (currentStats.apptsSet || 1)) * 100).toFixed(0)}%</p>
            </div>
             <div onClick={() => setActiveBreakdown({ title: 'Clients Contacted', items: currentStats.callList, type: 'text' })} className={cardClasses}>
                <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Calls Made</p>
                <p className="text-3xl font-bold text-slate-900">{currentStats.calls}</p>
                <div className={`mt-2 text-xs font-medium inline-block px-2 py-1 rounded ${currentStats.calls < benchmarks.callsPerWeek ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50'}`}>
                    {currentStats.calls < benchmarks.callsPerWeek ? `⚠ Low` : '✓ On Track'}
                </div>
            </div>
            <div onClick={() => setActiveBreakdown({ title: 'Appointments Set', items: currentStats.apptSetList, type: 'text' })} className={cardClasses}>
                <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Appts Set</p>
                <p className="text-3xl font-bold text-slate-900">{currentStats.apptsSet}</p>
                <div className={`mt-2 text-xs font-medium inline-block px-2 py-1 rounded ${currentStats.apptsSet < benchmarks.apptsPerWeek ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50'}`}>
                    {currentStats.apptsSet < benchmarks.apptsPerWeek ? `⚠ Low` : '✓ On Track'}
                </div>
            </div>
        </div>

        {activeBreakdown && (
            <Modal isOpen={!!activeBreakdown} onClose={() => setActiveBreakdown(null)} title={activeBreakdown.title}>
                <div className="max-h-96 overflow-y-auto custom-scrollbar">
                    {activeBreakdown.items.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 italic text-sm">No data recorded.</div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 sticky top-0">
                                <tr><th className="px-4 py-3 text-xs uppercase font-bold text-slate-500">Name</th><th className="px-4 py-3 text-right text-xs uppercase font-bold text-slate-500">Detail</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {activeBreakdown.items.map((item, i) => (
                                    <tr key={i} className="hover:bg-slate-50 cursor-pointer" onClick={() => handleRowClick(item.client)}>
                                        <td className="px-4 py-3 font-bold">{item.name}</td>
                                        <td className="px-4 py-3 text-right">
                                            {activeBreakdown.type === 'currency' ? <span className="text-emerald-600 font-bold">{fmtSGD(item.value)}</span> : <span className="text-slate-500">{item.subtitle}</span>}
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