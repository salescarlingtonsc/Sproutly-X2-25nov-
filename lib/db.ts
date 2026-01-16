import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';

/* =======================
   CONSTANTS
======================= */
const DB_VERSION = 'db.ts v10 (abort+dequeue+no-single)';

const LOCAL_STORAGE_KEY = 'sproutly_clients_v2';
const CLOUD_QUEUE_KEY = 'sproutly_cloud_queue_v1';
const DEBUG_KEY = 'sproutly_debug_logs_v1';

const SYNC_TIMEOUT_MS = 12000;
const MAX_QUEUE = 100;

let IS_FLUSHING = false;
let LAST_FLUSH_AT = 0;

/* =======================
   DEBUG (VISIBLE ON SCREEN)
======================= */
const debugLog = (msg: string) => {
  try {
    const now = new Date().toISOString();
    const prev = localStorage.getItem(DEBUG_KEY);
    const arr = prev ? JSON.parse(prev) : [];
    arr.push(`[${now}] ${DB_VERSION} ${msg}`);
    localStorage.setItem(DEBUG_KEY, JSON.stringify(arr.slice(-300)));
    window.dispatchEvent(new CustomEvent('sproutly:debug_changed'));
  } catch {}
};

export const getDebugLogs = () => {
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

const generateUUID = () =>
  (crypto as any)?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const readQueue = (): CloudQueueItem[] => {
  try {
    return JSON.parse(localStorage.getItem(CLOUD_QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
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
  writeQueue(readQueue().filter((x) => x.id !== id));
};

const markLocalSynced = (id: string) => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return;
    const clients: Client[] = JSON.parse(raw);
    const idx = clients.findIndex((c) => c.id === id);
    if (idx >= 0) {
      (clients[idx] as any)._isSynced = true;
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
    }
  } catch {}
};

/* =======================
   SAFE UPSERT (ABORTABLE)
======================= */
async function upsertWithAbort(row: any) {
  if (!supabase) throw new Error('Supabase not initialized');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  try {
    // IMPORTANT:
    // - avoid .single() to prevent weird returning behavior
    // - just select minimal id
    const { data, error } = await supabase
      .from('clients')
      .upsert(row)
      .select('id')
      // @ts-ignore
      .abortSignal(controller.signal);

    if (error) throw error;
    return data;
  } finally {
    clearTimeout(timer);
  }
}

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
    if (!isSupabaseConfigured() || !supabase) return null;
    return supabase
      .channel('clients-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, cb)
      .subscribe();
  },

  /* ---------- get clients ---------- */
  getClients: async (userId?: string): Promise<Client[]> => {
    const local: Client[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');

    const queue = readQueue();
    const outboxIds = new Set(queue.map((q) => q.id));

    const map = new Map<string, Client>();
    local.forEach((c) => map.set(c.id, c));
    queue.forEach((q) => map.set(q.id, { ...q.data, _isSynced: false }));

    if (isSupabaseConfigured() && supabase && userId) {
      try {
        const { data, error } = await supabase.from('clients').select('*');
        if (!error && data) {
          data.forEach((row: any) => {
            if (outboxIds.has(row.id)) return;
            map.set(row.id, {
              ...row.data,
              id: row.id,
              _ownerId: row.user_id,
              lastUpdated: row.updated_at,
              _isSynced: true
            });
          });
        }
      } catch {}
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

    // local write (always)
    try {
      const local: Client[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
      const idx = local.findIndex((c) => c.id === id);
      if (idx >= 0) local[idx] = clientData;
      else local.push(clientData);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(local));
    } catch {}

    const owner = (client as any)._ownerId || userId;

    // enqueue (always)
    enqueue({
      id,
      user_id: owner,
      updated_at: now,
      data: { ...clientData, _ownerId: owner }
    });

    debugLog(`[SAVE] queued ${id}`);

    // cloud attempt
    if (!isSupabaseConfigured() || !supabase || !navigator.onLine) {
      return { success: true, isLocalOnly: true, client: clientData };
    }

    try {
      debugLog(`[UPSERT] start ${id}`);

      await upsertWithAbort({
        id,
        user_id: owner,
        data: { ...clientData, _ownerId: owner },
        updated_at: now
      });

      // ✅ drain queue immediately on success
      dequeue(id);
      markLocalSynced(id);

      debugLog(`[UPSERT] confirmed ${id}`);
      return { success: true, isLocalOnly: false, client: { ...clientData, _isSynced: true } };
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? 'TIMEOUT_ABORTED' : e?.message || 'UPSERT_FAILED';
      debugLog(`[UPSERT] failed ${id} ${msg}`);
      return { success: true, isLocalOnly: true, client: clientData, error: msg };
    }
  },

  /* ---------- flush queue ---------- */
  flushCloudQueue: async (userId: string) => {
    if (!isSupabaseConfigured() || !supabase || !navigator.onLine) return false;

    const now = Date.now();
    if (IS_FLUSHING) return false;
    if (now - LAST_FLUSH_AT < 4000) return false; // backoff
    IS_FLUSHING = true;
    LAST_FLUSH_AT = now;

    try {
      const q = readQueue();
      if (q.length === 0) return true;

      debugLog(`[FLUSH] start ${q.length}`);

      // sequential flush
      for (const item of q) {
        try {
          debugLog(`[FLUSH] upsert ${item.id}`);

          await upsertWithAbort({
            id: item.id,
            user_id: item.user_id || userId,
            data: item.data,
            updated_at: item.updated_at
          });

          // ✅ drain per success
          dequeue(item.id);
          markLocalSynced(item.id);

          debugLog(`[FLUSH] ok ${item.id}`);
        } catch (e: any) {
          const msg = e?.name === 'AbortError' ? 'TIMEOUT_ABORTED' : e?.message || 'FLUSH_FAILED';
          debugLog(`[FLUSH] fail ${item.id} ${msg}`);
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
    // remove from queue
    dequeue(id);

    // local delete
    try {
      const local: Client[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(local.filter((c) => c.id !== id)));
    } catch {}

    // cloud best effort
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