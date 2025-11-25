
import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';

const LOCAL_STORAGE_KEY = 'fa_clients';

export const db = {
  getClients: async (userId?: string): Promise<Client[]> => {
    if (userId && isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('updated_at', { ascending: false });
        
      if (error) {
        console.error('Supabase fetch error:', error);
        return [];
      }
      
      // Robust Owner Email Fetching (simulating a join)
      const clients = data.map((row: any) => ({
        ...row.data, 
        id: row.id,
        _ownerId: row.user_id // Temporary internal use
      }));

      try {
        const userIds = [...new Set(clients.map((c: any) => c._ownerId))];
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, email')
            .in('id', userIds);
          
          if (profiles) {
            const emailMap = new Map(profiles.map((p: any) => [p.id, p.email]));
            clients.forEach((c: any) => {
              c.ownerEmail = emailMap.get(c._ownerId);
              delete c._ownerId;
            });
          }
        }
      } catch (e) {
        console.warn("Failed to fetch owner emails for analytics", e);
      }
      
      return clients;
    }

    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  },

  saveClient: async (client: Client, userId?: string): Promise<Client> => {
    const clientToSave = {
      ...client,
      lastUpdated: new Date().toISOString()
    };

    if (isSupabaseConfigured() && supabase) {
      // FIX: Ensure we are using the actual authenticated session ID for RLS
      // This prevents "new row violates row-level security policy" if state drifts
      const { data: { session } } = await supabase.auth.getSession();
      const activeUserId = session?.user?.id || userId;

      if (!activeUserId) {
        throw new Error("User not authenticated");
      }

      // Upsert logic
      const payload = {
        user_id: activeUserId,
        data: clientToSave,
        updated_at: new Date().toISOString()
      };
      
      // Only include ID if it's a valid existing UUID, otherwise let DB gen one
      if (client.id && client.id.length > 20) {
        Object.assign(payload, { id: client.id });
      }

      const { data, error } = await supabase
        .from('clients')
        .upsert(payload)
        .select()
        .single();

      if (error) {
        console.error("DB Save Error:", error);
        // Wrap the Supabase error object in a real Error so .message is available downstream
        throw new Error(error.message || 'Database save failed with unknown error');
      }
      
      // Return merged object with the authoritative ID from DB
      return {
        ...data.data,
        id: data.id
      };
    }

    // Local Storage Fallback
    const currentClientsStr = localStorage.getItem(LOCAL_STORAGE_KEY);
    let currentClients: Client[] = currentClientsStr ? JSON.parse(currentClientsStr) : [];
    
    const index = currentClients.findIndex(c => c.id === client.id);
    if (index >= 0) {
      currentClients[index] = clientToSave;
    } else {
      currentClients.push(clientToSave);
    }
    
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentClients));
    return clientToSave;
  },

  deleteClient: async (clientId: string, userId?: string): Promise<void> => {
    if (userId && isSupabaseConfigured() && supabase) {
      const { error } = await supabase.from('clients').delete().eq('id', clientId);
      if (error) {
        throw new Error(error.message || 'Delete failed');
      }
      return;
    }

    const currentClientsStr = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (currentClientsStr) {
      const currentClients: Client[] = JSON.parse(currentClientsStr);
      const filtered = currentClients.filter(c => c.id !== clientId);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
    }
  }
};
