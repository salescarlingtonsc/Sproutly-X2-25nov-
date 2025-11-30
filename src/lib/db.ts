
import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';

const LOCAL_STORAGE_KEY = 'fa_clients';

export const db = {
  getClients: async (userId?: string): Promise<Client[]> => {
    // 1. Try Cloud Fetch
    if (userId && isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('clients')
          .select('*')
          .order('updated_at', { ascending: false });
          
        if (!error && data) {
          const clients = data.map((row: any) => ({
            ...row.data, 
            id: row.id,
            _ownerId: row.user_id
          }));
          return clients;
        }
      } catch (e) {
        console.warn("Cloud fetch failed, falling back to local.", e);
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

    let savedToCloud = false;
    let cloudResult: Client | null = null;

    // 1. Try Cloud Save
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const activeUserId = session?.user?.id || userId;
        
        if (activeUserId) {
           // Upsert Logic: Forces the current user_id onto the record
           const payload = {
             id: client.id && client.id.length > 20 ? client.id : undefined, // Let DB gen ID if missing
             user_id: activeUserId,
             data: clientToSave,
             updated_at: new Date().toISOString()
           };

           const { data, error } = await supabase
             .from('clients')
             .upsert(payload)
             .select()
             .single();

           if (!error && data) {
              cloudResult = { ...data.data, id: data.id };
              savedToCloud = true;
           } else if (error) {
             console.warn("Supabase Save Error (Handled):", error.message);
             // We intentionally swallow this error to fallback to local storage
           }
        }
      } catch (err) {
        console.warn("Cloud connection failed, using local storage.", err);
      }
    }

    if (savedToCloud && cloudResult) {
       return cloudResult;
    }

    // 2. Local Storage Fallback
    // If cloud failed (RLS, Network, Auth), we save locally so work is never lost.
    const currentClientsStr = localStorage.getItem(LOCAL_STORAGE_KEY);
    let currentClients: Client[] = currentClientsStr ? JSON.parse(currentClientsStr) : [];
    
    if (!clientToSave.id) {
       clientToSave.id = crypto.randomUUID();
    }

    const index = currentClients.findIndex(c => c.id === clientToSave.id);
    if (index >= 0) {
      currentClients[index] = clientToSave;
    } else {
      currentClients.push(clientToSave);
    }
    
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentClients));
    return clientToSave;
  },

  deleteClient: async (clientId: string, userId?: string): Promise<void> => {
    // 1. Try Cloud Delete
    if (isSupabaseConfigured() && supabase) {
      try {
        await supabase.from('clients').delete().eq('id', clientId);
      } catch (e) {
        console.warn("Cloud delete failed", e);
      }
    }

    // 2. Always Delete Local
    const currentClientsStr = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (currentClientsStr) {
      const currentClients: Client[] = JSON.parse(currentClientsStr);
      const filtered = currentClients.filter(c => c.id !== clientId);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
    }
  }
};
