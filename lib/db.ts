
import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';
import { syncInspector } from './syncInspector';

// VERIFICATION LOG
console.log("🚀 Sproutly DB v8.6: Self-Healing Sync Active");

export const DB_KEYS = {
  CLIENTS: 'sproutly_clients_v2',
  OUTBOX: 'sproutly_outbox_v1'
};

// --- CONFIG ---
const SYNC_TIMEOUT_MS = 15000; // Faster timeout for better UX
const MAX_LOCK_TIME_MS = 20000; // Nuclear reset if stuck for 20s
const MAX_RETRIES = 50; 

interface OutboxItem {
  id: string;
  data: Client;
  userId: string;
  queuedAt: number;
  attempts: number;
  lastAttempt?: number;
}

let activeFlushPromise: Promise<void> | null = null;
let lockTimestamp: number | null = null;
let currentFlushSessionId = 0;

const getOutbox = (): OutboxItem[] => {
  try {
    const val = localStorage.getItem(DB_KEYS.OUTBOX);
    return val ? JSON.parse(val) : [];
  } catch { return []; }
};

const saveOutbox = (items: OutboxItem[]) => {
  localStorage.setItem(DB_KEYS.OUTBOX, JSON.stringify(items));
  const updates: any = { queueCount: items.length };
  if (items.length === 0) updates.lastCloudErr = null;
  syncInspector.updateSnapshot(updates);
};

async function upsertWithTimeout(table: string, payload: any, timeoutMs: number) {
    if (!supabase) throw new Error("Supabase not initialized");
    
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const { error } = await supabase
            .from(table)
            .upsert(payload)
            .abortSignal(controller.signal);
        
        if (error) throw error;
        return true;
    } catch (err: any) {
        if (err.name === 'AbortError' || err.message?.includes('aborted')) {
            throw new Error("STALL_DETECTED");
        }
        throw err;
    } finally {
        clearTimeout(timeoutHandle);
    }
}

export const db = {
  getQueueCount: () => getOutbox().length,
  isFlushing: () => {
    // Self-healing check: If lock is too old, it's a zombie. Clear it.
    if (activeFlushPromise && lockTimestamp && (Date.now() - lockTimestamp > MAX_LOCK_TIME_MS)) {
        console.warn("🧟 Sync Heartbeat: Detected Zombie Lock. Resetting...");
        db.resetLocks();
        return false;
    }
    return !!activeFlushPromise;
  },

  resetLocks: () => {
    activeFlushPromise = null;
    lockTimestamp = null;
    currentFlushSessionId++;
    syncInspector.updateSnapshot({ isFlushing: false });
  },

  subscribeToChanges: (callback: Function) => {
    // Legacy support
    return () => {};
  },

  getClients: async (userId?: string): Promise<Client[]> => {
    let localClients: Client[] = [];
    try {
        const local = localStorage.getItem(DB_KEYS.CLIENTS);
        localClients = local ? JSON.parse(local) : [];
    } catch (e) {}

    if (!isSupabaseConfigured() || !supabase) return localClients;

    try {
      const { data, error } = await supabase.from('clients').select('*');
      if (error) throw error;

      const clientMap = new Map<string, Client>();
      localClients.forEach(c => clientMap.set(c.id, c));
      
      const outboxIds = new Set(getOutbox().map(i => i.id));

      (data || []).forEach((row: any) => {
          const cloudC: Client = {
              ...row.data,
              id: row.id,
              _ownerId: row.user_id,
              lastUpdated: row.updated_at || row.data.lastUpdated
          };
          const localC = clientMap.get(cloudC.id);
          if (!outboxIds.has(cloudC.id) && (!localC || new Date(cloudC.lastUpdated) > new Date(localC.lastUpdated))) {
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

    // Immediate flush attempt
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
    localStorage.setItem(DB_KEYS.CLIENTS, JSON.stringify([...newClients, ...clients]));

    const outbox = getOutbox();
    newClients.forEach(c => {
      outbox.push({ id: c.id, data: c, userId: userId, queuedAt: Date.now(), attempts: 0 });
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
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    
    // Check if we already have a promise AND it's not a zombie
    if (activeFlushPromise) {
        if (lockTimestamp && (Date.now() - lockTimestamp < MAX_LOCK_TIME_MS)) {
            return activeFlushPromise;
        }
        db.resetLocks(); // Kill zombie and proceed
    }

    const mySessionId = currentFlushSessionId;
    lockTimestamp = Date.now();
    
    activeFlushPromise = (async () => {
        const initialOutbox = getOutbox();
        if (initialOutbox.length === 0) {
            db.resetLocks();
            return;
        }

        syncInspector.updateSnapshot({ isFlushing: true, lastSaveAttemptAt: Date.now() });
        
        const successfulIds = new Set<string>();
        const processingErrors = new Map<string, string>();

        try {
            for (const item of initialOutbox) {
                if (currentFlushSessionId !== mySessionId) return; 

                try {
                    const payload = {
                        id: item.id,
                        user_id: item.userId || userId,
                        data: { ...item.data, _ownerId: item.userId || userId },
                        updated_at: item.data.lastUpdated
                    };

                    await upsertWithTimeout('clients', payload, SYNC_TIMEOUT_MS);
                    successfulIds.add(item.id);
                } catch (err: any) {
                    processingErrors.set(item.id, err.message);
                    syncInspector.updateSnapshot({ lastCloudErr: err.message });
                    
                    // If auth error, try one refresh
                    if (err.message?.includes('JWT') || err.message?.includes('401')) {
                        await supabase?.auth.refreshSession();
                    }
                    
                    // On stall, stop batch processing
                    if (err.message === 'STALL_DETECTED') break;
                }
            }
        } finally {
            if (currentFlushSessionId === mySessionId) {
                const latestOutbox = getOutbox();
                const finalOutbox = latestOutbox.filter(item => {
                    if (successfulIds.has(item.id)) return false;
                    if (processingErrors.has(item.id)) {
                        item.attempts += 1;
                        item.lastAttempt = Date.now();
                        return true;
                    }
                    return true;
                });

                saveOutbox(finalOutbox);
                db.resetLocks();
                
                const updates: any = { isFlushing: false, queueCount: finalOutbox.length };
                if (finalOutbox.length === 0) updates.lastCloudErr = null;
                syncInspector.updateSnapshot(updates);
            }
        }
    })();

    return activeFlushPromise;
  }
};
