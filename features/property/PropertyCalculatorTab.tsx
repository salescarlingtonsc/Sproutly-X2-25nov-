
import React, { useState, useMemo } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { useAi } from '../../contexts/AiContext';
import { toNum, fmtSGD } from '../../lib/helpers';
import { getCurrentMortgageRates } from '../../lib/gemini';
import LabeledText from '../../components/common/LabeledText';
import LabeledSelect from '../../components/common/LabeledSelect';
import PageHeader from '../../components/layout/PageHeader';
import SectionCard from '../../components/layout/SectionCard';
import { PropertyState } from '../../types';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

const PropertyCalculatorTab: React.FC = () => {
  const { propertyState, setPropertyState, profile } = useClient();
  const { openAiWithPrompt } = useAi();
  const { 
    propertyPrice, propertyType, downPaymentPercent, loanTenure, interestRate, 
    useCpfOa, cpfOaAmount, renovationCost = '0', rentalIncome = '0' 
  } = propertyState;
  
  const [checkingRates, setCheckingRates] = useState(false);

  const updateState = (key: keyof PropertyState, value: any) => {
    setPropertyState({ ...propertyState, [key]: value });
  };

  const handleCheckLiveRates = async () => {
    setCheckingRates(true);
    try {
      const rate = await getCurrentMortgageRates();
      const cleanRate = rate.replace('%', '').trim();
      updateState('interestRate', cleanRate);
    } catch (e) {
      alert("Could not fetch rates.");
    } finally {
      setCheckingRates(false);
    }
  };

  // --- CALCULATORS ---
  const calculateBSD = (price: number) => {
    if (price <= 0) return 0;
    if (price <= 180000) return price * 0.01;
    if (price <= 360000) return 1800 + (price - 180000) * 0.02;
    if (price <= 1000000) return 5400 + (price - 360000) * 0.03;
    if (price <= 1500000) return 24600 + (price - 1000000) * 0.04;
    return 44600 + (price - 1500000) * 0.05;
  };

  const price = toNum(propertyPrice);
  const downPayment = price * (toNum(downPaymentPercent) / 100);
  const bsd = calculateBSD(price);
  const legalFees = price > 0 ? 3000 : 0;
  const valuationFee = price > 0 ? 500 : 0;
  const reno = toNum(renovationCost);
  
  const totalUpfront = downPayment + bsd + legalFees + valuationFee + reno;
  const cpfAvailable = useCpfOa ? toNum(cpfOaAmount) : 0;
  const cpfUtilized = Math.min(totalUpfront, cpfAvailable); 
  const cashNeeded = Math.max(0, totalUpfront - cpfUtilized);

  const loanAmount = price - downPayment;
  const annualRate = toNum(interestRate) / 100;
  const monthlyRate = annualRate / 12;
  const years = toNum(loanTenure);
  const numPayments = years * 12;
  
  const monthlyPayment = loanAmount > 0 && monthlyRate > 0
    ? loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1)
    : loanAmount / numPayments;

  // --- AMORTIZATION ENGINE ---
  const amortizationData = useMemo(() => {
    if (loanAmount <= 0) return [];
    
    const data = [];
    let balance = loanAmount;
    let totalInterestPaid = 0;
    
    for (let y = 1; y <= years; y++) {
      let interestThisYear = 0;
      let principalThisYear = 0;
      
      for (let m = 0; m < 12; m++) {
        if (balance <= 0) break;
        const interest = balance * monthlyRate;
        const principal = monthlyPayment - interest;
        balance -= principal;
        interestThisYear += interest;
        principalThisYear += principal;
      }
      
      totalInterestPaid += interestThisYear;
      
      // Breakeven Calculation:
      // Price you must sell at to cover: Purchase Price + BSD + Reno + Legal + Interest Paid
      // Note: This is simplified (ignores Agent Fees/holding costs for now, but good for "Cost Base")
      const totalCostBase = price + bsd + legalFees + reno + totalInterestPaid;
      const equity = price - Math.max(0, balance); // Assuming price stays constant for equity calc base

      data.push({
        year: y,
        balance: Math.round(Math.max(0, balance)),
        equity: Math.round(equity),
        interestPaid: Math.round(totalInterestPaid),
        breakeven: Math.round(totalCostBase)
      });
    }
    return data;
  }, [loanAmount, monthlyRate, years, monthlyPayment, price, bsd, legalFees, reno]);

  // --- TDSR CHECKER ---
  const monthlyIncome = toNum(profile.monthlyIncome) || toNum(profile.grossSalary) || 0;
  const tdsrLimit = monthlyIncome * 0.55; // 55% conservative TDSR
  const msrLimit = monthlyIncome * 0.30; // 30% MSR (HDB only)
  
  const isHdb = propertyType === 'hdb';
  const isSafeTDSR = monthlyPayment <= tdsrLimit;
  const isSafeMSR = !isHdb || (monthlyPayment <= msrLimit);

  const handleAiEvaluation = async () => {
     openAiWithPrompt(`Analyze this property deal for client ${profile.name}.
     Price: ${fmtSGD(price)}
     Loan: ${fmtSGD(loanAmount)} over ${years} years @ ${interestRate}%.
     Monthly Payment: ${fmtSGD(monthlyPayment)}.
     Income: ${fmtSGD(monthlyIncome)}.
     Cash Down: ${fmtSGD(cashNeeded)}.
     
     Task:
     1. Evaluate affordability (TDSR/MSR).
     2. Calculate the "Real Cost" after 30 years including interest.
     3. Suggest if they should increase downpayment to save interest.
     `);
  };

  const headerAction = (
    <button 
      onClick={handleAiEvaluation}
      className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
    >
      <span>🏰</span> AI Deal Analysis
    </button>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      
      <PageHeader 
        title="Real Estate Architect"
        icon="🏠"
        subtitle="Deep analysis of acquisition costs, equity buildup, and exit strategies."
        action={headerAction}
      />

      {/* 1. INPUT DECK */}
      <SectionCard title="Property Parameters">
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-4">
               <LabeledText label="Purchase Price ($)" value={propertyPrice} onChange={(v) => updateState('propertyPrice', v)} placeholder="1000000" />
               <LabeledSelect
                  label="Asset Class"
                  value={propertyType}
                  onChange={(v) => updateState('propertyType', v)}
                  options={[{ label: 'HDB Resale/BTO', value: 'hdb' }, { label: 'Private Condo', value: 'condo' }, { label: 'Landed', value: 'landed' }]}
               />
            </div>
            <div className="space-y-4">
               <LabeledText label="Downpayment (%)" value={downPaymentPercent} onChange={(v) => updateState('downPaymentPercent', v)} placeholder="25" />
               <div className="relative">
                  <LabeledText label="Interest Rate (%)" value={interestRate} onChange={(v) => updateState('interestRate', v)} placeholder="2.6" />
                  <button onClick={handleCheckLiveRates} disabled={checkingRates} className="absolute top-0 right-0 text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded hover:bg-emerald-100">
                     {checkingRates ? '...' : '⚡ Live'}
                  </button>
               </div>
            </div>
            <div className="space-y-4">
               <LabeledText label="Loan Tenure (Years)" value={loanTenure} onChange={(v) => updateState('loanTenure', v)} placeholder="30" />
               <LabeledText label="Renovation Budget ($)" value={renovationCost} onChange={(v) => updateState('renovationCost', v)} placeholder="50000" />
            </div>
         </div>
         
         <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700 bg-gray-50 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors">
               <input type="checkbox" checked={useCpfOa} onChange={(e) => updateState('useCpfOa', e.target.checked)} className="accent-indigo-600 w-4 h-4" />
               Use CPF OA
            </label>
            {useCpfOa && (
               <input 
                  type="text" 
                  placeholder="OA Balance Available"
                  value={cpfOaAmount}
                  onChange={(e) => updateState('cpfOaAmount', e.target.value)}
                  className="w-48 p-2 border-b-2 border-indigo-100 text-sm font-bold text-indigo-900 outline-none focus:border-indigo-500 bg-transparent placeholder-indigo-200"
               />
            )}
         </div>
      </SectionCard>

      {price > 0 && (
         <>
            {/* 2. THE ENTRY WALL (Cash & Fees) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
               <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Upfront Capital</h3>
                  <div className="mb-6">
                     <div className="text-3xl font-black text-indigo-900">{fmtSGD(cashNeeded)}</div>
                     <div className="text-xs text-indigo-500 font-medium mt-1">Cash Required</div>
                  </div>
                  
                  <div className="space-y-2 text-xs">
                     <div className="flex justify-between text-gray-600"><span>Downpayment (Cash)</span> <span className="font-bold">{fmtSGD(Math.max(0, downPayment - cpfUtilized))}</span></div>
                     <div className="flex justify-between text-gray-600"><span>Stamp Duty (BSD)</span> <span className="font-bold">{fmtSGD(bsd)}</span></div>
                     <div className="flex justify-between text-gray-600"><span>Legal & Val</span> <span className="font-bold">{fmtSGD(legalFees + valuationFee)}</span></div>
                     <div className="flex justify-between text-gray-600"><span>Renovation</span> <span className="font-bold">{fmtSGD(reno)}</span></div>
                     {useCpfOa && <div className="flex justify-between text-emerald-600 font-bold border-t border-gray-100 pt-2"><span>Less CPF Usage</span> <span>-{fmtSGD(cpfUtilized)}</span></div>}
                  </div>
               </div>

               {/* 3. AFFORDABILITY CHECKS */}
               <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Servicing Ability</h3>
                  <div className="mb-6">
                     <div className="text-3xl font-black text-slate-800">{fmtSGD(monthlyPayment)}</div>
                     <div className="text-xs text-slate-500 font-medium mt-1">Monthly Mortgage</div>
                  </div>

                  <div className="space-y-3">
                     {/* TDSR Bar */}
                     <div>
                        <div className="flex justify-between text-[10px] font-bold uppercase mb-1">
                           <span>TDSR (Max 55%)</span>
                           <span className={isSafeTDSR ? 'text-emerald-600' : 'text-red-600'}>{((monthlyPayment/monthlyIncome)*100).toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                           <div className={`h-full rounded-full ${isSafeTDSR ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, (monthlyPayment/monthlyIncome)*100)}%` }}></div>
                        </div>
                     </div>
                     
                     {/* MSR Bar (HDB Only) */}
                     {isHdb && (
                        <div>
                           <div className="flex justify-between text-[10px] font-bold uppercase mb-1">
                              <span>MSR (Max 30%)</span>
                              <span className={isSafeMSR ? 'text-emerald-600' : 'text-red-600'}>{((monthlyPayment/monthlyIncome)*100).toFixed(1)}%</span>
                           </div>
                           <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${isSafeMSR ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, (monthlyPayment/monthlyIncome)*100)}%` }}></div>
                           </div>
                        </div>
                     )}
                     
                     {!isSafeTDSR && <div className="text-[10px] text-red-500 font-bold bg-red-50 p-2 rounded mt-2">⚠️ Exceeds TDSR Limit. Loan likely rejected.</div>}
                  </div>
               </div>

               {/* 4. BREAKEVEN METRICS */}
               <div className="lg:col-span-1 bg-slate-900 rounded-2xl shadow-xl p-6 text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/20 rounded-full blur-2xl"></div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 relative z-10">Exit Strategy (5 Years)</h3>
                  
                  {amortizationData.length >= 5 && (
                     <div className="relative z-10">
                        <div className="mb-4">
                           <div className="text-3xl font-black text-emerald-400">{fmtSGD(amortizationData[4].breakeven)}</div>
                           <div className="text-xs text-slate-400 mt-1">Breakeven Price (Year 5)</div>
                        </div>
                        <div className="text-xs space-y-1 text-slate-300">
                           <div className="flex justify-between"><span>Purchase Price</span> <span>{fmtSGD(price)}</span></div>
                           <div className="flex justify-between text-red-300"><span>+ Interest (5y)</span> <span>+{fmtSGD(amortizationData[4].interestPaid)}</span></div>
                           <div className="flex justify-between text-amber-300"><span>+ Sunk Costs (BSD/Reno)</span> <span>+{fmtSGD(bsd+reno+legalFees)}</span></div>
                        </div>
                     </div>
                  )}
               </div>
            </div>

            {/* 5. DEEP DIVE CHARTS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
               <SectionCard title="Equity Build-up vs. Loan">
                  <div className="h-[300px]">
                     <ResponsiveContainer>
                        <AreaChart data={amortizationData}>
                           <defs>
                              <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                                 <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                                 <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                              </linearGradient>
                              <linearGradient id="colorDebt" x1="0" y1="0" x2="0" y2="1">
                                 <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                                 <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1}/>
                              </linearGradient>
                           </defs>
                           <XAxis dataKey="year" fontSize={10} />
                           <YAxis fontSize={10} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                           <Tooltip formatter={(v:number) => fmtSGD(v)} />
                           <Legend />
                           <Area type="monotone" dataKey="equity" stackId="1" stroke="#10b981" fill="url(#colorEquity)" name="Home Equity" />
                           <Area type="monotone" dataKey="balance" stackId="1" stroke="#ef4444" fill="url(#colorDebt)" name="Outstanding Loan" />
                        </AreaChart>
                     </ResponsiveContainer>
                  </div>
               </SectionCard>

               <SectionCard title="Total Cost Analysis (Interest Decay)">
                  <div className="h-[300px]">
                     <ResponsiveContainer>
                        <BarChart data={amortizationData.filter((_, i) => i % 5 === 4 || i === 0)}>
                           <XAxis dataKey="year" fontSize={10} tickFormatter={(v) => `Year ${v}`} />
                           <YAxis fontSize={10} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                           <Tooltip formatter={(v:number) => fmtSGD(v)} />
                           <Legend />
                           <Bar dataKey="breakeven" fill="#6366f1" name="Total Cost Base" radius={[4,4,0,0]} />
                           <Bar dataKey="interestPaid" fill="#f59e0b" name="Cumulative Interest" radius={[4,4,0,0]} />
                        </BarChart>
                     </ResponsiveContainer>
                  </div>
                  <p className="text-center text-xs text-gray-400 mt-2">
                     Shows the rising "Breakeven Price" required to exit without loss as interest accumulates.
                  </p>
               </SectionCard>
            </div>
         </>
      )}
    </div>
  );
};

export default PropertyCalculatorTab;
