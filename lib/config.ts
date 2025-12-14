
import { SubscriptionTier, Expenses, UserProfile } from '../types';

// ============================================================================
// ⚙️ CONFIGURATION SETTINGS
// Adjust membership limits, allowed tabs, and tier settings here.
// These values propagate to the Admin Dashboard and Pricing Modal automatically.
// ============================================================================

export const TIER_CONFIG = {
  free: {
    label: 'Free Trial',
    clientLimit: 1, // Limit for free users
    // Added 'dashboard' to all tiers
    allowedTabs: ['disclaimer', 'dashboard', 'profile', 'life_events', 'report'], 
    color: 'gray'
  },
  platinum: {
    label: 'Platinum',
    clientLimit: 10, // Limit for platinum users
    allowedTabs: ['disclaimer', 'dashboard', 'profile', 'children', 'cashflow', 'insurance', 'crm', 'life_events', 'report'], 
    color: 'indigo'
  },
  diamond: {
    label: 'Diamond',
    clientLimit: 30, // Limit for diamond users
    allowedTabs: ['disclaimer', 'dashboard', 'profile', 'life_events', 'children', 'cpf', 'cashflow', 'insurance', 'retirement', 'investor', 'wealth', 'property', 'vision', 'analytics', 'crm', 'report'],
    color: 'emerald'
  },
  organisation: {
    label: 'Organisation',
    clientLimit: 100, // Base limit for organisations (customizable via extra slots)
    allowedTabs: ['disclaimer', 'dashboard', 'profile', 'life_events', 'children', 'cpf', 'cashflow', 'insurance', 'retirement', 'investor', 'wealth', 'property', 'vision', 'analytics', 'crm', 'report'],
    color: 'purple'
  }
};

export const TAB_DEFINITIONS = [
  { id: 'disclaimer', label: 'Protocol', icon: '⚖️' },
  { id: 'dashboard', label: 'Command', icon: '🚀' }, // NEW DASHBOARD
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'life_events', label: 'Life Events', icon: '⚡' },
  { id: 'children', label: 'Children', icon: '👶' },
  { id: 'cpf', label: 'CPF', icon: '💰' },
  { id: 'cashflow', label: 'Cashflow', icon: '📊' },
  { id: 'insurance', label: 'Insurance', icon: '🛡️' },
  { id: 'retirement', label: 'Retirement', icon: '🏖️' },
  { id: 'investor', label: 'Investor', icon: '📈' },
  { id: 'wealth', label: 'Wealth Tool', icon: '💎' },
  { id: 'property', label: 'Property', icon: '🏠' },
  { id: 'vision', label: 'Vision Board', icon: '🎥' },
  { id: 'analytics', label: 'Analytics', icon: '🤖' },
  { id: 'report', label: 'Deliverable', icon: '📄' }, // NEW REPORT TAB
  { id: 'crm', label: 'CRM', icon: '📋' },
  { id: 'admin', label: 'Admin', icon: '🔧' }
];

export const TAB_GROUPS = [
  {
    title: 'Overview',
    tabs: ['dashboard', 'crm']
  },
  {
    title: 'Discovery',
    tabs: ['profile', 'children', 'life_events']
  },
  {
    title: 'Financial Core',
    tabs: ['cashflow', 'cpf', 'insurance', 'retirement']
  },
  {
    title: 'Wealth & Assets',
    tabs: ['investor', 'wealth', 'property']
  },
  {
    title: 'Intelligence',
    tabs: ['vision', 'analytics', 'report']
  },
  {
    title: 'System',
    tabs: ['admin', 'disclaimer']
  }
];

export const EXPENSE_CATEGORIES: { key: keyof Expenses; label: string }[] = [
  { key: 'housing', label: 'Housing' },
  { key: 'food', label: 'Food & Dining' },
  { key: 'transport', label: 'Transport' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'entertainment', label: 'Entertainment' },
  { key: 'others', label: 'Others' }
];

export const canAccessTab = (user: UserProfile | null, tabId: string): boolean => {
  // Admin role gets access to everything + Admin tab
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (tabId === 'admin') return false; // Non-admins cannot see admin tab

  // 1. Check for Manual Granular Permissions first
  // If the user has a 'modules' array, that is the source of truth.
  if (user.modules && Array.isArray(user.modules) && user.modules.length > 0) {
    return user.modules.includes(tabId);
  }
  
  // 2. Fallback to Tier Logic
  const currentTier = user.subscriptionTier || 'free';
  const config = TIER_CONFIG[currentTier];
  
  // Safety check
  if (!config) return false; 
  
  return config.allowedTabs.includes(tabId);
};

export const getClientLimit = (tier: SubscriptionTier, extraSlots: number = 0): number => {
  const currentTier = tier || 'free';
  // Fallback to 'free' config if tier is invalid/legacy
  const config = TIER_CONFIG[currentTier] || TIER_CONFIG.free;
  const baseLimit = config.clientLimit || 1;
  return baseLimit + (extraSlots || 0);
};
