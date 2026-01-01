
import { supabase } from '../supabase';
import { Product, Team, AppSettings, Subscription } from '../../types';

export interface SystemSettings {
  products: Product[];
  teams: Team[];
  appSettings: AppSettings;
  subscription?: Subscription;
}

export const adminDb = {
  // Save all admin config to a single JSON row for simplicity and speed
  saveSystemSettings: async (settings: SystemSettings) => {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    // We store this in a table called 'organization_settings'
    // ID is fixed to 'global_config' or the user's org ID in a real multi-tenant app
    const { error } = await supabase
      .from('organization_settings')
      .upsert({ 
        id: 'global_config', // Singleton row for this deployment
        updated_by: session.user.id,
        updated_at: new Date().toISOString(),
        data: settings 
      }, { onConflict: 'id' });

    if (error) throw error;
  },

  getSystemSettings: async (): Promise<SystemSettings | null> => {
    if (!supabase) return null;
    
    // Try to fetch existing settings
    const { data, error } = await supabase
      .from('organization_settings')
      .select('data')
      .eq('id', 'global_config')
      .single();

    if (error || !data) return null;
    return data.data as SystemSettings;
  }
};
