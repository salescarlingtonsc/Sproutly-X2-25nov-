import React, { useState, useEffect, useRef, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { Client, Stage } from '../../../types';
import { fmtSGD, toNum } from '../../../lib/helpers';
import Modal from '../../../components/ui/Modal';

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
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [breakdownType, setBreakdownType] = useState<'revenue' | 'active' | 'avg' | 'opps' | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const filteredPanelClients = useMemo(() => {
      if (!advisorFilter || advisorFilter === 'All') return clients;
      return clients.filter(c => (c.advisorId || c._ownerId) === advisorFilter);
  }, [clients, advisorFilter]);

  const stats = useMemo(() => {
      const activeLeads = filteredPanelClients.filter(c => !['client', 'case_closed', 'not_keen'].includes(c.followUp?.status || ''));
      const totalPipeline = filteredPanelClients.reduce((acc, c) => acc + (toNum(c.value) || 0), 0);
      const avgDeal = activeLeads.length > 0 ? totalPipeline / activeLeads.length : 0;
      const hotOpportunities = filteredPanelClients.filter(c => (c.momentumScore || 0) > 70);

      const pipelineData = Object.values(Stage).map((stage) => {
        const stageStr = stage as string;
        const subset = filteredPanelClients.filter(c => c.stage === stageStr);
        return { name: stageStr.split(' ')[0], fullName: stageStr, value: subset.length };
      });

      const momentumData = [
        { name: 'Stalled (<30)', value: filteredPanelClients.filter(c => (c.momentumScore || 0) < 30).length, color: '#ef4444' },
        { name: 'Moving (30-70)', value: filteredPanelClients.filter(c => (c.momentumScore || 0) >= 30 && (c.momentumScore || 0) <= 70).length, color: '#f59e0b' },
        { name: 'Hot (>70)', value: hotOpportunities.length, color: '#10b981' },
      ];

      return { totalPipeline, activeLeadsCount: activeLeads.length, avgDeal, hotOpportunities, pipelineData, momentumData, activeLeads };
  }, [filteredPanelClients]);

  const getBreakdownData = () => {
    switch (breakdownType) {
      case 'revenue': return { title: 'Pipeline Revenue', items: filteredPanelClients.filter(c => toNum(c.value) > 0) };
      case 'active': return { title: 'Active Leads', items: stats.activeLeads };
      case 'opps': return { title: 'Hot Opportunities', items: stats.hotOpportunities };
      default: return null;
    }
  };

  const breakdown = getBreakdownData();

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 mb-6 transition-all duration-300 overflow-hidden ${isCollapsed ? 'p-4' : 'p-6'}`}>
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-800">Performance Pulse</h2>
        <div className="flex items-center gap-2">
            {availableAdvisors.length > 1 && setAdvisorFilter && !isCollapsed && (
                <select value={advisorFilter} onChange={(e) => setAdvisorFilter(e.target.value)} className="bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-bold py-1 px-2 rounded-lg outline-none">
                    <option value="All">All Advisors</option>
                    {availableAdvisors.map(adv => <option key={adv.id} value={adv.id}>{adv.name}</option>)}
                </select>
            )}
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
                {isCollapsed ? '▼' : '▲'}
            </button>
        </div>
      </div>

      {!isCollapsed && (
          <div ref={contentRef} className="animate-fade-in mt-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <button onClick={() => setBreakdownType('revenue')} className="text-left p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-300 transition-all">
                    <p className="text-[10px] text-slate-400 uppercase font-black mb-1">Total Exp. Revenue</p>
                    <p className="text-xl font-bold text-slate-900">{fmtSGD(stats.totalPipeline).split('.')[0]}</p>
                </button>
                <button onClick={() => setBreakdownType('active')} className="text-left p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-300 transition-all">
                    <p className="text-[10px] text-slate-400 uppercase font-black mb-1">Active Leads</p>
                    <p className="text-xl font-bold text-slate-900">{stats.activeLeadsCount}</p>
                </button>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[10px] text-slate-400 uppercase font-black mb-1">Avg Deal Value</p>
                    <p className="text-xl font-bold text-slate-900">{fmtSGD(stats.avgDeal).split('.')[0]}</p>
                </div>
                <button onClick={() => setBreakdownType('opps')} className="text-left p-4 bg-emerald-50 rounded-xl border border-emerald-100 hover:border-emerald-400 transition-all">
                    <p className="text-[10px] text-emerald-600 uppercase font-black mb-1">Actionable Opps</p>
                    <p className="text-xl font-bold text-emerald-900">{stats.hotOpportunities.length}</p>
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.pipelineData}>
                        <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{fill: '#f8fafc'}} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} onClick={(d) => onStageClick?.(d.fullName)}>
                            {stats.pipelineData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={stats.momentumData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value">
                            {stats.momentumData.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip />
                        <Legend iconSize={8} wrapperStyle={{fontSize: '10px'}} />
                    </PieChart>
                </ResponsiveContainer>
            </div>
          </div>
      )}

      <Modal isOpen={!!breakdownType} onClose={() => setBreakdownType(null)} title={breakdown?.title || ''}>
          <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 sticky top-0"><tr><th className="p-3">Client</th><th className="p-3 text-right">Value</th></tr></thead>
                  <tbody>
                      {breakdown?.items.map(c => (
                          <tr key={c.id} className="border-t border-slate-50 hover:bg-slate-50">
                              <td className="p-3 font-bold text-slate-700">{c.profile.name}</td>
                              <td className="p-3 text-right font-mono text-emerald-600 font-bold">{fmtSGD(toNum(c.value))}</td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </Modal>
    </div>
  );
};