import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';

/* =======================
   CONSTANTS
======================= */
const DB_VERSION = 'db.ts v14 (Bulk & Transfer)';

const LOCAL_STORAGE_KEY = 'sproutly_clients_v2';
const CLOUD_QUEUE_KEY = 'sproutly_cloud_queue_v1';
const DEBUG_KEY = 'sproutly_debug_logs_v1';

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
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c: string) => {
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

const upsertQueueItem = (item: CloudQueueItem) => {
  if (!item.user_id) return;

  const q = readQueue();
  const idx = q.findIndex((x) => x.id === item.id);
  if (idx >= 0) q[idx] = item;
  else q.push(item);

  writeQueue(q);
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
   SAFE UPSERT
   - NO abortSignal here
   - Timeout is enforced globally by supabase.ts fetchWithTimeout
======================= */
async function upsertClientRow(row: any) {
  if (!supabase) throw new Error('Supabase not initialized');

  const { data, error } = await supabase
    .from('clients')
    .upsert(row)
    // keep returning tiny to reduce payload
    .select('id');

  if (error) throw error;
  return data;
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

    // local write first
    try {
      const local: Client[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
      const idx = local.findIndex((c) => c.id === id);
      if (idx >= 0) local[idx] = clientData;
      else local.push(clientData);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(local));
    } catch {}

    const owner = (client as any)._ownerId || userId;

    // enqueue always
    upsertQueueItem({
      id,
      user_id: owner,
      updated_at: now,
      data: { ...clientData, _ownerId: owner }
    });

    debugLog(`[SAVE] queued ${id}`);

    // if cannot cloud now, exit
    if (!isSupabaseConfigured() || !supabase) {
      return { success: true, isLocalOnly: true, client: clientData, error: 'Supabase not configured' };
    }
    if (!navigator.onLine) {
      return { success: true, isLocalOnly: true, client: clientData, error: 'Offline' };
    }

    try {
      debugLog(`[UPSERT] start ${id}`);

      // Hard Timeout Race: Force reject if network hangs > 15s
      await Promise.race([
        upsertClientRow({
          id,
          user_id: owner,
          data: { ...clientData, _ownerId: owner },
          updated_at: now
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Network operation timed out')), 15000)
        )
      ]);

      // ✅ remove from queue (write-once approach)
      const q = readQueue().filter((x) => x.id !== id);
      writeQueue(q);
      markLocalSynced(id);

      debugLog(`[UPSERT] confirmed ${id}`);
      return { success: true, isLocalOnly: false, client: { ...clientData, _isSynced: true } };
    } catch (e: any) {
      const msg = e?.name || e?.message || 'UPSERT_FAILED';
      debugLog(`[UPSERT] failed ${id} ${msg}`);
      // Returns local only so app can continue
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

      const remaining: CloudQueueItem[] = [];

      // ✅ sequential, and only write queue ONCE at end
      for (const item of q) {
        try {
          debugLog(`[FLUSH] upsert ${item.id}`);

          await Promise.race([
            upsertClientRow({
              id: item.id,
              user_id: item.user_id || userId,
              data: item.data,
              updated_at: item.updated_at
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
          ]);

          markLocalSynced(item.id);
          debugLog(`[FLUSH] ok ${item.id}`);
        } catch (e: any) {
          const msg = e?.name || e?.message || 'FLUSH_FAILED';
          debugLog(`[FLUSH] fail ${item.id} ${msg}`);

          // keep current + rest
          remaining.push(item, ...q.slice(q.indexOf(item) + 1));
          break;
        }
      }

      writeQueue(remaining);

      debugLog(`[FLUSH] done remaining=${remaining.length}`);
      return remaining.length === 0;
    } finally {
      IS_FLUSHING = false;
    }
  },

  /* ---------- delete ---------- */
  deleteClient: async (id: string) => {
    // remove from queue
    writeQueue(readQueue().filter((x) => x.id !== id));

    // local delete
    try {
      const local: Client[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(local.filter((c) => c.id !== id)));
    } catch {}

    // cloud best effort
    if (isSupabaseConfigured() && supabase && navigator.onLine) {
      try {
        await supabase.from('clients').delete().eq('id', id);
      } catch {}
    }
  },

  /* ---------- bulk create ---------- */
  createClientsBulk: async (clients: Client[], userId: string) => {
    const now = new Date().toISOString();
    const itemsToSave = clients.map(c => ({
      ...c,
      lastUpdated: now,
      _ownerId: userId,
      _isSynced: false
    }));

    // Local Save
    try {
      const local: Client[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
      const newIds = new Set(itemsToSave.map(c => c.id));
      const filteredLocal = local.filter(c => !newIds.has(c.id));
      const newLocal = [...filteredLocal, ...itemsToSave];
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newLocal));
    } catch (e) {
      console.error("Local bulk save failed", e);
    }

    // Queue
    itemsToSave.forEach(c => {
      upsertQueueItem({
        id: c.id,
        user_id: userId,
        updated_at: now,
        data: c
      });
    });

    debugLog(`[BULK] Queued ${itemsToSave.length} items`);

    // Trigger Flush
    if (navigator.onLine) {
      setTimeout(() => db.flushCloudQueue(userId), 50);
    }
  },

  /* ---------- transfer ownership ---------- */
  transferOwnership: async (clientId: string, newOwnerId: string) => {
    // 1. Fetch current (using getClients to leverage full map logic)
    const clients = await db.getClients();
    const client = clients.find(c => c.id === clientId);
    
    if (!client) throw new Error("Client not found locally or in queue");

    // 2. Update with new owner
    const updatedClient = {
      ...client,
      _ownerId: newOwnerId,
      advisorId: newOwnerId, // Sync both for consistency
      lastUpdated: new Date().toISOString(),
      _isSynced: false
    };

    // 3. Save via standard pipeline
    // This handles local update + queue push + flush attempt
    return db.saveClient(updatedClient, newOwnerId);
  }
};