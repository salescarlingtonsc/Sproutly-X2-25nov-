import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Profile, Expenses, CashflowState, CustomExpense, CpfState, RetirementSettings, 
  CpfData 
} from '../../types';
import { toNum, parseDob, monthsSinceDob } from '../../lib/helpers';
import { computeCpf } from '../../lib/calculators';

// Child Imports
import ProfileTab from '../profile/ProfileTab';
import CashflowTab from '../planning/CashflowTab';

// Default states for initialization
const defaultProfile: Profile = {
  name: '', dob: '', gender: 'male', employmentStatus: 'employed', email: '', phone: '',
  monthlyIncome: '', grossSalary: '', takeHome: '', retirementAge: '65',
  investmentRates: { conservative: 5, moderate: 6, growth: 12 },
  wealthTarget: '100000',
  referenceYear: new Date().getFullYear(), referenceMonth: new Date().getMonth(),
  children: []
};
const defaultCashflowState: CashflowState = {
  currentSavings: '', projectToAge: '100', bankInterestRate: '0.05',
  additionalIncomes: [], withdrawals: []
};
const defaultExpenses: Expenses = {
  housing: '', food: '', transport: '', insurance: '', entertainment: '', others: ''
};

interface FinancialPlannerPageProps {
  activeProfileId: string;
}

export default function FinancialPlannerPage({ activeProfileId }: FinancialPlannerPageProps) {
  // --- STATE DEFINITIONS ---
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [cashflowState, setCashflowState] = useState<CashflowState>(defaultCashflowState);
  const [expenses, setExpenses] = useState<Expenses>(defaultExpenses);
  const [customExpenses, setCustomExpenses] = useState<CustomExpense[]>([]);
  
  // Additional states needed by children
  const [retirement, setRetirement] = useState<RetirementSettings>({
    initialSavings: '', scenario: 'moderate', investmentPercent: '100'
  });
  const [cpfState, setCpfState] = useState<CpfState>({
    currentBalances: { oa: '', sa: '', ma: '' }, withdrawals: []
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

  // --- COMPUTED VALUES (Passed to children) ---
  const age = useMemo(() => {
     const dob = parseDob(profile.dob);
     if (!dob) return 0;
     return Math.floor(monthsSinceDob(dob, profile.referenceYear, profile.referenceMonth)/12);
  }, [profile.dob, profile.referenceYear, profile.referenceMonth]);

  const cpfData = useMemo(() => {
     const income = toNum(profile.grossSalary || profile.monthlyIncome);
     if (income === 0 || age === 0) return null;
     return computeCpf(income, age);
  }, [profile.grossSalary, profile.monthlyIncome, age]);

  const cashflowData = useMemo(() => {
     const takeHome = toNum(profile.takeHome) || (cpfData ? cpfData.takeHome : 0);
     let total = Object.values(expenses).reduce((a,b)=>a+toNum(b),0);
     customExpenses.forEach(c => total += toNum(c.amount));
     const savings = takeHome - total;
     return {
        takeHome,
        totalExpenses: total,
        monthlySavings: savings,
        annualSavings: savings * 12,
        savingsRate: takeHome ? (savings/takeHome)*100 : 0
     };
  }, [cpfData, profile.takeHome, expenses, customExpenses]);

  // --- LOAD DATA FROM SUPABASE ---
  useEffect(() => {
    async function loadProfile() {
      if (!supabase) return;
      setLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) return;

      const { data } = await supabase
        .from('client_profiles')
        .select('*')
        .eq('user_id', user.id)
        .eq('profile_id', activeProfileId)
        .single();

      if (data) {
        setProfile(data.profile || defaultProfile);
        setCashflowState(data.cashflow_state || defaultCashflowState);
        setExpenses(data.expenses || defaultExpenses);
        setCustomExpenses(data.custom_expenses || []);
      }

      setLoading(false);
    }

    loadProfile();
  }, [activeProfileId]);

  // --- AUTOSAVE (NO LOCAL STORAGE) ---
  useEffect(() => {
    if (loading || !supabase) return;

    const timeout = setTimeout(async () => {
      setSaving(true);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) {
        console.error("Autosave failed: No authenticated user.");
        setSaving(false);
        return;
      }

      // Upsert to client_profiles table
      const { error } = await supabase.from('client_profiles').upsert({
        user_id: user.id,
        profile_id: activeProfileId,
        profile,
        cashflow_state: cashflowState,
        expenses,
        custom_expenses: customExpenses,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id, profile_id' });

      if (error) {
        console.error("Autosave error:", error);
      }

      setSaving(false);
    }, 800); // debounce

    return () => clearTimeout(timeout);
  }, [profile, cashflowState, expenses, customExpenses, loading, activeProfileId]);

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 bg-white border-b border-gray-200 z-10 px-6 py-3 flex justify-between items-center">
         <div className="flex gap-2">
            <button onClick={() => setActiveTab('profile')} className={`px-4 py-2 rounded ${activeTab === 'profile' ? 'bg-blue-100 text-blue-700 font-bold' : 'text-gray-600'}`}>Profile</button>
            <button onClick={() => setActiveTab('cashflow')} className={`px-4 py-2 rounded ${activeTab === 'cashflow' ? 'bg-blue-100 text-blue-700 font-bold' : 'text-gray-600'}`}>Cashflow</button>
         </div>
         
         {/* SAVE STATUS UI */}
         {saving ? (
            <div className="text-xs text-blue-500 font-bold animate-pulse">Saving...</div>
         ) : (
            <div className="text-xs text-green-600 font-bold">All changes saved</div>
         )}
      </div>

      <div className="max-w-7xl mx-auto py-6">
        {activeTab === 'profile' && (
          <ProfileTab
            profile={profile}
            setProfile={setProfile}
            age={age}
            cpfData={cpfData}
            expenses={expenses}
            setExpenses={setExpenses}
            customExpenses={customExpenses}
            setCustomExpenses={setCustomExpenses}
            cashflowData={cashflowData}
          />
        )}

        {activeTab === 'cashflow' && (
          <CashflowTab
            profile={profile}
            expenses={expenses}
            setExpenses={setExpenses}
            customExpenses={customExpenses}
            setCustomExpenses={setCustomExpenses}
            cashflowData={cashflowData}
            cashflowState={cashflowState}
            setCashflowState={setCashflowState}
            retirement={retirement}
            age={age}
            cpfData={cpfData}
            cpfState={cpfState}
          />
        )}
      </div>
    </div>
  );
}