
import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';
import { syncInspector } from './syncInspector';

// VERIFICATION LOG
console.log("🚀 Sproutly DB v5.7 Loaded: Anti-Zombie Protocols Active");

const LOCAL_STORAGE_KEY = 'sproutly_clients_v2';
const OUTBOX_KEY = 'sproutly_outbox_v1';

// --- CONFIG ---
const SYNC_TIMEOUT_MS = 15000;        // 15s hard limit per network request
const FLUSH_WATCHDOG_MS = 35000;      // 35s max time before we force-unlock the queue

// --- Types ---
interface OutboxItem {
  id: string; // matches client.id
  data: Client;
  userId: string;
  queuedAt: number;
  attempts: number;
  lastAttempt?: number;
}

let subscribers: Function[] = [];
let isFlushing = false;
let flushWatchdog: any = null;

// --- Helpers ---
const getOutbox = (): OutboxItem[] => {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
  } catch { return []; }
};

const saveOutbox = (items: OutboxItem[]) => {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  syncInspector.updateSnapshot({ queueCount: items.length });
};

const chunkArray = <T>(array: T[], size: number): T[][] => {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

// --- Network Helpers ---
async function upsertWithTimeout(table: string, payload: any, timeoutMs: number) {
    if (!supabase) throw new Error("Supabase not initialized");
    
    const controller = new AbortController();
    
    // 1. The Database Operation
    const dbOp = supabase
        .from(table)
        .upsert(payload)
        .abortSignal(controller.signal);

    // 2. The Timeout Race
    const timeoutOp = new Promise((_, reject) => {
        const id = setTimeout(() => {
            controller.abort();
            reject(new Error(`TIMEOUT_RACE_LOST: ${timeoutMs}ms limit exceeded`));
        }, timeoutMs);
    });

    try {
        // Race them: If DB hangs, timeoutOp wins and throws.
        const { error } = await Promise.race([dbOp, timeoutOp]) as any;
        
        if (error) throw error;
        return true;
    } catch (err) {
        throw err;
    }
}

// Simple Promise Timeout Wrapper
const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} Timed Out after ${ms}ms`)), ms))
    ]);
};

export const db = {
  getQueueCount: () => getOutbox().length,
  getQueueDetails: () => getOutbox(),
  isFlushing: () => isFlushing,

  // Force reset locks (used by App.tsx on wake)
  resetLocks: () => {
    // Force Unlock
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
    let localClients: Client[] = [];
    try {
        const local = localStorage.getItem(LOCAL_STORAGE_KEY);
        localClients = local ? JSON.parse(local) : [];
    } catch (e) { console.warn("Local read failed", e); }

    if (!isSupabaseConfigured() || !supabase) {
        return localClients;
    }

    try {
      const { data, error } = await supabase.from('clients').select('*');
      
      if (error) throw error;
      
      const cloudClients = (data || []).map((row: any) => ({
          ...row.data,
          id: row.id,
          _ownerId: row.user_id,
          lastUpdated: row.updated_at || row.data.lastUpdated
      }));

      // Merge Logic
      const clientMap = new Map<string, Client>();
      cloudClients.forEach((c: Client) => clientMap.set(c.id, c));
      
      localClients.forEach(localC => {
          const cloudC = clientMap.get(localC.id);
          if (!cloudC) {
              clientMap.set(localC.id, localC); 
          } else {
              const localTime = new Date(localC.lastUpdated || 0).getTime();
              const cloudTime = new Date(cloudC.lastUpdated || 0).getTime();
              // Prefer local if it's newer OR if it's currently in the outbox (unsynced)
              const isInOutbox = getOutbox().some(i => i.id === localC.id);
              if (localTime > cloudTime || isInOutbox) {
                  clientMap.set(localC.id, localC);
              }
          }
      });

      const mergedList = Array.from(clientMap.values());
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mergedList));
      return mergedList;

    } catch (e: any) {
      // Robust Abort Check
      const errString = String(e?.message || e).toLowerCase();
      const isAbort = 
        e.name === 'AbortError' || 
        e.code === 20 ||
        errString.includes('abort') ||
        errString.includes('cancelled');

      if (isAbort) {
          syncInspector.log('info', 'NETWORK_ONLINE', 'Fetch request cancelled (AbortError) - Safe to ignore');
          return localClients;
      }
      
      syncInspector.log('warn', 'CLOUD_ERR', `Fetch clients failed: ${e.message}`);
      return localClients; 
    }
  },

  saveClient: async (client: Client, userId?: string): Promise<Client> => {
    syncInspector.log('info', 'INIT', `Saving client: ${client.profile.name || 'Unnamed'} (${client.id.substring(0,6)})`);
    syncInspector.updateSnapshot({ lastSaveAttemptAt: Date.now() });

    const now = new Date().toISOString();
    const clientData = { ...client, lastUpdated: now };

    // 1. Local Save 
    try {
        const local = localStorage.getItem(LOCAL_STORAGE_KEY);
        const clients: Client[] = local ? JSON.parse(local) : [];
        const idx = clients.findIndex(c => c.id === clientData.id);
        if (idx >= 0) clients[idx] = clientData;
        else clients.push(clientData);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
        syncInspector.log('success', 'LOCAL_WRITE', 'Saved to local storage');
    } catch (localErr: any) {
        syncInspector.log('error', 'LOCAL_WRITE', 'LocalStorage write failed', { error: localErr.message });
        throw localErr;
    }

    // 2. Enqueue
    if (isSupabaseConfigured()) {
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
        syncInspector.log('info', 'OUTBOX_ENQUEUE', `Queued for sync. Queue size: ${filtered.length}`);
        syncInspector.updateSnapshot({ lastSaveLocalOnlyAt: Date.now() });

        // 3. Trigger Flush
        setTimeout(() => db.flushCloudQueue(userId), 50);
    }

    return clientData;
  },

  flushCloudQueue: async (userId?: string) => {
    // A. WATCHDOG CHECK
    if (isFlushing) {
        syncInspector.log('warn', 'LOCKED', 'Flush already in progress');
        return;
    }
    
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        syncInspector.log('warn', 'NETWORK_OFFLINE', 'Skipping flush (Offline)');
        return;
    }

    isFlushing = true;
    syncInspector.updateSnapshot({ isFlushing: true });
    
    // B. SET WATCHDOG
    if (flushWatchdog) clearTimeout(flushWatchdog);
    flushWatchdog = setTimeout(() => {
        syncInspector.log('error', 'TIMEOUT_ABORTED', 'Watchdog broke zombie lock');
        isFlushing = false;
        syncInspector.updateSnapshot({ isFlushing: false });
    }, FLUSH_WATCHDOG_MS);

    try {
        const outbox = getOutbox();
        if (outbox.length === 0) {
            syncInspector.log('info', 'FLUSH_END', 'Outbox empty');
            isFlushing = false;
            syncInspector.updateSnapshot({ isFlushing: false });
            if (flushWatchdog) clearTimeout(flushWatchdog);
            return;
        }

        syncInspector.log('info', 'FLUSH_START', `Processing ${outbox.length} items...`);
        const pendingItems = [...outbox];
        const remainingItems: OutboxItem[] = [];

        for (const item of pendingItems) {
            const { id, data, userId: itemUserId } = item;
            const targetOwner = data._ownerId || itemUserId || userId;

            // Session Check with Timeout (Prevent Infinite Hang)
            let sessionData, sessionErr;
            try {
                const res = await withTimeout(supabase!.auth.getSession(), 5000, 'Auth Check') as any;
                sessionData = res.data;
                sessionErr = res.error;
            } catch (e: any) {
                syncInspector.log('error', 'AUTH_CHECK', `Auth check failed: ${e.message}`);
                // If auth is timing out, likely network issue. Stop flush.
                remainingItems.push(...pendingItems);
                break;
            }

            if (sessionErr || !sessionData?.session) {
                syncInspector.log('error', 'AUTH_STALE', 'Session expired during flush.');
                syncInspector.updateSnapshot({ lastSessionErr: 'Session Expired' });
                remainingItems.push(...pendingItems.filter(i => !remainingItems.includes(i))); 
                break; 
            } else {
                syncInspector.updateSnapshot({ lastSessionOkAt: Date.now(), lastSessionErr: null });
            }

            try {
                syncInspector.log('info', 'CLOUD_UPSERT_START', `Upserting ${id.substring(0,6)}...`);
                
                // C. USE TIMEOUT WRAPPER (RACE)
                await upsertWithTimeout('clients', {
                    id: id,
                    user_id: targetOwner,
                    data: { ...data, _ownerId: targetOwner },
                    updated_at: data.lastUpdated
                }, SYNC_TIMEOUT_MS);

                syncInspector.log('success', 'CLOUD_WRITE_CONFIRMED', `Synced ${id.substring(0,6)}`);
                syncInspector.updateSnapshot({ lastCloudOkAt: Date.now(), lastSaveOkAt: Date.now(), lastCloudErr: null });

            } catch (err: any) {
                const msg = err.message || 'Unknown Error';
                const isAbort = msg.includes('TIMEOUT_RACE_LOST') || msg.includes('aborted');
                const isNet = msg.includes('fetch') || msg.includes('Network') || msg.includes('Timed Out');
                
                if (isAbort) {
                    syncInspector.log('warn', 'TIMEOUT_ABORTED', `Save timed out (${SYNC_TIMEOUT_MS/1000}s) for ${id}`);
                } else if (isNet) {
                    syncInspector.log('warn', 'CLOUD_ERR', `Network error for ${id}: ${msg}`);
                } else {
                    syncInspector.log('error', 'CLOUD_ERR', `Supabase rejected ${id}: ${msg}`, { details: err });
                    syncInspector.updateSnapshot({ lastCloudErr: msg });
                }

                if (err.code === '401' || err.code === 'PGRST301') {
                     syncInspector.log('error', 'AUTH_STALE', 'Auth rejected write. Stopping flush.');
                     remainingItems.push(item);
                     remainingItems.push(...pendingItems.filter(p => p.id !== item.id && !remainingItems.includes(p))); 
                     break;
                }

                item.attempts += 1;
                item.lastAttempt = Date.now();
                remainingItems.push(item);
            }
        }

        saveOutbox(remainingItems);

    } catch (e: any) {
        syncInspector.log('error', 'FLUSH_END', `Flush crashed: ${e.message}`);
    } finally {
        isFlushing = false;
        syncInspector.updateSnapshot({ isFlushing: false });
        if (flushWatchdog) clearTimeout(flushWatchdog);
    }
  },

  deleteClient: async (id: string) => {
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local) {
          const clients = JSON.parse(local).filter((c: Client) => c.id !== id);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
      }
      
      const outbox = getOutbox().filter(i => i.id !== id);
      saveOutbox(outbox);

      if (isSupabaseConfigured() && supabase) {
          try {
              const controller = new AbortController();
              setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
              
              const { error } = await supabase.from('clients')
                  .delete()
                  .eq('id', id)
                  .abortSignal(controller.signal);
                  
              if (error) throw error;
              syncInspector.log('success', 'CLOUD_WRITE_CONFIRMED', `Deleted ${id}`);
          } catch (e: any) {
              syncInspector.log('error', 'CLOUD_ERR', `Delete failed: ${e.message}`);
          }
      }
  },

  deleteClientsBulk: async (ids: string[]) => {
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local) {
          const clients = JSON.parse(local).filter((c: Client) => !ids.includes(c.id));
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
      }
      
      const outbox = getOutbox().filter(i => !ids.includes(i.id));
      saveOutbox(outbox);

      if (isSupabaseConfigured() && supabase) {
          const chunks = chunkArray(ids, 20);
          for (const chunk of chunks) {
             await supabase.from('clients').delete().in('id', chunk);
          }
          syncInspector.log('success', 'CLOUD_WRITE_CONFIRMED', `Bulk deleted ${ids.length}`);
      }
  },

  createClientsBulk: async (clients: Client[], targetOwnerId: string) => {
      const valid = clients.filter(c => c.profile?.name);
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      const existing = local ? JSON.parse(local) : [];
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([...existing, ...valid]));

      if (isSupabaseConfigured() && supabase) {
          const rows = valid.map(c => ({
              id: c.id,
              user_id: targetOwnerId,
              data: { ...c, _ownerId: targetOwnerId },
              updated_at: new Date().toISOString()
          }));
          
          const chunks = chunkArray(rows, 50);
          for (const chunk of chunks) {
              const { error } = await supabase.from('clients').insert(chunk);
              if (error) {
                  syncInspector.log('error', 'CLOUD_ERR', `Bulk insert chunk failed: ${error.message}`);
                  throw new Error(error.message);
              }
          }
          syncInspector.log('success', 'CLOUD_WRITE_CONFIRMED', `Bulk inserted ${valid.length}`);
      }
  },

  transferClientsBulk: async (ids: string[], newOwnerId: string) => {
      if (isSupabaseConfigured() && supabase) {
          const chunks = chunkArray(ids, 20);
          for (const chunk of chunks) {
              const { data } = await supabase.from('clients').select('id, data').in('id', chunk);
              if (data) {
                  const updates = data.map(row => ({
                      id: row.id,
                      user_id: newOwnerId,
                      data: { ...row.data, _ownerId: newOwnerId },
                      updated_at: new Date().toISOString()
                  }));
                  await supabase.from('clients').upsert(updates);
              }
          }
          syncInspector.log('success', 'CLOUD_WRITE_CONFIRMED', `Bulk transferred ${ids.length}`);
      }
  },

  transferOwnership: async (clientId: string, newOwnerId: string) => {
      if (isSupabaseConfigured() && supabase) {
          const { data } = await supabase.from('clients').select('data').eq('id', clientId).single();
          if (data) {
              await supabase
                  .from('clients')
                  .update({ user_id: newOwnerId, data: { ...data.data, _ownerId: newOwnerId } })
                  .eq('id', clientId);
              syncInspector.log('success', 'CLOUD_WRITE_CONFIRMED', `Transferred ${clientId}`);
          }
      }
  }
};
