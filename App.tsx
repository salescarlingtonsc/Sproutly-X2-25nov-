
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';
import AppShell from './components/layout/AppShell';
import LandingPage from './features/auth/LandingPage';
import AuthModal from './features/auth/AuthModal';
import ErrorBoundary from './components/common/ErrorBoundary';
import AiAssistant from './features/ai-chat/AiAssistant';

// Feature Tabs
import DisclaimerTab from './features/disclaimer/DisclaimerTab';
import ProfileTab from './features/profile/ProfileTab';
import LifeEventsTab from './features/life-events/LifeEventsTab';
import ChildrenTab from './features/children/ChildrenTab';
import CpfTab from './features/cpf/CpfTab';
import CashflowTab from './features/planning/CashflowTab';
import InsuranceTab from './features/insurance/InsuranceTab';
import RetirementTab from './features/planning/RetirementTab';
import InvestorTab from './features/investor/InvestorTab';
import WealthToolTab from './features/wealth/WealthToolTab';
import PropertyCalculatorTab from './features/property/PropertyCalculatorTab';
import AnalyticsTab from './features/analytics/AnalyticsTab';
import CrmTab from './features/crm/CrmTab';
import AdminTab from './features/admin/AdminTab';

// Logic
import { db } from './lib/db';
import { getAge, toNum } from './lib/helpers';
import { computeCpf } from './lib/calculators';
import { 
  Profile, Expenses, CustomExpense, Child, CpfState, CashflowState, 
  InsuranceState, InvestorState, PropertyState, WealthState, Client, 
  RetirementSettings, ClientDocument
} from './types';

// Initial States
const INITIAL_PROFILE: Profile = {
  name: '', dob: '', gender: 'male', email: '', phone: '',
  employmentStatus: 'employed', grossSalary: '', monthlyIncome: '', takeHome: '',
  retirementAge: '65', customRetirementExpense: '', monthlyInvestmentAmount: '',
  referenceYear: new Date().getFullYear(), referenceMonth: new Date().getMonth(),
  children: [], tags: []
};
const INITIAL_EXPENSES: Expenses = { housing: '0', food: '0', transport: '0', insurance: '0', entertainment: '0', others: '0' };
const INITIAL_CPF: CpfState = { currentBalances: { oa: '', sa: '', ma: '' }, withdrawals: [] };
// UPDATED: Added careerEvents: []
const INITIAL_CASHFLOW: CashflowState = { currentSavings: '', projectToAge: '100', bankInterestRate: '0.05', additionalIncomes: [], withdrawals: [], careerEvents: [] };
const INITIAL_INSURANCE: InsuranceState = { policies: [], currentDeath: '', currentTPD: '', currentCI: '' };
const INITIAL_INVESTOR: InvestorState = { portfolioValue: '', portfolioType: 'diversified' };
const INITIAL_PROPERTY: PropertyState = { propertyPrice: '', propertyType: 'hdb', annualValue: '', downPaymentPercent: '25', loanTenure: '25', interestRate: '3.5', useCpfOa: false, cpfOaAmount: '' };
const INITIAL_WEALTH: WealthState = { annualPremium: '', projectionYears: '20', growthRate: '5' };
const INITIAL_RETIREMENT: RetirementSettings = { initialSavings: '', scenario: 'moderate', investmentPercent: '50' };

