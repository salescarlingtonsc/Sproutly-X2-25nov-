
import { supabase } from '../supabase';
import { Client } from '../../types';

export interface FetchClientsParams {
  query?: string;
  statuses?: string[];
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export const fetchClients = async (params: FetchClientsParams) => {
  if (!supabase) return { rows: [], total: 0 };

  let rpc = supabase.from('clients').select('*', { count: 'exact' });

  if (params.query) {
    rpc = rpc.or(`data->profile->>name.ilike.%${params.query}%,data->profile->>email.ilike.%${params.query}%,data->profile->>phone.ilike.%${params.query}%`);
  }

  if (params.statuses && params.statuses.length > 0) {
    rpc = rpc.filter('data->followUp->>status', 'in', `(${params.statuses.join(',')})`);
  }

  const dir = params.sortDir || 'desc';
  rpc = rpc.order('updated_at', { ascending: dir === 'asc' });

  const limit = params.limit || 50;
  const offset = params.offset || 0;
  rpc = rpc.range(offset, offset + limit - 1);

  const { data, error, count } = await rpc;

  if (error) throw error;

  const rows = (data || []).map(row => {
    const clientData = row.data || {};
    return {
      ...clientData,
      id: row.id,
      lastUpdated: row.updated_at || clientData.lastUpdated
    };
  });

  return { rows, total: count || 0 };
};

export const saveClientUpdate = async (id: string, data: Partial<Client>) => {
  if (!supabase) return;
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized: Session required for data updates.");

  const { data: existing, error: fetchError } = await supabase
    .from('clients')
    .select('data, user_id')
    .eq('id', id)
    .single();

  if (fetchError) {
    console.error("Update Fetch Error:", fetchError);
    throw new Error("Record not found or access denied.");
  }

  if (existing.user_id !== user.id) {
    throw new Error("Permission denied.");
  }

  const updatedData = {
    ...(existing?.data || {}),
    ...data,
    lastUpdated: new Date().toISOString()
  };

  const { error } = await supabase
    .from('clients')
    .update({ 
      user_id: user.id, 
      data: updatedData,
      updated_at: new Date().toISOString() 
    })
    .eq('id', id);

  if (error) {
    console.error("Save Error:", error);
    throw new Error(error.message || "Failed to update record.");
  }
};
