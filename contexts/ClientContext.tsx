
import React, { createContext, useContext, useState, useMemo, useEffect, ReactNode } from 'react';
import { 
  Profile, Expenses, CustomExpense, Child, CpfState, CashflowState, 
  InsuranceState, InvestorState, PropertyState, WealthState, Client, 
  RetirementSettings, CpfData, CashflowData
} from '../types';
import { getAge, toNum } from '../lib/helpers';
import { computeCpf } from '../lib/calculators';

// --- INITIAL STATES ---
export const INITIAL_PROFILE: Profile = {
  name: '', dob: '', gender: 'male', email: '', phone: '',
  employmentStatus: 'employed', grossSalary: '', monthlyIncome: '', takeHome: '',
  retirementAge: '65', customRetirementExpense: '', monthlyInvestmentAmount: '',
  referenceYear: new Date().getFullYear(), referenceMonth: new Date().getMonth(),
  children: [], tags: []
};
export const INITIAL_EXPENSES: Expenses = { housing: '0', food: '0', transport: '0', insurance: '0', entertainment: '0', others: '0' };
export const INITIAL_CPF: CpfState = { currentBalances: { oa: '', sa: '', ma: '' }, withdrawals: [] };
export const INITIAL_CASHFLOW: CashflowState = { currentSavings: '', projectToAge: '100', bankInterestRate: '0.05', additionalIncomes: [], withdrawals: [], careerEvents: [] };
export const INITIAL_INSURANCE: InsuranceState = { policies: [], currentDeath: '', currentTPD: '', currentCI: '' };
export const INITIAL_INVESTOR: InvestorState = { portfolioValue: '', portfolioType: 'diversified' };
export const INITIAL_PROPERTY: PropertyState = { propertyPrice: '', propertyType: 'hdb', annualValue: '', downPaymentPercent: '25', loanTenure: '25', interestRate: '3.5', useCpfOa: false, cpfOaAmount: '' };
export const INITIAL_WEALTH: WealthState = { annualPremium: '', projectionYears: '20', growthRate: '5' };
export const INITIAL_RETIREMENT: RetirementSettings = { initialSavings: '', scenario: 'moderate', investmentPercent: '50' };

interface ClientContextType {
  // Metadata
  clientId: string | null;
  clientRef: string | null;
  lastUpdated: string;
  followUp: any;
  appointments: any;
  documents: any;

  // Core State
  profile: Profile;
  expenses: Expenses;
  customExpenses: CustomExpense[];
  children: Child[];
  cpfState: CpfState;
  cashflowState: CashflowState;
  insuranceState: InsuranceState;
  investorState: InvestorState;
  propertyState: PropertyState;
  wealthState: WealthState;
  retirement: RetirementSettings;

  // Setters
  setProfile: (p: Profile) => void;
  setExpenses: (e: Expenses) => void;
  setCustomExpenses: (e: CustomExpense[]) => void;
  setChildren: (c: Child[]) => void;
  setCpfState: (s: CpfState) => void;
  setCashflowState: (s: CashflowState | ((prev: CashflowState) => CashflowState)) => void;
  setInsuranceState: (s: InsuranceState) => void;
  setInvestorState: (s: InvestorState) => void;
  setPropertyState: (s: PropertyState) => void;
  setWealthState: (s: WealthState) => void;
  setRetirement: (r: RetirementSettings) => void;

  // Derived Data (Calculated)
  age: number;
  cpfData: CpfData;
  cashflowData: CashflowData;
  
  // Actions
  loadClient: (client: Client) => void;
  resetClient: () => void;
  generateClientObject: () => Client; // For saving
}

const ClientContext = createContext<ClientContextType | undefined>(undefined);