const App: React.FC = () => {
  const { user, isLoading } = useAuth();
  
  // App State
  const [activeTab, setActiveTab] = useState('disclaimer');
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Data State
  const [profile, setProfile] = useState<Profile>(INITIAL_PROFILE);
  const [expenses, setExpenses] = useState<Expenses>(INITIAL_EXPENSES);
  const [customExpenses, setCustomExpenses] = useState<CustomExpense[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [cpfState, setCpfState] = useState<CpfState>(INITIAL_CPF);
  const [cashflowState, setCashflowState] = useState<CashflowState>(INITIAL_CASHFLOW);
  const [insuranceState, setInsuranceState] = useState<InsuranceState>(INITIAL_INSURANCE);
  const [investorState, setInvestorState] = useState<InvestorState>(INITIAL_INVESTOR);
  const [propertyState, setPropertyState] = useState<PropertyState>(INITIAL_PROPERTY);
  const [wealthState, setWealthState] = useState<WealthState>(INITIAL_WEALTH);
  const [retirement, setRetirement] = useState<RetirementSettings>(INITIAL_RETIREMENT);
  
  // CRM State
  const [clients, setClients] = useState<Client[]>([]);
  const [currentClient, setCurrentClient] = useState<Client | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // --- Computed Data ---
  const age = useMemo(() => getAge(profile.dob), [profile.dob]);
  const cpfData = useMemo(() => {
    const gross = toNum(profile.grossSalary) || toNum(profile.monthlyIncome);
    return computeCpf(gross, age);
  }, [profile.grossSalary, profile.monthlyIncome, age]);

  const cashflowData = useMemo(() => {
     const totalExpenses = Object.values(expenses).reduce((a: number, b) => a + toNum(b), 0) + 
                           customExpenses.reduce((a: number, b) => a + toNum(b.amount), 0);
     const takeHome = toNum(profile.takeHome) || (cpfData ? cpfData.takeHome : 0);
     const monthlySavings = takeHome - totalExpenses;
     return {
        takeHome,
        totalExpenses,
        monthlySavings,
        annualSavings: monthlySavings * 12,
        savingsRate: takeHome > 0 ? (monthlySavings / takeHome) * 100 : 0
     };
  }, [expenses, customExpenses, profile.takeHome, cpfData]);

  // --- Effects ---
  useEffect(() => {
     if (user) {
        loadClients();
     }
  }, [user]);

  // Sync profile children with separate state if needed, or just use profile.children
  useEffect(() => {
     setProfile(p => ({ ...p, children }));
  }, [children]);

  // --- Handlers ---
  const loadClients = async () => {
     const data = await db.getClients(user?.id);
     setClients(data);
  };

  const handleNewClient = () => {
     setProfile(INITIAL_PROFILE);
     setExpenses(INITIAL_EXPENSES);
     setCustomExpenses([]);
     setChildren([]);
     setCpfState(INITIAL_CPF);
     setCashflowState(INITIAL_CASHFLOW);
     setInsuranceState(INITIAL_INSURANCE);
     setInvestorState(INITIAL_INVESTOR);
     setPropertyState(INITIAL_PROPERTY);
     setWealthState(INITIAL_WEALTH);
     setRetirement(INITIAL_RETIREMENT);
     setCurrentClient(null);
     setActiveTab('profile');
  };

  const handleLoadClient = (client: Client, redirect = true) => {
     setCurrentClient(client);
     setProfile(client.profile);
     setExpenses(client.expenses);
     setCustomExpenses(client.customExpenses || []);
     setChildren(client.profile.children || []);
     setCpfState(client.cpfState || INITIAL_CPF);
     setCashflowState(client.cashflowState || INITIAL_CASHFLOW);
     setInsuranceState(client.insuranceState || INITIAL_INSURANCE);
     setInvestorState(client.investorState || INITIAL_INVESTOR);
     setPropertyState(client.propertyState || INITIAL_PROPERTY);
     setWealthState(client.wealthState || INITIAL_WEALTH);
     setRetirement(client.retirement || INITIAL_RETIREMENT);
     
     if (redirect) setActiveTab('profile');
  };

  const handleSaveClient = async () => {
     if (!user) {
        setAuthModalOpen(true);
        return;
     }
     if (!profile.name) {
        alert("Please enter a client name in the Profile tab.");
        return;
     }
     
     setSaveStatus('saving');
     const clientData: Client = {
        id: currentClient?.id || crypto.randomUUID(),
        referenceCode: currentClient?.referenceCode || `REF-${Math.floor(Math.random()*10000)}`,
        profile: { ...profile, children },
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
        followUp: currentClient?.followUp || { status: 'new' },
        appointments: currentClient?.appointments,
        documents: currentClient?.documents
     };

     try {
        const saved = await db.saveClient(clientData, user.id);
        setCurrentClient(saved);
        setSaveStatus('saved');
        setLastSaved(new Date());
        loadClients(); // Refresh list
     } catch (e) {
        console.error(e);
        setSaveStatus('error');
     }
  };

  const handleDeleteClient = async (id: string) => {
     if (confirm("Are you sure?")) {
        await db.deleteClient(id, user?.id);
        if (currentClient?.id === id) handleNewClient();
        loadClients();
     }
  };

  const handleCompleteFollowUp = (id: string) => {
     // Logic to update follow up status
     const client = clients.find(c => c.id === id);
     if (client) {
        const updated = { ...client, followUp: { ...client.followUp, status: 'contacted' as any } }; // Simplification
        db.saveClient(updated, user?.id).then(loadClients);
     }
  };

  // --- Rendering ---
  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  if (!user) {
     return (
        <>
           <LandingPage onLogin={() => setAuthModalOpen(true)} />
           <AuthModal 
              isOpen={isAuthModalOpen} 
              onClose={() => setAuthModalOpen(false)} 
              initialError={authError}
           />
        </>
     );
  }

  return (
    <>
     <AppShell
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLoginClick={() => setAuthModalOpen(true)}
        onPricingClick={() => alert("Upgrade feature coming soon!")}
        onSaveClick={handleSaveClient}
        clientRef={currentClient?.referenceCode}
        clientName={profile.name}
        saveStatus={saveStatus}
        lastSavedTime={lastSaved}
     >
        <AuthModal 
           isOpen={isAuthModalOpen} 
           onClose={() => setAuthModalOpen(false)} 
        />
        
        {/* Render Tab Content */}
        {activeTab === 'disclaimer' && <DisclaimerTab />}
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
              investorState={investorState} // NEW
              cashflowState={cashflowState} // NEW
              clients={clients}
              onLoadClient={handleLoadClient}
              onNewProfile={handleNewClient}
           />
        )}
        {activeTab === 'life_events' && (
           <LifeEventsTab 
              profile={profile}
              insuranceState={insuranceState}
              cashflowState={cashflowState}
              investorState={investorState}
              cpfState={cpfState}
              cashflowData={cashflowData}
              age={age}
              propertyState={propertyState}
           />
        )}
        {activeTab === 'children' && (
           <ChildrenTab 
              children={children} 
              setChildren={setChildren} 
              ageYears={age}
              profile={profile}
              setProfile={setProfile}
           />
        )}
        {activeTab === 'cpf' && (
           <CpfTab 
              cpfData={cpfData} 
              age={age} 
              cpfState={cpfState} 
              setCpfState={setCpfState} 
           />
        )}
        {activeTab === 'cashflow' && (
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
              cpfState={cpfState}
           />
        )}
        {activeTab === 'insurance' && (
           <InsuranceTab 
              insuranceState={insuranceState} 
              setInsuranceState={setInsuranceState} 
              profile={profile} 
           />
        )}
        {activeTab === 'retirement' && (
           <RetirementTab 
              cashflowData={cashflowData}
              retirement={retirement}
              setRetirement={setRetirement}
              profile={profile}
              age={age}
              investorState={investorState}
              setInvestorState={setInvestorState}
              cpfState={cpfState}
              cashflowState={cashflowState}
           />
        )}
        {activeTab === 'investor' && (
           <InvestorTab 
              investorState={investorState} 
              setInvestorState={setInvestorState} 
           />
        )}
        {activeTab === 'wealth' && (
           <WealthToolTab 
              wealthState={wealthState} 
              setWealthState={setWealthState} 
           />
        )}
        {activeTab === 'property' && (
           <PropertyCalculatorTab 
              age={age}
              cpfData={cpfData}
              propertyState={propertyState}
              setPropertyState={setPropertyState}
           />
        )}
        {activeTab === 'analytics' && (
           <AnalyticsTab clients={clients} />
        )}
        {activeTab === 'crm' && (
           <CrmTab 
              clients={clients} 
              profile={profile} 
              selectedClientId={currentClient?.id || null}
              newClient={handleNewClient}
              saveClient={handleSaveClient}
              loadClient={handleLoadClient}
              deleteClient={handleDeleteClient}
              setFollowUp={(id, days) => {}}
              completeFollowUp={handleCompleteFollowUp}
              maxClients={100}
              userRole={user.role}
              onRefresh={loadClients}
              isLoading={false}
           />
        )}
        {activeTab === 'admin' && user.role === 'admin' && (
           <AdminTab />
        )}

      </AppShell>
      
      {/* AI Chat Assistant */}
      <AiAssistant currentClient={currentClient} />

    </>
  );
};

export default App;
