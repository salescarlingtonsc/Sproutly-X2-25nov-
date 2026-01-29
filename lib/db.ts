import { supabase, SUPABASE_URL } from './supabase';
import { Client, ContactStatus, Profile, UserRole } from '../types';
import { syncInspector, SyncCausality } from './syncInspector';
import Dexie, { type EntityTable } from 'dexie';

console.log(`🚀 Sproutly DB v24.14: Fast Upsert & Telemetry`);

// --- DEXIE DURABILITY LAYER ---
interface DBClient {
  id: string;
  user_id: string;
  data: Client;
  updated_at: string;
}

interface OutboxItem {
  id: string;
  userId: string;
  data: Client;
  queuedAt: number;
}

const dbStore = new Dexie('SproutlyQuantumDB') as Dexie & {
  clients: EntityTable<DBClient, 'id'>;
  outbox: EntityTable<OutboxItem, 'id'>;
};

dbStore.version(1).stores({
  clients: 'id, user_id, updated_at',
  outbox: 'id, userId, queuedAt'
});

// --- PRIVATE ORCHESTRATOR STATE ---
let _isFlushing = false;
let _pendingFlush = false; 
let _resumeHandshakePending = false; 
let _syncTimer: any = null;
let _retryTimer: any = null;
let _resumeDebounceTimer: any = null;
let _flushWatchdog: any = null; // NEW: Safety valve for hung flush cycles
let _timerSetAt = 0;
let _currentScheduledReason = '';
let _activeAbort: AbortController | null = null;
let _lastFailureTime = 0;
let _backoffIdx = 0;

// --- SESSION CACHE ---
let _cachedUserId: string | null = null;

if (supabase) {
    supabase.auth.onAuthStateChange((event, session) => {
        const prevId = _cachedUserId;
        _cachedUserId = session?.user?.id || null;
        if (_cachedUserId && !prevId) {
             db.scheduleFlush('recovery_auth_regained');
        }
    });
}

const BACKOFF_SCHEDULE = [2000, 5000, 10000, 30000, 60000, 120000, 300000];
const FAILURE_COOLDOWN_MS = 10000;
const TIMER_DELAY_MS = 1500;
const FLUSH_WATCHDOG_MS = 20000; // Max time a flush can take before forced reset
const NETWORK_TIMEOUT_MS = 10000; // Max time a single request can hang

// NEW: Promise wrapper to guarantee liveness
const withTimeout = <T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> => {
    let timer: any;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`TIMEOUT_HARD: ${label} (${ms}ms)`)), ms);
    });
    return Promise.race([
        Promise.resolve(promise).finally(() => clearTimeout(timer)),
        timeout
    ]);
};

async function passStabilityGate(causality: SyncCausality): Promise<{ ok: boolean; reason: string }> {
  if (!navigator.onLine) return { ok: false, reason: 'offline' };
  
  const timeSinceFailure = Date.now() - _lastFailureTime;
  if (timeSinceFailure < FAILURE_COOLDOWN_MS) return { ok: false, reason: 'cooling_down' };
  
  // Note: We intentionally allow flush if hidden here, but we ABORT on transition TO hidden.
  // This allows background syncs that started while visible to potentially finish if OS allows,
  // but prevents starting new ones if we know we are hidden (via scheduleFlush check).
  if (document.visibilityState === 'hidden') return { ok: false, reason: 'app_hidden' };
  
  return { ok: true, reason: '' };
}

