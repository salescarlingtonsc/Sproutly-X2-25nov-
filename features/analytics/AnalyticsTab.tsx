
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
      const age = c.profile.dob ? getAge(c.profile.dob) : 30;
      const income = toNum(c.profile.monthlyIncome) || toNum(c.profile.grossSalary);
      const cash = toNum(c.cashflowState?.currentSavings, 0);
      const investments = toNum(c.investorState?.portfolioValue, 0);
      const deathCov = (c.insuranceState?.policies || []).reduce((acc, p) => acc + toNum(p.deathCoverage), 0);
      return { id: c.id, name: c.profile.name, age, income, netWorth: cash + investments, hasInvestment: investments > 10000, hasInsurance: deathCov > 100000 };
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
                     {clients.map(c => <option key={c.id} value={c.id}>{c.profile.name}</option>)}
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
                   <h4 className="text-[9px] font-black text-indigo-600 uppercase tracking-[0.4em] mb-6">Strategic Audit Verdict</h4>
                   <p className="text-2xl font-bold text-slate-900 leading-snug mb-12">{quantumReport.executive_summary}</p>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      <div className="space-y-6">
                         <h5 className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Recursive Gap Detection</h5>
                         {quantumReport.critical_gaps.map((gap: any, i: number) => (
                            <div key={i} className="p-6 rounded-3xl bg-slate-50 border border-slate-100 group hover:border-indigo-500/30 transition-all hover:shadow-lg">
                               <div className="flex justify-between items-center mb-3">
                                  <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">{gap.area}</span>
                                  <span className={`text-[8px] font-black px-2 py-1 rounded-lg ${gap.severity === 'CRITICAL' ? 'bg-red-500 text-white' : 'bg-amber-100 text-amber-700'}`}>{gap.severity}</span>
                               </div>
                               <p className="text-xs text-slate-500 leading-relaxed font-medium">{gap.observation}</p>
                               <div className="mt-4 pt-4 border-t border-slate-200 hidden group-hover:block animate-in slide-in-from-top-2">
                                  <p className="text-[9px] font-black text-indigo-500 uppercase mb-2">Reasoning Protocol:</p>
                                  <p className="text-[10px] text-slate-400 leading-relaxed italic">{gap.reasoning_path}</p>
                               </div>
                            </div>
                         ))}
                      </div>
                      <div className="space-y-6">
                         <h5 className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Remediation Action Plan</h5>
                         <div className="bg-slate-900 rounded-[2.5rem] p-10 text-indigo-100 space-y-6 shadow-2xl">
                            {quantumReport.action_plan.map((action: string, i: number) => (
                               <div key={i} className="flex gap-6">
                                  <span className="text-indigo-500 font-black text-lg">0{i+1}</span>
                                  <p className="text-xs font-bold leading-relaxed">{action}</p>
                               </div>
                            ))}
                         </div>
                      </div>
                   </div>
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[600px] flex flex-col items-center justify-center bg-slate-50/50 rounded-[3rem] border-4 border-dashed border-slate-100 text-slate-300 p-20 text-center">
                 <div className="text-8xl mb-8 grayscale opacity-10 filter blur-[1px]">🧠</div>
                 <h3 className="text-2xl font-black text-slate-400 tracking-tight">Intelligence Ready</h3>
                 <p className="text-sm font-medium text-slate-400 max-w-sm mt-4 leading-relaxed">Select a client dossier and initiate the Quantum reasoning engine to uncover deep strategic gaps.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeView === 'market_pulse' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 animate-in fade-in duration-700">
           <div className="md:col-span-4">
              <div className="bg-white rounded-[2.5rem] border border-slate-100 p-10 shadow-sm">
                 <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8">Grounding Sensor</h3>
                 <div className="space-y-6">
                    <input 
                       type="text" value={marketQuery} 
                       onChange={(e) => setMarketQuery(e.target.value)} 
                       onKeyDown={(e) => e.key === 'Enter' && handleMarketCheck()} 
                       placeholder="e.g. Current STI benchmark 2025" 
                       className="w-full p-5 bg-slate-50 border-2 border-transparent rounded-2xl text-xs font-bold focus:bg-white focus:border-emerald-500 outline-none transition-all placeholder-slate-300" 
                    />
                    <button onClick={handleMarketCheck} disabled={!marketQuery || loadingAi} className="w-full py-5 bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-2xl hover:bg-emerald-700 disabled:opacity-30 transition-all">
                       {loadingAi ? 'Scanning Data Signals...' : 'Sync Market Intelligence'}
                    </button>
                 </div>
              </div>
           </div>
           <div className="md:col-span-8">
              <div className="bg-white rounded-[3rem] border border-slate-100 p-12 shadow-sm min-h-[500px]">
                 {marketResult ? (
                    <div className="prose prose-slate max-w-none">
                       <div className="text-slate-700 font-medium text-lg leading-relaxed whitespace-pre-line">{marketResult.text}</div>
                       {marketResult.sources && (
                          <div className="mt-12 pt-12 border-t border-slate-50">
                             <h5 className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-6">Verified Grounding Nodes</h5>
                             <div className="flex flex-wrap gap-3">
                                {marketResult.sources.map((s: any, idx: number) => (
                                   s.web && <a key={idx} href={s.web.uri} target="_blank" rel="noreferrer" className="px-5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-bold text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm">{s.web.title || 'Data Source'}</a>
                                ))}
                             </div>
                          </div>
                       )}
                    </div>
                 ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-200 p-20">
                       <span className="text-8xl mb-6">📡</span>
                       <p className="text-[10px] font-black uppercase tracking-[0.4em]">Awaiting Uplink</p>
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {activeView === 'market_map' && analyzedData.length > 0 && (
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 animate-in fade-in duration-700">
            <div className="bg-white rounded-[3rem] border border-slate-100 p-10 shadow-sm">
               <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-10 px-2">Asset Topography</h3>
               <div className="h-[450px]">
                  <ResponsiveContainer>
                     <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
                        <XAxis type="number" dataKey="age" name="Age" unit="y" fontSize={9} axisLine={false} tickLine={false} tick={{fill: '#cbd5e1'}} />
                        <YAxis type="number" dataKey="netWorth" name="Net Worth" unit="$" fontSize={9} axisLine={false} tickLine={false} tick={{fill: '#cbd5e1'}} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                        <ZAxis type="number" dataKey="income" range={[100, 1000]} name="Income" />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)' }} />
                        <Scatter name="Clients" data={analyzedData} fill="#4f46e5">
                           {analyzedData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.hasInvestment ? '#10b981' : '#f43f5e'} />
                           ))}
                        </Scatter>
                        <Legend iconType="circle" />
                     </ScatterChart>
                  </ResponsiveContainer>
               </div>
            </div>

            <div className="bg-white rounded-[3rem] border border-slate-100 p-10 shadow-sm">
               <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-10 px-2">Income Replacement Liability</h3>
               <div className="h-[450px]">
                  <ResponsiveContainer>
                     <AreaChart data={analyzedData.sort((a,b) => a.age - b.age)}>
                        <defs>
                           <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                           </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
                        <XAxis dataKey="name" fontSize={8} axisLine={false} tickLine={false} tick={{fill: '#cbd5e1'}} />
                        <YAxis fontSize={9} axisLine={false} tickLine={false} tick={{fill: '#cbd5e1'}} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                        <Tooltip contentStyle={{ borderRadius: '20px', border: 'none' }} />
                        <Area type="monotone" dataKey="income" stackId="1" stroke="#6366f1" fill="url(#colorIncome)" strokeWidth={3} name="Current Monthly" />
                     </AreaChart>
                  </ResponsiveContainer>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default AnalyticsTab;
