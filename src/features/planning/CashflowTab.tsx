
import React, { useMemo, useState, useRef } from 'react';
import { toNum, fmtSGD, monthNames } from '../../lib/helpers';
import LabeledText from '../../components/common/LabeledText';
import Card from '../../components/common/Card';
import LabeledSelect from '../../components/common/LabeledSelect';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { CpfData, Expenses, CashflowData, Profile, CustomExpense, RetirementSettings, CashflowState, CpfState } from '../../types';

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
  cpfState: CpfState;
}

const CashflowTab: React.FC<CashflowTabProps> = ({ 
  cpfData, expenses, setExpenses, cashflowData, profile, customExpenses, setCustomExpenses, retirement,
  cashflowState, setCashflowState, age, cpfState
}) => {
  const { 
    currentSavings = '', 
    projectToAge = '100', 
    bankInterestRate = '0.05', 
    additionalIncomes = [], 
    withdrawals = [], 
    customBaseIncome = '', 
    customRetirementIncome = '',
    incomeMode = 'simple',
    incomeTiers = []
  } = cashflowState || {};

  const [viewMode, setViewMode] = useState<'summary' | 'monthly'>('summary');
  const [monthsToShow, setMonthsToShow] = useState(120);
  const [isSavingsModalOpen, setIsSavingsModalOpen] = useState(false);
  
  const retirementIncomeRef = useRef<HTMLDivElement>(null);

  const updateState = (key: keyof CashflowState, value: any) => {
    setCashflowState({ ...cashflowState, [key]: value });
  };

  const currentAge = age || 30; 
  const retirementAge = toNum(profile.retirementAge, 65);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  
  const scrollToRetireIncome = () => {
    if (retirementIncomeRef.current) {
      retirementIncomeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      retirementIncomeRef.current.classList.add('ring-4', 'ring-amber-300');
      setTimeout(() => retirementIncomeRef.current?.classList.remove('ring-4', 'ring-amber-300'), 1500);
      const input = retirementIncomeRef.current.querySelector('input');
      if (input) input.focus();
    }
  };

  // Add Income Tier
  const addIncomeTier = () => {
    const lastTier = incomeTiers.length > 0 ? incomeTiers[incomeTiers.length - 1] : null;
    const start = lastTier ? lastTier.endAge : currentAge;
    
    updateState('incomeTiers', [...incomeTiers, {
      id: Date.now(),
      startAge: start,
      endAge: Math.min(start + 5, retirementAge),
      amount: cashflowData?.monthlySavings ? String(cashflowData.monthlySavings) : '5000'
    }]);
  };

  const removeIncomeTier = (id: number) => {
    updateState('incomeTiers', incomeTiers.filter(t => t.id !== id));
  };

  const updateIncomeTier = (id: number, field: string, val: any) => {
    updateState('incomeTiers', incomeTiers.map(t => t.id === id ? { ...t, [field]: val } : t));
  };

  // Standard CRUD for Additional Incomes & Withdrawals
  const addIncome = () => {
    updateState('additionalIncomes', [...additionalIncomes, {
      id: Date.now(), name: '', amount: '', type: 'recurring', frequency: 'monthly', startAge: currentAge, startMonth: currentMonth, endAge: null
    }]);
  };
  const removeIncome = (id: number) => updateState('additionalIncomes', additionalIncomes.filter(i => i.id !== id));
  const updateIncomeItem = (id: number, field: string, value: any) => updateState('additionalIncomes', additionalIncomes.map(i => i.id === id ? { ...i, [field]: value } : i));
  
  const addWithdrawal = () => {
    updateState('withdrawals', [...withdrawals, {
      id: Date.now(), name: '', amount: '', type: 'onetime', frequency: 'monthly', startAge: currentAge, startMonth: currentMonth
    }]);
  };
  const removeWithdrawal = (id: number) => updateState('withdrawals', withdrawals.filter(w => w.id !== id));
  const updateWithdrawalItem = (id: number, field: string, value: any) => updateState('withdrawals', withdrawals.map(w => w.id === id ? { ...w, [field]: value } : w));

  // --- CPF LIFE ESTIMATOR ---
  const estimatedCpfLife = useMemo(() => {
     if (!cpfState || !cpfData) return 0;
     
     const currentOA = toNum(cpfState.currentBalances?.oa, 0);
     const currentSA = toNum(cpfState.currentBalances?.sa, 0);
     const monthlyContrib = cpfData.total;
     
     const yearsToRetire = Math.max(0, retirementAge - currentAge);
     const yearsTo65 = Math.max(0, 65 - currentAge);
     const contributionYears = Math.min(yearsToRetire, yearsTo65);
     const annualContrib = monthlyContrib * 12;
     
     let futureBalance = (currentOA + currentSA) * Math.pow(1.03, yearsTo65);
     
     if (contributionYears > 0) {
        const contributionsFV = annualContrib * ((Math.pow(1.03, contributionYears) - 1) / 0.03);
        const remainingYearsTo65 = Math.max(0, 65 - (currentAge + contributionYears));
        const totalContribGrowth = contributionsFV * Math.pow(1.03, remainingYearsTo65);
        futureBalance += totalContribGrowth;
     }
     
     return futureBalance * 0.008;
  }, [cpfState, cpfData, currentAge, retirementAge]);
  
  // Calculate monthly projection
  const monthlyProjection = useMemo(() => {
    if (!cashflowData) return [];
    
    const targetAge = parseInt(projectToAge) || 100;
    const totalMonths = Math.max(1, (targetAge - currentAge) * 12);
    const projection = [];
    
    let balance = toNum(currentSavings, 0);
    const monthlyInterestRate = toNum(bankInterestRate, 0) / 100 / 12;

    // SIMPLE MODE Base
    const simpleBaseSavings = customBaseIncome !== undefined && customBaseIncome !== '' 
        ? toNum(customBaseIncome) 
        : cashflowData.monthlySavings;
    
    for (let m = 0; m < totalMonths; m++) {
      const ageAtMonth = currentAge + (m / 12);
      
      const isRetired = ageAtMonth >= retirementAge;
      const isCpfLifeActive = ageAtMonth >= 65;

      const monthIndex = (currentMonth + m) % 12;
      const yearOffset = Math.floor((currentMonth + m) / 12);
      const year = currentYear + yearOffset;
      
      // Apply interest
      const interestEarned = balance * monthlyInterestRate;
      balance += interestEarned;
      
      // Base cashflow logic
      let monthIncome = 0;
      
      if (!isRetired) {
         if (incomeMode === 'tiered') {
            // TIERED MODE: Find active tier for current age
            const activeTier = incomeTiers.find(t => ageAtMonth >= t.startAge && ageAtMonth < t.endAge);
            if (activeTier) {
               monthIncome = toNum(activeTier.amount);
            }
         } else {
            // SIMPLE MODE
            monthIncome = simpleBaseSavings;
         }
      }
      
      // Retirement Incomes
      let retirementIncomeVal = 0;
      let cpfLifeIncomeVal = 0;

      if (isRetired) {
         if (customRetirementIncome !== undefined && customRetirementIncome !== '') {
            retirementIncomeVal = toNum(customRetirementIncome);
         }
         if (isCpfLifeActive) {
            cpfLifeIncomeVal = estimatedCpfLife;
         }
      }
      
      let additionalIncome = 0;
      let withdrawalAmount = 0;
      let educationExpense = 0;
      
      // Calculate education expenses
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
          
          if (childAgeAtMonth >= eduStart && childAgeAtMonth < eduEnd) {
             educationExpense += monthlyEduCost;
          }
          if (childAgeAtMonth >= uniStartAge && childAgeAtMonth < uniStartAge + uniDuration) {
             educationExpense += monthlyUniCost; 
          }
        });
      }
      withdrawalAmount += educationExpense;
      
      // Calculate retirement expenses (Living expenses)
      let retirementExpense = 0;
      const baseRetirementExpense = toNum(profile.customRetirementExpense, 0) > 0 
        ? toNum(profile.customRetirementExpense, 0)
        : cashflowData.totalExpenses * 0.7;

      if (isRetired && baseRetirementExpense > 0) {
         const yearsFromNow = ageAtMonth - currentAge;
         retirementExpense = baseRetirementExpense * Math.pow(1.03, yearsFromNow);
         withdrawalAmount += retirementExpense;
      }
      
      // Calculate investment deduction (ONLY if working)
      let monthlyInvestmentAmount = 0;
      if (!isRetired) {
        if (profile.monthlyInvestmentAmount && toNum(profile.monthlyInvestmentAmount, 0) > 0) {
          monthlyInvestmentAmount = toNum(profile.monthlyInvestmentAmount, 0);
        } else {
          const investmentPercent = toNum(retirement?.investmentPercent, 100);
          monthlyInvestmentAmount = (monthIncome * investmentPercent) / 100;
        }
        withdrawalAmount += monthlyInvestmentAmount;
      }
      
      // Additional Incomes
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
      
      // Withdrawals
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
      
      const netCashflow = monthIncome + retirementIncomeVal + cpfLifeIncomeVal + additionalIncome - withdrawalAmount;
      balance += netCashflow;
      
      projection.push({
        month: m,
        age: Math.floor(ageAtMonth),
        ageDecimal: ageAtMonth,
        year,
        monthName: monthNames[monthIndex],
        baseIncome: monthIncome,
        retirementIncome: retirementIncomeVal,
        cpfLifeIncome: cpfLifeIncomeVal,
        additionalIncome,
        totalIncome: monthIncome + retirementIncomeVal + cpfLifeIncomeVal + additionalIncome,
        withdrawal: withdrawalAmount,
        educationExpense,
        retirementExpense,
        investmentAmount: monthlyInvestmentAmount,
        interestEarned,
        netCashflow,
        balance,
        isRetired,
        isCpfLifeActive
      });
    }
    
    return projection;
  }, [cashflowData, currentSavings, projectToAge, additionalIncomes, withdrawals, bankInterestRate, profile, retirement, currentAge, customBaseIncome, customRetirementIncome, estimatedCpfLife, incomeMode, incomeTiers]);
  
  const finalBalance = monthlyProjection.length > 0 ? monthlyProjection[monthlyProjection.length - 1].balance : 0;
  const totalIncome = monthlyProjection.reduce((sum, m) => sum + m.totalIncome, 0);
  const totalWithdrawals = monthlyProjection.reduce((sum, m) => sum + m.withdrawal, 0);
  const