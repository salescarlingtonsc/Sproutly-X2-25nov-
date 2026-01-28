
import React, { createContext, useContext, useState, useMemo, useEffect, ReactNode, useRef } from 'react';
import { 
  Profile, Expenses, CustomExpense, Child, CpfState, CashflowState, 
  InsuranceState, InvestorState, PropertyState, WealthState, Client, 
  RetirementSettings, CpfData, CashflowData, Sale, FamilyMember, Policy, Note, ChatMessage, ContactStatus, PortfolioItem, NineBoxState
} from '../types';
import { getAge, toNum, generateRefCode } from '../lib/helpers';
import { computeCpf } from '../lib/calculators';
import { useAuth } from './AuthContext';
import { db } from '../lib/db'; // Import strict UUID generator

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

export const INITIAL_NINE_BOX: NineBoxState = {
  items: [],
  replacement: {
    oldPlan: { id: 'old', name: 'Existing Plan', type: 'old', deathCov: '0', tpdCov: '0', ciCov: '0', premium: '0', paymentTermAge: '75', surrenderValue: '0' },
    newPlan: { id: 'new', name: 'Proposed Solution', type: 'new', deathCov: '0', tpdCov: '0', ciCov: '0', premium: '0', paymentTermAge: '75' }
  }
};

export const INITIAL_CRM_STATE = {
  company: '',
  platform: 'Personal',
  contactStatus: 'new' as ContactStatus,
  momentumScore: 50,
  sales: [] as Sale[],
  familyMembers: [] as FamilyMember[],
  policies: [] as Policy[],
  notes: [] as Note[],
  goals: '',
  milestones: { createdAt: new Date().toISOString() },
  nextAction: '',
  portfolios: [] as PortfolioItem[]
};

const STATUS_TO_STAGE: Record<string, string> = {
  'new': 'New Lead',
  'contacted': 'Contacted',
  'picked_up': 'Picked Up',
  'appt_set': 'Appt Set',
  'appt_met': 'Appt Met',
  'proposal': 'Proposal',
  'pending_decision': 'Pending Decision',
  'client': 'Client',
  'case_closed': 'Case Closed',
  'not_keen': 'Lost',
  'npu_1': 'NPU 1', 
  'npu_2': 'NPU 2',
  'npu_3': 'NPU 3',
  'npu_4': 'NPU 4',
  'npu_5': 'NPU 5',
  'npu_6': 'NPU 6'
};

interface ClientContextType {
  clientId: string | null;
  clientRef: string | null;
  lastUpdated: string;
  followUp: any;
  appointments: any;
  documents: any;
  ownerId: string | null;
  ownerEmail: string | null;
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
  nineBoxState: NineBoxState;
  crmState: typeof INITIAL_CRM_STATE;
  chatHistory: ChatMessage[];
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
  setNineBoxState: (s: NineBoxState) => void;
  setCrmState: (s: typeof INITIAL_CRM_STATE) => void;
  setOwnerId: (id: string | null) => void;
  setChatHistory: (history: ChatMessage[]) => void;
  age: number;
  cpfData: CpfData;
  cashflowData: CashflowData;
  loadClient: (client: Client) => void;
  promoteToSaved: (client: Client) => void;
  resetClient: () => void;
  generateClientObject: () => Client;
}

const ClientContext = createContext<ClientContextType | undefined>(undefined);

