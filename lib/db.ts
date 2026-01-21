import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';
import { syncInspector } from './syncInspector';

// Hard timeout wrapper for all Supabase session calls
async function withHardTimeout<T>(promise: Promise<T>, ms = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("HARD_TIMEOUT")), ms);
    promise.then(
      (res) => { clearTimeout(id); resolve(res); },
      (err) => { clearTimeout(id); reject(err); }
    );
  });
}

// Debug marker
console.log("🚀 Sproutly DB: Hard Timeout + Abort-Safe Sync Enabled");

export const DB_KEYS = {
  CLIENTS: 'sproutly_clients_v2',
  OUTBOX: 'sproutly_outbox_v1'
};

// Config
const SYNC_TIMEOUT_MS = 25000;
const FLUSH_WATCHDOG_MS = 30000;
const MAX_RETRIES = 50;

// Outbox item shape
interface OutboxItem {
  id: string;
  data: Client;
  userId: string;
  queuedAt: number;
  attempts: number;
  lastAttempt?: number;
}

// Internal state
let subscribers: Function[] = [];
let activeFlushPromise: Promise<void> | null = null;
let flushWatchdog: any = null;
let currentFlushSessionId = 0;

// Outbox helpers
const getOutbox = (): OutboxItem[] => {
  try {
    const raw = localStorage.getItem(DB_KEYS.OUTBOX);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveOutbox = (items: OutboxItem[]) => {
  localStorage.setItem(DB_KEYS.OUTBOX, JSON.stringify(items));
  const updates: any = { queueCount: items.length };
  if (items.length === 0) updates.lastCloudErr = null;
  syncInspector.updateSnapshot(updates);
};

// Abort detection
const isAbortError = (err: any): boolean => {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const name = (err.name || '').toLowerCase();
  return (
    msg.includes('aborted') ||
    msg.includes('operation was aborted') ||
    msg.includes('network_abort') ||
    msg.includes('timeout_abort') ||
    name === 'aborterror' ||
    err.status === 0 ||
    err.code === 20
  );
};

// Upsert wrapper with timeout + abort normalization
async function upsertWithTimeout(table: string, payload: any, timeoutMs: number) {
  if (!supabase) throw new Error("Supabase not initialized");

  const timeoutPromise = new Promise((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(new Error("TIMEOUT_ABORT"));
    }, timeoutMs);
  });

  try {
    const result: any = await Promise.race([
      supabase.from(table).upsert(payload),
      timeoutPromise
    ]);
    if (result.error) throw result.error;
    return true;
  } catch (err: any) {
    if (isAbortError(err)) throw new Error("NETWORK_ABORT");
    throw err;
  }
}

// Retry wrapper for reads
const fetchWithAuthRetry = async (queryFn: () => Promise<any>, retryCount = 0): Promise<any> => {
  try {
    const res = await queryFn();
    if (res.error) throw res.error;
    return res;
  } catch (e: any) {
    const msg = (e.message || '').toLowerCase();
    const isAuthError =
      msg.includes('jwt') ||
      msg.includes('token') ||
      msg.includes('session') ||
      e.code === '401' ||
      e.code === 'PGRST301';

    const isNetworkAbort = isAbortError(e) || msg.includes('failed to fetch');

    if ((isAuthError || isNetworkAbort) && retryCount < 2 && supabase) {
      console.log(`🔄 Recovery Triggered (${isAuthError ? 'Auth' : 'Network'})`);

      try {
        if (isAuthError) {
          await withHardTimeout(supabase.auth.refreshSession());
        } else {
          await new Promise(r => setTimeout(r, 500));
        }
      } catch {
        // ignore
      }

      return fetchWithAuthRetry(queryFn, retryCount + 1);
    }

    throw e;
  }
};

// ---------------------------
// DB API
// ---------------------------

