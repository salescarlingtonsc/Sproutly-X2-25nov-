
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
  if (!item.user_id) {
    console.error('[SYNC] Attempted to enqueue item with empty user_id. Aborting.');
    return;
  }
  const q = readCloudQueue();
  const idx = q.findIndex(x => x.id === item.id);
  if (idx >= 0) q[idx] = item;
  else q.push(item);
  writeCloudQueue(q);
};

const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

export const db = {
  subscribeToChanges: (onEvent: (payload: any) => void) => {
    if (!isSupabaseConfigured() || !supabase) return null;

    const channel = supabase
      .channel('realtime_clients')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clients' },
        (payload) => {
          console.log('[REALTIME] Update Received:', payload);
          onEvent(payload);
        }
      )
      .subscribe();

    return channel;
  },

  getClients: async (userId?: string): Promise<Client[]> => {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase.from('clients').select('*');
        if (error) throw error;
        
        const mappedData = (data || [])
            .map(row => {
                const baseData = row.data || {};
                return {
                    ...baseData,
                    id: row.id,
                    _ownerId: row.user_id,
                    lastUpdated: row.updated_at || baseData.lastUpdated || new Date().toISOString(),
                    name: baseData.name || baseData.profile?.name || "Unnamed Client"
                };
            });
            
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mappedData));
        return mappedData;

      } catch (e: any) {
        console.warn('[DB] Sync fallback to local:', e.message);
        const local = localStorage.getItem(LOCAL_STORAGE_KEY);
        return local ? JSON.parse(local) : [];
      }
    }
    const local = localStorage.getItem(LOCAL_STORAGE_KEY);
    return local ? JSON.parse(local) : [];
  },

  flushCloudQueue: async (userId?: string) => {
    if (!isSupabaseConfigured() || !supabase) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const q = readCloudQueue();
    if (q.length === 0) return;

    console.log(`[SYNC] Flushing ${q.length} items from cloud queue...`);
    const remaining: CloudQueueItem[] = [];

    for (const item of q) {
      try {
        const { error } = await supabase.from('clients').upsert({
          id: item.id,
          user_id: item.user_id,
          data: item.data,
          updated_at: item.updated_at
        });
        if (error) {
          console.error(`[SYNC] Flush failed for ${item.id}:`, error.message);
          remaining.push(item);
        } else {
          console.log(`[SYNC] Successfully flushed ${item.id}`);
        }
      } catch (e: any) {
        remaining.push(item);
      }
    }
    writeCloudQueue(remaining);
  },

  saveClient: async (client: Client, userId?: string): Promise<Client> => {
    const now = new Date().toISOString();
    const clientData = { 
        ...client, 
        lastUpdated: now,
        id: client.id || generateUUID()
    };

    // 1. INSTANT LOCAL WRITE
    try {
        const local = localStorage.getItem(LOCAL_STORAGE_KEY);
        const clients: Client[] = local ? JSON.parse(local) : [];
        const idx = clients.findIndex(c => c.id === clientData.id);
        if (idx >= 0) clients[idx] = clientData;
        else clients.push(clientData);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
    } catch (e) {
        console.error('[DB] Local write failed', e);
    }

    // 2. NON-BLOCKING CLOUD PUSH
    if (isSupabaseConfigured() && supabase) {
        // Resolve UID reliably
        const performCloudSync = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const activeUid = clientData._ownerId || userId || session?.user?.id;

            if (!activeUid) {
                console.warn('[SYNC] No UID resolved for cloud push. Skipping Supabase.');
                return;
            }

            const qItem: CloudQueueItem = {
                id: clientData.id,
                user_id: activeUid,
                updated_at: now,
                data: { ...clientData, _ownerId: activeUid }
            };

            if (typeof navigator !== 'undefined' && navigator.onLine) {
                try {
                    // 10 Second Timeout Watchdog
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Push Timeout')), 10000)
                    );

                    const upsertPromise = supabase.from('clients').upsert({
                        id: qItem.id,
                        user_id: qItem.user_id,
                        data: qItem.data,
                        updated_at: qItem.updated_at
                    });

                    const { error } = await Promise.race([upsertPromise, timeoutPromise]) as any;

                    if (error) {
                        console.error('[SYNC] Supabase rejected update:', error.message);
                        enqueueCloudSync(qItem);
                    } else {
                        // Success: Clean queue
                        const currentQ = readCloudQueue();
                        writeCloudQueue(currentQ.filter(x => x.id !== qItem.id));
                    }
                } catch (e: any) {
                    console.warn('[SYNC] Cloud push timed out or crashed, moving to queue.');
                    enqueueCloudSync(qItem);
                }
            } else {
                enqueueCloudSync(qItem);
            }
        };

        // Trigger background sync without awaiting
        performCloudSync().catch(err => console.error('[SYNC] Background process crashed', err));
    }

    // Return immediately to unblock UI
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
      const rows = clients.map(c => ({
          id: c.id || generateUUID(),
          user_id: targetOwnerId,
          data: { ...c, _ownerId: targetOwnerId },
          updated_at: new Date().toISOString()
      }));
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      const existing = local ? JSON.parse(local) : [];
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([...existing, ...rows.map(r => r.data)]));
      if (isSupabaseConfigured() && supabase) {
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
          if (error) throw new Error(error.message);
      }
  }
};
