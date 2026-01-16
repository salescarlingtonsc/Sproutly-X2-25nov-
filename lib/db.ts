import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';

const LOCAL_STORAGE_KEY = 'sproutly_clients_v2';
const CLOUD_QUEUE_KEY = 'sproutly_cloud_queue_v1';

// IMPORTANT:
// iOS Safari + embedded previews can “hang” fetch. We MUST abort the request properly.
const SYNC_TIMEOUT_MS = 12000; // 12s per request
const MAX_QUEUE = 100;

// ---- simple module locks to prevent infinite spam ----
let IS_FLUSHING = false;
let LAST_FLUSH_AT = 0;

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

const emitQueueChanged = () => {
  try {
    window.dispatchEvent(new CustomEvent('sproutly:queue_changed'));
  } catch {}
};

const generateUUID = () => {
  // Prefer crypto.randomUUID when available
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
    try {
      return (crypto as any).randomUUID();
    } catch {}
  }
  // Fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const readCloudQueue = (): CloudQueueItem[] => {
  try {
    const raw = localStorage.getItem(CLOUD_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const writeCloudQueue = (items: CloudQueueItem[]) => {
  try {
    const trimmed = items.slice(-MAX_QUEUE);
    localStorage.setItem(CLOUD_QUEUE_KEY, JSON.stringify(trimmed));
    emitQueueChanged();
  } catch {}
};

const enqueueCloudSync = (item: CloudQueueItem) => {
  if (!item.user_id) return;

  const q = readCloudQueue();
  const idx = q.findIndex((x) => x.id === item.id);

  if (idx >= 0) q[idx] = item;
  else q.push(item);

  writeCloudQueue(q);
};

const dequeueCloudSync = (id: string) => {
  const q = readCloudQueue();
  writeCloudQueue(q.filter((x) => x.id !== id));
};

// ✅ Real timeout that cancels the HTTP call (IMPORTANT on iOS)
async function upsertClientRowWithAbort(row: any, timeoutMs: number) {
  if (!supabase) throw new Error('Supabase not initialized');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Supabase PostgREST builder supports abortSignal()
    const { data, error } = await supabase
      .from('clients')
      .upsert(row)
      .select('id, updated_at')
      .single()
      // @ts-ignore (supabase-js has abortSignal; typings sometimes lag)
      .abortSignal(controller.signal);

    if (error) throw error;
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export const db = {
  getQueueCount: () => readCloudQueue().length,

  getQueueDetails: () => {
    const q = readCloudQueue();
    return q.map((item) => ({
      id: item.id,
      name: item.data?.profile?.name || 'Unnamed Client',
      updated: item.updated_at
    }));
  },

  subscribeToChanges: (onEvent: (payload: any) => void) => {
    if (!isSupabaseConfigured() || !supabase) return null;
    return supabase
      .channel('realtime_clients')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, (payload) =>
        onEvent(payload)
      )
      .subscribe();
  },

  getClients: async (userId?: string): Promise<Client[]> => {
    const localRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    let localClients: Client[] = localRaw ? JSON.parse(localRaw) : [];

    const queue = readCloudQueue();
    const outboxIds = new Set(queue.map((q) => q.id));

    const mergedMap = new Map<string, Client>();
    localClients.forEach((c) => mergedMap.set(c.id, c));

    // Overlay unsynced queue items so latest edits show even if cloud is down
    queue.forEach((qItem) => {
      mergedMap.set(qItem.id, { ...qItem.data, _isSynced: false });
    });

    // Cloud pull (best effort)
    if (isSupabaseConfigured() && supabase && userId) {
      try {
        const { data, error } = await supabase.from('clients').select('*');
        if (!error && data && data.length > 0) {
          const cloudClients = data.map((row: any) => ({
            ...row.data,
            id: row.id,
            _ownerId: row.user_id,
            lastUpdated: row.updated_at || row.data?.lastUpdated,
            _isSynced: true
          }));

          cloudClients.forEach((cloudC) => {
            const localC = mergedMap.get(cloudC.id);
            const isLocalUnsynced =
              !!localC && ((localC as any)._isSynced === false || outboxIds.has(localC.id));
            if (isLocalUnsynced) return;

            const localTs = localC?.lastUpdated ? new Date(localC.lastUpdated).getTime() : 0;
            const cloudTs = cloudC.lastUpdated ? new Date(cloudC.lastUpdated).getTime() : 0;

            if (!localC || cloudTs > localTs) mergedMap.set(cloudC.id, cloudC);
          });
        }
      } catch {
        // ignore cloud errors; local still works
      }
    }

    const finalClients = Array.from(mergedMap.values()).map((c) => ({
      ...c,
      _isSynced: !outboxIds.has(c.id)
    }));

    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(finalClients));
    } catch {}

    return finalClients;
  },

  saveClient: async (client: Client, userId: string): Promise<SyncResult> => {
    if (!userId) {
      return { success: true, isLocalOnly: true, client };
    }

    const now = new Date().toISOString();

    const clientData: Client = {
      ...client,
      id: client.id || generateUUID(),
      lastUpdated: now,
      _isSynced: false
    };

    // 1) Always write local immediately
    try {
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      const clients: Client[] = local ? JSON.parse(local) : [];
      const idx = clients.findIndex((c) => c.id === clientData.id);
      if (idx >= 0) clients[idx] = clientData;
      else clients.push(clientData);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
    } catch {}

    // 2) Queue item (always)
    const activeUid = (client as any)._ownerId || userId;
    const qItem: CloudQueueItem = {
      id: clientData.id,
      user_id: activeUid,
      updated_at: now,
      data: { ...clientData, _ownerId: activeUid }
    };
    enqueueCloudSync(qItem);

    // 3) Try immediate cloud write (best effort)
    if (!isSupabaseConfigured() || !supabase) {
      return { success: true, isLocalOnly: true, client: clientData, error: 'Supabase not configured' };
    }
    if (!navigator.onLine) {
      return { success: true, isLocalOnly: true, client: clientData, error: 'Offline' };
    }

    try {
      console.log(`[SYNC] Attempting Upsert: ${clientData.id}`);

      await upsertClientRowWithAbort(
        {
          id: qItem.id,
          user_id: qItem.user_id,
          data: qItem.data,
          updated_at: qItem.updated_at
        },
        SYNC_TIMEOUT_MS
      );

      // confirmed success => remove from queue
      dequeueCloudSync(qItem.id);

      // mark local as synced
      try {
        const local = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (local) {
          const clients: Client[] = JSON.parse(local);
          const idx = clients.findIndex((c) => c.id === clientData.id);
          if (idx >= 0) {
            (clients[idx] as any)._isSynced = true;
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
          }
        }
      } catch {}

      console.log(`[SYNC] Write Confirmed: ${clientData.id}`);
      return { success: true, isLocalOnly: false, client: { ...clientData, _isSynced: true } };
    } catch (e: any) {
      // AbortError / timeouts are common on iOS background/preview
      const msg = e?.name === 'AbortError' ? 'TIMEOUT_ABORTED' : e?.message || 'Cloud write failed';
      console.warn(`[SYNC] Upsert failed (kept in outbox): ${msg}`);
      return { success: true, isLocalOnly: true, client: clientData, error: msg };
    }
  },

  flushCloudQueue: async (userId: string) => {
    if (!userId || !isSupabaseConfigured() || !supabase) return false;
    if (!navigator.onLine) return false;

    const q = readCloudQueue();
    if (q.length === 0) return true;

    // lock to prevent infinite loops
    const now = Date.now();
    if (IS_FLUSHING) return false;
    if (now - LAST_FLUSH_AT < 4000) return false; // simple backoff
    IS_FLUSHING = true;
    LAST_FLUSH_AT = now;

    try {
      console.log(`[SYNC] Flushing outbox: ${q.length} items...`);

      const remaining: CloudQueueItem[] = [];
      let flushedCount = 0;

      // IMPORTANT: Do sequential writes. iOS + bad network hates parallel.
      for (const item of q) {
        try {
          await upsertClientRowWithAbort(
            {
              id: item.id,
              user_id: item.user_id || userId,
              data: { ...item.data, _ownerId: item.user_id || userId },
              updated_at: item.updated_at
            },
            SYNC_TIMEOUT_MS
          );

          flushedCount++;

          // mark local as synced
          try {
            const local = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (local) {
              const clients: Client[] = JSON.parse(local);
              const idx = clients.findIndex((c) => c.id === item.id);
              if (idx >= 0) {
                (clients[idx] as any)._isSynced = true;
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
              }
            }
          } catch {}
        } catch (e: any) {
          const msg = e?.name === 'AbortError' ? 'TIMEOUT_ABORTED' : e?.message || 'FAILED';
          console.warn(`[SYNC] Flush failed for ${item.id}: ${msg}`);
          remaining.push(item);

          // If we’re timing out, stop hammering. Keep remaining for later.
          if (msg.includes('TIMEOUT') || msg.includes('Abort')) break;
        }
      }

      writeCloudQueue(remaining);
      console.log(`[SYNC] Flush complete. Flushed: ${flushedCount}, Remaining: ${remaining.length}`);
      return flushedCount > 0;
    } finally {
      IS_FLUSHING = false;
    }
  },

  deleteClient: async (id: string) => {
    // local delete
    try {
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local) {
        const clients = JSON.parse(local).filter((c: Client) => c.id !== id);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
      }
    } catch {}

    // remove from queue too
    dequeueCloudSync(id);

    // cloud delete best effort
    if (isSupabaseConfigured() && supabase && navigator.onLine) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
        try {
          await supabase
            .from('clients')
            .delete()
            .eq('id', id)
            // @ts-ignore
            .abortSignal(controller.signal);
        } finally {
          clearTimeout(timer);
        }
      } catch {}
    }
  }
};