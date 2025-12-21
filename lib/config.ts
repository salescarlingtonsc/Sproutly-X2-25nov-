
import { SubscriptionTier, Expenses, UserProfile } from '../types';

export const TIER_CONFIG = {
  free: {
    label: 'Free Trial',
    clientLimit: 5,
    allowedTabs: ['disclaimer', 'dashboard', 'profile', 'crm', 'life_events', 'report'], 
    color: 'gray'
  },
  platinum: {
    label: 'Platinum',
    clientLimit: 15, 
    allowedTabs: ['disclaimer', 'dashboard', 'profile', 'children', 'cashflow', 'insurance', 'crm', 'life_events', 'report'], 
    color: 'indigo'
  },
  diamond: {
    label: 'Diamond',
    clientLimit: 50, 
    allowedTabs: ['disclaimer', 'dashboard', 'profile', 'life_events', 'children', 'cpf', 'cashflow', 'insurance', 'retirement', 'investor', 'wealth', 'property', 'vision', 'analytics', 'crm', 'report'],
    color: 'emerald'
  },
  organisation: {
    label: 'Organisation',
    clientLimit: 500, 
    allowedTabs: ['disclaimer', 'dashboard', 'profile', 'life_events', 'children', 'cpf', 'cashflow', 'insurance', 'retirement', 'investor', 'wealth', 'property', 'vision', 'analytics', 'crm', 'report'],
    color: 'purple'
  }
};

export const TAB_DEFINITIONS = [
  { id: 'disclaimer', label: 'Protocol', icon: '⚖️' },
  { id: 'dashboard', label: 'Command', icon: '🚀' }, 
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'life_events', label: 'Life Events', icon: '⚡' },
  { id: 'children', label: 'Children', icon: '👶' },
  { id: 'cpf', label: 'CPF', icon: '💰' },
  { id: 'cashflow', label: 'Cashflow', icon: '📊' },
  { id: 'insurance', label: 'Insurance', icon: '🛡️' },
  { id: 'retirement', label: 'Retirement', icon: '🏖️' },
  { id: 'investor', label: 'Portfolio', icon: '📈' },
  { id: 'wealth', label: 'Wealth Tool', icon: '💎' },
  { id: 'property', label: 'Real Estate', icon: '🏠' },
  { id: 'vision', label: 'Vision Board', icon: '🎥' },
  { id: 'analytics', label: 'Intelligence', icon: '🧠' },
  { id: 'report', label: 'Deliverable', icon: '📄' }, 
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
    title: 'Insights',
    tabs: ['vision', 'analytics', 'report']
  },
  {
    title: 'Agency',
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
  if (!user) return false;
  
  // CORE GATE: Users who are not approved can ONLY see the Disclaimer/Admin (to see their own status)
  // or a placeholder. In practice, App.tsx will wall them off, but this is the backup logic.
  if (user.status !== 'approved' && user.role !== 'admin') {
     return tabId === 'disclaimer';
  }

  // Admins see everything
  if (user.role === 'admin') return true;

  // Viewers can see Admin directory but it will be read-only (handled in tab logic)
  if (tabId === 'admin' && user.role === 'viewer') return true;
  if (tabId === 'admin' && user.role !== 'admin') return false;

  // Manual module override check
  if (user.modules && Array.isArray(user.modules) && user.modules.length > 0) {
    if (user.modules.includes(tabId)) return true;
  }
  
  const currentTier = user.subscriptionTier || 'free';
  const config = TIER_CONFIG[currentTier as keyof typeof TIER_CONFIG] || TIER_CONFIG.free;
  
  return config.allowedTabs.includes(tabId);
};

export const getClientLimit = (tier: SubscriptionTier, extraSlots: number = 0): number => {
  const currentTier = tier || 'free';
  const config = TIER_CONFIG[currentTier as keyof typeof TIER_CONFIG] || TIER_CONFIG.free;
  const baseLimit = config.clientLimit || 1;
  return baseLimit + (extraSlots || 0);
};
