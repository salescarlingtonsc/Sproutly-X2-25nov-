
import React, { useMemo, useState } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { useAi } from '../../contexts/AiContext';
import { toNum, fmtSGD, monthNames, parseDob } from '../../lib/helpers';
import LineChart from '../../components/common/LineChart';
import PageHeader from '../../components/layout/PageHeader';
import SectionCard from '../../components/layout/SectionCard';
import LabeledText from '../../components/common/LabeledText';
import { CashflowState } from '../../types';

const CashflowTab: React.FC = () => {
  const { 
    cashflowData, 
    expenses, setExpenses,
    customExpenses, setCustomExpenses,
    profile, setProfile, 
    retirement,
    cashflowState, setCashflowState,
    investorState,
    age, cpfData
  } = useClient();

  const { openAiWithPrompt } = useAi();
  const [ledgerView, setLedgerView] = useState<'yearly' | 'monthly'>('yearly');
  const [showWealthView, setShowWealthView] = useState(false); 

  const { currentSavings, projectToAge, bankInterestRate, additionalIncomes, withdrawals, careerEvents = [], customBaseIncome } = cashflowState;
  
  const updateState = (key: keyof CashflowState, value: any) => {
    setCashflowState((prev) => ({ ...prev, [key]: value }));
  };

  const currentAge = age || 30; 
  const currentYear = new Date().getFullYear();
  const currentMonthIndex = new Date().getMonth(); 

  // --- HANDLERS ---
  const addCareerEvent = () => setCashflowState(prev => ({...prev, careerEvents: [...(prev.careerEvents||[]), {id: Date.now(), type: 'increment', age: currentAge+1, month: 0, amount: '', durationMonths: '24', notes: ''}]}));
  const updateCareerEvent = (id: number, field: string, val: any) => setCashflowState(prev => ({...prev, careerEvents: (prev.careerEvents||[]).map(e => e.id === id ? {...e, [field]: val} : e)}));
  const removeCareerEvent = (id: number) => setCashflowState(prev => ({...prev, careerEvents: (prev.careerEvents||[]).filter(e => e.id !== id)}));
  
  const addIncome = () => setCashflowState(prev => ({...prev, additionalIncomes: [...prev.additionalIncomes, {id: Date.now(), name: '', amount: '', type: 'recurring', frequency: 'monthly', startAge: currentAge, startMonth: currentMonthIndex, endAge: '', endMonth: 11, isEnabled: true}]}));
  const updateIncomeItem = (id: number, field: string, val: any) => setCashflowState(prev => ({...prev, additionalIncomes: prev.additionalIncomes.map(i => i.id === id ? {...i, [field]: val} : i)}));
  const removeIncome = (id: number) => setCashflowState(prev => ({...prev, additionalIncomes: prev.additionalIncomes.filter(i => i.id !== id)}));

  const addWithdrawal = () => setCashflowState(prev => ({...prev, withdrawals: [...prev.withdrawals, {id: Date.now(), name: '', amount: '', type: 'onetime', frequency: 'monthly', startAge: currentAge, startMonth: currentMonthIndex, endAge: '', endMonth: 11, isEnabled: true}]}));
  const updateWithdrawalItem = (id: number, field: string, val: any) => setCashflowState(prev => ({...prev, withdrawals: prev.withdrawals.map(w => w.id === id ? {...w, [field]: val} : w)}));
  const removeWithdrawal = (id: number) => setCashflowState(prev => ({...prev, withdrawals: prev.withdrawals.filter(w => w.id !== id)}));

  const toggleEnabled = (current: boolean | undefined) => current === false ? true : false;

  // --- CALCULATION ENGINE ---
  const monthlyProjection = useMemo(() => {
    if (!cashflowData) return [];
    
    const now = new Date();
    const startYear = now.getFullYear();
    const startMonth = now.getMonth();
    const dobDate = profile.dob ? parseDob(profile.dob) : null;
    
    const getExactAge = (targetDate: Date) => {
        if (!dobDate) return currentAge + (targetDate.getFullYear() - startYear) + (targetDate.getMonth() - startMonth)/12;
        let years = targetDate.getFullYear() - dobDate.getFullYear();
        let m = targetDate.getMonth() - dobDate.getMonth();
        if (m < 0 || (m === 0 && targetDate.getDate() < dobDate.getDate())) years--;
        return years + (m < 0 ? 12 + m : m)/12;
    };

    const targetAge = parseInt(projectToAge) || 100;
    const totalMonths = Math.max(1, (targetAge - currentAge) * 12);
    const projection: any[] = [];
    
    // --- SCENARIO 1: ACTUAL (Invests) ---
    let balance = toNum(currentSavings, 0);
    let wealthBalance = toNum(investorState?.portfolioValue, 0);
    
    // --- SCENARIO 2: LAZY (No Investment) ---
    // Assuming 'lazy' means we keep current savings in bank, AND future surplus goes to bank.
    let lazyBalance = toNum(currentSavings, 0); 

    const monthlyInterestRate = (toNum(bankInterestRate, 0) / 100) / 12;
    const wealthReturnRateAnnual = toNum(retirement.customReturnRate, 5.0) / 100;
    const wealthReturnRateMonthly = Math.pow(1 + wealthReturnRateAnnual, 1/12) - 1;

    const totalMonthlyExpenses = Object.values(expenses).reduce((sum: number, v) => sum + toNum(v), 0) + customExpenses.reduce((sum: number, v) => sum + toNum(v.amount), 0);
    const fiAge = toNum(profile.retirementAge, 65);
    const effectiveTakeHome = toNum(profile.takeHome) || (cpfData ? toNum(cpfData.takeHome) : 0);
    const defaultActiveIncome = effectiveTakeHome - totalMonthlyExpenses;
    const startBaseIncome = customBaseIncome !== undefined && customBaseIncome !== '' ? toNum(customBaseIncome) : defaultActiveIncome;
    
    let currentActiveIncome = startBaseIncome;
    let isCareerPaused = false;
    let pauseMonthsRemaining = 0;

    let monthlyInvestment = 0;
    if (profile.monthlyInvestmentAmount !== undefined && profile.monthlyInvestmentAmount !== '') {
      monthlyInvestment = toNum(profile.monthlyInvestmentAmount);
    } else {
      const investmentPercent = toNum(retirement.investmentPercent, 50);
      monthlyInvestment = (effectiveTakeHome - totalMonthlyExpenses) * (investmentPercent / 100);
    }

    let yearlyIncomeAccumulator = 0;
    let yearlyWithdrawalAccumulator = 0;
    let yearlyNetAccumulator = 0;

    for (let m = 0; m < totalMonths; m++) {
      const stepDate = new Date(startYear, startMonth + m, 1);
      const stepYear = stepDate.getFullYear();
      const stepMonthIndex = stepDate.getMonth();
      const ageAtMonth = getExactAge(stepDate);
      const flooredAge = Math.floor(ageAtMonth);
      
      // Career Events
      const events = careerEvents.filter(e => Math.floor(ageAtMonth) === toNum(e.age) && stepMonthIndex === (e.month||0));
      events.forEach(e => {
         const amt = toNum(e.amount);
         if (e.type === 'increment') currentActiveIncome += amt;
         if (e.type === 'decrement') currentActiveIncome = Math.max(0, currentActiveIncome - amt);
         if (e.type === 'pause') { isCareerPaused = true; pauseMonthsRemaining = toNum(e.durationMonths, 24); }
         if (e.type === 'resume') { isCareerPaused = false; if (amt > 0) currentActiveIncome = amt; }
      });
      if (isCareerPaused) { pauseMonthsRemaining--; if (pauseMonthsRemaining <= 0) isCareerPaused = false; }

      // INTEREST (Start of month balance)
      const interestEarned = balance > 0 ? balance * monthlyInterestRate : 0;
      balance += interestEarned;

      const lazyInterest = lazyBalance > 0 ? lazyBalance * monthlyInterestRate : 0;
      lazyBalance += lazyInterest;
      
      const isRetired = ageAtMonth >= fiAge;
      
      let monthIncome = (!isRetired && !isCareerPaused) ? currentActiveIncome : 0;
      let additionalIncome = 0; 
      let withdrawalAmount = 0;

      // Add. Income
      additionalIncomes.forEach(i => {
         if (i.isEnabled === false) return;
         let startM = (toNum(i.startAge) - currentAge)*12 + (toNum(i.startMonth)-startMonth);
         const endM = i.endAge ? (toNum(i.endAge)-currentAge)*12 + ((i.endMonth||11)-startMonth) : 9999;
         if (i.type === 'onetime' && startM < 0 && startM > -12) startM = 0;

         if (m >= startM && m <= endM) {
            if (i.type === 'onetime') { if (m === startM) additionalIncome += toNum(i.amount); }
            else if (i.type === 'recurring') {
               const diff = m - startM;
               let add = false;
               if (i.frequency === 'monthly') add = true;
               if (i.frequency === 'quarterly' && diff % 3 === 0) add = true;
               if (i.frequency === 'semi_annual' && diff % 6 === 0) add = true;
               if (i.frequency === 'yearly' && diff % 12 === 0) add = true;
               if (add) additionalIncome += toNum(i.amount);
            }
         }
      });

      // Withdrawals
      withdrawals.forEach(w => {
         if (w.isEnabled === false) return;
         let startM = (toNum(w.startAge) - currentAge)*12 + (toNum(w.startMonth)-startMonth);
         const endM = w.endAge ? (toNum(w.endAge)-currentAge)*12 + ((w.endMonth||11)-startMonth) : 9999;
         if (w.type === 'onetime' && startM < 0 && startM > -12) startM = 0;

         if (w.type === 'onetime') { if (m === startM) withdrawalAmount += toNum(w.amount); }
         else {
             if (m >= startM && m <= endM) {
                 const diff = m - startM;
                 let sub = false;
                 if (w.frequency === 'monthly') sub = true;
                 if (w.frequency === 'quarterly' && diff % 3 === 0) sub = true;
                 if (w.frequency === 'semi_annual' && diff % 6 === 0) sub = true;
                 if (w.frequency === 'yearly' && diff % 12 === 0) sub = true;
                 if (sub) withdrawalAmount += toNum(w.amount);
             }
         }
      });

      if (isRetired) {
         const baseExp = toNum(profile.customRetirementExpense) || (totalMonthlyExpenses * 0.7);
         const yearsFromNow = ageAtMonth - currentAge;
         withdrawalAmount += baseExp * Math.pow(1.03, yearsFromNow);
      }

      const totalIncome = monthIncome + additionalIncome;
      const netSurplus = totalIncome - withdrawalAmount;

      // 1. ACTUAL PATH: Subtract investment from cash
      const netActual = netSurplus - (isRetired ? 0 : monthlyInvestment);
      balance += netActual;

      // 2. LAZY PATH: Keep investment in cash
      // If retired, we assume no new investment anyway, so netSurplus is same.
      // If working, we keep the monthlyInvestment in the bank.
      lazyBalance += netSurplus;

      // WEALTH GROWTH
      if (!isRetired) {
          wealthBalance += monthlyInvestment;
      }
      wealthBalance *= (1 + wealthReturnRateMonthly);

      yearlyIncomeAccumulator += totalIncome;
      yearlyWithdrawalAccumulator += withdrawalAmount;
      yearlyNetAccumulator += netActual;

      const isCycleEnd = (m + 1) % 12 === 0 || m === totalMonths - 1;

      projection.push({
         age: flooredAge,
         monthName: monthNames[stepMonthIndex],
         year: stepYear,
         totalIncome,
         withdrawal: withdrawalAmount,
         netCashflow: netActual,
         balance: balance, // Actual Cash
         lazyBalance: lazyBalance, // Hypothetical Cash (No Inv)
         wealthBalance: wealthBalance,
         totalAssets: balance + wealthBalance, // Net Worth
         isCareerPaused,
         hasAdditionalIncome: additionalIncome > 0,
         hasLargeWithdrawal: withdrawalAmount > 0,
         annualIncomeSnapshot: yearlyIncomeAccumulator,
         annualWithdrawalSnapshot: yearlyWithdrawalAccumulator,
         annualNetSnapshot: yearlyNetAccumulator
      });

      if (isCycleEnd) {
          yearlyIncomeAccumulator = 0;
          yearlyWithdrawalAccumulator = 0;
          yearlyNetAccumulator = 0;
      }
    }
    return projection;
  }, [cashflowData, currentSavings, projectToAge, additionalIncomes, withdrawals, careerEvents, bankInterestRate, profile, expenses, customExpenses, cpfData, currentAge, customBaseIncome, retirement.investmentPercent, investorState, retirement.customReturnRate]);

  // --- CHART DATA PREP ---
  const chartData = useMemo(() => {
    if (!monthlyProjection.length) return [];
    
    const startBalance = toNum(currentSavings, 0);
    const startWealth = toNum(investorState?.portfolioValue, 0);
    const startTotal = startBalance + startWealth;

    const startPoint = { 
        label: `Age ${currentAge}`, 
        value: startBalance, // Lazy path starts at current savings
        wealth: startTotal,   // Wealth path starts at total net worth
        liquidity: startBalance
    };
    
    const yearlyPoints = monthlyProjection
        .filter((_, i) => (i + 1) % 12 === 0)
        .map(p => ({
            label: `Age ${p.age + 1}`,
            value: p.lazyBalance, // Mapped to Green Line (Standard Savings)
            wealth: p.totalAssets, // Mapped to Purple Line (Total Wealth)
            liquidity: p.balance // Mapped to Blue Dotted (Actual Liquidity) - Optional
        }));
        
    if (monthlyProjection.length < 24) {
       return monthlyProjection.map(p => ({ 
           label: `${p.monthName} ${p.year}`, 
           value: p.lazyBalance,
           wealth: p.totalAssets,
           liquidity: p.balance
       }));
    }
    return [startPoint, ...yearlyPoints];
  }, [monthlyProjection, currentSavings, currentAge, investorState]);

  if (!cashflowData) return <div className="p-10 text-center text-gray-400">Loading Cashflow Engine...</div>;

  const firstMonth = monthlyProjection[0];
  const startNet = firstMonth ? firstMonth.netCashflow : 0;
  const projectedOneYear = monthlyProjection[11] ? monthlyProjection[11].balance : toNum(currentSavings);
  const startBal = toNum(currentSavings);
  const runwayMonths = (startNet < 0 && startBal > 0) ? (startBal / Math.abs(startNet)) : 0;

  const effectiveTakeHome = toNum(profile.takeHome) || (cpfData ? toNum(cpfData.takeHome) : 0);
  const totalMonthlyExpenses = cashflowData ? cashflowData.totalExpenses : 0;
  let displayedMonthlyInvestment = 0;
  if (profile.monthlyInvestmentAmount !== undefined && profile.monthlyInvestmentAmount !== '') {
    displayedMonthlyInvestment = toNum(profile.monthlyInvestmentAmount);
  } else {
    const investmentPercent = toNum(retirement.investmentPercent, 50);
    displayedMonthlyInvestment = Math.max(0, (effectiveTakeHome - totalMonthlyExpenses) * (investmentPercent / 100));
  }

  // Value difference at retirement
  const retireAge = toNum(profile.retirementAge, 65);
  const retireState = monthlyProjection.find(p => p.age === retireAge) || monthlyProjection[monthlyProjection.length - 1];
  const wealthGain = retireState ? (retireState.totalAssets - retireState.lazyBalance) : 0;

  const headerAction = (
    <button 
      onClick={() => openAiWithPrompt("Analyze this cashflow data. Identify potential liquidity risks or surplus opportunities based on the income, expenses, and savings rate.")}
      className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
    >
      <span>🧠</span> AI Analysis
    </button>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      
      <PageHeader 
        title="Cashflow Architecture" 
        icon="📊" 
        subtitle="Manage liquidity, income streams, and major liabilities."
        action={headerAction}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
         {/* 1. INITIALIZATION PANEL */}
         <SectionCard title="Initialization" className="lg:col-span-1 flex flex-col h-full">
            <div className="space-y-4 flex-1">
               <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Current Client Age</div>
                  <div className="flex justify-between items-center">
                      <span className="text-xl font-black text-slate-700">{age} Years</span>
                      <span className="text-[10px] font-mono text-slate-400 bg-white px-2 py-1 rounded border border-slate-200">
                          Born: {profile.dob ? new Date(profile.dob).getFullYear() : '?'}
                      </span>
                  </div>
               </div>

               <LabeledText 
                  label="Starting Bank Balance ($)" 
                  value={currentSavings} 
                  onChange={(v) => updateState('currentSavings', v)} 
                  placeholder="0"
                  isCurrency
               />
               <LabeledText 
                  label="Bank Interest (%)" 
                  value={bankInterestRate} 
                  onChange={(v) => updateState('bankInterestRate', v)} 
                  type="number"
                  placeholder="0.05"
               />
               <LabeledText 
                  label="Monthly Investments ($)" 
                  value={profile.monthlyInvestmentAmount} 
                  onChange={(v) => setProfile({ ...profile, monthlyInvestmentAmount: v })} 
                  placeholder="0"
                  isCurrency
               />
               <LabeledText 
                  label="Project To Age" 
                  value={projectToAge} 
                  onChange={(v) => updateState('projectToAge', v)} 
                  type="number"
                  placeholder="100"
               />
            </div>
            
            {/* FORECAST SNAPSHOT */}
            <div className={`mt-6 p-4 rounded-xl border border-dashed transition-colors ${startNet < 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-2 text-gray-500">12-Month Outlook</div>
                <div className="flex justify-between items-end">
                    <div>
                        <div className={`text-xl font-black ${projectedOneYear < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                            {fmtSGD(projectedOneYear)}
                        </div>
                        <div className="text-[10px] text-gray-400 font-medium">
                            {projectedOneYear < 0 ? 'Projected Overdraft' : 'Projected Balance'}
                        </div>
                    </div>
                    {startNet < 0 && startBal > 0 && (
                        <div className="text-right">
                            <div className="text-lg font-black text-red-500">{runwayMonths < 12 ? runwayMonths.toFixed(1) : '12+'}</div>
                            <div className="text-[10px] text-red-400 font-bold uppercase">Mths Runway</div>
                        </div>
                    )}
                </div>
                
                <div className="mt-3 pt-3 border-t border-dashed border-gray-200 text-[10px] space-y-1">
                    <div className="flex justify-between text-gray-500">
                        <span>Monthly Surplus</span>
                        <span>{fmtSGD(cashflowData.monthlySavings)}</span>
                    </div>
                    {displayedMonthlyInvestment > 0 && (
                        <div className="flex justify-between text-indigo-500">
                            <span>Monthly Investments</span>
                            <span>-{fmtSGD(displayedMonthlyInvestment)}</span>
                        </div>
                    )}
                    <div className="flex justify-between font-bold border-t border-gray-100 pt-1">
                        <span>Net Monthly Flow</span>
                        <span className={startNet < 0 ? 'text-red-600' : 'text-emerald-600'}>
                            {startNet < 0 ? '' : '+'}{fmtSGD(startNet)}
                        </span>
                    </div>
                </div>
            </div>
         </SectionCard>

         {/* 2. HYDRAULIC FLOW */}
         <SectionCard className="lg:col-span-3 border border-gray-200">
            <div className="flex flex-col md:flex-row items-center gap-6 justify-between h-full">
               <div className="flex-1 w-full text-center">
                  <div className="inline-block p-3 bg-emerald-100 rounded-full text-2xl mb-2">📥</div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Monthly Inflow</div>
                  <div className="text-xl md:text-2xl font-black text-emerald-600">{fmtSGD(cashflowData.takeHome)}</div>
                  <div className="text-xs text-gray-500 mt-1">Take-Home Pay</div>
               </div>

               <div className="hidden md:flex flex-col items-center"><div className="w-full h-1 bg-gray-200 w-16 relative"><div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-gray-400 rounded-full"></div></div></div>

               <div className={`flex-1 w-full p-6 rounded-2xl border-2 text-center relative overflow-hidden ${cashflowData.monthlySavings >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="relative z-10">
                     <div className="text-[10px] font-bold uppercase tracking-widest mb-1 opacity-60">Net Free Cash</div>
                     <div className={`text-2xl md:text-3xl font-black break-words ${cashflowData.monthlySavings >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {cashflowData.monthlySavings >= 0 ? '+' : ''}{fmtSGD(cashflowData.monthlySavings)}
                     </div>
                     <div className="text-xs font-bold opacity-50 mt-2">{cashflowData.savingsRate.toFixed(1)}% Savings Rate</div>
                  </div>
               </div>

               <div className="hidden md:flex flex-col items-center"><div className="w-full h-1 bg-gray-200 w-16 relative"><div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-gray-400 rounded-full"></div></div></div>

               <div className="flex-1 w-full text-center">
                  <div className="inline-block p-3 bg-red-100 rounded-full text-2xl mb-2">💸</div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Monthly Expenses</div>
                  <div className="text-xl md:text-2xl font-black text-red-600">{fmtSGD(cashflowData.totalExpenses)}</div>
                  <div className="text-xs text-gray-500 mt-1">Fixed + Variable</div>
               </div>
               
               {displayedMonthlyInvestment > 0 && (
                   <>
                       <div className="hidden md:flex flex-col items-center"><div className="w-full h-1 bg-gray-200 w-16 relative"><div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-indigo-400 rounded-full"></div></div></div>
                       <div className="flex-1 w-full text-center opacity-80">
                          <div className="inline-block p-3 bg-indigo-50 rounded-full text-2xl mb-2 border border-indigo-100">📈</div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Monthly Investments</div>
                          <div className="text-xl md:text-2xl font-black text-indigo-600">{fmtSGD(displayedMonthlyInvestment)}</div>
                          <div className="text-xs text-gray-500 mt-1">To Portfolio</div>
                          
                          <div className="mt-2 inline-block bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1">
                              <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Proj @ Age {profile.retirementAge}</div>
                              <div className="text-xs font-black text-indigo-700">{fmtSGD(retireState?.wealthBalance || 0)}</div>
                          </div>
                       </div>
                   </>
               )}
            </div>
         </SectionCard>
      </div>

      {/* 3. CAREER & CHART */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         <SectionCard title="Career Events" className="lg:col-span-1" action={<button onClick={addCareerEvent} className="text-xs bg-indigo-200 text-indigo-800 px-2 py-1 rounded hover:bg-indigo-300">＋ Add</button>}>
            <div className="space-y-3">
               {careerEvents.map(e => (
                  <div key={e.id} className="bg-white p-3 rounded-xl border border-indigo-50 shadow-sm text-xs">
                     <div className="flex justify-between items-center gap-2 mb-2">
                        <div className="flex items-center gap-1">
                           <label className="text-[10px] font-bold text-indigo-400 uppercase">Age</label>
                           <input type="number" value={e.age} onChange={(ev) => updateCareerEvent(e.id, 'age', parseInt(ev.target.value))} className="w-10 bg-gray-50 border border-indigo-100 rounded px-1 text-center font-bold text-indigo-900 text-xs focus:ring-1 focus:ring-indigo-500 outline-none" />
                           <select value={e.month || 0} onChange={(ev) => updateCareerEvent(e.id, 'month', parseInt(ev.target.value))} className="bg-gray-50 border border-indigo-100 rounded text-[10px] px-1">
                              {monthNames.map((m, i) => <option key={i} value={i}>{m}</option>)}
                           </select>
                        </div>
                        <select value={e.type} onChange={(ev) => updateCareerEvent(e.id, 'type', ev.target.value)} className="bg-gray-50 border-none rounded text-xs outline-none text-gray-900 font-bold text-right">
                           <option value="increment">Pay Rise</option>
                           <option value="decrement">Pay Cut</option>
                           <option value="pause">Career Break</option>
                        </select>
                     </div>
                     <div className="flex gap-2">
                        <input type="text" placeholder={e.type === 'pause' ? 'Months' : 'Amount $'} value={e.type === 'pause' ? e.durationMonths : e.amount} onChange={(ev) => updateCareerEvent(e.id, e.type === 'pause' ? 'durationMonths' : 'amount', ev.target.value)} className="w-full bg-gray-50 rounded p-1 text-gray-900" />
                        <button onClick={() => removeCareerEvent(e.id)} className="text-red-400">×</button>
                     </div>
                  </div>
               ))}
               {careerEvents.length === 0 && <div className="text-center text-indigo-300 text-xs italic">No future career changes planned.</div>}
            </div>
         </SectionCard>

         <SectionCard 
            title="Projections" 
            className="lg:col-span-2"
            action={
               <button 
                  onClick={() => setShowWealthView(!showWealthView)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border ${showWealthView ? 'bg-purple-100 text-purple-700 border-purple-200 shadow-inner' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
               >
                  {showWealthView ? 'Show Cash Only' : 'Show Wealth Effect'}
               </button>
            }
         >
            <div className="flex justify-between items-start mb-6">
                <p className="text-xs text-gray-500 max-w-lg">
                   {showWealthView 
                      ? "Visualizing the 'Wealth Effect'. The gap between standard cash savings and total net worth (including investments)." 
                      : "Visualizing 'Cash Only' trajectory. Assumes all surplus is kept in the bank (no investment returns)."}
                </p>
                {showWealthView && (
                   <div className="text-right">
                      <div className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Investment Alpha</div>
                      <div className="text-2xl font-black text-purple-600">+{fmtSGD(wealthGain)}</div>
                      <div className="text-[9px] text-slate-400">Added Wealth @ Age {retireAge}</div>
                   </div>
                )}
            </div>

            <LineChart 
               xLabels={chartData.map(p => p.label)}
               series={[
                   // When WEALTH view: Show Total Assets (Purple)
                   ...(showWealthView ? [{ name: 'Total Wealth (Invested)', values: chartData.map(p => p.wealth || 0), stroke: '#8b5cf6' }] : []),
                   // Always show the "Lazy Cash" line as the baseline/default
                   { name: 'Projected Savings (Cash Only)', values: chartData.map(p => p.value), stroke: '#10b981' },
                   // Optional: Actual Liquidity (Dotted) in wealth view to show liquidity risk?
                   ...(showWealthView ? [{ name: 'Liquid Cash', values: chartData.map(p => p.liquidity || 0), stroke: '#94a3b8' }] : [])
               ]}
               height={300}
               onFormatY={(v) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : `$${(v/1000).toFixed(0)}k`}
            />
         </SectionCard>
      </div>

      {/* 4. ADDITIONAL STREAMS & WITHDRAWALS (Existing Code Omitted for brevity, assumed same) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <SectionCard title="Additional Incomes" action={<button onClick={addIncome} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-200 transition-colors">＋ Add Stream</button>}>
            <div className="space-y-3">
               {additionalIncomes.map(i => (
                  <div key={i.id} className={`bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 text-xs relative group transition-opacity duration-300 ${i.isEnabled === false ? 'opacity-50 grayscale' : ''}`}>
                     <div className="flex gap-2 mb-2 items-center">
                        <button onClick={() => updateIncomeItem(i.id, 'isEnabled', toggleEnabled(i.isEnabled))} className={`w-8 h-4 rounded-full transition-colors relative ${i.isEnabled !== false ? 'bg-emerald-500' : 'bg-slate-300'}`}><div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${i.isEnabled !== false ? 'right-0.5' : 'left-0.5'}`}></div></button>
                        <input type="text" value={i.name} onChange={(e) => updateIncomeItem(i.id, 'name', e.target.value)} placeholder="Income Name" className="flex-1 bg-white border border-emerald-200 rounded px-2 py-1 font-bold text-gray-800" />
                        <input type="text" value={i.amount} onChange={(e) => updateIncomeItem(i.id, 'amount', e.target.value)} placeholder="$" className="w-20 bg-white border border-emerald-200 rounded px-2 py-1 text-right font-mono" />
                     </div>
                     <div className="flex gap-2 items-center flex-wrap">
                        <select value={i.type} onChange={(e) => updateIncomeItem(i.id, 'type', e.target.value)} className="bg-white border border-emerald-200 rounded px-1 py-0.5 text-[10px]"><option value="recurring">Recurring</option><option value="onetime">One-Time</option></select>
                        <div className="flex items-center gap-1 ml-auto">
                           <span className="text-[10px] text-gray-500">Start:</span>
                           <input type="number" value={i.startAge} onChange={(e) => updateIncomeItem(i.id, 'startAge', e.target.value)} className="w-8 bg-white border border-emerald-200 rounded px-1 py-0.5 text-center text-xs" />
                           {i.type === 'recurring' && <><span className="text-[10px] text-gray-500 ml-1">End:</span><input type="number" value={i.endAge || ''} onChange={(e) => updateIncomeItem(i.id, 'endAge', e.target.value)} placeholder="∞" className="w-8 bg-white border border-emerald-200 rounded px-1 py-0.5 text-center text-xs" /></>}
                        </div>
                     </div>
                     <button onClick={() => removeIncome(i.id)} className="absolute -top-1 -right-1 bg-white text-red-400 border border-gray-200 rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-50 hover:text-red-600 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                  </div>
               ))}
               {additionalIncomes.length === 0 && <div className="text-center text-gray-400 text-xs py-4">No additional income streams.</div>}
            </div>
         </SectionCard>

         <SectionCard title="Major Expenses" action={<button onClick={addWithdrawal} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 transition-colors">＋ Add Expense</button>}>
            <div className="space-y-3">
               {withdrawals.map(w => (
                  <div key={w.id} className={`bg-red-50/50 p-3 rounded-lg border border-red-100 text-xs relative group transition-opacity duration-300 ${w.isEnabled === false ? 'opacity-50 grayscale' : ''}`}>
                     <div className="flex gap-2 mb-2 items-center">
                        <button onClick={() => updateWithdrawalItem(w.id, 'isEnabled', toggleEnabled(w.isEnabled))} className={`w-8 h-4 rounded-full transition-colors relative ${w.isEnabled !== false ? 'bg-red-500' : 'bg-slate-300'}`}><div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${w.isEnabled !== false ? 'right-0.5' : 'left-0.5'}`}></div></button>
                        <input type="text" value={w.name} onChange={(e) => updateWithdrawalItem(w.id, 'name', e.target.value)} placeholder="Expense Name" className="flex-1 bg-white border border-red-200 rounded px-2 py-1 font-bold text-gray-800" />
                        <input type="text" value={w.amount} onChange={(e) => updateWithdrawalItem(w.id, 'amount', e.target.value)} placeholder="$" className="w-20 bg-white border border-red-200 rounded px-2 py-1 text-right font-mono text-red-600" />
                     </div>
                     <div className="flex gap-2 items-center flex-wrap">
                        <select value={w.type} onChange={(e) => updateWithdrawalItem(w.id, 'type', e.target.value)} className="bg-white border border-red-200 rounded px-1 py-0.5 text-[10px]"><option value="onetime">One-Time</option><option value="recurring">Recurring</option></select>
                        <div className="flex items-center gap-1 ml-auto">
                           <span className="text-[10px] text-gray-500">Start:</span>
                           <input type="number" value={w.startAge} onChange={(e) => updateWithdrawalItem(w.id, 'startAge', e.target.value)} className="w-8 bg-white border border-red-200 rounded px-1 py-0.5 text-center text-xs" />
                           {w.type === 'recurring' && <><span className="text-[10px] text-gray-500 ml-1">End:</span><input type="number" value={w.endAge || ''} onChange={(e) => updateWithdrawalItem(w.id, 'endAge', e.target.value)} placeholder="∞" className="w-8 bg-white border border-red-200 rounded px-1 py-0.5 text-center text-xs" /></>}
                        </div>
                     </div>
                     <button onClick={() => removeWithdrawal(w.id)} className="absolute -top-1 -right-1 bg-white text-red-400 border border-gray-200 rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-50 hover:text-red-600 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                  </div>
               ))}
               {withdrawals.length === 0 && <div className="text-center text-gray-400 text-xs py-4">No major future expenses added.</div>}
            </div>
         </SectionCard>
      </div>

      {/* 5. CASHFLOW LEDGER */}
      <SectionCard 
         title="Cashflow Ledger" 
         noPadding
         action={
            <div className="flex bg-gray-100 p-1 rounded-lg">
               <button onClick={() => setLedgerView('yearly')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${ledgerView === 'yearly' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-slate-700'}`}>Yearly</button>
               <button onClick={() => setLedgerView('monthly')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${ledgerView === 'monthly' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-slate-700'}`}>Monthly</button>
            </div>
         }
      >
         <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-sm text-left">
               <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase sticky top-0 z-10">
                  <tr>
                     <th className="p-4 w-32">Timeframe</th>
                     <th className="p-4 text-right">Free Cash Flow</th>
                     <th className="p-4 text-right">Withdrawals</th>
                     <th className="p-4 text-right text-indigo-600">Net Growth</th>
                     <th className="p-4 text-right text-emerald-600">{showWealthView ? 'Liquid Cash (Bank)' : 'Cash Savings'}</th>
                     {showWealthView && <th className="p-4 text-right text-purple-600">Total Wealth</th>}
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-100">
                  {monthlyProjection
                     .filter((_, i) => ledgerView === 'monthly' ? true : (i + 1) % 12 === 0)
                     .map((row, idx) => (
                     <tr 
                        key={idx} 
                        className={`hover:bg-gray-50 transition-colors ${row.monthName === 'Jan' && ledgerView === 'monthly' ? 'bg-indigo-50/30' : ''}`}
                     >
                        <td className="p-4 font-bold text-gray-700 bg-gray-50/30">
                           {ledgerView === 'yearly' ? `Age ${row.age}` : `Age ${row.age} - ${row.monthName} ${row.year}`}
                        </td>
                        <td className="p-4 text-right text-emerald-600">
                            {fmtSGD(ledgerView === 'yearly' ? row.annualIncomeSnapshot : row.totalIncome)}
                        </td>
                        <td className="p-4 text-right text-red-500">
                            {fmtSGD(Math.abs(ledgerView === 'yearly' ? row.annualWithdrawalSnapshot : row.withdrawal))}
                        </td>
                        <td className={`p-4 text-right font-bold ${(ledgerView === 'yearly' ? row.annualNetSnapshot : row.netCashflow) < 0 ? 'text-red-500' : 'text-indigo-600'}`}>
                            {fmtSGD(ledgerView === 'yearly' ? row.annualNetSnapshot : row.netCashflow)}
                        </td>
                        <td className="p-4 text-right font-mono font-bold text-emerald-600 bg-emerald-50/20">{fmtSGD(showWealthView ? row.balance : row.lazyBalance)}</td>
                        {showWealthView && (
                            <td className="p-4 text-right font-mono font-black text-purple-600 border-l border-purple-100 bg-purple-50/30">
                                {fmtSGD(row.totalAssets)}
                            </td>
                        )}
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </SectionCard>

    </div>
  );
};

export default CashflowTab;
