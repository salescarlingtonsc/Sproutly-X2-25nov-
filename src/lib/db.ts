
import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';

const LOCAL_STORAGE_KEY = 'fa_clients';

export const db = {
  getClients: async (userId?: string): Promise<Client[]> => {
    // 1. Try Cloud Fetch
    if (userId && isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('updated_at', { ascending: false });
        
      if (!error && data) {
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
      console.warn("Cloud fetch failed, checking local storage:", error);
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
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
           const activeUserId = user.id;
           
           // STRATEGY: Try UPDATE first. If that fails (RLS or not found), Insert as NEW.
           // This avoids the 'upsert' RLS violation where we try to insert with an ID we don't own.

           // A. Attempt UPDATE if we have a valid UUID
           if (client.id && client.id.length > 20) {
              const { data, error } = await supabase
                .from('clients')
                .update({
                  user_id: activeUserId,
                  data: clientToSave,
                  updated_at: new Date().toISOString()
                })
                .eq('id', client.id)
                .select()
                .maybeSingle();

              if (!error && data) {
                 cloudResult = { ...data.data, id: data.id };
                 savedToCloud = true;
              }
           }

           // B. Attempt INSERT if Update didn't happen
           // (Either it was a new record, or RLS hid the old record, so we save a fresh copy)
           if (!savedToCloud) {
              // Strip ID to ensure DB generates a fresh one
              const { id, ...cleanData } = clientToSave;
              
              // Ensure the data JSON blob also doesn't carry the old ID
              const dataBlob = { ...cleanData };
              if ('id' in dataBlob) delete (dataBlob as any).id;

              const { data, error } = await supabase
                .from('clients')
                .insert({
                  user_id: activeUserId,
                  data: dataBlob,
                  updated_at: new Date().toISOString()
                })
                .select()
                .single();
              
              if (error) throw error;
              if (data) {
                 cloudResult = { ...data.data, id: data.id };
                 savedToCloud = true;
              }
           }
        }
      } catch (err) {
        console.warn("Cloud save failed (RLS or Network), falling back to local storage.", err);
        // Do NOT throw. Fallthrough to local storage logic below.
      }
    }

    if (savedToCloud && cloudResult) {
       return cloudResult;
    }

    // 2. Local Storage Fallback
    console.log("Saving to Local Storage (Offline Mode or Cloud Error)");
    const currentClientsStr = localStorage.getItem(LOCAL_STORAGE_KEY);
    let currentClients: Client[] = currentClientsStr ? JSON.parse(currentClientsStr) : [];
    
    // Ensure ID exists for local
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
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          const { error } = await supabase.from('clients').delete().eq('id', clientId);
          if (error) console.warn("Cloud delete warning:", error);
        }
      } catch (e) {
        console.warn("Cloud delete failed:", e);
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
