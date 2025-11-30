import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Profile, Expenses, CashflowState, CustomExpense, CpfState, RetirementSettings, 
  PropertyState, WealthState, InvestorState, InsuranceState, CpfData, CashflowData 
} from '../../types';
import { toNum, parseDob, monthsSinceDob } from '../../lib/helpers';
import { computeCpf } from '../../lib/calculators';
import AppShell from '../../components/layout/AppShell';

// Child Imports
import ProfileTab from '../profile/ProfileTab';
import CashflowTab from '../planning/CashflowTab';
import ChildrenTab from '../children/ChildrenTab';
import CpfTab from '../cpf/CpfTab';
import RetirementTab from '../planning/RetirementTab';
import InvestorTab from '../investor/InvestorTab';
import WealthToolTab from '../wealth/WealthToolTab';
import PropertyCalculatorTab from '../property/PropertyCalculatorTab';
import InsuranceTab from '../insurance/InsuranceTab';
import LifeEventsTab from '../life-events/LifeEventsTab';
import AnalyticsTab from '../analytics/AnalyticsTab';

interface FinancialPlannerPageProps {
  activeProfileId: string;
}

export default function FinancialPlannerPage({ activeProfileId }: FinancialPlannerPageProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('profile'); // Default tab

  // --- STATE DEFINITIONS ---
  const [profile, setProfile] = useState<Profile>({
    name: '', dob: '', gender: 'male', employmentStatus: 'employed', email: '', phone: '',
    monthlyIncome: '', grossSalary: '', takeHome: '', retirementAge: '65',
    investmentRates: { conservative: 5, moderate: 6, growth: 12 },
    wealthTarget: '100000',
    referenceYear: new Date().getFullYear(), referenceMonth: new Date().getMonth(),
    children: []
  });
  const [cashflowState, setCashflowState] = useState<CashflowState>({
    currentSavings: '', projectToAge: '100', bankInterestRate: '0.05',
    additionalIncomes: [], withdrawals: []
  });
  const [expenses, setExpenses] = useState<Expenses>({
    housing: '', food: '', transport: '', insurance: '', entertainment: '', others: ''
  });
  const [customExpenses, setCustomExpenses] = useState<CustomExpense[]>([]);
  const [cpfState, setCpfState] = useState<CpfState>({
    currentBalances: { oa: '', sa: '', ma: '' }, withdrawals: []
  });
  const [retirement, setRetirement] = useState<RetirementSettings>({
    initialSavings: '', scenario: 'moderate', investmentPercent: '100', customReturnRate: ''
  });
  const [propertyState, setPropertyState] = useState<PropertyState>({
    propertyPrice: '', propertyType: 'hdb', annualValue: '', downPaymentPercent: '25', loanTenure: '25', interestRate: '3.5', useCpfOa: true, cpfOaAmount: ''
  });
  const [wealthState, setWealthState] = useState<WealthState>({
    annualPremium: '', projectionYears: '40', growthRate: '5'
  });
  const [investorState, setInvestorState] = useState<InvestorState>({
    portfolioValue: '0', portfolioType: 'stock-picking'
  });
  const [insuranceState, setInsuranceState] = useState<InsuranceState>({
    policies: [], currentDeath: '', currentTPD: '', currentCI: ''
  });

  // --- COMPUTED VALUES ---
  const age = useMemo(() => {
    const dob = parseDob(profile.dob);
    if (!dob) return 0;
    const months = monthsSinceDob(dob, profile.referenceYear, profile.referenceMonth);
    return Math.floor(months / 12);
  }, [profile.dob, profile.referenceYear, profile.referenceMonth]);

  const cpfData = useMemo(() => {
    const income = toNum(profile.grossSalary || profile.monthlyIncome);
    if (income === 0 || age === 0) return null;
    return computeCpf(income, age);
  }, [profile.grossSalary, profile.monthlyIncome, age]);

  const cashflowData = useMemo(() => {
    if (!cpfData && !profile.takeHome) return null;
    const takeHome = toNum(profile.takeHome) || (cpfData ? cpfData.takeHome : 0);
    let totalExpenses = Object.values(expenses).reduce((sum, val) => sum + toNum(val), 0);
    customExpenses.forEach(exp => totalExpenses += toNum(exp.amount, 0));
    
    const monthlySavings = takeHome - totalExpenses;
    return {
      takeHome, totalExpenses, monthlySavings,
      annualSavings: monthlySavings * 12,
      savingsRate: takeHome > 0 ? (monthlySavings / takeHome * 100) : 0
    };
  }, [cpfData, profile.takeHome, expenses, customExpenses]);

  // --- LOAD DATA ON MOUNT ---
  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      const { data: userData } = await supabase!.auth.getUser();
      const user = userData?.user;
      if (!user || !activeProfileId) return;

      const { data, error } = await supabase!
        .from('client_profiles')
        .select('*')
        .eq('user_id', user.id)
        .eq('profile_id', activeProfileId)
        .single();

      if (data) {
        setProfile(data.profile || profile);
        setCashflowState(data.cashflow_state || cashflowState);
        setExpenses(data.expenses || expenses);
        setCustomExpenses(data.custom_expenses || customExpenses);
        // Load other states if schema supports them, assuming JSONB extension
        if (data.cpf_state) setCpfState(data.cpf_state);
        if (data.retirement_settings) setRetirement(data.retirement_settings);
        if (data.property_state) setPropertyState(data.property_state);
        if (data.wealth_state) setWealthState(data.wealth_state);
        if (data.investor_state) setInvestorState(data.investor_state);
        if (data.insurance_state) setInsuranceState(data.insurance_state);
      }
      setLoading(false);
    }
    loadProfile();
  }, [activeProfileId]);

  // --- AUTOSAVE EFFECT ---
  useEffect(() => {
    if (loading) return;

    const timeout = setTimeout(async () => {
      setSaving(true);
      const { data: userData } = await supabase!.auth.getUser();
      const user = userData?.user;
      if (!user) return;

      // Upsert to client_profiles table
      await supabase!.from('client_profiles').upsert({
        user_id: user.id,
        profile_id: activeProfileId,
        profile,
        cashflow_state: cashflowState,
        expenses,
        custom_expenses: customExpenses,
        // Extra fields mapping
        cpf_state: cpfState,
        retirement_settings: retirement,
        property_state: propertyState,
        wealth_state: wealthState,
        investor_state: investorState,
        insurance_state: insuranceState,
        updated_at: new Date().toISOString()
      });

      setSaving(false);
    }, 800); // debounce

    return () => clearTimeout(timeout);
  }, [
    profile, cashflowState, expenses, customExpenses, 
    cpfState, retirement, propertyState, wealthState, investorState, insuranceState,
    loading, activeProfileId
  ]);

  // --- RENDER ---
  return (
    <AppShell 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      onLoginClick={() => {}} 
      onPricingClick={() => {}} 
      onSaveClick={() => {}}
      clientName={profile.name}
      saveStatus={saving ? 'saving' : 'saved'}
    >
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

      {/* Other tabs wired similarly */}
      {activeTab === 'children' && (
        <ChildrenTab 
          children={profile.children || []}
          setChildren={(c) => setProfile({...profile, children: c})}
          ageYears={age}
          profile={profile}
          setProfile={setProfile}
        />
      )}

      {activeTab === 'cpf' && (
         <CpfTab cpfData={cpfData} age={age} cpfState={cpfState} setCpfState={setCpfState} />
      )}

      {activeTab === 'insurance' && (
         <InsuranceTab insuranceState={insuranceState} setInsuranceState={setInsuranceState} profile={profile} />
      )}

      {activeTab === 'retirement' && (
         <RetirementTab 
            cashflowData={cashflowData} retirement={retirement} setRetirement={setRetirement}
            profile={profile} age={age} investorState={investorState} setInvestorState={setInvestorState}
            cpfState={cpfState} cashflowState={cashflowState}
         />
      )}

      {activeTab === 'investor' && (
         <InvestorTab investorState={investorState} setInvestorState={setInvestorState} />
      )}

      {activeTab === 'wealth' && (
         <WealthToolTab wealthState={wealthState} setWealthState={setWealthState} />
      )}

      {activeTab === 'property' && (
         <PropertyCalculatorTab age={age} cpfData={cpfData} propertyState={propertyState} setPropertyState={setPropertyState} />
      )}
      
      {activeTab === 'life_events' && (
        <LifeEventsTab 
          profile={profile} insuranceState={insuranceState} cashflowState={cashflowState}
          investorState={investorState} cpfState={cpfState} cashflowData={cashflowData} age={age}
        />
      )}

      {activeTab === 'analytics' && (
         <AnalyticsTab clients={[]} /> // Placeholder for analytics which usually requires all clients
      )}
    </AppShell>
  );
}