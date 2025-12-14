
import React, { useMemo, useState } from 'react';
import { Client } from '../../types';
import { toNum, fmtSGD, getAge } from '../../lib/helpers';
import { computeCpf } from '../../lib/calculators';
import { generateClientStrategy, runDeepRiskAnalysis, getMarketRealityCheck } from '../../lib/gemini';
import { 
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, AreaChart, Area
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
  
  // Market Pulse State
  const [marketQuery, setMarketQuery] = useState('');
  const [marketResult, setMarketResult] = useState<{ text: string, sources?: any[] } | null>(null);

  // --- DATA PREPARATION ---
  const analyzedData = useMemo(() => {
    return clients.map(c => {
      const age = c.profile.dob ? getAge(c.profile.dob) : 30;
      const income = toNum(c.profile.monthlyIncome) || toNum(c.profile.grossSalary);
      
      const cash = toNum(c.cashflowState?.currentSavings, 0);
      const investments = toNum(c.investorState?.portfolioValue, 0);
      const netWorth = cash + investments;

      const insurance = c.insuranceState || { currentDeath: 0, currentCI: 0 };
      const deathCov = toNum(insurance.currentDeath);
      
      return {
        id: c.id,
        name: c.profile.name,
        age,
        income,
        netWorth,
        hasInvestment: investments > 10000,
        hasInsurance: deathCov > 100000,
        fullClientData: c // Keep ref for AI
      };
    });
  }, [clients]);

  // --- HELPER: Generate Gap Visualization Data ---
  const getGapData = (client: Client) => {
    const retirementAge = toNum(client.profile.retirementAge, 65);
    const lifeExpectancy = client.profile.gender === 'female' ? 86 : 82;
    const monthlyExpense = toNum(client.profile.customRetirementExpense) || (toNum(client.profile.takeHome) * 0.7);
    
    // Simple projection
    const data = [];
    let savings = toNum(client.cashflowState?.currentSavings, 0) + toNum(client.investorState?.portfolioValue, 0);
    const growthRate = 0.05; // 5% blended
    const inflation = 0.03;
    
    const currentAge = client.profile.dob ? getAge(client.profile.dob) : 30;
    
    // Calculate Annual Savings
    let annualSavings = 0;
    
    if (client.profile.monthlyInvestmentAmount && toNum(client.profile.monthlyInvestmentAmount) > 0) {
       annualSavings = toNum(client.profile.monthlyInvestmentAmount) * 12;
    } else {
       const gross = toNum(client.profile.monthlyIncome) || toNum(client.profile.grossSalary);
       let takeHome = toNum(client.profile.takeHome);
       if (!takeHome && gross > 0) {
          const cpf = computeCpf(gross, currentAge);
          takeHome = cpf.takeHome;
       }
       const expenseSum = Object.values(client.expenses || {}).reduce((sum, v) => sum + toNum(v), 0);
       const customExpenseSum = (client.customExpenses || []).reduce((sum, exp) => sum + toNum(exp.amount), 0);
       const totalExpenses = expenseSum + customExpenseSum;
       const monthlySavings = Math.max(0, (takeHome || 0) - totalExpenses);
       annualSavings = monthlySavings * 12;
    }
    
    if (annualSavings === 0) annualSavings = 12000; 

    for(let age = currentAge; age <= lifeExpectancy; age++) {
       const isRetired = age >= retirementAge;
       const expenses = isRetired ? monthlyExpense * 12 * Math.pow(1+inflation, age - currentAge) : 0;
       
       if (!isRetired) {
          savings = (savings + annualSavings) * (1 + growthRate);
       } else {
          savings = (savings - expenses) * (1 + growthRate);
       }
       
       data.push({
         age,
         savings: Math.max(0, Math.round(savings)),
         shortfall: savings < 0 ? Math.abs(Math.round(savings)) : 0
       });
    }
    return data;
  };

  const handleGenerateStrategy = async () => {
    if (!selectedClientForAI) return;
    setLoadingAi(true);
    setAiStrategy(null);
    const client = clients.find(c => c.id === selectedClientForAI);
    if (!client) return;
    try {
      const metrics = analyzedData.find(d => d.id === client.id);
      const strategy = await generateClientStrategy(client.profile, metrics);
      setAiStrategy({ ...strategy, chartData: getGapData(client) });
    } catch (e) {
      alert("AI Service unavailable. Check API Key.");
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
      alert("AI Thinking Mode unavailable. Check API Key.");
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
      alert("Search Grounding unavailable. Check API Key.");
    } finally {
      setLoadingAi(false);
    }
  };

  const matrixData = useMemo(() => {
    const matrix = [
      { name: 'Only Insurance', value: 0, color: '#ef4444' }, 
      { name: 'Only Investment', value: 0, color: '#f59e0b' },
      { name: 'Fully Covered', value: 0, color: '#10b981' }, 
      { name: 'Untapped', value: 0, color: '#6b7280' },
    ];
    analyzedData.forEach(c => {
      if (c.hasInsurance && !c.hasInvestment) matrix[0].value++;
      else if (!c.hasInsurance && c.hasInvestment) matrix[1].value++;
      else if (c.hasInsurance && c.hasInvestment) matrix[2].value++;
      else matrix[3].value++;
    });
    return matrix.filter(m => m.value > 0);
  }, [analyzedData]);

  if (clients.length === 0) return <div className="p-10 text-center">Add clients to activate Intelligence.</div>;

  return (
    <div className="p-5 space-y-6">
      {/* HEADER */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-6 rounded-2xl shadow-xl border border-white/10 flex flex-col md:flex-row justify-between items-center">
        <div>
          <h2 className="text-2xl font-black m-0 flex items-center gap-3">
            <span className="text-3xl">🧠</span> Quantum Intelligence
          </h2>
          <p className="text-indigo-200 text-xs font-mono mt-1 tracking-wider">
            GEMINI PRO THINKING • FLASH LITE SPEED • SEARCH GROUNDING
          </p>
        </div>
        <div className="flex bg-slate-700/50 p-1 rounded-lg backdrop-blur-sm mt-4 md:mt-0 overflow-x-auto max-w-full">
           {['market_map', 'strategy', 'deep_scan', 'market_pulse'].map(view => (
             <button 
               key={view}
               onClick={() => setActiveView(view as any)}
               className={`px-4 py-2 rounded-md text-xs font-bold transition-all uppercase tracking-wide whitespace-nowrap ${activeView === view ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'}`}
             >
               {view.replace('_', ' ')}
             </button>
           ))}
        </div>
      </div>

      {activeView === 'market_pulse' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <div className="bg-white rounded-xl border border-gray-200 p-6 h-fit shadow-sm">
              <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
                 <span>🌐</span> Live Market Pulse
              </h3>
              <p className="text-xs text-gray-500 mb-6">
                 Query real-time financial data using Google Search Grounding.
              </p>
              <div className="flex gap-2">
                 <input 
                    type="text" 
                    value={marketQuery}
                    onChange={(e) => setMarketQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleMarketCheck()}
                    placeholder="e.g. Current STI Index, US Fed Rate..."
                    className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                 />
                 <button 
                    onClick={handleMarketCheck}
                    disabled={!marketQuery || loadingAi}
                    className="px-6 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 disabled:opacity-50"
                 >
                    {loadingAi ? '...' : 'Search'}
                 </button>
              </div>
              
              <div className="mt-4 flex flex-wrap gap-2">
                 {['STI Index Today', 'SG Govt Bond Yields', 'USD/SGD Rate', 'CPF Interest Rates'].map(q => (
                    <button key={q} onClick={() => { setMarketQuery(q); handleMarketCheck(); }} className="px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded-full hover:bg-gray-200">
                       {q}
                    </button>
                 ))}
              </div>
           </div>

           <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm min-h-[300px]">
              {marketResult ? (
                 <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Live Intelligence</h4>
                    <div className="prose prose-sm text-gray-800 leading-relaxed mb-6">
                       {marketResult.text}
                    </div>
                    {marketResult.sources && marketResult.sources.length > 0 && (
                       <div className="pt-4 border-t border-gray-100">
                          <h5 className="text-[10px] font-bold text-gray-400 uppercase mb-2">Sources</h5>
                          <ul className="space-y-1">
                             {marketResult.sources.map((s: any, i: number) => (
                                <li key={i} className="text-xs truncate text-indigo-600 hover:underline">
                                   <a href={s.web?.uri} target="_blank" rel="noreferrer">
                                      {s.web?.title || s.web?.uri}
                                   </a>
                                </li>
                             ))}
                          </ul>
                       </div>
                    )}
                 </div>
              ) : (
                 <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50">
                    <span className="text-4xl mb-2">📡</span>
                    <span className="text-sm font-medium">Waiting for signal...</span>
                 </div>
              )}
           </div>
        </div>
      )}

      {activeView === 'deep_scan' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Selector Panel */}
          <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 p-6 h-fit shadow-sm">
            <h3 className="font-bold text-gray-800 mb-2">Deep Risk Simulator</h3>
            <p className="text-xs text-gray-500 mb-6 leading-relaxed">
              Uses <strong>Gemini 3.0 Pro</strong> (Thinking Mode) to simulate 10,000+ economic scenarios against the specific client's portfolio correlations.
            </p>
            <select 
              className="w-full p-3 border border-gray-300 rounded-lg mb-4 text-sm bg-gray-50 focus:ring-2 focus:ring-amber-500 outline-none"
              value={selectedClientForAI}
              onChange={(e) => setSelectedClientForAI(e.target.value)}
            >
              <option value="">-- Choose Client Profile --</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.profile.name}</option>)}
            </select>
            <button
              onClick={handleDeepScan}
              disabled={!selectedClientForAI || loadingAi}
              className="w-full py-4 bg-gradient-to-r from-amber-500 to-red-600 text-white font-bold rounded-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:translate-y-0"
            >
              {loadingAi ? '🤔 Analyzing Macro-Economics...' : 'RUN STRESS TEST'}
            </button>
          </div>

          {/* Output Panel: GOD MODE HUD DESIGN */}
          <div className="lg:col-span-2">
            {deepRiskReport ? (
              <div className="bg-[#0f172a] rounded-xl border border-slate-700 shadow-2xl overflow-hidden animate-fade-in text-slate-300 font-mono">
                {/* HUD Header */}
                <div className="bg-slate-900 p-4 border-b border-slate-800 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                     <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_#ef4444]"></span>
                     <h3 className="text-sm font-bold text-white uppercase tracking-widest">Global Risk Dossier</h3>
                  </div>
                  <span className="text-[9px] bg-slate-800 border border-slate-700 text-emerald-400 px-2 py-1 rounded font-bold">
                    SECURITY: TOP SECRET
                  </span>
                </div>
                
                <div className="p-8 space-y-8 relative">
                  {/* Grid Lines Overlay */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>

                  {/* Executive Summary */}
                  <div className="relative z-10">
                     <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Executive Assessment</h4>
                     <div className="text-sm text-white leading-relaxed p-4 border-l-2 border-amber-500 bg-slate-800/50 rounded-r-lg">
                        "{deepRiskReport.executive_summary}"
                     </div>
                  </div>

                  {/* Hidden Risks */}
                  <div className="relative z-10">
                    <h4 className="font-bold text-red-400 mb-4 text-[10px] uppercase flex items-center gap-2 tracking-widest">
                       <span>⚠️</span> Critical Vulnerabilities Detected
                    </h4>
                    <div className="grid gap-3">
                      {deepRiskReport.hidden_risks?.map((risk: any, i: number) => (
                        <div key={i} className="flex justify-between items-start p-4 bg-red-900/10 rounded border border-red-900/30 hover:bg-red-900/20 transition-colors">
                          <div>
                            <div className="font-bold text-red-400 text-sm mb-1">{risk.risk}</div>
                            <div className="text-xs text-red-200/70 leading-relaxed">{risk.impact}</div>
                          </div>
                          <div className="text-[9px] font-bold bg-red-950 px-2 py-1 rounded border border-red-800 text-red-500 uppercase tracking-wider">
                            {risk.probability} Prob.
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Scenarios */}
                  <div className="relative z-10">
                    <h4 className="font-bold text-indigo-400 mb-4 text-[10px] uppercase flex items-center gap-2 tracking-widest">
                       <span>📉</span> Black Swan Simulation Results
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {deepRiskReport.scenario_simulations?.map((sim: any, i: number) => (
                        <div key={i} className="p-4 border border-slate-700 rounded bg-slate-800/50 hover:bg-slate-800 transition-all group">
                          <div className="font-bold text-slate-500 text-[9px] uppercase mb-2 group-hover:text-indigo-400 transition-colors">{sim.scenario_name}</div>
                          <div className="text-xl font-black text-white mb-2 tracking-tight">{sim.portfolio_impact}</div>
                          <div className="text-[10px] text-slate-400 leading-tight">{sim.outcome_description}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            ) : (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 p-8 text-center">
                <div className="text-4xl mb-3 opacity-20">📊</div>
                <p>{loadingAi ? 'Quantum Core is processing 10,000 simulations...' : 'Select a client to run a deep risk analysis.'}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeView === 'strategy' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Selector Panel */}
          <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 p-6 h-fit shadow-sm">
            <h3 className="font-bold text-gray-800 mb-2">Deal Room Strategy</h3>
            <p className="text-xs text-gray-500 mb-6">Generate a hyper-personalized closing script based on client psychology and financial gaps.</p>
            <select 
              className="w-full p-3 border border-gray-300 rounded-lg mb-4 text-sm bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
              value={selectedClientForAI}
              onChange={(e) => setSelectedClientForAI(e.target.value)}
            >
              <option value="">-- Choose Client --</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.profile.name}</option>)}
            </select>
            <button
              onClick={handleGenerateStrategy}
              disabled={!selectedClientForAI || loadingAi}
              className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:translate-y-0"
            >
              {loadingAi ? '✨ Analyzing Profile...' : 'GENERATE SCRIPT'}
            </button>
          </div>

          {/* Output Panel */}
          <div className="lg:col-span-2">
            {aiStrategy ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-2xl overflow-hidden">
                <div className="bg-indigo-50 p-4 border-b border-indigo-100 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-indigo-900 uppercase tracking-widest">Strategy Blueprint</h3>
                  <div className="text-[10px] text-indigo-400 font-mono">ID: {Math.floor(Math.random()*100000)}</div>
                </div>
                <div className="p-8 space-y-8">
                  
                  {/* The Hook */}
                  <div className="bg-gradient-to-r from-red-50 to-white p-5 rounded-lg border-l-4 border-red-500">
                    <div className="text-[10px] font-bold text-red-800 uppercase tracking-widest mb-2">The Emotional Hook</div>
                    <div className="text-xl font-medium text-gray-900 font-serif leading-relaxed">"{aiStrategy.hook}"</div>
                  </div>

                  {/* VISUAL GAP (The Killer Feature) */}
                  {aiStrategy.chartData && (
                    <div className="border border-gray-100 rounded-xl p-6 bg-white shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)]">
                       <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6">Freedom Gap Visualizer</h4>
                       <div className="h-[250px] w-full">
                          <ResponsiveContainer>
                             <AreaChart data={aiStrategy.chartData}>
                                <defs>
                                  <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="age" fontSize={10} tickLine={false} axisLine={false} />
                                <YAxis hide />
                                <Tooltip 
                                  formatter={(v) => fmtSGD(v)}
                                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                                <Area type="monotone" dataKey="savings" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorSavings)" />
                             </AreaChart>
                          </ResponsiveContainer>
                       </div>
                       <div className="text-center text-xs text-gray-400 mt-4 font-medium">
                          If the curve hits zero, they enter the <span className="text-red-500 font-bold">Dependency Zone</span>.
                       </div>
                    </div>
                  )}

                  {/* Analysis & Pitch */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Gap Reality</div>
                      <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-4 rounded-lg border border-gray-200">
                        {aiStrategy.gap_analysis}
                      </p>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">The Solution Pitch</div>
                      <p className="text-sm text-gray-700 leading-relaxed bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                        {aiStrategy.solution_pitch}
                      </p>
                    </div>
                  </div>

                  {/* Urgency */}
                  <div className="bg-emerald-900 text-white p-5 rounded-lg flex items-start gap-4 shadow-lg">
                    <div className="text-3xl">⏰</div>
                    <div>
                      <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Cost of Delay</div>
                      <div className="text-sm font-medium leading-relaxed opacity-90">{aiStrategy.urgency_driver}</div>
                    </div>
                  </div>

                </div>
              </div>
            ) : (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 p-8 text-center">
                <div className="text-4xl mb-3 opacity-20">📝</div>
                <p>Select a client to generate a sales strategy.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeView === 'market_map' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
           <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h4 className="font-bold text-gray-800 mb-6 text-sm uppercase tracking-wider">Client Portfolio Distribution</h4>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                     <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                     <XAxis type="number" dataKey="income" name="Income" unit="$" fontSize={10} tickLine={false} axisLine={false} />
                     <YAxis type="number" dataKey="netWorth" name="Net Worth" unit="$" fontSize={10} tickLine={false} axisLine={false} />
                     <ZAxis type="number" dataKey="age" range={[100, 500]} name="Age" />
                     <Tooltip 
                        cursor={{ strokeDasharray: '3 3' }} 
                        formatter={(value) => fmtSGD(value as number)} 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                     />
                     <Scatter name="Clients" data={analyzedData} fill="#8884d8">
                        {analyzedData.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={entry.hasInsurance && entry.hasInvestment ? '#10b981' : (entry.hasInsurance ? '#ef4444' : '#f59e0b')} />
                        ))}
                     </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 mt-4 text-[10px] text-gray-500 font-bold uppercase">
                 <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Covered</div>
                 <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500"></div> Investment Only</div>
                 <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div> Insurance Only</div>
              </div>
           </div>
           
           <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h4 className="font-bold text-gray-800 mb-6 text-sm uppercase tracking-wider">Revenue Opportunities</h4>
              <div className="h-[350px]">
                <ResponsiveContainer>
                  <PieChart>
                     <Pie data={matrixData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5}>
                        {matrixData.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                        ))}
                     </Pie>
                     <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                     <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsTab;
