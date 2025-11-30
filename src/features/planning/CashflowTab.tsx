import React, { useMemo, useState } from 'react';
import { toNum, fmtSGD, monthNames } from '../../lib/helpers';
import { getBaseRetirementExpense } from '../../lib/calculators';
import { EXPENSE_CATEGORIES } from '../../lib/config';
import LabeledText from '../../components/common/LabeledText';
import LabeledSelect from '../../components/common/LabeledSelect';
import Card from '../../components/common/Card';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import {
  CpfData,
  Expenses,
  CashflowData,
  Profile,
  CustomExpense,
  RetirementSettings,
  CashflowState
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
  cpfState: any;
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
    customBaseIncome,
    customRetirementIncome
  } = cashflowState;

  const [viewMode, setViewMode] = useState<'summary' | 'monthly'>('summary');
  const [monthsToShow, setMonthsToShow] = useState(120); // Start with 10 years

  // FIXED: Use functional state update to ensure we always have the latest state
  // when multiple updates happen quickly (e.g. typing).
  const updateState = (key: keyof CashflowState, value: any) => {
    setCashflowState((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const currentAge = age;
  const currentYear = new Date().getFullYear();

  // Add income
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
          endAge: null
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

  // Add withdrawal
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
          startMonth: currentMonth
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

    // Recalculate total expenses based on inputs for consistency
    const totalMonthlyExpenses =
      Object.values(expenses).reduce((sum, v) => sum + toNum(v, 0), 0) +
      customExpenses.reduce((sum, v) => sum + toNum(v.amount, 0), 0);

    // Get Base Retirement Expense using shared logic
    const baseRetirementExpense = getBaseRetirementExpense(
      profile,
      totalMonthlyExpenses,
      cpfData,
      cashflowData
    );

    // 1. Determine the Target Financial Independence Age
    const fiAge = toNum(profile.retirementAge, 65);

    // 2. Determine Pre-Retirement Monthly Savings (Base Income)
    // Use custom override if present, otherwise: (takeHome or cpfData.takeHome) - totalExpenses
    const effectiveTakeHome =
      toNum(profile.takeHome) ||
      (cpfData ? toNum(cpfData.takeHome) : 0);

    const defaultActiveIncome = effectiveTakeHome - totalMonthlyExpenses;

    const preRetirementIncome =
      customBaseIncome !== undefined && customBaseIncome !== ''
        ? toNum(customBaseIncome)
        : defaultActiveIncome;

    for (let m = 0; m < totalMonths; m++) {
      const ageAtMonth = currentAge + m / 12;
      const monthIndex = (currentMonth + m) % 12;
      const yearOffset = Math.floor((currentMonth + m) / 12);
      const year = currentYear + yearOffset;

      // Apply interest to opening balance
      const interestEarned = balance * monthlyInterestRate;
      balance += interestEarned;

      // --- CORE FINANCIAL INDEPENDENCE LOGIC ---
      const isRetired = ageAtMonth >= fiAge;

      // Base cashflow: If retired, income is 0. If working, use pre-retirement income.
      let monthIncome = isRetired ? 0 : preRetirementIncome;

      let additionalIncome = 0;
      let withdrawalAmount = 0;
      let educationExpense = 0;
      let retirementExpense = 0;
      let retirementIncomeVal = 0;

      // Calculate education expenses
      if (profile.children && profile.children.length > 0) {
        const monthlyEduCost = toNum(
          profile.educationSettings?.monthlyEducationCost,
          800
        );
        const eduStart = toNum(profile.educationSettings?.educationStartAge, 7);
        const eduDuration = toNum(
          profile.educationSettings?.educationDuration,
          10
        );
        const eduEnd = eduStart + eduDuration;

        const uniCost = toNum(profile.educationSettings?.universityCost, 8750);
        const uniDuration = toNum(
          profile.educationSettings?.universityDuration,
          4
        );
        const monthlyUniCost = uniCost / 12;

        profile.children.forEach((child) => {
          if (!child.dobISO) return;
          const childDob = new Date(child.dobISO);
          const childAgeAtMonth =
            ((year - childDob.getFullYear()) * 12 +
              (monthIndex - childDob.getMonth())) /
            12;
          const uniStartAge = child.gender === 'male' ? 21 : 19;

          if (childAgeAtMonth >= eduStart && childAgeAtMonth < eduEnd) {
            educationExpense += monthlyEduCost;
          }

          if (
            childAgeAtMonth >= uniStartAge &&
            childAgeAtMonth < uniStartAge + uniDuration
          ) {
            educationExpense += monthlyUniCost;
          }
        });
      }
      withdrawalAmount += educationExpense;

      // Calculate retirement expenses (Only applied if Retired)
      if (isRetired) {
        // Custom Retirement Income (Inflow)
        if (customRetirementIncome) {
          retirementIncomeVal = toNum(customRetirementIncome);
        }

        if (baseRetirementExpense > 0) {
          const yearsFromNow = ageAtMonth - currentAge;
          retirementExpense =
            baseRetirementExpense * Math.pow(1.03, yearsFromNow);
          withdrawalAmount += retirementExpense;
        }
      }

      // Calculate investment deduction (Only applied if NOT Retired)
      // Investments stop when you stop working (FI Age)
      let monthlyInvestmentAmount = 0;
      if (!isRetired) {
        if (
          profile.monthlyInvestmentAmount &&
          toNum(profile.monthlyInvestmentAmount, 0) > 0
        ) {
          monthlyInvestmentAmount = toNum(profile.monthlyInvestmentAmount, 0);
        } else {
          const investmentPercent = toNum(retirement?.investmentPercent, 100);
          monthlyInvestmentAmount = (preRetirementIncome * investmentPercent) / 100;
        }
        withdrawalAmount += monthlyInvestmentAmount;
      }

      // Additional Incomes
      additionalIncomes.forEach((income) => {
        const incomeStartMonth =
          (toNum(income.startAge) - currentAge) * 12 +
          (toNum(income.startMonth) - currentMonth);
        const incomeEndMonth = income.endAge
          ? (toNum(income.endAge) - currentAge) * 12 + 11
          : Infinity;

        if (m >= incomeStartMonth && m <= incomeEndMonth) {
          if (income.type === 'onetime' && m === incomeStartMonth) {
            additionalIncome += toNum(income.amount, 0);
          } else if (income.type === 'recurring') {
            let shouldAdd = false;
            const monthsSinceStart = m - incomeStartMonth;
            switch (income.frequency) {
              case 'monthly':
                shouldAdd = true;
                break;
              case 'quarterly':
                shouldAdd = monthsSinceStart % 3 === 0;
                break;
              case 'yearly':
                shouldAdd = monthsSinceStart % 12 === 0;
                break;
            }
            if (shouldAdd) additionalIncome += toNum(income.amount, 0);
          }
        }
      });

      // Withdrawals
      withdrawals.forEach((withdrawal) => {
        const withdrawalStartMonth =
          (toNum(withdrawal.startAge) - currentAge) * 12 +
          (toNum(withdrawal.startMonth) - currentMonth);

        if (withdrawal.type === 'onetime' && m === withdrawalStartMonth) {
          withdrawalAmount += toNum(withdrawal.amount, 0);
        } else if (withdrawal.type === 'recurring' && m >= withdrawalStartMonth) {
          let shouldWithdraw = false;
          const monthsSinceStart = m - withdrawalStartMonth;
          switch (withdrawal.frequency) {
            case 'monthly':
              shouldWithdraw = true;
              break;
            case 'quarterly':
              shouldWithdraw = monthsSinceStart % 3 === 0;
              break;
            case 'yearly':
              shouldWithdraw = monthsSinceStart % 12 === 0;
              break;
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
        isRetired // Flag for table rendering
      });
    }

    return projection;
  }, [
    cashflowData,
    currentSavings,
    projectToAge,
    additionalIncomes,
    withdrawals,
    bankInterestRate,
    profile,
    retirement,
    expenses,
    customExpenses,
    cpfData,
    currentAge,
    currentYear,
    customBaseIncome,
    customRetirementIncome
  ]);

  const finalBalance =
    monthlyProjection.length > 0
      ? monthlyProjection[monthlyProjection.length - 1].balance
      : 0;
  const totalIncome = monthlyProjection.reduce((sum, m) => sum + m.totalIncome, 0);
  const totalWithdrawals = monthlyProjection.reduce(
    (sum, m) => sum + m.withdrawal,
    0
  );
  const totalEducationExpense = monthlyProjection.reduce(
    (sum, m) => sum + (m.educationExpense || 0),
    0
  );
  const totalRetirementExpense = monthlyProjection.reduce(
    (sum, m) => sum + (m.retirementExpense || 0),
    0
  );
  const totalInvestmentAmount = monthlyProjection.reduce(
    (sum, m) => sum + (m.investmentAmount || 0),
    0
  );
  const totalInterestEarned = monthlyProjection.reduce(
    (sum, m) => sum + m.interestEarned,
    0
  );

  const fiAge = toNum(profile.retirementAge, 65);

  if (!cashflowData) {
    return (
      <div className="p-5">
        <Card
          title="⚠️ Profile Required"
          value="Please complete your profile information first"
          tone="warn"
        />
      </div>
    );
  }

  const pieData: { name: string; value: number; color: string }[] = EXPENSE_CATEGORIES
    .map((cat, idx) => ({
      name: cat.label,
      value: toNum(expenses[cat.key]),
      color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'][idx]
    }))
    .filter((item) => item.value > 0);

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

  return (
    <div className="p-5">
      <div className="bg-gradient-to-br from-emerald-100 to-emerald-200 border-2 border-emerald-500 rounded-xl p-6 mb-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="text-3xl">💸</div>
          <div className="flex-1">
            <h3 className="m-0 text-emerald-800 text-xl font-semibold">
              {profile.name
                ? `${profile.name}'s Lifetime Cashflow Projection`
                : 'Lifetime Cashflow Projection'}
            </h3>
            <p className="m-1 text-emerald-800 text-sm opacity-80">
              Track monthly income, expenses, savings, and withdrawals from age{' '}
              {currentAge} to {projectToAge}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <Card
          title="💵 Monthly Take-Home"
          value={fmtSGD(cashflowData.takeHome)}
          tone="info"
          icon="💰"
        />
        <Card
          title="🛒 Monthly Expenses"
          value={fmtSGD(cashflowData.totalExpenses)}
          tone="danger"
          icon="📊"
        />
        <Card
          title="💎 Monthly Savings"
          value={fmtSGD(cashflowData.monthlySavings)}
          tone={cashflowData.monthlySavings >= 0 ? 'success' : 'danger'}
          icon="💵"
        />
        <Card
          title="📈 Savings Rate"
          value={`${cashflowData.savingsRate.toFixed(1)}%`}
          tone="info"
          icon="📊"
        />
      </div>

      {/* Projection Settings */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 shadow-sm">
        <h3 className="mt-0 mb-4 text-lg font-bold text-gray-800">
          ⚙️ Projection Settings
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <LabeledText
            label="💰 Current Savings/Balance (SGD)"
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
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold ${
                  viewMode === 'summary'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                Summary
              </button>
              <button
                onClick={() => setViewMode('monthly')}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold ${
                  viewMode === 'monthly'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                Monthly
              </button>
            </div>
          </div>
        </div>

        {/* Overrides */}
        <div className="mt-4">
          <LabeledText
            label="Custom Monthly Savings (Override)"
            value={customBaseIncome || ''}
            onChange={(v) => updateState('customBaseIncome', v)}
            placeholder={fmtSGD(cashflowData.monthlySavings)}
          />
          <div className="text-[10px] text-gray-500">
            Calculated from Profile: {fmtSGD(cashflowData.monthlySavings)}. Enter
            value to override.
          </div>
        </div>

        {/* Bank Interest Rate Section */}
        <div className="mt-5 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="mb-3">
            <label className="text-xs font-bold text-blue-800 block mb-2">
              🏦 Bank Savings Interest Rate (% p.a.)
            </label>
            <input
              type="number"
              step="0.01"
              value={bankInterestRate}
              onChange={(e) => updateState('bankInterestRate', e.target.value)}
              placeholder="0.05"
              className="w-full px-3 py-2.5 border-2 border-blue-200 rounded-lg text-sm font-semibold focus:border-blue-500 outline-none bg-white"
            />
            <div className="text-[10px] text-blue-600 mt-1.5">
              Normal deposits: 0.05% | High-yield savings: 2–4%+ during good years
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { l: 'Normal (0.05%)', v: '0.05', c: 'blue' },
              { l: 'Savings (2%)', v: '2', c: 'emerald' },
              { l: 'High-Yield (3%)', v: '3', c: 'emerald' },
              { l: 'Premium (4%)', v: '4', c: 'amber' },
              { l: 'Exceptional (5%)', v: '5', c: 'amber' }
            ].map((opt) => (
              <button
                key={opt.v}
                onClick={() => updateState('bankInterestRate', opt.v)}
                className={`px-3 py-1.5 rounded-md text-[10px] font-bold border ${
                  toNum(bankInterestRate) === toNum(opt.v)
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
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
                <div className="text-[10px] text-emerald-800 mb-1">
                  Starting Balance
                </div>
                <div className="text-lg font-bold text-emerald-800">
                  {fmtSGD(currentSavings)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-emerald-800 mb-1">
                  Total Income
                </div>
                <div className="text-lg font-bold text-emerald-800">
                  {fmtSGD(totalIncome)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-blue-700 mb-1">💰 Interest Earned</div>
                <div className="text-lg font-bold text-blue-700">
                  {fmtSGD(totalInterestEarned)}
                </div>
                <div className="text-[9px] text-blue-600">@ {bankInterestRate}% p.a.</div>
              </div>
              <div>
                <div className="text-[10px] text-emerald-800 mb-1">
                  Final Balance @ Age {projectToAge}
                </div>
                <div
                  className={`text-lg font-bold ${
                    finalBalance >= 0 ? 'text-emerald-800' : 'text-red-600'
                  }`}
                >
                  {fmtSGD(finalBalance)}
                </div>
              </div>
              {totalInvestmentAmount > 0 && (
                <div>
                  <div className="text-[10px] text-amber-700 mb-1">
                    💼 Investment Moved
                  </div>
                  <div className="text-lg font-bold text-amber-700">
                    {fmtSGD(totalInvestmentAmount)}
                  </div>
                </div>
              )}
              {totalEducationExpense > 0 && (
                <div>
                  <div className="text-[10px] text-purple-700 mb-1">
                    🎓 Education Costs
                  </div>
                  <div className="text-lg font-bold text-purple-700">
                    {fmtSGD(totalEducationExpense)}
                  </div>
                </div>
              )}
              {totalRetirementExpense > 0 && (
                <div>
                  <div className="text-[10px] text-red-700 mb-1">
                    🏖️ Retirement Living
                  </div>
                  <div className="text-lg font-bold text-red-700">
                    {fmtSGD(totalRetirementExpense)}
                  </div>
                </div>
              )}
              <div>
                <div className="text-[10px] text-emerald-800 mb-1">
                  Total Withdrawals
                </div>
                <div className="text-lg font-bold text-red-700">
                  {fmtSGD(totalWithdrawals)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Additional Income Sources */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="m-0 text-lg font-bold text-gray-800">
            ➕ Additional Income / Savings
          </h3>
          <button
            onClick={addIncome}
            className="px-4 py-2 bg-gradient-to-br from-emerald-400 to-emerald-600 text-white rounded-lg text-xs font-bold shadow-md hover:from-emerald-500 hover:to-emerald-700"
          >
            + Add Income
          </button>
        </div>

        {additionalIncomes.length === 0 ? (
          <div className="p-5 text-center text-gray-500 text-sm bg-gray-50 rounded-lg">
            No additional income sources. Click "+ Add Income" to add bonuses,
            investment returns, or other income.
          </div>
        ) : (
          <div className="grid gap-3">
            {additionalIncomes.map((income) => (
              <div
                key={income.id}
                className="p-4 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
                  <div className="lg:col-span-2">
                    <LabeledText
                      label="Income Name"
                      value={income.name}
                      onChange={(v) => updateIncomeItem(income.id, 'name', v)}
                      placeholder="e.g. Bonus"
                    />
                  </div>
                  <LabeledText
                    label="Amount"
                    value={income.amount}
                    onChange={(v) => updateIncomeItem(income.id, 'amount', v)}
                    placeholder="5000"
                  />
                  <LabeledSelect
                    label="Type"
                    value={income.type}
                    onChange={(v) => updateIncomeItem(income.id, 'type', v)}
                    options={[
                      { label: 'One-Time', value: 'onetime' },
                      { label: 'Recurring', value: 'recurring' }
                    ]}
                  />
                  {income.type === 'recurring' && (
                    <LabeledSelect
                      label="Freq"
                      value={income.frequency}
                      onChange={(v) =>
                        updateIncomeItem(income.id, 'frequency', v)
                      }
                      options={[
                        { label: 'Monthly', value: 'monthly' },
                        { label: 'Quarterly', value: 'quarterly' },
                        { label: 'Yearly', value: 'yearly' }
                      ]}
                    />
                  )}
                  <LabeledText
                    label="Start Age"
                    type="number"
                    value={income.startAge}
                    onChange={(v) =>
                      updateIncomeItem(income.id, 'startAge', v)
                    }
                    placeholder={String(currentAge)}
                  />
                  <LabeledSelect
                    label="Month"
                    value={String(income.startMonth)}
                    onChange={(v) =>
                      updateIncomeItem(income.id, 'startMonth', parseInt(v))
                    }
                    options={monthNames.map((m, i) => ({
                      label: m,
                      value: String(i)
                    }))}
                  />
                  <button
                    onClick={() => removeIncome(income.id)}
                    className="mb-2 px-3 py-2 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-2 p-2 bg-blue-50 rounded text-[11px] text-blue-800">
                  💡 <strong>Event:</strong>{' '}
                  {income.type === 'onetime'
                    ? 'One-time'
                    : income.frequency}{' '}
                  {fmtSGD(income.amount)} starting{' '}
                  {monthNames[income.startMonth]} at age {income.startAge}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Withdrawals */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="m-0 text-lg font-bold text-gray-800">
            💳 Withdrawals / Expenses
          </h3>
          <button
            onClick={addWithdrawal}
            className="px-4 py-2 bg-gradient-to-br from-red-400 to-red-600 text-white rounded-lg text-xs font-bold shadow-md hover:from-red-500 hover:to-red-700"
          >
            + Add Withdrawal
          </button>
        </div>

        {withdrawals.length === 0 ? (
          <div className="p-5 text-center text-gray-500 text-sm bg-gray-50 rounded-lg">
            No withdrawals planned. Click "+ Add Withdrawal" to plan car
            purchases, home renovations, or other expenses.
          </div>
        ) : (
          <div className="grid gap-3">
            {withdrawals.map((w) => (
              <div
                key={w.id}
                className="p-4 bg-red-50 rounded-lg border border-red-100"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 items-end">
                  <div className="lg:col-span-2">
                    <LabeledText
                      label="Withdrawal Name"
                      value={w.name}
                      onChange={(v) => updateWithdrawalItem(w.id, 'name', v)}
                      placeholder="e.g. Renovation"
                    />
                  </div>
                  <LabeledText
                    label="Amount"
                    value={w.amount}
                    onChange={(v) => updateWithdrawalItem(w.id, 'amount', v)}
                    placeholder="50000"
                  />
                  <LabeledSelect
                    label="Type"
                    value={w.type}
                    onChange={(v) => updateWithdrawalItem(w.id, 'type', v)}
                    options={[
                      { label: 'One-Time', value: 'onetime' },
                      { label: 'Recurring', value: 'recurring' }
                    ]}
                  />
                  {w.type === 'recurring' && (
                    <LabeledSelect
                      label="Freq"
                      value={w.frequency}
                      onChange={(v) =>
                        updateWithdrawalItem(w.id, 'frequency', v)
                      }
                      options={[
                        { label: 'Monthly', value: 'monthly' },
                        { label: 'Quarterly', value: 'quarterly' },
                        { label: 'Yearly', value: 'yearly' }
                      ]}
                    />
                  )}
                  <LabeledText
                    label="At Age"
                    type="number"
                    value={w.startAge}
                    onChange={(v) =>
                      updateWithdrawalItem(w.id, 'startAge', v)
                    }
                    placeholder={String(currentAge)}
                  />
                  <button
                    onClick={() => removeWithdrawal(w.id)}
                    className="mb-2 px-3 py-2 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Monthly Breakdown Table */}
      {viewMode === 'monthly' && monthlyProjection.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-5 shadow-sm">
          {/* Bank header */}
          <div className="bg-gray-50 p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white rounded-full shadow-sm border border-gray-100">
                <span className="text-xl">🏦</span>
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900">
                  Operating Cashflow Account
                </div>
                <div className="text-xs text-gray-500">
                  Monthly liquidity projection
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-100">
              <div className="text-right">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                  Current Balance
                </div>
                <div className="text-xl font-mono font-bold text-gray-800">
                  {fmtSGD(toNum(currentSavings))}
                </div>
              </div>
              <div className="h-8 w-px bg-gray-200" />
              <div className="text-right">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                  Proj. End Balance
                </div>
                <div
                  className={`text-xl font-mono font-bold ${
                    finalBalance >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
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
                  <th className="p-3 text-right font-bold text-emerald-700 bg-gray-100">
                    Base Income
                  </th>
                  <th className="p-3 text-right font-bold bg-gray-100">
                    Additional
                  </th>
                  <th className="p-3 text-right font-bold bg-gray-100">
                    Retire Inc.
                  </th>
                  <th className="p-3 text-right font-bold text-blue-600 bg-gray-100">
                    Interest
                  </th>
                  <th className="p-3 text-right font-bold text-amber-600 bg-gray-100">
                    💼 Invest
                  </th>
                  <th className="p-3 text-right font-bold text-purple-600 bg-gray-100">
                    🎓 Edu
                  </th>
                  <th className="p-3 text-right font-bold text-red-600 bg-gray-100">
                    🏖️ Retire
                  </th>
                  <th className="p-3 text-right font-bold bg-gray-100">
                    Withdrawals
                  </th>
                  <th className="p-3 text-right font-bold bg-gray-100">
                    Net Cashflow
                  </th>
                  <th className="p-3 text-right font-bold bg-gray-100">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {monthlyProjection.slice(0, monthsToShow).map((row, idx, arr) => {
                  const isRetirementStart =
                    row.age === fiAge &&
                    (idx === 0 || arr[idx - 1].age < fiAge);
                  return (
                    <React.Fragment key={idx}>
                      {isRetirementStart && (
                        <tr className="bg-amber-100 border-y-2 border-amber-400">
                          <td
                            colSpan={12}
                            className="p-2 text-center text-amber-900 font-bold text-xs uppercase tracking-widest"
                          >
                            🎉 Financial Independence Achieved (Age {fiAge}) —
                            Active Income Stops
                          </td>
                        </tr>
                      )}
                      <tr className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-3 font-medium">
                          {row.monthName} {row.year}
                        </td>
                        <td className="p-3 text-gray-500">{row.age}</td>
                        <td className="p-3 text-right text-emerald-600">
                          {row.isRetired ? fmtSGD(0) : fmtSGD(row.baseIncome)}
                        </td>
                        <td
                          className={`p-3 text-right ${
                            row.additionalIncome > 0
                              ? 'text-emerald-600 font-bold'
                              : 'text-gray-400'
                          }`}
                        >
                          {row.additionalIncome > 0
                            ? fmtSGD(row.additionalIncome)
                            : '-'}
                        </td>
                        <td
                          className={`p-3 text-right ${
                            row.retirementIncome > 0
                              ? 'text-emerald-700 font-bold'
                              : 'text-gray-400'
                          }`}
                        >
                          {row.retirementIncome > 0
                            ? fmtSGD(row.retirementIncome)
                            : '-'}
                        </td>
                        <td
                          className={`p-3 text-right ${
                            row.interestEarned > 0
                              ? 'text-blue-600'
                              : 'text-gray-400'
                          }`}
                        >
                          {row.interestEarned > 0
                            ? fmtSGD(row.interestEarned)
                            : '-'}
                        </td>
                        <td
                          className={`p-3 text-right ${
                            row.investmentAmount > 0
                              ? 'text-amber-600'
                              : 'text-gray-400'
                          }`}
                        >
                          {row.investmentAmount > 0
                            ? fmtSGD(row.investmentAmount)
                            : '-'}
                        </td>
                        <td
                          className={`p-3 text-right ${
                            row.educationExpense > 0
                              ? 'text-purple-600 font-bold'
                              : 'text-gray-400'
                          }`}
                        >
                          {row.educationExpense > 0
                            ? fmtSGD(row.educationExpense)
                            : '-'}
                        </td>
                        <td
                          className={`p-3 text-right ${
                            row.retirementExpense > 0
                              ? 'text-red-600 font-bold'
                              : 'text-gray-400'
                          }`}
                        >
                          {row.retirementExpense > 0
                            ? fmtSGD(row.retirementExpense)
                            : '-'}
                        </td>
                        <td
                          className={`p-3 text-right ${
                            row.withdrawal > 0
                              ? 'text-red-500'
                              : 'text-gray-400'
                          }`}
                        >
                          {row.withdrawal > 0
                            ? fmtSGD(row.withdrawal)
                            : '-'}
                        </td>
                        <td
                          className={`p-3 text-right font-bold ${
                            row.netCashflow >= 0
                              ? 'text-emerald-600'
                              : 'text-red-600'
                          }`}
                        >
                          {fmtSGD(row.netCashflow)}
                        </td>
                        <td
                          className={`p-3 text-right font-extrabold ${
                            row.balance >= 0
                              ? 'text-emerald-800'
                              : 'text-red-800'
                          }`}
                        >
                          {fmtSGD(row.balance)}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Buttons */}
          {monthlyProjection.length > monthsToShow && (
            <div className="mt-4 p-4 flex justify-center gap-3 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() =>
                  setMonthsToShow((prev) =>
                    Math.min(prev + 120, monthlyProjection.length)
                  )
                }
                className="px-6 py-3 bg-gradient-to-br from-blue-500 to-blue-600 text-white font-bold rounded-lg shadow-md hover:from-blue-600 hover:to-blue-700"
              >
                📅 Show Next 10 Years (
                {monthlyProjection.length - monthsToShow} remaining)
              </button>
              <button
                onClick={() => setMonthsToShow(monthlyProjection.length)}
                className="px-6 py-3 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-bold rounded-lg shadow-md hover:from-emerald-600 hover:to-emerald-700"
              >
                📊 Show All ({monthlyProjection.length} months)
              </button>
            </div>
          )}
          {monthsToShow >= monthlyProjection.length &&
            monthlyProjection.length > 120 && (
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
          {EXPENSE_CATEGORIES.map((cat) => (
            <LabeledText
              key={cat.key}
              label={cat.label}
              value={expenses[cat.key]}
              onChange={(val) =>
                setExpenses({
                  ...expenses,
                  [cat.key]: val
                })
              }
              placeholder="0"
            />
          ))}
        </div>

        {/* Pie Chart */}
        {pieData.length > 0 && (
          <div className="mt-6 h-[300px]">
            <ResponsiveContainer width="100%" height={300}>
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
                <Tooltip formatter={(value: any) => fmtSGD(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default CashflowTab;