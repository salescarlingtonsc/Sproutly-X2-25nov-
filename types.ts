
export interface Child {
  id: number;
  name: string;
  dobISO: string;
  gender: 'male' | 'female';
  existingFunds?: string; 
  monthlyContribution?: string; 
}

export interface EducationSettings {
  inflationRate: string;       
  monthlyEducationCost: string; 
  educationStartAge: string;    
  educationDuration: string;    
  universityCost: string;      
  universityDuration: string;  
  primarySecondaryCost?: string; 
}

export interface InvestmentRates {
  conservative: number;
  moderate: number;
  growth: number;
}

export type LeadSource = 'IG' | 'FB' | 'LinkedIn' | 'Roadshow' | 'Referral' | 'Cold' | 'Personal' | 'Other';
export type LeadInterest = 'Retirement' | 'Children' | 'Property' | 'Wealth' | 'Protection' | 'Tax';

export type SubscriptionTier = 'free' | 'platinum' | 'diamond' | 'organisation';

// New CRM Types
export interface Sale {
  id: string;
  productId: string;
  productName: string;
  premiumAmount: number;
  date: string;
  status: 'Pending' | 'In Force' | 'Lapsed';
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

export interface Profile {
  name: string;
  dob: string;
  gender: 'male' | 'female';
  employmentStatus?: 'employed' | 'self-employed';
  jobTitle?: string;
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
  source?: LeadSource;
  interest?: LeadInterest;
  motivation?: string;
  assignedTo?: string;
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
  currentBalances: { oa: string; sa: string; ma: string };
  withdrawals: any[];
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

export interface CashflowState {
  currentSavings: string;
  projectToAge: string;
  bankInterestRate: string;
  additionalIncomes: any[];
  withdrawals: any[];
  careerEvents: any[];
  customBaseIncome?: string;
}

export interface CashflowData {
  takeHome: number;
  totalExpenses: number;
  monthlySavings: number;
  annualSavings: number;
  savingsRate: number;
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
  portfolioType: string;
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
  scenario: 'conservative' | 'moderate' | 'aggressive' | 'custom';
  customReturnRate?: string; 
  investmentPercent: string;
}

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
  | 'not_keen';

// Enhanced Stage Constant for Compatibility
export const Stage = {
  New: 'New Lead',
  NEW: 'New Lead',
  Contacted: 'Contacted',
  CONTACTED: 'Contacted',
  PickedUp: 'Picked Up',
  PICKED_UP: 'Picked Up',
  ApptSet: 'Appt Set',
  APPT_SET: 'Appt Set',
  ApptMet: 'Appt Met',
  APPT_MET: 'Appt Met',
  Proposal: 'Proposal',
  PROPOSAL: 'Proposal',
  Pending: 'Pending Decision',
  PENDING: 'Pending Decision',
  Client: 'Client',
  CLIENT: 'Client',
  Closed: 'Client', // Map Closed to Client for funnel
  CLOSED: 'Client',
  Dead: 'Lost',
  DEAD: 'Lost'
};

export enum Sentiment {
  UNKNOWN = 'unknown',
  POSITIVE = 'positive',
  NEUTRAL = 'neutral',
  NEGATIVE = 'negative'
}

export interface FollowUp {
  status: ContactStatus;
  notes?: string;
  priority?: 'High' | 'Medium' | 'Low';
  dealValue?: string;
  lastContactedAt?: string;
  nextFollowUpDate?: string; 
  nextFollowUpTime?: string; 
  conversionProbability?: number; 
  ai_propensity_score?: number;   
  momentum_decay?: number;
}

export interface Client {
  id: string;
  referenceCode?: string;
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
  appointments?: any;
  documents?: any[];
  fieldValues?: Record<string, any>; 
  _ownerId?: string;
  _ownerEmail?: string;
  advisorId?: string; // Mapped to _ownerId

  // Expanded CRM Fields (Top-Level Shortcuts for UI)
  name: string; // Synced with profile.name
  company: string;
  stage: string; // Synced with followUp.status (mapped)
  priority: 'High' | 'Medium' | 'Low';
  value: number; // Synced with followUp.dealValue
  platform: string;
  
  firstApptDate?: string; // Synced with appointments
  contactStatus: 'Uncontacted' | 'Attempted' | 'Active';
  lastContact: string; // Synced with followUp.lastContactedAt
  nextAction?: string;
  momentumScore: number;
  sentiment?: Sentiment;
  
  phone: string;
  email: string;
  jobTitle: string;
  dob: string;
  retirementAge: number;
  tags: string[];
  goals: string;
  
  sales: Sale[];
  familyMembers: FamilyMember[];
  policies: Policy[];
  notes: Note[];
  
  milestones: {
    createdAt: string;
    contactedAt?: string;
    appointmentSetAt?: string;
    appointmentMetAt?: string;
    clientConvertedAt?: string;
    closedAt?: string;
  };
  
  stageHistory?: { stage: string; date: string }[];
}

export type UserRole = 'admin' | 'director' | 'advisor' | 'user' | 'viewer';

export interface UserProfile {
  id: string;
  email: string;
  subscriptionTier: string;
  role: string;
  status: string;
  extraSlots: number;
  modules?: string[];
  is_admin?: boolean;
  bandingPercentage?: number; // 0-100
  // New Hierarchy Fields
  reporting_to?: string; // ID of the Director
  team_name?: string; // If Director, name of team
}

export interface FieldDefinition {
  id: string;
  key: string;
  label: string;
  type: string;
  section?: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  client_id: string;
  type: string;
  title: string;
  details: any;
  created_at: string;
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

export interface Advisor {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'pending' | 'rejected';
  bandingPercentage: number;
  avatar?: string;
  joinedAt: string;
  organizationId?: string;
  teamId?: string;
  isAgencyAdmin?: boolean;
}

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
