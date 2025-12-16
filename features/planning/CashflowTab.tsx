
import React, { useMemo, useState } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { useAi } from '../../contexts/AiContext';
import { toNum, fmtSGD, monthNames } from '../../lib/helpers';
import LineChart from '../../components/common/LineChart';
import PageHeader from '../../components/layout/PageHeader';
import SectionCard from '../../components/layout/SectionCard';
import { CashflowState } from '../../types';

const CashflowTab: React.FC = () => {
  const { 
    cashflowData, 
    expenses, setExpenses,
    customExpenses, setCustomExpenses,
    profile, retirement,
    cashflowState, setCashflowState,
    age, cpfData
  } = useClient();

  const { openAiWithPrompt } = useAi();
  const [ledgerView, setLedgerView] = useState<'yearly' | 'monthly'>('yearly');

  const { projectToAge, bankInterestRate, additionalIncomes, withdrawals, careerEvents = [], customBaseIncome } = cashflowState;
  
  // Handlers for state updates
  const updateState = (key: keyof CashflowState, value: any) => {
    setCashflowState((prev) => ({ ...prev, [key]: value }));
  };

  const currentAge = age;
  const currentYear = new Date().getFullYear();

  // --- HANDLERS ---
  const addCareerEvent = () => setCashflowState(prev => ({...prev, careerEvents: [...(prev.careerEvents||[]), {id: Date.now(), type: 'increment', age: currentAge+1, month: 0, amount: '', durationMonths: '24', notes: ''}]}));
  const updateCareerEvent = (id: number, field: string, val: any) => setCashflowState(prev => ({...prev, careerEvents: (prev.careerEvents||[]).map(e => e.id === id ? {...e, [field]: val} : e)}));
  const removeCareerEvent = (id: number) => setCashflowState(prev => ({...prev, careerEvents: (prev.careerEvents||[]).filter(e => e.id !== id)}));
  
  const addIncome = () => setCashflowState(prev => ({...prev, additionalIncomes: [...prev.additionalIncomes, {id: Date.now(), name: '', amount: '', type: 'recurring', frequency: 'monthly', startAge: currentAge, startMonth: 0, endAge: '', endMonth: 11}]}));
  const updateIncomeItem = (id: number, field: string, val: any) => setCashflowState(prev => ({...prev, additionalIncomes: prev.additionalIncomes.map(i => i.id === id ? {...i, [field]: val} : i)}));
  const removeIncome = (id: number) => setCashflowState(prev => ({...prev, additionalIncomes: prev.additionalIncomes.filter(i => i.id !== id)}));

  const addWithdrawal = () => setCashflowState(prev => ({...prev, withdrawals: [...prev.withdrawals, {id: Date.now(), name: '', amount: '', type: 'onetime', frequency: 'monthly', startAge: currentAge, startMonth: 0, endAge: '', endMonth: 11}]}));
  const updateWithdrawalItem = (id: number, field: string, val: any) => setCashflowState(prev => ({...prev, withdrawals: prev.withdrawals.map(w => w.id === id ? {...w, [field]: val} : w)}));
  const removeWithdrawal = (id: number) => setCashflowState(prev => ({...prev, withdrawals: prev.withdrawals.filter(w => w.id !== id)}));

  // --- CALCULATION ENGINE ---
  const monthlyProjection = useMemo(() => {
    if (!cashflowData) return [];
    const currentMonth = new Date().getMonth();
    const targetAge = parseInt(projectToAge) || 100;
    const totalMonths = Math.max(1, (targetAge - currentAge) * 12);
    const projection: any[] = [];
    
    let balance = toNum(cashflowState.currentSavings, 0);
    const monthlyInterestRate = toNum(bankInterestRate, 0) / 100 / 12;
    
    // Explicitly typing sum as number
    const totalMonthlyExpenses = Object.values(expenses).reduce((sum: number, v) => sum + toNum(v), 0) + customExpenses.reduce((sum: number, v) => sum + toNum(v.amount), 0);
    const fiAge = toNum(profile.retirementAge, 65);
    const effectiveTakeHome = toNum(profile.takeHome) || (cpfData ? toNum(cpfData.takeHome) : 0);
    const defaultActiveIncome = effectiveTakeHome - totalMonthlyExpenses;
    const startBaseIncome = customBaseIncome !== undefined && customBaseIncome !== '' ? toNum(customBaseIncome) : defaultActiveIncome;
    
    let currentActiveIncome = startBaseIncome;
    let isCareerPaused = false;
    let pauseMonthsRemaining = 0;

    // Investment logic
    let monthlyInvestment = 0;
    if (profile.monthlyInvestmentAmount !== undefined && profile.monthlyInvestmentAmount !== '') {
      monthlyInvestment = toNum(profile.monthlyInvestmentAmount);
    } else {
      const investmentPercent = toNum(retirement.investmentPercent, 50);
      monthlyInvestment = currentActiveIncome * (investmentPercent / 100);
    }

    for (let m = 0; m < totalMonths; m++) {
      const ageAtMonth = currentAge + m / 12;
      const monthIndex = (currentMonth + m) % 12;
      const year = currentYear + Math.floor((currentMonth + m) / 12);
      
      // Career Events logic
      const events = careerEvents.filter(e => Math.floor(ageAtMonth) === toNum(e.age) && monthIndex === (e.month||0));
      events.forEach(e => {
         const amt = toNum(e.amount);
         if (e.type === 'increment') currentActiveIncome += amt;
         if (e.type === 'decrement') currentActiveIncome = Math.max(0, currentActiveIncome - amt);
         if (e.type === 'pause') { isCareerPaused = true; pauseMonthsRemaining = toNum(e.durationMonths, 24); }
         if (e.type === 'resume') { isCareerPaused = false; if (amt > 0) currentActiveIncome = amt; }
      });
      if (isCareerPaused) { pauseMonthsRemaining--; if (pauseMonthsRemaining <= 0) isCareerPaused = false; }

      const interestEarned = balance * monthlyInterestRate;
      balance += interestEarned;
      const isRetired = ageAtMonth >= fiAge;
      
      let monthIncome = (!isRetired && !isCareerPaused) ? currentActiveIncome : 0;
      let additionalIncome = 0; 
      let withdrawalAmount = 0;

      // Add. Income
      additionalIncomes.forEach(i => {
         const startM = (toNum(i.startAge) - currentAge)*12 + (toNum(i.startMonth)-currentMonth);
         const endM = i.endAge ? (toNum(i.endAge)-currentAge)*12 + ((i.endMonth||11)-currentMonth) : 9999;
         if (m >= startM && m <= endM) {
            if (i.type === 'onetime' && m === startM) additionalIncome += toNum(i.amount);
            if (i.type === 'recurring') {
               const diff = m - startM;
               let add = false;
               if (i.frequency === 'monthly') add = true;
               if (i.frequency === 'yearly' && diff % 12 === 0) add = true;
               if (add) additionalIncome += toNum(i.amount);
            }
         }
      });

      // Withdrawals
      withdrawals.forEach(w => {
         const startM = (toNum(w.startAge) - currentAge)*12 + (toNum(w.startMonth)-currentMonth);
         // For onetime, startM is the hit month. For recurring, it's the start.
         const endM = w.endAge ? (toNum(w.endAge)-currentAge)*12 + ((w.endMonth||11)-currentMonth) : 9999;
         
         if (w.type === 'onetime') {
             if (m === startM) withdrawalAmount += toNum(w.amount);
         } else {
             // Recurring
             if (m >= startM && m <= endM) {
                 const diff = m - startM;
                 let sub = false;
                 if (w.frequency === 'monthly') sub = true;
                 if (w.frequency === 'yearly' && diff % 12 === 0) sub = true;
                 if (sub) withdrawalAmount += toNum(w.amount);
             }
         }
      });

      // Retirement Expense Logic
      if (isRetired) {
         const baseExp = toNum(profile.customRetirementExpense) || (cashflowData.totalExpenses * 0.7);
         const yearsFromNow = ageAtMonth - currentAge;
         withdrawalAmount += baseExp * Math.pow(1.03, yearsFromNow);
      }

      const totalIncome = monthIncome + additionalIncome;
      const net = totalIncome - withdrawalAmount - (isRetired ? 0 : monthlyInvestment);
      balance += net;

      projection.push({
         age: Math.floor(ageAtMonth),
         monthName: monthNames[monthIndex],
         year,
         totalIncome,
         withdrawal: withdrawalAmount,
         interestEarned,
         netCashflow: net,
         balance,
         isCareerPaused
      });
    }
    return projection;
  }, [cashflowData, cashflowState.currentSavings, projectToAge, additionalIncomes, withdrawals, careerEvents, bankInterestRate, profile, expenses, customExpenses, cpfData, currentAge, customBaseIncome, retirement.investmentPercent]);

  // --- CHART DATA PREP ---
  const chartData = useMemo(() => {
    if (!monthlyProjection.length) return [];
    
    // Initial Point (Now)
    const startBalance = toNum(cashflowState.currentSavings, 0);
    const startPoint = { label: `Age ${currentAge}`, value: startBalance };
    
    // Yearly Points (End of every 12th month, representing end of that year)
    // i=11 is End of Year 1 (approx Age+1)
    const yearlyPoints = monthlyProjection
        .filter((_, i) => (i + 1) % 12 === 0)
        .map(p => ({
            label: `Age ${p.age + 1}`,
            value: p.balance
        }));
    
    // If projection is short, show monthly
    if (monthlyProjection.length < 24) {
       return monthlyProjection.map(p => ({ label: `${p.monthName} ${p.year}`, value: p.balance }));
    }
        
    return [startPoint, ...yearlyPoints];
  }, [monthlyProjection, cashflowState.currentSavings, currentAge]);

  if (!cashflowData) return <div className="p-10 text-center text-gray-400">Loading Cashflow Engine...</div>;

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

      {/* 1. THE HYDRAULIC FLOW SYSTEM */}
      <SectionCard className="border border-gray-200">
         <div className="flex flex-col md:flex-row items-center gap-6 justify-between">
            
            {/* INFLOW */}
            <div className="flex-1 w-full text-center">
               <div className="inline-block p-3 bg-emerald-100 rounded-full text-2xl mb-2">📥</div>
               <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Monthly Inflow</div>
               <div className="text-2xl font-black text-emerald-600">{fmtSGD(cashflowData.takeHome)}</div>
               <div className="text-xs text-gray-500 mt-1">Take-Home Pay</div>
            </div>

            {/* FLOW ARROW */}
            <div className="hidden md:flex flex-col items-center">
               <div className="w-full h-1 bg-gray-200 w-16 relative">
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-gray-400 rounded-full"></div>
               </div>
            </div>

            {/* THE TANK */}
            <div className={`flex-1 w-full p-6 rounded-2xl border-2 text-center relative overflow-hidden ${cashflowData.monthlySavings >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
               <div className="relative z-10">
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-1 opacity-60">Net Free Cash</div>
                  <div className={`text-4xl font-black ${cashflowData.monthlySavings >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                     {cashflowData.monthlySavings >= 0 ? '+' : ''}{fmtSGD(cashflowData.monthlySavings)}
                  </div>
                  <div className="text-xs font-bold opacity-50 mt-2">
                     {cashflowData.savingsRate.toFixed(1)}% Savings Rate
                  </div>
               </div>
            </div>

            {/* FLOW ARROW */}
            <div className="hidden md:flex flex-col items-center">
               <div className="w-full h-1 bg-gray-200 w-16 relative">
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-gray-400 rounded-full"></div>
               </div>
            </div>

            {/* OUTFLOW */}
            <div className="flex-1 w-full text-center">
               <div className="inline-block p-3 bg-red-100 rounded-full text-2xl mb-2">💸</div>
               <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Monthly Burn</div>
               <div className="text-2xl font-black text-red-600">{fmtSGD(cashflowData.totalExpenses)}</div>
               <div className="text-xs text-gray-500 mt-1">Fixed + Variable</div>
            </div>

         </div>
      </SectionCard>

      {/* 2. CAREER EVENTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         <SectionCard title="Career Events" className="lg:col-span-1" action={<button onClick={addCareerEvent} className="text-xs bg-indigo-200 text-indigo-800 px-2 py-1 rounded hover:bg-indigo-300">＋ Add</button>}>
            <div className="space-y-3">
               {careerEvents.map(e => (
                  <div key={e.id} className="bg-white p-3 rounded-xl border border-indigo-50 shadow-sm text-xs">
                     <div className="flex justify-between items-center gap-2 mb-2">
                        <div className="flex items-center gap-1">
                           <label className="text-[10px] font-bold text-indigo-400 uppercase">Age</label>
                           <input 
                              type="number" 
                              value={e.age} 
                              onChange={(ev) => updateCareerEvent(e.id, 'age', parseInt(ev.target.value))}
                              className="w-10 bg-gray-50 border border-indigo-100 rounded px-1 text-center font-bold text-indigo-900 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                           />
                           <select
                              value={e.month || 0}
                              onChange={(ev) => updateCareerEvent(e.id, 'month', parseInt(ev.target.value))}
                              className="bg-gray-50 border border-indigo-100 rounded text-[10px] px-1"
                           >
                              {monthNames.map((m, i) => <option key={i} value={i}>{m}</option>)}
                           </select>
                        </div>
                        <select 
                           value={e.type} 
                           onChange={(ev) => updateCareerEvent(e.id, 'type', ev.target.value)}
                           className="bg-gray-50 border-none rounded text-xs outline-none text-gray-900 font-bold text-right"
                        >
                           <option value="increment">Pay Rise</option>
                           <option value="decrement">Pay Cut</option>
                           <option value="pause">Career Break</option>
                        </select>
                     </div>
                     <div className="flex gap-2">
                        <input 
                           type="text" 
                           placeholder={e.type === 'pause' ? 'Months' : 'Amount $'}
                           value={e.type === 'pause' ? e.durationMonths : e.amount}
                           onChange={(ev) => updateCareerEvent(e.id, e.type === 'pause' ? 'durationMonths' : 'amount', ev.target.value)}
                           className="w-full bg-gray-50 rounded p-1 text-gray-900"
                        />
                        <button onClick={() => removeCareerEvent(e.id)} className="text-red-400">×</button>
                     </div>
                  </div>
               ))}
               {careerEvents.length === 0 && <div className="text-center text-indigo-300 text-xs italic">No future career changes planned.</div>}
            </div>
         </SectionCard>

         <SectionCard title="Liquid Cash Forecast" className="lg:col-span-2">
            <p className="text-xs text-gray-500 mb-6">Projections exclude investment contributions to show actual bank liquidity.</p>
            <LineChart 
               xLabels={chartData.map(p => p.label)}
               series={[{ name: 'Cash Balance', values: chartData.map(p => p.value), stroke: '#10b981' }]}
               height={300}
               onFormatY={(v) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : `$${(v/1000).toFixed(0)}k`}
            />
         </SectionCard>
      </div>

      {/* 3. ADDITIONAL STREAMS & WITHDRAWALS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         
         {/* INCOMES */}
         <SectionCard title="Additional Incomes" action={<button onClick={addIncome} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-200 transition-colors">＋ Add Stream</button>}>
            <div className="space-y-3">
               {additionalIncomes.map(i => (
                  <div key={i.id} className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 text-xs relative group">
                     {/* Row 1: Name & Amount */}
                     <div className="flex gap-2 mb-2">
                        <input 
                           type="text" 
                           value={i.name} 
                           onChange={(e) => updateIncomeItem(i.id, 'name', e.target.value)} 
                           placeholder="Income Name (e.g. Rental)" 
                           className="flex-1 bg-white border border-emerald-200 rounded px-2 py-1 font-bold text-gray-800" 
                        />
                        <input 
                           type="text" 
                           value={i.amount} 
                           onChange={(e) => updateIncomeItem(i.id, 'amount', e.target.value)} 
                           placeholder="$" 
                           className="w-20 bg-white border border-emerald-200 rounded px-2 py-1 text-right font-mono" 
                        />
                     </div>
                     
                     {/* Row 2: Controls */}
                     <div className="flex gap-2 items-center flex-wrap">
                        <select 
                           value={i.type} 
                           onChange={(e) => updateIncomeItem(i.id, 'type', e.target.value)}
                           className="bg-white border border-emerald-200 rounded px-1 py-0.5 text-[10px]"
                        >
                           <option value="recurring">Recurring</option>
                           <option value="onetime">One-Time</option>
                        </select>
                        
                        {i.type === 'recurring' && (
                           <select 
                              value={i.frequency} 
                              onChange={(e) => updateIncomeItem(i.id, 'frequency', e.target.value)}
                              className="bg-white border border-emerald-200 rounded px-1 py-0.5 text-[10px]"
                           >
                              <option value="monthly">Mthly</option>
                              <option value="yearly">Yrly</option>
                           </select>
                        )}

                        <div className="flex items-center gap-1 ml-auto">
                           <span className="text-[10px] text-gray-500">Start:</span>
                           <input 
                              type="number" 
                              value={i.startAge} 
                              onChange={(e) => updateIncomeItem(i.id, 'startAge', e.target.value)}
                              className="w-8 bg-white border border-emerald-200 rounded px-1 py-0.5 text-center text-xs" 
                              title="Start Age"
                           />
                           <select
                              value={i.startMonth || 0}
                              onChange={(e) => updateIncomeItem(i.id, 'startMonth', parseInt(e.target.value))}
                              className="bg-white border border-emerald-200 rounded px-0 py-0.5 text-[10px]"
                              title="Start Month"
                           >
                              {monthNames.map((m, idx) => <option key={idx} value={idx}>{m}</option>)}
                           </select>

                           {i.type === 'recurring' && (
                              <>
                                 <span className="text-[10px] text-gray-500 ml-1">End:</span>
                                 <input 
                                    type="number" 
                                    value={i.endAge || ''} 
                                    onChange={(e) => updateIncomeItem(i.id, 'endAge', e.target.value)}
                                    placeholder="∞"
                                    className="w-8 bg-white border border-emerald-200 rounded px-1 py-0.5 text-center text-xs" 
                                    title="End Age"
                                 />
                                 <select
                                    value={i.endMonth === undefined ? 11 : i.endMonth}
                                    onChange={(e) => updateIncomeItem(i.id, 'endMonth', parseInt(e.target.value))}
                                    className="bg-white border border-emerald-200 rounded px-0 py-0.5 text-[10px]"
                                    title="End Month"
                                 >
                                    {monthNames.map((m, idx) => <option key={idx} value={idx}>{m}</option>)}
                                 </select>
                              </>
                           )}
                        </div>
                     </div>
                     <button onClick={() => removeIncome(i.id)} className="absolute -top-1 -right-1 bg-white text-red-400 border border-gray-200 rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-50 hover:text-red-600 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                  </div>
               ))}
               {additionalIncomes.length === 0 && <div className="text-center text-gray-400 text-xs py-4">No additional income streams.</div>}
            </div>
         </SectionCard>

         {/* EXPENSES */}
         <SectionCard title="Major Expenses" action={<button onClick={addWithdrawal} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 transition-colors">＋ Add Expense</button>}>
            <div className="space-y-3">
               {withdrawals.map(w => (
                  <div key={w.id} className="bg-red-50/50 p-3 rounded-lg border border-red-100 text-xs relative group">
                     {/* Row 1: Name & Amount */}
                     <div className="flex gap-2 mb-2">
                        <input 
                           type="text" 
                           value={w.name} 
                           onChange={(e) => updateWithdrawalItem(w.id, 'name', e.target.value)} 
                           placeholder="Expense Name (e.g. Uni Fees)" 
                           className="flex-1 bg-white border border-red-200 rounded px-2 py-1 font-bold text-gray-800" 
                        />
                        <input 
                           type="text" 
                           value={w.amount} 
                           onChange={(e) => updateWithdrawalItem(w.id, 'amount', e.target.value)} 
                           placeholder="$" 
                           className="w-20 bg-white border border-red-200 rounded px-2 py-1 text-right font-mono text-red-600" 
                        />
                     </div>
                     
                     {/* Row 2: Controls */}
                     <div className="flex gap-2 items-center flex-wrap">
                        <select 
                           value={w.type} 
                           onChange={(e) => updateWithdrawalItem(w.id, 'type', e.target.value)}
                           className="bg-white border border-red-200 rounded px-1 py-0.5 text-[10px]"
                        >
                           <option value="onetime">One-Time</option>
                           <option value="recurring">Recurring</option>
                        </select>
                        
                        {w.type === 'recurring' && (
                           <select 
                              value={w.frequency} 
                              onChange={(e) => updateWithdrawalItem(w.id, 'frequency', e.target.value)}
                              className="bg-white border border-red-200 rounded px-1 py-0.5 text-[10px]"
                           >
                              <option value="monthly">Mthly</option>
                              <option value="yearly">Yrly</option>
                           </select>
                        )}

                        <div className="flex items-center gap-1 ml-auto">
                           <span className="text-[10px] text-gray-500">Start:</span>
                           <input 
                              type="number" 
                              value={w.startAge} 
                              onChange={(e) => updateWithdrawalItem(w.id, 'startAge', e.target.value)}
                              className="w-8 bg-white border border-red-200 rounded px-1 py-0.5 text-center text-xs" 
                              title="Start Age"
                           />
                           <select
                              value={w.startMonth || 0}
                              onChange={(e) => updateWithdrawalItem(w.id, 'startMonth', parseInt(e.target.value))}
                              className="bg-white border border-red-200 rounded px-0 py-0.5 text-[10px]"
                              title="Start Month"
                           >
                              {monthNames.map((m, idx) => <option key={idx} value={idx}>{m}</option>)}
                           </select>

                           {w.type === 'recurring' && (
                              <>
                                 <span className="text-[10px] text-gray-500 ml-1">End:</span>
                                 <input 
                                    type="number" 
                                    value={w.endAge || ''} 
                                    onChange={(e) => updateWithdrawalItem(w.id, 'endAge', e.target.value)}
                                    placeholder="∞"
                                    className="w-8 bg-white border border-red-200 rounded px-1 py-0.5 text-center text-xs" 
                                    title="End Age"
                                 />
                                 <select
                                    value={w.endMonth === undefined ? 11 : w.endMonth}
                                    onChange={(e) => updateWithdrawalItem(w.id, 'endMonth', parseInt(e.target.value))}
                                    className="bg-white border border-red-200 rounded px-0 py-0.5 text-[10px]"
                                    title="End Month"
                                 >
                                    {monthNames.map((m, idx) => <option key={idx} value={idx}>{m}</option>)}
                                 </select>
                              </>
                           )}
                        </div>
                     </div>
                     <button onClick={() => removeWithdrawal(w.id)} className="absolute -top-1 -right-1 bg-white text-red-400 border border-gray-200 rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-50 hover:text-red-600 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                  </div>
               ))}
               {withdrawals.length === 0 && <div className="text-center text-gray-400 text-xs py-4">No major future expenses added.</div>}
            </div>
         </SectionCard>
      </div>

      {/* 4. CASHFLOW LEDGER */}
      <SectionCard 
         title="Cashflow Ledger" 
         noPadding
         action={
            <div className="flex bg-gray-100 p-1 rounded-lg">
               <button 
                  onClick={() => setLedgerView('yearly')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${ledgerView === 'yearly' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-slate-700'}`}
               >
                  Yearly
               </button>
               <button 
                  onClick={() => setLedgerView('monthly')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${ledgerView === 'monthly' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-slate-700'}`}
               >
                  Monthly
               </button>
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
                     <th className="p-4 text-right">Bank Balance</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-100">
                  {monthlyProjection
                     .filter((_, i) => ledgerView === 'monthly' ? true : (i + 1) % 12 === 0)
                     .map((row, idx) => (
                     <tr key={idx} className={`hover:bg-gray-50 transition-colors ${row.monthName === 'Jan' && ledgerView === 'monthly' ? 'bg-indigo-50/30' : ''}`}>
                        <td className="p-4 font-bold text-gray-700 bg-gray-50/30">
                           {ledgerView === 'yearly' ? `Age ${row.age}` : `Age ${row.age} - ${row.monthName}`}
                        </td>
                        <td className="p-4 text-right text-emerald-600">{fmtSGD(row.totalIncome)}</td>
                        <td className="p-4 text-right text-red-500">{fmtSGD(Math.abs(row.withdrawal))}</td>
                        <td className="p-4 text-right font-bold text-indigo-600">{fmtSGD(row.netCashflow)}</td>
                        <td className="p-4 text-right font-mono font-bold text-slate-700">{fmtSGD(row.balance)}</td>
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
