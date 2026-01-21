
import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';
import { syncInspector } from './syncInspector';

// VERIFICATION LOG
console.log("🚀 Sproutly DB v8.6: Abort Error Suppression Active");

export const DB_KEYS = {
  CLIENTS: 'sproutly_clients_v2',
  OUTBOX: 'sproutly_outbox_v1'
};

// --- CONFIG ---
const SYNC_TIMEOUT_MS = 25000; // Increased to tolerate network wake-up lag
const FLUSH_WATCHDOG_MS = 30000;
const MAX_RETRIES = 50; 

interface OutboxItem {
  id: string;
  data: Client;
  userId: string;
  queuedAt: number;
  attempts: number;
  lastAttempt?: number;
}

let subscribers: Function[] = [];
let activeFlushPromise: Promise<void> | null = null;
let flushWatchdog: any = null;

// NEW: Session ID to track sync generations
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
  if (items.length === 0) updates.lastCloudErr = null; // Clear error if queue empty
  syncInspector.updateSnapshot(updates);
};

// Robust Upsert Wrapper that handles Aborts
async function upsertWithTimeout(table: string, payload: any, timeoutMs: number) {
    if (!supabase) throw new Error("Supabase not initialized");
    
    // We race the Supabase call against a timeout promise
    // This ensures we don't hang indefinitely if the network stack gets stuck
    const timeoutPromise = new Promise((_, reject) => {
        const id = setTimeout(() => {
            clearTimeout(id);
            reject(new Error("TIMEOUT_ABORT")); 
        }, timeoutMs);
    });

    try {
        // Use Promise.race to enforce timeout
        const result: any = await Promise.race([
            supabase.from(table).upsert(payload),
            timeoutPromise
        ]);
        
        if (result.error) throw result.error;
        return true;
    } catch (err: any) {
        // Normalize "AbortError" or "TIMEOUT_ABORT" to a string we can catch
        if (
            err.message === 'TIMEOUT_ABORT' || 
            err.name === 'AbortError' || 
            err.message?.includes('aborted') || 
            err.message?.includes('The operation was aborted')
        ) {
            throw new Error("NETWORK_ABORT");
        }
        throw err;
    }
}

// --- SMART RETRY WRAPPER ---
// This recursively retries an operation if it fails due to a stale token or network abort.
const fetchWithAuthRetry = async (queryFn: () => Promise<any>, retryCount = 0): Promise<any> => {
    try {
        const res = await queryFn();
        if (res.error) throw res.error;
        return res;
    } catch (e: any) {
        const isAuthError = 
            e.message?.includes('JWT') || 
            e.message?.includes('token') || 
            e.code === 'PGRST301' || 
            e.code === '401' ||
            e.message?.includes('session');
            
        const isNetworkAbort = 
            e.name === 'AbortError' || 
            e.message?.includes('aborted') || 
            e.message?.includes('Failed to fetch');
        
        // Retry logic
        if ((isAuthError || isNetworkAbort) && retryCount < 2 && supabase) {
            console.log(`🔄 Recovery Triggered (${isAuthError ? 'Auth' : 'Network'}). Retrying...`);
            
            // If Auth error, refresh session first
            if (isAuthError) {
                await supabase.auth.refreshSession();
            } else {
                // If Network error, wait 500ms for connection to stabilize
                await new Promise(r => setTimeout(r, 500));
            }
            
            return fetchWithAuthRetry(queryFn, retryCount + 1);
        }
        throw e;
    }
};

