import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';

const LOCAL_STORAGE_KEY = 'sproutly_clients_v2';
const CLOUD_QUEUE_KEY = 'sproutly_cloud_queue_v1';

// ✅ iPad/Safari needs longer than 10s. 60s is much safer.
const SYNC_TIMEOUT = 60000; // 60 seconds

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
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
    try {
      return (crypto as any).randomUUID();
    } catch (e) {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    // @ts-ignore
    var r = (Math.random() * 16) | 0,
      // @ts-ignore
      v = c == 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const safeJsonParse = <T,>(raw: string | null, fallback: T): T => {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const emitQueueChanged = () => {
  try {
    window.dispatchEvent(new CustomEvent('sproutly:queue_changed'));
  } catch {}
};

const readCloudQueue = (): CloudQueueItem[] => {
  return safeJsonParse<CloudQueueItem[]>(localStorage.getItem(CLOUD_QUEUE_KEY), []);
};

const writeCloudQueue = (items: CloudQueueItem[]) => {
  try {
    localStorage.setItem(CLOUD_QUEUE_KEY, JSON.stringify(items.slice(-100)));
  } catch {}
  emitQueueChanged();
};

const enqueueCloudSync = (item: CloudQueueItem) => {
  if (!item.user_id) return;
  const q = readCloudQueue();
  const idx = q.findIndex((x) => x.id === item.id);
  if (idx >= 0) q[idx] = item;
  else q.push(item);
  writeCloudQueue(q);
};

const removeFromQueue = (id: string) => {
  const q = readCloudQueue();
  writeCloudQueue(q.filter((x) => x.id !== id));
};

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// ✅ Wraps any promise in a timeout (does not abort fetch, but prevents UI from hanging forever)
async function withTimeout<T = any>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[TIMEOUT] ${label} exceeded ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

function isTimeoutLike(err: any) {
  const msg = String(err?.message || err);
  return msg.includes('[TIMEOUT]') || msg.includes('AbortError') || msg.toLowerCase().includes('timeout');
}

// ✅ Retry wrapper for flaky mobile networks / Safari background behavior
async function retryOnTimeout<T>(
  fn: () => Promise<T>,
  label: string,
  attempts = 3,
  baseDelayMs = 800
): Promise<T> {
  let lastErr: any;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e);
      console.warn(`[SYNC] ${label} attempt ${i}/${attempts} failed:`, msg);
      if (!isTimeoutLike(e) || i === attempts) throw e;
      await sleep(baseDelayMs * i); // backoff
    }
  }
  throw lastErr;
}

const setLocalClientSyncedFlag = (id: string, isSynced: boolean) => {
  try {
    const local = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!local) return;
    const clients: Client[] = JSON.parse(local);
    const idx = clients.findIndex((c) => c.id === id);
    if (idx >= 0) {
      clients[idx] = { ...clients[idx], _isSynced: isSynced };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
    }
  } catch {}
};

