import { supabase, SUPABASE_URL } from './supabase';
import { Client, ContactStatus, Profile, UserRole } from '../types';
import { syncInspector, SyncCausality } from './syncInspector';
import Dexie, { type EntityTable } from 'dexie';

console.log(`🚀 Sproutly DB v24.29: Zombie Lock Breaker`);

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
let _flushWatchdog: any = null;
let _heartbeatTimer: any = null;
let _timerSetAt = 0;
let _currentScheduledReason = '';
let _activeAbort: AbortController | null = null;
let _lastFailureTime = 0;
let _backoffIdx = 0;

// FIX 4: Lifecycle Ring Buffer
const LIFECYCLE_BUFFER_SIZE = 10;
let _lifecycleHistory: { type: string; ts: number }[] = [{ type: 'init', ts: Date.now() }];

const pushLifecycleEvent = (type: string) => {
    const entry = { type, ts: Date.now() };
    _lifecycleHistory.unshift(entry);
    if (_lifecycleHistory.length > LIFECYCLE_BUFFER_SIZE) _lifecycleHistory.pop();
};

// Dynamic Batch Sizing State
let _currentBatchLimit = 50; 

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
const FAILURE_COOLDOWN_MS = 5000;
const TIMER_DELAY_MS = 1500;
const BASE_TIMEOUT_MS = 60000; // Base 60s

// Batching Constants
const MAX_BATCH_BYTES = 250 * 1024; // 250KB Target

const withTimeout = <T>(promise: PromiseLike<T>, ms: number, label: string, abortController?: AbortController): Promise<T> => {
    let timer: any;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            if (abortController) abortController.abort(); // KILL SOCKET ON TIMEOUT
            reject(new Error(`TIMEOUT_HARD: ${label} (${ms}ms)`));
        }, ms);
    });
    return Promise.race([
        Promise.resolve(promise).finally(() => clearTimeout(timer)),
        timeout
    ]);
};

// Helper for jittered backoff
const getNextBackoff = () => {
    const base = BACKOFF_SCHEDULE[_backoffIdx];
    const jitter = 0.8 + Math.random() * 0.4; // 80% to 120% variance
    return Math.floor(base * jitter);
};

// Calculate adaptive timeout based on failure count
const getCurrentTimeoutLimit = (payloadSize: number) => {
    // Standard Adaptive
    let limit = Math.min(120000, BASE_TIMEOUT_MS + (_backoffIdx * 30000));
    
    // HEAVY LIFT EXTENSION: If > 500KB, give it 3 minutes immediately
    if (payloadSize > 500 * 1024) {
        limit = Math.max(limit, 180000); 
    }
    return limit;
};

// FIX 3: Recursive Payload Sanitizer (Aggressive)
const sanitizeLargePayload = (data: any): any => {
    if (typeof data === 'string') {
        // 1. Image Check
        if (data.startsWith('data:image') && data.length > 1024) {
            return `[SYSTEM_PRUNED: Image too large (${(data.length/1024).toFixed(1)}KB)]`;
        }
        // 2. Heavy Media Check (PDF/Audio/Video)
        if ((data.startsWith('data:application') || data.startsWith('data:audio') || data.startsWith('data:video')) && data.length > 1024) {
             return `[SYSTEM_PRUNED: Media too large (${(data.length/1024).toFixed(1)}KB)]`;
        }
        // 3. Absolute Safety Cap (200KB limit for ANY string field)
        // This catches massive text dumps or unrecognized base64
        if (data.length > 200000) {
            return `[SYSTEM_PRUNED: String exceeds 200KB limit (${(data.length/1024).toFixed(1)}KB)] - ${data.substring(0, 100)}...`;
        }
        return data;
    }
    if (Array.isArray(data)) {
        return data.map(sanitizeLargePayload);
    }
    if (typeof data === 'object' && data !== null) {
        const newData: any = {};
        for (const key in data) {
            newData[key] = sanitizeLargePayload(data[key]);
        }
        return newData;
    }
    return data;
};