export const ClientProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientRef, setClientRef] = useState<string | null>(null);
  const draftId = useRef<string>(db.generateUuid());
  const draftRefCode = useRef<string>(generateRefCode());

  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toISOString());
  const [followUp, setFollowUp] = useState<any>({ status: 'new' });
  const [appointments, setAppointments] = useState<any>({});
  const [documents, setDocuments] = useState<any>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);

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
  const [nineBoxState, setNineBoxState] = useState<NineBoxState>(INITIAL_NINE_BOX);
  const [crmState, setCrmState] = useState(INITIAL_CRM_STATE);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  useEffect(() => {
    setProfile(p => ({ ...p, children: childrenState }));
  }, [childrenState]);

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
     return { takeHome, totalExpenses, monthlySavings, annualSavings: monthlySavings * 12, savingsRate: takeHome > 0 ? (monthlySavings / takeHome) * 100 : 0 };
  }, [expenses, customExpenses, profile.takeHome, cpfData]);

  const loadClient = (c: Client) => {
    setClientId(c.id);
    setClientRef(c.referenceCode || null);
    setLastUpdated(c.lastUpdated);
    const safeFollowUp = c.followUp || { status: 'new' };
    if (c.value && !safeFollowUp.dealValue) safeFollowUp.dealValue = c.value.toString();
    setFollowUp(safeFollowUp);
    setAppointments(c.appointments || {});
    setDocuments(c.documents || []);
    setOwnerId(c._ownerId || null);
    setOwnerEmail(c._ownerEmail || null);
    setProfile(c.profile || INITIAL_PROFILE);
    setExpenses(c.expenses || INITIAL_EXPENSES);
    setCustomExpenses(c.customExpenses || []);
    setChildrenState(c.profile?.children || []);
    setCpfState(c.cpfState || INITIAL_CPF);
    setCashflowState(c.cashflowState || INITIAL_CASHFLOW);
    setInsuranceState(c.insuranceState || INITIAL_INSURANCE);
    setInvestorState(c.investorState || INITIAL_INVESTOR);
    setPropertyState(c.propertyState || INITIAL_PROPERTY);
    setWealthState(c.wealthState || INITIAL_WEALTH);
    setRetirement(c.retirement || INITIAL_RETIREMENT);
    setNineBoxState(c.nineBoxState || INITIAL_NINE_BOX);
    setChatHistory(c.chatHistory || []);
    setCrmState({
      company: c.company || '',
      platform: c.platform || 'Personal',
      contactStatus: c.contactStatus || 'new',
      momentumScore: c.momentumScore || 50,
      sales: c.sales || [],
      familyMembers: c.familyMembers || [],
      policies: c.policies || [],
      notes: c.notes || [],
      goals: c.goals || '',
      milestones: { createdAt: c.milestones?.createdAt || c.lastUpdated, ...c.milestones },
      nextAction: c.nextAction || '',
      portfolios: c.portfolios || []
    });
  };

  const promoteToSaved = (saved: Client) => {
    setClientId(saved.id);
    if (saved.referenceCode) setClientRef(saved.referenceCode);
    if (saved.lastUpdated) setLastUpdated(saved.lastUpdated);
  };

  const resetClient = () => {
    setClientId(null);
    setClientRef(null);
    draftId.current = db.generateUuid(); // STRICT UUID
    draftRefCode.current = generateRefCode();
    setLastUpdated(new Date().toISOString());
    setFollowUp({ status: 'new' });
    setAppointments({});
    setDocuments([]);
    setOwnerId(null);
    setOwnerEmail(null);
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
    setNineBoxState(INITIAL_NINE_BOX);
    setCrmState(INITIAL_CRM_STATE);
    setChatHistory([]);
  };

  const generateClientObject = (): Client => {
    if (!user) throw new Error("CRITICAL: Cannot save without active user session.");
    
    const derivedStage = STATUS_TO_STAGE[followUp.status] || followUp.status || 'New Lead';
    const finalId = clientId || draftId.current;
    
    // Safety check: if draftId was somehow malformed, regenerate it
    if (!db.isValidUuid(finalId)) {
        draftId.current = db.generateUuid();
    }
    
    const validId = clientId || draftId.current;
    const finalRef = clientRef || draftRefCode.current;
    const currentOrgId = user.organizationId || 'org_default';

    return {
      id: validId,
      referenceCode: finalRef,
      organizationId: currentOrgId,
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
      nineBoxState,
      lastUpdated: new Date().toISOString(),
      followUp,
      appointments,
      documents,
      _ownerId: ownerId || user.id,
      _ownerEmail: ownerEmail || user.email,
      chatHistory,
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      jobTitle: profile.jobTitle || '',
      retirementAge: toNum(profile.retirementAge),
      tags: profile.tags || [],
      stage: derivedStage,
      priority: followUp.priority || 'Medium',
      value: toNum(followUp.dealValue),
      lastContact: followUp.lastContactedAt || '',
      firstApptDate: appointments.firstApptDate,
      company: crmState.company,
      platform: crmState.platform,
      contactStatus: crmState.contactStatus,
      momentumScore: crmState.momentumScore,
      sales: crmState.sales,
      familyMembers: crmState.familyMembers,
      policies: crmState.policies,
      notes: crmState.notes,
      goals: crmState.goals,
      milestones: crmState.milestones,
      nextAction: crmState.nextAction,
      portfolios: crmState.portfolios
    };
  };

  return (
    <ClientContext.Provider value={{
      clientId, clientRef, lastUpdated, followUp, appointments, documents,
      ownerId, ownerEmail, profile, setProfile, expenses, setExpenses,
      customExpenses, setCustomExpenses, children: childrenState, setChildren: setChildrenState,
      cpfState, setCpfState, cashflowState, setCashflowState,
      insuranceState, setInsuranceState, investorState, setInvestorState,
      propertyState, setPropertyState, wealthState, setWealthState,
      retirement, setRetirement, nineBoxState, setNineBoxState,
      crmState, setCrmState, age, cpfData, cashflowData, setOwnerId,
      chatHistory, setChatHistory, loadClient, promoteToSaved, resetClient, generateClientObject
    }}>
      {children}
    </ClientContext.Provider>
  );
};

export const useClient = () => {
  const context = useContext(ClientContext);
  if (context === undefined) throw new Error('useClient must be used within a ClientProvider');
  return context;
};
