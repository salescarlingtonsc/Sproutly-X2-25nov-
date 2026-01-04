
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

const SYSTEM_PLACEHOLDER_UUID = '00000000-0000-0000-0000-000000000000';

export const logActivity = async (clientId: string | null, type: string, title: string, details: any = {}) => {
  try {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const { error } = await supabase.from('activities').insert({
      user_id: user.id,
      client_id: clientId || SYSTEM_PLACEHOLDER_UUID,
      type,
      title,
      message: title, // Legacy compatibility: populate message with title
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
      message: `Agent active in ${tabId}`, // Legacy compatibility
      details: { tab_id: tabId, duration_sec: durationSeconds }
    });
  } catch (e) {}
};

export const fetchGlobalActivity = async (limit: number = 100): Promise<Activity[]> => {
  if (!supabase) return [];
  try {
    // Removed recursive join on 'profiles' to resolve stack depth limit exceeded.
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    
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
