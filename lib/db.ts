import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';
import { syncInspector } from './syncInspector';

// VERIFICATION LOG
console.log("🚀 Sproutly DB v6.7: Deep Anchor Protocol Active");

export const DB_KEYS = {
  CLIENTS: 'sproutly_clients_v2',
  OUTBOX: 'sproutly_outbox_v1'
};

// --- CONFIG ---
const SYNC_TIMEOUT_MS = 10000;        
const FLUSH_WATCHDOG_MS = 25000;      

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
    const val = localStorage.getItem(DB_KEYS.OUTBOX);
    return val ? JSON.parse(val) : [];
  } catch { return []; }
};

const saveOutbox = (items: OutboxItem[]) => {
  localStorage.setItem(DB_KEYS.OUTBOX, JSON.stringify(items));
  syncInspector.updateSnapshot({ queueCount: items.length });
};

async function upsertWithTimeout(table: string, payload: any, timeoutMs: number) {
    if (!supabase) throw new Error("Supabase not initialized");
    const controller = new AbortController();
    const timeoutOp = new Promise((_, reject) => {
        setTimeout(() => {
            controller.abort();
            reject(new Error(`NETWORK_ABORT: Sync timed out after ${timeoutMs}ms`));
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
    // 1. Load Local Anchor (0ms)
    let localClients: Client[] = [];
    try {
        const local = localStorage.getItem(DB_KEYS.CLIENTS);
        localClients = local ? JSON.parse(local) : [];
    } catch (e) {}

    if (!isSupabaseConfigured() || !supabase) return localClients;

    try {
      // 2. Cloud Fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .abortSignal(controller.signal);
      
      clearTimeout(timeoutId);
      
      // If network is unstable, return local instantly to prevent $0 screen
      if (error) {
          syncInspector.log('warn', 'CLOUD_ERR', `Sync interrupted: ${error.message}. Yielding anchor.`);
          return localClients;
      }

      // 3. UNION-MERGE Protocol (The "Disappearing Leads" Fix)
      const clientMap = new Map<string, Client>();
      localClients.forEach(c => clientMap.set(c.id, c));
      
      const cloudClientsRaw = data || [];
      const outboxIds = new Set(getOutbox().map(i => i.id));

      cloudClientsRaw.forEach((row: any) => {
          const cloudC: Client = {
              ...row.data,
              id: row.id,
              _ownerId: row.user_id,
              lastUpdated: row.updated_at || row.data.lastUpdated
          };

          const localC = clientMap.get(cloudC.id);
          const isPendingLocalSave = outboxIds.has(cloudC.id);
          const isCloudNewer = !localC || (new Date(cloudC.lastUpdated).getTime() > new Date(localC.lastUpdated).getTime());

          if (!isPendingLocalSave && isCloudNewer) {
              clientMap.set(cloudC.id, cloudC);
          }
      });

      const mergedList = Array.from(clientMap.values());
      localStorage.setItem(DB_KEYS.CLIENTS, JSON.stringify(mergedList));
      return mergedList;
    } catch (e: any) { 
      return localClients; 
    }
  },

  saveClient: async (client: Client, userId?: string): Promise<Client> => {
    const now = new Date().toISOString();
    const clientData = { ...client, lastUpdated: now };
    
    const local = localStorage.getItem(DB_KEYS.CLIENTS);
    const clients: Client[] = local ? JSON.parse(local) : [];
    const idx = clients.findIndex(c => c.id === clientData.id);
    if (idx >= 0) clients[idx] = clientData;
    else clients.unshift(clientData);
    localStorage.setItem(DB_KEYS.CLIENTS, JSON.stringify(clients));

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

    db.flushCloudQueue(userId);
    return clientData;
  },

  deleteClient: async (id: string): Promise<void> => {
    const local = localStorage.getItem(DB_KEYS.CLIENTS);
    const clients: Client[] = local ? JSON.parse(local) : [];
    localStorage.setItem(DB_KEYS.CLIENTS, JSON.stringify(clients.filter(c => c.id !== id)));

    const outbox = getOutbox();
    saveOutbox(outbox.filter(item => item.id !== id));

    if (isSupabaseConfigured() && supabase) {
      await supabase.from('clients').delete().eq('id', id);
    }
  },

  createClientsBulk: async (newClients: Client[], userId: string): Promise<void> => {
    const local = localStorage.getItem(DB_KEYS.CLIENTS);
    const clients: Client[] = local ? JSON.parse(local) : [];
    const updated = [...newClients, ...clients];
    localStorage.setItem(DB_KEYS.CLIENTS, JSON.stringify(updated));

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
    const local = localStorage.getItem(DB_KEYS.CLIENTS);
    const clients: Client[] = local ? JSON.parse(local) : [];
    const idx = clients.findIndex(c => c.id === clientId);
    if (idx >= 0) {
      clients[idx] = { ...clients[idx], _ownerId: newOwnerId };
      localStorage.setItem(DB_KEYS.CLIENTS, JSON.stringify(clients));
    }

    if (isSupabaseConfigured() && supabase) {
      const { data: existing } = await supabase.from('clients').select('data').eq('id', clientId).single();
      if (existing) {
          const newData = { ...existing.data, _ownerId: newOwnerId };
          await supabase.from('clients').update({ user_id: newOwnerId, data: newData }).eq('id', clientId);
      }
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
        if (isFlushing) db.resetLocks();
    }, FLUSH_WATCHDOG_MS);

    try {
        const remainingItems: OutboxItem[] = [];
        for (const item of outbox) {
            try {
                const { data: sData } = await supabase!.auth.getSession();
                if (!sData?.session) throw new Error("Auth Stale");

                await upsertWithTimeout('clients', {
                    id: item.id,
                    user_id: item.userId || userId,
                    data: { ...item.data, _ownerId: item.userId || userId },
                    updated_at: item.data.lastUpdated
                }, SYNC_TIMEOUT_MS);
                
                syncInspector.updateSnapshot({ lastCloudOkAt: Date.now(), lastSaveOkAt: Date.now() });
            } catch (err: any) {
                item.attempts += 1;
                remainingItems.push(item);
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