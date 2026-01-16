import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';

/* =======================
   CONFIG
======================= */
const LOCAL_STORAGE_KEY = 'sproutly_clients_v3';
const CLOUD_QUEUE_KEY = 'sproutly_cloud_queue_v2';
const SYNC_TIMEOUT_MS = 12000;
const MAX_QUEUE = 100;

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
   INTERNAL STATE
======================= */
let IS_FLUSHING = false;

/* =======================
   HELPERS
======================= */
const emitQueueChanged = () => {
  try {
    window.dispatchEvent(new CustomEvent('sproutly:queue_changed'));
  } catch {}
};

const generateUUID = () =>
  crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

const readQueue = (): CloudQueueItem[] => {
  try {
    return JSON.parse(localStorage.getItem(CLOUD_QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
};

const writeQueue = (items: CloudQueueItem[]) => {
  localStorage.setItem(
    CLOUD_QUEUE_KEY,
    JSON.stringify(items.slice(-MAX_QUEUE))
  );
  emitQueueChanged();
};

/* =======================
   ABORTABLE UPSERT
======================= */
async function upsertWithAbort(row: any) {
  if (!supabase) throw new Error('Supabase not ready');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  try {
    const { error } = await supabase
      .from('clients')
      .upsert(row)
      .select('id')
      .single()
      // @ts-ignore
      .abortSignal(controller.signal);

    if (error) throw error;
  } finally {
    clearTimeout(timer);
  }
}

/* =======================
   DB API
======================= */
export const db = {
  /* ---------- Diagnostics ---------- */
  getQueueCount: () => readQueue().length,

  subscribeToChanges: (cb: (p: any) => void) => {
    if (!supabase || !isSupabaseConfigured()) return null;
    return supabase
      .channel('clients_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, cb)
      .subscribe();
  },

  /* ---------- Read ---------- */
  getClients: async (): Promise<Client[]> => {
    const local = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    const queue = readQueue();
    const queuedIds = new Set(queue.map(q => q.id));

    const merged = new Map<string, Client>();
    local.forEach(c => merged.set(c.id, c));
    queue.forEach(q => merged.set(q.id, { ...q.data, _isSynced: false }));

    if (supabase && isSupabaseConfigured()) {
      try {
        const { data } = await supabase.from('clients').select('*');
        data?.forEach(row => {
          if (!queuedIds.has(row.id)) {
            merged.set(row.id, {
              ...row.data,
              id: row.id,
              _isSynced: true,
              lastUpdated: row.updated_at
            });
          }
        });
      } catch {}
    }

    const result = Array.from(merged.values());
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(result));
    return result;
  },

  /* ---------- Save ---------- */
  saveClient: async (client: Client, userId: string): Promise<SyncResult> => {
    const now = new Date().toISOString();
    const data: Client = {
      ...client,
      id: client.id || generateUUID(),
      lastUpdated: now,
      _isSynced: false
    };

    // 1. Save locally
    const local = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    const idx = local.findIndex((c: Client) => c.id === data.id);
    if (idx >= 0) local[idx] = data;
    else local.push(data);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(local));

    // 2. Enqueue (ONLY ONCE)
    const queue = readQueue();
    if (!queue.find(q => q.id === data.id)) {
      queue.push({
        id: data.id,
        user_id: (client as any)._ownerId || userId,
        updated_at: now,
        data
      });
      writeQueue(queue);
    }

    return { success: true, isLocalOnly: true, client: data };
  },

  /* ---------- Flush ---------- */
  flushCloudQueue: async (userId: string) => {
    if (IS_FLUSHING || !navigator.onLine || !supabase) return false;
    IS_FLUSHING = true;

    try {
      const queue = readQueue();
      if (queue.length === 0) return true;

      const remaining: CloudQueueItem[] = [];

      for (const item of queue) {
        try {
          await upsertWithAbort({
            id: item.id,
            user_id: item.user_id || userId,
            data: item.data,
            updated_at: item.updated_at
          });

          // Mark local synced
          const local = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
          const idx = local.findIndex((c: Client) => c.id === item.id);
          if (idx >= 0) {
            local[idx]._isSynced = true;
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(local));
          }
        } catch {
          remaining.push(item);
          break; // stop hammering network
        }
      }

      writeQueue(remaining);
      return remaining.length === 0;
    } finally {
      IS_FLUSHING = false;
    }
  },

  /* ---------- Delete ---------- */
  deleteClient: async (id: string) => {
    const local = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify(local.filter((c: Client) => c.id !== id))
    );

    writeQueue(readQueue().filter(q => q.id !== id));

    if (supabase && navigator.onLine) {
      try {
        await supabase.from('clients').delete().eq('id', id);
      } catch {}
    }
  }
};