async function executeInternalFlush(userId: string, causality: SyncCausality): Promise<void> {
  const moduleTag = 'lib/db.ts:Orchestrator';
  const finalCausality = { ...causality, module: moduleTag };
  
  if (_isFlushing) {
    syncInspector.log('info', 'FLUSH_SKIPPED', 'Flush already in progress', finalCausality);
    return;
  }

  _isFlushing = true;
  _pendingFlush = false; 
  _resumeHandshakePending = false; 
  _activeAbort = new AbortController();
  
  // 1. ARM WATCHDOG
  if (_flushWatchdog) clearTimeout(_flushWatchdog);
  _flushWatchdog = setTimeout(() => {
      syncInspector.log('critical', 'TIMER_WATCHDOG_VIOLATION', 'Flush hung (Watchdog fired). Force resetting.', finalCausality);
      db.resetLocks(); // Hard reset
      db.scheduleFlush('recovery_watchdog_timeout');
  }, FLUSH_WATCHDOG_MS);
  
  syncInspector.log('info', 'FLUSH_START', `Target Project: ${SUPABASE_URL}`, finalCausality);

  try {
    let hasMore = true;
    while (hasMore && _activeAbort && !_activeAbort.signal.aborted) {
      const queue = await dbStore.outbox.orderBy('queuedAt').toArray();
      if (queue.length === 0) {
        hasMore = false;
        break;
      }

      if (!navigator.onLine) break;

      const batch = queue.slice(0, 50);
      const payload = batch.map(item => ({
        id: item.id,
        user_id: item.userId,
        data: item.data,
        updated_at: item.data.lastUpdated
      }));

      // --- TELEMETRY ---
      const payloadSize = JSON.stringify(payload).length;
      const batchStart = performance.now();
      
      syncInspector.log('info', 'UPSERT_START', `Batch: ${payload.length} items, Size: ${payloadSize} bytes`, finalCausality);

      try {
        // 2. NETWORK CALL WITH HARD TIMEOUT
        // OPTIMIZATION: Removed .select(). Using minimal return to speed up response.
        // We rely on status code (200/201) for success.
        const upsertPromise = supabase!
            .from('clients')
            .upsert(payload, { onConflict: 'id', ignoreDuplicates: false })
            .abortSignal(_activeAbort.signal);

        const { error: upsertError, status, statusText } = await withTimeout<any>(
            upsertPromise, 
            NETWORK_TIMEOUT_MS, 
            'Cloud Upsert'
        );

        if (upsertError) throw upsertError;
        
        const duration = (performance.now() - batchStart).toFixed(0);
        
        // 3. SUCCESS HANDLING (Implicit verification via HTTP 200/201)
        syncInspector.log('info', 'UPSERT_RESULT', `Batch OK. Time: ${duration}ms. Status: ${status} ${statusText || ''}`, finalCausality);

        // Commit local deletion
        await dbStore.outbox.bulkDelete(batch.map(b => b.id));
        _backoffIdx = 0; 
        
      } catch (innerErr: any) {
        const isTimeout = innerErr.message?.includes('TIMEOUT_HARD');
        const isAbort = innerErr.name === 'AbortError' || innerErr.message?.includes('aborted');
        
        if (isAbort && !isTimeout) {
            syncInspector.log('warn', 'FLUSH_ABORTED', `Lifecycle Abort: ${innerErr.message}`, finalCausality);
            break; // Stop loop, let finally block clean up. Do not retry immediately if user aborted.
        }
        
        // Network Timeout or Server Error -> Schedule Retry
        _lastFailureTime = Date.now();
        _backoffIdx = Math.min(_backoffIdx + 1, BACKOFF_SCHEDULE.length - 1);
        
        syncInspector.log('error', 'UPSERT_ERR', `Upsert failed: ${innerErr.message}. Retrying in ${BACKOFF_SCHEDULE[_backoffIdx]}ms`, finalCausality);

        if (_retryTimer) clearTimeout(_retryTimer);
        // Use 'recovery_' prefix to bypass dedupe logic
        _retryTimer = setTimeout(() => db.scheduleFlush('recovery_after_failure'), BACKOFF_SCHEDULE[_backoffIdx]);
        
        throw innerErr; // Exit the loop via the outer catch
      }
      
      if (queue.length <= 50) hasMore = false;
    }
  } catch (e: any) {
    // Outer catch usually catches the 'throw innerErr' from above
    if (!e.message?.includes('TIMEOUT_HARD')) {
        syncInspector.log('error', 'CLOUD_ERR', e.message, finalCausality);
    }
  } finally {
    // 4. CLEANUP
    if (_flushWatchdog) clearTimeout(_flushWatchdog);
    _flushWatchdog = null;
    
    _isFlushing = false;
    _activeAbort = null;
    syncInspector.log('info', 'FLUSH_END', 'Flush cycle finished', finalCausality);
    window.dispatchEvent(new CustomEvent('sproutly:data_synced'));
  }
}

