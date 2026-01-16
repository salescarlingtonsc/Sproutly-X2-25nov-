import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';

const LOCAL_STORAGE_KEY = 'sproutly_clients_v2';
const CLOUD_QUEUE_KEY = 'sproutly_cloud_queue_v1';

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

const emitQueueChanged = () => {
  try {
    window.dispatchEvent(new CustomEvent('sproutly:queue_changed'));
  } catch {}
};

const safeJsonParse = <T = any>(raw: string | null, fallback: T): T => {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
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

const readCloudQueue = (): CloudQueueItem[] =>
  safeJsonParse<CloudQueueItem[]>(localStorage.getItem(CLOUD_QUEUE_KEY), []);

const writeCloudQueue = (items: CloudQueueItem[]) => {
  try {
    localStorage.setItem(CLOUD_QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUE)));
    emitQueueChanged();
  } catch {}
};

const enqueueCloudSync = (item: CloudQueueItem) => {
  if (!item?.id || !item.user_id) return;
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

const readLocalClients = (): Client[] =>
  safeJsonParse<Client[]>(localStorage.getItem(LOCAL_STORAGE_KEY), []);

const writeLocalClients = (clients: Client[]) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
  } catch {}
};

const upsertLocalClient = (client: Client) => {
  const local = readLocalClients();
  const idx = local.findIndex((c) => c.id === client.id);
  if (idx >= 0) local[idx] = client;
  else local.push(client);
  writeLocalClients(local);
};

const markLocalSynced = (id: string, isSynced: boolean) => {
  const local = readLocalClients();
  const idx = local.findIndex((c) => c.id === id);
  if (idx >= 0) {
    (local[idx] as any)._isSynced = isSynced;
    writeLocalClients(local);
  }
};

// Real timeout that cancels the HTTP call (iOS Safari can hang requests)
async function upsertClientRowWithAbort(row: any, timeoutMs: number) {
  if (!supabase) throw new Error('Supabase not initialized');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { data, error } = await (supabase as any)
      .from('clients')
      .upsert(row)
      .select('id, updated_at')
      .single()
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

  // ✅ REQUIRED: App.tsx expects this to exist
  subscribeToChanges: (onEvent: (payload: any) => void) => {
    if (!isSupabaseConfigured() || !supabase) return null;
    try {
      return supabase
        .channel('realtime_clients')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, (payload: any) =>
          onEvent(payload)
        )
        .subscribe();
    } catch {
      return null;
    }
  },

  getClients: async (userId?: string): Promise<Client[]> => {
    const localClients = readLocalClients();

    const queue = readCloudQueue();
    const outboxIds = new Set(queue.map((q) => q.id));

    const mergedMap = new Map<string, Client>();
    localClients.forEach((c) => mergedMap.set(c.id, c));

    // overlay unsynced edits
    queue.forEach((qItem) => {
      mergedMap.set(qItem.id, { ...qItem.data, _isSynced: false });
    });

    // best-effort cloud pull
    if (isSupabaseConfigured() && supabase && userId) {
      try {
        const { data, error } = await supabase.from('clients').select('*');
        if (!error && Array.isArray(data)) {
          data.forEach((row: any) => {
            const cloudC: Client = {
              ...row.data,
              id: row.id,
              _ownerId: row.user_id,
              lastUpdated: row.updated_at || row.data?.lastUpdated,
              _isSynced: true
            };

            // don’t overwrite outbox edits
            if (outboxIds.has(cloudC.id)) return;

            const existing = mergedMap.get(cloudC.id);
            if (existing && (existing as any)._isSynced === false) return;

            const localTs = existing?.lastUpdated ? new Date(existing.lastUpdated).getTime() : 0;
            const cloudTs = cloudC.lastUpdated ? new Date(cloudC.lastUpdated).getTime() : 0;

            if (!existing || cloudTs >= localTs) mergedMap.set(cloudC.id, cloudC);
          });
        }
      } catch {}
    }

    const finalClients = Array.from(mergedMap.values()).map((c) => ({
      ...c,
      _isSynced: !outboxIds.has(c.id)
    }));

    writeLocalClients(finalClients);
    return finalClients;
  },

  saveClient: async (client: Client, userId: string): Promise<SyncResult> => {
    if (!userId) return { success: true, isLocalOnly: true, client };

    const now = new Date().toISOString();
    const activeUid = (client as any)._ownerId || userId;

    const clientData: Client = {
      ...client,
      id: client.id || generateUUID(),
      lastUpdated: now,
      _isSynced: false,
      _ownerId: activeUid
    };

    // local first
    upsertLocalClient(clientData);

    // queue always
    const qItem: CloudQueueItem = {
      id: clientData.id,
      user_id: activeUid,
      updated_at: now,
      data: clientData
    };
    enqueueCloudSync(qItem);

    // cloud best-effort
    if (!isSupabaseConfigured() || !supabase) {
      return { success: true, isLocalOnly: true, client: clientData, error: 'Supabase not configured' };
    }
    if (!navigator.onLine) {
      return { success: true, isLocalOnly: true, client: clientData, error: 'Offline' };
    }

    try {
      console.log(`[SYNC] Attempting Upsert: ${clientData.id}`);

      await upsertClientRowWithAbort(
        { id: qItem.id, user_id: qItem.user_id, data: qItem.data, updated_at: qItem.updated_at },
        SYNC_TIMEOUT_MS
      );

      console.log(`[SYNC] Write Confirmed: ${clientData.id}`);

      dequeueCloudSync(qItem.id);
      markLocalSynced(clientData.id, true);

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

    const q = readCloudQueue();
    if (q.length === 0) return true;

    const now = Date.now();
    if (IS_FLUSHING) return false;
    if (now - LAST_FLUSH_AT < 4000) return false;

    IS_FLUSHING = true;
    LAST_FLUSH_AT = now;

    try {
      console.log(`[SYNC] Flushing outbox: ${q.length} items...`);

      const remaining: CloudQueueItem[] = [];
      let flushed = 0;

      for (const item of q) {
        try {
          await upsertClientRowWithAbort(
            {
              id: item.id,
              user_id: item.user_id || userId,
              data: item.data,
              updated_at: item.updated_at
            },
            SYNC_TIMEOUT_MS
          );

          flushed++;
          dequeueCloudSync(item.id);
          markLocalSynced(item.id, true);
        } catch (e: any) {
          const msg = e?.name === 'AbortError' ? 'TIMEOUT_ABORTED' : e?.message || 'FAILED';
          console.warn(`[SYNC] Flush failed for ${item.id}: ${msg}`);
          remaining.push(item);

          // stop hammering if timeout/abort
          if (msg.includes('TIMEOUT') || msg.includes('Abort')) break;
        }
      }

      writeCloudQueue(remaining);
      console.log(`[SYNC] Flush complete. Flushed: ${flushed}, Remaining: ${remaining.length}`);
      return flushed > 0;
    } finally {
      IS_FLUSHING = false;
    }
  },

  deleteClient: async (id: string) => {
    // local
    try {
      const local = readLocalClients().filter((c) => c.id !== id);
      writeLocalClients(local);
    } catch {}

    // queue
    dequeueCloudSync(id);

    // cloud best-effort
    if (isSupabaseConfigured() && supabase && navigator.onLine) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
        try {
          await (supabase as any).from('clients').delete().eq('id', id).abortSignal(controller.signal);
        } finally {
          clearTimeout(timer);
        }
      } catch {}
    }
  }
};