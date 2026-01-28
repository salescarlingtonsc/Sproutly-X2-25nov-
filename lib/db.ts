import { supabase } from './supabase';
import { Client } from '../types';
import { syncInspector, SyncCausality } from './syncInspector';
import Dexie, { type EntityTable } from 'dexie';

console.log("🚀 Sproutly DB v24.0: Bi-Directional Orchestrator");

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
let _syncTimer: any = null;
let _syncTimerSetAt = 0;
let _currentScheduledReason = '';
let _activeAbort: AbortController | null = null;
let _lastFailureTime = 0;
let _backoffIdx = 0;

const BACKOFF_SCHEDULE = [2000, 5000, 10000, 30000, 60000, 120000, 300000];
const FAILURE_COOLDOWN_MS = 10000;

// Unified Visibility Listener
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', async () => {
    const visibility = document.visibilityState;
    if (visibility === 'visible') {
        const qCount = await dbStore.outbox.count();
        syncInspector.log('info', 'RESUME_START', `Visibility change: visible. Pending: ${_pendingFlush}, Queue: ${qCount}`, {
            owner: 'Lifecycle',
            module: 'lib/db.ts',
            reason: 'visibility_visible'
        });

        if (_pendingFlush || qCount > 0) {
            db.scheduleFlush('recovery_visibility_visible');
        }
    }
  });
}

/**
 * INTERNAL: Stability Gate
 */
async function passStabilityGate(causality: SyncCausality): Promise<{ ok: boolean; reason: string }> {
  if (!navigator.onLine) return { ok: false, reason: 'offline' };

  const timeSinceFailure = Date.now() - _lastFailureTime;
  if (timeSinceFailure < FAILURE_COOLDOWN_MS) {
    return { ok: false, reason: 'cooling_down' };
  }

  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return { ok: false, reason: 'no_session' };
  }

  return { ok: true, reason: '' };
}

/**
 * HARDENED SYNC ENGINE
 */
async function executeInternalFlush(userId: string, causality: SyncCausality): Promise<void> {
  const moduleTag = 'lib/db.ts:Orchestrator';
  const finalCausality = { ...causality, module: moduleTag };

  const qCountAtStart = await dbStore.outbox.count();
  const { data: sessionCheck } = await supabase!.auth.getSession();
  syncInspector.log('info', 'FLUSH_START', `Starting sync cycle. Queue: ${qCountAtStart}`, finalCausality, {
      queueCount: qCountAtStart,
      visibility: document.visibilityState,
      online: navigator.onLine,
      hasSession: !!sessionCheck.session
  });

  const gate = await passStabilityGate(finalCausality);
  if (!gate.ok) {
    syncInspector.log('info', 'GATE_BLOCKED', `Execution halted: ${gate.reason}`, finalCausality, {
        gateReason: gate.reason,
        visibility: document.visibilityState,
        online: navigator.onLine
    });
    return;
  }

  if (_isFlushing && _activeAbort) {
    syncInspector.log('info', 'FLUSH_ABORTED', `Yielding active session for: ${causality.reason}`, finalCausality);
    _activeAbort.abort();
  }

  _isFlushing = true;
  _pendingFlush = false; 
  _activeAbort = new AbortController();

  let errorOccurred: any = null;
  let totalProcessed = 0;

  try {
    while (!_activeAbort.signal.aborted) {
      const queue = await dbStore.outbox.orderBy('queuedAt').toArray();
      if (queue.length === 0) break;
      if (!navigator.onLine) break;

      const batch = queue.slice(0, 50);
      const payload = batch.map(item => ({
        id: item.id,
        user_id: item.userId,
        data: item.data,
        updated_at: item.data.lastUpdated
      }));

      syncInspector.log('info', 'UPSERT_START', `Attempting upsert. Count: ${payload.length}, Primary ID: ${payload[0].id}`, finalCausality, {
          id: payload[0].id,
          batchSize: payload.length
      });

      const UPSERT_TIMEOUT = 12000;
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT: Network driver non-responsive')), UPSERT_TIMEOUT)
      );

      try {
        const { error } = await Promise.race([
          supabase!.from('clients').upsert(payload, { onConflict: 'id' }).abortSignal(_activeAbort.signal),
          timeoutPromise
        ]) as any;

        if (error) throw error;

        await dbStore.outbox.bulkDelete(batch.map(b => b.id));
        totalProcessed += payload.length;
        _backoffIdx = 0; 
        
        syncInspector.log('success', 'UPSERT_OK', `Upsert successful for ID: ${payload[0].id}`, finalCausality, { id: payload[0].id });

      } catch (innerErr: any) {
        syncInspector.log('error', 'UPSERT_ERR', `Upsert failed for ID: ${payload[0].id}. Error: ${innerErr.message || innerErr.name}`, finalCausality, {
            id: payload[0].id,
            name: innerErr.name,
            message: innerErr.message,
            code: innerErr.code
        });
        
        const isNetworkHang = innerErr.message?.includes('TIMEOUT') || innerErr.name === 'AbortError' || innerErr.message?.includes('fetch');
        if (isNetworkHang) {
            errorOccurred = innerErr;
            _lastFailureTime = Date.now();
            const delay = BACKOFF_SCHEDULE[_backoffIdx];
            const jitter = Math.random() * 1000;
            _backoffIdx = Math.min(_backoffIdx + 1, BACKOFF_SCHEDULE.length - 1);
            db.scheduleFlush('Stability Retry Loop'); 
            break; 
        }
        throw innerErr; 
      }
      if (queue.length <= 50) break;
    }
  } catch (e: any) {
    errorOccurred = e;
  } finally {
    _isFlushing = false;
    _activeAbort = null;
    const remaining = await dbStore.outbox.count();
    
    syncInspector.log(
      errorOccurred ? 'error' : 'success',
      'FLUSH_END',
      `Sync cycle terminal. Processed: ${totalProcessed}, Remaining: ${remaining}`,
      finalCausality,
      { ok: !errorOccurred, processed: totalProcessed, remaining }
    );
    window.dispatchEvent(new CustomEvent('sproutly:data_synced'));
  }
}

