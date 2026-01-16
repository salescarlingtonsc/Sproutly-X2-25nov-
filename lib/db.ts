import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';

/* =======================
   CONSTANTS
======================= */
const DB_VERSION = 'db.ts v12 (stable+queueDrain+debug)';
const LOCAL_STORAGE_KEY = 'sproutly_clients_v2';
const CLOUD_QUEUE_KEY = 'sproutly_cloud_queue_v1';
const DEBUG_KEY = 'sproutly_debug_logs_v1';

const SYNC_TIMEOUT_MS = 12000;
const MAX_QUEUE = 100;

// simple flush lock so you don’t spam network
let IS_FLUSHING = false;
let LAST_FLUSH_AT = 0;

/* =======================
   DEBUG (VISIBLE ON SCREEN)
   - stored in localStorage
   - you can show it in UI by reading getDebugLogs()
======================= */
const debugLog = (msg: string) => {
  try {
    const now = new Date().toISOString();
    const prev = localStorage.getItem(DEBUG_KEY);
    const arr: string[] = prev ? JSON.parse(prev) : [];
    arr.push(`[${now}] ${DB_VERSION} ${msg}`);
    localStorage.setItem(DEBUG_KEY, JSON.stringify(arr.slice(-300)));
    window.dispatchEvent(new CustomEvent('sproutly:debug_changed'));
  } catch {}
};

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

/* =======================
   TYPES
======================= */
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