async function passStabilityGate(causality: SyncCausality): Promise<{ ok: boolean; reason: string }> {
  if (!navigator.onLine) return { ok: false, reason: 'offline' };
  
  // FIX 2: Strict Background Check
  if (document.visibilityState === 'hidden') return { ok: false, reason: 'app_hidden' };
  
  const timeSinceFailure = Date.now() - _lastFailureTime;
  if (timeSinceFailure < FAILURE_COOLDOWN_MS) return { ok: false, reason: 'cooling_down' };
  
  // FIX 4: Warmup check
  const lastVisible = _lifecycleHistory.find(e => e.type === 'visibility_visible');
  if (lastVisible && (Date.now() - lastVisible.ts) < 1000) {
      return { ok: false, reason: 'stability_warmup' }; // Give it 1s to stabilize
  }
  
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
  
  // 1. ARM WATCHDOG (Invariant protection)
  if (_flushWatchdog) clearTimeout(_flushWatchdog);
  _flushWatchdog = setTimeout(() => {
      syncInspector.log('critical', 'TIMER_WATCHDOG_VIOLATION', `Flush cycle hung. Forced unlock.`, finalCausality);
      db.resetLocks(); 
      db.scheduleFlush('recovery_flush_stuck');
  }, 180000); // 3m absolute safety net
  
  syncInspector.log('info', 'FLUSH_START', `Target: ${SUPABASE_URL}`, finalCausality);

  try {
    let hasMore = true;
    while (hasMore && _activeAbort && !_activeAbort.signal.aborted) {
      // Re-check background state at batch level
      if (document.visibilityState === 'hidden') {
          throw new Error("ABORT_BACKGROUND: Pre-emptive batch abort");
      }

      const candidates = await dbStore.outbox.orderBy('queuedAt').limit(_currentBatchLimit).toArray();
      const totalQueue = await dbStore.outbox.count();
      syncInspector.updateQueueCount(totalQueue);
      
      if (candidates.length === 0) {
        hasMore = false;
        break;
      }

      if (!navigator.onLine) break;

      const batch: OutboxItem[] = [];
      let currentBatchSize = 0;

      for (const item of candidates) {
          const itemSize = JSON.stringify(item.data).length + 200;
          if (batch.length > 0 && (currentBatchSize + itemSize > MAX_BATCH_BYTES)) {
              break;
          }
          batch.push(item);
          currentBatchSize += itemSize;
      }

      const payload = batch.map(item => ({
        id: item.id,
        user_id: item.userId,
        data: item.data,
        updated_at: item.data.lastUpdated
      }));

      const batchStart = performance.now();
      const rawPayloadSize = JSON.stringify(payload).length;
      
      // FIX 3: Apply Sanitization if huge
      let finalPayload = payload;
      if (rawPayloadSize > 1024 * 1024) { // 1MB Limit
          syncInspector.log('warn', 'TRAFFIC_SHAPING', `Payload ${rawPayloadSize} bytes too large. Sanitizing...`, finalCausality);
          finalPayload = sanitizeLargePayload(payload);
          const newSize = JSON.stringify(finalPayload).length;
          syncInspector.log('info', 'TRAFFIC_SHAPING', `Sanitized size: ${newSize} bytes`, finalCausality);
      }

      const payloadSize = JSON.stringify(finalPayload).length;
      const currentTimeout = getCurrentTimeoutLimit(payloadSize);

      syncInspector.log('info', 'UPSERT_START', `Batch: ${finalPayload.length}, Size: ${payloadSize} bytes, Limit: ${currentTimeout}ms`, finalCausality);

      // --- HEARTBEAT FOR LARGE TRANSFERS ---
      if (_heartbeatTimer) clearInterval(_heartbeatTimer);
      _heartbeatTimer = setInterval(() => {
          const elapsed = ((performance.now() - batchStart) / 1000).toFixed(0);
          syncInspector.log('info', 'TRAFFIC_SHAPING', `Large transfer in progress: ${elapsed}s elapsed...`, finalCausality);
      }, 30000); // Reassure every 30s
      // ------------------------------------

      try {
        const upsertPromise = supabase!
            .from('clients')
            .upsert(finalPayload, { onConflict: 'id', ignoreDuplicates: false })
            .select('id')
            .abortSignal(_activeAbort.signal);

        const { data: upsertData, error: upsertError, status, statusText } = await withTimeout<any>(
            upsertPromise, 
            currentTimeout, 
            'Cloud Upsert',
            _activeAbort // Pass controller to kill socket on timeout
        );

        if (upsertError) throw upsertError;
        
        const duration = (performance.now() - batchStart).toFixed(0);
        syncInspector.log('success', 'UPSERT_RESULT', `Batch Commit: ${duration}ms. Cloud confirmed ${upsertData?.length || 0} records. HTTP ${status} ${statusText || 'OK'}`, finalCausality);

        await dbStore.outbox.bulkDelete(batch.map(b => b.id));
        syncInspector.updateQueueCount(await dbStore.outbox.count()); 
        
        _backoffIdx = 0;
        _currentBatchLimit = Math.min(50, _currentBatchLimit + 10);
        
      } catch (innerErr: any) {
        if (_heartbeatTimer) clearInterval(_heartbeatTimer);
        const isTimeout = innerErr.message?.includes('TIMEOUT_HARD');
        const isAbort = innerErr.name === 'AbortError' || innerErr.message?.includes('aborted') || innerErr.message?.includes('ABORT_BACKGROUND');
        
        if (isAbort) {
            // FIX 4: Correlate with history
            const lastHidden = _lifecycleHistory.find(e => e.type.includes('hidden') || e.type.includes('blur'));
            const timeSinceHidden = lastHidden ? Date.now() - lastHidden.ts : 99999;
            const currentVis = document.visibilityState as string;
            const isBackgrounding = currentVis === 'hidden' || timeSinceHidden < 15000;
            
            if (isBackgrounding) {
                 syncInspector.log('warn', 'SYNC_ABORT_DIAGNOSIS', 'Flush interrupted by background transition', finalCausality, {
                    cause: "app_background_interrupt",
                    visibilityState: currentVis,
                    elapsedMs: (performance.now() - batchStart).toFixed(0),
                    lastLifecycleEvent: _lifecycleHistory[0],
                    timeSinceEvent: timeSinceHidden
                 });
            }
        }
        
        if (isTimeout) {
             syncInspector.log('warn', 'SYNC_ABORT_DIAGNOSIS', 'Timeout due to heavy payload', finalCausality, {
                cause: "payload_too_large",
                sizeBytes: payloadSize,
                limitMs: currentTimeout
             });
        }

        if (isAbort && _activeAbort && (_activeAbort.signal.aborted || innerErr.message?.includes('ABORT_BACKGROUND'))) {
            syncInspector.log('warn', 'FLUSH_ABORTED', `Lifecycle Abort`, finalCausality);
            break;
        } else if (isAbort) {
            syncInspector.log('warn', 'NETWORK_ABORT', `Spurious network reset. Retrying...`, finalCausality);
        }
        
        _lastFailureTime = Date.now();
        _backoffIdx = Math.min(_backoffIdx + 1, BACKOFF_SCHEDULE.length - 1);
        
        if (_currentBatchLimit > 1) {
            _currentBatchLimit = Math.max(1, Math.floor(_currentBatchLimit / 2));
            syncInspector.log('warn', 'TRAFFIC_SHAPING', `Reducing batch size to ${_currentBatchLimit} items`, finalCausality);
        }

        const retryDelay = getNextBackoff();
        syncInspector.log('error', 'UPSERT_ERR', `Retry in ${retryDelay}ms: ${innerErr.message}`, finalCausality);

        if (_retryTimer) clearTimeout(_retryTimer);
        _retryTimer = setTimeout(() => db.scheduleFlush('recovery_after_failure'), retryDelay);
        
        throw innerErr; 
      } finally {
        if (_heartbeatTimer) clearInterval(_heartbeatTimer);
      }
    }
  } catch (e: any) {
     // Errors handled in inner loop
  } finally {
    if (_flushWatchdog) clearTimeout(_flushWatchdog);
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    _flushWatchdog = null;
    _heartbeatTimer = null;
    
    _isFlushing = false;
    _activeAbort = null;
    syncInspector.log('info', 'FLUSH_END', 'Flush session closed', finalCausality);
    
    const finalCount = await dbStore.outbox.count();
    syncInspector.updateQueueCount(finalCount);
    
    window.dispatchEvent(new CustomEvent('sproutly:data_synced'));
  }
}