export const db = {
  generateUuid: () => crypto.randomUUID(),
  isValidUuid: (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  updateTokenCache: (token: string) => localStorage.setItem(DB_KEYS.TOKEN_CACHE, token),
  isFlushing: () => _isFlushing,
  getQueueCount: () => dbStore.outbox.count(),
  
  resetLocks: () => { 
      if (_activeAbort) _activeAbort.abort();
      _isFlushing = false; 
      _pendingFlush = false;
      _lastFailureTime = 0;
      _backoffIdx = 0;
      if (_syncTimer) clearTimeout(_syncTimer);
      _syncTimer = null;
  },

  /**
   * INBOUND SYNC: Restores missing leads from cloud.
   */
  pullFromCloud: async () => {
    if (!supabase || !navigator.onLine) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    syncInspector.log('info', 'INIT', "Restoring leads from cloud...", { owner: 'Orchestrator', module: 'lib/db.ts', reason: 'cloud_restore' });

    try {
        const { data, error } = await supabase.from('clients').select('*');
        if (error) throw error;
        if (!data) return;

        // Resolve local pending changes to avoid overwriting work in progress
        const outboxIds = new Set((await dbStore.outbox.toArray()).map(o => o.id));

        const recordsToUpdate: DBClient[] = data
            .filter(row => !outboxIds.has(row.id)) // Respect local overrides
            .map(row => ({
                id: row.id,
                user_id: row.user_id,
                data: row.data as Client,
                updated_at: row.updated_at
            }));

        if (recordsToUpdate.length > 0) {
            await dbStore.clients.bulkPut(recordsToUpdate);
            syncInspector.log('success', 'INIT', `Restored ${recordsToUpdate.length} leads from cloud.`, { owner: 'Orchestrator', module: 'lib/db.ts', reason: 'cloud_restore' });
            window.dispatchEvent(new CustomEvent('sproutly:data_synced'));
        }
    } catch (e: any) {
        syncInspector.log('error', 'CLOUD_ERR', `Cloud restore failed: ${e.message}`, { owner: 'Orchestrator', module: 'lib/db.ts', reason: 'cloud_restore' });
    }
  },

  scheduleFlush: (reason: string) => {
    const finalCausality = { owner: 'Orchestrator' as const, module: 'lib/db.ts', reason };

    if (_syncTimer) {
        syncInspector.log('info', 'FLUSH_CANCELLED_BY_DEDUPE', `Dedupe: Preempting [${_currentScheduledReason}] with [${reason}]`, finalCausality);
        clearTimeout(_syncTimer);
    }

    _currentScheduledReason = reason;
    _syncTimerSetAt = Date.now();
    
    const delay = (reason.includes('Watchdog') || reason.includes('recovery') || reason.includes('Retry')) ? 0 : 1500;

    syncInspector.log('info', 'SCHEDULE_FLUSH_SET', `Timer set for: ${reason} (delay: ${delay}ms)`, finalCausality);

    _syncTimer = setTimeout(async () => {
      const executingReason = reason;
      _syncTimer = null;
      _currentScheduledReason = '';
      
      syncInspector.log('info', 'SCHEDULE_FLUSH_FIRE', `Timer callback executing for: ${executingReason}`, finalCausality);

      let qCount = 0;
      let online = false;
      let visibility = 'hidden';
      let hasSession = false;
      let currentIsFlushing = _isFlushing;
      let sessionData: any = null;

      try {
          qCount = await dbStore.outbox.count();
          online = navigator.onLine;
          visibility = document.visibilityState;
          const { data } = await supabase!.auth.getSession();
          sessionData = data;
          hasSession = !!data.session;
      } catch (e: any) {
          syncInspector.log('error', 'FLUSH_SKIPPED', `Snapshot capture failed: ${e.message}`, finalCausality, { skipReason: 'snapshot_error' });
          return;
      }

      syncInspector.log('info', 'CALL_FLUSH', `Invoking flush check for: ${executingReason}`, finalCausality, {
          executingReason,
          visibility,
          online,
          hasSession,
          isFlushing: currentIsFlushing,
          queueCount: qCount
      });
      
      if (qCount === 0) {
          syncInspector.log('info', 'FLUSH_SKIPPED', 'Queue empty.', finalCausality, { skipReason: 'queue_empty', visibility, online, hasSession });
          return;
      }

      if (!online) {
          syncInspector.log('info', 'FLUSH_SKIPPED', 'Offline.', finalCausality, { skipReason: 'offline', visibility, online, hasSession });
          return;
      }

      if (visibility !== 'visible') {
          _pendingFlush = true;
          syncInspector.log('info', 'FLUSH_SKIPPED', 'Not visible.', finalCausality, { skipReason: 'not_visible', visibility, online, hasSession });
          return;
      }

      if (!hasSession) {
          syncInspector.log('info', 'FLUSH_SKIPPED', 'No auth session.', finalCausality, { skipReason: 'no_session', visibility, online, hasSession });
          return;
      }

      if (currentIsFlushing) {
          syncInspector.log('info', 'FLUSH_SKIPPED', 'Already flushing.', finalCausality, { skipReason: 'already_flushing', visibility, online, hasSession });
          return;
      }

      executeInternalFlush(sessionData.session.user.id, finalCausality).catch(e => {
          console.error("Flush Process Crashed:", e);
          syncInspector.log('critical', 'UPSERT_ERR', `Fatal Orchestrator Crash: ${e.message}`, finalCausality);
      });
    }, delay);
  },

  requestFlush: (userId: string, causality: SyncCausality) => {
    db.scheduleFlush(causality.reason);
  },

  createClientsBulk: async (clients: Client[], userId: string) => {
    const records = clients.map(c => ({
      id: c.id,
      user_id: userId,
      data: c,
      updated_at: c.lastUpdated || new Date().toISOString()
    }));
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

  getClients: async (_userId?: string) => {
      const records = await dbStore.clients.toArray();
      return records.map(r => ({ ...r.data, id: r.id }));
  },

  saveClient: async (client: Client, userId?: string, causality?: SyncCausality) => {
    const finalCausality = causality || { owner: 'UI' as const, module: 'DB', reason: 'Local Save' };
    const now = new Date().toISOString();
    const updatedClient = { ...client, lastUpdated: now };
    const finalUserId = userId || 'anonymous';

    await dbStore.clients.put({ id: client.id, user_id: finalUserId, data: updatedClient, updated_at: now });
    await dbStore.outbox.put({ id: client.id, userId: finalUserId, data: updatedClient, queuedAt: Date.now() });
    
    const count = await dbStore.outbox.count();
    syncInspector.log('info', 'OUTBOX_ENQUEUE', `Dossier committed to durability layer. ID: ${client.id}, Queue: ${count}`, finalCausality, { queueCount: count, id: client.id });
    
    db.scheduleFlush(finalCausality.reason);
    return updatedClient;
  }
};

export const DB_KEYS = {
  CLIENTS: 'sproutly_clients_v2',
  OUTBOX: 'sproutly_outbox_v1',
  TOKEN_CACHE: 'sproutly_auth_token_cache'
};