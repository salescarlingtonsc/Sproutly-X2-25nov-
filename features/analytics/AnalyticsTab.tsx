import React, { useMemo, useState } from 'react';
import { Client } from '../../types';
import { toNum, fmtSGD, getAge } from '../../lib/helpers';
import { getMarketRealityCheck, runQuantumDeepDive } from '../../lib/gemini';
import { 
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, Legend, AreaChart, Area
} from 'recharts';

interface AnalyticsTabProps {
  clients: Client[];
}

const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ clients }) => {
  const [activeView, setActiveView] = useState<'market_map' | 'quantum' | 'market_pulse'>('market_map');
  const [selectedClientForAI, setSelectedClientForAI] = useState<string>('');
  const [quantumReport, setQuantumReport] = useState<any>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [marketQuery, setMarketQuery] = useState('');
  const [marketResult, setMarketResult] = useState<{ text: string, sources?: any[] } | null>(null);

  const analyzedData = useMemo(() => {
    return clients.map(c => {
      const age = c.profile?.dob ? getAge(c.profile.dob) : 30;
      const income = toNum(c.profile?.monthlyIncome) || toNum(c.profile?.grossSalary);
      const cash = toNum(c.cashflowState?.currentSavings, 0);
      const investments = toNum(c.investorState?.portfolioValue, 0);
      const deathCov = (c.insuranceState?.policies || []).reduce((acc, p) => acc + toNum(p.deathCoverage), 0);
      return { id: c.id, name: c.profile?.name || c.name || 'Unnamed', age, income, netWorth: cash + investments, hasInvestment: investments > 10000, hasInsurance: deathCov > 100000 };
    });
  }, [clients]);

  const handleQuantumDeepDive = async () => {
    if (!selectedClientForAI) return;
    setLoadingAi(true);
    setQuantumReport(null);
    const client = clients.find(c => c.id === selectedClientForAI);
    if (!client) return;
    try {
      const report = await runQuantumDeepDive(client);
      setQuantumReport(report);
    } catch (e) {
      alert("Quantum Reasoning Core is currently processing high volume. Please wait 60s.");
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
    <div className="p-6 space-y-10">
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-indigo-900 text-white p-10 rounded-[3rem] shadow-2xl border border-white/5 flex flex-col md:flex-row justify-between items-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="relative z-10">
          <h2 className="text-4xl font-black m-0 tracking-tighter flex items-center gap-4">
             Sproutly Intelligence
          </h2>
          <p className="text-indigo-300 text-[10px] font-black mt-3 tracking-[0.3em] uppercase opacity-70">
            Powered by Gemini 3 Pro • Quantum Reasoning Core
          </p>
        </div>
        <div className="flex bg-black/20 p-2 rounded-[2rem] backdrop-blur-xl mt-8 md:mt-0 border border-white/10 shadow-inner">
           {['market_map', 'quantum', 'market_pulse'].map(view => (
             <button 
                key={view} onClick={() => setActiveView(view as any)} 
                className={`px-8 py-3 rounded-[1.5rem] text-[10px] font-black transition-all uppercase tracking-widest ${activeView === view ? 'bg-white text-slate-900 shadow-2xl scale-105' : 'text-indigo-200/50 hover:text-white'}`}
             >
               {view === 'quantum' ? 'Quantum Audit' : view.replace('_', ' ')}
             </button>
           ))}
        </div>
      </div>

      {activeView === 'quantum' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
          <div className="lg:col-span-4 space-y-8">
            <div className="bg-white rounded-[2.5rem] border border-slate-100 p-10 shadow-sm">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8">Auditor Setup</h3>
              <div className="space-y-6">
                <div>
                   <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest block mb-3 px-1">Selected Target Asset</label>
                   <select 
                      className="w-full p-5 bg-slate-50 border-2 border-transparent rounded-2xl text-xs font-bold bg-gray-50 outline-none focus:bg-white focus:border-indigo-500 transition-all appearance-none" 
                      value={selectedClientForAI} onChange={(e) => setSelectedClientForAI(e.target.value)}
                   >
                     <option value="">Choose Dossier...</option>
                     {clients.map(c => <option key={c.id} value={c.id}>{c.profile?.name || c.name || 'Unnamed'}</option>)}
                   </select>
                </div>
                <button 
                   onClick={handleQuantumDeepDive} 
                   disabled={!selectedClientForAI || loadingAi} 
                   className="w-full py-6 bg-slate-900 text-white font-black text-[10px] uppercase tracking-[0.2em] rounded-2xl shadow-2xl hover:bg-indigo-950 disabled:opacity-20 transition-all active:scale-[0.97]"
                >
                  {loadingAi ? 'Initiating Logic Chain...' : 'Execute Deep Reasoning'}
                </button>
              </div>
            </div>

            {quantumReport && (
               <div className="bg-emerald-600 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-[60px] group-hover:scale-125 transition-transform duration-1000"></div>
                  <div className="relative z-10">
                     <div className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-3">Est. Structural Efficiency Gain</div>
                     <div className="text-5xl font-black tracking-tighter">{fmtSGD(quantumReport.projected_impact_sgd || 0).split('.')[0]}</div>
                     <p className="text-xs text-emerald-100 mt-6 font-medium leading-relaxed opacity-90">Value of closing identified gaps over a 5-year simulation.</p>
                  </div>
               </div>
            )}
          </div>

          <div className="lg:col-span-8">
            {loadingAi ? (
               <div className="bg-slate-900 rounded-[3rem] p-20 text-center border border-white/5 shadow-2xl h-full flex flex-col items-center justify-center space-y-8">
                  <div className="relative">
                    <div className="w-24 h-24 border-[6px] border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center text-indigo-400 font-black text-xs animate-pulse">32K</div>
                  </div>
                  <div className="space-y-4">
                     <p className="text-white font-black text-xl uppercase tracking-[0.2em]">Quantum Thinking Active</p>
                     <p className="text-indigo-400 font-mono text-[10px] max-w-sm mx-auto leading-relaxed uppercase opacity-60">Modeling multi-generational liability matching and risk decay...</p>
                  </div>
               </div>
            ) : quantumReport ? (
              <div className="space-y-8 animate-in fade-in duration-1000">
                <div className="bg-white rounded-[3rem] border border-slate-100 p-12 shadow-sm">
                   <h4 className="text-[9px] font-black text-indigo-600 uppercase tracking-[0.4em] mb-6">Quantum Assessment</h4>
                   <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">{quantumReport.executive_summary}</p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                   {quantumReport.critical_gaps?.map((gap: any, idx: number) => (
                      <div key={idx} className="bg-rose-50 p-6 rounded-3xl border border-rose-100 flex gap-4 items-start">
                         <div className="text-2xl mt-1">⚠️</div>
                         <div>
                            <div className="flex items-center gap-3 mb-2">
                               <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest bg-rose-100 px-2 py-1 rounded">{gap.area}</span>
                               <span className="text-[10px] font-bold text-rose-400 uppercase">{gap.severity} Severity</span>
                            </div>
                            <p className="text-sm font-bold text-rose-900 mb-1">{gap.observation}</p>
                            <p className="text-xs text-rose-700/80 leading-relaxed italic">{gap.reasoning_path}</p>
                         </div>
                      </div>
                   ))}
                </div>

                <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-xl">
                   <h4 className="text-[9px] font-black text-indigo-300 uppercase tracking-[0.4em] mb-8">Strategic Protocol</h4>
                   <ul className="space-y-4">
                      {quantumReport.action_plan?.map((action: string, i: number) => (
                         <li key={i} className="flex gap-4 items-start">
                            <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">{i+1}</div>
                            <span className="text-sm font-medium text-slate-300">{action}</span>
                         </li>
                      ))}
                   </ul>
                </div>
              </div>
            ) : (
               <div className="h-full flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-[3rem]">
                  <p className="text-xs font-bold uppercase tracking-widest">Select a client to initiate scan</p>
               </div>
            )}
          </div>
        </div>
      )}

      {activeView === 'market_map' && (
         <div className="text-center py-20 bg-white rounded-[3rem] border border-slate-100">
            <h3 className="text-slate-400 font-bold mb-4">Market Map Visualization</h3>
            <p className="text-xs text-slate-400">Coming in next update.</p>
         </div>
      )}

      {activeView === 'market_pulse' && (
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm">
               <h3 className="font-bold text-slate-800 mb-4">Global Signal Check</h3>
               <div className="flex gap-2 mb-4">
                  <input value={marketQuery} onChange={e => setMarketQuery(e.target.value)} placeholder="e.g. Impact of US Fed Rates on SG REITs" className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none" />
                  <button onClick={handleMarketCheck} disabled={loadingAi} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold text-xs hover:bg-slate-800">Analyze</button>
               </div>
               {marketResult && (
                  <div className="mt-6 prose prose-sm text-slate-600">
                     <p className="whitespace-pre-wrap">{marketResult.text}</p>
                     {marketResult.sources && (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                           <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Sources</p>
                           <div className="flex flex-wrap gap-2">
                              {marketResult.sources.map((s: any, i: number) => (
                                 <a key={i} href={s.web?.uri} target="_blank" rel="noreferrer" className="text-[10px] bg-slate-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-50 border border-slate-100 truncate max-w-[200px] block">
                                    {s.web?.title}
                                 </a>
                              ))}
                           </div>
                        </div>
                     )}
                  </div>
               )}
            </div>
         </div>
      )}
    </div>
  );
};

export default AnalyticsTab;