export const db = {
  generateUuid: () => crypto.randomUUID(),
  isValidUuid: (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  updateTokenCache: (token: string) => localStorage.setItem(DB_KEYS.TOKEN_CACHE, token),
  isFlushing: () => _isFlushing,
  getQueueCount: () => dbStore.outbox.count(),
  
  notifyResume: (source: string) => {
    if (_resumeDebounceTimer) clearTimeout(_resumeDebounceTimer);
    _resumeHandshakePending = true;
    _resumeDebounceTimer = setTimeout(async () => {
        _resumeDebounceTimer = null;
        const qCount = await dbStore.outbox.count();
        const meta = { qCount, pendingFlush: _pendingFlush, isFlushing: _isFlushing };
        syncInspector.log('info', 'RESUME_EVENT', `Consolidated Resume Signal: ${source}`, { owner: 'Lifecycle', module: 'db.ts', reason: source }, meta);
        if (qCount === 0 && _pendingFlush) _pendingFlush = false; 
        if (qCount > 0 && !_isFlushing) db.scheduleFlush(`recovery_${source}`);
    }, 500); 
  },

  getOrchestratorState: () => ({
    isFlushing: _isFlushing,
    pendingFlush: _pendingFlush,
    hasActiveTimer: !!_syncTimer,
    timerSetAt: _timerSetAt,
    lastReason: _currentScheduledReason,
    resumeHandshakePending: _resumeHandshakePending,
    isPriorityArmed: false 
  }),

  resetLocks: () => { 
      if (_activeAbort) _activeAbort.abort();
      if (_flushWatchdog) clearTimeout(_flushWatchdog);
      _flushWatchdog = null;
      
      _isFlushing = false; 
      _pendingFlush = false;
      _resumeHandshakePending = false;
      _lastFailureTime = 0;
      _backoffIdx = 0;
      if (_syncTimer) clearTimeout(_syncTimer);
      if (_retryTimer) clearTimeout(_retryTimer);
      _syncTimer = null;
      _retryTimer = null;
      _timerSetAt = 0;
  },

  pullFromCloud: async () => {
    if (!supabase || !navigator.onLine) return;
    try {
        const { data, error } = await withTimeout<any>(
            supabase.from('clients').select('*'),
            NETWORK_TIMEOUT_MS,
            'Pull Clients'
        );
        if (error || !data) return;
        const outboxIds = new Set((await dbStore.outbox.toArray()).map(o => o.id));
        const recordsToUpdate: DBClient[] = data
            .filter((row: any) => !outboxIds.has(row.id)) 
            .map((row: any) => ({ id: row.id, user_id: row.user_id, data: row.data as Client, updated_at: row.updated_at }));
        if (recordsToUpdate.length > 0) {
            await dbStore.clients.bulkPut(recordsToUpdate);
            window.dispatchEvent(new CustomEvent('sproutly:data_synced'));
        }
    } catch (e: any) {}
  },

  scheduleFlush: (reason: string) => {
    const causality: SyncCausality = { owner: 'Orchestrator', module: 'lib/db.ts', reason };
    const isPriority = reason.startsWith('recovery_') || reason === 'Immediate' || reason === 'Resume Priority Sync';
    
    _pendingFlush = true; 
    const delay = isPriority ? 0 : TIMER_DELAY_MS;

    if (_syncTimer) {
      if (!isPriority) {
        syncInspector.log('info', 'FLUSH_CANCELLED_BY_DEDUPE', `Timer active, skipping ${reason}`, causality);
        return;
      }
      clearTimeout(_syncTimer);
    }
    
    _currentScheduledReason = reason;
    _timerSetAt = Date.now();
    syncInspector.log('info', 'SCHEDULE_FLUSH_ARMED' as any, `Timer armed (${delay}ms): ${reason}`, causality);

    _syncTimer = setTimeout(async () => {
      _syncTimer = null;
      _timerSetAt = 0;

      try {
        syncInspector.log('info', 'SCHEDULE_FLUSH_FIRE', `Timer execution start`, causality);

        const qCount = await dbStore.outbox.count();
        if (qCount === 0) {
          _pendingFlush = false;
          syncInspector.log('info', 'FLUSH_SKIPPED', 'Queue empty', causality);
          return;
        }

        if (_isFlushing) {
          syncInspector.log('info', 'FLUSH_SKIPPED', 'Lock active', causality);
          return;
        }

        const gate = await passStabilityGate(causality);
        if (!gate.ok) {
          syncInspector.log('warn', 'GATE_BLOCKED', `Environment not ready: ${gate.reason}`, causality);
          return;
        }

        syncInspector.log('info', 'TIMER_CB_SESSION_START' as any, 'Checking session...', causality);
        
        let validUserId = _cachedUserId;

        if (!validUserId) {
            try {
                const sessionPromise = supabase!.auth.getSession();
                // FIX: Cast result to any to avoid Property 'error' and 'data' does not exist on type 'unknown' errors.
                const result = await withTimeout<any>(sessionPromise, 2500, 'Auth Check');
                
                if (result.error) throw result.error;
                
                validUserId = result.data?.session?.user?.id || null;
                if (validUserId) _cachedUserId = validUserId;

            } catch (authErr: any) {
                if (authErr.message?.includes('TIMEOUT_HARD')) {
                    syncInspector.log('warn', 'TIMER_CB_SESSION_TIMEOUT' as any, 'Session check timed out', causality);
                    if (_retryTimer) clearTimeout(_retryTimer);
                    _retryTimer = setTimeout(() => db.scheduleFlush('recovery_session_timeout'), 1000);
                    return;
                }

                syncInspector.log('warn', 'AUTH_ERR', `Session check failed: ${authErr.message}`, causality);
                if (_retryTimer) clearTimeout(_retryTimer);
                _retryTimer = setTimeout(() => db.scheduleFlush('recovery_after_auth_fail'), 2000);
                return;
            }
        } else {
             syncInspector.log('info', 'TIMER_CB_SESSION_DONE' as any, 'Session Cached (Fast Path)', causality);
        }

        if (validUserId) {
          syncInspector.log('info', 'TIMER_CB_CALL_EXECUTE' as any, 'Calling Flush...', causality);
          await executeInternalFlush(validUserId, causality);
        } else {
          syncInspector.log('warn', 'AUTH_ERR', 'No active session found', causality);
        }

      } catch (e: any) {
        syncInspector.log('error', 'CLOUD_ERR', `Timer callback crashed: ${e.message}`, causality);
      }
    }, delay);
  },

  requestFlush: (userId: string, causality: SyncCausality) => {
    db.scheduleFlush(causality.reason);
  },

  createClientsBulk: async (clients: Client[], userId: string) => {
    const records = clients.map(c => ({ id: c.id, user_id: userId, data: c, updated_at: c.lastUpdated || new Date().toISOString() }));
    await dbStore.clients.bulkPut(records);
    db.scheduleFlush('Bulk Ingest');
  },

  deleteClient: async (id: string) => {
    await dbStore.clients.delete(id);
    await dbStore.outbox.delete(id);
    if (supabase) await supabase.from('clients').delete().eq('id', id);
  },

  transferOwnership: async (clientId: string, newOwnerId: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('clients').update({ user_id: newOwnerId }).eq('id', clientId);
    if (error) throw error;
  },

  getClients: async (userId: string, role?: UserRole): Promise<Client[]> => {
      const records = await dbStore.clients.toArray();
      const filteredRecords = records.filter(r => {
          if (!r || !r.data) return false;
          
          // CRITICAL: Strictly isolate Advisors. They only see their own rows.
          if (!role || role === 'advisor' || role === 'viewer') {
              return r.user_id === userId || r.data.advisorId === userId || r.data._ownerId === userId;
          }

          // Managers and Directors see leads in their local cache.
          // Note: pullFromCloud ensures only authorized leads enter the cache via RLS.
          return true;
      });
      return filteredRecords.map(r => {
            const raw = r.data as Client;
            return {
              ...raw,
              id: r.id,
              profile: raw.profile || { name: 'Unnamed' },
              followUp: raw.followUp || { status: 'new' as ContactStatus }
            } as Client;
          });
  },

  saveClient: async (client: Client, userId: string, causality?: SyncCausality) => {
    const finalCausality = causality || { owner: 'UI' as const, module: 'DB', reason: 'Local Save' };
    const now = new Date().toISOString();
    const updatedClient = { ...client, lastUpdated: now };
    
    await dbStore.clients.put({ id: client.id, user_id: userId, data: updatedClient, updated_at: now });
    await dbStore.outbox.put({ id: client.id, userId: userId, data: updatedClient, queuedAt: Date.now() });
    
    syncInspector.log('info', 'LOCAL_WRITE', `Saved ${client.id} locally`, finalCausality);
    
    db.scheduleFlush(finalCausality.reason);

    setTimeout(async () => {
        const count = await dbStore.outbox.count();
        if (count > 0 && document.visibilityState === 'visible' && !_isFlushing && !_syncTimer && !_retryTimer) {
            syncInspector.checkInvariant(false, 'SYNC_INVARIANT_VIOLATION', 'Orphaned outbox after write (No timer active)', finalCausality);
            db.scheduleFlush('Watchdog Repair');
        }
    }, 0);
    
    return updatedClient;
  }
};

// --- GLOBAL LIFECYCLE OBSERVERS ---
if (typeof window !== 'undefined') {
    const handleGlobalResume = (e: Event) => {
        db.notifyResume(`global_${e.type}`);
    };
    window.addEventListener('focus', handleGlobalResume);
    window.addEventListener('pageshow', handleGlobalResume);
    
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            db.notifyResume('global_visibility');
        } else {
            // NEW: Abort flush immediately on background to prevent zombie promises
            if (_isFlushing && _activeAbort) {
                syncInspector.log('warn', 'FLUSH_ABORTED', 'App backgrounded. Aborting active flush.', { owner: 'Lifecycle', module: 'db.ts', reason: 'app_hidden' });
                _activeAbort.abort();
            }
        }
    });
}

export const DB_KEYS = {
  TOKEN_CACHE: 'sproutly_auth_token_cache'
};