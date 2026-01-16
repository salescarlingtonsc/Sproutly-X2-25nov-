import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';

const LOCAL_STORAGE_KEY = 'sproutly_clients_v3';
const CLOUD_QUEUE_KEY = 'sproutly_cloud_queue_v3';

const SYNC_TIMEOUT_MS = 12000;
const MAX_QUEUE = 100;

let IS_FLUSHING = false;

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
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
    try {
      return (crypto as any).randomUUID();
    } catch {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const readQueue = (): CloudQueueItem[] => {
  try {
    const raw = localStorage.getItem(CLOUD_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
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

const upsertWithAbort = async (row: any) => {
  if (!supabase) throw new Error('Supabase not initialized');

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
    return true;
  } finally {
    clearTimeout(timer);
  }
};

const markLocalSynced = (id: string) => {
  try {
    const local = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!local) return;
    const clients: Client[] = JSON.parse(local);
    const idx = clients.findIndex((c) => c.id === id);
    if (idx >= 0) {
      (clients[idx] as any)._isSynced = true;
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
    }
  } catch {}
};

export const db = {
  getQueueCount: () => readQueue().length,

  subscribeToChanges: (onEvent: (payload: any) => void) => {
    if (!isSupabaseConfigured() || !supabase) return null;
    return supabase
      .channel('realtime_clients')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, onEvent)
      .subscribe();
  },

  getClients: async (userId?: string): Promise<Client[]> => {
    const localRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const localClients: Client[] = localRaw ? JSON.parse(localRaw) : [];

    const queue = readQueue();
    const outboxIds = new Set(queue.map((q) => q.id));

    const merged = new Map<string, Client>();
    localClients.forEach((c) => merged.set(c.id, c));

    // Overlay queued edits (so latest shows even if cloud stuck)
    queue.forEach((qItem) => merged.set(qItem.id, { ...qItem.data, _isSynced: false }));

    // Best effort cloud pull
    if (isSupabaseConfigured() && supabase && userId) {
      try {
        const { data } = await supabase.from('clients').select('*');
        data?.forEach((row: any) => {
          // If we have queued edit, don’t overwrite it
          if (outboxIds.has(row.id)) return;

          merged.set(row.id, {
            ...row.data,
            id: row.id,
            _ownerId: row.user_id,
            lastUpdated: row.updated_at,
            _isSynced: true
          });
        });
      } catch {}
    }

    const result = Array.from(merged.values()).map((c) => ({
      ...c,
      _isSynced: !outboxIds.has(c.id)
    }));

    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(result));
    } catch {}

    return result;
  },

  saveClient: async (client: Client, userId: string): Promise<SyncResult> => {
    if (!userId) return { success: true, isLocalOnly: true, client };

    const now = new Date().toISOString();

    const clientData: Client = {
      ...client,
      id: client.id || generateUUID(),
      lastUpdated: now,
      _isSynced: false
    };

    // 1) Save local immediately
    try {
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      const clients: Client[] = local ? JSON.parse(local) : [];
      const idx = clients.findIndex((c) => c.id === clientData.id);
      if (idx >= 0) clients[idx] = clientData;
      else clients.push(clientData);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
    } catch {}

    // 2) Enqueue (overwrite existing)
    const activeUid = (client as any)._ownerId || userId;
    const qItem: CloudQueueItem = {
      id: clientData.id,
      user_id: activeUid,
      updated_at: now,
      data: { ...clientData, _ownerId: activeUid }
    };

    const q = readQueue();
    const qIdx = q.findIndex((x) => x.id === qItem.id);
    if (qIdx >= 0) q[qIdx] = qItem;
    else q.push(qItem);
    writeQueue(q);

    // 3) Best-effort immediate upsert
    if (!isSupabaseConfigured() || !supabase) {
      return { success: true, isLocalOnly: true, client: clientData, error: 'Supabase not configured' };
    }
    if (!navigator.onLine) {
      return { success: true, isLocalOnly: true, client: clientData, error: 'Offline' };
    }

    try {
      console.log(`[SYNC] Attempting Upsert: ${clientData.id}`);
      await upsertWithAbort({
        id: qItem.id,
        user_id: qItem.user_id,
        data: qItem.data,
        updated_at: qItem.updated_at
      });

      console.log(`[SYNC] Write Confirmed: ${clientData.id}`);

      // ✅ CRITICAL FIX:
      // If write confirmed, remove from queue NOW.
      const after = readQueue().filter((x) => x.id !== qItem.id);
      writeQueue(after);

      // mark local synced
      markLocalSynced(qItem.id);

      return { success: true, isLocalOnly: false, client: { ...clientData, _isSynced: true } };
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? 'TIMEOUT_ABORTED' : e?.message || 'Cloud write failed';
      console.warn(`[SYNC] Upsert failed (kept in outbox): ${msg}`);
      return { success: true, isLocalOnly: true, client: clientData, error: msg };
    }
  },

  flushCloudQueue: async (userId: string) => {
    if (!userId || !isSupabaseConfigured() || !supabase) return false;
    if (!navigator.onLine) return false;
    if (IS_FLUSHING) return false;

    IS_FLUSHING = true;
    try {
      const q = readQueue();
      if (q.length === 0) return true;

      console.log(`[SYNC] Flushing outbox: ${q.length} items...`);

      const remaining: CloudQueueItem[] = [];

      for (const item of q) {
        try {
          console.log(`[SYNC] flush upsert: ${item.id}`);

          await upsertWithAbort({
            id: item.id,
            user_id: item.user_id || userId,
            data: item.data,
            updated_at: item.updated_at
          });

          // success => mark local synced
          markLocalSynced(item.id);
        } catch (e: any) {
          const msg = e?.name === 'AbortError' ? 'TIMEOUT_ABORTED' : e?.message || 'FAILED';
          console.warn(`[SYNC] Flush failed for ${item.id}: ${msg}`);
          remaining.push(item);
          break; // stop hammering
        }
      }

      writeQueue(remaining);

      console.log(`[SYNC] Flush complete. Remaining: ${remaining.length}`);
      return remaining.length === 0;
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

    // remove from queue
    try {
      writeQueue(readQueue().filter((x) => x.id !== id));
    } catch {}

    // cloud delete best effort
    if (isSupabaseConfigured() && supabase && navigator.onLine) {
      try {
        await supabase.from('clients').delete().eq('id', id);
      } catch {}
    }
  }
};