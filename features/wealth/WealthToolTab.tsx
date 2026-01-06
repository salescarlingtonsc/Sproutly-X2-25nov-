
import React, { useMemo, useState } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { toNum, fmtSGD } from '../../lib/helpers';
import LabeledText from '../../components/common/LabeledText';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { WealthState } from '../../types';

const WealthToolTab: React.FC = () => {
  const { wealthState, setWealthState, age } = useClient();
  const { annualPremium, projectionYears, growthRate, premiumHolidayStartYear, targetRetirementIncome, withdrawalStartAge } = wealthState;
  const [viewMode, setViewMode] = useState<'growth' | 'income'>('growth');

  const updateState = (key: keyof WealthState, value: any) => {
    setWealthState({ ...wealthState, [key]: value });
  };

  const premium = toNum(annualPremium, 12000);
  const duration = toNum(projectionYears, 40);
  const annualRate = toNum(growthRate, 8) / 100;
  
  // Settings
  const holidayStartYear = toNum(premiumHolidayStartYear, 99); 
  const retirementStartAge = toNum(withdrawalStartAge, 65);
  const annualRetirementIncome = toNum(targetRetirementIncome, 0);

  // --- DUAL ACCOUNT ENGINE ---
  const projectionData = useMemo(() => {
    if (premium <= 0) return null;

    const data = [];
    let bonusAccValue = 0;
    let flexibleAccValue = 0;
    
    const monthlyRate = Math.pow(1 + annualRate, 1.0/12.0) - 1;
    const totalMonths = duration * 12;
    
    const bonusFeeRateMonthly = 0.0036 / 12;
    const flexFeeAmountMonthly = (premium * 0.012) / 12;

    let cumulativePremium = 0;
    let cumulativeWithdrawal = 0;

    for (let m = 1; m <= totalMonths; m++) {
      const currentYear = Math.ceil(m / 12);
      const currentAge = age + Math.floor((m - 1) / 12);
      const isHoliday = currentYear >= holidayStartYear;
      const isRetirement = currentAge >= retirementStartAge;
      
      const isPremiumMonth = (m - 1) % 12 === 0;
      
      if (isPremiumMonth && !isHoliday && !isRetirement) {
         cumulativePremium += premium;
         if (currentYear === 1) bonusAccValue += premium * 2.23;
         else if (currentYear === 2) bonusAccValue += premium * 2.00;
         else flexibleAccValue += premium;
      }

      // Fees
      bonusAccValue -= bonusAccValue * bonusFeeRateMonthly;
      if (flexibleAccValue > 0 || currentYear > 2) flexibleAccValue -= flexFeeAmountMonthly;

      // Growth
      bonusAccValue *= (1 + monthlyRate);
      flexibleAccValue *= (1 + monthlyRate);

      // Withdrawals
      let monthlyDraw = 0;
      if (isRetirement && annualRetirementIncome > 0) {
         const targetMonthlyDraw = annualRetirementIncome / 12;
         let needed = targetMonthlyDraw;

         if (flexibleAccValue >= needed) {
            flexibleAccValue -= needed;
            monthlyDraw += needed;
            needed = 0;
         } else if (flexibleAccValue > 0) {
            monthlyDraw += flexibleAccValue;
            needed -= flexibleAccValue;
            flexibleAccValue = 0;
         }

         if (needed > 0 && bonusAccValue > 0) {
            if (bonusAccValue >= needed) {
               bonusAccValue -= needed;
               monthlyDraw += needed;
               needed = 0;
            } else {
               monthlyDraw += bonusAccValue;
               bonusAccValue = 0;
            }
         }
         cumulativeWithdrawal += monthlyDraw;
      }

      if (m % 12 === 0) {
         data.push({
            year: currentYear,
            age: currentAge,
            bonusAcc: Math.round(Math.max(0, bonusAccValue)),
            flexibleAcc: Math.round(Math.max(0, flexibleAccValue)),
            totalValue: Math.round(Math.max(0, bonusAccValue + flexibleAccValue)),
            cumulativePremium,
            cumulativeIncome: Math.round(cumulativeWithdrawal),
            isHoliday,
            isRetirement,
            annualWithdrawal: isRetirement ? annualRetirementIncome : 0
         });
      }
    }

    return { data, totalWithdrawal: cumulativeWithdrawal };
  }, [premium, duration, annualRate, holidayStartYear, retirementStartAge, annualRetirementIncome, age]);

  const finalState = projectionData ? projectionData.data[projectionData.data.length - 1] : null;
  const retirementState = projectionData ? projectionData.data.find(d => d.isRetirement) : null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      
      {/* 1. PLAN HIGHLIGHTS */}
      <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
         <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none"></div>
         
         <div className="relative z-10 flex flex-col md:flex-row justify-between items-start gap-8">
            <div className="space-y-4">
               <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-bold uppercase tracking-widest backdrop-blur-md">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Wealth Accumulator
               </div>
               
               <div>
                  <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2">
                     Dual-Account Strategy
                  </h1>
                  <p className="text-slate-400 text-sm max-w-md leading-relaxed">
                     Maximizing initial growth via the <strong className="text-indigo-300">Bonus Account</strong> while maintaining 100% liquidity in the <strong className="text-emerald-300">Flexible Account</strong>.
                  </p>
               </div>
            </div>

            <div className="flex gap-6 text-right">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 min-w-[160px]">
                   <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Safety Net (Balance)</div>
                   <div className="text-3xl font-black text-white tracking-tighter">
                      {finalState ? fmtSGD(finalState.totalValue) : '$0'}
                   </div>
                   <div className="text-[10px] text-emerald-400 mt-2 font-bold">
                      Assets Remaining
                   </div>
                </div>
                {finalState && finalState.cumulativeIncome > 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 min-w-[160px]">
                       <div className="text-[10px] font-bold text-amber-200 uppercase tracking-widest mb-1">Total Income Taken</div>
                       <div className="text-3xl font-black text-amber-400 tracking-tighter">
                          {fmtSGD(finalState.cumulativeIncome)}
                       </div>
                       <div className="text-[10px] text-amber-300/80 mt-2 font-bold">
                          Cash in Pocket
                       </div>
                    </div>
                )}
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
         
         {/* 2. CONTROL PANEL */}
         <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-200 p-6 h-fit shadow-sm">
            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2 text-sm uppercase tracking-wide">
               <span>⚙️</span> Plan Configuration
            </h3>
            
            <div className="space-y-6">
               <LabeledText 
                  label="Annual Investment ($)" 
                  value={annualPremium} 
                  onChange={(v) => updateState('annualPremium', v)} 
                  type="number" 
                  placeholder="12000" 
               />
               <LabeledText 
                  label="Projected Return (%)" 
                  value={growthRate} 
                  onChange={(v) => updateState('growthRate', v)} 
                  type="number" 
                  placeholder="8.0" 
               />
               
               {/* Premium Holiday Slider */}
               <div className="pt-4 border-t border-gray-100">
                  <div className="flex justify-between items-center mb-2">
                     <label className="text-xs font-bold text-gray-700 uppercase">Premium Term</label>
                     <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${holidayStartYear === 99 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {holidayStartYear === 99 ? 'Full Term' : `Stop @ Year ${holidayStartYear}`}
                     </span>
                  </div>
                  <input 
                     type="range" 
                     min="3" 
                     max="30" 
                     step="1"
                     value={holidayStartYear === 99 ? 30 : holidayStartYear} 
                     onChange={(e) => updateState('premiumHolidayStartYear', e.target.value)}
                     className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400 mt-1 font-medium">
                     <span className="cursor-pointer hover:text-indigo-600" onClick={() => updateState('premiumHolidayStartYear', '3')}>Year 3 (Min)</span>
                     <span className="cursor-pointer hover:text-indigo-600" onClick={() => updateState('premiumHolidayStartYear', '99')}>Full Term</span>
                  </div>
               </div>

               {/* Withdrawal Settings */}
               <div className="pt-4 border-t border-gray-100 bg-amber-50/50 p-4 rounded-xl border border-amber-100">
                  <div className="flex items-center justify-between mb-3">
                     <label className="text-xs font-bold text-amber-900 uppercase tracking-wide">Passive Income Mode</label>
                     <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-amber-200">
                        <span className="text-[10px] text-amber-500 font-bold uppercase">Start Age</span>
                        <input 
                           type="number" 
                           value={withdrawalStartAge || ''}
                           onChange={(e) => updateState('withdrawalStartAge', e.target.value)}
                           className="w-8 bg-transparent text-xs font-black text-amber-700 text-center outline-none"
                           placeholder="65"
                        />
                     </div>
                  </div>
                  <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 font-bold">$</span>
                      <input 
                         type="text" 
                         value={targetRetirementIncome || ''} 
                         onChange={(e) => updateState('targetRetirementIncome', e.target.value)}
                         className="w-full pl-6 pr-4 py-2.5 bg-white border-2 border-amber-200 rounded-xl text-amber-900 font-bold outline-none focus:border-amber-500 text-sm placeholder-amber-300 transition-all"
                         placeholder="Annual Amount (e.g. 24000)"
                      />
                  </div>
                  <p className="text-[10px] text-amber-600/70 mt-2 leading-tight">
                      This simulates taking money OUT of the plan for retirement, showing if the capital survives.
                  </p>
               </div>
            </div>
         </div>

         {/* 3. CHART */}
         <div className="lg:col-span-8 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
               <div>
                   <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">
                       {viewMode === 'growth' ? 'Account Value Composition' : 'Total Benefit Analysis'}
                   </h3>
                   <p className="text-xs text-slate-400 mt-1">
                       {viewMode === 'growth' ? 'Breakdown of Bonus vs Flexible accounts.' : 'Visualizing Income Taken + Remaining Balance.'}
                   </p>
               </div>
               
               <div className="flex bg-slate-100 p-1 rounded-lg self-start sm:self-auto">
                  <button onClick={() => setViewMode('growth')} className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${viewMode === 'growth' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Accumulation</button>
                  <button onClick={() => setViewMode('income')} className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${viewMode === 'income' ? 'bg-white shadow text-amber-600' : 'text-slate-500'}`}>Total Benefits</button>
               </div>
            </div>

            {projectionData ? (
               <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                     {viewMode === 'growth' ? (
                         <AreaChart data={projectionData.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                               <linearGradient id="colorBonus" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.1}/>
                               </linearGradient>
                               <linearGradient id="colorFlex" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#34d399" stopOpacity={0.8}/>
                                  <stop offset="95%" stopColor="#34d399" stopOpacity={0.1}/>
                               </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="age" fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => val >= 1000000 ? `$${(val/1000000).toFixed(1)}m` : `$${(val/1000).toFixed(0)}k`} />
                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }} formatter={(val: number) => fmtSGD(val)} labelFormatter={(label) => `Age ${label}`} />
                            <Area type="monotone" dataKey="flexibleAcc" stackId="1" stroke="#10b981" fill="url(#colorFlex)" name="Flexible Account" />
                            <Area type="monotone" dataKey="bonusAcc" stackId="1" stroke="#4f46e5" fill="url(#colorBonus)" name="Bonus Account" />
                            {retirementState && <ReferenceLine x={retirementState.age} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Passive Income Start', position: 'insideTopRight', fill: '#f59e0b', fontSize: 10, fontWeight: 'bold' }} />}
                         </AreaChart>
                     ) : (
                         <AreaChart data={projectionData.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                               <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8}/>
                                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1}/>
                               </linearGradient>
                               <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                               </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="age" fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => val >= 1000000 ? `$${(val/1000000).toFixed(1)}m` : `$${(val/1000).toFixed(0)}k`} />
                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }} formatter={(val: number) => fmtSGD(val)} labelFormatter={(label) => `Age ${label}`} />
                            {/* Stacked Area: Income on bottom, Balance on top */}
                            <Area type="monotone" dataKey="cumulativeIncome" stackId="1" stroke="#f59e0b" fill="url(#colorIncome)" name="Cash Received (Income)" />
                            <Area type="monotone" dataKey="totalValue" stackId="1" stroke="#10b981" fill="url(#colorBalance)" name="Remaining Safety Net" />
                            <ReferenceLine x={retirementStartAge} stroke="#f59e0b" strokeDasharray="3 3" />
                         </AreaChart>
                     )}
                  </ResponsiveContainer>
               </div>
            ) : (
               <div className="flex-1 flex items-center justify-center text-gray-400 text-sm italic min-h-[300px]">
                  Enter an annual investment amount to visualize.
               </div>
            )}
         </div>
      </div>
    </div>
  );
};

export default WealthToolTab;
