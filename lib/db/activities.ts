
import { supabase } from '../supabase';
import { AuditLog } from '../../types';

export interface Activity {
  id: string;
  type: string;
  title: string;
  details: any;
  created_at: string;
  user_id?: string;
}

/** 
 * GLOBAL TELEMETRY SINK
 * Using a consistent UUID for organizational events ensures they bypass 
 * client-specific RLS ownership filters when queried by an Admin.
 */
const SYSTEM_PLACEHOLDER_UUID = '00000000-0000-0000-0000-000000000000';

export const logActivity = async (clientId: string | null, type: string, title: string, details: any = {}) => {
  try {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    // Use placeholder if no client context to satisfy foreign key requirements
    const { error } = await supabase.from('activities').insert({
      user_id: user.id,
      client_id: clientId || SYSTEM_PLACEHOLDER_UUID,
      type,
      title,
      details: {
        ...details,
        browser: navigator.userAgent.substring(0, 50),
        timestamp_utc: new Date().toISOString()
      }
    });
    
    if (error) console.debug('Log suppression:', error.message);
  } catch (e) {
    console.debug('Telemetry sync skipped.');
  }
};

export const logTabUsage = async (tabId: string, durationSeconds: number) => {
  try {
    if (!supabase || durationSeconds < 2) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    await supabase.from('activities').insert({
      user_id: session.user.id,
      client_id: SYSTEM_PLACEHOLDER_UUID,
      type: 'system_navigation',
      title: `Agent active in ${tabId}`,
      details: { tab_id: tabId, duration_sec: durationSeconds }
    });
  } catch (e) {}
};

export const fetchGlobalActivity = async (): Promise<Activity[]> => {
  if (!supabase) return [];
  try {
    // Senior Fix: Use a single join to fetch email context for admin audit trail
    const { data, error } = await supabase
      .from('activities')
      .select('*, profiles(email)')
      .order('created_at', { ascending: false })
      .limit(100);
    
    return error ? [] : data;
  } catch (e) {
    return [];
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
