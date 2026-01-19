import React, { useState, useEffect, useRef, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { Client, Stage } from '../../../types';
import { fmtSGD } from '../../../lib/helpers';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';

interface AnalyticsPanelProps {
  clients: Client[];
  advisorFilter?: string;
  setAdvisorFilter?: (id: string) => void;
  availableAdvisors?: { id: string; name: string }[];
  // Interactive Callbacks for CRM Filtering
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
  const zeroValueLeads = activeLeadsList.filter(c => !c.value || c.value === 0).length;
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

    return { 
        name: stageStr.split(' ')[0], 
        fullName: stageStr, 
        value: val,
        count: subset.length
    };
  }), [filteredPanelClients, viewMetric]);

  useEffect(() => {
    if (activeLeadsCount > 0 && totalPipeline === 0) setViewMetric('count');
  }, [totalPipeline, activeLeadsCount]);

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

  const handleMetricClick = (type: 'revenue' | 'active' | 'avg' | 'opps') => {
    setBreakdownType(type);
  };

  const getBreakdownData = () => {
    switch (breakdownType) {
      case 'revenue':
        return {
          title: 'Revenue Pipeline Breakdown',
          description: 'All leads contributing to the projected SGD $' + totalPipeline.toLocaleString(),
          clients: [...filteredPanelClients].filter(c => (c.value || 0) > 0).sort((a, b) => (b.value || 0) - (a.value || 0))
        };
      case 'active':
        return {
          title: 'Active Leads Breakdown',
          description: 'Current leads in non-terminal stages.',
          clients: [...activeLeadsList].sort((a, b) => (a.stage || '').localeCompare(b.stage || ''))
        };
      case 'avg':
        return {
          title: 'Average Deal Composition',
          description: 'Distribution of deal values across active leads.',
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
            {isCollapsed && (
                <div className="flex items-center gap-4 text-sm text-slate-500 fade-in">
                    <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200">Pipeline: <b>${(totalPipeline/1000).toFixed(0)}k</b></span>
                    <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200">Active: <b>{activeLeadsCount}</b></span>
                </div>
            )}
        </div>
        <div className="flex items-center gap-2">
            {availableAdvisors.length > 1 && setAdvisorFilter && !isCollapsed ? (
                <div className="relative group">
                    <select 
                        value={advisorFilter}
                        onChange={(e) => setAdvisorFilter(e.target.value)}
                        className="appearance-none bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold py-1.5 pl-3 pr-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-indigo-300 transition-all cursor-pointer shadow-sm"
                    >
                        <option value="All">All Advisors ({availableAdvisors.length})</option>
                        {availableAdvisors.map(adv => <option key={adv.id} value={adv.id}>{adv.name}</option>)}
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-400 text-[8px]">▼</div>
                </div>
            ) : (
                !isCollapsed && <span className="text-xs text-slate-500 bg-slate-50 px-3 py-1 rounded-full border border-slate-200">Live Data</span>
            )}
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
                {isCollapsed ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>}
            </button>
        </div>
      </div>

      {!isCollapsed && (
          <div ref={contentRef} className="animate-fade-in mt-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-8">
                <button onClick={() => handleMetricClick('revenue')} className="text-left p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group active:scale-95">
                    <p className="text-xs lg:text-sm text-slate-500 mb-1 group-hover:text-indigo-600 font-medium">Total Exp. Revenue ↗</p>
                    <p className="text-xl lg:text-2xl font-bold text-slate-900">${totalPipeline.toLocaleString()}</p>
                </button>
                <button onClick={() => handleMetricClick('active')} className="text-left p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group active:scale-95">
                    <p className="text-xs lg:text-sm text-slate-500 mb-1 group-hover:text-indigo-600 font-medium">Active Leads ↗</p>
                    <p className="text-xl lg:text-2xl font-bold text-slate-900">{activeLeadsCount}</p>
                </button>
                <button onClick={() => handleMetricClick('avg')} className="text-left p-4 bg-slate-50 rounded-xl border border-slate-100 relative overflow-hidden hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group active:scale-95">
                    <p className="text-xs lg:text-sm text-slate-500 mb-1 group-hover:text-indigo-600 font-medium">Avg Revenue / Lead ↗</p>
                    <p className="text-xl lg:text-2xl font-bold text-slate-900">${Math.floor(avgDeal).toLocaleString()}</p>
                    {zeroValueLeads > 0 && <div className="text-[10px] text-amber-600 font-medium mt-1 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>{zeroValueLeads} leads have $0 value</div>}
                </button>
                <button onClick={() => handleMetricClick('opps')} className="text-left p-4 bg-emerald-50 rounded-xl border border-emerald-100 hover:border-emerald-400 hover:bg-emerald-100/50 transition-all group active:scale-95">
                    <p className="text-xs lg:text-sm text-emerald-700 mb-1 group-hover:text-emerald-800 font-medium">Actionable Opportunities ↗</p>
                    <p className="text-xl lg:text-2xl font-bold text-emerald-900">{momentumData[2].value}</p>
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="flex flex-col">
                    <div className="flex justify-between items-center mb-4 shrink-0">
                        <h3 className="text-sm font-medium text-slate-600">Pipeline Distribution (Click to filter)</h3>
                        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                            <button onClick={() => setViewMetric('value')} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${viewMetric === 'value' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>Revenue ($)</button>
                            <button onClick={() => setViewMetric('count')} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${viewMetric === 'count' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>Volume (#)</button>
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
                                        formatter={(value: number) => [viewMetric === 'value' ? fmtSGD(value) : `${value} Leads`, 'Total']}
                                    />
                                    <Bar 
                                        dataKey="value" 
                                        radius={[4, 4, 0, 0]} 
                                        animationDuration={1000} 
                                        className="cursor-pointer"
                                        onClick={(data) => onStageClick?.(data.fullName)}
                                    >
                                        {pipelineData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <div className="w-full h-full bg-slate-50 animate-pulse rounded-xl border border-slate-100 flex items-center justify-center"><span className="text-slate-300 text-xs font-medium">Loading Analytics...</span></div>}
                    </div>
                </div>

                <div className="flex flex-col">
                    <h3 className="text-sm font-medium text-slate-600 mb-4 shrink-0">Momentum Health (Click to filter)</h3>
                    <div className="w-full h-[250px] relative flex items-center justify-center min-w-0" style={{ minHeight: '250px' }}>
                        <div className="w-full h-full flex items-center">
                            <div className="flex-1 h-full">
                                {canRenderCharts ? (
                                    <ResponsiveContainer width="99%" height="100%">
                                        <PieChart>
                                            <Pie 
                                                data={momentumData} 
                                                cx="50%" cy="50%" 
                                                innerRadius={60} 
                                                outerRadius={80} 
                                                paddingAngle={5} 
                                                dataKey="value"
                                                animationDuration={1000}
                                                className="cursor-pointer"
                                                onClick={(data) => onMomentumClick?.(data.key as any)}
                                            >
                                                {momentumData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : <div className="w-full h-full bg-slate-50 animate-pulse rounded-full opacity-50 border-4 border-slate-100" />}
                            </div>
                            <div className="ml-6 space-y-2 shrink-0">
                                {momentumData.map((item, idx) => (
                                    <button 
                                        key={idx} 
                                        onClick={() => onMomentumClick?.(item.key as any)}
                                        className="flex items-center text-sm hover:bg-slate-50 px-2 py-1 rounded transition-colors"
                                    >
                                        <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: item.color }}></span>
                                        <span className="text-slate-600">{item.name}: <span className="font-semibold">{item.value}</span></span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
          </div>
      )}

      {/* METRIC BREAKDOWN MODAL */}
      <Modal 
        isOpen={!!breakdownType} 
        onClose={() => setBreakdownType(null)} 
        title={breakdown?.title || 'Metric Breakdown'}
        footer={<Button variant="ghost" onClick={() => setBreakdownType(null)}>Close</Button>}
      >
        <div className="space-y-4">
           <p className="text-xs text-slate-500 font-medium">{breakdown?.description}</p>
           <div className="max-h-96 overflow-y-auto border border-slate-100 rounded-xl bg-slate-50/50">
              <table className="w-full text-left text-xs">
                 <thead className="bg-slate-100 sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                       <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-widest text-[9px]">Client Name</th>
                       <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-widest text-[9px]">Stage</th>
                       <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-widest text-[9px] text-right">Value</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                    {breakdown?.clients.map((c, i) => (
                       <tr key={c.id} className="hover:bg-white transition-colors">
                          <td className="px-4 py-3 font-bold text-slate-800">{c.profile?.name || c.name || 'Unnamed'}</td>
                          <td className="px-4 py-3">
                             <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[9px] font-black uppercase tracking-tight">{c.stage || 'New'}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">
                             {c.momentumScore ? (
                                <div className="flex flex-col items-end">
                                   <span>{fmtSGD(c.value || 0)}</span>
                                   <span className="text-[8px] text-slate-400 font-black">MOMENTUM: {c.momentumScore}/100</span>
                                </div>
                             ) : fmtSGD(c.value || 0)}
                          </td>
                       </tr>
                    ))}
                    {breakdown?.clients.length === 0 && (
                       <tr>
                          <td colSpan={3} className="px-4 py-12 text-center text-slate-400 italic">No clients matching this criteria.</td>
                       </tr>
                    )}
                 </tbody>
              </table>
           </div>
        </div>
      </Modal>
    </div>
  );
};
