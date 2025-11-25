
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

    // AUTH CHECK: Use getUser() instead of getSession() to ensure token is valid and fresh.
    // This prevents RLS violations caused by stale sessions.
    let activeUserId = null;
    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user) {
        activeUserId = data.user.id;
      } else if (error) {
         console.warn("Auth check failed during save:", error.message);
      }
    }

    if (activeUserId) {
      // Upsert logic
      const payload = {
        user_id: activeUserId,
        data: clientToSave,
        updated_at: new Date().toISOString()
      };
      
      // Only include ID if it's a valid existing UUID, otherwise let DB gen one.
      // NOTE: For UPSERT to work on an existing row, the ID must match.
      if (client.id && client.id.length > 20) {
        Object.assign(payload, { id: client.id });
      }

      const { data, error } = await supabase
        .from('clients')
        .upsert(payload, { onConflict: 'id' })
        .select()
        .single();

      if (error) {
        console.error("DB Save Error:", error);
        // Normalize error message to avoid [object Object]
        const errorMessage = error.message || error.details || JSON.stringify(error);
        throw new Error(errorMessage);
      }
      
      // Return merged object with the authoritative ID from DB
      return {
        ...data.data,
        id: data.id
      };
    }

    // Local Storage Fallback (Offline or No Session)
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
    if (isSupabaseConfigured() && supabase) {
      // Also use getUser here for safety
      const { data: { user }, error } = await supabase.auth.getUser();
      if (user?.id) {
        const { error: deleteError } = await supabase.from('clients').delete().eq('id', clientId);
        if (deleteError) {
          throw new Error(deleteError.message || 'Delete failed');
        }
        return;
      }
    }

    const currentClientsStr = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (currentClientsStr) {
      const currentClients: Client[] = JSON.parse(currentClientsStr);
      const filtered = currentClients.filter(c => c.id !== clientId);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
    }
  }
};
