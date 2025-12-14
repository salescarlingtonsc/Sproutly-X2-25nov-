
import React, { useMemo, useState } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { useAi } from '../../contexts/AiContext';
import { toNum, fmtSGD } from '../../lib/helpers';
import { projectComprehensiveWealth, runMonteCarloSimulation } from '../../lib/calculators';
import LabeledText from '../../components/common/LabeledText';
import LineChart from '../../components/common/LineChart';
import PageHeader from '../../components/layout/PageHeader';
import SectionCard from '../../components/layout/SectionCard';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'; // Using advanced chart for layers

const RetirementTab: React.FC = () => {
  const { 
    cashflowData, retirement, setRetirement, profile, age,
    investorState, setInvestorState, cpfState, cashflowState
  } = useClient();

  const { openAiWithPrompt } = useAi();
  const [showMonteCarlo, setShowMonteCarlo] = useState(false); 
  const [viewMode, setViewMode] = useState<'wealth' | 'income'>('income'); // New View Mode

  if (!cashflowData) return <div className="p-10 text-center text-gray-400">Please complete the Profile & Cashflow tabs first.</div>;

  // --- 1. DATA PREP ---
  const currentAge = age;
  const retirementAge = toNum(profile.retirementAge, 65);
  const currentCash = toNum(cashflowState.currentSavings, 0);
  const monthlyCashSavings = cashflowState.customBaseIncome && cashflowState.customBaseIncome !== '' 
      ? toNum(cashflowState.customBaseIncome) : cashflowData.monthlySavings;
  const bankRate = toNum(cashflowState.bankInterestRate, 0.05) / 100;
  const currentInvestments = toNum(investorState.portfolioValue, 0);
  
  let monthlyInvestment = 0;
  if (profile.monthlyInvestmentAmount !== undefined && profile.monthlyInvestmentAmount !== '') {
    monthlyInvestment = toNum(profile.monthlyInvestmentAmount);
  } else {
    const investmentPercent = toNum(retirement.investmentPercent, 50);
    monthlyInvestment = monthlyCashSavings * (investmentPercent / 100);
  }
  
  const investmentRatePercent = toNum(retirement.customReturnRate, 5.0);
  const investmentRate = investmentRatePercent / 100;
  const inflationRate = 0.03;

  const currentCpf = { oa: toNum(cpfState.currentBalances.oa, 0), sa: toNum(cpfState.currentBalances.sa, 0), ma: toNum(cpfState.currentBalances.ma, 0) };
  const grossIncome = toNum(profile.grossSalary) || toNum(profile.monthlyIncome) || 0;
  const expensesToday = toNum(profile.customRetirementExpense) || (cashflowData.totalExpenses * 0.7);

  // --- 2. PROJECTIONS ---
  const projection = useMemo(() => {
    return projectComprehensiveWealth({
      currentAge, retirementAge, currentCpf, currentCash, currentInvestments,
      monthlyIncome: grossIncome, monthlyCashSavings, monthlyInvestment,
      rates: { cpfOa: 0.025, cpfSa: 0.04, cash: bankRate, investments: investmentRate, inflation: inflationRate },
      expensesToday
    });
  }, [currentAge, retirementAge, currentCpf, currentCash, currentInvestments, grossIncome, monthlyCashSavings, monthlyInvestment, bankRate, investmentRate, expensesToday]);

  // --- 3. INCOME LAYERING LOGIC (Master Feature) ---
  const incomeLayers = useMemo(() => {
     return projection.filter(p => p.age >= retirementAge).map(p => {
        const totalExpense = p.expensesAnnual;
        const guaranteed = p.cpfLifePayoutAnnual;
        const variableWithdrawal = Math.max(0, totalExpense - guaranteed);
        
        // Check if we actually have the wealth to support variable withdrawal
        // We assume 4% withdrawal rate from Liquid Wealth (Investments + Cash)
        const safeWithdrawalCap = (p.totalLiquidWealth * 0.04);
        const actualVariable = Math.min(variableWithdrawal, safeWithdrawalCap);
        const gap = Math.max(0, variableWithdrawal - actualVariable);

        return {
           age: p.age,
           expense: Math.round(totalExpense),
           guaranteed: Math.round(guaranteed),
           variable: Math.round(actualVariable),
           gap: Math.round(gap),
           totalIncome: Math.round(guaranteed + actualVariable)
        };
     });
  }, [projection, retirementAge]);

  const retirementSnapshot = projection.find(p => p.age === retirementAge) || projection[projection.length - 1];
  const monthlyCpfLife = (projection.find(p => p.age === 65)?.cpfLifePayoutAnnual || 0) / 12;
  const projectedMonthlyExpense = expensesToday * Math.pow(1 + inflationRate, retirementAge - currentAge);
  const guaranteedRatio = Math.min(100, (monthlyCpfLife / projectedMonthlyExpense) * 100);

  const headerAction = (
    <button onClick={() => openAiWithPrompt("Analyze the income layering strategy. Is the reliance on variable investment income too high given the client's age? Suggest an annuity blend.")} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors">
      <span>🤖</span> AI Strategy Review
    </button>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <PageHeader title="Retirement Master Plan" icon="🏛️" subtitle="Architecting sustainable income streams." action={headerAction} />

      {/* 1. KEY METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <SectionCard className="flex flex-col justify-between">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Target Monthly Income</div>
            <div className="text-3xl font-black text-slate-800">{fmtSGD(expensesToday)}</div>
            <div className="text-xs text-slate-500 mt-1">Today's Value</div>
            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between">
               <span className="text-xs text-gray-400">At Age {retirementAge} (Inflation Adj)</span>
               <span className="text-sm font-bold text-slate-700">{fmtSGD(projectedMonthlyExpense)}</span>
            </div>
         </SectionCard>

         <SectionCard className="flex flex-col justify-between">
            <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Projected Nest Egg</div>
            <div className="text-3xl font-black text-emerald-700">{fmtSGD(retirementSnapshot.totalNetWorth)}</div>
            <div className="text-xs text-emerald-600/70 mt-1">Total Assets @ {retirementAge}</div>
            <div className="mt-4 pt-4 border-t border-emerald-50 flex justify-between">
               <span className="text-xs text-emerald-600/70">Liquid Investable</span>
               <span className="text-sm font-bold text-emerald-700">{fmtSGD(retirementSnapshot.totalLiquidWealth)}</span>
            </div>
         </SectionCard>

         <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col justify-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/30 rounded-full blur-xl"></div>
            <div className="relative z-10">
               <div className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-2">Safety Score</div>
               <div className="flex items-end gap-2 mb-1">
                  <div className="text-5xl font-black">{guaranteedRatio.toFixed(0)}%</div>
                  <div className="text-sm font-bold text-indigo-200 mb-2">Guaranteed</div>
               </div>
               <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500" style={{ width: `${guaranteedRatio}%` }}></div>
               </div>
               <p className="text-[10px] text-slate-400 mt-3">
                  {guaranteedRatio < 40 ? '⚠️ High risk. Reliance on market performance.' : '✅ Secure floor. Basics covered by CPF/Annuity.'}
               </p>
            </div>
         </div>
      </div>

      {/* 2. VISUALIZATION DECK */}
      <SectionCard title="Retirement Roadmap" 
         action={
            <div className="flex bg-gray-100 p-1 rounded-lg">
               <button onClick={() => setViewMode('income')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${viewMode === 'income' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>Income Layers</button>
               <button onClick={() => setViewMode('wealth')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${viewMode === 'wealth' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>Wealth Curve</button>
            </div>
         }
      >
         <div className="h-[350px] w-full">
            <ResponsiveContainer>
               {viewMode === 'income' ? (
                  <AreaChart data={incomeLayers} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                     <defs>
                        <linearGradient id="colorGuaranteed" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                           <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                        </linearGradient>
                        <linearGradient id="colorVariable" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                           <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                        </linearGradient>
                     </defs>
                     <XAxis dataKey="age" fontSize={10} tickLine={false} axisLine={false} />
                     <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                     <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(v: number) => fmtSGD(v)} />
                     <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                     
                     <Area type="monotone" dataKey="guaranteed" stackId="1" stroke="#3b82f6" fill="url(#colorGuaranteed)" name="CPF Life / Guaranteed" />
                     <Area type="monotone" dataKey="variable" stackId="1" stroke="#10b981" fill="url(#colorVariable)" name="Portfolio Drawdown" />
                     <Area type="monotone" dataKey="gap" stackId="1" stroke="#ef4444" fill="#fee2e2" name="Income Gap (Shortfall)" />
                  </AreaChart>
               ) : (
                  <LineChart 
                     xLabels={projection.filter((_, i) => i % 5 === 0).map(p => `Age ${Math.floor(p.age)}`)}
                     series={[
                        { name: 'Total Wealth', values: projection.filter((_, i) => i % 5 === 0).map(p => p.totalNetWorth), stroke: '#4f46e5' },
                        { name: 'Investments', values: projection.filter((_, i) => i % 5 === 0).map(p => p.investments), stroke: '#10b981' },
                        { name: 'Cash', values: projection.filter((_, i) => i % 5 === 0).map(p => p.cash), stroke: '#f59e0b' }
                     ]}
                     height={350}
                     onFormatY={(v) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : `$${(v/1000).toFixed(0)}k`}
                  />
               )}
            </ResponsiveContainer>
         </div>
      </SectionCard>

      {/* 3. CONTROL PANEL */}
      <SectionCard title="Calibration">
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <LabeledText label="Investment Return (%)" value={investmentRatePercent} onChange={(v) => setRetirement({...retirement, customReturnRate: v})} type="number" />
            <LabeledText label="Target Monthly Income" value={profile.customRetirementExpense || ''} onChange={(v) => setRetirement({...retirement, initialSavings: v})} placeholder={fmtSGD(expensesToday)} />
            <div className="pt-2">
               <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Monthly Investment</div>
               <div className="text-xl font-bold text-indigo-600">{fmtSGD(monthlyInvestment)}</div>
            </div>
         </div>
      </SectionCard>
    </div>
  );
};

export default RetirementTab;
