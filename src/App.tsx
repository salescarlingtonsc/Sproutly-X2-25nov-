
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toNum, parseDob, monthsSinceDob } from './lib/helpers';
import { computeCpf, computeRetirementProjection } from './lib/calculators';
import { db } from './lib/db';
import { useAuth } from './contexts/AuthContext';
import { getClientLimit } from './lib/config';
import AppShell from './components/layout/AppShell';
import ErrorBoundary from './components/common/ErrorBoundary';
import { 
  Profile, Expenses, CustomExpense, Client, RetirementSettings,
  CpfState, CashflowState, PropertyState, WealthState, InvestorState, InsuranceState
} from './types';

// Import Tabs
import DisclaimerTab from './features/disclaimer/DisclaimerTab';
import ProfileTab from './features/profile/ProfileTab';
import ChildrenTab from './features/children/ChildrenTab';
import CpfTab from './features/cpf/CpfTab';
import CashflowTab from './features/planning/CashflowTab';
import RetirementTab from './features/planning/RetirementTab';
import InvestorTab from './features/investor/InvestorTab';
import WealthToolTab from './features/wealth/WealthToolTab';
import PropertyCalculatorTab from './features/property/PropertyCalculatorTab';
import InsuranceTab from './features/insurance/InsuranceTab'; 
import LifeEventsTab from './features/life-events/LifeEventsTab';
import AnalyticsTab from './features/analytics/AnalyticsTab'; 
import CrmTab from './features/crm/CrmTab';
import AdminTab from './features/admin/AdminTab';
import LandingPage from './features/auth/LandingPage';

// Import Modals
import AuthModal from './features/auth/AuthModal';
import PricingModal from './features/subscription/PricingModal';

