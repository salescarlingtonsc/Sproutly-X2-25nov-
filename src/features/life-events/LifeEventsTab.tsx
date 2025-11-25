
import React, { useMemo, useState, useEffect } from 'react';
import { toNum, fmtSGD } from '../../lib/helpers';
import Card from '../../components/common/Card';
import LineChart from '../../components/common/LineChart';
import { 
  Profile, InsuranceState, CashflowState, InvestorState, CpfState, CashflowData 
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
}

type EventType = 'none' | 'death' | 'tpd' | 'ci';

const LifeEventsTab: React.FC<LifeEventsTabProps> = ({ 
  profile, insuranceState, cashflowState, investorState, cpfState, cashflowData, age 
}) => {
  
  // Constants
  const MAX_PROJECTION_AGE = 95;
  
  const [selectedEvent, setSelectedEvent] = useState<EventType>('none');
  // Ensure initial event age is valid relative to current age
  const [eventAge, setEventAge] = useState<number>(Math.min(Math.max(age + 1, 40), MAX_PROJECTION_AGE - 1));

  // Update event age if current age changes (e.g. different client loaded)
  useEffect(() => {
    setEventAge(prev => Math.max(prev, age + 1));
  }, [age]);

  // --- 1. GATHER BASELINE DATA ---
  const grossIncome = toNum(profile.monthlyIncome) || toNum(profile.grossSalary) || 0;
  const expensesMonthly = cashflowData ? cashflowData.totalExpenses : 0;
  
  // Baseline Assets
  const currentCash = toNum(cashflowState.currentSavings, 0);
  const currentInvestments = toNum(investorState.portfolioValue, 0);
  const currentCpfLiquid = toNum(cpfState.currentBalances.oa, 0) + toNum(cpfState.currentBalances.sa, 0);
  
  // Insurance Payouts (Sum Assured)
  const policies = insuranceState.policies || [];
  const payouts = useMemo(() => {
    return policies.reduce((acc, p) => ({
      death: acc.death + toNum(p.deathCoverage),
      tpd: acc.tpd + toNum(p.tpdCoverage),
      ci: acc.ci + toNum(p.earlyCiCoverage) + toNum(p.lateCiCoverage)
    }), { death: 0, tpd: 0, ci: 0 });
  }, [policies]);

  // --- 2. PROJECTION ENGINE ---
  const projection = useMemo(() => {
    const data = [];
    const inflation = 0.03;
    const investmentReturn = 0.05; // Conservative 5%
    const cpfRate = 0.025; // Blended conservative

    let cash = currentCash;
    let investments = currentInvestments;
    let cpf = currentCpfLiquid;
    
    // Scenario Logic
    let incomeStopped = false;

    for (let currentSimAge = age; currentSimAge <= MAX_PROJECTION_AGE; currentSimAge++) {
      const isEventYear = currentSimAge === eventAge && selectedEvent !== 'none';
      const isRetirement = currentSimAge >= toNum(profile.retirementAge, 65);

      // A. APPLY EVENT IMPACT (One time)
      let payoutReceived = 0;
      if (isEventYear) {
        if (selectedEvent === 'death') {
            payoutReceived = payouts.death;
            incomeStopped = true; // Assuming death stops income for family projection
        }
        if (selectedEvent === 'tpd') {
          payoutReceived = payouts.tpd;
          incomeStopped = true; // TPD stops income
        }
        if (selectedEvent === 'ci') {
          payoutReceived = payouts.ci;
          incomeStopped = true; // CI typically stops income for treatment/recovery
        }
        
        // Inject payout into Cash
        cash += payoutReceived;
      }

      // B. INCOME FLOW
      let annualIncome = 0;
      // If we haven't retired AND (no event occurred OR event doesn't stop income)
      if (!isRetirement && !incomeStopped) {
         annualIncome = grossIncome * 12; // Gross for simplicity in wealth view
         
         // Add CPF contributions
         const cpfData = computeCpf(grossIncome, currentSimAge);
         cpf += cpfData.total * 12; 
      }
      
      // C. EXPENSE FLOW
      const annualExpenses = (expensesMonthly * 12) * Math.pow(1 + inflation, currentSimAge - age);

      // D. WEALTH GROWTH
      investments *= (1 + investmentReturn);
      cpf *= (1 + cpfRate);
      
      // E. NET FLOW CALCULATION
      // Income goes to Cash first
      cash += annualIncome;
      
      // Expenses drawn from Cash, then Investments
      let expenseNeed = annualExpenses;
      
      if (cash >= expenseNeed) {
        cash -= expenseNeed;
        expenseNeed = 0;
      } else {
        expenseNeed -= cash;
        cash = 0;
      }
      
      if (expenseNeed > 0) {
        if (investments >= expenseNeed) {
          investments -= expenseNeed;
          expenseNeed = 0;
        } else {
          expenseNeed -= investments;
          investments = 0;
        }
      }

      // F. RE-BALANCING (Simple: Surplus cash > 20k moves to investments for growth)
      if (cash > 20000) {
        const surplus = cash - 20000;
        cash = 20000;
        investments += surplus;
      }

      // METRICS
      const liquidWealth = Math.round(cash + investments);
      const netWorth = Math.round(liquidWealth + cpf);

      data.push({
        age: currentSimAge,
        liquidWealth, // Cash + Investments (Accessible)
        netWorth,     // Total (inc. CPF)
        cash,
        investments,
        cpf,
        payoutReceived,
        isEventYear
      });
    }
    
    return data;
  }, [age, currentCash, currentInvestments, currentCpfLiquid, eventAge, selectedEvent, grossIncome, expensesMonthly, payouts, profile.retirementAge]);

  // --- 3. METRICS ---
  const eventYearData = projection.find(p => p.age === eventAge);
  // Depletion check now looks at LIQUID wealth, not total net worth (since CPF is locked)
  const zeroWealthYear = projection.find(p => p.liquidWealth <= 0);
  const finalYear = projection[projection.length - 1];

  return (
    <div className="p-5">
      {/* HEADER */}
      <div className={`border-2 rounded-xl p-6 mb-6 shadow-sm transition-colors ${selectedEvent === 'none' ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-500' : 'bg-gradient-to-br from-slate-50 to-slate-100 border-slate-500'}`}>
        <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
          <div className="flex items-center gap-3">
            <div className="text-4xl">{selectedEvent === 'none' ? '🛡️' : '⚡'}</div>
            <div>
              <h3 className="m-0 text-xl font-bold text-gray-900">Life Events Stress Test</h3>
              <p className="m-0 text-sm opacity-80 text-gray-700">
                Simulate the impact on your <strong>Liquid Assets (Cash + Investments)</strong>.
              </p>
            </div>
          </div>
          
          <div className="flex-1 w-full bg-white/60 p-4 rounded-lg border border-gray-200">
             <div className="text-xs font-bold text-gray-500 uppercase mb-2">Select Scenario to Simulate:</div>
             <div className="flex gap-2 flex-wrap">
                <button 
                  onClick={() => setSelectedEvent('none')}
                  className={`px-4 py-2 rounded-md text-sm font-bold border transition-all ${selectedEvent === 'none' ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  ☀️ No Event (Retirement)
                </button>
                <button 
                  onClick={() => setSelectedEvent('death')}
                  className={`px-4 py-2 rounded-md text-sm font-bold border transition-all ${selectedEvent === 'death' ? 'bg-gray-800 text-white border-gray-800 shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  💀 Death
                </button>
                <button 
                  onClick={() => setSelectedEvent('tpd')}
                  className={`px-4 py-2 rounded-md text-sm font-bold border transition-all ${selectedEvent === 'tpd' ? 'bg-amber-600 text-white border-amber-600 shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  ♿ Disability (TPD)
                </button>
                <button 
                  onClick={() => setSelectedEvent('ci')}
                  className={`px-4 py-2 rounded-md text-sm font-bold border transition-all ${selectedEvent === 'ci' ? 'bg-red-600 text-white border-red-600 shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  🏥 Critical Illness
                </button>
             </div>
          </div>
        </div>
      </div>

      {/* CONTROLS (Only if Event Selected) */}
      {selectedEvent !== 'none' && (
        <div className="bg-white border-l-4 border-amber-500 rounded-xl p-6 mb-6 shadow-md animate-fade-in">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                 <label className="block text-sm font-bold text-gray-800 mb-2">
                    At what age does the event occur? (Age: {eventAge})
                 </label>
                 <input 
                   type="range" 
                   min={Math.min(age + 1, MAX_PROJECTION_AGE - 1)}
                   max={MAX_PROJECTION_AGE} 
                   value={eventAge} 
                   onChange={(e) => setEventAge(Number(e.target.value))}
                   className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
                 />
                 <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>Now ({age})</span>
                    <span>Age {MAX_PROJECTION_AGE}</span>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="p-3 bg-gray-50 rounded border border-gray-200">
                    <div className="text-xs text-gray-500 font-bold uppercase">Estimated Payout</div>
                    <div className="text-xl font-bold text-emerald-600">
                       {selectedEvent === 'death' && fmtSGD(payouts.death)}
                       {selectedEvent === 'tpd' && fmtSGD(payouts.tpd)}
                       {selectedEvent === 'ci' && fmtSGD(payouts.ci)}
                    </div>
                    <div className="text-[10px] text-gray-400">Based on Insurance Tab</div>
                 </div>
                 <div className="p-3 bg-gray-50 rounded border border-gray-200">
                    <div className="text-xs text-gray-500 font-bold uppercase">Active Income Status</div>
                    <div className={`text-xl font-bold ${selectedEvent === 'death' ? 'text-gray-800' : 'text-red-600'}`}>
                       {selectedEvent === 'death' ? 'Legacy' : 'STOPS 🛑'}
                    </div>
                    <div className="text-[10px] text-gray-400">
                       {selectedEvent === 'death' ? 'Lump sum for beneficiaries' : 'Income assumed to cease'}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* CHART SECTION */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
           <h3 className="text-lg font-bold text-gray-800">Liquid Assets Trajectory</h3>
           <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded">Excludes CPF (Locked)</span>
        </div>
        <LineChart
          height={320}
          xLabels={projection.filter((_, i) => i % 5 === 0).map(d => `Age ${d.age}`)}
          series={[
             {
                name: selectedEvent === 'none' ? 'Projected Liquid Assets' : 'Liquid Assets (After Event)',
                values: projection.filter((_, i) => i % 5 === 0).map(d => d.liquidWealth),
                stroke: selectedEvent === 'none' ? '#3b82f6' : '#f59e0b'
             }
          ]}
          onFormatY={(v) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : `$${(v/1000).toFixed(0)}k`}
        />
        
        {/* Chart Annotation */}
        {selectedEvent !== 'none' && (
           <div className="text-center mt-2 text-xs text-amber-600 font-bold">
              ⚡ Event occurs at Age {eventAge} (Visible change in trajectory)
           </div>
        )}
      </div>

      {/* IMPACT SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         {/* Card 1: Payout Impact */}
         <Card 
            title={selectedEvent === 'none' ? `Projected Legacy (Total)` : 'Immediate Cash Injection'}
            value={selectedEvent === 'none' ? fmtSGD(finalYear?.netWorth || 0) : fmtSGD(eventYearData?.payoutReceived || 0)}
            tone="success"
            icon="💰"
         />

         {/* Card 2: Sustainability */}
         <div className={`p-4 rounded-lg border-2 ${zeroWealthYear ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <div className="text-xs font-bold uppercase mb-1 opacity-70">
               {zeroWealthYear ? 'Cash Depletion Age' : 'Sustainability'}
            </div>
            <div className={`text-2xl font-bold ${zeroWealthYear ? 'text-red-700' : 'text-emerald-700'}`}>
               {zeroWealthYear ? `Age ${zeroWealthYear.age}` : `Lasts > Age ${MAX_PROJECTION_AGE}`}
            </div>
            <div className="text-[10px] mt-1 opacity-80">
               {zeroWealthYear 
                  ? `Liquid funds run out before age ${MAX_PROJECTION_AGE}` 
                  : 'Liquid assets sustain lifetime expenses'}
            </div>
         </div>

         {/* Card 3: Gap/Surplus */}
         <div className="p-4 rounded-lg border-2 bg-white border-gray-200">
             <div className="text-xs font-bold uppercase mb-1 text-gray-500">
                Financial Status
             </div>
             {selectedEvent === 'none' ? (
                <div className="text-sm text-gray-700">
                   Standard retirement trajectory based on current savings & investments.
                </div>
             ) : (
                <>
                  <div className={`text-lg font-bold ${zeroWealthYear ? 'text-red-600' : 'text-emerald-600'}`}>
                     {zeroWealthYear ? '⚠️ LIQUIDITY CRISIS' : '✅ SECURE'}
                  </div>
                  <div className="text-xs text-gray-600 mt-1 leading-tight">
                     {zeroWealthYear 
                        ? `Insurance payout of ${fmtSGD(eventYearData?.payoutReceived)} is insufficient to replace lost income.` 
                        : `Insurance payout successfully bridges the income gap.`}
                  </div>
                </>
             )}
         </div>
      </div>
    </div>
  );
};

export default LifeEventsTab;
