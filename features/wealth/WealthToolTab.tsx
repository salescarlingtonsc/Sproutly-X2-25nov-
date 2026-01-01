
import React, { useMemo } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { toNum, fmtSGD } from '../../lib/helpers';
import LabeledText from '../../components/common/LabeledText';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { WealthState } from '../../types';

const WealthToolTab: React.FC = () => {
  const { wealthState, setWealthState, age } = useClient();
  const { annualPremium, projectionYears, growthRate, premiumHolidayStartYear, targetRetirementIncome, withdrawalStartAge } = wealthState;

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
    let totalWithdrawal = 0;

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
         totalWithdrawal += monthlyDraw;
      }

      if (m % 12 === 0) {
         data.push({
            year: currentYear,
            age: currentAge,
            bonusAcc: Math.round(Math.max(0, bonusAccValue)),
            flexibleAcc: Math.round(Math.max(0, flexibleAccValue)),
            totalValue: Math.round(Math.max(0, bonusAccValue + flexibleAccValue)),
            cumulativePremium,
            isHoliday,
            annualWithdrawal: isRetirement ? annualRetirementIncome : 0
         });
      }
    }

    return { data, totalWithdrawal };
  }, [premium, duration, annualRate, holidayStartYear, retirementStartAge, annualRetirementIncome, age]);

  const finalState = projectionData ? projectionData.data[projectionData.data.length - 1] : null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      
      {/* 1. PLAN HIGHLIGHTS */}
      <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
         <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none"></div>
         
         <div className="relative z-10 flex flex-col md:flex-row justify-between items-start gap-8">
            <div className="space-y-4">
               <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-bold uppercase tracking-widest backdrop-blur-md">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Wealth Accumulator Plan
               </div>
               
               <div>
                  <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2">
                     Dual-Account Strategy
                  </h1>
                  <p className="text-slate-400 text-sm max-w-md leading-relaxed">
                     Maximizing initial growth via the <strong className="text-indigo-300">Bonus Account</strong> (Years 1-2) while maintaining 100% liquidity in the <strong className="text-emerald-300">Flexible Account</strong> (Year 3+).
                  </p>
               </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 min-w-[240px] text-right">
               <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Projected Total Value</div>
               <div className="text-4xl font-black text-white tracking-tighter">
                  {finalState ? fmtSGD(finalState.totalValue) : '$0'}
               </div>
               <div className="text-xs text-emerald-400 mt-2 font-bold">
                  {finalState && finalState.annualWithdrawal > 0 ? `Providing ${fmtSGD(finalState.annualWithdrawal)}/yr` : 'Accumulation Phase'}
               </div>
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
               <div className="pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                     <label className="text-xs font-bold text-gray-700 uppercase">Passive Income</label>
                     <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-400">Start Age:</span>
                        <input 
                           type="number" 
                           value={withdrawalStartAge || ''}
                           onChange={(e) => updateState('withdrawalStartAge', e.target.value)}
                           className="w-12 px-1 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px] font-bold text-center"
                           placeholder="65"
                        />
                     </div>
                  </div>
                  <input 
                     type="text" 
                     value={targetRetirementIncome || ''} 
                     onChange={(e) => updateState('targetRetirementIncome', e.target.value)}
                     className="w-full px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-900 font-bold outline-none focus:ring-2 focus:ring-emerald-500 text-sm placeholder-emerald-800/30"
                     placeholder="Target Annual Amount ($)"
                  />
               </div>
            </div>
         </div>

         {/* 3. CHART */}
         <div className="lg:col-span-8 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col">
            <div className="flex justify-between items-center mb-6">
               <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Account Value Composition</h3>
               <div className="flex gap-4 text-[10px] font-bold uppercase">
                  <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> Bonus A/C</div>
                  <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-400"></div> Flexible A/C</div>
               </div>
            </div>

            {projectionData ? (
               <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
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
                        <YAxis 
                           fontSize={10} 
                           tickLine={false} 
                           axisLine={false} 
                           tickFormatter={(val) => val >= 1000000 ? `$${(val/1000000).toFixed(1)}m` : `$${(val/1000).toFixed(0)}k`} 
                        />
                        <Tooltip 
                           contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                           formatter={(val: number) => fmtSGD(val)}
                           labelFormatter={(label) => `Age ${label}`}
                        />
                        <Area 
                           type="monotone" 
                           dataKey="flexibleAcc" 
                           stackId="1" 
                           stroke="#10b981" 
                           fill="url(#colorFlex)" 
                           name="Flexible Account" 
                        />
                        <Area 
                           type="monotone" 
                           dataKey="bonusAcc" 
                           stackId="1" 
                           stroke="#4f46e5" 
                           fill="url(#colorBonus)" 
                           name="Bonus Account" 
                        />
                     </AreaChart>
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
    