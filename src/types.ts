
export interface Child {
  id: number;
  name: string;
  dobISO: string;
  gender: 'male' | 'female';
}

export interface EducationSettings {
  inflationRate: string;       // Default 3%
  monthlyEducationCost: string; // Default 800 (was 9600/yr)
  educationStartAge: string;    // Default 7 (P1)
  educationDuration: string;    // Default 10 (P1 to O-Level)
  universityCost: string;      // Default 8750/yr
  universityDuration: string;  // Default 4 years
  
  // Legacy support optional
  primarySecondaryCost?: string; 
}

export interface InvestmentRates {
  conservative: number;
  moderate: number;
  growth: number;
}

export interface Profile {
  name: string;
  dob: string;
  gender: 'male' | 'female';
  employmentStatus?: 'employed' | 'self-employed';
  email: string;
  phone: string;
  monthlyIncome?: string;
  grossSalary?: string;
  takeHome?: string;
  retirementAge?: string;
  customRetirementExpense?: string;
  monthlyInvestmentAmount?: string;
  investmentRates?: InvestmentRates;
  wealthTarget?: string;
  educationSettings?: EducationSettings; // New field
  referenceYear: number;
  referenceMonth: number;
  children?: Child[];
}

export interface Expenses {
  housing: string;
  food: string;
  transport: string;
  insurance: string;
  entertainment: string;
  others: string;
  [key: string]: string;
}

export interface CustomExpense {
  id: number;
  name: string;
  amount: string;
}

export interface CpfData {
  employee: number;
  employer: number;
  total: number;
  oa: number;
  sa: number;
  ma: number;
  takeHome: number;
  cpfableSalary: number;
  excessSalary: number;
}

export interface CashflowData {
  takeHome: number;
  totalExpenses: number;
  monthlySavings: number;
  annualSavings: number;
  savingsRate: number;
}

export interface RetirementSettings {
  initialSavings: string;
  scenario: 'conservative' | 'moderate' | 'aggressive' | 'custom';
  customReturnRate?: string; // User defined return rate for stocks/investments
  investmentPercent: string;
}

export interface CpfWithdrawal {
  id: number;
  purpose: string;
  account: string;
  amount: string;
  date: string;
  type: string;
  frequency?: string;
}

export interface CpfState {
  currentBalances: { oa: string; sa: string; ma: string };
  withdrawals: CpfWithdrawal[];
}

export interface AdditionalIncome {
  id: number;
  name: string;
  amount: string;
  type: string;
  frequency: string;
  startAge: number;
  startMonth: number;
  endAge?: any;
}

export interface CashflowWithdrawal {
  id: number;
  name: string;
  amount: string;
  type: string;
  frequency: string;
  startAge: number;
  startMonth: number;
}

// NEW: Interface for Income Tiers
export interface BaseIncomeTier {
  id: number;
  startAge: number;
  endAge: number;
  amount: string;
}

export interface CashflowState {
  currentSavings: string;
  projectToAge: string;
  bankInterestRate: string;
  additionalIncomes: AdditionalIncome[];
  withdrawals: CashflowWithdrawal[];
  // Existing single override
  customBaseIncome?: string;
  // NEW: Strategy Mode
  incomeMode?: 'simple' | 'tiered';
  incomeTiers?: BaseIncomeTier[]; 
  customRetirementIncome?: string;
}

export interface PropertyState {
  propertyPrice: string;
  propertyType: string;
  annualValue: string;
  downPaymentPercent: string;
  loanTenure: string;
  interestRate: string;
  useCpfOa: boolean;
  cpfOaAmount: string;
}

export interface WealthState {
  annualPremium: string;
  projectionYears: string;
  growthRate: string;
}

export interface InvestorState {
  portfolioValue: string;
  portfolioType: string;
}

export type PolicyType = 'term' | 'whole_life' | 'ilp' | 'pure_ci' | 'investment_only';

export interface InsurancePolicy {
  id: number;
  name: string;
  type: PolicyType;
  deathCoverage: string;
  tpdCoverage: string;
  earlyCiCoverage: string;
  lateCiCoverage: string;
}

export interface InsuranceState {
  policies: InsurancePolicy[];
  currentDeath: string;
  currentTPD: string;
  currentCI: string;
}

export type SubscriptionTier = 'free' | 'platinum' | 'diamond' | 'organisation';

export interface UserProfile {
  id: string;
  email: string;
  subscriptionTier: SubscriptionTier;
  role: string;
  status: 'pending' | 'approved' | 'rejected';
  extraSlots: number;
}

export interface FollowUp {
  nextDate: string | null;
  status: 'pending' | 'completed' | 'none';
  notes?: string;
}

export type LifecycleStage = 'lead' | 'contacted' | 'meeting' | 'proposal' | 'client' | 'cold';

export interface Client {
  id: string;
  referenceCode?: string;
  lifecycleStage?: LifecycleStage; // New Field for CRM Workflow
  profile: Profile;
  expenses: Expenses;
  customExpenses?: CustomExpense[];
  retirement: RetirementSettings;
  cpfState?: CpfState;
  cashflowState?: CashflowState;
  propertyState?: PropertyState;
  wealthState?: WealthState;
  investorState?: InvestorState;
  insuranceState?: InsuranceState;
  lastUpdated: string;
  followUp: FollowUp;
  ownerEmail?: string;
  _ownerId?: string;
}
