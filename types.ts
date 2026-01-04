
export type UserRole = 'admin' | 'director' | 'manager' | 'advisor' | 'viewer' | 'user';

export type SubscriptionTier = 'free' | 'platinum' | 'diamond' | 'organisation';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  status: 'active' | 'pending' | 'rejected' | 'approved';
  bandingPercentage?: number;
  annualGoal?: number; // New: Target Gross Revenue for the year
  avatar?: string;
  joinedAt?: string;
  organizationId?: string;
  teamId?: string;
  isAgencyAdmin?: boolean;
  subscriptionTier?: SubscriptionTier;
  modules?: string[];
  extraSlots?: number;
  is_admin?: boolean;
}

export type Advisor = UserProfile & {
  name: string;
};

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

export interface WhatsAppTemplate {
  id: string;
  label: string;
  content: string;
}

export interface AppSettings {
  statuses: string[];
  platforms: string[];
  benchmarks?: {
    callsPerWeek: number;
    apptsPerWeek: number;
  };
}

export interface Benchmarks {
  callsPerWeek: number;
  apptsPerWeek: number;
}

// --- Financial Planning Types ---

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
  jobTitle?: string;
  employmentStatus: string;
  grossSalary: string;
  monthlyIncome: string; // Often same as gross
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

export interface RetirementSettings {
  initialSavings: string;
  scenario: string;
  investmentPercent: string;
  customReturnRate?: string;
}

// --- States ---

export interface CpfState {
  currentBalances: {
    oa: string;
    sa: string;
    ma: string;
  };
  withdrawals: any[]; // Specific type if needed
}

export interface CashflowState {
  currentSavings: string;
  projectToAge: string;
  bankInterestRate: string;
  additionalIncomes: any[];
  withdrawals: any[];
  careerEvents: any[];
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

// --- Calculated Data ---

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

// --- CRM Types ---

export type ContactStatus = 
  | 'new' 
  | 'contacted' 
  | 'qualified' 
  | 'picked_up' 
  | 'npu_1' | 'npu_2' | 'npu_3' | 'npu_4' | 'npu_5' | 'npu_6'
  | 'appt_set' 
  | 'appt_met' 
  | 'proposal' 
  | 'pending_decision' 
  | 'closing' 
  | 'case_closed' 
  | 'client' 
  | 'not_keen'
  // fallback for string matching
  | string;

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

export enum Sentiment {
  POSITIVE = 'Positive',
  NEUTRAL = 'Neutral',
  NEGATIVE = 'Negative',
  UNKNOWN = 'Unknown'
}

export interface Note {
  id: string;
  content: string;
  date: string;
  author: string;
}

export interface Sale {
  id: string;
  productId: string;
  productName: string;
  premiumAmount: number;
  grossRevenue: number; // New: Calculated Revenue
  inceptionDate: string; // New: Policy Start Date
  date: string; // Record creation date
  status: string;
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

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp?: string;
}

export interface Client {
  id: string;
  referenceCode?: string;
  name: string;
  email: string;
  phone: string;
  
  stage: string;
  priority?: 'High' | 'Medium' | 'Low';
  value?: number;
  lastContact?: string;
  firstApptDate?: string;
  
  profile: Profile;
  expenses: Expenses;
  customExpenses: CustomExpense[];
  retirement: RetirementSettings;
  cpfState: CpfState;
  cashflowState: CashflowState;
  insuranceState: InsuranceState;
  investorState: InvestorState;
  propertyState: PropertyState;
  wealthState: WealthState;
  
  company?: string;
  platform?: string;
  contactStatus?: ContactStatus;
  momentumScore?: number;
  sales?: Sale[];
  familyMembers?: FamilyMember[];
  policies?: Policy[];
  notes?: Note[];
  chatHistory?: ChatMessage[];
  goals?: string;
  milestones?: {
    createdAt?: string;
    contactedAt?: string;
    appointmentSetAt?: string;
    appointmentMetAt?: string;
    closedAt?: string;
  };
  nextAction?: string;
  tags?: string[];
  jobTitle?: string;
  dob?: string;
  retirementAge?: number;
  
  lastUpdated: string;
  followUp: any;
  appointments: any;
  documents: any[];
  _ownerId?: string;
  _ownerEmail?: string;
  advisorId?: string;
  
  stageHistory?: { stage: string; date: string }[];
  fieldValues?: any;
  sentiment?: Sentiment;
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
  tiers: ProductTier[];
}

export interface FieldDefinition {
  id: string;
  key: string;
  label: string;
  type: string;
  section: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  details: string;
  created_at: string;
}
