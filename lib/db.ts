
import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';
import { syncInspector } from './syncInspector';

// VERIFICATION LOG
console.log("🚀 Sproutly DB v6.2: AbortSignal Logic Enabled");

const LOCAL_STORAGE_KEY = 'sproutly_clients_v2';
const OUTBOX_KEY = 'sproutly_outbox_v1';

// --- CONFIG ---
const SYNC_TIMEOUT_MS = 10000;        // 10s hard limit per network request
const FLUSH_WATCHDOG_MS = 25000;      // 25s max time before we force-unlock the queue

interface OutboxItem {
  id: string;
  data: Client;
  userId: string;
  queuedAt: number;
  attempts: number;
  lastAttempt?: number;
}

let subscribers: Function[] = [];
let isFlushing = false;
let flushWatchdog: any = null;

const getOutbox = (): OutboxItem[] => {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
  } catch { return []; }
};

const saveOutbox = (items: OutboxItem[]) => {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  syncInspector.updateSnapshot({ queueCount: items.length });
};

// Hardened Upsert with Timeout
async function upsertWithTimeout(table: string, payload: any, timeoutMs: number) {
    if (!supabase) throw new Error("Supabase not initialized");
    const controller = new AbortController();
    const timeoutOp = new Promise((_, reject) => {
        setTimeout(() => {
            controller.abort();
            reject(new Error(`NETWORK_ABORT: Timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });
    const dbOp = supabase.from(table).upsert(payload).abortSignal(controller.signal);
    const { error } = await Promise.race([dbOp, timeoutOp]) as any;
    if (error) throw error;
    return true;
}

export const db = {
  getQueueCount: () => getOutbox().length,
  isFlushing: () => isFlushing,

  resetLocks: () => {
    console.log("🔓 Watchdog: Forcing Sync Lock Reset");
    isFlushing = false;
    if (flushWatchdog) clearTimeout(flushWatchdog);
    flushWatchdog = null;
    syncInspector.updateSnapshot({ isFlushing: false });
  },

  subscribeToChanges: (callback: Function) => {
    subscribers.push(callback);
    return () => { subscribers = subscribers.filter(cb => cb !== callback); };
  },

  getClients: async (userId?: string): Promise<Client[]> => {
    // 1. Initial Local Load (Instant Anchor)
    let localClients: Client[] = [];
    try {
        const local = localStorage.getItem(LOCAL_STORAGE_KEY);
        localClients = local ? JSON.parse(local) : [];
    } catch (e) {}

    if (!isSupabaseConfigured() || !supabase) return localClients;

    try {
      // 2. Cloud Fetch with manual AbortController (Supabase doesn't have .timeout())
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .abortSignal(controller.signal);
      
      clearTimeout(timeoutId);
      
      if (error) {
          console.warn("Cloud Fetch Error, falling back to local storage:", error.message);
          return localClients;
      }

      // If data is null or undefined (network flicker), don't wipe local
      if (!data) return localClients;

      const cloudClients = data.map((row: any) => ({
          ...row.data,
          id: row.id,
          _ownerId: row.user_id,
          lastUpdated: row.updated_at || row.data.lastUpdated
      }));

      // 3. UNION MERGE Protocol (Prevents disappearances)
      const clientMap = new Map<string, Client>();
      
      // Load LOCAL first
      localClients.forEach(c => clientMap.set(c.id, c));
      
      // OVERWRITE with cloud if cloud record exists
      // BUT only if we aren't currently waiting to upload a change for this specific client
      const outboxIds = new Set(getOutbox().map(i => i.id));
      
      cloudClients.forEach((cloudC: Client) => {
          if (!outboxIds.has(cloudC.id)) {
              clientMap.set(cloudC.id, cloudC);
          }
      });

      const mergedList = Array.from(clientMap.values());
      
      // Update local storage only if we actually found something
      if (mergedList.length > 0 || (data && data.length === 0)) {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mergedList));
      }
      
      return mergedList;
    } catch (e) { 
      console.error("Critical Sync Failure, yielding local data:", e);
      return localClients; 
    }
  },

  saveClient: async (client: Client, userId?: string): Promise<Client> => {
    const now = new Date().toISOString();
    const clientData = { ...client, lastUpdated: now };
    
    // 1. Local Save (Instant UI Feedback)
    const local = localStorage.getItem(LOCAL_STORAGE_KEY);
    const clients: Client[] = local ? JSON.parse(local) : [];
    const idx = clients.findIndex(c => c.id === clientData.id);
    if (idx >= 0) clients[idx] = clientData;
    else clients.push(clientData);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));

    // 2. Enqueue for Cloud
    const outbox = getOutbox();
    const filtered = outbox.filter(item => item.id !== clientData.id);
    filtered.push({
        id: clientData.id,
        data: clientData,
        userId: userId || clientData._ownerId || 'unknown',
        queuedAt: Date.now(),
        attempts: 0
    });
    saveOutbox(filtered);

    // 3. Trigger immediate flush
    db.flushCloudQueue(userId);
    return clientData;
  },

  deleteClient: async (id: string): Promise<void> => {
    const local = localStorage.getItem(LOCAL_STORAGE_KEY);
    const clients: Client[] = local ? JSON.parse(local) : [];
    // FIX: Changed undefined variable 'i' to 'c.id' to correctly filter out the deleted client
    const filtered = clients.filter(c => c.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));

    const outbox = getOutbox();
    const filteredOutbox = outbox.filter(item => item.id !== id);
    saveOutbox(filteredOutbox);

    if (isSupabaseConfigured() && supabase) {
      await supabase.from('clients').delete().eq('id', id);
    }
  },

  deleteClientsBulk: async (ids: string[]): Promise<void> => {
    const local = localStorage.getItem(LOCAL_STORAGE_KEY);
    const clients: Client[] = local ? JSON.parse(local) : [];
    const filtered = clients.filter(c => !ids.includes(c.id));
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));

    const outbox = getOutbox();
    const filteredOutbox = outbox.filter(item => !ids.includes(item.id));
    saveOutbox(filteredOutbox);

    if (isSupabaseConfigured() && supabase) {
      await supabase.from('clients').delete().in('id', ids);
    }
  },

  createClientsBulk: async (newClients: Client[], userId: string): Promise<void> => {
    const local = localStorage.getItem(LOCAL_STORAGE_KEY);
    const clients: Client[] = local ? JSON.parse(local) : [];
    const updated = [...clients, ...newClients];
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

    const outbox = getOutbox();
    newClients.forEach(c => {
      outbox.push({
        id: c.id,
        data: c,
        userId: userId,
        queuedAt: Date.now(),
        attempts: 0
      });
    });
    saveOutbox(outbox);
    db.flushCloudQueue(userId);
  },

  transferOwnership: async (clientId: string, newOwnerId: string): Promise<void> => {
    const local = localStorage.getItem(LOCAL_STORAGE_KEY);
    const clients: Client[] = local ? JSON.parse(local) : [];
    const idx = clients.findIndex(c => c.id === clientId);
    if (idx >= 0) {
      clients[idx] = { ...clients[idx], _ownerId: newOwnerId };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
    }

    if (isSupabaseConfigured() && supabase) {
      const { data: existing } = await supabase.from('clients').select('data').eq('id', clientId).single();
      if (existing) {
          const newData = { ...existing.data, _ownerId: newOwnerId };
          await supabase.from('clients').update({ user_id: newOwnerId, data: newData }).eq('id', clientId);
      }
    }
  },

  transferClientsBulk: async (clientIds: string[], newOwnerId: string): Promise<void> => {
     for (const id of clientIds) {
         await db.transferOwnership(id, newOwnerId);
     }
  },

  flushCloudQueue: async (userId?: string) => {
    if (isFlushing) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const outbox = getOutbox();
    if (outbox.length === 0) return;

    isFlushing = true;
    syncInspector.updateSnapshot({ isFlushing: true, lastSaveAttemptAt: Date.now() });
    
    if (flushWatchdog) clearTimeout(flushWatchdog);
    flushWatchdog = setTimeout(() => {
        if (isFlushing) {
            syncInspector.log('critical', 'TIMEOUT_ABORTED', 'Zombie Sync Lock Detected and Broken');
            db.resetLocks();
        }
    }, FLUSH_WATCHDOG_MS);

    try {
        const remainingItems: OutboxItem[] = [];
        const pendingItems = [...outbox];

        for (const item of pendingItems) {
            try {
                const { data: sData } = await supabase!.auth.getSession();
                if (!sData?.session) throw new Error("Auth Stale");

                await upsertWithTimeout('clients', {
                    id: item.id,
                    user_id: item.userId || userId,
                    data: { ...item.data, _ownerId: item.userId || userId },
                    updated_at: item.data.lastUpdated
                }, SYNC_TIMEOUT_MS);
                
                syncInspector.log('success', 'CLOUD_WRITE_CONFIRMED', `Synced ${item.id.substring(0,6)}`);
                syncInspector.updateSnapshot({ lastCloudOkAt: Date.now(), lastSaveOkAt: Date.now() });
            } catch (err: any) {
                item.attempts += 1;
                remainingItems.push(item);
                syncInspector.log('warn', 'CLOUD_ERR', `Sync failed for ${item.id.substring(0,6)}: ${err.message}`);
                syncInspector.updateSnapshot({ lastCloudErr: err.message });
            }
        }
        saveOutbox(remainingItems);
    } finally {
        isFlushing = false;
        syncInspector.updateSnapshot({ isFlushing: false });
        if (flushWatchdog) clearTimeout(flushWatchdog);
    }
  }
};
