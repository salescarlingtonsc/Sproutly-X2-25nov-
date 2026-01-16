import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';

const DB_VERSION = 'db.ts v13 (throwOnError+realError+queueDrain)';

const LOCAL_STORAGE_KEY = 'sproutly_clients_v2';
const CLOUD_QUEUE_KEY = 'sproutly_cloud_queue_v1';
const DEBUG_KEY = 'sproutly_debug_logs_v1';

const SYNC_TIMEOUT_MS = 12000;
const MAX_QUEUE = 100;

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

const debugLog = (msg: string) => {
  try {
    const now = new Date().toISOString();
    const prev = localStorage.getItem(DEBUG_KEY);
    const arr: string[] = prev ? JSON.parse(prev) : [];
    arr.push(`[${now}] ${DB_VERSION} ${msg}`);
    localStorage.setItem(DEBUG_KEY, JSON.stringify(arr.slice(-400)));
    window.dispatchEvent(new CustomEvent('sproutly:debug_changed'));
  } catch {}
};

// expose logs for UI if you already have a debug panel
export const getDebugLogs = (): string[] => {
  try {
    const raw = localStorage.getItem(DEBUG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const clearDebugLogs = () => {
  try {
    localStorage.removeItem(DEBUG_KEY);
    window.dispatchEvent(new CustomEvent('sproutly:debug_changed'));
  } catch {}
};

const safeJsonParse = <T,>(raw: string | null, fallback: T): T => {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const emitQueueChanged = () => {
  try {
    window.dispatchEvent(new CustomEvent('sproutly:queue_changed'));
  } catch {}
};

const generateUUID = () =>
  (crypto as any)?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const readQueue = (): CloudQueueItem[] =>
  safeJsonParse<CloudQueueItem[]>(localStorage.getItem(CLOUD_QUEUE_KEY), []);

const writeQueue = (items: CloudQueueItem[]) => {
  try {
    localStorage.setItem(CLOUD_QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUE)));
    emitQueueChanged();
  } catch {}
};

const enqueue = (item: CloudQueueItem) => {
  if (!item.user_id) return;
  const q = readQueue();
  const idx = q.findIndex((x) => x.id === item.id);
  if (idx >= 0) q[idx] = item;
  else q.push(item);
  writeQueue(q);
};

const dequeue = (id: string) => {
  const q = readQueue();
  writeQueue(q.filter((x) => x.id !== id));
};

const markLocalSynced = (id: string) => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const clients: Client[] = raw ? JSON.parse(raw) : [];
    const idx = clients.findIndex((c) => c.id === id);
    if (idx >= 0) {
      (clients[idx] as any)._isSynced = true;
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
    }
  } catch {}
};

// Hard timeout wrapper (works regardless of supabase-js abortSignal support)
async function withHardTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), ms))
  ]);
}

async function upsertClientRow(row: any) {
  if (!supabase) throw new Error('SUPABASE_NULL');

  // IMPORTANT:
  // - .throwOnError() ensures errors are not silently swallowed
  // - select('id') ensures we get a response (useful for confirmation)
  const q = supabase
    .from('clients')
    .upsert(row, { onConflict: 'id' })
    .select('id')
    .throwOnError();

  return await withHardTimeout(q, SYNC_TIMEOUT_MS);
}

