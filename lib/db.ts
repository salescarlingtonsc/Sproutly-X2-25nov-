
import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';

const LOCAL_STORAGE_KEY = 'fa_clients';

export const db = {
  getClients: async (userId?: string): Promise<Client[]> => {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('clients')
          .select('*')
          .order('updated_at', { ascending: false });
          
        if (error) {
          console.error('Data retrieval error:', JSON.stringify(error, null, 2));
          return [];
        }
        
        if (!data) return [];

        return data.map((row: any) => {
          const clientData = row.data || {};
          return {
            ...clientData, 
            id: row.id,
            _ownerId: row.user_id 
          };
        });
      } catch (e: any) {
        console.error('Unexpected error in getClients:', e);
        return [];
      }
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
      // getSession is faster and more reliable for high-frequency save operations
      const { data: { session } } = await supabase.auth.getSession();
      const activeUserId = session?.user?.id || userId;

      if (!activeUserId) {
        throw new Error("Authentication required. Please sign in to save data.");
      }

      const payload: any = {
        user_id: activeUserId,
        data: clientToSave,
        updated_at: new Date().toISOString()
      };
      
      // Ensure we only pass the ID if it's a valid persistent UUID
      if (client.id && client.id.length > 20 && !client.id.startsWith('REF-')) {
        payload.id = client.id;
      }

      const { data, error } = await supabase
        .from('clients')
        .upsert(payload, { onConflict: 'id' })
        .select()
        .single();

      if (error) {
        console.error("Sproutly Save Error:", JSON.stringify(error, null, 2));
        // Common cause of 42501 on upsert: The row exists but user_id is null or belongs to another user.
        throw new Error(error.message || 'Access Denied: You do not have permission to modify this record.');
      }
      
      return {
        ...(data.data || {}),
        id: data.id
      };
    }

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
      const { error } = await supabase.from('clients').delete().eq('id', clientId);
      if (error) {
        console.error("Delete Error:", JSON.stringify(error, null, 2));
        throw new Error(error.message || 'Action restricted.');
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
