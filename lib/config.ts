
import { UserProfile, SubscriptionTier } from "../types";

export const DEFAULT_SETTINGS = {
  statuses: [
    'New Lead', 'Contacted', 'Picked Up', 
    'NPU 1', 'NPU 2', 'NPU 3', 'NPU 4', 'NPU 5', 'NPU 6',
    'Appt Set', 'Appt Met', 'Proposal', 'Pending Decision', 'Client', 'Case Closed', 'Lost'
  ],
  platforms: ['IG', 'FB', 'LinkedIn', 'Roadshow', 'Referral', 'Cold', 'Personal', 'Other'],
  campaigns: ["PS5 Giveaway", "DJI Drone", "Dyson Airwrap", "Retirement eBook", "Tax Masterclass"]
};

export const TIER_CONFIG: Record<SubscriptionTier, { label: string; clientLimit: number; allowedTabs: string[] }> = {
  'free': {
    label: 'Basic',
    clientLimit: 3,
    allowedTabs: ['dashboard', 'profile', 'disclaimer']
  },
  'platinum': {
    label: 'Platinum',
    clientLimit: 50,
    allowedTabs: ['dashboard', 'profile', 'crm', 'reminders', 'disclaimer']
  },
  'diamond': {
    label: 'Diamond',
    clientLimit: 9999,
    allowedTabs: ['dashboard', 'profile', 'life_events', 'children', 'cpf', 'cashflow', 'insurance', 'retirement', 'investor', 'wealth', 'property', 'nine_box', 'vision', 'analytics', 'crm', 'report', 'reminders', 'admin', 'disclaimer', 'portfolio', 'market']
  },
  'organisation': {
    label: 'Organisation',
    clientLimit: 99999,
    allowedTabs: ['dashboard', 'profile', 'life_events', 'children', 'cpf', 'cashflow', 'insurance', 'retirement', 'investor', 'wealth', 'property', 'nine_box', 'vision', 'analytics', 'crm', 'report', 'reminders', 'admin', 'disclaimer', 'portfolio', 'market']
  }
};

export const TAB_DEFINITIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'reminders', label: 'Action Center', icon: '🔔' },
  { id: 'crm', label: 'CRM', icon: '👥' },
  { id: 'market', label: 'Market Intel', icon: '📡' },
  { id: 'portfolio', label: 'AUM Tracker', icon: '📈' },
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'children', label: 'Education', icon: '🎓' },
  { id: 'cpf', label: 'CPF Planning', icon: '🦁' },
  { id: 'cashflow', label: 'Cashflow', icon: '💸' },
  { id: 'insurance', label: 'Insurance', icon: '🛡️' },
  { id: 'retirement', label: 'Retirement', icon: '🏖️' },
  { id: 'investor', label: 'Investment', icon: '📈' },
  { id: 'wealth', label: 'Wealth Tool', icon: '💎' },
  { id: 'property', label: 'Property', icon: '🏠' },
  { id: 'nine_box', label: '9 Box Matrix', icon: '▦' },
  { id: 'vision', label: 'Vision Board', icon: '🖼️' },
  { id: 'analytics', label: 'Analytics', icon: '🧠' },
  { id: 'report', label: 'Report', icon: '📄' },
  { id: 'admin', label: 'Admin', icon: '⚙️' },
  { id: 'disclaimer', label: 'Disclaimer', icon: '⚖️' },
  { id: 'life_events', label: 'Life Events', icon: '⚡' }
];

export const TAB_GROUPS = [
  { title: 'Command', tabs: ['dashboard', 'reminders', 'crm', 'market', 'portfolio'] },
  { title: 'Core Planning', tabs: ['profile', 'children', 'cpf', 'cashflow', 'insurance', 'retirement'] },
  { title: 'Advanced Tools', tabs: ['investor', 'wealth', 'property', 'nine_box', 'life_events', 'analytics', 'vision'] },
  { title: 'System', tabs: ['report', 'admin', 'disclaimer'] }
];

export const canAccessTab = (user: UserProfile | null, tabId: string): boolean => {
  if (!user) return false;
  
  // Super Admin / Director has access to everything
  if (user.role === 'admin' || user.role === 'director' || user.isAgencyAdmin) return true;

  // STRICT OVERRIDE: If modules is defined (even if empty []), it is the absolute authority
  if (user.modules && Array.isArray(user.modules)) {
      // Disclaimer is always the emergency fallback and always allowed
      if (tabId === 'disclaimer') return true;
      return user.modules.includes(tabId);
  }

  // Fallback to Tier config
  const tier = user.subscriptionTier || 'free';
  const config = TIER_CONFIG[tier];
  if (!config) return tabId === 'disclaimer';
  
  if (tabId === 'admin') return false; 

  return config.allowedTabs.includes(tabId);
};
