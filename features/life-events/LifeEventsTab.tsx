
import React, { useMemo, useState, useEffect } from 'react';
import { toNum, fmtSGD } from '../../lib/helpers';
import { calculateChildEducationCost } from '../../lib/calculators';
import Card from '../../components/common/Card';
import LineChart from '../../components/common/LineChart';
import { 
  Profile, InsuranceState, CashflowState, InvestorState, CpfState, CashflowData, PropertyState
} from '../../types';
import { computeCpf } from '../../lib/calculators';

interface LifeEventsTabProps {
  profile: Profile;
  insuranceState: InsuranceState;
  cashflowState: CashflowState;
  investorState: InvestorState;
  cpfState: CpfState;
  cashflowData: CashflowData | null;
  age: number;
  propertyState?: PropertyState;
}

type EventType = 'none' | 'death' | 'tpd' | 'ci';

const LifeEventsTab: React.FC<LifeEventsTabProps> = ({ 
  profile, insuranceState, cashflowState, investorState, cpfState, cashflowData, age, propertyState
}) => {
  
  // Constants
  const MAX_PROJECTION_AGE = 95;
  const INFLATION_RATE = 0.03;
  const INVESTMENT_RETURN = 0.05; // 5% base
  const CPF_GROWTH = 0.025; // OA base
  
  const [selectedEvent, setSelectedEvent] = useState<EventType>('none');
  const [eventAge, setEventAge] = useState<number>(Math.min(Math.max(age + 1, 40), MAX_PROJECTION_AGE - 1));
  
  // Scenarios specific settings
  const [recoveryYears, setRecoveryYears] = useState<number>(5);
  const [supportYears, setSupportYears] = useState<number>(20); // For death: How long to support family
  const [finalExpenses, setFinalExpenses] = useState<number>(25000); // Funeral/Probate

  useEffect(() => {
    setEventAge(prev => Math.max(prev, age + 1));
  }, [age]);

  // Helper for Death Scenario
  const lifeExpectancy = profile.gender === 'female' ? 86 : 82;
  const yearsUntilLifeExpectancy = Math.max(1, lifeExpectancy - eventAge);

  // --- 1. DATA GATHERING ---
  const grossIncome = toNum(profile.monthlyIncome) || toNum(profile.grossSalary) || 0;
  const takeHomeIncome = toNum(profile.takeHome) > 0 
    ? toNum(profile.takeHome) 
    : (cpfState ? (computeCpf(grossIncome, age).takeHome) : grossIncome * 0.8);

  const expensesMonthly = cashflowData ? cashflowData.totalExpenses : 0;
  const currentCash = toNum(cashflowState.currentSavings, 0);
  const currentInvestments = toNum(investorState.portfolioValue, 0);
  const currentCpfLiquid = toNum(cpfState.currentBalances.oa, 0) + toNum(cpfState.currentBalances.sa, 0) + toNum(cpfState.currentBalances.ma, 0); 
  
  // Savings Flow
  const totalMonthlySavings = cashflowData ? cashflowData.monthlySavings : 0;
  const monthlyInv = toNum(profile.monthlyInvestmentAmount, 0);
  const monthlyCashSavings = Math.max(0, totalMonthlySavings - monthlyInv);

  // Insurance Payouts
  const policies = insuranceState.policies || [];
  const payouts = useMemo(() => {
    return policies.reduce((acc, p) => ({
      death: acc.death + toNum(p.deathCoverage),
      tpd: acc.tpd + toNum(p.tpdCoverage),
      ci: acc.ci + toNum(p.earlyCiCoverage) + toNum(p.lateCiCoverage)
    }), { death: 0, tpd: 0, ci: 0 });
  }, [policies]);

  // --- HELPER: ASSET PROJECTION ---
  const projectAssetsToAge = (targetAge: number) => {
     const years = Math.max(0, targetAge - age);
     if (years === 0) return { cash: currentCash, investments: currentInvestments, cpf: currentCpfLiquid };

     // FV = PV * (1+r)^n + PMT * [((1+r)^n - 1) / r]
     
     // 1. Investments
     const rInv = INVESTMENT_RETURN;
     const n = years;
     const fvInvPrincipal = currentInvestments * Math.pow(1 + rInv, n);
     const fvInvContrib = monthlyInv * 12 * ( (Math.pow(1 + rInv, n) - 1) / rInv );
     const totalInv = fvInvPrincipal + fvInvContrib;

     // 2. Cash (Low return, say 0.5% or just accumulation)
     const rCash = 0.005; 
     const fvCashPrincipal = currentCash * Math.pow(1 + rCash, n);
     const fvCashContrib = monthlyCashSavings * 12 * ( (Math.pow(1 + rCash, n) - 1) / rCash );
     const totalCash = fvCashPrincipal + fvCashContrib;

     // 3. CPF (Approx 2.5%)
     const totalCpf = currentCpfLiquid * Math.pow(1 + CPF_GROWTH, n);

     return { cash: totalCash, investments: totalInv, cpf: totalCpf };
  };

  // --- HELPER: MORTGAGE AMORTIZATION ---
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

  // --- 2. DEATH SCENARIO: CAPITAL NEEDS ANALYSIS (THE BILL) ---
  const deathAnalysis = useMemo(() => {
    if (selectedEvent !== 'death') return null;

    // A. LIABILITIES
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

    // B. ASSETS (Projected)
    const projected = projectAssetsToAge(eventAge);
    const totalAssets = projected.cash + projected.investments + projected.cpf + payouts.death;

    // C. GAP
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

  // --- DEATH PROJECTION GRAPH ---
  const deathProjection = useMemo(() => {
     if (selectedEvent !== 'death') return [];
     const data = [];
     const maxGraphAge = Math.min(age + 40, 85);
     
     for (let a = age; a <= maxGraphAge; a += 1) { 
        const mort = getMortgageBalance(age, a);
        const survivorMonthlyNeed = expensesMonthly * 0.7;
        const incomeRep = survivorMonthlyNeed * 12 * supportYears;
        
        let edu = 0;
        if (profile.children) {
           profile.children.forEach(c => edu += calculateChildEducationCost(c, profile.educationSettings));
        }

        const totalLiab = mort + incomeRep + edu + finalExpenses;

        const proj = projectAssetsToAge(a);
        const assets = proj.cash + proj.investments + proj.cpf + payouts.death;

        data.push({
           age: a,
           liabilities: Math.round(totalLiab),
           assets: Math.round(assets),
           netLegacy: Math.round(assets - totalLiab)
        });
     }
     return data;
  }, [selectedEvent, age, propertyState, expensesMonthly, supportYears, profile.children, profile.educationSettings, finalExpenses, currentCash, currentInvestments, currentCpfLiquid, payouts.death, monthlyInv, monthlyCashSavings]);


  // --- 3. LIVING SCENARIOS (TPD / CI) SNAPSHOT & PROJECTION ---
  
  // Snapshot at Event Age
  const livingSnapshot = useMemo(() => {
     if (selectedEvent === 'death' || selectedEvent === 'none') return null;
     const proj = projectAssetsToAge(eventAge);
     const payout = selectedEvent === 'tpd' ? payouts.tpd : payouts.ci;
     
     return {
        cash: proj.cash,
        investments: proj.investments,
        cpf: proj.cpf,
        payout,
        totalLiquid: proj.cash + proj.investments + payout + (selectedEvent === 'tpd' ? proj.cpf : 0) // CPF liquid only for TPD usually
     };
  }, [selectedEvent, eventAge, age, currentCash, currentInvestments, currentCpfLiquid, monthlyInv, monthlyCashSavings, payouts]);

  // Long-term Projection (Sustainability)
  const projection = useMemo(() => {
    if (selectedEvent === 'death' || selectedEvent === 'none') return [];
    const data = [];
    
    // Start from Event Age state
    let cash = livingSnapshot ? livingSnapshot.cash + livingSnapshot.payout : 0;
    let investments = livingSnapshot ? livingSnapshot.investments : 0;
    let cpf = livingSnapshot ? livingSnapshot.cpf : 0;
    
    // TPD releases CPF to Cash
    if (selectedEvent === 'tpd') {
       cash += cpf;
       cpf = 0;
    }

    for (let currentSimAge = eventAge; currentSimAge <= MAX_PROJECTION_AGE; currentSimAge++) {
      
      // Income Status
      let isIncomeActive = false; // Event kills income
      let isRecovering = false;

      // CI might allow recovery
      if (selectedEvent === 'ci' && currentSimAge >= eventAge + recoveryYears && currentSimAge < toNum(profile.retirementAge, 65)) {
         isIncomeActive = true;
      }

      // Expense Factor
      let expenseFactor = 1.0;
      if (selectedEvent === 'tpd') expenseFactor = 1.1; 
      if (selectedEvent === 'ci' && !isIncomeActive) expenseFactor = 1.1;

      // Flows
      // Expenses grow from NOW (age) to currentSimAge
      const yearsFromNow = currentSimAge - age;
      const annualExpenses = (expensesMonthly * 12) * Math.pow(1 + INFLATION_RATE, yearsFromNow) * expenseFactor;
      
      // Income (if recovered)
      if (isIncomeActive) {
         // Assume income also grew
         const annualIncome = (takeHomeIncome * 12) * Math.pow(1.02, yearsFromNow);
         cash += annualIncome;
         // Add savings back to pot?
      }
      
      cash -= annualExpenses;
      
      // Growth
      investments *= (1 + INVESTMENT_RETURN);
      if (selectedEvent !== 'tpd') cpf *= (1 + CPF_GROWTH);

      // Smart Liquidation
      if (cash < 0) {
         let needed = Math.abs(cash);
         if (investments >= needed) {
            investments -= needed;
            cash = 0;
         } else {
            needed -= investments;
            investments = 0;
            cash = -needed; // Debt
         }
      }

      data.push({
        age: currentSimAge,
        liquidWealth: Math.round(Math.max(0, cash + investments)), // Excludes CPF if locked
        cash,
        investments
      });
    }
    return data;
  }, [age, eventAge, selectedEvent, livingSnapshot, expensesMonthly, takeHomeIncome, recoveryYears, profile.retirementAge]);

  const zeroWealthYear = projection.find(p => p.liquidWealth <= 0);
  const crashAge = zeroWealthYear ? zeroWealthYear.age : null;

  return (
    <div className="p-5">
      {/* HEADER SELECTOR */}
      <div className="bg-white border-b border-gray-200 p-4 mb-6 -mx-5 -mt-5 sticky top-0 z-10 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
         <h2 className="text-xl font-bold text-gray-800 m-0">⚡ Life Event Simulator</h2>
         <div className="flex bg-gray-100 p-1 rounded-lg">
            {['none', 'death', 'tpd', 'ci'].map((evt) => (
               <button
                  key={evt}
                  onClick={() => setSelectedEvent(evt as EventType)}
                  className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${selectedEvent === evt ? 'bg-white shadow-sm text-indigo-900' : 'text-gray-500 hover:text-gray-900'}`}
               >
                  {evt === 'none' ? 'No Event' : evt.toUpperCase()}
               </button>
            ))}
         </div>
      </div>

      {/* --- DEATH SCENARIO: THE LEGACY BILL --- */}
      {selectedEvent === 'death' && deathAnalysis && (
         <div className="animate-fade-in">
            {/* Age Selection for Death */}
            <div className="bg-white border-l-4 border-indigo-500 rounded-xl p-6 mb-6 shadow-sm">
               <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                  <div className="flex-1 w-full">
                     <label className="block text-sm font-bold text-gray-800 mb-2">
                        Simulate Death at Age: <span className="text-indigo-600 text-lg">{eventAge}</span>
                     </label>
                     <input 
                       type="range" 
                       min={age}
                       max={90} 
                       value={eventAge} 
                       onChange={(e) => setEventAge(Number(e.target.value))}
                       className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                     />
                     <div className="text-xs text-gray-500 mt-2">
                        Move slider to see how liabilities (like mortgage) decrease over time.
                     </div>
                  </div>
                  <div className="text-right">
                     <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Mortgage Balance</div>
                     <div className="text-xl font-bold text-gray-800">{fmtSGD(deathAnalysis.needs.mortgage)}</div>
                  </div>
               </div>
            </div>

            <div className="bg-slate-900 text-white p-6 rounded-xl shadow-xl mb-6">
               <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                  <div>
                     <h3 className="text-2xl font-bold m-0 mb-2">The Legacy Bill</h3>
                     <p className="text-slate-400 text-sm m-0">
                        If you pass away at Age {eventAge}, this is the financial gap.
                     </p>
                  </div>
                  <div className={`text-right px-6 py-3 rounded-lg border-2 ${deathAnalysis.gap >= 0 ? 'bg-emerald-900/50 border-emerald-500' : 'bg-red-900/50 border-red-500'}`}>
                     <div className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">
                        {deathAnalysis.gap >= 0 ? 'Legacy Surplus' : 'Legacy Shortfall'}
                     </div>
                     <div className={`text-3xl font-extrabold ${deathAnalysis.gap >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {deathAnalysis.gap >= 0 ? '+' : '-'}{fmtSGD(Math.abs(deathAnalysis.gap))}
                     </div>
                  </div>
               </div>
            </div>

            {/* Death Projection Chart */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
               <h3 className="text-lg font-bold text-gray-800 mb-4">Legacy Gap Over Time</h3>
               <LineChart
                 height={250}
                 xLabels={deathProjection.filter((_, i) => i % 5 === 0).map(d => `Age ${d.age}`)}
                 series={[
                    {
                       name: 'Total Liabilities',
                       values: deathProjection.filter((_, i) => i % 5 === 0).map(d => d.liabilities),
                       stroke: '#ef4444' // red
                    },
                    {
                       name: 'Total Assets (w/ Insurance)',
                       values: deathProjection.filter((_, i) => i % 5 === 0).map(d => d.assets),
                       stroke: '#10b981' // green
                    }
                 ]}
                 onFormatY={(v) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : `$${(v/1000).toFixed(0)}k`}
               />
               <div className="text-center text-xs text-gray-500 mt-2">
                  The crossing point shows when you become "Self-Insured" (Assets &gt; Liabilities).
               </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
               
               {/* LEFT: THE NEEDS (RED) */}
               <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="bg-red-50 p-4 border-b border-red-100 flex justify-between items-center">
                     <h4 className="text-red-800 font-bold m-0">📉 Family Needs (Liabilities)</h4>
                     <div className="text-xl font-bold text-red-700">{fmtSGD(deathAnalysis.needs.total)}</div>
                  </div>
                  <div className="p-0">
                     <table className="w-full text-sm">
                        <tbody className="divide-y divide-gray-100">
                           <tr className="group hover:bg-gray-50">
                              <td className="p-4 text-gray-600">
                                 <div className="font-bold text-gray-800">Outstanding Mortgage</div>
                                 <div className="text-xs text-gray-400">Amortized balance at Age {eventAge}</div>
                              </td>
                              <td className="p-4 text-right font-bold text-gray-800">{fmtSGD(deathAnalysis.needs.mortgage)}</td>
                           </tr>
                           <tr className="group hover:bg-gray-50">
                              <td className="p-4 text-gray-600">
                                 <div className="font-bold text-gray-800">Children's Education</div>
                                 <div className="text-xs text-gray-400">Remaining tuition + uni fees</div>
                                 {deathAnalysis.needs.educationDetails.length > 0 && (
                                    <div className="mt-1 flex gap-1">
                                       {deathAnalysis.needs.educationDetails.map((c, i) => (
                                          <span key={i} className="text-[10px] bg-red-100 text-red-700 px-1.5 rounded">{c.name}: {fmtSGD(c.cost)}</span>
                                       ))}
                                    </div>
                                 )}
                              </td>
                              <td className="p-4 text-right font-bold text-gray-800">{fmtSGD(deathAnalysis.needs.education)}</td>
                           </tr>
                           
                           {/* MODIFIED: FAMILY LIVING EXPENSES CONTROL */}
                           <tr className="group hover:bg-gray-50 bg-red-50/20">
                              <td className="p-4 text-gray-600">
                                 <div className="font-bold text-gray-800">Family Living Expenses</div>
                                 <div className="text-xs text-gray-400 mb-2">
                                    {supportYears} years @ {fmtSGD(deathAnalysis.survivorMonthlyNeed)}/mo (70% replacement)
                                 </div>
                                 
                                 <div className="bg-white p-3 rounded-lg border border-red-100 shadow-sm">
                                    <div className="flex justify-between items-center mb-1">
                                       <label className="text-[10px] uppercase font-bold text-gray-500">Support Duration</label>
                                       <div className="text-xs font-bold text-red-700">{supportYears} Years</div>
                                    </div>
                                    <input 
                                       type="range" 
                                       min="1" 
                                       max={Math.max(50, yearsUntilLifeExpectancy + 5)} 
                                       step="1"
                                       value={supportYears}
                                       onChange={(e) => setSupportYears(Number(e.target.value))}
                                       className="w-full h-1.5 bg-red-200 rounded-lg appearance-none cursor-pointer accent-red-600 block mb-3"
                                    />
                                    <div className="flex flex-wrap gap-2 justify-end">
                                       <button 
                                          onClick={() => setSupportYears(20)}
                                          className="text-[10px] px-2 py-1 bg-gray-50 border border-gray-200 rounded text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                                       >
                                          Default (20y)
                                       </button>
                                       <button 
                                          onClick={() => setSupportYears(yearsUntilLifeExpectancy)}
                                          className="text-[10px] px-2 py-1 bg-gray-50 border border-gray-200 rounded text-gray-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors"
                                       >
                                          Until Age {lifeExpectancy} ({yearsUntilLifeExpectancy}y)
                                       </button>
                                    </div>
                                 </div>
                              </td>
                              <td className="p-4 text-right font-bold text-gray-800 align-top pt-6">
                                 {fmtSGD(deathAnalysis.needs.familySupport)}
                              </td>
                           </tr>

                           <tr className="group hover:bg-gray-50">
                              <td className="p-4 text-gray-600">
                                 <div className="font-bold text-gray-800">Final Expenses</div>
                                 <div className="text-xs text-gray-400">Funeral, probate, admin</div>
                              </td>
                              <td className="p-4 text-right font-bold text-gray-800">{fmtSGD(deathAnalysis.needs.finalExpenses)}</td>
                           </tr>
                        </tbody>
                     </table>
                  </div>
               </div>

               {/* RIGHT: THE ASSETS (GREEN) */}
               <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden h-fit">
                  <div className="bg-emerald-50 p-4 border-b border-emerald-100 flex justify-between items-center">
                     <h4 className="text-emerald-800 font-bold m-0">📈 Available Assets</h4>
                     <div className="text-xl font-bold text-emerald-700">{fmtSGD(deathAnalysis.assets.total)}</div>
                  </div>
                  <div className="p-0">
                     <table className="w-full text-sm">
                        <tbody className="divide-y divide-gray-100">
                           <tr className="hover:bg-gray-50">
                              <td className="p-4 text-gray-600">
                                 <div className="font-bold text-gray-800">Insurance Payout</div>
                                 <div className="text-xs text-gray-400">Existing Death Policies</div>
                              </td>
                              <td className="p-4 text-right font-bold text-gray-800">{fmtSGD(deathAnalysis.assets.insurance)}</td>
                           </tr>
                           <tr className="hover:bg-gray-50">
                              <td className="p-4 text-gray-600">
                                 <div className="font-bold text-gray-800">CPF Balances</div>
                                 <div className="text-xs text-gray-400">Projected at Age {eventAge}</div>
                              </td>
                              <td className="p-4 text-right font-bold text-gray-800">{fmtSGD(deathAnalysis.assets.cpf)}</td>
                           </tr>
                           <tr className="hover:bg-gray-50">
                              <td className="p-4 text-gray-600">
                                 <div className="font-bold text-gray-800">Investments</div>
                                 <div className="text-xs text-gray-400">Accumulated & Liquidated</div>
                              </td>
                              <td className="p-4 text-right font-bold text-gray-800">{fmtSGD(deathAnalysis.assets.investments)}</td>
                           </tr>
                           <tr className="hover:bg-gray-50">
                              <td className="p-4 text-gray-600">
                                 <div className="font-bold text-gray-800">Cash Savings</div>
                                 <div className="text-xs text-gray-400">Accumulated Savings</div>
                              </td>
                              <td className="p-4 text-right font-bold text-gray-800">{fmtSGD(deathAnalysis.assets.cash)}</td>
                           </tr>
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
         </div>
      )}

      {/* --- LIVING SCENARIOS (TPD/CI) --- */}
      {selectedEvent !== 'death' && selectedEvent !== 'none' && livingSnapshot && (
         <div className="animate-fade-in">
            {/* Control Panel */}
            <div className="bg-white border-l-4 border-amber-500 rounded-xl p-6 mb-6 shadow-sm">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div>
                     <label className="block text-sm font-bold text-gray-800 mb-2">
                        Event occurs at Age: <span className="text-amber-600 text-lg">{eventAge}</span>
                     </label>
                     <input 
                       type="range" 
                       min={Math.min(age + 1, MAX_PROJECTION_AGE - 1)}
                       max={MAX_PROJECTION_AGE} 
                       value={eventAge} 
                       onChange={(e) => setEventAge(Number(e.target.value))}
                       className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
                     />
                     {selectedEvent === 'ci' && (
                        <div className="mt-4">
                           <label className="block text-xs font-bold text-gray-600 mb-1">
                              Recovery Period (Income Stops): {recoveryYears} Years
                           </label>
                           <input 
                             type="range" min="1" max="10" 
                             value={recoveryYears} 
                             onChange={(e) => setRecoveryYears(Number(e.target.value))}
                             className="w-full h-1 bg-gray-200 accent-red-500"
                           />
                        </div>
                     )}
                  </div>
                  
                  {/* Snapshot Summary for Living Scenarios */}
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                     <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Financial Strength at Event (Age {eventAge})</h4>
                     <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                        <div>
                           <div className="text-[10px] text-gray-400">Insurance Payout</div>
                           <div className="text-lg font-bold text-emerald-600">{fmtSGD(livingSnapshot.payout)}</div>
                        </div>
                        <div>
                           <div className="text-[10px] text-gray-400">Accumulated Cash</div>
                           <div className="text-sm font-bold text-gray-700">{fmtSGD(livingSnapshot.cash)}</div>
                        </div>
                        <div>
                           <div className="text-[10px] text-gray-400">Investments</div>
                           <div className="text-sm font-bold text-gray-700">{fmtSGD(livingSnapshot.investments)}</div>
                        </div>
                        <div>
                           <div className="text-[10px] text-gray-400">CPF Balance</div>
                           <div className="text-sm font-bold text-gray-700">{fmtSGD(livingSnapshot.cpf)}</div>
                           {selectedEvent === 'ci' && <span className="text-[9px] text-red-400">(Not Liquid)</span>}
                        </div>
                     </div>
                  </div>
               </div>
            </div>

            {/* Chart */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
               <h3 className="text-lg font-bold text-gray-800 mb-4">Liquid Assets Trajectory</h3>
               <LineChart
                 height={300}
                 xLabels={projection.filter((_, i) => i % 5 === 0).map(d => `Age ${d.age}`)}
                 series={[{
                    name: 'Liquid Wealth',
                    values: projection.filter((_, i) => i % 5 === 0).map(d => d.liquidWealth),
                    stroke: '#f59e0b'
                 }]}
                 onFormatY={(v) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : `$${(v/1000).toFixed(0)}k`}
               />
            </div>

            {/* Verdict */}
            <div className={`p-5 rounded-xl border-l-4 ${crashAge ? 'bg-red-50 border-red-500' : 'bg-emerald-50 border-emerald-500'}`}>
               <h3 className={`text-lg font-bold m-0 ${crashAge ? 'text-red-900' : 'text-emerald-900'}`}>
                  {crashAge ? `⚠️ Funds Depleted at Age ${crashAge}` : '✅ Lifestyle Secure'}
               </h3>
               {crashAge && (
                  <p className="text-sm text-red-800 mt-1">
                     The payout is insufficient to sustain the income loss and increased expenses.
                  </p>
               )}
            </div>
         </div>
      )}

      {selectedEvent === 'none' && (
         <div className="text-center p-10 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
            <div className="text-4xl mb-3">👈</div>
            <h3 className="text-gray-600 font-bold">Select a Life Event</h3>
            <p className="text-gray-400 text-sm">Choose a scenario above to stress-test the financial plan.</p>
         </div>
      )}
    </div>
  );
};

export default LifeEventsTab;
