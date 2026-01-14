

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
    isEnabled?: boolean;
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
    isEnabled?: boolean;
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

export interface EducationSettings {
  inflationRate: string;
  monthlyEducationCost: string;
  educationStartAge: string;
  educationDuration: string;
  universityCost: string;
  universityDuration: string;
}

export interface Child {
  id: number;
  name: string;
  dobISO: string;
  gender: 'male' | 'female';
  existingFunds: string;
  monthlyContribution: string;
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
  jobTitle?: string;
  educationSettings?: EducationSettings;
  investmentRates?: {
    conservative: number;
    moderate: number;
    growth: number;
  };
}

export interface CashflowData {
  takeHome: number;
  totalExpenses: number;
  monthlySavings: number;
  annualSavings: number;
  savingsRate: number;
}

export interface WealthState {
  annualPremium: string;
  projectionYears: string;
  growthRate: string;
  premiumHolidayStartYear?: string;
  targetRetirementIncome?: string;
  withdrawalStartAge?: string;
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

export interface CpfState {
  currentBalances: {
    oa: string;
    sa: string;
    ma: string;
  };
  withdrawals: any[];
}

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

export type PolicyType = 'term' | 'whole_life' | 'ilp' | 'pure_ci';

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

export interface RetirementSettings {
  initialSavings: string;
  scenario: string;
  investmentPercent: string;
  customReturnRate?: string;
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

export interface Sale {
  id: string;
  productId: string;
  productName: string;
  premiumAmount: number;
  grossRevenue: number;
  inceptionDate: string;
  date: string;
  status: string;
  notes: string;
}

export interface FamilyMember {
  id: string;
  name: string;
  role: 'Father' | 'Mother' | 'Child' | 'Other';
  dob: string;
}

export interface Policy {
  id: string;
  provider: string;
  name: string;
  policyNumber: string;
  value: number;
  startDate: string;
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

export interface PortfolioItem {
  id: string;
  planName: string;
  insurer: string;
  inceptionDate: string;
  premium: number;
  frequency: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'lump_sum';
  currentValue: number;
  lastUpdated: string;
}

export type ContactStatus = 'new' | 'contacted' | 'picked_up' | 'npu_1' | 'npu_2' | 'npu_3' | 'npu_4' | 'npu_5' | 'npu_6' | 'appt_set' | 'appt_met' | 'proposal' | 'pending_decision' | 'client' | 'case_closed' | 'not_keen' | 'closing' | 'qualified';

export interface Client {
  id: string;
  referenceCode?: string;
  profile: Profile;
  expenses: Expenses;
  customExpenses: CustomExpense[];
  retirement: RetirementSettings;
  cpfState: CpfState;
  cashflowState: CashflowState;
  propertyState: PropertyState;
  wealthState: WealthState;
  investorState: InvestorState;
  insuranceState: InsuranceState;
  lastUpdated: string;
  followUp: {
    status: ContactStatus;
    dealValue?: string;
    priority?: 'High' | 'Medium' | 'Low';
    lastContactedAt?: string;
    notes?: string;
    nextFollowUpDate?: string;
    nextFollowUpTime?: string;
  };
  appointments: {
    firstApptDate?: string;
    apptTime?: string;
  };
  documents: any[];
  _ownerId?: string;
  _ownerEmail?: string;
  advisorId?: string;
  chatHistory?: ChatMessage[];
  
  // CRM Root Shortcuts
  name: string;
  email: string;
  phone: string;
  jobTitle?: string;
  retirementAge: number;
  tags?: string[];
  stage: string;
  priority?: string;
  value?: number;
  lastContact?: string;
  firstApptDate?: string;
  company?: string;
  platform?: string;
  contactStatus?: ContactStatus;
  momentumScore?: number;
  sales?: Sale[];
  familyMembers?: FamilyMember[];
  policies?: Policy[];
  notes?: Note[];
  goals?: string;
  milestones?: {
    createdAt?: string;
    contactedAt?: string;
    appointmentSetAt?: string;
    appointmentMetAt?: string;
    closedAt?: string;
  };
  nextAction?: string;
  portfolios?: PortfolioItem[];
  fieldValues?: any;
  stageHistory?: Array<{stage: string, date: string}>;
}

export type SubscriptionTier = 'free' | 'platinum' | 'diamond' | 'organisation';
export type UserRole = 'advisor' | 'manager' | 'director' | 'admin' | 'viewer';

export interface UserProfile {
  id: string;
  email: string;
  subscriptionTier: SubscriptionTier;
  role: UserRole;
  status: 'pending' | 'approved' | 'rejected' | 'active';
  extraSlots: number;
  modules: string[];
  is_admin: boolean;
  isAgencyAdmin?: boolean;
  organizationId?: string;
  bandingPercentage?: number;
  annualGoal?: number;
  reporting_to?: string;
  name?: string;
}

export interface Advisor extends UserProfile {
  name: string;
  avatar?: string;
  joinedAt: string;
  teamId?: string;
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

export interface Team {
  id: string;
  name: string;
  leaderId: string;
  // members field is not strictly required if using reporting_to on users, but can be kept for caching
}

export interface AppSettings {
  statuses: string[];
  platforms: string[];
  campaigns?: string[];
  benchmarks?: Benchmarks;
  agencyName?: string;
}

export interface Benchmarks {
  callsPerWeek: number;
  apptsPerWeek: number;
}

export interface Subscription {
  planId: string;
  status: 'active' | 'inactive';
  seats: number;
  nextBillingDate: string;
}

export interface WhatsAppTemplate {
  id: string;
  label: string;
  content: string;
}

export interface FieldDefinition {
  id?: string;
  key: string;
  label: string;
  type: string;
  section?: string;
  user_id?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  details: string;
  created_at: string;
  user_id: string;
}

export interface MarketNewsItem {
  id: string;
  headline: string;
  summary: string;
  reason: string;
  impact_short: string;
  impact_mid: string;
  impact_long: string;
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'volatile';
  regions: string[];
  tickers: string[];
  created_at: string;
  source_label: string;
}

export enum Stage {
  NEW = 'New Lead',
  CONTACTED = 'Contacted',
  APPT_SET = 'Appt Set',
  APPT_MET = 'Appt Met',
  PROPOSAL = 'Proposal',
  CLIENT = 'Client',
  CLOSED = 'Case Closed',
  LOST = 'Lost'
}