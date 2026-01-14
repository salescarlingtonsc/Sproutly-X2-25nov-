
import { supabase } from '../supabase';
import { Product, Team, AppSettings, Subscription, MarketNewsItem } from '../../types';

export interface SystemSettings {
  products: Product[];
  teams: Team[];
  appSettings: AppSettings;
  subscription?: Subscription;
  marketIntel?: MarketNewsItem[];
}

export const adminDb = {
  // Save settings specific to an organization
  saveSystemSettings: async (settings: SystemSettings, orgId?: string) => {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    let targetOrg = orgId;
    
    // If no explicit Org ID passed, derive from current user profile
    if (!targetOrg) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('organization_id')
            .eq('id', session.user.id)
            .single();
        targetOrg = profile?.organization_id || 'org_default';
    }

    const { error } = await supabase
      .from('organization_settings')
      .upsert({ 
        id: targetOrg, 
        updated_by: session.user.id,
        updated_at: new Date().toISOString(),
        data: settings 
      }, { onConflict: 'id' });

    if (error) throw error;
  },

  // Get settings, prioritizing Organization-specific config, falling back to Global
  getSystemSettings: async (orgId?: string): Promise<SystemSettings | null> => {
    if (!supabase) return null;
    
    let targetOrg = orgId;

    // If no orgId provided, try to find it from session
    if (!targetOrg) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('organization_id')
                .eq('id', session.user.id)
                .single();
            targetOrg = profile?.organization_id;
        }
    }

    targetOrg = targetOrg || 'org_default';
    
    // Fetch BOTH the specific org settings AND the global backup
    const { data, error } = await supabase
      .from('organization_settings')
      .select('id, data')
      .in('id', [targetOrg, 'global_config']);

    if (error || !data) return null;

    // 1. Try Specific Org
    const specificSettings = data.find(row => row.id === targetOrg);
    if (specificSettings) return specificSettings.data as SystemSettings;

    // 2. Fallback to Global
    const globalSettings = data.find(row => row.id === 'global_config');
    if (globalSettings) return globalSettings.data as SystemSettings;

    return null;
  }
};