export const ClientProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // State
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientRef, setClientRef] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toISOString());
  const [followUp, setFollowUp] = useState<any>({ status: 'new' });
  const [appointments, setAppointments] = useState<any>({});
  const [documents, setDocuments] = useState<any>([]);

  const [profile, setProfile] = useState<Profile>(INITIAL_PROFILE);
  const [expenses, setExpenses] = useState<Expenses>(INITIAL_EXPENSES);
  const [customExpenses, setCustomExpenses] = useState<CustomExpense[]>([]);
  const [childrenState, setChildrenState] = useState<Child[]>([]);
  const [cpfState, setCpfState] = useState<CpfState>(INITIAL_CPF);
  const [cashflowState, setCashflowState] = useState<CashflowState>(INITIAL_CASHFLOW);
  const [insuranceState, setInsuranceState] = useState<InsuranceState>(INITIAL_INSURANCE);
  const [investorState, setInvestorState] = useState<InvestorState>(INITIAL_INVESTOR);
  const [propertyState, setPropertyState] = useState<PropertyState>(INITIAL_PROPERTY);
  const [wealthState, setWealthState] = useState<WealthState>(INITIAL_WEALTH);
  const [retirement, setRetirement] = useState<RetirementSettings>(INITIAL_RETIREMENT);

  // Sync profile children with children state
  useEffect(() => {
    setProfile(p => ({ ...p, children: childrenState }));
  }, [childrenState]);

  // Derived Calculations
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

  // Actions
  const loadClient = (c: Client) => {
    setClientId(c.id);
    setClientRef(c.referenceCode || null);
    setLastUpdated(c.lastUpdated);
    setFollowUp(c.followUp || { status: 'new' });
    setAppointments(c.appointments || {});
    setDocuments(c.documents || []);

    setProfile(c.profile || INITIAL_PROFILE);
    setExpenses(c.expenses || INITIAL_EXPENSES);
    setCustomExpenses(c.customExpenses || []);
    setChildrenState(c.profile.children || []);
    setCpfState(c.cpfState || INITIAL_CPF);
    setCashflowState(c.cashflowState || INITIAL_CASHFLOW);
    setInsuranceState(c.insuranceState || INITIAL_INSURANCE);
    setInvestorState(c.investorState || INITIAL_INVESTOR);
    setPropertyState(c.propertyState || INITIAL_PROPERTY);
    setWealthState(c.wealthState || INITIAL_WEALTH);
    setRetirement(c.retirement || INITIAL_RETIREMENT);
  };

  const resetClient = () => {
    setClientId(null);
    setClientRef(null);
    setLastUpdated(new Date().toISOString());
    setFollowUp({ status: 'new' });
    setAppointments({});
    setDocuments([]);

    setProfile(INITIAL_PROFILE);
    setExpenses(INITIAL_EXPENSES);
    setCustomExpenses([]);
    setChildrenState([]);
    setCpfState(INITIAL_CPF);
    setCashflowState(INITIAL_CASHFLOW);
    setInsuranceState(INITIAL_INSURANCE);
    setInvestorState(INITIAL_INVESTOR);
    setPropertyState(INITIAL_PROPERTY);
    setWealthState(INITIAL_WEALTH);
    setRetirement(INITIAL_RETIREMENT);
  };

  const generateClientObject = (): Client => {
    return {
      id: clientId || crypto.randomUUID(),
      referenceCode: clientRef || `REF-${Math.floor(Math.random()*10000)}`,
      profile: { ...profile, children: childrenState },
      expenses,
      customExpenses,
      retirement,
      cpfState,
      cashflowState,
      propertyState,
      wealthState,
      investorState,
      insuranceState,
      lastUpdated: new Date().toISOString(), // Always update timestamp on save
      followUp,
      appointments,
      documents
    };
  };

  return (
    <ClientContext.Provider value={{
      clientId, clientRef, lastUpdated, followUp, appointments, documents,
      profile, setProfile,
      expenses, setExpenses,
      customExpenses, setCustomExpenses,
      children: childrenState, setChildren: setChildrenState,
      cpfState, setCpfState,
      cashflowState, setCashflowState,
      insuranceState, setInsuranceState,
      investorState, setInvestorState,
      propertyState, setPropertyState,
      wealthState, setWealthState,
      retirement, setRetirement,
      age, cpfData, cashflowData,
      loadClient, resetClient, generateClientObject
    }}>
      {children}
    </ClientContext.Provider>
  );
};

export const useClient = () => {
  const context = useContext(ClientContext);
  if (context === undefined) {
    throw new Error('useClient must be used within a ClientProvider');
  }
  return context;
};
