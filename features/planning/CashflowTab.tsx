
import React, { useMemo, useState } from 'react';
import { toNum, fmtSGD, monthNames } from '../../lib/helpers';
import { getBaseRetirementExpense } from '../../lib/calculators';
import { EXPENSE_CATEGORIES } from '../../lib/config';
import LabeledText from '../../components/common/LabeledText';
import LabeledSelect from '../../components/common/LabeledSelect';
import Card from '../../components/common/Card';
import LineChart from '../../components/common/LineChart';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import {
  CpfData,
  Expenses,
  CashflowData,
  Profile,
  CustomExpense,
  RetirementSettings,
  CashflowState,
  CpfState,
  CareerEvent
} from '../../types';

interface CashflowTabProps {
  cpfData: CpfData | null;
  expenses: Expenses;
  setExpenses: (e: Expenses) => void;
  cashflowData: CashflowData | null;
  profile: Profile;
  customExpenses: CustomExpense[];
  setCustomExpenses: (e: CustomExpense[]) => void;
  retirement: RetirementSettings;
  cashflowState: CashflowState;
  setCashflowState: (s: CashflowState | ((prev: CashflowState) => CashflowState)) => void;
  age: number;
  cpfState: CpfState;
}

const CashflowTab: React.FC<CashflowTabProps> = ({
  cpfData,
  expenses,
  setExpenses,
  cashflowData,
  profile,
  customExpenses,
  setCustomExpenses,
  retirement,
  cashflowState,
  setCashflowState,
  age
}) => {
  const {
    currentSavings,
    projectToAge,
    bankInterestRate,
    additionalIncomes,
    withdrawals,
    careerEvents = [],
    customBaseIncome,
    customRetirementIncome
  } = cashflowState;

  const [viewMode, setViewMode] = useState<'summary' | 'monthly'>('summary');
  const [monthsToShow, setMonthsToShow] = useState(120); // Start with 10 years

  const updateState = (key: keyof CashflowState, value: any) => {
    setCashflowState((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const currentAge = age;
  const currentYear = new Date().getFullYear();

  // --- CAREER EVENTS HANDLERS ---
  const addCareerEvent = () => {
    setCashflowState(prev => ({
      ...prev,
      careerEvents: [...(prev.careerEvents || []), {
        id: Date.now(),
        type: 'increment',
        age: currentAge + 1,
        month: 0, // Default Jan
        amount: '',
        durationMonths: '24', // Default for breaks
        notes: ''
      }]
    }));
  };

  const updateCareerEvent = (id: number, field: string, value: any) => {
    setCashflowState(prev => ({
      ...prev,
      careerEvents: (prev.careerEvents || []).map(e => e.id === id ? { ...e, [field]: value } : e)
    }));
  };

  const removeCareerEvent = (id: number) => {
    setCashflowState(prev => ({
      ...prev,
      careerEvents: (prev.careerEvents || []).filter(e => e.id !== id)
    }));
  };

  // --- INCOME & WITHDRAWAL HANDLERS ---
  const addIncome = () => {
    const currentMonth = new Date().getMonth();
    setCashflowState((prev) => ({
      ...prev,
      additionalIncomes: [
        ...prev.additionalIncomes,
        {
          id: Date.now(),
          name: '',
          amount: '',
          type: 'recurring',
          frequency: 'monthly',
          startAge: currentAge,
          startMonth: currentMonth,
          endAge: null,
          endMonth: 11 // Default Dec
        }
      ]
    }));
  };

  const removeIncome = (id: number) => {
    setCashflowState((prev) => ({
      ...prev,
      additionalIncomes: prev.additionalIncomes.filter((i) => i.id !== id)
    }));
  };

  const updateIncomeItem = (id: number, field: string, value: any) => {
    setCashflowState((prev) => ({
      ...prev,
      additionalIncomes: prev.additionalIncomes.map((i) => 
        i.id === id ? { ...i, [field]: value } : i
      )
    }));
  };

  const addWithdrawal = () => {
    const currentMonth = new Date().getMonth();
    setCashflowState((prev) => ({
      ...prev,
      withdrawals: [
        ...prev.withdrawals,
        {
          id: Date.now(),
          name: '',
          amount: '',
          type: 'onetime',
          frequency: 'monthly',
          startAge: currentAge,
          startMonth: currentMonth,
          endAge: '', 
          endMonth: 11 // Default December
        }
      ]
    }));
  };

  const removeWithdrawal = (id: number) => {
    setCashflowState((prev) => ({
      ...prev,
      withdrawals: prev.withdrawals.filter((w) => w.id !== id)
    }));
  };

  const updateWithdrawalItem = (id: number, field: string, value: any) => {
    setCashflowState((prev) => ({
      ...prev,
      withdrawals: prev.withdrawals.map((w) => 
        w.id === id ? { ...w, [field]: value } : w
      )
    }));
  };

  // Calculate monthly projection
  const monthlyProjection = useMemo(() => {
    if (!cashflowData) return [];

    const currentMonth = new Date().getMonth();
    const targetAge = parseInt(projectToAge) || 100;
    const totalMonths = Math.max(1, (targetAge - currentAge) * 12);
    const projection: any[] = [];

    let balance = toNum(currentSavings, 0);
    const monthlyInterestRate = toNum(bankInterestRate, 0) / 100 / 12;

    const totalMonthlyExpenses =
      Object.values(expenses).reduce((sum: number, v) => sum + toNum(v, 0), 0) +
      customExpenses.reduce((sum: number, v) => sum + toNum(v.amount, 0), 0);

    const baseRetirementExpense = getBaseRetirementExpense(
      profile,
      totalMonthlyExpenses,
      cpfData,
      cashflowData
    );

    const fiAge = toNum(profile.retirementAge, 65);

    // Initial Base Income
    const effectiveTakeHome =
      toNum(profile.takeHome) ||
      (cpfData ? toNum(cpfData.takeHome) : 0);

    const defaultActiveIncome = effectiveTakeHome - totalMonthlyExpenses;

    const startBaseIncome =
      customBaseIncome !== undefined && customBaseIncome !== ''
        ? toNum(customBaseIncome)
        : defaultActiveIncome;

    // DYNAMIC VARIABLES for Career Simulation
    let currentActiveIncome = startBaseIncome;
    let isCareerPaused = false;
    let pauseMonthsRemaining = 0;

    for (let m = 0; m < totalMonths; m++) {
      const ageAtMonth = currentAge + m / 12;
      const monthIndex = (currentMonth + m) % 12;
      const yearOffset = Math.floor((currentMonth + m) / 12);
      const year = currentYear + yearOffset;

      // 1. Process Career Events (Trigger once at the specific age and month)
      const eventsThisMonth = careerEvents.filter(e => 
         Math.floor(ageAtMonth) === toNum(e.age) && 
         monthIndex === (e.month !== undefined ? toNum(e.month) : 0)
      );
      
      eventsThisMonth.forEach(event => {
         const amount = toNum(event.amount);
         if (event.type === 'increment') {
            currentActiveIncome += amount;
         } else if (event.type === 'decrement') {
            currentActiveIncome = Math.max(0, currentActiveIncome - amount);
         } else if (event.type === 'pause') {
            isCareerPaused = true;
            pauseMonthsRemaining = toNum(event.durationMonths, 24);
         } else if (event.type === 'resume') {
            isCareerPaused = false;
            pauseMonthsRemaining = 0;
            // Optional: You could set new income on resume if amount is provided
            if (amount > 0) currentActiveIncome = amount;
         }
      });

      // Handle Career Pause Duration
      if (isCareerPaused) {
         pauseMonthsRemaining--;
         if (pauseMonthsRemaining <= 0) {
            isCareerPaused = false;
         }
      }

      // Apply interest
      const interestEarned = balance * monthlyInterestRate;
      balance += interestEarned;

      const isRetired = ageAtMonth >= fiAge;

      // Base cashflow
      let monthIncome = 0;
      if (!isRetired) {
         monthIncome = isCareerPaused ? 0 : currentActiveIncome;
      }

      let additionalIncome = 0;
      let withdrawalAmount = 0;
      let educationExpense = 0;
      let retirementExpense = 0;
      let retirementIncomeVal = 0;

      // Education
      if (profile.children && profile.children.length > 0) {
        const monthlyEduCost = toNum(profile.educationSettings?.monthlyEducationCost, 800);
        const eduStart = toNum(profile.educationSettings?.educationStartAge, 7);
        const eduDuration = toNum(profile.educationSettings?.educationDuration, 10);
        const eduEnd = eduStart + eduDuration;
        const uniCost = toNum(profile.educationSettings?.universityCost, 8750);
        const uniDuration = toNum(profile.educationSettings?.universityDuration, 4);
        const monthlyUniCost = uniCost / 12;

        profile.children.forEach((child) => {
          if (!child.dobISO) return;
          const childDob = new Date(child.dobISO);
          const childAgeAtMonth = ((year - childDob.getFullYear()) * 12 + (monthIndex - childDob.getMonth())) / 12;
          const uniStartAge = child.gender === 'male' ? 21 : 19;

          if (childAgeAtMonth >= eduStart && childAgeAtMonth < eduEnd) {
            educationExpense += monthlyEduCost;
          }
          if (childAgeAtMonth >= uniStartAge && childAgeAtMonth < uniStartAge + uniDuration) {
            educationExpense += monthlyUniCost;
          }
        });
      }
      withdrawalAmount += educationExpense;

      // Retirement
      if (isRetired) {
        if (customRetirementIncome) {
          retirementIncomeVal = toNum(customRetirementIncome);
        }
        if (baseRetirementExpense > 0) {
          const yearsFromNow = ageAtMonth - currentAge;
          retirementExpense = baseRetirementExpense * Math.pow(1.03, yearsFromNow);
          withdrawalAmount += retirementExpense;
        }
      }

      // Investment (Only if working AND not paused)
      let monthlyInvestmentAmount = 0;
      if (!isRetired && !isCareerPaused) {
        if (profile.monthlyInvestmentAmount && toNum(profile.monthlyInvestmentAmount, 0) > 0) {
          monthlyInvestmentAmount = toNum(profile.monthlyInvestmentAmount, 0);
        } else {
          const investmentPercent = toNum(retirement?.investmentPercent, 100);
          monthlyInvestmentAmount = (currentActiveIncome * investmentPercent) / 100;
        }
        withdrawalAmount += monthlyInvestmentAmount;
      }

      // Additional Incomes
      additionalIncomes.forEach((income) => {
        const incomeStartMonth = (toNum(income.startAge) - currentAge) * 12 + (toNum(income.startMonth) - currentMonth);
        
        // Calculate End Month relative to start time
        const endMonthVal = income.endMonth !== undefined ? toNum(income.endMonth) : 11;
        const incomeEndMonth = income.endAge && toNum(income.endAge) > 0 
            ? (toNum(income.endAge) - currentAge) * 12 + (endMonthVal - currentMonth) 
            : Infinity;

        if (m >= incomeStartMonth && m <= incomeEndMonth) {
          if (income.type === 'onetime' && m === incomeStartMonth) {
            additionalIncome += toNum(income.amount, 0);
          } else if (income.type === 'recurring') {
            let shouldAdd = false;
            const monthsSinceStart = m - incomeStartMonth;
            switch (income.frequency) {
              case 'monthly': shouldAdd = true; break;
              case 'quarterly': shouldAdd = monthsSinceStart % 3 === 0; break;
              case 'semiannual': shouldAdd = monthsSinceStart % 6 === 0; break;
              case 'yearly': shouldAdd = monthsSinceStart % 12 === 0; break;
            }
            if (shouldAdd) additionalIncome += toNum(income.amount, 0);
          }
        }
      });

      // Withdrawals (Fixed: Now supports End Age AND End Month)
      withdrawals.forEach((withdrawal) => {
        const withdrawalStartMonth = (toNum(withdrawal.startAge) - currentAge) * 12 + (toNum(withdrawal.startMonth) - currentMonth);
        
        // Calculate End Month index relative to current time
        const endMonthIndex = withdrawal.endMonth !== undefined ? toNum(withdrawal.endMonth) : 11; // Default to Dec
        const withdrawalEndMonth = withdrawal.endAge && toNum(withdrawal.endAge) > 0 
            ? (toNum(withdrawal.endAge) - currentAge) * 12 + (endMonthIndex - currentMonth) 
            : Infinity;

        if (withdrawal.type === 'onetime' && m === withdrawalStartMonth) {
          withdrawalAmount += toNum(withdrawal.amount, 0);
        } else if (withdrawal.type === 'recurring' && m >= withdrawalStartMonth && m <= withdrawalEndMonth) {
          let shouldWithdraw = false;
          const monthsSinceStart = m - withdrawalStartMonth;
          switch (withdrawal.frequency) {
            case 'monthly': shouldWithdraw = true; break;
            case 'quarterly': shouldWithdraw = monthsSinceStart % 3 === 0; break;
            case 'semiannual': shouldWithdraw = monthsSinceStart % 6 === 0; break;
            case 'yearly': shouldWithdraw = monthsSinceStart % 12 === 0; break;
          }
          if (shouldWithdraw) withdrawalAmount += toNum(withdrawal.amount, 0);
        }
      });

      const totalIncome = monthIncome + additionalIncome + retirementIncomeVal;
      const netCashflow = totalIncome - withdrawalAmount;
      balance += netCashflow;

      projection.push({
        month: m,
        age: Math.floor(ageAtMonth),
        ageDecimal: ageAtMonth,
        year,
        monthName: monthNames[monthIndex],
        baseIncome: monthIncome,
        currentActiveBase: currentActiveIncome, // for debugging
        additionalIncome,
        retirementIncome: retirementIncomeVal,
        totalIncome,
        withdrawal: withdrawalAmount,
        educationExpense,
        retirementExpense,
        investmentAmount: monthlyInvestmentAmount,
        interestEarned,
        netCashflow,
        balance,
        isRetired,
        isCareerPaused
      });
    }

    return projection;
  }, [cashflowData, currentSavings, projectToAge, additionalIncomes, withdrawals, careerEvents, bankInterestRate, profile, retirement, expenses, customExpenses, cpfData, currentAge, currentYear, customBaseIncome, customRetirementIncome]);

  const finalBalance = monthlyProjection.length > 0 ? monthlyProjection[monthlyProjection.length - 1].balance : 0;
  const totalIncome = monthlyProjection.reduce<number>((sum, m) => sum + m.totalIncome, 0);
  const totalWithdrawals = monthlyProjection.reduce((sum, m) => sum + m.withdrawal, 0);
  const totalEducationExpense = monthlyProjection.reduce((sum, m) => sum + (m.educationExpense || 0), 0);
  const totalRetirementExpense = monthlyProjection.reduce((sum, m) => sum + (m.retirementExpense || 0), 0);
  const totalInvestmentAmount = monthlyProjection.reduce((sum, m) => sum + (m.investmentAmount || 0), 0);
  const totalInterestEarned = monthlyProjection.reduce((sum, m) => sum + m.interestEarned, 0);
  const fiAge = toNum(profile.retirementAge, 65);

  if (!cashflowData) {
    return <div className="p-5"><Card title="⚠️ Profile Required" value="Please complete profile info first" tone="warn" /></div>;
  }

  const pieData: { name: string; value: number; color: string }[] = EXPENSE_CATEGORIES
    .map((cat, idx) => ({ name: cat.label, value: toNum(expenses[cat.key]), color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'][idx] }))
    .filter((item) => item.value > 0);

  if (customExpenses && customExpenses.length > 0) {
    customExpenses.forEach((exp, idx) => {
      if (toNum(exp.amount) > 0) pieData.push({ name: exp.name || `Custom ${idx + 1}`, value: toNum(exp.amount), color: `hsl(${(idx * 60 + 200) % 360}, 70%, 50%)` });
    });
  }

  return (
    <div className="p-5">
      <div className="bg-gradient-to-br from-emerald-100 to-emerald-200 border-2 border-emerald-500 rounded-xl p-6 mb-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="text-3xl">💸</div>
          <div className="flex-1">
            <h3 className="m-0 text-emerald-800 text-xl font-semibold">
              {profile.name ? `${profile.name}'s Lifetime Cashflow` : 'Lifetime Cashflow'}
            </h3>
            <p className="m-1 text-emerald-800 text-sm opacity-80">
              Planning from Age {currentAge} to {projectToAge}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <Card title="💵 Monthly Take-Home" value={fmtSGD(cashflowData.takeHome)} tone="info" icon="💰" />
        <Card title="🛒 Monthly Expenses" value={fmtSGD(cashflowData.totalExpenses)} tone="danger" icon="📊" />
        <Card title="💎 Monthly Savings" value={fmtSGD(cashflowData.monthlySavings)} tone={cashflowData.monthlySavings >= 0 ? 'success' : 'danger'} icon="💵" />
        <Card title="📈 Savings Rate" value={`${cashflowData.savingsRate.toFixed(1)}%`} tone="info" icon="📊" />
      </div>

      {/* Projection Settings */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 shadow-sm">
        <h3 className="mt-0 mb-4 text-lg font-bold text-gray-800">⚙️ Projection Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <LabeledText label="💰 Current Savings (SGD)" value={currentSavings} onChange={(v) => updateState('currentSavings', v)} placeholder="50000" />
          <LabeledText label="🎯 Project Until Age" type="number" value={projectToAge} onChange={(v) => updateState('projectToAge', v)} placeholder="100" />
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-gray-700">📊 View Mode</label>
            <div className="flex gap-2">
              <button onClick={() => setViewMode('summary')} className={`flex-1 py-2.5 rounded-lg text-xs font-bold ${viewMode === 'summary' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>Summary</button>
              <button onClick={() => setViewMode('monthly')} className={`flex-1 py-2.5 rounded-lg text-xs font-bold ${viewMode === 'monthly' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>Monthly</button>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <LabeledText label="Custom Monthly Savings (Override)" value={customBaseIncome || ''} onChange={(v) => updateState('customBaseIncome', v)} placeholder={fmtSGD(cashflowData.monthlySavings)} />
          <div className="text-[10px] text-gray-500">Calculated from Profile: {fmtSGD(cashflowData.monthlySavings)}. Enter value to override.</div>
        </div>
      </div>

      {/* NEW: CAREER EVENTS SECTION */}
      <div className="bg-white border border-indigo-200 rounded-xl p-6 mb-5 shadow-sm">
         <div className="flex justify-between items-center mb-4">
            <div>
               <h3 className="m-0 text-lg font-bold text-indigo-900">🚀 Career & Income Events</h3>
               <p className="text-xs text-indigo-500 mt-1">
                  Add increments, job pauses, or career pivots to see the real impact.
               </p>
            </div>
            <button onClick={addCareerEvent} className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-200">
               + Add Event
            </button>
         </div>

         {!careerEvents || careerEvents.length === 0 ? (
            <div className="p-4 bg-gray-50 rounded-lg text-center text-xs text-gray-500 italic">
               No events. Projection assumes constant income until retirement.
            </div>
         ) : (
            <div className="grid gap-3">
               {careerEvents.map((event) => (
                  <div key={event.id} className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg flex flex-col md:flex-row gap-3 items-end md:items-center">
                     <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
                        <div className="flex gap-2">
                           <div className="flex-1">
                              <label className="text-[10px] font-bold text-gray-500 uppercase">Age</label>
                              <input type="number" className="w-full p-1 border rounded text-sm bg-white" value={event.age} onChange={(e) => updateCareerEvent(event.id, 'age', e.target.value)} />
                           </div>
                           <div className="w-20">
                              <label className="text-[10px] font-bold text-gray-500 uppercase">Month</label>
                              <select 
                                className="w-full p-1 border rounded text-sm bg-white"
                                value={event.month !== undefined ? event.month : 0} 
                                onChange={(e) => updateCareerEvent(event.id, 'month', e.target.value)}
                              >
                                {monthNames.map((m, i) => (
                                  <option key={i} value={i}>{m}</option>
                                ))}
                              </select>
                           </div>
                        </div>
                        <div>
                           <label className="text-[10px] font-bold text-gray-500 uppercase">Type</label>
                           <select className="w-full p-1 border rounded text-sm bg-white" value={event.type} onChange={(e) => updateCareerEvent(event.id, 'type', e.target.value)}>
                              <option value="increment">📈 Pay Raise (Add)</option>
                              <option value="decrement">📉 Pay Cut (Reduce)</option>
                              <option value="pause">⏸️ Career Break</option>
                              <option value="resume">▶️ Resume Work</option>
                           </select>
                        </div>
                        {event.type === 'pause' ? (
                           <div>
                              <label className="text-[10px] font-bold text-gray-500 uppercase">Duration (Months)</label>
                              <input type="number" className="w-full p-1 border rounded text-sm bg-white" value={event.durationMonths} onChange={(e) => updateCareerEvent(event.id, 'durationMonths', e.target.value)} placeholder="24" />
                           </div>
                        ) : (
                           <div>
                              <label className="text-[10px] font-bold text-gray-500 uppercase">Amount ($)</label>
                              <input type="text" className="w-full p-1 border rounded text-sm bg-white" value={event.amount} onChange={(e) => updateCareerEvent(event.id, 'amount', e.target.value)} placeholder={event.type === 'resume' ? 'New Salary (Opt)' : 'Amount'} />
                           </div>
                        )}
                        <div>
                           <label className="text-[10px] font-bold text-gray-500 uppercase">Note</label>
                           <input type="text" className="w-full p-1 border rounded text-sm bg-white" value={event.notes} onChange={(e) => updateCareerEvent(event.id, 'notes', e.target.value)} placeholder="Promotion / Sabbatical" />
                        </div>
                     </div>
                     <button onClick={() => removeCareerEvent(event.id)} className="text-red-500 hover:bg-red-50 p-2 rounded">×</button>
                  </div>
               ))}
            </div>
         )}
      </div>

      {/* Additional Income & Withdrawals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-5">
         
         {/* INCOMES */}
         <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4">
               <div>
                  <h3 className="m-0 text-sm font-bold text-emerald-800">➕ Other Incomes</h3>
                  <p className="text-[10px] text-gray-500 m-0">Rental, side-hustle, dividends</p>
               </div>
               <button onClick={addIncome} className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-200 transition-colors">+ Add Income</button>
            </div>
            
            {additionalIncomes.length === 0 && (
               <div className="text-center p-4 bg-gray-50 rounded-lg text-xs text-gray-400 italic">No additional incomes added.</div>
            )}

            <div className="space-y-3">
               {additionalIncomes.map((income) => (
                  <div key={income.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs">
                     <div className="flex justify-between mb-2">
                        <input 
                           type="text" 
                           placeholder="Income Name" 
                           className="font-bold bg-transparent outline-none w-full text-gray-800 placeholder-gray-400"
                           value={income.name}
                           onChange={(e) => updateIncomeItem(income.id, 'name', e.target.value)}
                        />
                        <button onClick={() => removeIncome(income.id)} className="text-red-400 hover:text-red-600 font-bold ml-2">×</button>
                     </div>
                     
                     <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                           <label className="block text-[9px] font-bold text-gray-400 uppercase">Amount</label>
                           <input 
                              type="text" 
                              placeholder="0" 
                              className="w-full p-1 border rounded bg-white"
                              value={income.amount}
                              onChange={(e) => updateIncomeItem(income.id, 'amount', e.target.value)}
                           />
                        </div>
                        <div>
                           <label className="block text-[9px] font-bold text-gray-400 uppercase">Type</label>
                           <select 
                              className="w-full p-1 border rounded bg-white"
                              value={income.type}
                              onChange={(e) => updateIncomeItem(income.id, 'type', e.target.value)}
                           >
                              <option value="recurring">Recurring</option>
                              <option value="onetime">One-time</option>
                           </select>
                        </div>
                     </div>

                     <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-1">
                           <label className="block text-[9px] font-bold text-gray-400 uppercase">Start Age</label>
                           <input 
                              type="number" 
                              className="w-full p-1 border rounded bg-white"
                              value={income.startAge}
                              onChange={(e) => updateIncomeItem(income.id, 'startAge', e.target.value)}
                           />
                        </div>
                        <div className="col-span-1">
                           <label className="block text-[9px] font-bold text-gray-400 uppercase">Month</label>
                           <select 
                              className="w-full p-1 border rounded bg-white"
                              value={income.startMonth || 0}
                              onChange={(e) => updateIncomeItem(income.id, 'startMonth', e.target.value)}
                           >
                              {monthNames.map((m, i) => <option key={i} value={i}>{m}</option>)}
                           </select>
                        </div>
                        {income.type === 'recurring' && (
                           <>
                              <div className="col-span-1">
                                 <label className="block text-[9px] font-bold text-gray-400 uppercase">Frequency</label>
                                 <select 
                                    className="w-full p-1 border rounded bg-white"
                                    value={income.frequency}
                                    onChange={(e) => updateIncomeItem(income.id, 'frequency', e.target.value)}
                                 >
                                    <option value="monthly">Monthly</option>
                                    <option value="quarterly">Quarterly</option>
                                    <option value="semiannual">Semi-Annual</option>
                                    <option value="yearly">Yearly</option>
                                 </select>
                              </div>
                              <div className="col-span-1">
                                 <label className="block text-[9px] font-bold text-gray-400 uppercase">End Age</label>
                                 <input 
                                    type="number" 
                                    placeholder="Optional"
                                    className="w-full p-1 border rounded bg-white"
                                    value={income.endAge || ''}
                                    onChange={(e) => updateIncomeItem(income.id, 'endAge', e.target.value)}
                                 />
                              </div>
                              <div className="col-span-1">
                                 <label className="block text-[9px] font-bold text-gray-400 uppercase">End Month</label>
                                 <select 
                                    className="w-full p-1 border rounded bg-white"
                                    value={income.endMonth !== undefined ? income.endMonth : 11}
                                    onChange={(e) => updateIncomeItem(income.id, 'endMonth', e.target.value)}
                                 >
                                    {monthNames.map((m, i) => <option key={i} value={i}>{m}</option>)}
                                 </select>
                              </div>
                           </>
                        )}
                     </div>
                  </div>
               ))}
            </div>
         </div>

         {/* WITHDRAWALS */}
         <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4">
               <div>
                  <h3 className="m-0 text-sm font-bold text-red-800">💳 Big Expenses</h3>
                  <p className="text-[10px] text-gray-500 m-0">Renovation, wedding, car, medical</p>
               </div>
               <button onClick={addWithdrawal} className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-lg font-bold hover:bg-red-200 transition-colors">+ Add Expense</button>
            </div>

            {withdrawals.length === 0 && (
               <div className="text-center p-4 bg-gray-50 rounded-lg text-xs text-gray-400 italic">No major expenses added.</div>
            )}

            <div className="space-y-3">
               {withdrawals.map((w) => (
                  <div key={w.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs">
                     <div className="flex justify-between mb-2">
                        <input 
                           type="text" 
                           placeholder="Expense Name" 
                           className="font-bold bg-transparent outline-none w-full text-gray-800 placeholder-gray-400"
                           value={w.name}
                           onChange={(e) => updateWithdrawalItem(w.id, 'name', e.target.value)}
                        />
                        <button onClick={() => removeWithdrawal(w.id)} className="text-red-400 hover:text-red-600 font-bold ml-2">×</button>
                     </div>
                     
                     <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                           <label className="block text-[9px] font-bold text-gray-400 uppercase">Amount</label>
                           <input 
                              type="text" 
                              placeholder="0" 
                              className="w-full p-1 border rounded bg-white"
                              value={w.amount}
                              onChange={(e) => updateWithdrawalItem(w.id, 'amount', e.target.value)}
                           />
                        </div>
                        <div>
                           <label className="block text-[9px] font-bold text-gray-400 uppercase">Type</label>
                           <select 
                              className="w-full p-1 border rounded bg-white"
                              value={w.type}
                              onChange={(e) => updateWithdrawalItem(w.id, 'type', e.target.value)}
                           >
                              <option value="onetime">One-time</option>
                              <option value="recurring">Recurring</option>
                           </select>
                        </div>
                     </div>

                     <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <div className="col-span-1">
                           <label className="block text-[9px] font-bold text-gray-400 uppercase">Start Age</label>
                           <input 
                              type="number" 
                              className="w-full p-1 border rounded bg-white"
                              value={w.startAge}
                              onChange={(e) => updateWithdrawalItem(w.id, 'startAge', e.target.value)}
                           />
                        </div>
                        <div className="col-span-1">
                           <label className="block text-[9px] font-bold text-gray-400 uppercase">Start Month</label>
                           <select 
                              className="w-full p-1 border rounded bg-white"
                              value={w.startMonth || 0}
                              onChange={(e) => updateWithdrawalItem(w.id, 'startMonth', e.target.value)}
                           >
                              {monthNames.map((m, i) => <option key={i} value={i}>{m}</option>)}
                           </select>
                        </div>
                        {w.type === 'recurring' && (
                           <>
                           <div className="col-span-1">
                              <label className="block text-[9px] font-bold text-gray-400 uppercase">Freq</label>
                              <select 
                                 className="w-full p-1 border rounded bg-white"
                                 value={w.frequency}
                                 onChange={(e) => updateWithdrawalItem(w.id, 'frequency', e.target.value)}
                              >
                                 <option value="monthly">Monthly</option>
                                 <option value="quarterly">Quarterly</option>
                                 <option value="semiannual">Semi-Annual</option>
                                 <option value="yearly">Yearly</option>
                              </select>
                           </div>
                           <div className="col-span-1">
                               <label className="block text-[9px] font-bold text-gray-400 uppercase">End Age</label>
                               <input 
                                  type="number" 
                                  className="w-full p-1 border rounded bg-white"
                                  value={w.endAge || ''}
                                  onChange={(e) => updateWithdrawalItem(w.id, 'endAge', e.target.value)}
                                  placeholder="Optional"
                               />
                           </div>
                           <div className="col-span-1">
                               <label className="block text-[9px] font-bold text-gray-400 uppercase">End Month</label>
                               <select 
                                  className="w-full p-1 border rounded bg-white"
                                  value={w.endMonth !== undefined ? w.endMonth : 11}
                                  onChange={(e) => updateWithdrawalItem(w.id, 'endMonth', e.target.value)}
                               >
                                  {monthNames.map((m, i) => <option key={i} value={i}>{m}</option>)}
                               </select>
                           </div>
                           </>
                        )}
                     </div>
                  </div>
               ))}
            </div>
         </div>
      </div>

      {/* Projection Summary Grid */}
      {monthlyProjection.length > 0 && (
          <div className="mt-5 p-4 bg-emerald-50 rounded-lg border-2 border-emerald-500 mb-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-[10px] text-emerald-800 mb-1">Starting Balance</div>
                <div className="text-lg font-bold text-emerald-800">{fmtSGD(currentSavings)}</div>
              </div>
              <div>
                <div className="text-[10px] text-emerald-800 mb-1">Total Income</div>
                <div className="text-lg font-bold text-emerald-800">{fmtSGD(totalIncome)}</div>
              </div>
              <div>
                <div className="text-[10px] text-blue-700 mb-1">💰 Interest Earned</div>
                <div className="text-lg font-bold text-blue-700">{fmtSGD(totalInterestEarned)}</div>
                <div className="text-[9px] text-blue-600">@ {bankInterestRate}% p.a.</div>
              </div>
              <div>
                <div className="text-[10px] text-emerald-800 mb-1">Final Balance @ Age {projectToAge}</div>
                <div className={`text-lg font-bold ${finalBalance >= 0 ? 'text-emerald-800' : 'text-red-600'}`}>{fmtSGD(finalBalance)}</div>
              </div>
            </div>
          </div>
      )}

      {/* Projection Chart */}
      {monthlyProjection.length > 0 && (
        <div className="bg-white rounded-xl p-6 mb-5 shadow-sm border border-gray-200">
          <h3 className="mt-0 text-lg font-bold text-gray-800 mb-4">📈 Cash Balance Trajectory</h3>
          <LineChart
            xLabels={monthlyProjection.filter((_, i) => i % 12 === 0).map(m => `Age ${m.age}`)}
            series={[{ name: 'Projected Balance', values: monthlyProjection.filter((_, i) => i % 12 === 0).map(m => m.balance), stroke: '#10b981' }]}
            height={300}
            onFormatY={(v) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : `$${(v/1000).toFixed(0)}k`}
          />
        </div>
      )}

      {/* Monthly Table */}
      {viewMode === 'monthly' && monthlyProjection.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-5 shadow-sm">
          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full border-collapse text-xs min-w-[900px]">
              <thead className="sticky top-0 z-10 shadow-sm">
                <tr className="bg-gray-100 border-b-2 border-gray-300 text-gray-700">
                  <th className="p-3 text-left font-bold bg-gray-100">Date/Age</th>
                  <th className="p-3 text-right font-bold text-emerald-700 bg-gray-100">Income</th>
                  <th className="p-3 text-right font-bold text-blue-600 bg-gray-100">Interest</th>
                  <th className="p-3 text-right font-bold text-amber-600 bg-gray-100">Invest</th>
                  <th className="p-3 text-right font-bold text-red-600 bg-gray-100">Expense</th>
                  <th className="p-3 text-right font-bold bg-gray-100">Net Flow</th>
                  <th className="p-3 text-right font-bold bg-gray-100">Balance</th>
                </tr>
              </thead>
              <tbody>
                {monthlyProjection.slice(0, monthsToShow).map((row, idx) => (
                  <tr key={idx} className={`border-b border-gray-100 hover:bg-gray-50 ${row.isCareerPaused ? 'bg-orange-50' : ''}`}>
                    <td className="p-3 font-medium">
                       {row.monthName} {row.year} <span className="text-gray-400">({row.age})</span>
                       {row.isCareerPaused && <span className="ml-2 text-[10px] bg-orange-200 text-orange-800 px-1 rounded">PAUSED</span>}
                    </td>
                    <td className="p-3 text-right text-emerald-600">{fmtSGD(row.totalIncome)}</td>
                    <td className="p-3 text-right text-blue-600">{fmtSGD(row.interestEarned)}</td>
                    <td className="p-3 text-right text-amber-600">{fmtSGD(row.investmentAmount)}</td>
                    <td className="p-3 text-right text-red-500">{fmtSGD(row.withdrawal)}</td>
                    <td className={`p-3 text-right font-bold ${row.netCashflow >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtSGD(row.netCashflow)}</td>
                    <td className={`p-3 text-right font-extrabold ${row.balance >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>{fmtSGD(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {monthlyProjection.length > monthsToShow && (
             <div className="p-3 text-center bg-gray-50">
                <button onClick={() => setMonthsToShow(prev => prev + 120)} className="text-blue-600 font-bold hover:underline">Show Next 10 Years</button>
             </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CashflowTab;
