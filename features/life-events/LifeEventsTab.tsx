
import React, { useMemo, useState, useEffect } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { toNum, fmtSGD } from '../../lib/helpers';
import { calculateChildEducationCost, computeCpf } from '../../lib/calculators';
import LineChart from '../../components/common/LineChart';

type EventType = 'none' | 'death' | 'tpd' | 'ci';

const LifeEventsTab: React.FC = () => {
  const { 
    profile, insuranceState, cashflowState, investorState, cpfState, cashflowData, age, propertyState
  } = useClient();
  
  const MAX_PROJECTION_AGE = 95;
  const INFLATION_RATE = 0.03;
  const INVESTMENT_RETURN = 0.05; 
  const CPF_GROWTH = 0.025;
  
  const [selectedEvent, setSelectedEvent] = useState<EventType>('none');
  const [eventAge, setEventAge] = useState<number>(Math.min(Math.max(age + 1, 40), MAX_PROJECTION_AGE - 1));
  const [recoveryYears, setRecoveryYears] = useState<number>(5);
  const [supportYears, setSupportYears] = useState<number>(20); 
  const [finalExpenses, setFinalExpenses] = useState<number>(25000); 

  useEffect(() => {
    setEventAge(prev => Math.max(prev, age + 1));
  }, [age]);

  const lifeExpectancy = profile.gender === 'female' ? 86 : 82;

  const grossIncome = toNum(profile.monthlyIncome) || toNum(profile.grossSalary) || 0;
  const takeHomeIncome = toNum(profile.takeHome) > 0 
    ? toNum(profile.takeHome) 
    : (cpfState ? (computeCpf(grossIncome, age).takeHome) : grossIncome * 0.8);

  const expensesMonthly = cashflowData ? cashflowData.totalExpenses : 0;
  const currentCash = toNum(cashflowState.currentSavings, 0);
  const currentInvestments = toNum(investorState.portfolioValue, 0);
  const currentCpfLiquid = toNum(cpfState.currentBalances.oa, 0) + toNum(cpfState.currentBalances.sa, 0) + toNum(cpfState.currentBalances.ma, 0); 
  const totalMonthlySavings = cashflowData ? cashflowData.monthlySavings : 0;
  const monthlyInv = toNum(profile.monthlyInvestmentAmount, 0);
  const monthlyCashSavings = Math.max(0, totalMonthlySavings - monthlyInv);

  const policies = insuranceState.policies || [];
  const payouts = useMemo(() => {
    return policies.reduce((acc, p) => ({
      death: acc.death + toNum(p.deathCoverage),
      tpd: acc.tpd + toNum(p.tpdCoverage),
      ci: acc.ci + toNum(p.earlyCiCoverage) + toNum(p.lateCiCoverage)
    }), { death: 0, tpd: 0, ci: 0 });
  }, [policies]);

  const projectAssetsToAge = (targetAge: number) => {
     const years = Math.max(0, targetAge - age);
     if (years === 0) return { cash: currentCash, investments: currentInvestments, cpf: currentCpfLiquid };
     const rInv = INVESTMENT_RETURN;
     const n = years;
     const fvInvPrincipal = currentInvestments * Math.pow(1 + rInv, n);
     const fvInvContrib = monthlyInv * 12 * ( (Math.pow(1 + rInv, n) - 1) / rInv );
     const totalInv = fvInvPrincipal + fvInvContrib;
     const rCash = 0.005; 
     const fvCashPrincipal = currentCash * Math.pow(1 + rCash, n);
     const fvCashContrib = monthlyCashSavings * 12 * ( (Math.pow(1 + rCash, n) - 1) / rCash );
     const totalCash = fvCashPrincipal + fvCashContrib;
     const totalCpf = currentCpfLiquid * Math.pow(1 + CPF_GROWTH, n);
     return { cash: totalCash, investments: totalInv, cpf: totalCpf };
  };

  const getMortgageBalance = (currentAge: number, targetAge: number) => {
     if (!propertyState) return 0;
     const price = toNum(propertyState.propertyPrice);
     const down = price * (toNum(propertyState.downPaymentPercent)/100);
     const loanAmount = price - down;
     const rate = toNum(propertyState.interestRate, 3.5);
     const tenure = toNum(propertyState.loanTenure, 25);
     const yearsPassed = targetAge - currentAge;
     if (yearsPassed < 0) return loanAmount;
     if (yearsPassed >= tenure) return 0;
     const r = rate / 100 / 12;
     const n = tenure * 12;
     const p = yearsPassed * 12;
     if (r === 0) return loanAmount * (1 - p/n);
     const balance = loanAmount * ( (Math.pow(1+r, n) - Math.pow(1+r, p)) / (Math.pow(1+r, n) - 1) );
     return Math.max(0, balance);
  };

  const deathAnalysis = useMemo(() => {
    if (selectedEvent !== 'death') return null;
    const mortgageLiability = getMortgageBalance(age, eventAge);
    let educationLiability = 0;
    const eduBreakdown: {name: string, cost: number}[] = [];
    if (profile.children) {
        profile.children.forEach(child => {
            const cost = calculateChildEducationCost(child, profile.educationSettings);
            educationLiability += cost;
            if (cost > 0) eduBreakdown.push({ name: child.name || 'Child', cost });
        });
    }
    const survivorMonthlyNeed = expensesMonthly * 0.7;
    const familySupportLiability = survivorMonthlyNeed * 12 * supportYears;
    const totalNeeds = mortgageLiability + educationLiability + familySupportLiability + finalExpenses;
    const projected = projectAssetsToAge(eventAge);
    const totalAssets = projected.cash + projected.investments + projected.cpf + payouts.death;
    const legacyGap = totalAssets - totalNeeds;
    return {
        needs: {
            mortgage: mortgageLiability,
            education: educationLiability,
            educationDetails: eduBreakdown,
            familySupport: familySupportLiability,
            finalExpenses,
            total: totalNeeds
        },
        assets: {
            cash: projected.cash,
            investments: projected.investments,
            cpf: projected.cpf,
            insurance: payouts.death,
            total: totalAssets
        },
        gap: legacyGap,
        survivorMonthlyNeed
    };
  }, [selectedEvent, eventAge, age, propertyState, profile.children, profile.educationSettings, expensesMonthly, supportYears, finalExpenses, currentCash, currentInvestments, currentCpfLiquid, payouts.death, monthlyInv, monthlyCashSavings]);

  const livingSnapshot = useMemo(() => {
     if (selectedEvent === 'death' || selectedEvent === 'none') return null;
     const proj = projectAssetsToAge(eventAge);
     const payout = selectedEvent === 'tpd' ? payouts.tpd : payouts.ci;
     return {
        cash: proj.cash,
        investments: proj.investments,
        cpf: proj.cpf,
        payout,
        totalLiquid: proj.cash + proj.investments + payout + (selectedEvent === 'tpd' ? proj.cpf : 0) 
     };
  }, [selectedEvent, eventAge, age, currentCash, currentInvestments, currentCpfLiquid, monthlyInv, monthlyCashSavings, payouts]);

  const projection = useMemo(() => {
    if (selectedEvent === 'death' || selectedEvent === 'none') return [];
    const data = [];
    let cash = livingSnapshot ? livingSnapshot.cash + livingSnapshot.payout : 0;
    let investments = livingSnapshot ? livingSnapshot.investments : 0;
    let cpf = livingSnapshot ? livingSnapshot.cpf : 0;
    if (selectedEvent === 'tpd') {
       cash += cpf;
       cpf = 0;
    }
    for (let currentSimAge = eventAge; currentSimAge <= MAX_PROJECTION_AGE; currentSimAge++) {
      let isIncomeActive = false; 
      if (selectedEvent === 'ci' && currentSimAge >= eventAge + recoveryYears && currentSimAge < toNum(profile.retirementAge, 65)) {
         isIncomeActive = true;
      }
      let expenseFactor = 1.0;
      if (selectedEvent === 'tpd') expenseFactor = 1.1; 
      if (selectedEvent === 'ci' && !isIncomeActive) expenseFactor = 1.1;
      const yearsFromNow = currentSimAge - age;
      const annualExpenses = (expensesMonthly * 12) * Math.pow(1 + INFLATION_RATE, yearsFromNow) * expenseFactor;
      if (isIncomeActive) {
         const annualIncome = (takeHomeIncome * 12) * Math.pow(1.02, yearsFromNow);
         cash += annualIncome;
      }
      cash -= annualExpenses;
      investments *= (1 + INVESTMENT_RETURN);
      if (selectedEvent !== 'tpd') cpf *= (1 + CPF_GROWTH);
      if (cash < 0) {
         let needed = Math.abs(cash);
         if (investments >= needed) {
            investments -= needed;
            cash = 0;
         } else {
            needed -= investments;
            investments = 0;
            cash = -needed; 
         }
      }
      data.push({
        age: currentSimAge,
        liquidWealth: Math.round(Math.max(0, cash + investments)), 
        cash,
        investments
      });
    }
    return data;
  }, [age, eventAge, selectedEvent, livingSnapshot, expensesMonthly, takeHomeIncome, recoveryYears, profile.retirementAge]);

  const zeroWealthYear = projection.find(p => p.liquidWealth <= 0);
  const crashAge = zeroWealthYear ? zeroWealthYear.age : null;

  // --- SALES PSYCHOLOGY LOGIC ---
  const isCritical = (deathAnalysis && deathAnalysis.gap < 0) || (crashAge !== null);

  return (
    <div className={`p-5 transition-colors duration-500 ${isCritical ? 'bg-red-50/30' : ''}`}>
      {/* HEADER SELECTOR */}
      <div className="bg-white/80 backdrop-blur border border-gray-200 p-2 rounded-xl mb-6 sticky top-2 z-20 shadow-lg flex flex-col sm:flex-row justify-between items-center gap-4">
         <div className="flex items-center gap-3 px-3">
            <div className={`p-2 rounded-full ${isCritical ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-gray-100 text-gray-600'}`}>
                {isCritical ? '⚠️' : '🛡️'}
            </div>
            <div>
               <h2 className="text-lg font-bold text-gray-900 m-0">Stress Test</h2>
               <p className="text-xs text-gray-500">Simulate events to reveal gaps.</p>
            </div>
         </div>
         <div className="flex bg-gray-100 p-1 rounded-lg">
            {['none', 'death', 'tpd', 'ci'].map((evt) => (
               <button
                  key={evt}
                  onClick={() => setSelectedEvent(evt as EventType)}
                  className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${selectedEvent === evt ? 'bg-white shadow-md text-indigo-900 scale-105' : 'text-gray-500 hover:text-gray-900'}`}
               >
                  {evt === 'none' ? 'No Event' : evt.toUpperCase()}
               </button>
            ))}
         </div>
      </div>

      {/* --- DEATH SCENARIO --- */}
      {selectedEvent === 'death' && deathAnalysis && (
         <div className="animate-fade-in space-y-6">
            
            {/* Control Slider */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
               <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                  <div className="flex-1 w-full">
                     <label className="flex justify-between text-sm font-bold text-gray-700 mb-2">
                        <span>Simulate Event At Age</span>
                        <span className="text-indigo-600 text-xl font-black">{eventAge}</span>
                     </label>
                     <input 
                       type="range" 
                       min={age}
                       max={90} 
                       value={eventAge} 
                       onChange={(e) => setEventAge(Number(e.target.value))}
                       className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                     />
                  </div>
                  <div className="text-right border-l pl-6">
                     <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Mortgage Balance</div>
                     <div className="text-xl font-bold text-gray-800">{fmtSGD(deathAnalysis.needs.mortgage)}</div>
                  </div>
               </div>
            </div>

            {/* THE BILL */}
            <div className={`rounded-xl shadow-2xl overflow-hidden text-white transition-all duration-500 relative ${deathAnalysis.gap >= 0 ? 'bg-slate-800' : 'bg-red-600'}`}>
               <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
               <div className="p-8 relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                  <div>
                     <div className="inline-block px-3 py-1 rounded-full border border-white/20 bg-white/10 text-[10px] font-bold uppercase tracking-widest mb-3">
                        Legacy Analysis
                     </div>
                     <h3 className="text-4xl font-black m-0 mb-2 tracking-tight">
                        {deathAnalysis.gap >= 0 ? 'Family Secure' : 'Immediate Shortfall'}
                     </h3>
                     <p className="text-white/80 text-sm max-w-md leading-relaxed">
                        If {profile.name} passes away at {eventAge}, the family faces financial liabilities of <strong>{fmtSGD(deathAnalysis.needs.total)}</strong> against available assets of <strong>{fmtSGD(deathAnalysis.assets.total)}</strong>.
                     </p>
                  </div>
                  
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 p-6 rounded-xl text-center min-w-[200px] shadow-lg">
                     <div className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">
                        {deathAnalysis.gap >= 0 ? 'Net Surplus' : 'Net Deficit'}
                     </div>
                     <div className="text-4xl font-extrabold tracking-tighter">
                        {deathAnalysis.gap >= 0 ? '+' : '-'}{fmtSGD(Math.abs(deathAnalysis.gap)).replace('SGD $', '$')}
                     </div>
                     {deathAnalysis.gap < 0 && (
                        <div className="mt-2 text-[10px] font-bold bg-white text-red-600 px-2 py-1 rounded inline-block uppercase animate-pulse">
                           Critical Gap
                        </div>
                     )}
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
               {/* Liabilities (Red) */}
               <div className="bg-white rounded-xl border-t-4 border-t-red-500 shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-red-50/50">
                     <h4 className="text-red-900 font-bold m-0 flex items-center gap-2">
                        <span>📉</span> Family Liabilities
                     </h4>
                     <div className="text-lg font-bold text-red-700">{fmtSGD(deathAnalysis.needs.total)}</div>
                  </div>
                  <div className="p-0">
                     <table className="w-full text-sm">
                        <tbody className="divide-y divide-gray-100">
                           <tr className="group hover:bg-gray-50">
                              <td className="p-4 text-gray-600">Outstanding Mortgage</td>
                              <td className="p-4 text-right font-bold text-gray-800">{fmtSGD(deathAnalysis.needs.mortgage)}</td>
                           </tr>
                           <tr className="group hover:bg-gray-50">
                              <td className="p-4 text-gray-600">Children's Education</td>
                              <td className="p-4 text-right font-bold text-gray-800">{fmtSGD(deathAnalysis.needs.education)}</td>
                           </tr>
                           <tr className="group hover:bg-gray-50 bg-red-50/20">
                              <td className="p-4 text-gray-600">
                                 <div>Family Living Support</div>
                                 <div className="text-xs text-gray-400 mt-1">Replacing {fmtSGD(deathAnalysis.survivorMonthlyNeed)}/mo</div>
                                 <div className="mt-2 flex items-center gap-2">
                                    <input 
                                       type="range" min="1" max="40" value={supportYears}
                                       onChange={(e) => setSupportYears(Number(e.target.value))}
                                       className="h-1 bg-red-200 rounded w-24 accent-red-600"
                                    />
                                    <span className="text-xs font-bold text-red-600">{supportYears} Years</span>
                                 </div>
                              </td>
                              <td className="p-4 text-right font-bold text-gray-800 align-top pt-4">
                                 {fmtSGD(deathAnalysis.needs.familySupport)}
                              </td>
                           </tr>
                           <tr className="group hover:bg-gray-50">
                              <td className="p-4 text-gray-600">Final Expenses</td>
                              <td className="p-4 text-right font-bold text-gray-800">{fmtSGD(deathAnalysis.needs.finalExpenses)}</td>
                           </tr>
                        </tbody>
                     </table>
                  </div>
               </div>

               {/* Assets (Green) */}
               <div className="bg-white rounded-xl border-t-4 border-t-emerald-500 shadow-sm overflow-hidden h-fit">
                  <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-emerald-50/50">
                     <h4 className="text-emerald-900 font-bold m-0 flex items-center gap-2">
                        <span>📈</span> Available Liquidity
                     </h4>
                     <div className="text-lg font-bold text-emerald-700">{fmtSGD(deathAnalysis.assets.total)}</div>
                  </div>
                  <div className="p-0">
                     <table className="w-full text-sm">
                        <tbody className="divide-y divide-gray-100">
                           <tr className="hover:bg-gray-50">
                              <td className="p-4 text-gray-600">Insurance Payout</td>
                              <td className="p-4 text-right font-bold text-gray-800">{fmtSGD(deathAnalysis.assets.insurance)}</td>
                           </tr>
                           <tr className="hover:bg-gray-50">
                              <td className="p-4 text-gray-600">CPF Balances (Liquid)</td>
                              <td className="p-4 text-right font-bold text-gray-800">{fmtSGD(deathAnalysis.assets.cpf)}</td>
                           </tr>
                           <tr className="hover:bg-gray-50">
                              <td className="p-4 text-gray-600">Investments</td>
                              <td className="p-4 text-right font-bold text-gray-800">{fmtSGD(deathAnalysis.assets.investments)}</td>
                           </tr>
                           <tr className="hover:bg-gray-50">
                              <td className="p-4 text-gray-600">Cash Savings</td>
                              <td className="p-4 text-right font-bold text-gray-800">{fmtSGD(deathAnalysis.assets.cash)}</td>
                           </tr>
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
         </div>
      )}

      {/* --- LIVING SCENARIOS --- */}
      {selectedEvent !== 'death' && selectedEvent !== 'none' && livingSnapshot && (
         <div className="animate-fade-in space-y-6">
            
            <div className={`bg-white border-l-4 rounded-xl p-6 shadow-sm ${crashAge ? 'border-red-500' : 'border-amber-500'}`}>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div>
                     <h3 className="text-lg font-bold text-gray-800 mb-2">Simulate Income Loss</h3>
                     <p className="text-xs text-gray-500 mb-4">
                        If {selectedEvent.toUpperCase()} happens at age <span className="font-bold text-gray-900">{eventAge}</span>, income stops but expenses rise.
                     </p>
                     
                     <div className="mb-4">
                        <label className="block text-xs font-bold text-gray-500 mb-1">Event Age: {eventAge}</label>
                        <input 
                           type="range" min={Math.min(age + 1, 90)} max={90} value={eventAge} 
                           onChange={(e) => setEventAge(Number(e.target.value))}
                           className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
                        />
                     </div>

                     {selectedEvent === 'ci' && (
                        <div>
                           <label className="block text-xs font-bold text-gray-500 mb-1">Recovery Years: {recoveryYears}</label>
                           <input 
                             type="range" min="1" max="10" 
                             value={recoveryYears} 
                             onChange={(e) => setRecoveryYears(Number(e.target.value))}
                             className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
                           />
                        </div>
                     )}
                  </div>
                  
                  <div className={`p-4 rounded-xl text-center border-2 ${crashAge ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                     <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Sustainability Verdict</div>
                     {crashAge ? (
                        <>
                           <div className="text-3xl font-black text-red-600 mb-1">Bankrupt @ {crashAge}</div>
                           <p className="text-xs text-red-700 font-medium">Funds deplete before life expectancy.</p>
                        </>
                     ) : (
                        <>
                           <div className="text-3xl font-black text-emerald-600 mb-1">Secure</div>
                           <p className="text-xs text-emerald-700 font-medium">Assets sustain lifestyle through recovery.</p>
                        </>
                     )}
                  </div>
               </div>
            </div>

            {/* Chart */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
               <h3 className="text-lg font-bold text-gray-800 mb-4">Liquid Assets Trajectory</h3>
               <LineChart
                 height={300}
                 xLabels={projection.filter((_, i) => i % 5 === 0).map(d => `Age ${d.age}`)}
                 series={[{
                    name: 'Liquid Wealth',
                    values: projection.filter((_, i) => i % 5 === 0).map(d => d.liquidWealth),
                    stroke: crashAge ? '#ef4444' : '#10b981'
                 }]}
                 onFormatY={(v) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : `$${(v/1000).toFixed(0)}k`}
               />
            </div>
         </div>
      )}

      {selectedEvent === 'none' && (
         <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border-2 border-dashed border-gray-200 text-center">
            <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center text-3xl mb-4 text-indigo-600">
               ⚡
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Stress Test The Plan</h3>
            <p className="text-gray-500 max-w-md text-sm mb-6">
               Select a life event above to see if the current financial plan creates a safety net or a free fall.
            </p>
            <div className="flex gap-3">
               <button onClick={() => setSelectedEvent('death')} className="px-4 py-2 bg-red-50 text-red-700 rounded-lg text-xs font-bold hover:bg-red-100 border border-red-200">
                  Simulate Death
               </button>
               <button onClick={() => setSelectedEvent('ci')} className="px-4 py-2 bg-amber-50 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-100 border border-amber-200">
                  Simulate Illness
               </button>
            </div>
         </div>
      )}
    </div>
  );
};

export default LifeEventsTab;
