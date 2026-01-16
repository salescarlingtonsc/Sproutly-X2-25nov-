import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';

/* ============================================================
   CONFIG
============================================================ */
const LOCAL_STORAGE_KEY = 'sproutly_clients_v2';
const CLOUD_QUEUE_KEY = 'sproutly_cloud_queue_v1';

const SYNC_TIMEOUT_MS = 12000;
const MAX_QUEUE = 100;

/* ============================================================
   MEMORY SAFETY (iPad / Preview SAFE)
   - localStorage can fail in embedded previews
   - memory queue is the source of truth
============================================================ */
let MEMORY_QUEUE: CloudQueueItem[] = [];
let IS_FLUSHING = false;
let LAST_FLUSH_AT = 0;

// Prevent re-enqueue after confirmed write
const IGNORE_IDS = new Map<string, number>();
const IGNORE_MS = 60_000;

/* ============================================================
   TYPES
============================================================ */
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

/* ============================================================
   HELPERS
============================================================ */
const emitQueueChanged = () => {
  try {
    window.dispatchEvent(new CustomEvent('sproutly:queue_changed'));
  } catch {}
};

const canUseLocalStorage = () => {
  try {
    const k = '__ls_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
};

const generateUUID = () => {
  if (crypto?.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/* ============================================================
   QUEUE (MEMORY IS SOURCE OF TRUTH)
============================================================ */
const readCloudQueue = (): CloudQueueItem[] => {
  const now = Date.now();
  for (const [id, exp] of IGNORE_IDS.entries()) {
    if (now > exp) IGNORE_IDS.delete(id);
  }

  let q = MEMORY_QUEUE;

  if (canUseLocalStorage()) {
    try {
      const raw = localStorage.getItem(CLOUD_QUEUE_KEY);
      if (raw) q = JSON.parse(raw);
    } catch {}
  }

  return q.filter(i => !IGNORE_IDS.has(i.id));
};

const writeCloudQueue = (items: CloudQueueItem[]) => {
  const trimmed = items.slice(-MAX_QUEUE);
  MEMORY_QUEUE = trimmed;

  try {
    if (canUseLocalStorage()) {
      localStorage.setItem(CLOUD_QUEUE_KEY, JSON.stringify(trimmed));
    }
  } catch {}

  emitQueueChanged();
};

const enqueueCloudSync = (item: CloudQueueItem) => {
  if (!item.user_id) return;
  if (IGNORE_IDS.has(item.id)) return;

  const q = readCloudQueue();
  const idx = q.findIndex(x => x.id === item.id);
  if (idx >= 0) q[idx] = item;
  else q.push(item);

  writeCloudQueue(q);
};

const dequeueCloudSync = (id: string) => {
  // important: ignore re-enqueue for a while after success
  IGNORE_IDS.set(id, Date.now() + IGNORE_MS);
  const q = readCloudQueue().filter(x => x.id !== id);
  writeCloudQueue(q);
};

/* ============================================================
   SUPABASE UPSERT WITH REAL ABORT
============================================================ */
async function upsertWithAbort(row: any) {
  if (!supabase) throw new Error('Supabase not initialized');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  try {
    const { error, data } = await supabase
      .from('clients')
      .upsert(row)
      .select('id, updated_at')
      .single()
      // @ts-ignore
      .abortSignal(controller.signal);

    if (error) throw error;
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/* ============================================================
   LOCAL CACHE HELPERS
============================================================ */
const readLocalClients = (): Client[] => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const writeLocalClients = (list: Client[]) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
  } catch {}
};

const writeLocalClient = (client: Client) => {
  const list = readLocalClients();
  const idx = list.findIndex(c => c.id === client.id);
  if (idx >= 0) list[idx] = client;
  else list.push(client);
  writeLocalClients(list);
};

const markLocalSynced = (id: string) => {
  const list = readLocalClients();
  const idx = list.findIndex(c => c.id === id);
  if (idx >= 0) {
    (list[idx] as any)._isSynced = true;
    writeLocalClients(list);
  }
};

/* ============================================================
   DB API
============================================================ */
export const db = {
  /* ---------- QUEUE ---------- */
  getQueueCount: () => readCloudQueue().length,

  getQueueDetails: () => {
    const q = readCloudQueue();
    return q.map(item => ({
      id: item.id,
      name: item.data?.profile?.name || 'Unnamed Client',
      updated: item.updated_at
    }));
  },

  /* ---------- REALTIME SUBSCRIBE ---------- */
  subscribeToChanges: (onEvent: (payload: any) => void) => {
    if (!isSupabaseConfigured() || !supabase) return null;

    return supabase
      .channel('realtime_clients')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, payload => {
        try {
          onEvent(payload);
        } catch {}
      })
      .subscribe();
  },

  /* ---------- READ ---------- */
  getClients: async (userId?: string): Promise<Client[]> => {
    // local first
    const localClients = readLocalClients();

    // overlay queue items (latest edits)
    const queue = readCloudQueue();
    const outboxIds = new Set(queue.map(q => q.id));

    const merged = new Map<string, Client>();
    localClients.forEach(c => merged.set(c.id, c));

    queue.forEach(q => {
      merged.set(q.id, { ...q.data, _isSynced: false });
    });

    // cloud pull best-effort
    if (isSupabaseConfigured() && supabase && userId) {
      try {
        const { data, error } = await supabase.from('clients').select('*');
        if (!error && data?.length) {
          for (const row of data as any[]) {
            const cloudC: Client = {
              ...(row.data || {}),
              id: row.id,
              _ownerId: row.user_id,
              lastUpdated: row.updated_at || row.data?.lastUpdated,
              _isSynced: true
            };

            const localC = merged.get(cloudC.id);
            const isLocalUnsynced =
              !!localC && (((localC as any)._isSynced === false) || outboxIds.has(cloudC.id));

            if (isLocalUnsynced) continue;

            merged.set(cloudC.id, cloudC);
          }
        }
      } catch {}
    }

    const final = Array.from(merged.values()).map(c => ({
      ...c,
      _isSynced: !outboxIds.has(c.id)
    }));

    writeLocalClients(final);
    return final;
  },

  /* ---------- SAVE ---------- */
  saveClient: async (client: Client, userId: string): Promise<SyncResult> => {
    if (!userId) return { success: true, isLocalOnly: true, client };

    const now = new Date().toISOString();
    const clientData: Client = {
      ...client,
      id: client.id || generateUUID(),
      lastUpdated: now,
      _isSynced: false
    };

    // 1) local always
    writeLocalClient(clientData);

    // 2) queue always
    const owner = (client as any)._ownerId || userId;
    const qItem: CloudQueueItem = {
      id: clientData.id,
      user_id: owner,
      updated_at: now,
      data: { ...clientData, _ownerId: owner }
    };
    enqueueCloudSync(qItem);

    // 3) cloud best effort
    if (!isSupabaseConfigured() || !supabase) {
      return { success: true, isLocalOnly: true, client: clientData, error: 'Supabase not configured' };
    }
    if (!navigator.onLine) {
      return { success: true, isLocalOnly: true, client: clientData, error: 'Offline' };
    }

    try {
      console.log('[SYNC] Attempting Upsert:', clientData.id);

      await upsertWithAbort({
        id: qItem.id,
        user_id: qItem.user_id,
        data: qItem.data,
        updated_at: qItem.updated_at
      });

      console.log('[SYNC] Write Confirmed:', clientData.id);

      // IMPORTANT: remove from queue EVEN IF localStorage fails
      dequeueCloudSync(clientData.id);
      markLocalSynced(clientData.id);

      return { success: true, isLocalOnly: false, client: { ...clientData, _isSynced: true } };
    } catch (e: any) {
      console.warn('[SYNC] Cloud failed, kept in outbox:', e?.message);
      return { success: true, isLocalOnly: true, client: clientData, error: e?.message };
    }
  },

  /* ---------- FLUSH QUEUE ---------- */
  flushCloudQueue: async (userId: string) => {
    if (!userId || !isSupabaseConfigured() || !supabase) return false;
    if (!navigator.onLine) return false;

    if (IS_FLUSHING) return false;
    if (Date.now() - LAST_FLUSH_AT < 4000) return false;

    IS_FLUSHING = true;
    LAST_FLUSH_AT = Date.now();

    try {
      const q = readCloudQueue();
      if (q.length === 0) return true;

      console.log('[SYNC] Flushing outbox:', q.length);

      const remaining: CloudQueueItem[] = [];
      let flushed = 0;

      for (const item of q) {
        try {
          await upsertWithAbort({
            id: item.id,
            user_id: item.user_id || userId,
            data: item.data,
            updated_at: item.updated_at
          });

          dequeueCloudSync(item.id);
          markLocalSynced(item.id);
          flushed++;
        } catch (e: any) {
          console.warn('[SYNC] Flush failed:', item.id, e?.message);
          remaining.push(item);
          break; // stop hammering
        }
      }

      writeCloudQueue(remaining);
      console.log('[SYNC] Flush complete. Flushed:', flushed, 'Remaining:', remaining.length);
      return flushed > 0;
    } finally {
      IS_FLUSHING = false;
    }
  },

  /* ---------- DELETE ---------- */
  deleteClient: async (id: string) => {
    // local remove
    const list = readLocalClients().filter(c => c.id !== id);
    writeLocalClients(list);

    // remove from queue
    dequeueCloudSync(id);

    // cloud delete best effort
    if (isSupabaseConfigured() && supabase && navigator.onLine) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

      try {
        await supabase
          .from('clients')
          .delete()
          .eq('id', id)
          // @ts-ignore
          .abortSignal(controller.signal);
      } catch {
      } finally {
        clearTimeout(timer);
      }
    }
  }
};