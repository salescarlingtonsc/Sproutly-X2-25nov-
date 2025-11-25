
import React, { useMemo, useState, useRef } from 'react';
import { toNum, fmtSGD, monthNames } from '../../lib/helpers';
import LabeledText from '../../components/common/LabeledText';
import Card from '../../components/common/Card';
import LabeledSelect from '../../components/common/LabeledSelect';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { CpfData, Expenses, CashflowData, Profile, CustomExpense, RetirementSettings, CashflowState } from '../../types';

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
  setCashflowState: (s: CashflowState) => void;
  age: number;
}

const CashflowTab: React.FC<CashflowTabProps> = ({ 
  cpfData, expenses, setExpenses, cashflowData, profile, customExpenses, setCustomExpenses, retirement,
  cashflowState, setCashflowState, age
}) => {
  // Safely destructure with defaults to prevent crashes
  const { 
    currentSavings = '', 
    projectToAge = '100', 
    bankInterestRate = '0.05', 
    additionalIncomes = [], 
    withdrawals = [], 
    customBaseIncome = '', 
    customRetirementIncome = '' 
  } = cashflowState || {};

  const [viewMode, setViewMode] = useState<'summary' | 'monthly'>('summary');
  const [monthsToShow, setMonthsToShow] = useState(120); // Start with 10 years
  
  // Refs for scrolling
  const baseIncomeRef = useRef<HTMLDivElement>(null);
  const retirementIncomeRef = useRef<HTMLDivElement>(null);

  const updateState = (key: keyof CashflowState, value: any) => {
    setCashflowState({ ...cashflowState, [key]: value });
  };

  const currentAge = age || 30; 
  const retirementAge = toNum(profile.retirementAge, 65);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  
  // Scroll handlers
  const scrollToBaseIncome = () => {
    if (baseIncomeRef.current) {
      baseIncomeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // highlight effect
      baseIncomeRef.current.classList.add('ring-4', 'ring-blue-300');
      setTimeout(() => baseIncomeRef.current?.classList.remove('ring-4', 'ring-blue-300'), 1500);
      
      const input = baseIncomeRef.current.querySelector('input');
      if (input) input.focus();
    }
  };

  const scrollToRetireIncome = () => {
    if (retirementIncomeRef.current) {
      retirementIncomeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // highlight effect
      retirementIncomeRef.current.classList.add('ring-4', 'ring-amber-300');
      setTimeout(() => retirementIncomeRef.current?.classList.remove('ring-4', 'ring-amber-300'), 1500);

      const input = retirementIncomeRef.current.querySelector('input');
      if (input) input.focus();
    }
  };

  // Add income
  const addIncome = () => {
    updateState('additionalIncomes', [...additionalIncomes, {
      id: Date.now(),
      name: '',
      amount: '',
      type: 'recurring',
      frequency: 'monthly',
      startAge: currentAge,
      startMonth: currentMonth,
      endAge: null
    }]);
  };
  
  const removeIncome = (id: number) => {
    updateState('additionalIncomes', additionalIncomes.filter(i => i.id !== id));
  };
  
  const updateIncomeItem = (id: number, field: string, value: any) => {
    updateState('additionalIncomes', additionalIncomes.map(i => i.id === id ? { ...i, [field]: value } : i));
  };
  
  // Add withdrawal
  const addWithdrawal = () => {
    updateState('withdrawals', [...withdrawals, {
      id: Date.now(),
      name: '',
      amount: '',
      type: 'onetime',
      frequency: 'monthly',
      startAge: currentAge,
      startMonth: currentMonth
    }]);
  };
  
  const removeWithdrawal = (id: number) => {
    updateState('withdrawals', withdrawals.filter(w => w.id !== id));
  };
  
  const updateWithdrawalItem = (id: number, field: string, value: any) => {
    updateState('withdrawals', withdrawals.map(w => w.id === id ? { ...w, [field]: value } : w));
  };
  
  // Calculate monthly projection
  const monthlyProjection = useMemo(() => {
    if (!cashflowData) return [];
    
    const targetAge = parseInt(projectToAge) || 100;
    const totalMonths = Math.max(1, (targetAge - currentAge) * 12);
    const projection = [];
    
    let balance = toNum(currentSavings, 0);
    const monthlyInterestRate = toNum(bankInterestRate, 0) / 100 / 12;

    // Determine Base Income (Override logic)
    // If user typed something, use it. Else use calculated default.
    const baseSavings = customBaseIncome !== undefined && customBaseIncome !== '' 
        ? toNum(customBaseIncome) 
        : cashflowData.monthlySavings;
    
    for (let m = 0; m < totalMonths; m++) {
      const ageAtMonth = currentAge + (m / 12);
      
      // STRICT RETIREMENT CHECK
      const isRetired = ageAtMonth >= retirementAge;

      const monthIndex = (currentMonth + m) % 12;
      const yearOffset = Math.floor((currentMonth + m) / 12);
      const year = currentYear + yearOffset;
      
      // Apply interest
      const interestEarned = balance * monthlyInterestRate;
      balance += interestEarned;
      
      // Base cashflow logic
      // STRICT RULE: If retired, Base Income (Salary Savings) is 0, unless overwritten by customRetirementIncome.
      let monthIncome = 0;
      let retirementIncomeVal = 0;

      if (isRetired) {
         // Check if custom retirement income is set
         if (customRetirementIncome !== undefined && customRetirementIncome !== '') {
            retirementIncomeVal = toNum(customRetirementIncome);
         } else {
            retirementIncomeVal = 0;
         }
      } else {
         monthIncome = baseSavings;
      }
      
      let additionalIncome = 0;
      let withdrawalAmount = 0;
      let educationExpense = 0;
      
      // Calculate education expenses (Dynamic Logic)
      if (profile.children && profile.children.length > 0) {
        const monthlyEduCost = toNum(profile.educationSettings?.monthlyEducationCost, 800);
        const eduStart = toNum(profile.educationSettings?.educationStartAge, 7);
        const eduDuration = toNum(profile.educationSettings?.educationDuration, 10);
        const eduEnd = eduStart + eduDuration;

        const uniCost = toNum(profile.educationSettings?.universityCost, 8750);
        const uniDuration = toNum(profile.educationSettings?.universityDuration, 4);
        const monthlyUniCost = uniCost / 12;

        profile.children.forEach(child => {
          if (!child.dobISO) return;
          const childDob = new Date(child.dobISO);
          const childAgeAtMonth = ((year - childDob.getFullYear()) * 12 + (monthIndex - childDob.getMonth())) / 12;
          const uniStartAge = child.gender === 'male' ? 21 : 19;
          
          // Tuition Phase
          if (childAgeAtMonth >= eduStart && childAgeAtMonth < eduEnd) {
             educationExpense += monthlyEduCost;
          }

          // University Phase
          if (childAgeAtMonth >= uniStartAge && childAgeAtMonth < uniStartAge + uniDuration) {
             educationExpense += monthlyUniCost; 
          }
        });
      }
      withdrawalAmount += educationExpense;
      
      // Calculate retirement expenses
      let retirementExpense = 0;
      const baseRetirementExpense = toNum(profile.customRetirementExpense, 0) > 0 
        ? toNum(profile.customRetirementExpense, 0)
        : cashflowData.totalExpenses * 0.7;

      if (isRetired && baseRetirementExpense > 0) {
         const yearsFromNow = ageAtMonth - currentAge;
         retirementExpense = baseRetirementExpense * Math.pow(1.03, yearsFromNow);
         withdrawalAmount += retirementExpense;
      }
      
      // Calculate investment deduction
      let monthlyInvestmentAmount = 0;
      if (!isRetired) {
        if (profile.monthlyInvestmentAmount && toNum(profile.monthlyInvestmentAmount, 0) > 0) {
          monthlyInvestmentAmount = toNum(profile.monthlyInvestmentAmount, 0);
        } else {
          const investmentPercent = toNum(retirement?.investmentPercent, 100);
          monthlyInvestmentAmount = (baseSavings * investmentPercent) / 100;
        }
        withdrawalAmount += monthlyInvestmentAmount;
      }
      
      // Additional Incomes (Safe Array Check)
      (additionalIncomes || []).forEach(income => {
        const incomeStartMonth = (toNum(income.startAge) - currentAge) * 12 + (toNum(income.startMonth) - currentMonth);
        const incomeEndMonth = income.endAge ? (toNum(income.endAge) - currentAge) * 12 + 11 : Infinity;
        
        if (m >= incomeStartMonth && m <= incomeEndMonth) {
          if (income.type === 'onetime' && m === incomeStartMonth) {
            additionalIncome += toNum(income.amount, 0);
          } else if (income.type === 'recurring') {
            let shouldAdd = false;
            const monthsSinceStart = m - incomeStartMonth;
            switch (income.frequency) {
              case 'monthly': shouldAdd = true; break;
              case 'quarterly': shouldAdd = monthsSinceStart % 3 === 0; break;
              case 'yearly': shouldAdd = monthsSinceStart % 12 === 0; break;
            }
            if(shouldAdd) additionalIncome += toNum(income.amount, 0);
          }
        }
      });
      
      // Withdrawals (Safe Array Check)
      (withdrawals || []).forEach(withdrawal => {
        const withdrawalStartMonth = (toNum(withdrawal.startAge) - currentAge) * 12 + (toNum(withdrawal.startMonth) - currentMonth);
        
        if (withdrawal.type === 'onetime' && m === withdrawalStartMonth) {
          withdrawalAmount += toNum(withdrawal.amount, 0);
        } else if (withdrawal.type === 'recurring' && m >= withdrawalStartMonth) {
          let shouldWithdraw = false;
          const monthsSinceStart = m - withdrawalStartMonth;
          switch (withdrawal.frequency) {
            case 'monthly': shouldWithdraw = true; break;
            case 'quarterly': shouldWithdraw = monthsSinceStart % 3 === 0; break;
            case 'yearly': shouldWithdraw = monthsSinceStart % 12 === 0; break;
          }
          if(shouldWithdraw) withdrawalAmount += toNum(withdrawal.amount, 0);
        }
      });
      
      const netCashflow = monthIncome + retirementIncomeVal + additionalIncome - withdrawalAmount;
      balance += netCashflow;
      
      projection.push({
        month: m,
        age: Math.floor(ageAtMonth),
        ageDecimal: ageAtMonth,
        year,
        monthName: monthNames[monthIndex],
        baseIncome: monthIncome,
        retirementIncome: retirementIncomeVal,
        additionalIncome,
        totalIncome: monthIncome + retirementIncomeVal + additionalIncome,
        withdrawal: withdrawalAmount,
        educationExpense,
        retirementExpense,
        investmentAmount: monthlyInvestmentAmount,
        interestEarned,
        netCashflow,
        balance,
        isRetired
      });
    }
    
    return projection;
  }, [cashflowData, currentSavings, projectToAge, additionalIncomes, withdrawals, bankInterestRate, profile, retirement, currentAge, customBaseIncome, customRetirementIncome]);
  
  const finalBalance = monthlyProjection.length > 0 ? monthlyProjection[monthlyProjection.length - 1].balance : 0;
  const totalIncome = monthlyProjection.reduce((sum, m) => sum + m.totalIncome, 0);
  const totalWithdrawals = monthlyProjection.reduce((sum, m) => sum + m.withdrawal, 0);
  const totalEducationExpense = monthlyProjection.reduce((sum, m) => sum + (m.educationExpense || 0), 0);
  const totalRetirementExpense = monthlyProjection.reduce((sum, m) => sum + (m.retirementExpense || 0), 0);
  const totalInvestmentAmount = monthlyProjection.reduce((sum, m) => sum + (m.investmentAmount || 0), 0);
  const totalInterestEarned = monthlyProjection.reduce((sum, m) => sum + m.interestEarned, 0);

  if (!cashflowData) {
    return (
      <div className="p-5">
        <Card title="⚠️ Profile Required" value="Please complete your profile information first" tone="warn" />
      </div>
    );
  }
  
  const expenseCategories = [
    { key: 'housing', label: 'Housing' },
    { key: 'food', label: 'Food & Dining' },
    { key: 'transport', label: 'Transport' },
    { key: 'insurance', label: 'Insurance' },
    { key: 'entertainment', label: 'Entertainment' },
    { key: 'others', label: 'Others' }
  ];
  
  const pieData = expenseCategories
    .map((cat, idx) => ({ name: cat.label, value: toNum(expenses[cat.key]), color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'][idx] }))
    .filter(item => item.value > 0);

  if (customExpenses && customExpenses.length > 0) {
    customExpenses.forEach((exp, idx) => {
      if (toNum(exp.amount) > 0) {
        pieData.push({
          name: exp.name || `Custom ${idx + 1}`,
          value: toNum(exp.amount),
          color: `hsl(${(idx * 60 + 200) % 360}, 70%, 50%)`
        });
      }
    });
  }

  // Display Logic
  const displaySavings = customBaseIncome !== undefined && customBaseIncome !== '' 
      ? toNum(customBaseIncome) 
      : cashflowData.monthlySavings;

  return (
    <div className="p-5">
      <div className="bg-gradient-to-br from-emerald-100 to-emerald-200 border-2 border-emerald-500 rounded-xl p-6 mb-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="text-3xl">💸</div>
          <div className="flex-1">
            <h3 className="m-0 text-emerald-800 text-xl font-semibold">
              {profile.name ? `${profile.name}'s Lifetime Cashflow Projection` : 'Lifetime Cashflow Projection'}
            </h3>
            <p className="m-1 text-emerald-800 text-sm opacity-80">
              Track monthly income, expenses, savings, and withdrawals from age {currentAge} to {projectToAge}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <Card title="💵 Monthly Take-Home" value={fmtSGD(cashflowData.takeHome)} tone="info" icon="💰" />
        <Card title="🛒 Monthly Expenses" value={fmtSGD(cashflowData.totalExpenses)} tone="danger" icon="📊" />
        
        {/* INTERACTIVE SAVINGS CARD */}
        <Card 
          title="💎 Monthly Savings" 
          value={
             <div className="flex items-center justify-between">
                <span>{fmtSGD(displaySavings)}</span>
                <button 
                   onClick={scrollToBaseIncome} 
                   className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-1 rounded hover:bg-emerald-200 transition-colors flex items-center gap-1 border border-emerald-300 cursor-pointer"
                   title="Edit Base Savings Amount"
                >
                   ✏️ Edit
                </button>
             </div>
          }
          tone={displaySavings >= 0 ? "success" : "danger"} 
          icon="💵" 
        />
        
        <Card title="📈 Savings Rate" value={`${cashflowData.savingsRate.toFixed(1)}%`} tone="info" icon="📊" />
      </div>

      {/* Projection Settings */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 shadow-sm">
        <h3 className="mt-0 mb-4 text-lg font-bold text-gray-800">⚙️ Projection Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <LabeledText
            label="💰 Current Savings (SGD)"
            value={currentSavings}
            onChange={(v) => updateState('currentSavings', v)}
            placeholder="e.g., 50000"
          />
          <LabeledText
            label="🎯 Project Until Age"
            type="number"
            value={projectToAge}
            onChange={(v) => updateState('projectToAge', v)}
            placeholder="100"
          />
          <div className="flex flex-col gap-2">
             <label className="text-xs font-bold text-gray-700">📊 View Mode</label>
             <div className="flex gap-2">
                <button 
                  onClick={() => setViewMode('summary')}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-bold ${viewMode === 'summary' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  Summary
                </button>
                <button 
                  onClick={() => setViewMode('monthly')}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-bold ${viewMode === 'monthly' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  Monthly
                </button>
             </div>
          </div>
        </div>

        {/* Bank Interest Rate Section */}
        <div className="mt-5 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="mb-3">
            <label className="text-xs font-bold text-blue-800 block mb-2">🏦 Bank Savings Interest Rate (% p.a.)</label>
            <input
              type="number"
              step="0.01"
              value={bankInterestRate}
              onChange={(e) => updateState('bankInterestRate', e.target.value)}
              placeholder="0.05"
              className="w-full px-3 py-2.5 border-2 border-blue-200 rounded-lg text-sm font-semibold focus:border-blue-500 outline-none bg-white"
            />
            <div className="text-[10px] text-blue-600 mt-1.5">
              Normal deposits: 0.05% | High-yield savings: 2-4%+ during good years
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
             {[
               { l: 'Normal (0.05%)', v: '0.05', c: 'blue' },
               { l: 'Savings (2%)', v: '2', c: 'emerald' },
               { l: 'High-Yield (3%)', v: '3', c: 'emerald' },
               { l: 'Premium (4%)', v: '4', c: 'amber' },
               { l: 'Exceptional (5%)', v: '5', c: 'amber' },
             ].map(opt => (
               <button
                  key={opt.v}
                  onClick={() => updateState('bankInterestRate', opt.v)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-bold border ${toNum(bankInterestRate) === toNum(opt.v) ? `bg-${opt.c}-500 text-white border-${opt.c}-500` : `bg-white text-${opt.c}-600 border-${opt.c}-200`}`}
               >
                 {opt.l}
               </button>
             ))}
          </div>
        </div>

        {/* Projection Summary Grid */}
        {monthlyProjection.length > 0 && (
          <div className="mt-5 p-4 bg-emerald-50 rounded-lg border-2 border-emerald-500">
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
              {totalInvestmentAmount > 0 && (
                <div>
                  <div className="text-[10px] text-amber-700 mb-1">💼 Investment Moved</div>
                  <div className="text-lg font-bold text-amber-700">{fmtSGD(totalInvestmentAmount)}</div>
                </div>
              )}
              {totalEducationExpense > 0 && (
                 <div>
                   <div className="text-[10px] text-purple-700 mb-1">🎓 Education Costs</div>
                   <div className="text-lg font-bold text-purple-700">{fmtSGD(totalEducationExpense)}</div>
                 </div>
              )}
              {totalRetirementExpense > 0 && (
                 <div>
                   <div className="text-[10px] text-red-700 mb-1">🏖️ Retirement Living</div>
                   <div className="text-lg font-bold text-red-700">{fmtSGD(totalRetirementExpense)}</div>
                 </div>
              )}
              <div>
                <div className="text-[10px] text-emerald-800 mb-1">Total Withdrawals</div>
                <div className="text-lg font-bold text-red-700">{fmtSGD(totalWithdrawals)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Income Sources (Unified) */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="m-0 text-lg font-bold text-gray-800">➕ Income Sources (Base + Additional)</h3>
          <button onClick={addIncome} className="px-4 py-2 bg-gradient-to-br from-emerald-400 to-emerald-600 text-white rounded-lg text-xs font-bold shadow-md hover:from-emerald-500 hover:to-emerald-700">
            + Add Income
          </button>
        </div>
        
        <div className="grid gap-3">
            {/* 1. BASE INCOME ROW (Auto-synced or Overridden) */}
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 relative scroll-mt-32 transition-all duration-300" ref={baseIncomeRef}>
                <div className="absolute top-0 left-0 bg-blue-200 text-blue-800 text-[9px] px-2 py-0.5 rounded-br font-bold uppercase">
                    Default Source (Working Years)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end mt-2">
                    <div className="lg:col-span-2">
                        <LabeledText label="Income Source" value="Employment Savings (Base)" onChange={() => {}} disabled={true} />
                    </div>
                    <div>
                      <LabeledText 
                          label="Amount (Override) ✏️" 
                          value={customBaseIncome || ''} 
                          onChange={(v) => updateState('customBaseIncome', v)} 
                          placeholder={fmtSGD(cashflowData.monthlySavings)} 
                      />
                    </div>
                    <LabeledText label="Type" value="Recurring" onChange={() => {}} disabled={true} />
                    <LabeledText label="Freq" value="Monthly" onChange={() => {}} disabled={true} />
                    <LabeledText label="Start Age" value={String(currentAge)} onChange={() => {}} disabled={true} />
                    <LabeledText label="End Age" value={String(retirementAge)} onChange={() => {}} disabled={true} />
                    <div className="mb-2">
                        {customBaseIncome ? (
                            <button onClick={() => updateState('customBaseIncome', '')} className="w-full px-3 py-2.5 bg-blue-100 text-blue-700 text-xs rounded hover:bg-blue-200 font-bold border border-blue-300 transition-colors">
                                Reset Default
                            </button>
                        ) : (
                            <div className="h-[38px] flex items-center justify-center text-[10px] text-blue-400 italic font-bold border border-transparent">
                                Auto-Synced
                            </div>
                        )}
                    </div>
                </div>
                {customBaseIncome && (
                   <div className="mt-2 text-[10px] text-blue-600 font-bold bg-blue-100 inline-block px-2 py-1 rounded">
                      ℹ️ Overriding Calculated Savings of {fmtSGD(cashflowData.monthlySavings)}
                   </div>
                )}
            </div>

            {/* 2. RETIREMENT INCOME ROW */}
            <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 relative scroll-mt-32 transition-all duration-300" ref={retirementIncomeRef}>
                <div className="absolute top-0 left-0 bg-amber-200 text-amber-800 text-[9px] px-2 py-0.5 rounded-br font-bold uppercase">
                    Retirement Phase
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end mt-2">
                    <div className="lg:col-span-2">
                        <LabeledText label="Income Source" value="Retirement Income (Part-time/Rental)" onChange={() => {}} disabled={true} />
                    </div>
                    <div>
                      <LabeledText 
                          label="Amount ✏️" 
                          value={customRetirementIncome || ''} 
                          onChange={(v) => updateState('customRetirementIncome', v)} 
                          placeholder="0" 
                      />
                    </div>
                    <LabeledText label="Type" value="Recurring" onChange={() => {}} disabled={true} />
                    <LabeledText label="Freq" value="Monthly" onChange={() => {}} disabled={true} />
                    <LabeledText label="Start Age" value={String(retirementAge)} onChange={() => {}} disabled={true} />
                    <LabeledText label="End Age" value="100" onChange={() => {}} disabled={true} />
                    <div className="mb-2">
                        {customRetirementIncome ? (
                            <button onClick={() => updateState('customRetirementIncome', '')} className="w-full px-3 py-2.5 bg-amber-100 text-amber-700 text-xs rounded hover:bg-amber-200 font-bold border border-amber-300 transition-colors">
                                Clear
                            </button>
                        ) : (
                            <div className="h-[38px] flex items-center justify-center text-[10px] text-amber-400 italic font-bold border border-transparent">
                                -
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 3. ADDITIONAL INCOMES */}
            {(additionalIncomes || []).map((income) => (
              <div key={income.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
                   <div className="lg:col-span-2">
                      <LabeledText label="Income Name" value={income.name} onChange={(v) => updateIncomeItem(income.id, 'name', v)} placeholder="e.g. Bonus" />
                   </div>
                   <LabeledText label="Amount" value={income.amount} onChange={(v) => updateIncomeItem(income.id, 'amount', v)} placeholder="5000" />
                   <LabeledSelect label="Type" value={income.type} onChange={(v) => updateIncomeItem(income.id, 'type', v)} options={[{label:'One-Time',value:'onetime'},{label:'Recurring',value:'recurring'}]} />
                   {income.type === 'recurring' ? (
                     <LabeledSelect label="Freq" value={income.frequency} onChange={(v) => updateIncomeItem(income.id, 'frequency', v)} options={[{label:'Monthly',value:'monthly'},{label:'Quarterly',value:'quarterly'},{label:'Yearly',value:'yearly'}]} />
                   ) : (
                     <LabeledText label="Freq" value="-" onChange={() => {}} disabled={true} />
                   )}
                   <LabeledText label="Start Age" type="number" value={income.startAge} onChange={(v) => updateIncomeItem(income.id, 'startAge', v)} placeholder={String(currentAge)} />
                   <LabeledSelect label="Month" value={String(income.startMonth)} onChange={(v) => updateIncomeItem(income.id, 'startMonth', parseInt(v))} options={monthNames.map((m,i)=>({label:m,value:String(i)}))} />
                   <button onClick={() => removeIncome(income.id)} className="mb-2 px-3 py-2.5 bg-red-500 text-white text-xs rounded hover:bg-red-600 font-bold shadow-sm">Remove</button>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Withdrawals */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="m-0 text-lg font-bold text-gray-800">💳 Withdrawals / Expenses</h3>
          <button onClick={addWithdrawal} className="px-4 py-2 bg-gradient-to-br from-red-400 to-red-600 text-white rounded-lg text-xs font-bold shadow-md hover:from-red-500 hover:to-red-700">
            + Add Withdrawal
          </button>
        </div>
        
        {(!withdrawals || withdrawals.length === 0) ? (
          <div className="p-5 text-center text-gray-500 text-sm bg-gray-50 rounded-lg">
             No withdrawals planned. Click "+ Add Withdrawal" to plan car purchases, home renovations, or other expenses.
          </div>
        ) : (
          <div className="grid gap-3">
            {(withdrawals || []).map((w) => (
              <div key={w.id} className="p-4 bg-red-50 rounded-lg border border-red-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 items-end">
                   <div className="lg:col-span-2">
                      <LabeledText label="Withdrawal Name" value={w.name} onChange={(v) => updateWithdrawalItem(w.id, 'name', v)} placeholder="e.g. Renovation" />
                   </div>
                   <LabeledText label="Amount" value={w.amount} onChange={(v) => updateWithdrawalItem(w.id, 'amount', v)} placeholder="50000" />
                   <LabeledSelect label="Type" value={w.type} onChange={(v) => updateWithdrawalItem(w.id, 'type', v)} options={[{label:'One-Time',value:'onetime'},{label:'Recurring',value:'recurring'}]} />
                   {w.type === 'recurring' && (
                     <LabeledSelect label="Freq" value={w.frequency} onChange={(v) => updateWithdrawalItem(w.id, 'frequency', v)} options={[{label:'Monthly',value:'monthly'},{label:'Quarterly',value:'quarterly'},{label:'Yearly',value:'yearly'}]} />
                   )}
                   <LabeledText label="At Age" type="number" value={w.startAge} onChange={(v) => updateWithdrawalItem(w.id, 'startAge', v)} placeholder={String(currentAge)} />
                   <button onClick={() => removeWithdrawal(w.id)} className="mb-2 px-3 py-2 bg-red-500 text-white text-xs rounded hover:bg-red-600">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Monthly Breakdown Table */}
      {viewMode === 'monthly' && monthlyProjection.length > 0 && (
         <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-5 shadow-sm">
            
            {/* BANK HEADER */}
            <div className="bg-gray-50 p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-white rounded-full shadow-sm border border-gray-100">
                        <span className="text-xl">🏦</span>
                    </div>
                    <div>
                        <div className="text-sm font-bold text-gray-900">Operating Cashflow Account</div>
                        <div className="text-xs text-gray-500">Monthly liquidity projection</div>
                    </div>
                </div>
                <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-100">
                    <div className="text-right">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Current Balance</div>
                        <div className="text-xl font-mono font-bold text-gray-800">{fmtSGD(toNum(currentSavings))}</div>
                    </div>
                    <div className="h-8 w-px bg-gray-200"></div>
                    <div className="text-right">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Proj. End Balance</div>
                        <div className={`text-xl font-mono font-bold ${finalBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {fmtSGD(finalBalance)}
                        </div>
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto max-h-[600px]">
               <table className="w-full border-collapse text-xs min-w-[900px]">
                  <thead className="sticky top-0 z-10 shadow-sm">
                     <tr className="bg-gray-100 border-b-2 border-gray-300 text-gray-700">
                        <th className="p-3 text-left font-bold bg-gray-100">Date</th>
                        <th className="p-3 text-left font-bold bg-gray-100">Age</th>
                        <th 
                          className="p-3 text-right font-bold text-emerald-700 bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors group"
                          onClick={scrollToBaseIncome}
                          title="Click to edit Base Income"
                        >
                          Base Income <span className="opacity-0 group-hover:opacity-100">✏️</span>
                        </th>
                        <th 
                          className="p-3 text-right font-bold text-amber-700 bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors group"
                          onClick={scrollToRetireIncome}
                          title="Click to edit Retirement Income"
                        >
                          Retire Inc. <span className="opacity-0 group-hover:opacity-100">✏️</span>
                        </th>
                        <th className="p-3 text-right font-bold bg-gray-100">Additional</th>
                        <th className="p-3 text-right font-bold text-blue-600 bg-gray-100">Interest</th>
                        <th className="p-3 text-right font-bold text-amber-600 bg-gray-100">💼 Invest</th>
                        <th className="p-3 text-right font-bold text-purple-600 bg-gray-100">🎓 Edu</th>
                        <th className="p-3 text-right font-bold text-red-600 bg-gray-100">🏖️ Retire</th>
                        <th className="p-3 text-right font-bold bg-gray-100">Withdrawals</th>
                        <th className="p-3 text-right font-bold bg-gray-100">Net Cashflow</th>
                        <th className="p-3 text-right font-bold bg-gray-100">Balance</th>
                     </tr>
                  </thead>
                  <tbody>
                     {monthlyProjection.slice(0, monthsToShow).map((row, idx) => (
                        <tr key={idx} className={`border-b border-gray-100 hover:bg-gray-50 ${row.isRetired ? 'bg-amber-50/30' : ''}`}>
                           <td className="p-3 font-medium">{row.monthName} {row.year}</td>
                           <td className="p-3 text-gray-500">{row.age}</td>
                           <td className={`p-3 text-right ${row.baseIncome > 0 ? 'text-emerald-600 font-semibold' : 'text-gray-300'}`}>
                              {fmtSGD(row.baseIncome)}
                           </td>
                           <td className={`p-3 text-right ${row.retirementIncome > 0 ? 'text-amber-600 font-semibold' : 'text-gray-300'}`}>
                              {row.retirementIncome > 0 ? fmtSGD(row.retirementIncome) : '-'}
                           </td>
                           <td className={`p-3 text-right ${row.additionalIncome > 0 ? 'text-emerald-600 font-bold' : 'text-gray-400'}`}>
                              {row.additionalIncome > 0 ? fmtSGD(row.additionalIncome) : '-'}
                           </td>
                           <td className={`p-3 text-right ${row.interestEarned > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                              {row.interestEarned > 0 ? fmtSGD(row.interestEarned) : '-'}
                           </td>
                           <td className={`p-3 text-right ${row.investmentAmount > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                              {row.investmentAmount > 0 ? fmtSGD(row.investmentAmount) : '-'}
                           </td>
                           <td className={`p-3 text-right ${row.educationExpense > 0 ? 'text-purple-600 font-bold' : 'text-gray-400'}`}>
                              {row.educationExpense > 0 ? fmtSGD(row.educationExpense) : '-'}
                           </td>
                           <td className={`p-3 text-right ${row.retirementExpense > 0 ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                              {row.retirementExpense > 0 ? fmtSGD(row.retirementExpense) : '-'}
                           </td>
                           <td className={`p-3 text-right ${row.withdrawal > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                              {row.withdrawal > 0 ? fmtSGD(row.withdrawal) : '-'}
                           </td>
                           <td className={`p-3 text-right font-bold ${row.netCashflow >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {fmtSGD(row.netCashflow)}
                           </td>
                           <td className={`p-3 text-right font-extrabold ${row.balance >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                              {fmtSGD(row.balance)}
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>

            {/* Pagination Buttons */}
            {monthlyProjection.length > monthsToShow && (
               <div className="mt-4 p-4 flex justify-center gap-3 border-t border-gray-200 bg-gray-50">
                  <button 
                     onClick={() => setMonthsToShow(prev => Math.min(prev + 120, monthlyProjection.length))}
                     className="px-6 py-3 bg-gradient-to-br from-blue-500 to-blue-600 text-white font-bold rounded-lg shadow-md hover:from-blue-600 hover:to-blue-700"
                  >
                     📅 Show Next 10 Years ({monthlyProjection.length - monthsToShow} remaining)
                  </button>
                  <button 
                     onClick={() => setMonthsToShow(monthlyProjection.length)}
                     className="px-6 py-3 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-bold rounded-lg shadow-md hover:from-emerald-600 hover:to-emerald-700"
                  >
                     📊 Show All ({monthlyProjection.length} months)
                  </button>
               </div>
            )}
            {monthsToShow >= monthlyProjection.length && monthlyProjection.length > 120 && (
               <div className="mt-4 text-center p-4 bg-gray-50 border-t border-gray-200">
                  <button 
                     onClick={() => setMonthsToShow(120)}
                     className="px-4 py-2 bg-white text-gray-700 rounded-lg font-bold border border-gray-300 hover:bg-gray-100 shadow-sm"
                  >
                     ↑ Collapse to First 10 Years
                  </button>
               </div>
            )}
         </div>
      )}

      {/* Expenses Breakdown */}
      <div className="bg-white rounded-xl p-6 mb-5 shadow-sm border border-gray-200">
        <h2 className="text-lg font-bold mb-5 text-gray-800">Monthly Expenses</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {expenseCategories.map(cat => (
            <LabeledText
              key={cat.key}
              label={cat.label}
              value={expenses[cat.key]}
              onChange={(val) => setExpenses({ ...expenses, [cat.key]: val })}
              placeholder="0"
            />
          ))}
        </div>
         {/* Pie Chart */}
        {pieData.length > 0 && (
          <div className="mt-6 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  label
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => fmtSGD(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default CashflowTab;
