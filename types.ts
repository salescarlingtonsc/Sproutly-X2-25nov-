
export type SubscriptionTier = 'free' | 'platinum' | 'diamond' | 'organisation';
export type UserRole = 'advisor' | 'manager' | 'director' | 'admin' | 'user' | 'viewer';
export type ContactStatus = 'new' | 'contacted' | 'picked_up' | 'qualified' | 'npu_1' | 'npu_2' | 'npu_3' | 'npu_4' | 'npu_5' | 'npu_6' | 'appt_set' | 'appt_met' | 'proposal' | 'pending_decision' | 'closing' | 'case_closed' | 'client' | 'not_keen';

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  status: 'active' | 'pending' | 'rejected' | 'approved';
  subscriptionTier: SubscriptionTier;
  extraSlots: number;
  is_admin: boolean;
  isAgencyAdmin?: boolean;
  organizationId?: string;
  bandingPercentage?: number;
  modules?: string[];
  annualGoal?: number;
  teamId?: string;
  avatar?: string;
  joinedAt?: string;
  phone?: string;
}

// Alias for UserProfile in some contexts where it's called Advisor
export type Advisor = UserProfile; 

export interface Team {
  id: string;
  name: string;
  leaderId: string;
}

export interface Subscription {
  planId: string;
  status: string;
  seats: number;
  nextBillingDate: string;
}

export interface ProductTier {
  min: number;
  max: number;
  rate: number;
  dollarUp: number;
}

export interface Product {
  id: string;
  name: string;
  provider: string;
  type?: string;
  tiers?: ProductTier[];
}

export interface Sale {
  id: string;
  productId: string;
  productName: string;
  premiumAmount: number;
  grossRevenue: number;
  date: string;
  inceptionDate?: string;
  status: string;
  notes?: string;
}

export interface PortfolioItem {
  id: string;
  planName: string;
  insurer: string;
  inceptionDate: string;
  premium: number;
  frequency: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'lump_sum';
  currentValue: number;
  lastUpdated: string;
  fundAllocation?: string;
  policyNumber?: string;
}

// Market Intelligence Types
export interface MarketNewsItem {
  id: string;
  headline: string;
  summary: string;
  reason: string; // "Why it happened"
  impact_short: string;
  impact_mid: string;
  impact_long: string;
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'volatile';
  regions: string[]; // e.g. ['SG', 'US']
  tickers?: string[]; // e.g. ['D05.SI', 'TSLA']
  created_at: string;
  source_label: string; // "Manual Intel" or "Bloomberg"
  author_id?: string;
}

export interface FamilyMember {
  id: string;
  name: string;
  role: 'Father' | 'Mother' | 'Child' | 'Other';
  dob?: string;
}

export interface Policy {
  id: string;
  provider: string;
  name: string;
  policyNumber: string;
  value: number;
  startDate?: string;
}

