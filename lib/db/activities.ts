
import { supabase } from '../supabase';
import { AuditLog } from '../../types';

export interface Activity {
  id: string;
  type: string;
  title: string;
  details: any;
  created_at: string;
}

export const logActivity = async (clientId: string | null, type: string, title: string, details: any = {}) => {
  try {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    // client_id can be null for global app activities (like tab switching)
    await supabase.from('activities').insert({
      user_id: user.id,
      client_id: clientId || '00000000-0000-0000-0000-000000000000', // System placeholder for non-client specific logs
      type,
      title,
      details
    });
  } catch (e) {
    // Silent fail for background telemetry
    console.debug('Telemetry log skipped:', e);
  }
};

export const logTabUsage = async (tabId: string, durationSeconds: number) => {
  try {
    if (!supabase || durationSeconds < 2) return;
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    await supabase.from('activities').insert({
      user_id: user.id,
      client_id: '00000000-0000-0000-0000-000000000000',
      type: 'tab_usage',
      title: `Used ${tabId}`,
      details: { tab_id: tabId, duration_sec: durationSeconds }
    });
  } catch (e) {
    // Silent fail for background telemetry
    console.debug('Tab usage log skipped:', e);
  }
};

export const fetchActivities = async (clientId: string): Promise<Activity[]> => {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    return error ? [] : data;
  } catch (e) {
    return [];
  }
};