export const db = {
  generateUuid: () => crypto.randomUUID(),
  isValidUuid: (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  updateTokenCache: (token: string) => localStorage.setItem(DB_KEYS.TOKEN_CACHE, token),
  isFlushing: () => _isFlushing,
  getQueueCount: () => dbStore.outbox.count(),
  
  notifyResume: (source: string) => {
    if (_resumeDebounceTimer) clearTimeout(_resumeDebounceTimer);
    _resumeHandshakePending = true;
    _resumeDebounceTimer = setTimeout(async () => {
        _resumeDebounceTimer = null;
        const qCount = await dbStore.outbox.count();
        if (qCount === 0 && _pendingFlush) {
             _pendingFlush = false;
             syncInspector.updateQueueCount(0); 
        }
        if (qCount > 0 && !_isFlushing) db.scheduleFlush(`recovery_${source}`);
    }, 500); 
  },

  getOrchestratorState: () => ({
    isFlushing: _isFlushing,
    pendingFlush: _pendingFlush,
    hasActiveTimer: !!_syncTimer,
    timerSetAt: _timerSetAt,
    lastReason: _currentScheduledReason,
    resumeHandshakePending: _resumeHandshakePending
  }),

  resetLocks: () => { 
      if (_activeAbort) _activeAbort.abort();
      if (_flushWatchdog) clearTimeout(_flushWatchdog);
      if (_heartbeatTimer) clearInterval(_heartbeatTimer);
      _flushWatchdog = null;
      _heartbeatTimer = null;
      
      _isFlushing = false; 
      _pendingFlush = false;
      _resumeHandshakePending = false;
      _lastFailureTime = 0;
      if (_syncTimer) clearTimeout(_syncTimer);
      if (_retryTimer) clearTimeout(_retryTimer);
      _syncTimer = null;
      _retryTimer = null;
      _timerSetAt = 0;
      syncInspector.updateQueueCount(0);
  },

  pullFromCloud: async () => {
    if (!supabase || !navigator.onLine) return;
    try {
        const { data, error } = await withTimeout<any>(
            supabase.from('clients').select('*'),
            BASE_TIMEOUT_MS,
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

  scheduleFlush: async (reason: string) => {
    const causality: SyncCausality = { owner: 'Orchestrator', module: 'lib/db.ts', reason };
    
    const count = await dbStore.outbox.count();
    syncInspector.updateQueueCount(count);

    if (count === 0 && !reason.includes('Repro')) {
        _pendingFlush = false;
        syncInspector.updateQueueCount(0);
        return;
    }

    const isPriority = reason.startsWith('recovery_') || reason === 'Immediate' || reason === 'Resume Priority Sync';
    
    _pendingFlush = true; 
    const delay = isPriority ? 0 : TIMER_DELAY_MS;

    if (_syncTimer) {
      if (!isPriority) return;
      clearTimeout(_syncTimer);
    }
    
    _currentScheduledReason = reason;
    _timerSetAt = Date.now();
    syncInspector.log('info', 'SCHEDULE_FLUSH_SET', `Timer: ${reason} (${delay}ms)`, causality);

    _syncTimer = setTimeout(async () => {
      _syncTimer = null;
      _timerSetAt = 0;

      try {
        const count = await dbStore.outbox.count();
        if (count === 0 && !reason.includes('Repro')) {
          _pendingFlush = false;
          syncInspector.updateQueueCount(0);
          return;
        }

        if (_isFlushing) return;

        const gate = await passStabilityGate(causality);
        if (!gate.ok) {
          syncInspector.log('warn', 'GATE_BLOCKED', `Blocked: ${gate.reason}`, causality);
          return;
        }

        let validUserId = _cachedUserId;

        if (!validUserId) {
            try {
                const sessionPromise = supabase!.auth.getSession();
                const result = await withTimeout<any>(sessionPromise, 2500, 'Auth Check');
                if (result.error) throw result.error;
                validUserId = result.data?.session?.user?.id || null;
                if (validUserId) _cachedUserId = validUserId;
            } catch (authErr: any) {
                if (_retryTimer) clearTimeout(_retryTimer);
                _retryTimer = setTimeout(() => db.scheduleFlush('recovery_session_failed'), 1000);
                return;
            }
        }

        if (validUserId) {
          await executeInternalFlush(validUserId, causality);
        }

      } catch (e: any) {
        syncInspector.log('error', 'CLOUD_ERR', `Crashed: ${e.message}`, causality);
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
          if (!role || role === 'advisor' || role === 'viewer') {
              return r.user_id === userId || r.data.advisorId === userId || r.data._ownerId === userId;
          }
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
    
    db.scheduleFlush(finalCausality.reason);
    return updatedClient;
  }
};

// --- GLOBAL LIFECYCLE OBSERVERS ---
if (typeof window !== 'undefined') {
    const handleGlobalResume = (e: Event) => {
        pushLifecycleEvent(`resume_${e.type}`);
        
        // ZOMBIE LOCK CHECK
        if (_isFlushing) {
             syncInspector.log('warn', 'SYNC_ABORT_DIAGNOSIS', 'Found stale lock on resume. Force clearing.', { owner: 'Lifecycle', module: 'db.ts', reason: 'zombie_check' });
             db.resetLocks(); // Nuclear reset on resume to be safe
        }
        
        syncInspector.log('info', 'RESUME_EVENT', `App Resumed: ${e.type}`, { owner: 'Lifecycle', module: 'db.ts', reason: e.type });
        db.notifyResume(`global_${e.type}`);
    };
    
    window.addEventListener('focus', handleGlobalResume);
    window.addEventListener('pageshow', handleGlobalResume);
    
    document.addEventListener('visibilitychange', () => {
        const state = document.visibilityState;
        pushLifecycleEvent(`visibility_${state}`);
        
        if (state === 'hidden') {
             syncInspector.log('info', 'APP_HIDDEN', 'App backgrounded', { owner: 'Lifecycle', module: 'db.ts', reason: 'visibility_hidden' });
             
             // FORCE ABORT ON HIDE
             // This prevents the "stuck lock" issue where a promise hangs in the background forever.
             if (_isFlushing || _activeAbort) {
                 syncInspector.log('warn', 'FLUSH_ABORTED', 'Force aborting flush due to backgrounding', { owner: 'Lifecycle', module: 'db.ts', reason: 'background_force_abort' });
                 if (_activeAbort) _activeAbort.abort();
                 _isFlushing = false;
                 _activeAbort = null;
             }
             
        } else if (state === 'visible') {
             syncInspector.log('info', 'APP_VISIBLE', 'App foregrounded', { owner: 'Lifecycle', module: 'db.ts', reason: 'visibility_visible' });
             // Check for zombies again on visibility restore
             if (_isFlushing) {
                 syncInspector.log('warn', 'SYNC_ABORT_DIAGNOSIS', 'Found stale lock on visible. Force clearing.', { owner: 'Lifecycle', module: 'db.ts', reason: 'zombie_check_visible' });
                 db.resetLocks();
             }
             db.notifyResume('global_visibility');
        }
    });
}

export const DB_KEYS = {
  TOKEN_CACHE: 'sproutly_auth_token_cache'
};