
import { supabase } from '../supabase';

export interface ActivityItem {
  id: string;
  type: string;
  title: string;
  details?: any;
  created_at: string;
  user_email?: string;
}

export const logActivity = async (clientId: string, type: string, title: string, details?: any) => {
  if (!supabase) return;
  
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('activities').insert({
      client_id: clientId,
      user_id: user.id,
      type,
      title,
      details
    });

    if (error) console.error('Log activity failed', error);
  } catch (e) {
    console.error('Log activity exception', e);
  }
};

export const getClientActivities = async (clientId: string): Promise<ActivityItem[]> => {
  if (!supabase) return [];

  try {
    // Join with profiles to get user email if needed, though mostly we just need the activity data
    // Assuming a simple select for now to avoid PGRST205 if foreign keys aren't perfect
    const { data, error } = await supabase
      .from('activities')
      .select('*') 
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch activities error', error);
      return [];
    }

    return data.map((row: any) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      details: row.details,
      created_at: row.created_at
    }));
  } catch (e) {
    console.error('Fetch activities exception', e);
    return [];
  }
};
