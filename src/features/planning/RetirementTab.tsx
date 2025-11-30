
import React, { useMemo } from 'react';
import { toNum, fmtSGD } from '../../lib/helpers';
import { projectComprehensiveWealth } from '../../lib/calculators';
import LabeledText from '../../components/common/LabeledText';
import Card from '../../components/common/Card';
import LineChart from '../../components/common/LineChart';
import { CashflowData, RetirementSettings, Profile, InvestorState, CpfState, CashflowState } from '../../types';

interface RetirementTabProps {
  cashflowData: CashflowData | null;
  retirement: RetirementSettings;
  setRetirement: (r: RetirementSettings) => void;
  profile: Profile;
  age: number;
  
  // Props for comprehensive calc
  investorState: InvestorState;
  setInvestorState: (i: InvestorState) => void;
  cpfState: CpfState;
  cashflowState: CashflowState;
}

const RetirementTab: React.FC<RetirementTabProps> = ({ 
  cashflowData, retirement, setRetirement, profile, age,
  investorState, setInvestorState, cpfState, cashflowState
}) => {
  
  if (!cashflowData) {
    return (
      <div className="p-5">
        <Card title="⚠️ Complete Previous Steps" value="Please complete your profile and cashflow information first" tone="warn" />
      </div>
    );
  }

  // --- 1. GATHER DATA SOURCES ---
  const currentAge = age;
  const retirementAge = toNum(profile.retirementAge, 65);
  
  // A. CASH
  const currentCash = toNum(cashflowState.currentSavings, 0);
  
  // SYNC FIX: Use Custom Base Income if set, otherwise default to calculated monthly savings
  const monthlyCashSavings = cashflowState.customBaseIncome && cashflowState.customBaseIncome !== '' 
      ? toNum(cashflowState.customBaseIncome) 
      : cashflowData.monthlySavings;

  const bankRate = toNum(cashflowState.bankInterestRate, 0.05) / 100;

  // B. INVESTMENTS
  const currentInvestments = toNum(investorState.portfolioValue, 0);
  
  // Calculate Monthly Investment Flow
  // Logic: Use the profile's explicit investment amount if set. 
  // Otherwise, use a percentage of the calculated monthly savings.
  let monthlyInvestment = 0;
  if (profile.monthlyInvestmentAmount && toNum(profile.monthlyInvestmentAmount) > 0) {
    monthlyInvestment = toNum(profile.monthlyInvestmentAmount);
  } else {
    // Fallback: Default to 50% of savings if not specified, or use retirement setting
    const investmentPercent = toNum(retirement.investmentPercent, 50);
    monthlyInvestment = monthlyCashSavings * (investmentPercent / 100);
  }
  
  // Investment Return Rate
  const investmentRatePercent = toNum(retirement.customReturnRate, 5.0);
  const investmentRate = investmentRatePercent / 100;

  // C. CPF
  const currentCpf = {
    oa: toNum(cpfState.currentBalances.oa, 0),
    sa: toNum(cpfState.currentBalances.sa, 0),
    ma: toNum(cpfState.currentBalances.ma, 0)
  };
  const grossIncome = toNum(profile.grossSalary) || toNum(profile.monthlyIncome) || 0;

  // D. RETIREMENT TARGET
  const expensesToday = toNum(profile.customRetirementExpense) || (cashflowData.totalExpenses * 0.7);

  // --- 2. RUN COMPREHENSIVE PROJECTION ---
  const projection = useMemo(() => {
    return projectComprehensiveWealth({
      currentAge,
      retirementAge,
      currentCpf,
      currentCash,
      currentInvestments,
      monthlyIncome: grossIncome,
      monthlyCashSavings, // This is total surplus (now synced with override)
      monthlyInvestment,  // This is how much of surplus goes to stocks
      rates: {
        cpfOa: 0.025,
        cpfSa: 0.04,
        cash: bankRate,
        investments: investmentRate,
        inflation: 0.03
      },
      expensesToday
    });
  }, [currentAge, retirementAge, currentCpf, currentCash, currentInvestments, grossIncome, monthlyCashSavings, monthlyInvestment, bankRate, investmentRate, expensesToday]);

  // --- 3. EXTRACT KEY METRICS ---
  
  // Snapshot at Target Retirement Age
  const retirementSnapshot = projection.find(p => p.age === retirementAge) || projection[projection.length - 1];
  
  // Wealth at Retirement
  const cpfAtRetirement = retirementSnapshot.cpfTotal; 
  const cashAtRetirement = retirementSnapshot.cash;
  const invAtRetirement = retirementSnapshot.investments;
  const totalWealthAtRetirement = retirementSnapshot.totalNetWorth;

  // CPF Life Estimation (Age 65)
  // We look for the projection year where age is 65 to see the estimated payout
  const snapshot65 = projection.find(p => p.age === 65);
  const estimatedCpfLifePayout = snapshot65 ? snapshot65.cpfLifePayoutAnnual / 12 : 0;
  
  // Age 55 Withdrawal Potential
  const snapshot55 = projection.find(p => p.age === 55);
  const withdrawableAt55 = snapshot55 ? (snapshot55.cpfLiquid > 5000 ? snapshot55.cpfLiquid : (snapshot55.cpfLiquid > 0 ? snapshot55.cpfLiquid : 0)) : 0;
  
  // Determine the "Runway" - at what age do liquid assets hit 0?
  const brokePoint = projection.find(p => p.isRetired && p.totalLiquidWealth <= 0 && p.shortfallAnnual > 0);
  const brokeAge = brokePoint ? brokePoint.age : null;

  return (
    <div className="p-5">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-2 border-indigo-500 rounded-xl p-6 mb-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="text-4xl">🚀</div>
          <div className="flex-1">
            <h3 className="m-0 text-indigo-900 text-xl font-bold">
              Comprehensive Financial Independence Plan
            </h3>
            <p className="m-1 text-indigo-800 text-sm opacity-80">
              Integrating CPF Life (Standard Plan), Cash Savings, and Investment Returns.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        
        {/* LEFT COL: INPUTS */}
        <div className="lg:col-span-1 space-y-4">
          
          {/* 1. Investment Inputs */}
          <div className="bg-white border border-emerald-200 rounded-xl p-5 shadow-sm">
             <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">📈</span>
                <h4 className="text-emerald-900 font-bold m-0">Investments</h4>
             </div>
             
             <div className="space-y-4">
               <LabeledText 
                  label="Current Portfolio Value ($)"
                  value={investorState.portfolioValue}
                  onChange={(v) => setInvestorState({...investorState, portfolioValue: v})}
                  placeholder="0"
               />
               
               <div>
                 <label className="block text-xs font-bold text-gray-700 mb-1">Projected Annual Return (%)</label>
                 <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      value={investmentRatePercent}
                      onChange={(e) => setRetirement({...retirement, customReturnRate: e.target.value})}
                      className="w-20 px-3 py-2 border rounded font-bold text-emerald-700 bg-white"
                    />
                    <div className="flex gap-1">
                       {[3, 5, 7, 9].map(r => (
                          <button 
                            key={r} 
                            onClick={() => setRetirement({...retirement, customReturnRate: String(r)})}
                            className={`px-2 py-1 text-xs rounded border ${Math.round(investmentRatePercent) === r ? 'bg-emerald-600 text-white' : 'bg-gray-50 text-gray-600'}`}
                          >
                             {r}%
                          </button>
                       ))}
                    </div>
                 </div>
               </div>

               <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Monthly Investment ($)</label>
                  <div className="p-3 bg-emerald-50 rounded border border-emerald-100">
                     <div className="font-bold text-emerald-800 text-lg">{fmtSGD(monthlyInvestment)}</div>
                     <div className="text-[10px] text-emerald-600">
                        Allocated from your monthly surplus of {fmtSGD(monthlyCashSavings)}
                     </div>
                  </div>
               </div>
             </div>
          </div>

          {/* 2. CPF & Cash Summary */}
          <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm">
             <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">🏛️</span>
                <h4 className="text-blue-900 font-bold m-0">CPF & Cash</h4>
             </div>
             <div className="space-y-3 text-sm">
                <div className="flex justify-between p-2 bg-blue-50 rounded">
                   <span className="text-blue-800">Current OA+SA</span>
                   <span className="font-bold text-blue-900">{fmtSGD(currentCpf.oa + currentCpf.sa)}</span>
                </div>
                <div className="flex justify-between p-2 bg-amber-50 rounded">
                   <span className="text-amber-800">Current Cash</span>
                   <span className="font-bold text-amber-900">{fmtSGD(currentCash)}</span>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                   *Values pulled from CPF & Cashflow tabs
                </div>
             </div>
          </div>
          
           {/* Age 55 Insight */}
           {snapshot55 && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-5 shadow-sm">
               <div className="flex items-center gap-2 mb-2">
                 <span className="text-xl">🎂</span>
                 <h4 className="text-amber-900 font-bold m-0">Age 55 Milestone</h4>
               </div>
               <div className="text-xs text-amber-800 mb-3">
                 Projected withdrawal available after setting aside Full Retirement Sum (FRS).
               </div>
               <div className="text-2xl font-bold text-amber-900">
                 {withdrawableAt55 > 5000 ? fmtSGD(withdrawableAt55) : '$5,000'}
               </div>
               <div className="text-[10px] text-amber-700 mt-1">
                 *Estimated withdrawal amount (Excess of FRS or Min $5k)
               </div>
            </div>
           )}

        </div>

        {/* RIGHT COL: RESULTS */}
        <div className="lg:col-span-2">
           
           {/* BIG TARGET CARD */}
           <div className="bg-white border-2 border-indigo-600 rounded-xl p-6 mb-6 shadow-md relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-indigo-600 text-white px-4 py-1 rounded-bl-xl text-xs font-bold">
                 TARGET FI AGE: {retirementAge}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div>
                    <h4 className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Projected Wealth at FI Age {retirementAge}</h4>
                    <div className="text-3xl font-extrabold text-indigo-900 mb-2">{fmtSGD(totalWealthAtRetirement)}</div>
                    <div className="flex gap-2 text-xs">
                       <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded font-bold">Inv: {fmtSGD(invAtRetirement)}</span>
                       <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded font-bold">CPF: {fmtSGD(cpfAtRetirement)}</span>
                       <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded font-bold">Cash: {fmtSGD(cashAtRetirement)}</span>
                    </div>
                 </div>

                 <div className="border-l border-gray-100 pl-0 md:pl-8">
                    <h4 className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Est. CPF Life Payout (Age 65)</h4>
                    <div className="text-3xl font-extrabold text-blue-600 mb-2">{fmtSGD(estimatedCpfLifePayout)}<span className="text-sm text-gray-400 font-medium">/mo</span></div>
                    <div className="text-xs text-gray-500">
                       Standard Plan estimate based on projected RA balance at 65 (2025 FRS Baseline).
                    </div>
                 </div>
              </div>
           </div>

           {/* SHORTFALL / SURPLUS ANALYSIS */}
           <div className={`p-6 rounded-xl border mb-6 ${brokeAge ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                 <div>
                    <h3 className={`text-lg font-bold m-0 ${brokeAge ? 'text-red-800' : 'text-emerald-800'}`}>
                       {brokeAge ? `⚠️ Money Runs Out at Age ${Math.floor(brokeAge)}` : '✅ Sustainable until Age 95+'}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                       Target Income: <strong>{fmtSGD(expensesToday)}</strong> (today's value)
                    </p>
                 </div>
                 
                 {/* Monthly Gap Calculation at Retirement */}
                 <div className="bg-white/60 p-3 rounded-lg text-right">
                    <div className="text-xs text-gray-500 font-bold uppercase">Monthly Gap (at FI Age {retirementAge})</div>
                    {(() => {
                       // We use the first year of retirement shortfall from projection
                       const firstRetirementYear = projection.find(p => p.age === retirementAge);
                       const shortfall = firstRetirementYear ? firstRetirementYear.shortfallAnnual / 12 : 0;
                       
                       return (
                          <div className={`text-xl font-bold ${shortfall > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                             {shortfall > 0 ? `-${fmtSGD(shortfall)}` : 'Fully Covered'}
                          </div>
                       );
                    })()}
                 </div>
              </div>

              {brokeAge && (
                 <div className="mt-4 text-xs text-red-700 bg-red-100/50 p-3 rounded">
                    <strong>Reality Check:</strong> Your investments and cash are depleted by age {Math.floor(brokeAge)}. 
                    After this, you will rely solely on CPF Life ({fmtSGD(estimatedCpfLifePayout)}/mo), 
                    which is less than your desired lifestyle.
                 </div>
              )}
           </div>

           {/* CHART */}
           <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <h4 className="text-gray-800 font-bold mb-4">Wealth Decumulation Timeline</h4>
              <LineChart
                xLabels={projection.filter((_, i) => i % 5 === 0).map(p => `Age ${Math.floor(p.age)}`)}
                series={[
                  { name: 'Total Net Worth', values: projection.filter((_, i) => i % 5 === 0).map(p => p.totalNetWorth), stroke: '#4f46e5' },
                  { name: 'Investments', values: projection.filter((_, i) => i % 5 === 0).map(p => p.investments), stroke: '#10b981' },
                  { name: 'Cash', values: projection.filter((_, i) => i % 5 === 0).map(p => p.cash), stroke: '#f59e0b' },
                  { name: 'CPF (Total)', values: projection.filter((_, i) => i % 5 === 0).map(p => p.cpfTotal), stroke: '#3b82f6' }
                ]}
                height={300}
                onFormatY={(v) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : `$${(v/1000).toFixed(0)}k`}
              />
           </div>

        </div>
      </div>
    </div>
  );
};

export default RetirementTab;
