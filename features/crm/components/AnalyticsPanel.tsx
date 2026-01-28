import React, { useState, useEffect, useRef, useMemo } from 'react';
// Added Legend to recharts imports
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { Client, Stage } from '../../../types';
import { fmtSGD } from '../../../lib/helpers';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';

interface AnalyticsPanelProps {
  clients: Client[];
  advisorFilter?: string;
  setAdvisorFilter?: (id: string) => void;
  availableAdvisors?: { id: string; name: string }[];
  onStageClick?: (stage: string) => void;
  onMomentumClick?: (range: 'Hot' | 'Moving' | 'Stalled') => void;
}

const COLORS = ['#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a'];

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ 
    clients,
    advisorFilter = 'All',
    setAdvisorFilter,
    availableAdvisors = [],
    onStageClick,
    onMomentumClick
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [viewMetric, setViewMetric] = useState<'value' | 'count'>('value');
  const [breakdownType, setBreakdownType] = useState<'revenue' | 'active' | 'avg' | 'opps' | null>(null);
  const [canRenderCharts, setCanRenderCharts] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const filteredPanelClients = useMemo(() => {
      if (!advisorFilter || advisorFilter === 'All') return clients;
      return clients.filter(c => (c.advisorId || c._ownerId) === advisorFilter);
  }, [clients, advisorFilter]);

  const totalPipeline = useMemo(() => filteredPanelClients.reduce((acc, c) => acc + (c.value || 0), 0), [filteredPanelClients]);
  const activeLeadsList = useMemo(() => filteredPanelClients.filter(c => !['client', 'case_closed', 'not_keen'].includes(c.followUp?.status || '')), [filteredPanelClients]);
  const activeLeadsCount = activeLeadsList.length;
  const avgDeal = activeLeadsCount > 0 ? totalPipeline / activeLeadsCount : 0;
  const hotOpportunities = useMemo(() => filteredPanelClients.filter(c => (c.momentumScore || 0) > 70), [filteredPanelClients]);

  const momentumData = useMemo(() => [
    { name: 'Stalled (<30)', key: 'Stalled', value: filteredPanelClients.filter(c => (c.momentumScore || 0) < 30).length, color: '#ef4444' },
    { name: 'Moving (30-70)', key: 'Moving', value: filteredPanelClients.filter(c => (c.momentumScore || 0) >= 30 && (c.momentumScore || 0) <= 70).length, color: '#f59e0b' },
    { name: 'Hot (>70)', key: 'Hot', value: hotOpportunities.length, color: '#10b981' },
  ], [filteredPanelClients, hotOpportunities]);

  const pipelineData = useMemo(() => Object.values(Stage).map((stage) => {
    const stageStr = stage as string;
    const subset = filteredPanelClients.filter(c => c.stage === stageStr);
    const val = viewMetric === 'value' ? subset.reduce((sum, c) => sum + (c.value || 0), 0) : subset.length;
    return { name: stageStr.split(' ')[0], fullName: stageStr, value: val, count: subset.length };
  }), [filteredPanelClients, viewMetric]);

  useEffect(() => {
    if (activeLeadsCount > 0 && totalPipeline === 0) setViewMetric('count');
  }, [totalPipeline, activeLeadsCount]);

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

  const getBreakdownData = () => {
    switch (breakdownType) {
      case 'revenue':
        return {
          title: 'Revenue Pipeline Breakdown',
          description: 'Leads with mapped Expected Revenue values.',
          clients: [...filteredPanelClients].filter(c => (c.value || 0) > 0).sort((a, b) => (b.value || 0) - (a.value || 0))
        };
      case 'active':
        return {
          title: 'Active Leads Breakdown',
          description: 'Currently active leads in your funnel.',
          clients: [...activeLeadsList].sort((a, b) => (a.stage || '').localeCompare(b.stage || ''))
        };
      case 'avg':
        return {
          title: 'Average Deal Composition',
          description: 'Breakdown of leads with revenue value > $0.',
          clients: [...activeLeadsList].filter(c => (c.value || 0) > 0).sort((a, b) => (b.value || 0) - (a.value || 0))
        };
      case 'opps':
        return {
          title: 'Hot Opportunities Breakdown',
          description: 'Clients with Momentum Scores > 70/100.',
          clients: [...hotOpportunities].sort((a, b) => (b.momentumScore || 0) - (a.momentumScore || 0))
        };
      default:
        return null;
    }
  };

  const breakdown = getBreakdownData();

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 mb-6 transition-all duration-300 overflow-hidden ${isCollapsed ? 'p-4' : 'p-6'}`}>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-slate-800">Performance Pulse</h2>
        </div>
        <div className="flex items-center gap-2">
            {availableAdvisors.length > 1 && setAdvisorFilter && !isCollapsed && (
                <div className="relative group">
                    <select 
                        value={advisorFilter}
                        onChange={(e) => setAdvisorFilter(e.target.value)}
                        className="appearance-none bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold py-1.5 pl-3 pr-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-indigo-300 transition-all cursor-pointer shadow-sm"
                    >
                        <option value="All">All Advisors</option>
                        {availableAdvisors.map(adv => <option key={adv.id} value={adv.id}>{adv.name}</option>)}
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-400 text-[8px]">▼</div>
                </div>
            )}
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
                {isCollapsed ? '▼' : '▲'}
            </button>
        </div>
      </div>

      {!isCollapsed && (
          <div ref={contentRef} className="animate-fade-in mt-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-8">
                <button onClick={() => setBreakdownType('revenue')} className="text-left p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all active:scale-95">
                    <p className="text-xs text-slate-500 mb-1 font-medium">Total Exp. Revenue</p>
                    <p className="text-xl lg:text-2xl font-bold text-slate-900">${totalPipeline.toLocaleString()}</p>
                </button>
                <button onClick={() => setBreakdownType('active')} className="text-left p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all active:scale-95">
                    <p className="text-xs text-slate-500 mb-1 font-medium">Active Leads</p>
                    <p className="text-xl lg:text-2xl font-bold text-slate-900">{activeLeadsCount}</p>
                </button>
                <button onClick={() => setBreakdownType('avg')} className="text-left p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all active:scale-95">
                    <p className="text-xs text-slate-500 mb-1 font-medium">Avg Deal Value</p>
                    <p className="text-xl lg:text-2xl font-bold text-slate-900">${Math.floor(avgDeal).toLocaleString()}</p>
                </button>
                <button onClick={() => setBreakdownType('opps')} className="text-left p-4 bg-emerald-50 rounded-xl border border-emerald-100 hover:border-emerald-400 hover:bg-emerald-100/50 transition-all active:scale-95">
                    <p className="text-xs text-emerald-700 mb-1 font-medium">Actionable Opps</p>
                    <p className="text-xl lg:text-2xl font-bold text-emerald-900">{momentumData[2].value}</p>
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={pipelineData}>
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                            <YAxis hide />
                            <Tooltip cursor={{fill: '#f1f5f9'}} formatter={(v: number) => [viewMetric === 'value' ? fmtSGD(v) : `${v} Leads`, 'Total']} />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]} onClick={(data) => onStageClick?.(data.fullName)}>
                                {pipelineData.map((entry, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={momentumData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                {momentumData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
          </div>
      )}

      <Modal isOpen={!!breakdownType} onClose={() => setBreakdownType(null)} title={breakdown?.title || ''}>
        <div className="space-y-4">
           <p className="text-xs text-slate-500">{breakdown?.description}</p>
           <div className="max-h-96 overflow-y-auto border border-slate-100 rounded-xl bg-slate-50/50">
              <table className="w-full text-left text-xs">
                 <thead className="bg-slate-100 sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                       <th className="px-4 py-3 font-bold text-slate-600 uppercase text-[9px]">Client Name</th>
                       <th className="px-4 py-3 font-bold text-slate-600 uppercase text-[9px]">Stage</th>
                       <th className="px-4 py-3 font-bold text-slate-600 uppercase text-[9px] text-right">Value (Expected)</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                    {breakdown?.clients.map((c, i) => (
                       <tr key={i} className="hover:bg-white transition-colors">
                          <td className="px-4 py-3 font-bold text-slate-800">{c.profile?.name || c.name}</td>
                          <td className="px-4 py-3"><span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[9px] font-black uppercase">{c.stage}</span></td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">
                             <div className="flex flex-col items-end">
                                <span>{fmtSGD(c.value || 0)}</span>
                                <span className="text-[8px] text-slate-400 font-black">Momentum: {c.momentumScore || 50}/100</span>
                             </div>
                          </td>
                       </tr>
                    ))}
                    {breakdown?.clients.length === 0 && <tr><td colSpan={3} className="px-4 py-12 text-center text-slate-400 italic">No data matched.</td></tr>}
                 </tbody>
              </table>
           </div>
        </div>
      </Modal>
    </div>
  );
};