/* =======================
   HELPERS
======================= */
const emitQueueChanged = () => {
  try {
    window.dispatchEvent(new CustomEvent('sproutly:queue_changed'));
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

const generateUUID = () =>
  (crypto as any)?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const readQueue = (): CloudQueueItem[] => {
  return safeJsonParse<CloudQueueItem[]>(localStorage.getItem(CLOUD_QUEUE_KEY), []);
};

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

const upsertWithBestEffortAbort = async (row: any) => {
  if (!supabase) throw new Error('Supabase not initialized');

  // Build query once
  let query: any = supabase.from('clients').upsert(row).select('id');

  // If abortSignal exists in this supabase-js version, use it
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  try {
    if (typeof query.abortSignal === 'function') {
      query = query.abortSignal(controller.signal);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  } finally {
    clearTimeout(timer);
  }
};

/* =======================
   MAIN DB API
======================= */
export const db = {
  /* ---------- diagnostics ---------- */
  getQueueCount: () => readQueue().length,

  getQueueDetails: () =>
    readQueue().map((q) => ({
      id: q.id,
      name: q.data?.profile?.name || 'Unnamed',
      updated: q.updated_at
    })),

  /* ---------- realtime ---------- */
  subscribeToChanges: (cb: (p: any) => void) => {
    // IMPORTANT: must exist, App.tsx calls this
    if (!isSupabaseConfigured() || !supabase) {
      debugLog('[REALTIME] disabled (not configured)');
      return null;
    }
    try {
      debugLog('[REALTIME] subscribe start');
      return supabase
        .channel('clients-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, cb)
        .subscribe();
    } catch (e: any) {
      debugLog(`[REALTIME] subscribe failed ${e?.message || e}`);
      return null;
    }
  },

  /* ---------- get clients ---------- */
  getClients: async (userId?: string): Promise<Client[]> => {
    const local: Client[] = safeJsonParse<Client[]>(localStorage.getItem(LOCAL_STORAGE_KEY), []);
    const queue = readQueue();
    const outboxIds = new Set(queue.map((q) => q.id));

    // merge local + queue overlay
    const map = new Map<string, Client>();
    local.forEach((c) => map.set(c.id, c));
    queue.forEach((q) => map.set(q.id, { ...q.data, _isSynced: false }));

    // cloud pull best effort
    if (isSupabaseConfigured() && supabase && userId) {
      try {
        const { data, error } = await supabase.from('clients').select('*');
        if (!error && data) {
          data.forEach((row: any) => {
            // if local has unsynced version, don’t overwrite
            if (outboxIds.has(row.id)) return;

            map.set(row.id, {
              ...row.data,
              id: row.id,
              _ownerId: row.user_id,
              lastUpdated: row.updated_at || row.data?.lastUpdated,
              _isSynced: true
            });
          });
        } else if (error) {
          debugLog(`[GET] cloud error ${error.message}`);
        }
      } catch (e: any) {
        debugLog(`[GET] cloud crashed ${e?.message || e}`);
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

  /* ---------- save client ---------- */
  saveClient: async (client: Client, userId: string): Promise<SyncResult> => {
    const now = new Date().toISOString();
    const id = client.id || generateUUID();

    const clientData: Client = {
      ...client,
      id,
      lastUpdated: now,
      _isSynced: false
    };

    // 1) local write ALWAYS
    try {
      const local: Client[] = safeJsonParse<Client[]>(localStorage.getItem(LOCAL_STORAGE_KEY), []);
      const idx = local.findIndex((c) => c.id === id);
      if (idx >= 0) local[idx] = clientData;
      else local.push(clientData);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(local));
    } catch {}

    // 2) queue ALWAYS
    const owner = (client as any)._ownerId || userId;
    enqueue({
      id,
      user_id: owner,
      updated_at: now,
      data: { ...clientData, _ownerId: owner }
    });

    debugLog(`[SAVE] local+queued id=${id} owner=${owner} online=${navigator.onLine}`);

    // 3) attempt cloud (best effort)
    if (!isSupabaseConfigured() || !supabase) {
      debugLog('[SAVE] cloud skipped (not configured)');
      return { success: true, isLocalOnly: true, client: clientData, error: 'SUPABASE_NOT_CONFIGURED' };
    }
    if (!navigator.onLine) {
      debugLog('[SAVE] cloud skipped (offline)');
      return { success: true, isLocalOnly: true, client: clientData, error: 'OFFLINE' };
    }

    try {
      debugLog(`[UPSERT] start id=${id}`);
      await upsertWithBestEffortAbort({
        id,
        user_id: owner,
        data: { ...clientData, _ownerId: owner },
        updated_at: now
      });

      // ✅ confirmed -> drain queue + mark synced
      dequeue(id);
      markLocalSynced(id);

      debugLog(`[UPSERT] confirmed id=${id} (dequeued)`);
      return { success: true, isLocalOnly: false, client: { ...clientData, _isSynced: true } };
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? 'TIMEOUT_ABORTED' : e?.message || 'UPSERT_FAILED';
      debugLog(`[UPSERT] failed id=${id} msg=${msg} (kept queued)`);
      return { success: true, isLocalOnly: true, client: clientData, error: msg };
    }
  },

  /* ---------- flush queue ---------- */
  flushCloudQueue: async (userId: string) => {
    if (!isSupabaseConfigured() || !supabase) {
      debugLog('[FLUSH] skipped (not configured)');
      return false;
    }
    if (!navigator.onLine) {
      debugLog('[FLUSH] skipped (offline)');
      return false;
    }

    const now = Date.now();
    if (IS_FLUSHING) return false;
    if (now - LAST_FLUSH_AT < 4000) return false; // backoff

    IS_FLUSHING = true;
    LAST_FLUSH_AT = now;

    try {
      const q = readQueue();
      if (q.length === 0) {
        debugLog('[FLUSH] queue empty');
        return true;
      }

      debugLog(`[FLUSH] start count=${q.length}`);

      // sequential only
      for (const item of q) {
        try {
          debugLog(`[FLUSH] upsert id=${item.id}`);
          await upsertWithBestEffortAbort({
            id: item.id,
            user_id: item.user_id || userId,
            data: item.data,
            updated_at: item.updated_at
          });

          // ✅ drain per success
          dequeue(item.id);
          markLocalSynced(item.id);

          debugLog(`[FLUSH] confirmed id=${item.id} (dequeued)`);
        } catch (e: any) {
          const msg = e?.name === 'AbortError' ? 'TIMEOUT_ABORTED' : e?.message || 'FLUSH_FAILED';
          debugLog(`[FLUSH] failed id=${item.id} msg=${msg} (stop)`);
          break; // stop hammering
        }
      }

      const left = readQueue().length;
      debugLog(`[FLUSH] done remaining=${left}`);
      return left === 0;
    } finally {
      IS_FLUSHING = false;
    }
  },

  /* ---------- delete ---------- */
  deleteClient: async (id: string) => {
    // remove from queue first
    dequeue(id);

    // local delete
    try {
      const local: Client[] = safeJsonParse<Client[]>(localStorage.getItem(LOCAL_STORAGE_KEY), []);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(local.filter((c) => c.id !== id)));
    } catch {}

    // cloud best effort
    if (isSupabaseConfigured() && supabase && navigator.onLine) {
      try {
        await supabase.from('clients').delete().eq('id', id);
      } catch (e: any) {
        debugLog(`[DELETE] cloud failed id=${id} msg=${e?.message || e}`);
      }
    }
  }
};