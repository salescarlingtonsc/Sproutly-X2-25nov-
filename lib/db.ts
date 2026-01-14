
import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';

const LOCAL_STORAGE_KEY = 'sproutly_clients_v2';

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try { return crypto.randomUUID(); } catch(e) {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Helper to chunk arrays
const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

export const db = {
  getClients: async (userId?: string): Promise<Client[]> => {
    if (isSupabaseConfigured() && supabase) {
      try {
        let query = supabase.from('clients').select('*');
        const { data, error } = await query;
        
        if (error) {
            if (error.code === '42P01') {
                console.warn("Table 'clients' not found in Supabase.");
                return [];
            }
            throw new Error(error.message);
        }
        
        return (data || [])
            .map(row => ({
                ...row.data,
                id: row.id,
                _ownerId: row.user_id,
                lastUpdated: row.updated_at || row.data.lastUpdated
            }))
            .filter((c: Client) => c.profile?.name && c.profile.name.trim().length > 0);
      } catch (e) {
        console.warn("DB Fetch Error:", e);
        return []; 
      }
    }
    
    try {
        const local = localStorage.getItem(LOCAL_STORAGE_KEY);
        const all = local ? JSON.parse(local) : [];
        return all.filter((c: Client) => c.profile?.name && c.profile.name.trim().length > 0);
    } catch { return []; }
  },

  saveClient: async (client: Client, userId?: string): Promise<Client> => {
    if (!client.profile?.name || !client.profile.name.trim()) {
        throw new Error("Client name is required.");
    }

    const now = new Date().toISOString();
    const clientData = { 
        ...client, 
        lastUpdated: now,
        id: client.id || generateUUID()
    };

    if (isSupabaseConfigured() && supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        const activeUser = userId || session?.user?.id;
        if (!activeUser) throw new Error("No authenticated user");

        const targetOwner = clientData._ownerId || activeUser;

        const { data, error } = await supabase
            .from('clients')
            .upsert({
                id: clientData.id,
                user_id: targetOwner,
                data: { ...clientData, _ownerId: targetOwner },
                updated_at: now
            })
            .select()
            .single();

        if (error) {
            console.error("Supabase Save Error:", error);
            
            // SPECIFIC ERROR TRAP FOR RECURSION
            if (error.message && (error.message.includes('stack depth') || error.message.includes('infinite recursion'))) {
                 throw new Error("DATABASE ERROR: Permission Loop Detected. Please go to Admin > DB Repair and run the fix script.");
            }

            const errMsg = error.message || error.details || (typeof error === 'object' ? JSON.stringify(error) : String(error));
            throw new Error(errMsg);
        }
        return { ...data.data, id: data.id, _ownerId: data.user_id };
    }

    const local = localStorage.getItem(LOCAL_STORAGE_KEY);
    const clients: Client[] = local ? JSON.parse(local) : [];
    const idx = clients.findIndex(c => c.id === clientData.id);
    if (idx >= 0) clients[idx] = clientData;
    else clients.push(clientData);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
    
    return clientData;
  },

  deleteClient: async (id: string) => {
      if (isSupabaseConfigured() && supabase) {
          const { error } = await supabase.from('clients').delete().eq('id', id);
          if (error) throw new Error(error.message || JSON.stringify(error));
          return;
      }
      
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local) {
          const clients = JSON.parse(local).filter((c: Client) => c.id !== id);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
      }
  },

  deleteClientsBulk: async (ids: string[]) => {
      if (ids.length === 0) return;

      if (isSupabaseConfigured() && supabase) {
          const chunks = chunkArray(ids, 20);
          for (const chunk of chunks) {
             const { error } = await supabase.from('clients').delete().in('id', chunk);
             if (error) throw new Error(error.message || JSON.stringify(error));
          }
          return;
      }
      
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local) {
          const clients = JSON.parse(local).filter((c: Client) => !ids.includes(c.id));
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
      }
  },

  transferClientsBulk: async (ids: string[], newOwnerId: string) => {
      if (ids.length === 0) return;

      if (isSupabaseConfigured() && supabase) {
          const chunks = chunkArray(ids, 20);
          
          for (const chunk of chunks) {
              const { data: clientsToUpdate, error: fetchErr } = await supabase
                  .from('clients')
                  .select('id, data')
                  .in('id', chunk);
              
              if (fetchErr) throw new Error(fetchErr.message);
              if (!clientsToUpdate || clientsToUpdate.length === 0) continue;

              const updates = clientsToUpdate.map(row => ({
                  id: row.id,
                  user_id: newOwnerId,
                  data: { ...row.data, _ownerId: newOwnerId },
                  updated_at: new Date().toISOString()
              }));

              const { error: updateErr } = await supabase
                  .from('clients')
                  .upsert(updates);
              
              if (updateErr) throw new Error(updateErr.message || JSON.stringify(updateErr));
          }
          return;
      }
      throw new Error("Bulk transfer requires cloud database");
  },

  createClientsBulk: async (clients: Client[], targetOwnerId: string) => {
      const validClients = clients.filter(c => c.profile?.name && c.profile.name.trim().length > 0);
      if (validClients.length === 0) return;

      if (isSupabaseConfigured() && supabase) {
          const rows = validClients.map(c => ({
              id: c.id || generateUUID(),
              user_id: targetOwnerId,
              data: { ...c, _ownerId: targetOwnerId },
              updated_at: new Date().toISOString()
          }));
          
          const chunks = chunkArray(rows, 50);
          for (const chunk of chunks) {
              const { error } = await supabase.from('clients').insert(chunk);
              if (error) throw new Error(error.message || JSON.stringify(error));
          }
          return;
      }
      
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      const existing = local ? JSON.parse(local) : [];
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([...existing, ...validClients]));
  },

  transferOwnership: async (clientId: string, newOwnerId: string) => {
      if (isSupabaseConfigured() && supabase) {
          const { data: current, error: fetchErr } = await supabase
            .from('clients')
            .select('data')
            .eq('id', clientId)
            .single();
            
          if (fetchErr || !current) throw new Error("Client not found");

          const newData = { ...current.data, _ownerId: newOwnerId };
          
          const { error } = await supabase
              .from('clients')
              .update({ user_id: newOwnerId, data: newData })
              .eq('id', clientId);
          
          if (error) throw new Error(error.message || JSON.stringify(error));
          return;
      }
      throw new Error("Transfer requires cloud database connection");
  }
};