export interface Note {
  id: string;
  content: string;
  date: string;
  author: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface AppSettings {
  statuses: string[];
  platforms: string[];
  campaigns?: string[];
  benchmarks?: {
    callsPerWeek: number;
    apptsPerWeek: number;
  };
  agencyName?: string;
}

export interface Benchmarks {
  callsPerWeek: number;
  apptsPerWeek: number;
}

export interface Child {
  id: number;
  name: string;
  dobISO: string;
  gender: 'male' | 'female';
  existingFunds: string;
  monthlyContribution: string;
}

export interface EducationSettings {
  inflationRate: string;
  monthlyEducationCost: string;
  educationStartAge: string;
  educationDuration: string;
  universityCost: string;
  universityDuration: string;
}

export interface Profile {
  name: string;
  dob: string;
  gender: 'male' | 'female';
  email: string;
  phone: string;
  employmentStatus: string;
  grossSalary: string;
  monthlyIncome: string;
  takeHome: string;
  retirementAge: string;
  customRetirementExpense: string;
  monthlyInvestmentAmount: string;
  referenceYear: number;
  referenceMonth: number;
  children: Child[];
  tags: string[];
  educationSettings?: EducationSettings;
  investmentRates?: {
    conservative: number;
    moderate: number;
    growth: number;
  };
  jobTitle?: string;
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

export interface CpfState {
  currentBalances: {
    oa: string;
    sa: string;
    ma: string;
  };
  withdrawals: Array<{
    id: number;
    name: string;
    amount: string;
    account: 'oa' | 'sa' | 'ma';
    type: 'monthly' | 'yearly' | 'onetime';
    startAge: string;
    endAge: string;
  }>;
}

export interface CashflowState {
  currentSavings: string;
  projectToAge: string;
  bankInterestRate: string;
  additionalIncomes: Array<{
    id: number;
    name: string;
    amount: string;
    type: 'recurring' | 'onetime';
    frequency: 'monthly' | 'quarterly' | 'semi_annual' | 'yearly';
    startAge: string | number;
    startMonth?: number;
    endAge?: string | number;
    endMonth?: number;
  }>;
  withdrawals: Array<{
    id: number;
    name: string;
    amount: string;
    type: 'recurring' | 'onetime';
    frequency: 'monthly' | 'quarterly' | 'semi_annual' | 'yearly';
    startAge: string | number;
    startMonth?: number;
    endAge?: string | number;
    endMonth?: number;
  }>;
  careerEvents: Array<{
    id: number;
    type: 'increment' | 'decrement' | 'pause' | 'resume';
    age: number;
    month?: number;
    amount?: string;
    durationMonths?: string;
    notes?: string;
  }>;
  customBaseIncome?: string;
}

export type PolicyType = 'term' | 'whole_life' | 'ilp' | 'pure_ci';

export interface InsurancePolicy {
  id: number;
  name: string;
  type: PolicyType;
  deathCoverage: string;
  tpdCoverage: string;
  earlyCiCoverage: string;
  lateCiCoverage: string;
  expiryAge: string;
}

export interface InsuranceState {
  policies: InsurancePolicy[];
  currentDeath: string;
  currentTPD: string;
  currentCI: string;
}

export interface InvestorState {
  portfolioValue: string;
  portfolioType: 'conservative' | 'balanced' | 'growth' | 'diversified';
}

export interface PropertyState {
  propertyPrice: string;
  propertyType: 'hdb' | 'condo' | 'landed';
  annualValue: string;
  downPaymentPercent: string;
  loanTenure: string;
  interestRate: string;
  useCpfOa: boolean;
  cpfOaAmount: string;
  renovationCost?: string;
  rentalIncome?: string;
}

export interface WealthState {
  annualPremium: string;
  projectionYears: string;
  growthRate: string;
  premiumHolidayStartYear?: string;
  targetRetirementIncome?: string;
  withdrawalStartAge?: string;
}

export interface RetirementSettings {
  initialSavings: string;
  scenario: 'conservative' | 'moderate' | 'aggressive';
  investmentPercent: string;
  customReturnRate?: string;
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

export interface WhatsAppTemplate {
  id: string;
  label: string;
  content: string;
}

export interface FieldDefinition {
  id: string;
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'currency';
  options?: string[];
  section?: string;
}

export interface AuditLog {
  id: string;
  type: string;
  title: string;
  details: any;
  created_at: string;
  user_id?: string;
}

export enum Stage {
  NEW = 'New Lead',
  CONTACTED = 'Contacted',
  PICKED_UP = 'Picked Up',
  APPT_SET = 'Appt Set',
  APPT_MET = 'Appt Met',
  PROPOSAL = 'Proposal',
  PENDING = 'Pending Decision',
  CLIENT = 'Client',
  CLOSED = 'Case Closed',
  LOST = 'Lost'
}

export interface Client {
  id: string;
  referenceCode?: string;
  
  // CRM Top Level
  name: string;
  email: string;
  phone: string;
  company?: string;
  jobTitle?: string;
  platform?: string;
  retirementAge?: number; // Added to fix type error
  
  stage: string;
  contactStatus: ContactStatus;
  priority?: 'High' | 'Medium' | 'Low';
  momentumScore?: number;
  value?: number;
  nextAction?: string;
  
  advisorId?: string;
  _ownerId?: string;
  _ownerEmail?: string;
  
  lastUpdated: string;
  lastContact: string;
  firstApptDate?: string;
  
  // Context States
  profile: Profile;
  expenses: Expenses;
  customExpenses: CustomExpense[];
  cpfState: CpfState;
  cashflowState: CashflowState;
  insuranceState: InsuranceState;
  investorState: InvestorState;
  propertyState: PropertyState;
  wealthState: WealthState;
  retirement: RetirementSettings;
  
  // New: AUM Portfolio
  portfolios?: PortfolioItem[];

  // CRM Deep Data
  followUp: {
    status: ContactStatus; // Keeping this sync'd with root status
    priority?: string;
    dealValue?: string;
    nextFollowUpDate?: string;
    nextFollowUpTime?: string;
    lastContactedAt?: string;
    notes?: string;
  };
  appointments?: {
    firstApptDate?: string;
    apptTime?: string;
  };
  documents?: any[];
  
  sales?: Sale[];
  familyMembers?: FamilyMember[];
  policies?: Policy[]; // External policies known from CRM
  notes?: Note[];
  chatHistory?: ChatMessage[];
  
  goals?: string;
  tags?: string[];
  
  milestones?: {
    createdAt?: string;
    contactedAt?: string;
    appointmentSetAt?: string;
    appointmentMetAt?: string;
    proposalAt?: string;
    closedAt?: string;
  };
  stageHistory?: { stage: string; date: string }[];
  fieldValues?: Record<string, any>;
}