export const db = {
  getQueueCount: () => readCloudQueue().length,

  getQueueDetails: () => {
    const q = readCloudQueue();
    return q.map((item) => ({
      id: item.id,
      name: item.data?.profile?.name || 'Unnamed Client',
      updated: item.updated_at,
    }));
  },

  subscribeToChanges: (onEvent: (payload: any) => void) => {
    if (!isSupabaseConfigured() || !supabase) return null;
    return supabase
      .channel('realtime_clients')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, (payload) => onEvent(payload))
      .subscribe();
  },

  getClients: async (userId?: string): Promise<Client[]> => {
    const localClients: Client[] = safeJsonParse<Client[]>(localStorage.getItem(LOCAL_STORAGE_KEY), []);

    const queue = readCloudQueue();
    const outboxIds = new Set(queue.map((q) => q.id));

    const mergedMap = new Map<string, Client>();
    localClients.forEach((c) => mergedMap.set(c.id, c));

    // Overlay unsynced queue items on top of local cache
    queue.forEach((qItem) => {
      mergedMap.set(qItem.id, { ...qItem.data, _isSynced: false });
    });

    if (isSupabaseConfigured() && supabase && userId) {
      try {
        // NOTE: we rely on RLS policies (no .eq user_id filter)
        const { data, error } = await supabase.from('clients').select('*');

        if (!error && data && data.length > 0) {
          const cloudClients = data.map((row: any) => ({
            ...row.data,
            id: row.id,
            _ownerId: row.user_id,
            lastUpdated: row.updated_at || row.data?.lastUpdated,
            _isSynced: true,
          }));

          cloudClients.forEach((cloudC) => {
            const localC = mergedMap.get(cloudC.id);

            // If local has unsynced edits, ignore cloud until pushed
            const isLocalUnsynced =
              localC && ((localC as any)._isSynced === false || outboxIds.has(localC.id));
            if (isLocalUnsynced) return;

            const localTs = localC?.lastUpdated ? new Date(localC.lastUpdated).getTime() : 0;
            const cloudTs = cloudC.lastUpdated ? new Date(cloudC.lastUpdated).getTime() : 0;

            if (!localC || cloudTs > localTs) {
              mergedMap.set(cloudC.id, cloudC);
            }
          });
        }
      } catch (e) {
        console.warn('[DB] Cloud fetch failed, using local only.');
      }
    }

    const finalClients = Array.from(mergedMap.values()).map((c) => ({
      ...c,
      _isSynced: !outboxIds.has(c.id),
    }));

    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(finalClients));
    } catch {}

    return finalClients;
  },

  saveClient: async (client: Client, userId: string): Promise<SyncResult> => {
    if (!userId) {
      console.error('[DB] saveClient called without userId');
      return { success: true, isLocalOnly: true, client };
    }

    const now = new Date().toISOString();
    const clientData: Client = {
      ...client,
      id: client.id || generateUUID(),
      lastUpdated: now,
      _isSynced: false,
    };

    // 1) Local write first (always)
    try {
      const clients: Client[] = safeJsonParse<Client[]>(localStorage.getItem(LOCAL_STORAGE_KEY), []);
      const idx = clients.findIndex((c) => c.id === clientData.id);
      if (idx >= 0) clients[idx] = clientData;
      else clients.push(clientData);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
    } catch {}

    // 2) Cloud queue (always queue to protect against app switch)
    if (isSupabaseConfigured() && supabase) {
      try {
        const activeUid = (client as any)._ownerId || userId;

        const qItem: CloudQueueItem = {
          id: clientData.id,
          user_id: activeUid,
          updated_at: now,
          data: { ...clientData, _ownerId: activeUid },
        };

        enqueueCloudSync(qItem);

        // If offline, stop here (local-only)
        if (!navigator.onLine) {
          return { success: true, isLocalOnly: true, client: clientData };
        }

        // 3) Try cloud write (retry + longer timeout)
        const doUpsert = async () => {
          console.log(`[SYNC] Attempting Upsert: ${clientData.id}`);

          const res = await supabase
            .from('clients')
            .upsert({
              id: qItem.id,
              user_id: qItem.user_id,
              data: qItem.data,
              updated_at: qItem.updated_at,
            })
            .select('id, updated_at')
            .single();

          if ((res as any)?.error) {
            console.error('[SYNC] Upsert Supabase error:', (res as any).error);
            throw new Error((res as any).error.message || 'Supabase upsert error');
          }

          return res;
        };

        try {
          const upsertRes = await retryOnTimeout(
            () => withTimeout(doUpsert(), SYNC_TIMEOUT, 'clients.upsert'),
            'clients.upsert',
            3
          );

          console.log(`[SYNC] Write Confirmed: ${(upsertRes as any)?.data?.id || clientData.id}`);

          // Remove from queue + mark synced locally
          removeFromQueue(qItem.id);
          setLocalClientSyncedFlag(qItem.id, true);

          return {
            success: true,
            isLocalOnly: false,
            client: { ...clientData, _isSynced: true },
          };
        } catch (netErr: any) {
          // Keep queue item. Mark local-only.
          console.warn(`[SYNC] Network/Timeout: ${netErr?.message || netErr}`);
          return { success: true, isLocalOnly: true, client: clientData, error: String(netErr?.message || netErr) };
        }
      } catch (e: any) {
        console.error('[SYNC] saveClient general error:', e);
        return { success: true, isLocalOnly: true, client: clientData, error: String(e?.message || e) };
      }
    }

    return { success: true, isLocalOnly: true, client: clientData };
  },

  flushCloudQueue: async (userId: string) => {
    if (!userId || !isSupabaseConfigured() || !supabase || !navigator.onLine) return;

    const q = readCloudQueue();
    if (q.length === 0) return;

    console.log(`[SYNC] Flushing outbox: ${q.length} items...`);

    let flushedCount = 0;
    const remaining: CloudQueueItem[] = [];

    for (const item of q) {
      const doUpsert = async () => {
        const res = await supabase
          .from('clients')
          .upsert({
            id: item.id,
            user_id: item.user_id || userId,
            data: { ...item.data, _ownerId: item.user_id || userId },
            updated_at: item.updated_at,
          })
          .select('id')
          .single();

        if ((res as any)?.error) {
          console.error(`[SYNC] Flush Supabase error for ${item.id}:`, (res as any).error);
          throw new Error((res as any).error.message || 'Supabase flush error');
        }

        return res;
      };

      try {
        await retryOnTimeout(() => withTimeout(doUpsert(), SYNC_TIMEOUT, 'flush.upsert'), 'flush.upsert', 3);

        flushedCount++;
        setLocalClientSyncedFlag(item.id, true);
      } catch (e: any) {
        console.warn(`[SYNC] Flush failed for ${item.id}:`, String(e?.message || e));
        remaining.push(item);
      }
    }

    writeCloudQueue(remaining);
    console.log(`[SYNC] Flush complete. Flushed: ${flushedCount}, Remaining: ${remaining.length}`);
    return flushedCount > 0;
  },

  createClientsBulk: async (clients: Client[], userId: string) => {
    // Local first + queue
    try {
      const existing: Client[] = safeJsonParse<Client[]>(localStorage.getItem(LOCAL_STORAGE_KEY), []);
      const updated = [...existing];

      clients.forEach((newClient) => {
        const prepared = { ...newClient, _isSynced: false };
        const idx = updated.findIndex((c) => c.id === prepared.id);
        if (idx >= 0) updated[idx] = prepared;
        else updated.push(prepared);

        enqueueCloudSync({
          id: prepared.id,
          user_id: userId,
          updated_at: new Date().toISOString(),
          data: { ...prepared, _ownerId: userId },
        });
      });

      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch {}

    if (isSupabaseConfigured() && supabase && navigator.onLine) {
      try {
        const rows = clients.map((c) => ({
          id: c.id,
          user_id: userId,
          data: { ...c, _ownerId: userId },
          updated_at: new Date().toISOString(),
        }));

        const doUpsert = async () => {
          const res = await supabase.from('clients').upsert(rows).select('id');
          if ((res as any)?.error) throw new Error((res as any).error.message || 'Bulk upsert error');
          return res;
        };

        await retryOnTimeout(() => withTimeout(doUpsert(), SYNC_TIMEOUT, 'bulk.upsert'), 'bulk.upsert', 3);

        // Remove from queue and mark synced locally
        const q = readCloudQueue();
        const ids = new Set(clients.map((c) => c.id));
        writeCloudQueue(q.filter((x) => !ids.has(x.id)));

        try {
          const local = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (local) {
            const lClients: Client[] = JSON.parse(local);
            clients.forEach((c) => {
              const idx = lClients.findIndex((lc) => lc.id === c.id);
              if (idx >= 0) lClients[idx] = { ...lClients[idx], _isSynced: true };
            });
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(lClients));
          }
        } catch {}
      } catch (e) {
        // keep queue
      }
    }
  },

  transferOwnership: async (clientId: string, newOwnerId: string) => {
    if (!isSupabaseConfigured() || !supabase) throw new Error('Cloud sync not configured');

    const doUpdate = async () => {
      const res = await supabase.from('clients').update({ user_id: newOwnerId }).eq('id', clientId).select('id');
      if ((res as any)?.error) throw new Error((res as any).error.message || 'Ownership update error');
      return res;
    };

    await retryOnTimeout(() => withTimeout(doUpdate(), SYNC_TIMEOUT, 'transferOwnership'), 'transferOwnership', 3);

    try {
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local) {
        const clients: Client[] = JSON.parse(local);
        const idx = clients.findIndex((c) => c.id === clientId);
        if (idx >= 0) {
          clients[idx] = { ...clients[idx], _ownerId: newOwnerId, _isSynced: true };
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
        }
      }
    } catch {}
  },

  deleteClient: async (id: string) => {
    // local delete
    try {
      const clients: Client[] = safeJsonParse<Client[]>(localStorage.getItem(LOCAL_STORAGE_KEY), []);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients.filter((c) => c.id !== id)));
    } catch {}

    // queue delete
    removeFromQueue(id);

    // cloud delete (best-effort)
    if (isSupabaseConfigured() && supabase && navigator.onLine) {
      try {
        const doDelete = async () => {
          const res = await supabase.from('clients').delete().eq('id', id);
          if ((res as any)?.error) throw new Error((res as any).error.message || 'Delete error');
          return res;
        };
        await retryOnTimeout(() => withTimeout(doDelete(), SYNC_TIMEOUT, 'clients.delete'), 'clients.delete', 2);
      } catch {}
    }
  },
};