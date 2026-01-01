
import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { Client, Stage } from '../../../types';

interface AnalyticsPanelProps {
  clients: Client[];
}

const COLORS = ['#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a'];

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ clients }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // FIX: Use specific state to gate the chart rendering based on real DOM measurements
  const [canRenderCharts, setCanRenderCharts] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // OBSERVER PATTERN: Monitors the container size in real-time.
  // Only allows charts to mount once the container has physical dimensions (>0).
  useEffect(() => {
    if (isCollapsed || !contentRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // We ensure both width and height are substantial before rendering
        if (entry.contentRect.width > 10 && entry.contentRect.height > 10) {
          setCanRenderCharts(true);
          observer.disconnect(); // Lock it in once ready
        }
      }
    });

    observer.observe(contentRef.current);

    return () => observer.disconnect();
  }, [isCollapsed]);

  const pipelineData = Object.values(Stage).map((stage) => {
    const stageStr = stage as string;
    const value = clients.filter(c => c.stage === stageStr).reduce((sum, c) => sum + (c.value || 0), 0);
    return { name: stageStr.split(' ')[0], fullName: stageStr, value };
  });

  const momentumData = [
    { name: 'Stalled (<30)', value: clients.filter(c => (c.momentumScore || 0) < 30).length, color: '#ef4444' },
    { name: 'Moving (30-70)', value: clients.filter(c => (c.momentumScore || 0) >= 30 && (c.momentumScore || 0) <= 70).length, color: '#f59e0b' },
    { name: 'Hot (>70)', value: clients.filter(c => (c.momentumScore || 0) > 70).length, color: '#10b981' },
  ];

  const totalPipeline = clients.reduce((acc, c) => acc + (c.value || 0), 0);
  const totalClients = clients.length;
  const avgDeal = totalClients > 0 ? totalPipeline / totalClients : 0;

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 mb-6 transition-all duration-300 overflow-hidden ${isCollapsed ? 'p-4' : 'p-6'}`}>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-slate-800">Performance Pulse</h2>
            {isCollapsed && (
                <div className="flex items-center gap-4 text-sm text-slate-500 fade-in">
                    <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200">Pipeline: <b>${(totalPipeline/1000).toFixed(0)}k</b></span>
                    <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200">Active: <b>{totalClients}</b></span>
                </div>
            )}
        </div>
        <div className="flex items-center gap-2">
            {!isCollapsed && <span className="text-xs text-slate-500 bg-slate-50 px-3 py-1 rounded-full border border-slate-200">Live Data</span>}
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
                    <p className="text-xl lg:text-2xl font-bold text-slate-900">{totalClients}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs lg:text-sm text-slate-500 mb-1">Avg Revenue / Lead</p>
                    <p className="text-xl lg:text-2xl font-bold text-slate-900">${Math.floor(avgDeal).toLocaleString()}</p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                    <p className="text-xs lg:text-sm text-emerald-700 mb-1">Actionable Opportunities</p>
                    <p className="text-xl lg:text-2xl font-bold text-emerald-900">{momentumData[2].value}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Pipeline Chart */}
                <div className="flex flex-col">
                    <h3 className="text-sm font-medium text-slate-600 mb-4 shrink-0">Pipeline Distribution</h3>
                    
                    <div className="w-full h-[250px] relative min-w-0 bg-white" style={{ minHeight: '250px' }}>
                        {canRenderCharts ? (
                            <ResponsiveContainer width="99%" height="100%">
                                <BarChart data={pipelineData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                    <YAxis hide />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} cursor={{fill: '#f1f5f9'}} />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>{pipelineData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Bar>
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
                                            <Pie data={momentumData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
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
