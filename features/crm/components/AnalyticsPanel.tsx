import React, { useState, useEffect, useRef, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { Client, Stage } from '../../../types';
import { fmtSGD } from '../../../lib/helpers';

interface AnalyticsPanelProps {
  clients: Client[];
  // New props for internal filtering
  advisorFilter?: string;
  setAdvisorFilter?: (id: string) => void;
  availableAdvisors?: { id: string; name: string }[];
}

const COLORS = ['#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a'];

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ 
    clients,
    advisorFilter = 'All',
    setAdvisorFilter,
    availableAdvisors = []
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [viewMetric, setViewMetric] = useState<'value' | 'count'>('value');
  
  const [canRenderCharts, setCanRenderCharts] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // --- FILTER LOGIC INTERNAL TO PANEL ---
  // The panel uses the FULL client list passed to it, but applies the advisor filter locally for the charts
  const filteredPanelClients = useMemo(() => {
      if (!advisorFilter || advisorFilter === 'All') return clients;
      
      // STRICT FILTER: Prioritize Assignment.
      // If a lead is assigned (advisorId exists), only show if filter matches advisorId.
      // If unassigned, fall back to _ownerId.
      return clients.filter(c => {
          const effectiveOwner = c.advisorId || c._ownerId;
          return effectiveOwner === advisorFilter;
      });
  }, [clients, advisorFilter]);

  // --- PRE-CALCULATIONS (Use Filtered Clients) ---
  const totalPipeline = useMemo(() => filteredPanelClients.reduce((acc, c) => acc + (c.value || 0), 0), [filteredPanelClients]);
  
  const activeLeads = useMemo(() => filteredPanelClients.filter(c => !['client', 'case_closed', 'not_keen'].includes(c.followUp.status || '')), [filteredPanelClients]);
  const activeLeadsCount = activeLeads.length;
  const zeroValueLeads = activeLeads.filter(c => !c.value || c.value === 0).length;
  const avgDeal = activeLeadsCount > 0 ? totalPipeline / activeLeadsCount : 0;

  const momentumData = useMemo(() => [
    { name: 'Stalled (<30)', value: filteredPanelClients.filter(c => (c.momentumScore || 0) < 30).length, color: '#ef4444' },
    { name: 'Moving (30-70)', value: filteredPanelClients.filter(c => (c.momentumScore || 0) >= 30 && (c.momentumScore || 0) <= 70).length, color: '#f59e0b' },
    { name: 'Hot (>70)', value: filteredPanelClients.filter(c => (c.momentumScore || 0) > 70).length, color: '#10b981' },
  ], [filteredPanelClients]);

  const pipelineData = useMemo(() => Object.values(Stage).map((stage) => {
    const stageStr = stage as string;
    const subset = filteredPanelClients.filter(c => c.stage === stageStr);
    
    // Calculate based on toggle
    const val = viewMetric === 'value' 
        ? subset.reduce((sum, c) => sum + (c.value || 0), 0)
        : subset.length;

    return { 
        name: stageStr.split(' ')[0], 
        fullName: stageStr, 
        value: val,
        count: subset.length,
        revenue: subset.reduce((sum, c) => sum + (c.value || 0), 0)
    };
  }), [filteredPanelClients, viewMetric]);

  // --- SMART AUTO-SWITCH ---
  useEffect(() => {
    if (activeLeadsCount > 0 && totalPipeline === 0) {
        setViewMetric('count');
    }
  }, [totalPipeline, activeLeadsCount]);

  // --- LAYOUT OBSERVER ---
  useEffect(() => {
    if (isCollapsed || !contentRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 10 && entry.contentRect.height > 10) {
          setCanRenderCharts(true);
          observer.disconnect(); 
        }
      }
    });

    observer.observe(contentRef.current);

    return () => observer.disconnect();
  }, [isCollapsed]);

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 mb-6 transition-all duration-300 overflow-hidden ${isCollapsed ? 'p-4' : 'p-6'}`}>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-slate-800">Performance Pulse</h2>
            {isCollapsed && (
                <div className="flex items-center gap-4 text-sm text-slate-500 fade-in">
                    <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200">Pipeline: <b>${(totalPipeline/1000).toFixed(0)}k</b></span>
                    <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200">Active: <b>{activeLeadsCount}</b></span>
                </div>
            )}
        </div>
        <div className="flex items-center gap-2">
            {/* ADVISOR DROPDOWN (Replaced Live Data Badge) */}
            {availableAdvisors.length > 1 && setAdvisorFilter && !isCollapsed ? (
                <div className="relative group">
                    <select 
                        value={advisorFilter}
                        onChange={(e) => setAdvisorFilter(e.target.value)}
                        className="appearance-none bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold py-1.5 pl-3 pr-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-indigo-300 transition-all cursor-pointer shadow-sm"
                    >
                        <option value="All">All Advisors ({availableAdvisors.length})</option>
                        {availableAdvisors.map(adv => (
                            <option key={adv.id} value={adv.id}>{adv.name}</option>
                        ))}
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-400 text-[8px]">▼</div>
                </div>
            ) : (
                !isCollapsed && <span className="text-xs text-slate-500 bg-slate-50 px-3 py-1 rounded-full border border-slate-200">Live Data</span>
            )}

            <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors" title={isCollapsed ? "Show Analytics" : "Hide Analytics"}>
                {isCollapsed ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>}
            </button>
        </div>
      </div>

      {!isCollapsed && (
          <div ref={contentRef} className="animate-fade-in mt-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-8">
                {/* KPIs */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs lg:text-sm text-slate-500 mb-1">Total Exp. Revenue</p>
                    <p className="text-xl lg:text-2xl font-bold text-slate-900">${totalPipeline.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs lg:text-sm text-slate-500 mb-1">Active Leads</p>
                    <p className="text-xl lg:text-2xl font-bold text-slate-900">{activeLeadsCount}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 relative overflow-hidden">
                    <p className="text-xs lg:text-sm text-slate-500 mb-1">Avg Revenue / Lead</p>
                    <p className="text-xl lg:text-2xl font-bold text-slate-900">${Math.floor(avgDeal).toLocaleString()}</p>
                    {zeroValueLeads > 0 && (
                        <div className="text-[10px] text-amber-600 font-medium mt-1 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            {zeroValueLeads} leads have $0 value
                        </div>
                    )}
                </div>
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                    <p className="text-xs lg:text-sm text-emerald-700 mb-1">Actionable Opportunities</p>
                    <p className="text-xl lg:text-2xl font-bold text-emerald-900">{momentumData[2].value}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Pipeline Chart */}
                <div className="flex flex-col">
                    <div className="flex justify-between items-center mb-4 shrink-0">
                        <h3 className="text-sm font-medium text-slate-600">Pipeline Distribution</h3>
                        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                            <button 
                                onClick={() => setViewMetric('value')}
                                className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${viewMetric === 'value' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                Revenue ($)
                            </button>
                            <button 
                                onClick={() => setViewMetric('count')}
                                className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${viewMetric === 'count' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                Volume (#)
                            </button>
                        </div>
                    </div>
                    
                    <div className="w-full h-[250px] relative min-w-0 bg-white" style={{ minHeight: '250px' }}>
                        {canRenderCharts ? (
                            <ResponsiveContainer width="99%" height="100%">
                                <BarChart data={pipelineData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                    <YAxis hide />
                                    <Tooltip 
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                                        cursor={{fill: '#f1f5f9'}}
                                        formatter={(value: number, name: string, props: any) => [
                                            viewMetric === 'value' ? fmtSGD(value) : `${value} Leads`,
                                            viewMetric === 'value' ? 'Revenue' : 'Count'
                                        ]}
                                    />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]} animationDuration={1000}>
                                        {pipelineData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="w-full h-full bg-slate-50 animate-pulse rounded-xl border border-slate-100 flex items-center justify-center">
                                <span className="text-slate-300 text-xs font-medium">Loading Analytics...</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Momentum Chart */}
                <div className="flex flex-col">
                    <h3 className="text-sm font-medium text-slate-600 mb-4 shrink-0">Momentum Health</h3>
                    <div className="w-full h-[250px] relative flex items-center justify-center min-w-0" style={{ minHeight: '250px' }}>
                        <div className="w-full h-full flex items-center">
                            <div className="flex-1 h-full">
                                {canRenderCharts ? (
                                    <ResponsiveContainer width="99%" height="100%">
                                        <PieChart>
                                            <Pie 
                                                data={momentumData} 
                                                cx="50%" 
                                                cy="50%" 
                                                innerRadius={60} 
                                                outerRadius={80} 
                                                paddingAngle={5} 
                                                dataKey="value"
                                                animationDuration={1000}
                                            >
                                                {momentumData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="w-full h-full bg-slate-50 animate-pulse rounded-full opacity-50 border-4 border-slate-100" />
                                )}
                            </div>
                            <div className="ml-6 space-y-2 shrink-0">
                                {momentumData.map((item, idx) => (
                                    <div key={idx} className="flex items-center text-sm">
                                        <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: item.color }}></span>
                                        <span className="text-slate-600">{item.name}: <span className="font-semibold">{item.value}</span></span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
          </div>
      )}
    </div>
  );
};