export default function App() {
  const { user, isLoading, signOut } = useAuth();
  
  // Modal State
  const [showLogin, setShowLogin] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  
  // Navigation State
  const [activeTab, setActiveTab] = useState('disclaimer');
  
  // CRM State
  const [clients, setClients] = useState<Client[]>([]);
  const [isClientLoading, setIsClientLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  
  // Auto-save State
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);

  // --- CORE DATA STATES ---

  // 0. Reference Code
  const [referenceCode, setReferenceCode] = useState<string>('');

  // 1. Profile
  const [profile, setProfile] = useState<Profile>({
    name: '',
    dob: '',
    gender: 'male',
    employmentStatus: 'employed',
    email: '',
    phone: '',
    monthlyIncome: '',
    grossSalary: '',
    takeHome: '',
    retirementAge: '65',
    customRetirementExpense: '',
    monthlyInvestmentAmount: '',
    investmentRates: { conservative: 0.05, moderate: 6, growth: 12 },
    wealthTarget: '100000',
    educationSettings: { 
      inflationRate: '3', 
      monthlyEducationCost: '800', 
      educationStartAge: '7',
      educationDuration: '10',
      universityCost: '8750', 
      universityDuration: '4' 
    },
    referenceYear: new Date().getFullYear(),
    referenceMonth: new Date().getMonth(),
    children: []
  });
  
  // 2. Expenses
  const [expenses, setExpenses] = useState<Expenses>({
    housing: '',
    food: '',
    transport: '',
    insurance: '',
    entertainment: '',
    others: ''
  });
  const [customExpenses, setCustomExpenses] = useState<CustomExpense[]>([]);
  
  // 3. Retirement Settings
  const [retirement, setRetirement] = useState<RetirementSettings>({
    initialSavings: '',
    scenario: 'moderate',
    investmentPercent: '100',
    customReturnRate: ''
  });

  // 4. CPF State
  const [cpfState, setCpfState] = useState<CpfState>({
    currentBalances: { oa: '', sa: '', ma: '' },
    withdrawals: []
  });

  // 5. Cashflow State (UPDATED)
  const [cashflowState, setCashflowState] = useState<CashflowState>({
    currentSavings: '',
    projectToAge: '100',
    bankInterestRate: '0.05',
    additionalIncomes: [],
    withdrawals: [],
    customBaseIncome: '',
    customRetirementIncome: '',
    incomeMode: 'simple',
    incomeTiers: []
  });

  // 6. Property State
  const [propertyState, setPropertyState] = useState<PropertyState>({
    propertyPrice: '',
    propertyType: 'hdb',
    annualValue: '',
    downPaymentPercent: '25',
    loanTenure: '25',
    interestRate: '3.5',
    useCpfOa: true,
    cpfOaAmount: ''
  });

  // 7. Wealth Tool State
  const [wealthState, setWealthState] = useState<WealthState>({
    annualPremium: '',
    projectionYears: '40',
    growthRate: '5'
  });

  // 8. Investor State
  const [investorState, setInvestorState] = useState<InvestorState>({
    portfolioValue: '0', 
    portfolioType: 'stock-picking'
  });

  // 9. Insurance State
  const [insuranceState, setInsuranceState] = useState<InsuranceState>({
    policies: [], 
    currentDeath: '',
    currentTPD: '',
    currentCI: ''
  });
  
  const generateRefCode = () => {
    const num = Math.floor(100000 + Math.random() * 900000);
    return `C-${num}`;
  };

  useEffect(() => {
    if (!referenceCode && !selectedClientId) {
      setReferenceCode(generateRefCode());
    }
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('error=')) {
      const params = new URLSearchParams(hash.substring(1));
      const errorDesc = params.get('error_description');
      if (errorDesc) {
        setAuthError(decodeURIComponent(errorDesc.replace(/\+/g, ' ')));
        setShowLogin(true);
      }
    }
  }, []);
  
  const fetchClients = useCallback(async () => {
    if (!user || user.status !== 'approved') return;
    setIsClientLoading(true);
    try {
      const data = await db.getClients(user.id);
      setClients(data);
    } catch (error) {
      console.error("Failed to load clients", error);
    } finally {
      setIsClientLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);
  
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
    
    let totalExpenses: number = Object.values(expenses).reduce<number>((sum: number, val) => sum + toNum(val), 0);
    if (customExpenses) {
      customExpenses.forEach(exp => {
        totalExpenses += toNum(exp.amount, 0);
      });
    }
    
    const monthlySavings = takeHome - totalExpenses;
    const annualSavings = monthlySavings * 12;
    
    return {
      takeHome,
      totalExpenses,
      monthlySavings,
      annualSavings,
      savingsRate: takeHome > 0 ? (monthlySavings / takeHome * 100) : 0
    };
  }, [cpfData, profile.takeHome, expenses, customExpenses]);
  
  const maxClients = useMemo(() => {
     if (!user) return 1;
     return getClientLimit(user.subscriptionTier, user.extraSlots);
  }, [user]);

  // --- CLIENT MANAGEMENT (CRUD) ---
  
  const saveClient = useCallback(async (isAutoSave = false) => {
    if (!user) {
      if (!isAutoSave) alert("Please log in to save.");
      return;
    }

    const limit = maxClients;
    
    if (!selectedClientId && clients.length >= limit) {
      if (!isAutoSave) {
        setShowPricing(true);
        alert(`You have reached your limit of ${limit} saved client profiles.\n\nPlease upgrade or purchase extra slots.`);
      }
      return;
    }

    if (isAutoSave) setSaveStatus('saving');

    const finalRefCode = referenceCode || generateRefCode();
    if (!referenceCode) setReferenceCode(finalRefCode);

    const clientData: Client = {
      id: selectedClientId || crypto.randomUUID(),
      referenceCode: finalRefCode,
      profile,
      expenses,
      customExpenses,
      retirement,
      cpfState,
      cashflowState,
      propertyState,
      wealthState,
      investorState,
      insuranceState,
      lastUpdated: new Date().toISOString(),
      followUp: clients.find(c => c.id === selectedClientId)?.followUp || {
        nextDate: null,
        status: 'none'
      }
    };
    
    try {
      const savedClient = await db.saveClient(clientData, user.id);
      
      // Update local state
      if (selectedClientId) {
        setClients(prev => prev.map(c => c.id === selectedClientId ? savedClient : c));
        
        // CRITICAL: If the ID changed (e.g. recovery from RLS ID conflict), update selection
        if (savedClient.id !== selectedClientId) {
           console.log(`Updated client ID from ${selectedClientId} to ${savedClient.id}`);
           setSelectedClientId(savedClient.id);
        }
      } else {
        setClients(prev => [savedClient, ...prev]);
        setSelectedClientId(savedClient.id);
      }
      
      setLastSavedTime(new Date());
      setSaveStatus('saved');
      
      if (!isAutoSave) {
        alert(`Client saved successfully! Reference: ${finalRefCode}`);
      }
    } catch (error: any) {
      console.error("Save failed", error);
      setSaveStatus('error');
      
      // Improve error display for objects
      let msg = 'Unknown error';
