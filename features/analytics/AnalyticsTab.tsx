
import React, { useMemo, useState } from 'react';
import { Client } from '../../types';
import { toNum, fmtSGD, getAge } from '../../lib/helpers';
import { computeCpf } from '../../lib/calculators';
import { generateClientStrategy, runDeepRiskAnalysis } from '../../lib/gemini';
import { 
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts';

interface AnalyticsTabProps {
  clients: Client[];
}

const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ clients }) => {
  const [activeView, setActiveView] = useState<'market_map' | 'strategy' | 'deep_scan'>('market_map');
  const [selectedClientForAI, setSelectedClientForAI] = useState<string>('');
  const [aiStrategy, setAiStrategy] = useState<any>(null);
  const [deepRiskReport, setDeepRiskReport] = useState<any>(null);
  const [loadingAi, setLoadingAi] = useState(false);

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
    
    // 1. Check if user explicitly set monthly investment
    if (client.profile.monthlyInvestmentAmount && toNum(client.profile.monthlyInvestmentAmount) > 0) {
       annualSavings = toNum(client.profile.monthlyInvestmentAmount) * 12;
    } else {
       // 2. Calculate from Income - Expenses
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
    
    // Fallback if 0
    if (annualSavings === 0) annualSavings = 12000; // Assume $1k/mo default for visualization if no data

    for(let age = currentAge; age <= lifeExpectancy; age++) {
       const isRetired = age >= retirementAge;
       const expenses = isRetired ? monthlyExpense * 12 * Math.pow(1+inflation, age - currentAge) : 0;
       
       if (!isRetired) {
          // Accumulation
          savings = (savings + annualSavings) * (1 + growthRate);
       } else {
          // Decumulation
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

  // --- AI HANDLERS ---
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
      <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg flex flex-col md:flex-row justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold m-0 flex items-center gap-2">
            <span>🧠</span> Quantum AI Intelligence
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Gemini 3 Pro (Thinking) & Gemini 2.5 (Flash) Integration.
          </p>
        </div>
        <div className="flex gap-2 mt-4 md:mt-0">
           <button 
             onClick={() => setActiveView('market_map')}
             className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeView === 'market_map' ? 'bg-indigo-600' : 'bg-slate-800 text-slate-400'}`}
           >
             Map
           </button>
           <button 
             onClick={() => setActiveView('strategy')}
             className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeView === 'strategy' ? 'bg-emerald-600' : 'bg-slate-800 text-slate-400'}`}
           >
             Deal Room
           </button>
           <button 
             onClick={() => setActiveView('deep_scan')}
             className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeView === 'deep_scan' ? 'bg-amber-600' : 'bg-slate-800 text-slate-400'}`}
           >
             ⚡ Deep Risk
           </button>
        </div>
      </div>

      {activeView === 'deep_scan' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Selector Panel */}
          <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 p-5 h-fit">
            <h3 className="font-bold text-gray-800 mb-4">Run Simulation</h3>
            <div className="text-xs text-gray-500 mb-4">
              Uses <strong>Gemini 3.0 Pro</strong> (Thinking Mode) to simulate economic disasters against specific client portfolios.
            </div>
            <select 
              className="w-full p-2 border rounded-lg mb-4"
              value={selectedClientForAI}
              onChange={(e) => setSelectedClientForAI(e.target.value)}
            >
              <option value="">-- Choose Client --</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.profile.name}</option>)}
            </select>
            <button
              onClick={handleDeepScan}
              disabled={!selectedClientForAI || loadingAi}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-red-600 text-white font-bold rounded-lg shadow-lg hover:opacity-90 disabled:opacity-50"
            >
              {loadingAi ? '🤔 Thinking (Deep Scan)...' : 'Run Risk Simulation'}
            </button>
          </div>

          {/* Output Panel */}
          <div className="lg:col-span-2">
            {deepRiskReport ? (
              <div className="bg-white rounded-xl border-2 border-amber-100 shadow-xl overflow-hidden animate-fade-in">
                <div className="bg-amber-50 p-4 border-b border-amber-100 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-amber-900">🛡️ Vulnerability Report</h3>
                  <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-1 rounded font-bold">AI GENERATED</span>
                </div>
                <div className="p-6 space-y-6">
                  
                  {/* Executive Summary */}
                  <div className="text-sm text-gray-800 italic border-l-4 border-amber-500 pl-4 py-1">
                    "{deepRiskReport.executive_summary}"
                  </div>

                  {/* Hidden Risks */}
                  <div>
                    <h4 className="font-bold text-gray-700 mb-3 text-sm uppercase">Hidden Correlations & Risks</h4>
                    <div className="grid gap-3">
                      {deepRiskReport.hidden_risks?.map((risk: any, i: number) => (
                        <div key={i} className="flex justify-between items-center p-3 bg-red-50 rounded-lg border border-red-100">
                          <div>
                            <div className="font-bold text-red-900 text-sm">{risk.risk}</div>
                            <div className="text-xs text-red-700">{risk.impact}</div>
                          </div>
                          <div className="text-xs font-bold bg-white px-2 py-1 rounded border border-red-200 text-red-600">
                            {risk.probability} Prob.
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Scenarios */}
                  <div>
                    <h4 className="font-bold text-gray-700 mb-3 text-sm uppercase">Stress Test Simulations</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {deepRiskReport.scenario_simulations?.map((sim: any, i: number) => (
                        <div key={i} className="p-3 border rounded-lg bg-gray-50">
                          <div className="font-bold text-gray-800 text-xs mb-1">{sim.scenario_name}</div>
                          <div className="text-xl font-extrabold text-gray-900 mb-2">{sim.portfolio_impact}</div>
                          <div className="text-[10px] text-gray-500 leading-tight">{sim.outcome_description}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            ) : (
              <div className="h-full min-h-[300px] flex items-center justify-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-gray-400">
                {loadingAi ? 'AI is analyzing macro-economic correlations...' : 'Select a client to run a deep risk simulation.'}
              </div>
            )}
          </div>
        </div>
      )}

      {activeView === 'strategy' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Selector Panel */}
          <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 p-5 h-fit">
            <h3 className="font-bold text-gray-800 mb-4">Select Client to Analyze</h3>
            <select 
              className="w-full p-2 border rounded-lg mb-4"
              value={selectedClientForAI}
              onChange={(e) => setSelectedClientForAI(e.target.value)}
            >
              <option value="">-- Choose Client --</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.profile.name}</option>)}
            </select>
            <button
              onClick={handleGenerateStrategy}
              disabled={!selectedClientForAI || loadingAi}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-lg shadow-lg hover:opacity-90 disabled:opacity-50"
            >
              {loadingAi ? '✨ Analyzing...' : 'Generate Closing Script'}
            </button>
          </div>

          {/* Output Panel */}
          <div className="lg:col-span-2">
            {aiStrategy ? (
              <div className="bg-white rounded-xl border-2 border-indigo-100 shadow-xl overflow-hidden">
                <div className="bg-indigo-50 p-4 border-b border-indigo-100 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-indigo-900">Closing Strategy</h3>
                  <button className="text-xs bg-white text-indigo-600 px-3 py-1 rounded border border-indigo-200 font-bold hover:bg-indigo-50">
                    🖨️ Export PDF
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  
                  {/* The Hook */}
                  <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-500">
                    <div className="text-xs font-bold text-red-800 uppercase mb-1">The Emotional Hook</div>
                    <div className="text-lg font-medium text-gray-800">"{aiStrategy.hook}"</div>
                  </div>

                  {/* VISUAL GAP (The Killer Feature) */}
                  {aiStrategy.chartData && (
                    <div className="border rounded-xl p-4 bg-white shadow-inner">
                       <h4 className="text-sm font-bold text-gray-700 mb-4">The Freedom Gap Visualization</h4>
                       <div className="h-[200px] w-full">
                          <ResponsiveContainer>
                             <AreaChart data={aiStrategy.chartData}>
                                <defs>
                                  <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <XAxis dataKey="age" />
                                <YAxis hide />
                                <Tooltip formatter={(v) => fmtSGD(v)}/>
                                <Area type="monotone" dataKey="savings" stroke="#10b981" fillOpacity={1} fill="url(#colorSavings)" />
                             </AreaChart>
                          </ResponsiveContainer>
                       </div>
                       <div className="text-center text-xs text-gray-500 mt-2">
                          Green = Financial Freedom. If the curve hits zero before life expectancy, they are in the <span className="text-red-600 font-bold">Red Zone</span>.
                       </div>
                    </div>
                  )}

                  {/* Analysis & Pitch */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase mb-2">Gap Reality</div>
                      <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">
                        {aiStrategy.gap_analysis}
                      </p>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase mb-2">The Solution</div>
                      <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">
                        {aiStrategy.solution_pitch}
                      </p>
                    </div>
                  </div>

                  {/* Urgency */}
                  <div className="bg-emerald-50 p-4 rounded-lg border-l-4 border-emerald-500">
                    <div className="flex gap-3">
                      <div className="text-2xl">⏰</div>
                      <div>
                        <div className="text-xs font-bold text-emerald-800 uppercase mb-1">Urgency Driver</div>
                        <div className="text-sm text-emerald-900 font-medium">{aiStrategy.urgency_driver}</div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            ) : (
              <div className="h-full min-h-[300px] flex items-center justify-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-gray-400">
                {loadingAi ? 'Connecting to Gemini Quantum Brain...' : 'Select a client to generate a personalized sales script.'}
              </div>
            )}
          </div>
        </div>
      )}

      {activeView === 'market_map' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
           <div className="bg-white p-5 rounded-xl border shadow-sm">
              <h4 className="font-bold text-gray-700 mb-4">Portfolio Distribution</h4>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                     <CartesianGrid />
                     <XAxis type="number" dataKey="income" name="Income" unit="$" />
                     <YAxis type="number" dataKey="netWorth" name="Net Worth" unit="$" />
                     <ZAxis type="number" dataKey="age" range={[60, 400]} name="Age" />
                     <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(value) => fmtSGD(value as number)} />
                     <Scatter name="Clients" data={analyzedData} fill="#8884d8">
                        {analyzedData.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={entry.hasInsurance && entry.hasInvestment ? '#10b981' : (entry.hasInsurance ? '#ef4444' : '#f59e0b')} />
                        ))}
                     </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
           </div>
           <div className="bg-white p-5 rounded-xl border shadow-sm">
              <h4 className="font-bold text-gray-700 mb-4">Cross-Sell Opportunities</h4>
              <div className="h-[300px]">
                <ResponsiveContainer>
                  <PieChart>
                     <Pie data={matrixData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                        {matrixData.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                     </Pie>
                     <Tooltip />
                     <Legend />
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
