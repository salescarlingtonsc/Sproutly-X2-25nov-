

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

  // 0. Reference Code (New Unique Identifier)
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
    // Default chart settings
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

  // 5. Cashflow State
  const [cashflowState, setCashflowState] = useState<CashflowState>({
    currentSavings: '',
    projectToAge: '100',
    bankInterestRate: '0.05',
    additionalIncomes: [],
    withdrawals: [],
    customBaseIncome: '',
    customRetirementIncome: ''
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

  // 9. Insurance State (NEW)
  const [insuranceState, setInsuranceState] = useState<InsuranceState>({
    policies: [], // List of policies
    currentDeath: '',
    currentTPD: '',
    currentCI: ''
  });
  
  // Helper to generate a unique reference code
  const generateRefCode = () => {
    // Generates something like C-839201
    const num = Math.floor(100000 + Math.random() * 900000);
    return `C-${num}`;
  };

  // Initialize reference code on mount if none exists
  useEffect(() => {
    if (!referenceCode && !selectedClientId) {
      setReferenceCode(generateRefCode());
    }
  }, []);

  // --- COMPUTED VALUES ---

  // Check for URL errors (Supabase Auth redirects)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('error=')) {
      // Extract error description
      const params = new URLSearchParams(hash.substring(1)); // remove #
      const errorDesc = params.get('error_description');
      const errorCode = params.get('error_code');
      if (errorDesc) {
        setAuthError(decodeURIComponent(errorDesc.replace(/\+/g, ' ')));
        setShowLogin(true); // Open modal so they can try again
      }
    }
  }, []);
  
  // Load Clients (Moved to useCallback for manual refresh)
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

  // Initial Fetch
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
  
  // Calculate Max Clients allowed
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

    // CHECK PERMISSIONS & LIMITS
    const limit = maxClients;
    
    // If we are creating a NEW client (not editing existing) and we hit the limit
    if (!selectedClientId && clients.length >= limit) {
      if (!isAutoSave) {
        setShowPricing(true);
        alert(`You have reached your limit of ${limit} saved client profiles.\n\nPlease upgrade or purchase extra slots.`);
      }
      return;
    }

    if (isAutoSave) setSaveStatus('saving');

    // Ensure reference code exists
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
      insuranceState, // Save Insurance Data
      lastUpdated: new Date().toISOString(),
      followUp: clients.find(c => c.id === selectedClientId)?.followUp || {
        nextDate: null,
        status: 'none'
      }
    };
    
    try {
      const savedClient = await db.saveClient(clientData, user.id);
      
      if (selectedClientId) {
        setClients(prev => prev.map(c => c.id === selectedClientId ? savedClient : c));
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
      
      // Robust error message extraction
      let msg = 'Unknown database error';
      if (typeof error === 'string') {
        msg = error;
      } else if (error instanceof Error) {
        msg = error.message;
      } else if (error && typeof error === 'object') {
        msg = error.message || error.error_description || JSON.stringify(error);
      }

      if (!isAutoSave) alert(`Failed to save client: ${msg}`);
    }
  }, [user, maxClients, selectedClientId, clients, referenceCode, profile, expenses, customExpenses, retirement, cpfState, cashflowState, propertyState, wealthState, investorState, insuranceState]);

  // --- AUTO SAVE EFFECT ---
  useEffect(() => {
    // Only auto-save if a client is selected (already created)
    if (!selectedClientId) return;

    // Debounce the save operation (wait 2 seconds after last change)
    const timeoutId = setTimeout(() => {
      saveClient(true);
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [
    // Depend on all data states so any change triggers the debounce
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
    selectedClientId,
    saveClient
  ]);
  
  const loadClient = (client: Client) => {
    setSelectedClientId(client.id);
    setReferenceCode(client.referenceCode || generateRefCode()); // Use existing ref or gen new if legacy data
    
    // MIGRATION: Handle Education Settings
    const loadedEdu = (client.profile.educationSettings || {}) as any;
    
    let monthlyEduCost = loadedEdu.monthlyEducationCost || '800';
    if (!loadedEdu.monthlyEducationCost && loadedEdu.primarySecondaryCost) {
       monthlyEduCost = String(Math.round(toNum(loadedEdu.primarySecondaryCost) / 12));
    }

    const safeEduSettings = {
      inflationRate: loadedEdu.inflationRate || '3',
      monthlyEducationCost: monthlyEduCost,
      educationStartAge: loadedEdu.educationStartAge || '7',
      educationDuration: loadedEdu.educationDuration || '10',
      universityCost: loadedEdu.universityCost || '8750',
      universityDuration: loadedEdu.universityDuration || '4'
    };

    setProfile({ 
      ...client.profile, 
      children: client.profile.children || [],
      investmentRates: client.profile.investmentRates || { conservative: 0.05, moderate: 6, growth: 12 },
      wealthTarget: client.profile.wealthTarget || '100000',
      educationSettings: safeEduSettings
    });
    
    setExpenses(client.expenses);
    setCustomExpenses(client.customExpenses || []);
    setRetirement(client.retirement);
    setCpfState(client.cpfState || { currentBalances: { oa: '', sa: '', ma: '' }, withdrawals: [] });
    
    // ROBUST MERGE for CashflowState to avoid crashes with missing arrays in legacy data
    // Handles undefined, null, or partial objects gracefully
    const loadedCashflow = client.cashflowState || {} as Partial<CashflowState>;
    setCashflowState({
      currentSavings: loadedCashflow.currentSavings || '',
      projectToAge: loadedCashflow.projectToAge || '100',
      bankInterestRate: loadedCashflow.bankInterestRate || '0.05',
      additionalIncomes: Array.isArray(loadedCashflow.additionalIncomes) ? loadedCashflow.additionalIncomes : [],
      withdrawals: Array.isArray(loadedCashflow.withdrawals) ? loadedCashflow.withdrawals : [],
      customBaseIncome: loadedCashflow.customBaseIncome || '',
      customRetirementIncome: loadedCashflow.customRetirementIncome || ''
    });

    setPropertyState(client.propertyState || { propertyPrice: '', propertyType: 'hdb', annualValue: '', downPaymentPercent: '25', loanTenure: '25', interestRate: '3.5', useCpfOa: true, cpfOaAmount: '' });
    setWealthState(client.wealthState || { annualPremium: '', projectionYears: '40', growthRate: '5' });
    setInvestorState(client.investorState || { portfolioValue: '0', portfolioType: 'stock-picking' });
    setInsuranceState(client.insuranceState || { policies: [], currentDeath: '', currentTPD: '', currentCI: '' });

    setSaveStatus('idle');
    setLastSavedTime(new Date(client.lastUpdated));
    setActiveTab('profile');
  };
  
  const deleteClient = async (clientId: string) => {
    if (confirm('Are you sure you want to delete this client?')) {
      try {
        await db.deleteClient(clientId, user?.id);
        setClients(clients.filter(c => c.id !== clientId));
        if (selectedClientId === clientId) {
          resetForm();
        }
      } catch (error) {
        console.error("Delete failed", error);
        alert("Failed to delete client");
      }
    }
  };
  
  const resetForm = () => {
    setSelectedClientId(null);
    setReferenceCode(generateRefCode()); // Generate new Ref ID for new client
    setProfile({
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
    setExpenses({ housing: '', food: '', transport: '', insurance: '', entertainment: '', others: '' });
    setCustomExpenses([]);
    setRetirement({ initialSavings: '', scenario: 'moderate', investmentPercent: '100', customReturnRate: '' });
    setCpfState({ currentBalances: { oa: '', sa: '', ma: '' }, withdrawals: [] });
    setCashflowState({ currentSavings: '', projectToAge: '100', bankInterestRate: '0.05', additionalIncomes: [], withdrawals: [], customBaseIncome: '', customRetirementIncome: '' });
    setPropertyState({ propertyPrice: '', propertyType: 'hdb', annualValue: '', downPaymentPercent: '25', loanTenure: '25', interestRate: '3.5', useCpfOa: true, cpfOaAmount: '' });
    setWealthState({ annualPremium: '', projectionYears: '40', growthRate: '5' });
    setInvestorState({ portfolioValue: '0', portfolioType: 'stock-picking' }); // Set to 0
    setInsuranceState({ policies: [], currentDeath: '', currentTPD: '', currentCI: '' });
    setSaveStatus('idle');
    setLastSavedTime(null);
    setActiveTab('profile');
  };
  
  const setFollowUp = (clientId: string, days: number) => {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + days);
    setClients(clients.map(c => 
      c.id === clientId ? { ...c, followUp: { nextDate: nextDate.toISOString(), status: 'pending' } } : c
    ));
  };
  
  const completeFollowUp = (clientId: string) => {
    setClients(clients.map(c => 
      c.id === clientId ? { ...c, followUp: { ...c.followUp, status: 'completed' } } : c
    ));
  };

  // --- RENDER LOGIC ---

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-4xl animate-bounce mb-2">🌱</div>
          <div className="text-gray-500 text-sm">Loading Application...</div>
        </div>
      </div>
    );
  }

  // GATE 1: If not logged in, show Landing Page
  if (!user) {
    return (
      <>
        <LandingPage onLogin={() => setShowLogin(true)} />
        <AuthModal 
          isOpen={showLogin} 
          onClose={() => {
             setShowLogin(false);
             setAuthError(null);
          }} 
          initialError={authError}
        />
      </>
    );
  }

  // GATE 2: If logged in but NOT approved
  if (user.status !== 'approved') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white max-w-md w-full p-8 rounded-2xl shadow-lg text-center">
          {user.status === 'rejected' ? (
             <>
              <div className="text-6xl mb-4">🚫</div>
              <h2 className="text-2xl font-bold text-red-600 mb-2">Access Denied</h2>
              <p className="text-gray-600 mb-6">
                Your account application has been reviewed and declined by the administrator.
              </p>
             </>
          ) : (
             <>
              <div className="text-6xl mb-4 animate-pulse">⏳</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Approval Pending</h2>
              <p className="text-gray-600 mb-6">
                Thanks for registering! Your account is currently under review. 
                You will be able to access the dashboard once an administrator approves your account.
              </p>
              <div className="p-4 bg-blue-50 text-blue-800 text-xs rounded-lg mb-6">
                Please contact the administrator if you need immediate access.
              </div>
             </>
          )}
          
          <button 
            onClick={signOut}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 font-bold"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <AppShell 
        activeTab={activeTab} 
        setActiveTab={setActiveTab}
        onLoginClick={() => setShowLogin(true)}
        onPricingClick={() => setShowPricing(true)}
        onSaveClick={() => saveClient(false)}
        clientRef={referenceCode}
        clientName={profile.name}
        saveStatus={saveStatus}
        lastSavedTime={lastSavedTime}
      >
        {activeTab === 'disclaimer' && (
          <ErrorBoundary>
            <DisclaimerTab />
          </ErrorBoundary>
        )}
        
        {activeTab === 'profile' && (
          <ErrorBoundary>
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
              // Pass CRM logic to Profile Tab
              clients={clients}
              onLoadClient={loadClient}
              onNewProfile={resetForm}
            />
          </ErrorBoundary>
        )}
        
        {activeTab === 'children' && (
          <ErrorBoundary>
            <ChildrenTab 
              children={profile.children || []} 
              setChildren={(children) => setProfile({ ...profile, children })} 
              ageYears={age}
              profile={profile}
              setProfile={setProfile} 
            />
          </ErrorBoundary>
        )}
        
        {activeTab === 'cpf' && (
          <ErrorBoundary>
            <CpfTab 
              cpfData={cpfData} 
              age={age} 
              cpfState={cpfState}
              setCpfState={setCpfState}
            />
          </ErrorBoundary>
        )}
        
        {activeTab === 'cashflow' && (
          <ErrorBoundary>
            <CashflowTab 
              cpfData={cpfData} 
              expenses={expenses} 
              setExpenses={setExpenses} 
              cashflowData={cashflowData}
              profile={profile}
              customExpenses={customExpenses}
              setCustomExpenses={setCustomExpenses}
              retirement={retirement}
              cashflowState={cashflowState}
              setCashflowState={setCashflowState}
              age={age}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'insurance' && (
          <ErrorBoundary>
            <InsuranceTab 
              insuranceState={insuranceState}
              setInsuranceState={setInsuranceState}
              profile={profile}
            />
          </ErrorBoundary>
        )}
        
        {activeTab === 'life_events' && (
           <ErrorBoundary>
              <LifeEventsTab 
                profile={profile}
                insuranceState={insuranceState}
                cashflowState={cashflowState}
                investorState={investorState}
                cpfState={cpfState}
                cashflowData={cashflowData}
                age={age}
              />
           </ErrorBoundary>
        )}

        {activeTab === 'retirement' && (
          <ErrorBoundary>
            <RetirementTab 
              cashflowData={cashflowData}
              retirement={retirement}
              setRetirement={setRetirement}
              profile={profile}
              age={age}
              // Passed full state for comprehensive calculator
              investorState={investorState}
              setInvestorState={setInvestorState}
              cpfState={cpfState}
              cashflowState={cashflowState}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'investor' && (
          <ErrorBoundary>
            <InvestorTab 
              investorState={investorState}
              setInvestorState={setInvestorState}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'wealth' && (
          <ErrorBoundary>
            <WealthToolTab 
              wealthState={wealthState}
              setWealthState={setWealthState}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'property' && (
          <ErrorBoundary>
            <PropertyCalculatorTab 
              age={age}
              cpfData={cpfData}
              propertyState={propertyState}
              setPropertyState={setPropertyState}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'analytics' && (
          <ErrorBoundary>
            <AnalyticsTab clients={clients} />
          </ErrorBoundary>
        )}

        {activeTab === 'crm' && (
          <ErrorBoundary>
            <CrmTab 
              clients={clients}
              profile={profile}
              selectedClientId={selectedClientId}
              newClient={resetForm}
              saveClient={() => saveClient(false)}
              loadClient={loadClient}
              deleteClient={deleteClient}
              setFollowUp={setFollowUp}
              completeFollowUp={completeFollowUp}
              maxClients={maxClients}
              userRole={user.role}
              onRefresh={fetchClients}
              isLoading={isClientLoading}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'admin' && (
          <ErrorBoundary>
            <AdminTab />
          </ErrorBoundary>
        )}
      </AppShell>

      <AuthModal 
        isOpen={showLogin} 
        onClose={() => setShowLogin(false)} 
      />

      <PricingModal
        isOpen={showPricing}
        onClose={() => setShowPricing(false)}
      />
    </>
  );
}