
import React, { useState, useMemo } from 'react';
import { Client } from '../../../types';
import { fmtSGD, toNum } from '../../../lib/helpers';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAi } from '../../../contexts/AiContext';

interface ClosureDeckModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client;
}

const ClosureDeckModal: React.FC<ClosureDeckModalProps> = ({ isOpen, onClose, client }) => {
  const { openAiWithPrompt } = useAi();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  
  // Comparison State
  const [monthlyInvest, setMonthlyInvest] = useState(toNum(client.profile?.monthlyInvestmentAmount) || 2000);
  const [initialLump, setInitialLump] = useState(toNum(client.investorState?.portfolioValue) || 50000);
  const [duration, setDuration] = useState(20);
  
  // Editable Rates
  const [marketRate, setMarketRate] = useState(7); // Target Return
  const [bankRate, setBankRate] = useState(0.5);   // Baseline comparison (Editable)
  
  const INFLATION_RATE = 3.0;

  // --- 1. PROJECTION ENGINE ---
  const comparisonData = useMemo(() => {
    const data = [];
    let bankBal = initialLump;
    let portBal = initialLump;
    
    // Monthly rates
    const rBank = bankRate / 100 / 12;
    const rPort = marketRate / 100 / 12;

    for (let m = 0; m <= duration * 12; m++) {
       if (m > 0) {
          // Add contributions
          bankBal += monthlyInvest;
          portBal += monthlyInvest;
          
          // Grow
          bankBal *= (1 + rBank);
          portBal *= (1 + rPort);
       }

       if (m % 12 === 0) {
          data.push({
             year: m / 12,
             bank: Math.round(bankBal),
             portfolio: Math.round(portBal),
             gap: Math.round(portBal - bankBal)
          });
       }
    }
    return data;
  }, [monthlyInvest, initialLump, duration, marketRate, bankRate]);

  const finalStats = comparisonData[comparisonData.length - 1];

  const handleGenerateScript = () => {
     openAiWithPrompt(`
        Generate a 'Closing Script' for ${client.profile?.name}.
        Context:
        - They are considering investing ${fmtSGD(monthlyInvest)}/mo + ${fmtSGD(initialLump)} lump sum.
        - Comparison shows a difference of ${fmtSGD(finalStats.gap)} over ${duration} years vs keeping it in the bank (${bankRate}%).
        - Target Portfolio Return: ${marketRate}%.
        - Their main goal is: ${client.goals || 'Financial Freedom'}.
        
        Task: Write 3 punchy paragraphs I can say to them right now to close the deal. Focus on the "Cost of Inaction" (Inflation).
     `);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[1000] flex items-center justify-center p-4 animate-in fade-in duration-300">
       <div className="w-full max-w-5xl h-[85vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col relative">
          
          {/* HEADER navigation */}
          <div className="bg-slate-50 border-b border-slate-200 px-8 py-4 flex justify-between items-center">
             <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl">
                   {step === 1 ? '1' : step === 2 ? '2' : '3'}
                </div>
                <div>
                   <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                      {step === 1 ? 'The Reality Gap' : step === 2 ? 'The Opportunity' : 'The Protocol'}
                   </h2>
                   <p className="text-xs text-slate-500 font-medium">Strategic Alignment Session • {client.profile?.name}</p>
                </div>
             </div>
             <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-800 transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
             </button>
          </div>

          {/* BODY CONTENT */}
          <div className="flex-1 overflow-y-auto p-8 relative bg-gradient-to-br from-white to-slate-50">
             
             {/* STEP 1: THE GAP (Pain) */}
             {step === 1 && (
                <div className="h-full flex flex-col items-center justify-center animate-in slide-in-from-right-8 duration-500">
                   <div className="text-center mb-10 max-w-2xl">
                      <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-4 tracking-tight">
                         "What got you here<br/>won't get you there."
                      </h1>
                      <p className="text-lg text-slate-500 font-medium">
                         Current trajectory analysis for {client.profile?.name}.
                      </p>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-4xl">
                      <div className="p-8 bg-white rounded-3xl shadow-xl border border-slate-100 text-center relative overflow-hidden group">
                         <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500"></div>
                         <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Current Net Worth</div>
                         <div className="text-3xl font-black text-slate-800">{fmtSGD(toNum(client.investorState?.portfolioValue) + toNum(client.cashflowState?.currentSavings))}</div>
                         <div className="mt-4 text-[10px] bg-slate-100 inline-block px-3 py-1 rounded-full text-slate-500 font-bold">Starting Point</div>
                      </div>

                      <div className="p-8 bg-slate-900 rounded-3xl shadow-2xl text-center relative overflow-hidden transform md:scale-110 z-10 border border-slate-800">
                         <div className="absolute -right-10 -top-10 w-32 h-32 bg-indigo-500/30 rounded-full blur-3xl"></div>
                         <div className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-2">Retirement Target</div>
                         <div className="text-4xl font-black text-white">{fmtSGD(toNum(client.profile?.customRetirementExpense || 5000) * 12 * 20)}</div>
                         <p className="text-indigo-200/60 text-xs mt-2">Lifestyle Sustaining Capital</p>
                      </div>

                      <div className="p-8 bg-white rounded-3xl shadow-xl border border-slate-100 text-center relative overflow-hidden">
                         <div className="absolute top-0 left-0 w-full h-2 bg-red-500"></div>
                         <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Projected Gap</div>
                         <div className="text-3xl font-black text-red-500">
                            {fmtSGD((toNum(client.profile?.customRetirementExpense || 5000) * 12 * 20) - (toNum(client.investorState?.portfolioValue) + toNum(client.cashflowState?.currentSavings)))}
                         </div>
                         <div className="mt-4 text-[10px] bg-red-50 inline-block px-3 py-1 rounded-full text-red-600 font-bold">Shortfall</div>
                      </div>
                   </div>
                </div>
             )}

             {/* STEP 2: THE COMPARISON (Persuasion) */}
             {step === 2 && (
                <div className="h-full flex flex-col animate-in slide-in-from-right-8 duration-500">
                   <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
                      
                      {/* Controls */}
                      <div className="lg:col-span-3 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center space-y-6">
                         <h3 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">Simulation Inputs</h3>
                         
                         <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Monthly Investment</label>
                            <input type="number" value={monthlyInvest} onChange={e => setMonthlyInvest(Number(e.target.value))} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500" />
                         </div>
                         <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Initial Lump Sum</label>
                            <input type="number" value={initialLump} onChange={e => setInitialLump(Number(e.target.value))} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500" />
                         </div>
                         <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Portfolio Return (%)</label>
                            <div className="flex items-center gap-3">
                                <input 
                                    type="number" 
                                    value={marketRate} 
                                    onChange={e => setMarketRate(Number(e.target.value))} 
                                    className="w-20 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center" 
                                />
                                <input 
                                    type="range" 
                                    min="1" 
                                    max="15" 
                                    step="0.5" 
                                    value={marketRate} 
                                    onChange={e => setMarketRate(Number(e.target.value))} 
                                    className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" 
                                />
                            </div>
                         </div>
                         <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Horizon (Years)</label>
                            <input type="range" min="5" max="40" value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                            <div className="text-right text-xs font-bold text-slate-500 mt-1">{duration} Years</div>
                         </div>

                         <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Baseline (Bank/CPF)</label>
                                <input 
                                    type="number" 
                                    value={bankRate} 
                                    onChange={e => setBankRate(Number(e.target.value))}
                                    className="w-16 bg-white border border-amber-200 rounded text-amber-700 font-bold text-sm text-center focus:ring-1 focus:ring-amber-500 outline-none"
                                />
                            </div>
                            <input 
                                type="range" 
                                min="0" 
                                max="6" 
                                step="0.1"
                                value={bankRate} 
                                onChange={e => setBankRate(Number(e.target.value))} 
                                className="w-full h-1.5 bg-amber-200 rounded-lg appearance-none cursor-pointer accent-amber-600 mt-2" 
                            />
                            <p className="text-[9px] text-amber-600/70 mt-2 leading-tight">Vs. Inflation @ {INFLATION_RATE}% = Purchasing Power Loss.</p>
                         </div>
                      </div>

                      {/* Chart Area */}
                      <div className="lg:col-span-9 flex flex-col">
                         <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 relative overflow-hidden">
                            <div className="absolute top-6 right-6 z-10 text-right">
                               <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">The Cost of Safety</div>
                               <div className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-indigo-400">
                                  {fmtSGD(finalStats.gap)}
                               </div>
                               <div className="text-xs font-bold text-indigo-200 bg-indigo-900 px-3 py-1 rounded-full inline-block mt-2">
                                  Additional Wealth Created
                               </div>
                            </div>

                            <ResponsiveContainer width="100%" height="100%">
                               <AreaChart data={comparisonData} margin={{ top: 50, right: 30, left: 20, bottom: 20 }}>
                                  <defs>
                                     <linearGradient id="colorPort" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                                     </linearGradient>
                                     <linearGradient id="colorBank" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                                     </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                  <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                                  <YAxis hide />
                                  <Tooltip 
                                     contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                     formatter={(val: number) => fmtSGD(val)}
                                     labelFormatter={(l) => `Year ${l}`}
                                  />
                                  <Area type="monotone" dataKey="portfolio" stroke="#4f46e5" strokeWidth={4} fill="url(#colorPort)" name="Sproutly Plan" />
                                  <Area type="monotone" dataKey="bank" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" fill="url(#colorBank)" name={`Baseline (${bankRate}%)`} />
                               </AreaChart>
                            </ResponsiveContainer>
                         </div>
                      </div>
                   </div>
                </div>
             )}

             {/* STEP 3: THE ACTION (Close) */}
             {step === 3 && (
                <div className="h-full flex flex-col items-center justify-center animate-in slide-in-from-right-8 duration-500 max-w-2xl mx-auto text-center">
                   <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-4xl mb-8 shadow-xl shadow-emerald-100">
                      🤝
                   </div>
                   <h2 className="text-3xl font-black text-slate-900 mb-4">Strategic Alignment Confirmed</h2>
                   <p className="text-slate-500 mb-8 text-lg">
                      We have identified the gap and validated the solution. The mathematics of compound interest favors those who start today.
                   </p>
                   
                   <div className="w-full bg-slate-50 p-6 rounded-2xl border-2 border-dashed border-slate-200 text-left mb-8">
                      <div className="flex justify-between items-center mb-4">
                         <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Next Steps</h4>
                         <button onClick={handleGenerateScript} className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
                            <span>✨</span> Generate Script
                         </button>
                      </div>
                      <ul className="space-y-3">
                         <li className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">1</div>
                            <span className="text-sm font-medium text-slate-700">Confirm Portfolio Allocation</span>
                         </li>
                         <li className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold">2</div>
                            <span className="text-sm font-medium text-slate-700">Submit Application for Underwriting</span>
                         </li>
                         <li className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold">3</div>
                            <span className="text-sm font-medium text-slate-700">Activate Wealth Compounder</span>
                         </li>
                      </ul>
                   </div>

                   <button onClick={onClose} className="px-10 py-4 bg-slate-900 text-white font-bold rounded-2xl shadow-xl hover:bg-slate-800 transition-all hover:scale-105 active:scale-95">
                      Exit & Log Sale
                   </button>
                </div>
             )}

          </div>

          {/* FOOTER NAV */}
          <div className="p-6 border-t border-slate-200 bg-white flex justify-between items-center">
             <button 
                onClick={() => setStep(prev => Math.max(1, prev - 1) as any)} 
                disabled={step === 1}
                className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
             >
                Back
             </button>
             <div className="flex gap-2">
                <div className={`w-2 h-2 rounded-full transition-all ${step === 1 ? 'bg-slate-800 w-6' : 'bg-slate-200'}`}></div>
                <div className={`w-2 h-2 rounded-full transition-all ${step === 2 ? 'bg-slate-800 w-6' : 'bg-slate-200'}`}></div>
                <div className={`w-2 h-2 rounded-full transition-all ${step === 3 ? 'bg-slate-800 w-6' : 'bg-slate-200'}`}></div>
             </div>
             <button 
                onClick={() => setStep(prev => Math.min(3, prev + 1) as any)} 
                disabled={step === 3}
                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 disabled:opacity-0 transition-all"
             >
                Continue →
             </button>
          </div>

       </div>
    </div>
  );
};

export default ClosureDeckModal;
