
import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';

const LOCAL_STORAGE_KEY = 'sproutly_clients_v2';
const CLOUD_QUEUE_KEY = 'sproutly_cloud_queue_v1';

type CloudQueueItem = {
  id: string;
  user_id: string;
  updated_at: string;
  data: any;
};

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try { return crypto.randomUUID(); } catch(e) {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const readCloudQueue = (): CloudQueueItem[] => {
  try {
    const raw = localStorage.getItem(CLOUD_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const writeCloudQueue = (items: CloudQueueItem[]) => {
  try {
    localStorage.setItem(CLOUD_QUEUE_KEY, JSON.stringify(items.slice(-50)));
  } catch {}
};

const enqueueCloudSync = (item: CloudQueueItem) => {
  const q = readCloudQueue();
  const idx = q.findIndex(x => x.id === item.id);
  if (idx >= 0) q[idx] = item;
  else q.push(item);
  writeCloudQueue(q);
};

// Helper to chunk arrays
const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

const getErrorMessage = (error: any): string => {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  return error.message || JSON.stringify(error);
};

export const db = {
  getClients: async (userId?: string): Promise<Client[]> => {
    if (isSupabaseConfigured() && supabase) {
      try {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            throw new Error("Offline");
        }

        const { data, error } = await supabase.from('clients').select('*');
        if (error) throw error;
        
        const mappedData = (data || [])
            .map(row => ({
                ...row.data,
                id: row.id,
                _ownerId: row.user_id,
                lastUpdated: row.updated_at || row.data.lastUpdated
            }))
            .filter((c: Client) => c.profile?.name && c.profile.name.trim().length > 0);
            
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mappedData));
        return mappedData;

      } catch (e: any) {
        const local = localStorage.getItem(LOCAL_STORAGE_KEY);
        return local ? JSON.parse(local) : [];
      }
    }
    try {
        const local = localStorage.getItem(LOCAL_STORAGE_KEY);
        return local ? JSON.parse(local) : [];
    } catch { return []; }
  },

  flushCloudQueue: async (userId?: string) => {
    if (!isSupabaseConfigured() || !supabase) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const q = readCloudQueue();
    if (q.length === 0) return;

    const remaining: CloudQueueItem[] = [];
    console.log(`[PROBE] Flushing Cloud Queue (${q.length} items)...`);

    for (const item of q) {
      try {
        const { error } = await supabase.from('clients').upsert({
          id: item.id,
          user_id: item.user_id,
          data: item.data,
          updated_at: item.updated_at
        });
        if (error) throw error;
      } catch (e: any) {
        console.warn(`[PROBE] Queue Sync Failed for ${item.id}:`, e.message);
        remaining.push(item);
      }
    }
    writeCloudQueue(remaining);
  },

  saveClient: async (client: Client, userId?: string): Promise<Client> => {
    const probeId = `SAVE-${Date.now().toString().slice(-5)}`;
    
    if (!client.profile?.name || !client.profile.name.trim()) {
        throw new Error("Client name is required.");
    }

    const now = new Date().toISOString();
    const clientData = { 
        ...client, 
        lastUpdated: now,
        id: client.id || generateUUID()
    };

    // --- STEP 1: GUARANTEED LOCAL SAVE ---
    try {
        const local = localStorage.getItem(LOCAL_STORAGE_KEY);
        const clients: Client[] = local ? JSON.parse(local) : [];
        const idx = clients.findIndex(c => c.id === clientData.id);
        if (idx >= 0) clients[idx] = clientData;
        else clients.push(clientData);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
    } catch (e) {
        console.error(`[PROBE ${probeId}] Local Write Failed`, e);
        throw e; 
    }

    // --- STEP 2: FIRE-AND-FORGET CLOUD SYNC ---
    if (isSupabaseConfigured() && supabase) {
        const targetUserId = clientData._ownerId || userId;
        
        // Prepare Queue Item
        const qItem: CloudQueueItem = {
            id: clientData.id,
            user_id: targetUserId || '',
            updated_at: now,
            data: { ...clientData, _ownerId: targetUserId }
        };

        // Always put in queue first
        enqueueCloudSync(qItem);

        // Try detached background sync
        if (typeof navigator !== 'undefined' && navigator.onLine) {
            (async () => {
                try {
                    // Fast session check
                    const { data: { session } } = await supabase.auth.getSession();
                    const activeUser = targetUserId || session?.user?.id;
                    if (!activeUser) return;

                    const { error } = await supabase.from('clients').upsert({
                        id: qItem.id,
                        user_id: activeUser,
                        data: { ...qItem.data, _ownerId: activeUser },
                        updated_at: qItem.updated_at
                    });

                    if (!error) {
                        // Success: remove specifically this ID from queue
                        const currentQ = readCloudQueue();
                        writeCloudQueue(currentQ.filter(x => x.id !== qItem.id));
                        console.log(`[PROBE ${probeId}] Background Cloud Sync: SUCCESS`);
                    }
                } catch (e) {}
            })();
        }
    }

    // IMPORTANT: Return immediately. The UI will flip to "Saved" now.
    return clientData;
  },

  deleteClient: async (id: string) => {
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local) {
          const clients = JSON.parse(local).filter((c: Client) => c.id !== id);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
      }
      if (isSupabaseConfigured() && supabase) {
          await supabase.from('clients').delete().eq('id', id);
      }
  },

  deleteClientsBulk: async (ids: string[]) => {
      if (ids.length === 0) return;
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local) {
          const clients = JSON.parse(local).filter((c: Client) => !ids.includes(c.id));
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
      }
      if (isSupabaseConfigured() && supabase) {
          const chunks = chunkArray(ids, 20);
          for (const chunk of chunks) {
             await supabase.from('clients').delete().in('id', chunk);
          }
      }
  },

  transferClientsBulk: async (ids: string[], newOwnerId: string) => {
      if (ids.length === 0) return;
      if (isSupabaseConfigured() && supabase) {
          const chunks = chunkArray(ids, 20);
          for (const chunk of chunks) {
              const { data: clientsToUpdate } = await supabase.from('clients').select('id, data').in('id', chunk);
              if (!clientsToUpdate || clientsToUpdate.length === 0) continue;
              const updates = clientsToUpdate.map(row => ({
                  id: row.id,
                  user_id: newOwnerId,
                  data: { ...row.data, _ownerId: newOwnerId },
                  updated_at: new Date().toISOString()
              }));
              await supabase.from('clients').upsert(updates);
          }
      }
  },

  createClientsBulk: async (clients: Client[], targetOwnerId: string) => {
      const validClients = clients.filter(c => c.profile?.name && c.profile.name.trim().length > 0);
      if (validClients.length === 0) return;
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      const existing = local ? JSON.parse(local) : [];
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([...existing, ...validClients]));
      if (isSupabaseConfigured() && supabase) {
          const rows = validClients.map(c => ({
              id: c.id || generateUUID(),
              user_id: targetOwnerId,
              data: { ...c, _ownerId: targetOwnerId },
              updated_at: new Date().toISOString()
          }));
          const chunks = chunkArray(rows, 50);
          for (const chunk of chunks) {
              await supabase.from('clients').insert(chunk);
          }
      }
  },

  transferOwnership: async (clientId: string, newOwnerId: string) => {
      if (isSupabaseConfigured() && supabase) {
          const { data: current } = await supabase.from('clients').select('data').eq('id', clientId).single();
          if (!current) throw new Error("Client not found");
          const newData = { ...current.data, _ownerId: newOwnerId };
          const { error } = await supabase
              .from('clients')
              .update({ user_id: newOwnerId, data: newData })
              .eq('id', clientId);
          if (error) throw new Error(getErrorMessage(error));
      }
  }
};