export const db = {
  getQueueCount: () => getOutbox().length,
  isFlushing: () => !!activeFlushPromise,

  resetLocks: () => {
    // 1. Kill any active promise logically
    activeFlushPromise = null;
    
    // 2. Increment session ID so any running loops abort immediately
    currentFlushSessionId++;
    
    if (flushWatchdog) clearTimeout(flushWatchdog);
    flushWatchdog = null;
    
    syncInspector.log('info', 'LOCKED', `Locks reset. New Session: ${currentFlushSessionId}`);
    syncInspector.updateSnapshot({ isFlushing: false });
  },

  subscribeToChanges: (callback: Function) => {
    subscribers.push(callback);
    return () => { subscribers = subscribers.filter(cb => cb !== callback); };
  },

  getClients: async (userId?: string): Promise<Client[]> => {
    // 1. Load Local Anchor (0ms Latency)
    let localClients: Client[] = [];
    try {
        const local = localStorage.getItem(DB_KEYS.CLIENTS);
        localClients = local ? JSON.parse(local) : [];
    } catch (e) {}

    if (!isSupabaseConfigured() || !supabase) return localClients;

    try {
      const { data } = await fetchWithAuthRetry(() => supabase!.from('clients').select('*'));
      
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
      syncInspector.log('warn', 'CLOUD_ERR', `Read failed: ${e.message}. Using local cache.`);
      return localClients; 
    }
  },

  saveClient: async (client: Client, userId?: string): Promise<Client> => {
    const now = new Date().toISOString();
    const clientData = { ...client, lastUpdated: now };
    
    // 1. Update Local State Immediately
    const local = localStorage.getItem(DB_KEYS.CLIENTS);
    const clients: Client[] = local ? JSON.parse(local) : [];
    const idx = clients.findIndex(c => c.id === clientData.id);
    if (idx >= 0) clients[idx] = clientData;
    else clients.unshift(clientData);
    localStorage.setItem(DB_KEYS.CLIENTS, JSON.stringify(clients));

    // 2. Add to Outbox
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

    // 3. Trigger Flush (AGGRESSIVE MODE)
    // We removed the background check. Now we push immediately using KeepAlive fetch.
    if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
            await db.flushCloudQueue(userId);
            
            // Double check race conditions
            const currentOutbox = getOutbox();
            const pendingItem = currentOutbox.find(i => i.id === clientData.id);
            if (pendingItem && pendingItem.attempts === 0) {
                db.flushCloudQueue(userId); 
            }
        } catch (e: any) {
            console.error("Background Sync Error:", e);
        }
    }

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
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (activeFlushPromise) return activeFlushPromise;

    const mySessionId = currentFlushSessionId;

    activeFlushPromise = (async () => {
        const initialOutbox = getOutbox();
        if (initialOutbox.length === 0) return;

        syncInspector.updateSnapshot({ isFlushing: true, lastSaveAttemptAt: Date.now() });
        
        if (flushWatchdog) clearTimeout(flushWatchdog);
        flushWatchdog = setTimeout(() => {
            if (activeFlushPromise) db.resetLocks();
        }, FLUSH_WATCHDOG_MS);

        const successfulIds = new Set<string>();
        const processingErrors = new Map<string, string>();

        try {
            for (const item of initialOutbox) {
                if (currentFlushSessionId !== mySessionId) return; // Zombie killer

                if (item.attempts > MAX_RETRIES) {
                    syncInspector.log('error', 'CLOUD_ERR', `Dropping item ${item.id} - Max Retries Exceeded`);
                    successfulIds.add(item.id); 
                    continue;
                }

                try {
                    // Check session validity
                    const { data: sData, error: sErr } = await supabase!.auth.getSession();
                    if (sErr || !sData?.session) {
                        const { data: rData, error: rErr } = await supabase!.auth.refreshSession();
                        if (rErr || !rData.session) throw new Error("Auth Stale - Re-login required");
                    }

                    const payload = {
                        id: item.id,
                        user_id: item.userId || userId,
                        data: { ...item.data, _ownerId: item.userId || userId },
                        updated_at: item.data.lastUpdated
                    };

                    await upsertWithTimeout('clients', payload, SYNC_TIMEOUT_MS);
                    
                    successfulIds.add(item.id);
                    syncInspector.updateSnapshot({ lastCloudOkAt: Date.now(), lastSaveOkAt: Date.now() });
                } catch (err: any) {
                    // CRITICAL FIX: Detect Abort/Network Errors and Retry
                    const isAuthError = err.message?.includes("Auth Stale") || err.message?.includes("JWT") || err.code === '401' || err.message?.includes("session");
                    const isAbortError = err.message === 'NETWORK_ABORT' || err.name === 'AbortError' || err.message?.includes('aborted');
                    
                    if (isAuthError || isAbortError) {
                        const label = isAuthError ? "Auth Stale" : "Network Abort";
                        console.log(`⚠️ ${label} in write loop. Retrying immediately...`);
                        
                        try {
                            if (isAuthError) await supabase!.auth.refreshSession();
                            if (isAbortError) await new Promise(r => setTimeout(r, 800)); // Pause for network wake-up

                            // Retry immediately
                            await upsertWithTimeout('clients', {
                                id: item.id,
                                user_id: item.userId || userId,
                                data: { ...item.data, _ownerId: item.userId || userId },
                                updated_at: item.data.lastUpdated
                            }, SYNC_TIMEOUT_MS);
                            successfulIds.add(item.id); // Success on retry
                            continue; // Next item
                        } catch (retryErr) {
                            console.error(`Retry failed (${label}):`, retryErr);
                        }
                    }
                    
                    // IF WE ARE HERE, RETRY FAILED OR IT WAS A REAL ERROR
                    // If it was an Abort error that persisted, we suppress the global banner
                    // because backgrounding happens frequently on mobile.
                    if (isAbortError) {
                        console.warn(`Background Sync Paused for ${item.id} (Network Abort). Will retry next wake.`);
                        // Do NOT set lastCloudErr here to avoid the red banner
                        syncInspector.log('warn', 'TIMEOUT_ABORTED', `Sync aborted for ${item.id}`);
                    } else {
                        processingErrors.set(item.id, err.message);
                        syncInspector.updateSnapshot({ lastCloudErr: err.message });
                    }
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
                activeFlushPromise = null;
                if (flushWatchdog) clearTimeout(flushWatchdog);
                
                const updates: any = { isFlushing: false, queueCount: finalOutbox.length };
                if (finalOutbox.length === 0) updates.lastCloudErr = null;
                syncInspector.updateSnapshot(updates);
            }
        }
    })();

    return activeFlushPromise;
  }
};