export const db = {
  getQueueCount: () => getOutbox().length,
  isFlushing: () => !!activeFlushPromise,

  resetLocks: () => {
    activeFlushPromise = null;
    currentFlushSessionId++;
    if (flushWatchdog) clearTimeout(flushWatchdog);
    flushWatchdog = null;
    syncInspector.log('info', 'LOCKED', `Locks reset. Session ${currentFlushSessionId}`);
    syncInspector.updateSnapshot({ isFlushing: false });
  },

  subscribeToChanges: (callback: Function) => {
    subscribers.push(callback);
    return () => {
      subscribers = subscribers.filter(cb => cb !== callback);
    };
  },

  // ---------------------------
  // GET CLIENTS
  // ---------------------------
  getClients: async (userId?: string): Promise<Client[]> => {
    let localClients: Client[] = [];
    try {
      const raw = localStorage.getItem(DB_KEYS.CLIENTS);
      localClients = raw ? JSON.parse(raw) : [];
    } catch {}

    if (!isSupabaseConfigured() || !supabase) return localClients;

    try {
      // FIX: Added intermediate 'unknown' cast to safely convert Supabase builder to Promise<any>
      const { data } = await fetchWithAuthRetry(() =>
        (supabase.from('clients').select('*') as unknown) as Promise<any>
      );

      const map = new Map<string, Client>();
      localClients.forEach(c => map.set(c.id, c));

      const outboxIds = new Set(getOutbox().map(i => i.id));

      (data || []).forEach((row: any) => {
        const cloud: Client = {
          ...row.data,
          id: row.id,
          _ownerId: row.user_id,
          lastUpdated: row.updated_at || row.data.lastUpdated
        };

        const local = map.get(cloud.id);
        const pending = outboxIds.has(cloud.id);
        const cloudNewer =
          !local ||
          new Date(cloud.lastUpdated).getTime() >
            new Date(local.lastUpdated).getTime();

        if (!pending && cloudNewer) {
          map.set(cloud.id, cloud);
        }
      });

      const merged = Array.from(map.values());
      localStorage.setItem(DB_KEYS.CLIENTS, JSON.stringify(merged));
      return merged;
    } catch (e: any) {
      const lvl = isAbortError(e) ? 'warn' : 'error';
      syncInspector.log(lvl, 'CLOUD_ERR', `Read failed: ${e.message}`);
      return localClients;
    }
  },

  // ---------------------------
  // SAVE CLIENT
  // ---------------------------
  saveClient: async (client: Client, userId?: string): Promise<Client> => {
    const now = new Date().toISOString();
    const updated = { ...client, lastUpdated: now };

    // Update local
    const raw = localStorage.getItem(DB_KEYS.CLIENTS);
    const list: Client[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex(c => c.id === updated.id);
    if (idx >= 0) list[idx] = updated;
    else list.unshift(updated);
    localStorage.setItem(DB_KEYS.CLIENTS, JSON.stringify(list));

    // Queue for cloud
    const outbox = getOutbox().filter(i => i.id !== updated.id);
    outbox.push({
      id: updated.id,
      data: updated,
      userId: userId || updated._ownerId || 'unknown',
      queuedAt: Date.now(),
      attempts: 0
    });
    saveOutbox(outbox);

    // Trigger flush
    if (navigator.onLine) {
      try {
        await db.flushCloudQueue(userId);
        const pending = getOutbox().find(i => i.id === updated.id);
        if (pending && pending.attempts === 0) {
          db.flushCloudQueue(userId).catch(() => {});
        }
      } catch {}
    }

    return updated;
  },

  // ---------------------------
  // DELETE CLIENT
  // ---------------------------
  deleteClient: async (id: string): Promise<void> => {
    const raw = localStorage.getItem(DB_KEYS.CLIENTS);
    const list: Client[] = raw ? JSON.parse(raw) : [];
    localStorage.setItem(DB_KEYS.CLIENTS, JSON.stringify(list.filter(c => c.id !== id)));

    saveOutbox(getOutbox().filter(i => i.id !== id));

    if (isSupabaseConfigured() && supabase) {
      try {
        await supabase.from('clients').delete().eq('id', id);
      } catch (e: any) {
        if (!isAbortError(e)) throw e;
      }
    }
  },

  // ---------------------------
  // BULK CREATE
  // ---------------------------
  createClientsBulk: async (newClients: Client[], userId: string): Promise<void> => {
    const raw = localStorage.getItem(DB_KEYS.CLIENTS);
    const list: Client[] = raw ? JSON.parse(raw) : [];
    localStorage.setItem(DB_KEYS.CLIENTS, JSON.stringify([...newClients, ...list]));

    const outbox = getOutbox();
    newClients.forEach(c => {
      outbox.push({
        id: c.id,
        data: c,
        userId,
        queuedAt: Date.now(),
        attempts: 0
      });
    });
    saveOutbox(outbox);

    db.flushCloudQueue(userId).catch(() => {});
  },

  // ---------------------------
  // TRANSFER OWNERSHIP
  // ---------------------------
  transferOwnership: async (clientId: string, newOwnerId: string): Promise<void> => {
    const raw = localStorage.getItem(DB_KEYS.CLIENTS);
    const list: Client[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex(c => c.id === clientId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], _ownerId: newOwnerId };
      localStorage.setItem(DB_KEYS.CLIENTS, JSON.stringify(list));
    }

    if (isSupabaseConfigured() && supabase) {
      const { data } = await supabase
        .from('clients')
        .select('data')
        .eq('id', clientId)
        .single();

      if (data) {
        const newData = { ...data.data, _ownerId: newOwnerId };
        await supabase
          .from('clients')
          .update({ user_id: newOwnerId, data: newData })
          .eq('id', clientId);
      }
    }
  },

  // ---------------------------
  // FLUSH CLOUD QUEUE
  // ---------------------------
  flushCloudQueue: async (userId?: string) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (activeFlushPromise) return activeFlushPromise;

    const mySessionId = currentFlushSessionId;

    activeFlushPromise = (async () => {
      const initialOutbox = getOutbox();
      if (initialOutbox.length === 0) return;

      syncInspector.updateSnapshot({
        isFlushing: true,
        lastSaveAttemptAt: Date.now()
      });

      if (flushWatchdog) clearTimeout(flushWatchdog);
      flushWatchdog = setTimeout(() => {
        if (activeFlushPromise) db.resetLocks();
      }, FLUSH_WATCHDOG_MS);

      const successfulIds = new Set<string>();
      const processingErrors = new Map<string, string>();

      try {
        for (const item of initialOutbox) {
          // If a new flush session started, stop this one
          if (currentFlushSessionId !== mySessionId) return;

          // Drop items that exceeded retry limits
          if (item.attempts > MAX_RETRIES) {
            syncInspector.log(
              'error',
              'CLOUD_ERR',
              `Dropping item ${item.id} - Max retries exceeded`
            );
            successfulIds.add(item.id);
            continue;
          }

          try {
            // ---------------------------
            // SESSION VALIDATION
            // ---------------------------
            const { data: sData, error: sErr } = await withHardTimeout(
              supabase.auth.getSession()
            );

            if (sErr || !sData?.session) {
              const { data: rData, error: rErr } = await withHardTimeout(
                supabase.auth.refreshSession()
              );
              if (rErr || !rData.session) {
                throw new Error("Auth Stale - Re-login required");
              }
            }

            // ---------------------------
            // UPSERT PAYLOAD
            // ---------------------------
            const payload = {
              id: item.id,
              user_id: item.userId || userId,
              data: {
                ...item.data,
                _ownerId: item.userId || userId
              },
              updated_at: item.data.lastUpdated
            };

            await upsertWithTimeout('clients', payload, SYNC_TIMEOUT_MS);

            successfulIds.add(item.id);
            syncInspector.updateSnapshot({
              lastCloudOkAt: Date.now(),
              lastSaveOkAt: Date.now()
            });
          } catch (err: any) {
            const msg = (err.message || '').toLowerCase();
            const isAuthError =
              msg.includes("auth stale") ||
              msg.includes("jwt") ||
              msg.includes("session") ||
              err.code === '401';

            const isAbort = isAbortError(err);

            // ---------------------------
            // RETRY PATH
            // ---------------------------
            if (isAuthError || isAbort) {
              const label = isAuthError ? "Auth Stale" : "Network Abort";
              console.log(`⚠️ ${label} in write loop. Retrying...`);

              try {
                if (isAuthError) {
                  await withHardTimeout(supabase.auth.refreshSession());
                }
                if (isAbort) {
                  await new Promise(r => setTimeout(r, 800));
                }

                // Retry the upsert
                await upsertWithTimeout(
                  'clients',
                  {
                    id: item.id,
                    user_id: item.userId || userId,
                    data: {
                      ...item.data,
                      _ownerId: item.userId || userId
                    },
                    updated_at: item.data.lastUpdated
                  },
                  SYNC_TIMEOUT_MS
                );

                successfulIds.add(item.id);
                continue;
              } catch (retryErr) {
                console.error(`Retry failed (${label}):`, retryErr);
              }
            }

            // ---------------------------
            // FINAL FAILURE PATH
            // ---------------------------
            if (isAbort) {
              // Do NOT show global error banner
              syncInspector.log(
                'warn',
                'TIMEOUT_ABORTED',
                `Sync paused for ${item.id}`
              );
            } else {
              processingErrors.set(item.id, err.message);
              syncInspector.updateSnapshot({ lastCloudErr: err.message });
            }
          }
        }
      } finally {
        // ---------------------------
        // CLEANUP + OUTBOX UPDATE
        // ---------------------------
        if (currentFlushSessionId === mySessionId) {
          const latest = getOutbox();
          const finalOutbox = latest.filter(item => {
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

          const updates: any = {
            isFlushing: false,
            queueCount: finalOutbox.length
          };
          if (finalOutbox.length === 0) updates.lastCloudErr = null;

          syncInspector.updateSnapshot(updates);
        }
      }
    })();

    return activeFlushPromise;
  }
};