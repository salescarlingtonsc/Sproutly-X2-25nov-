import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';

const LOCAL_STORAGE_KEY = 'sproutly_clients_v2';
const CLOUD_QUEUE_KEY = 'sproutly_cloud_queue_v1';
const SYNC_TIMEOUT = 8000; // 8 seconds hard limit

export type SyncResult = {
  success: boolean;
  isLocalOnly: boolean;
  client: Client;
  error?: string;
};

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
    localStorage.setItem(CLOUD_QUEUE_KEY, JSON.stringify(items.slice(-100)));
  } catch {}
};

const enqueueCloudSync = (item: CloudQueueItem) => {
  if (!item.user_id) return;
  const q = readCloudQueue();
  const idx = q.findIndex(x => x.id === item.id);
  if (idx >= 0) q[idx] = item;
  else q.push(item);
  writeCloudQueue(q);
};

// Helper: Wraps a promise in a timeout
async function withTimeout<T = any>(promise: Promise<T> | any, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs))
  ]);
}

export const db = {
  getQueueCount: () => readCloudQueue().length,

  subscribeToChanges: (onEvent: (payload: any) => void) => {
    if (!isSupabaseConfigured() || !supabase) return null;
    return supabase
      .channel('realtime_clients')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, (payload) => onEvent(payload))
      .subscribe();
  },

  getClients: async (userId?: string): Promise<Client[]> => {
    const localRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    let localClients: Client[] = localRaw ? JSON.parse(localRaw) : [];
    
    const queue = readCloudQueue();
    const outboxIds = new Set(queue.map(q => q.id));

    const mergedMap = new Map<string, Client>();
    localClients.forEach(c => mergedMap.set(c.id, c));
    
    queue.forEach(qItem => {
        mergedMap.set(qItem.id, { ...qItem.data, _isSynced: false });
    });

    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase.from('clients').select('*');
        if (!error && data && data.length > 0) {
          const cloudClients = data.map(row => ({
            ...row.data,
            id: row.id,
            _ownerId: row.user_id,
            lastUpdated: row.updated_at || row.data.lastUpdated,
            _isSynced: true
          }));

          cloudClients.forEach(cloudC => {
            const localC = mergedMap.get(cloudC.id);
            // PRIORITY RULE: Local unsynced edits always win
            const isLocalUnsynced = localC && (localC._isSynced === false || outboxIds.has(localC.id));
            
            if (isLocalUnsynced) return; 

            if (!localC || new Date(cloudC.lastUpdated) > new Date(localC.lastUpdated)) {
              mergedMap.set(cloudC.id, cloudC);
            }
          });
        }
      } catch (e) {
        console.warn('[DB] Sync restricted, using local data.');
      }
    }

    const finalClients = Array.from(mergedMap.values()).map(c => ({
      ...c,
      _isSynced: !outboxIds.has(c.id)
    }));

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(finalClients));
    return finalClients;
  },

  saveClient: async (client: Client, userId?: string): Promise<SyncResult> => {
    const now = new Date().toISOString();
    const clientData = { 
      ...client, 
      id: client.id || generateUUID(),
      lastUpdated: now,
      _isSynced: false 
    };

    // 1. Immediate Local Storage Write (Safe Buffer)
    try {
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      const clients: Client[] = local ? JSON.parse(local) : [];
      const idx = clients.findIndex(c => c.id === clientData.id);
      if (idx >= 0) clients[idx] = clientData; else clients.push(clientData);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
    } catch (e) {}

    // 2. Cloud Strategy
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const activeUid = clientData._ownerId || userId || session?.user?.id;

        if (!activeUid) {
          return { success: true, isLocalOnly: true, client: clientData };
        }

        const qItem: CloudQueueItem = {
          id: clientData.id,
          user_id: activeUid,
          updated_at: now,
          data: { ...clientData, _ownerId: activeUid }
        };

        // Enqueue IMMEDIATELY to protect the unsynced state in case of crash/close
        enqueueCloudSync(qItem);

        if (navigator.onLine) {
          try {
            console.log(`[SYNC] Upsert start: ${clientData.id}`);
            
            // Use .select().single() to force a confirmed return from the DB
            const { data: upserted, error } = await withTimeout<any>(
              supabase.from('clients').upsert({
                id: qItem.id,
                user_id: qItem.user_id,
                data: qItem.data,
                updated_at: qItem.updated_at
              }).select('id, updated_at').single(),
              SYNC_TIMEOUT
            );

            if (error) {
              console.error(`[SYNC] Upsert error [Code: ${error.code}]:`, error.message);
              // Do not remove from queue if RLS or DB error occurred
              return { success: true, isLocalOnly: true, client: clientData, error: error.message };
            }

            // --- CONFIRMED SUCCESS ---
            console.log(`[SYNC] Upsert confirmed: ${upserted?.id}`);
            
            // 1. Remove from Queue
            const q = readCloudQueue();
            writeCloudQueue(q.filter(x => x.id !== qItem.id));
            
            // 2. Update Local Cache Flag
            const local = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (local) {
                const clients: Client[] = JSON.parse(local);
                const lIdx = clients.findIndex(c => c.id === clientData.id);
                if (lIdx >= 0) {
                    clients[lIdx]._isSynced = true;
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
                }
            }

            return { success: true, isLocalOnly: false, client: { ...clientData, _isSynced: true } };

          } catch (netErr: any) {
            console.warn(`[SYNC] Network/Timeout error: ${netErr.message}`);
            // Keep in queue, return localOnly
          }
        }
        
        return { success: true, isLocalOnly: true, client: clientData };
      } catch (e) {
        console.error(`[SYNC] General error:`, e);
      }
    }

    return { success: true, isLocalOnly: true, client: clientData };
  },

  flushCloudQueue: async (userId?: string) => {
    if (!isSupabaseConfigured() || !supabase || !navigator.onLine) return;
    const q = readCloudQueue();
    if (q.length === 0) return;
    
    console.log(`[SYNC] Flushing outbox: ${q.length} items...`);
    let flushedCount = 0;
    const remaining: CloudQueueItem[] = [];

    for (const item of q) {
      try {
        const { error } = await withTimeout<any>(
          supabase.from('clients').upsert({
            id: item.id,
            user_id: item.user_id,
            data: item.data,
            updated_at: item.updated_at
          }).select('id').single(), // Confirm write
          SYNC_TIMEOUT
        );
        
        if (!error) {
          flushedCount++;
          // Update local cache flag for this client immediately
          const local = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (local) {
              const clients: Client[] = JSON.parse(local);
              const idx = clients.findIndex(c => c.id === item.id);
              if (idx >= 0) {
                  clients[idx]._isSynced = true;
                  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
              }
          }
        } else {
          console.error(`[SYNC] Flush failed item ${item.id}:`, error.message);
          remaining.push(item);
        }
      } catch (e) { 
        remaining.push(item); 
      }
    }
    
    writeCloudQueue(remaining);
    console.log(`[SYNC] Flush complete. Flushed: ${flushedCount}, Remaining: ${remaining.length}`);
    return flushedCount > 0;
  },

  createClientsBulk: async (clients: Client[], userId: string) => {
    try {
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      const existing: Client[] = local ? JSON.parse(local) : [];
      const updated = [...existing];
      
      clients.forEach(newClient => {
          const idx = updated.findIndex(c => c.id === newClient.id);
          const prepared = { ...newClient, _isSynced: false };
          if (idx >= 0) updated[idx] = prepared;
          else updated.push(prepared);
          
          enqueueCloudSync({
              id: prepared.id,
              user_id: userId,
              updated_at: new Date().toISOString(),
              data: { ...prepared, _ownerId: userId }
          });
      });
      
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {}

    if (isSupabaseConfigured() && supabase && navigator.onLine) {
        try {
            const rows = clients.map(c => ({
              id: c.id,
              user_id: userId,
              data: { ...c, _ownerId: userId },
              updated_at: new Date().toISOString()
            }));
            
            const { error } = await withTimeout<any>(
                supabase.from('clients').upsert(rows).select('id'), 
                SYNC_TIMEOUT
            );

            if (!error) {
                const q = readCloudQueue();
                const ids = new Set(clients.map(c => c.id));
                writeCloudQueue(q.filter(x => !ids.has(x.id)));
                
                // Update local flags
                const local = localStorage.getItem(LOCAL_STORAGE_KEY);
                if (local) {
                    const lClients: Client[] = JSON.parse(local);
                    clients.forEach(c => {
                        const idx = lClients.findIndex(lc => lc.id === c.id);
                        if (idx >= 0) lClients[idx]._isSynced = true;
                    });
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(lClients));
                }
            }
        } catch (e) {}
    }
  },

  transferOwnership: async (clientId: string, newOwnerId: string) => {
    if (!isSupabaseConfigured() || !supabase) throw new Error("Cloud sync not configured");

    const { error } = await withTimeout<any>(
      supabase.from('clients').update({ user_id: newOwnerId }).eq('id', clientId).select('id'),
      SYNC_TIMEOUT
    );

    if (error) throw error;
    
    try {
        const local = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (local) {
            const clients: Client[] = JSON.parse(local);
            const idx = clients.findIndex(c => c.id === clientId);
            if (idx >= 0) {
                clients[idx] = { ...clients[idx], _ownerId: newOwnerId, _isSynced: true };
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
            }
        }
    } catch (e) {}
  },

  deleteClient: async (id: string) => {
    const local = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (local) {
      const clients = JSON.parse(local).filter((c: Client) => c.id !== id);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
    }
    const q = readCloudQueue();
    writeCloudQueue(q.filter(item => item.id !== id));
    if (isSupabaseConfigured() && supabase) await withTimeout(supabase.from('clients').delete().eq('id', id), SYNC_TIMEOUT);
  }
};