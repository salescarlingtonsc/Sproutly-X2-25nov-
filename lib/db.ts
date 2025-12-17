
import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';

const LOCAL_STORAGE_KEY = 'fa_clients';

export const db = {
  getClients: async (userId?: string): Promise<Client[]> => {
    // 1. Supabase Mode
    if (isSupabaseConfigured() && supabase) {
      try {
        // We rely entirely on RLS policies (defined in SQL) to filter data.
        // Do NOT add .eq('user_id', userId) here, as it can cause conflicts if userId is undefined.
        const { data, error } = await supabase
          .from('clients')
          .select('*')
          .order('updated_at', { ascending: false });
          
        if (error) {
          // Fix: Stringify error to see the actual message instead of [object Object]
          console.error('Supabase fetch error:', JSON.stringify(error, null, 2));
          return [];
        }
        
        if (!data) return [];

        // Parse the JSONB data column + root ID
        const clients = data.map((row: any) => {
          // Safety check if row.data is null
          const clientData = row.data || {};
          return {
            ...clientData, 
            id: row.id, // Ensure the top-level ID matches the DB ID
            _ownerId: row.user_id 
          };
        });

        return clients;
      } catch (e: any) {
        console.error('Unexpected error in getClients:', e);
        return [];
      }
    }

    // 2. Local Storage Fallback
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
      // Ensure we have a valid user ID for the Row Level Security
      const { data: { session } } = await supabase.auth.getSession();
      const activeUserId = session?.user?.id || userId;

      if (!activeUserId) {
        throw new Error("Cannot save: User is not authenticated.");
      }

      // Payload maps exactly to the DB schema
      const payload: any = {
        user_id: activeUserId,
        data: clientToSave,
        updated_at: new Date().toISOString()
      };
      
      // If client.id is a valid UUID, include it to trigger an UPDATE (upsert)
      if (client.id && client.id.length > 20) {
        payload.id = client.id;
      }

      const { data, error } = await supabase
        .from('clients')
        .upsert(payload)
        .select()
        .single();

      if (error) {
        console.error("DB Save Error:", JSON.stringify(error, null, 2));
        throw new Error(error.message || 'Database save failed');
      }
      
      // Return the merged object with the official DB ID
      return {
        ...(data.data || {}),
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
    if (isSupabaseConfigured() && supabase) {
      // RLS ensures users can only delete their own rows
      const { error } = await supabase.from('clients').delete().eq('id', clientId);
      if (error) {
        console.error("DB Delete Error:", JSON.stringify(error, null, 2));
        throw new Error(error.message || 'Delete failed');
      }
      return;
    }

    // Local Storage Fallback
    const currentClientsStr = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (currentClientsStr) {
      const currentClients: Client[] = JSON.parse(currentClientsStr);
      const filtered = currentClients.filter(c => c.id !== clientId);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
    }
  }
};
