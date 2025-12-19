
import React, { useMemo, useState } from 'react';
import { Client } from '../../types';
import { toNum, fmtSGD, getAge } from '../../lib/helpers';
import { generateClientStrategy, runDeepRiskAnalysis, getMarketRealityCheck } from '../../lib/gemini';
import { 
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, Legend, AreaChart, Area, PieChart, Pie
} from 'recharts';

interface AnalyticsTabProps {
  clients: Client[];
}

const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ clients }) => {
  const [activeView, setActiveView] = useState<'market_map' | 'strategy' | 'deep_scan' | 'market_pulse'>('market_map');
  const [selectedClientForAI, setSelectedClientForAI] = useState<string>('');
  const [aiStrategy, setAiStrategy] = useState<any>(null);
  const [deepRiskReport, setDeepRiskReport] = useState<any>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [marketQuery, setMarketQuery] = useState('');
  const [marketResult, setMarketResult] = useState<{ text: string, sources?: any[] } | null>(null);

  const analyzedData = useMemo(() => {
    return clients.map(c => {
      const age = c.profile.dob ? getAge(c.profile.dob) : 30;
      const income = toNum(c.profile.monthlyIncome) || toNum(c.profile.grossSalary);
      const cash = toNum(c.cashflowState?.currentSavings, 0);
      const investments = toNum(c.investorState?.portfolioValue, 0);
      const deathCov = toNum(c.insuranceState?.currentDeath);
      return { id: c.id, name: c.profile.name, age, income, netWorth: cash + investments, hasInvestment: investments > 10000, hasInsurance: deathCov > 100000 };
    });
  }, [clients]);

  const handleGenerateStrategy = async () => {
    if (!selectedClientForAI) return;
    setLoadingAi(true);
    setAiStrategy(null);
    const client = clients.find(c => c.id === selectedClientForAI);
    if (!client) return;
    try {
      const metrics = analyzedData.find(d => d.id === client.id);
      const strategy = await generateClientStrategy(client.profile, metrics);
      setAiStrategy(strategy);
    } catch (e) {
      alert("Sproutly service update in progress.");
    } finally {
      setLoadingAi(false);
    }
  };

  const handleDeepScan = async () => {
    if (!selectedClientForAI) return;
    setLoadingAi(true);
    setDeepRiskReport(null);
    const client = clients.find(c => c.id === selectedClientForAI);
    if (!client) return;
    try {
      const report = await runDeepRiskAnalysis(client);
      setDeepRiskReport(report);
    } catch (e) {
      alert("Quantum analysis unavailable.");
    } finally {
      setLoadingAi(false);
    }
  };

  const handleMarketCheck = async () => {
    if (!marketQuery) return;
    setLoadingAi(true);
    setMarketResult(null);
    try {
      const result = await getMarketRealityCheck(marketQuery);
      setMarketResult(result as any);
    } catch (e) {
      alert("Signal lost.");
    } finally {
      setLoadingAi(false);
    }
  };

  return (
    <div className="p-5 space-y-6">
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-6 rounded-2xl shadow-xl border border-white/10 flex flex-col md:flex-row justify-between items-center">
        <div>
          <h2 className="text-2xl font-black m-0 flex items-center gap-3">
            <span className="text-3xl">🧠</span> Sproutly Intelligence
          </h2>
          <p className="text-indigo-200 text-xs font-mono mt-1 tracking-wider uppercase">
            Quantum Core Protocol • Immediate Insight Layer • Market Research
          </p>
        </div>
        <div className="flex bg-slate-700/50 p-1 rounded-lg backdrop-blur-sm mt-4 md:mt-0 overflow-x-auto max-w-full">
           {['market_map', 'strategy', 'deep_scan', 'market_pulse'].map(view => (
             <button key={view} onClick={() => setActiveView(view as any)} className={`px-4 py-2 rounded-md text-xs font-bold transition-all uppercase tracking-wide whitespace-nowrap ${activeView === view ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'}`}>
               {view.replace('_', ' ')}
             </button>
           ))}
        </div>
      </div>

      {activeView === 'market_pulse' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <div className="bg-white rounded-xl border border-gray-200 p-6 h-fit shadow-sm">
              <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2"><span>🌐</span> Market Pulse</h3>
              <div className="flex gap-2">
                 <input type="text" value={marketQuery} onChange={(e) => setMarketQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleMarketCheck()} placeholder="e.g. Current STI Index..." className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                 <button onClick={handleMarketCheck} disabled={!marketQuery || loadingAi} className="px-6 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 disabled:opacity-50">{loadingAi ? '...' : 'Search'}</button>
              </div>
           </div>
           <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm min-h-[300px]">
              {marketResult ? <div className="prose prose-sm text-gray-800 leading-relaxed">{marketResult.text}</div> : <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50"><span className="text-4xl mb-2">📡</span><span className="text-sm font-medium">Listening...</span></div>}
           </div>
        </div>
      )}

      {activeView === 'deep_scan' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 p-6 h-fit shadow-sm">
            <h3 className="font-bold text-gray-800 mb-2">Portfolio Stress Test</h3>
            <select className="w-full p-3 border border-gray-300 rounded-lg mb-4 text-sm bg-gray-50 outline-none" value={selectedClientForAI} onChange={(e) => setSelectedClientForAI(e.target.value)}>
              <option value="">-- Choose Profile --</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.profile.name}</option>)}
            </select>
            <button onClick={handleDeepScan} disabled={!selectedClientForAI || loadingAi} className="w-full py-4 bg-gradient-to-r from-amber-500 to-red-600 text-white font-bold rounded-lg shadow-lg">{loadingAi ? 'Analysing...' : 'RUN STRESS TEST'}</button>
          </div>
          <div className="lg:col-span-2">
            {deepRiskReport ? (
              <div className="bg-[#0f172a] rounded-xl border border-slate-700 shadow-2xl p-8 text-slate-300 font-mono">
                <h4 className="text-sm font-bold text-white uppercase tracking-widest mb-4">Risk Dossier</h4>
                <div className="text-sm text-white leading-relaxed p-4 border-l-2 border-amber-500 bg-slate-800/50 rounded-r-lg mb-6">{deepRiskReport.executive_summary}</div>
              </div>
            ) : (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 p-8 text-center"><p>{loadingAi ? 'Analysing scenarios...' : 'Select a profile to run analysis.'}</p></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsTab;
