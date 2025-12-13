
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

export type LeadSource = 'IG' | 'FB' | 'LinkedIn' | 'Roadshow' | 'Referral' | 'Cold' | 'Other';

export interface Profile {
  name: string;
  dob: string;
  gender: 'male' | 'female';
  employmentStatus?: 'employed' | 'self-employed';
  jobTitle?: string; // New: Specific Job Title
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
  educationSettings?: EducationSettings;
  referenceYear: number;
  referenceMonth: number;
  children?: Child[];
  tags?: string[];
  
  // Sales Specific
  source?: LeadSource; // IG/FB
  motivation?: string; // "Why do you want to win this?"
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
  endMonth?: number; // Added endMonth
}

export interface CashflowWithdrawal {
  id: number;
  name: string;
  amount: string;
  type: string;
  frequency: string;
  startAge: number;
  startMonth: number;
  endAge?: string | number; 
  endMonth?: number; // Added endMonth
}

// NEW: Career Event Definition
export interface CareerEvent {
  id: number;
  type: 'increment' | 'decrement' | 'pause' | 'resume';
  age: number;
  month?: number; // 0-11 for specific month trigger
  amount?: string; // For increment/decrement (monthly amount change)
  durationMonths?: string; // For pause
  notes?: string;
}

export interface CashflowState {
  currentSavings: string;
  projectToAge: string;
  bankInterestRate: string;
  additionalIncomes: AdditionalIncome[];
  withdrawals: CashflowWithdrawal[];
  careerEvents?: CareerEvent[]; // NEW: List of career events
  customBaseIncome?: string;
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
  modules?: string[];
}

// Updated Status Types for Financial Advisory
export type ContactStatus = 
  | 'new' 
  | 'picked_up' 
  | 'npu1' | 'npu2' | 'npu3' | 'npu4' | 'npu5' | 'npu6' 
  | 'call_back' 
  | 'not_keen' 
  | 'appt_set' 
  | 'client';

export interface ClientDocument {
  id: string;
  name: string;
  type: 'image' | 'pdf' | 'other';
  dateAdded: string;
  url?: string; // In real app, this is the storage URL
}

export interface AppointmentData {
  firstApptDate: string | null;
  nextFollowUpDate: string | null;
}

export interface FollowUp {
  status: ContactStatus;
  notes?: string;
  // Legacy support
  nextDate?: string | null; 
}

export type LifecycleStage = 'lead' | 'contacted' | 'meeting' | 'proposal' | 'client' | 'cold';

export interface Client {
  id: string;
  referenceCode?: string;
  lifecycleStage?: LifecycleStage; 
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
  
  // Enhanced Fields
  followUp: FollowUp;
  appointments?: AppointmentData;
  documents?: ClientDocument[];
  
  ownerEmail?: string;
  _ownerId?: string;
}