export const db = {
  getQueueCount: () => readQueue().length,

  getQueueDetails: () =>
    readQueue().map((q) => ({
      id: q.id,
      name: q.data?.profile?.name || 'Unnamed',
      updated: q.updated_at
    })),

  subscribeToChanges: (cb: (p: any) => void) => {
    if (!isSupabaseConfigured() || !supabase) {
      debugLog('[REALTIME] disabled (not configured)');
      return null;
    }
    try {
      debugLog('[REALTIME] subscribe ok');
      return supabase
        .channel('clients-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, cb)
        .subscribe();
    } catch (e: any) {
      debugLog(`[REALTIME] subscribe failed ${e?.message || String(e)}`);
      return null;
    }
  },

  getClients: async (userId?: string): Promise<Client[]> => {
    const local: Client[] = safeJsonParse<Client[]>(localStorage.getItem(LOCAL_STORAGE_KEY), []);
    const queue = readQueue();
    const outboxIds = new Set(queue.map((q) => q.id));

    const map = new Map<string, Client>();
    local.forEach((c) => map.set(c.id, c));
    queue.forEach((q) => map.set(q.id, { ...q.data, _isSynced: false }));

    if (isSupabaseConfigured() && supabase && userId) {
      try {
        const { data, error } = await supabase.from('clients').select('*');
        if (error) {
          debugLog(`[GET] cloud error: ${error.message}`);
        } else {
          data?.forEach((row: any) => {
            if (outboxIds.has(row.id)) return;
            map.set(row.id, {
              ...row.data,
              id: row.id,
              _ownerId: row.user_id,
              lastUpdated: row.updated_at || row.data?.lastUpdated,
              _isSynced: true
            });
          });
        }
      } catch (e: any) {
        debugLog(`[GET] cloud crashed: ${e?.message || String(e)}`);
      }
    }

    const final = Array.from(map.values()).map((c) => ({
      ...c,
      _isSynced: !outboxIds.has(c.id)
    }));

    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(final));
    } catch {}

    return final;
  },

  saveClient: async (client: Client, userId: string): Promise<SyncResult> => {
    const now = new Date().toISOString();
    const id = client.id || generateUUID();

    const clientData: Client = {
      ...client,
      id,
      lastUpdated: now,
      _isSynced: false
    };

    // 1) local always
    try {
      const local: Client[] = safeJsonParse<Client[]>(localStorage.getItem(LOCAL_STORAGE_KEY), []);
      const idx = local.findIndex((c) => c.id === id);
      if (idx >= 0) local[idx] = clientData;
      else local.push(clientData);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(local));
    } catch {}

    // 2) queue always
    const owner = (client as any)._ownerId || userId;
    enqueue({
      id,
      user_id: owner,
      updated_at: now,
      data: { ...clientData, _ownerId: owner }
    });

    debugLog(`[SAVE] local+queued id=${id} owner=${owner} online=${navigator.onLine}`);

    // 3) cloud best-effort
    if (!isSupabaseConfigured() || !supabase) {
      debugLog('[SAVE] cloud skipped: SUPABASE_NOT_CONFIGURED');
      return { success: true, isLocalOnly: true, client: clientData, error: 'SUPABASE_NOT_CONFIGURED' };
    }
    if (!navigator.onLine) {
      debugLog('[SAVE] cloud skipped: OFFLINE');
      return { success: true, isLocalOnly: true, client: clientData, error: 'OFFLINE' };
    }

    try {
      debugLog(`[UPSERT] start id=${id}`);

      // This is the exact payload your table must accept:
      const row = {
        id,
        user_id: owner,
        data: { ...clientData, _ownerId: owner },
        updated_at: now
      };
      debugLog(`[UPSERT] payload keys=${Object.keys(row).join(',')}`);

      await upsertClientRow(row);

      // confirmed -> drain
      dequeue(id);
      markLocalSynced(id);

      debugLog(`[UPSERT] confirmed id=${id} (dequeued)`);
      return { success: true, isLocalOnly: false, client: { ...clientData, _isSynced: true } };
    } catch (e: any) {
      // supabase-js often returns structured errors
      const msg =
        e?.message ||
        e?.error_description ||
        e?.details ||
        e?.hint ||
        String(e);

      debugLog(`[UPSERT] FAILED id=${id} msg=${msg}`);

      return { success: true, isLocalOnly: true, client: clientData, error: msg };
    }
  },

  flushCloudQueue: async (userId: string) => {
    if (!isSupabaseConfigured() || !supabase) {
      debugLog('[FLUSH] skipped: SUPABASE_NOT_CONFIGURED');
      return false;
    }
    if (!navigator.onLine) {
      debugLog('[FLUSH] skipped: OFFLINE');
      return false;
    }

    const now = Date.now();
    if (IS_FLUSHING) return false;
    if (now - LAST_FLUSH_AT < 4000) return false;

    IS_FLUSHING = true;
    LAST_FLUSH_AT = now;

    try {
      const q = readQueue();
      if (q.length === 0) {
        debugLog('[FLUSH] queue empty');
        return true;
      }

      debugLog(`[FLUSH] start count=${q.length}`);

      for (const item of q) {
        try {
          debugLog(`[FLUSH] upsert id=${item.id}`);
          await upsertClientRow({
            id: item.id,
            user_id: item.user_id || userId,
            data: item.data,
            updated_at: item.updated_at
          });

          dequeue(item.id);
          markLocalSynced(item.id);
          debugLog(`[FLUSH] confirmed id=${item.id}`);
        } catch (e: any) {
          const msg = e?.message || String(e);
          debugLog(`[FLUSH] FAILED id=${item.id} msg=${msg}`);
          break;
        }
      }

      const left = readQueue().length;
      debugLog(`[FLUSH] done remaining=${left}`);
      return left === 0;
    } finally {
      IS_FLUSHING = false;
    }
  },

  deleteClient: async (id: string) => {
    dequeue(id);

    try {
      const local: Client[] = safeJsonParse<Client[]>(localStorage.getItem(LOCAL_STORAGE_KEY), []);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(local.filter((c) => c.id !== id)));
    } catch {}

    if (isSupabaseConfigured() && supabase && navigator.onLine) {
      try {
        await supabase.from('clients').delete().eq('id', id);
      } catch (e: any) {
        debugLog(`[DELETE] cloud failed id=${id} msg=${e?.message || String(e)}`);
      }
    }
  }
};