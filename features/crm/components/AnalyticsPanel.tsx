import React, { useState, useEffect, useRef, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { Client, Stage } from '../../../types';
import { fmtSGD, toNum } from '../../../lib/helpers';
import { db } from '../../../lib/db';

interface AnalyticsPanelProps {
  clients: Client[];
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
  const [queueCount, setQueueCount] = useState(0);
  
  const [canRenderCharts, setCanRenderCharts] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Poll for outbox queue
  useEffect(() => {
      const i = setInterval(() => setQueueCount(db.getQueueCount()), 2000);
      return () => clearInterval(i);
  }, []);

  const filteredPanelClients = useMemo(() => {
      if (!advisorFilter || advisorFilter === 'All') return clients;
      return clients.filter(c => {
          const effectiveOwner = c.advisorId || c._ownerId;
          return effectiveOwner === advisorFilter;
      });
  }, [clients, advisorFilter]);

  const totalPipeline = useMemo(() => filteredPanelClients.reduce((acc, c) => acc + toNum(c.value), 0), [filteredPanelClients]);
  
  const activeLeads = useMemo(() => filteredPanelClients.filter(c => {
      const status = c.followUp?.status || 'new'; // Default to new if missing
      return !['client', 'case_closed', 'not_keen'].includes(status);
  }), [filteredPanelClients]);
  
  const activeLeadsCount = activeLeads.length;
  const avgDeal = activeLeadsCount > 0 ? totalPipeline / activeLeadsCount : 0;

  const momentumData = useMemo(() => [
    { name: 'Stalled (<30)', value: filteredPanelClients.filter(c => (c.momentumScore || 0) < 30).length, color: '#ef4444' },
    { name: 'Moving (30-70)', value: filteredPanelClients.filter(c => (c.momentumScore || 0) >= 30 && (c.momentumScore || 0) <= 70).length, color: '#f59e0b' },
    { name: 'Hot (>70)', value: filteredPanelClients.filter(c => (c.momentumScore || 0) > 70).length, color: '#10b981' },
  ], [filteredPanelClients]);

  const pipelineData = useMemo(() => Object.values(Stage).map((stage) => {
    const stageStr = stage as string;
    const subset = filteredPanelClients.filter(c => c.stage === stageStr);
    const val = viewMetric === 'value' ? subset.reduce((sum, c) => sum + toNum(c.value), 0) : subset.length;
    return { name: stageStr.split(' ')[0], fullName: stageStr, value: val };
  }), [filteredPanelClients, viewMetric]);

  useEffect(() => {
    if (isCollapsed || !contentRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 10) {
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
            <h2 className="text-xl font-black text-slate-800 tracking-tight">Strategy Pulse</h2>
            {queueCount > 0 && (
                <div className="bg-amber-50 text-amber-700 px-3 py-1 rounded-lg border border-amber-200 text-[10px] font-black uppercase tracking-widest animate-pulse flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                    {queueCount} OUTBOX ITEMS PENDING
                </div>
            )}
        </div>
        <div className="flex items-center gap-2">
            {availableAdvisors.length > 1 && setAdvisorFilter && !isCollapsed && (
                <div className="relative group">
                    <select 
                        value={advisorFilter}
                        onChange={(e) => setAdvisorFilter(e.target.value)}
                        className="appearance-none bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold py-1.5 pl-3 pr-8 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-sm"
                    >
                        <option value="All">All Advisors</option>
                        {availableAdvisors.map(adv => <option key={adv.id} value={adv.id}>{adv.name}</option>)}
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-400 text-[8px]">▼</div>
                </div>
            )}

            <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
                {isCollapsed ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>}
            </button>
        </div>
      </div>

      {!isCollapsed && (
          <div ref={contentRef} className="animate-fade-in mt-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-8">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pipeline Volume</p>
                    <p className="text-xl lg:text-2xl font-black text-slate-900 tracking-tighter">${totalPipeline.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Active Leads</p>
                    <p className="text-xl lg:text-2xl font-black text-slate-900 tracking-tighter">{activeLeadsCount}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Average Deal</p>
                    <p className="text-xl lg:text-2xl font-black text-slate-900 tracking-tighter">${Math.floor(avgDeal).toLocaleString()}</p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Action Priority</p>
                    <p className="text-xl lg:text-2xl font-black text-emerald-900 tracking-tighter">{momentumData[2].value}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="flex flex-col">
                    <div className="flex justify-between items-center mb-4 shrink-0">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Pipeline Topography</h3>
                        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                            <button onClick={() => setViewMetric('value')} className={`px-2 py-1 text-[9px] font-black uppercase rounded-md transition-all ${viewMetric === 'value' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>Revenue</button>
                            <button onClick={() => setViewMetric('count')} className={`px-2 py-1 text-[9px] font-black uppercase rounded-md transition-all ${viewMetric === 'count' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>Volume</button>
                        </div>
                    </div>
                    <div className="w-full h-[220px]">
                        {canRenderCharts && (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={pipelineData}>
                                    <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                                    <Tooltip formatter={(v: number) => viewMetric === 'value' ? fmtSGD(v) : v} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                        {pipelineData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
                <div className="flex flex-col">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Momentum Heatmap</h3>
                    <div className="w-full h-[220px] flex items-center">
                        <div className="flex-1 h-full">
                            {canRenderCharts && (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={momentumData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                            {momentumData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                        <div className="pl-6 space-y-2 shrink-0">
                            {momentumData.map((item, idx) => (
                                <div key={idx} className="flex items-center text-[10px] font-bold uppercase tracking-wider">
                                    <span className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: item.color }}></span>
                                    <span className="text-slate-500">{item.name.split(' ')[0]}: <span className="text-slate-900">{item.value}</span></span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
          </div>
      )}
    </div>
  );
};