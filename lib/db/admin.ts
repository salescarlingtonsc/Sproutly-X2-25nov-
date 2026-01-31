
import { supabase } from '../supabase';
import { Product, Team, AppSettings, Subscription, MarketNewsItem } from '../../types';
import { isAbortError } from '../helpers';

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
    
    try {
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
    } catch (e: any) {
        console.warn("Admin Save Failed (Possibly missing table):", e.message);
    }
  },

  // Get settings, prioritizing Organization-specific config, falling back to Global
  getSystemSettings: async (orgId?: string): Promise<SystemSettings | null> => {
    if (!supabase) return null;
    
    try {
        let targetOrg = orgId;

        // If no orgId provided, try to find it from session
        if (!targetOrg) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const { data: profile, error: profileErr } = await supabase
                    .from('profiles')
                    .select('organization_id')
                    .eq('id', session.user.id)
                    .single();
                if (!profileErr && profile) {
                    targetOrg = profile.organization_id;
                }
            }
        }

        targetOrg = targetOrg || 'org_default';
        
        // Fetch BOTH the specific org settings AND the global backup
        const { data, error } = await supabase
          .from('organization_settings')
          .select('id, data')
          .in('id', [targetOrg, 'global_config']);

        if (error) {
            // Postgres 42P01 = Table does not exist. 
            // We return null to let the UI use local defaults instead of crashing.
            if (error.code === '42P01') {
                console.warn("System table 'organization_settings' not found. Using defaults.");
                return null;
            }
            throw error;
        }
        
        if (!data || data.length === 0) return null;

        // 1. Try Specific Org
        const specificSettings = data.find(row => row.id === targetOrg);
        if (specificSettings) return specificSettings.data as SystemSettings;

        // 2. Fallback to Global
        const globalSettings = data.find(row => row.id === 'global_config');
        if (globalSettings) return globalSettings.data as SystemSettings;

        return null;
    } catch (e: any) {
        if (isAbortError(e)) {
            console.debug("Settings load aborted.");
            return null;
        }
        console.error("Critical Admin Fetch Failure:", e);
        return null;
    }
  }
};
