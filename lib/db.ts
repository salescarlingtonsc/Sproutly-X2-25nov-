
import { supabase } from './supabase';
import { Client } from '../types';
import { syncInspector, SyncCausality } from './syncInspector';
import Dexie, { type EntityTable } from 'dexie';

interface DBClient {
  id: string;
  user_id: string;
  org_id?: string;
  data: Client;
  updated_at: string;
}

interface OutboxItem {
  id: string;
  userId: string;
  orgId?: string;
  data: Client;
  queuedAt: number;
}

const dbStore = new Dexie('SproutlyQuantumDB') as Dexie & {
  clients: EntityTable<DBClient, 'id'>;
  outbox: EntityTable<OutboxItem, 'id'>;
};

dbStore.version(2).stores({
  clients: 'id, user_id, org_id, updated_at',
  outbox: 'id, userId, queuedAt'
});

// --- CONCURRENCY CONTROL ---
let _isFlushing = false;
let _lastFlushPulse = 0;
let _syncTimer: any = null;
let _activeAbort: AbortController | null = null;
let _backoffIdx = 0;

const BASE_TIMEOUT_MS = 35000; 
const LOCK_TIMEOUT_MS = 45000; // 45s silence = Zombie Lock

const withTimeout = <T>(promise: PromiseLike<T>, ms: number, label: string, abortController?: AbortController): Promise<T> => {
    let timer: any;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            if (abortController) abortController.abort();
            reject(new Error(`TIMEOUT_HARD: ${label} (${ms}ms)`));
        }, ms);
    });
    return Promise.race([
        Promise.resolve(promise).finally(() => clearTimeout(timer)),
        timeout
    ]);
};

async function executeInternalFlush(userId: string, causality: SyncCausality): Promise<void> {
  const now = Date.now();
  
  // ZOMBIE LOCK BREAKER
  if (_isFlushing && (now - _lastFlushPulse > LOCK_TIMEOUT_MS)) {
      syncInspector.log('warn', 'LOCKED', 'Zombie lock detected. Breaking...', causality);
      _isFlushing = false;
      if (_activeAbort) _activeAbort.abort("Zombie Lock Breaker");
  }

  if (_isFlushing) {
    syncInspector.log('info', 'FLUSH_SKIPPED', 'Sync active. Queuing signal.', causality);
    return;
  }

  _isFlushing = true;
  _lastFlushPulse = Date.now();
  _activeAbort = new AbortController();
  
  syncInspector.log('info', 'FLUSH_START', `Uplink Handshake: ${causality.reason}`, causality);

  try {
    let hasMore = true;
    while (hasMore && _activeAbort && !_activeAbort.signal.aborted) {
      _lastFlushPulse = Date.now(); 
      
      const candidates = await dbStore.outbox.orderBy('queuedAt').limit(10).toArray();
      const totalQueue = await dbStore.outbox.count();
      syncInspector.updateQueueCount(totalQueue);
      
      if (candidates.length === 0) {
        hasMore = false;
        break;
      }

      if (!navigator.onLine) {
        syncInspector.log('warn', 'GATE_BLOCKED', 'Network radio down. Suspending outbox.', causality);
        break;
      }

      const payload = candidates.map(item => ({
        id: item.id,
        user_id: item.userId,
        org_id: item.orgId || 'org_default',
        data: item.data,
        updated_at: new Date().toISOString()
      }));

      try {
        const { error: upsertError } = await withTimeout<any>(
            supabase!
                .from('clients')
                .upsert(payload, { onConflict: 'id' })
                .abortSignal(_activeAbort.signal),
            BASE_TIMEOUT_MS, 
            'Cloud Upsert',
            _activeAbort
        );

        if (upsertError) throw upsertError;
        
        await dbStore.outbox.bulkDelete(candidates.map(b => b.id));
        syncInspector.log('success', 'UPSERT_RESULT', `Pushed ${candidates.length} records.`, causality);
        _backoffIdx = 0; 
        
      } catch (innerErr: any) {
        const isAbort = innerErr.name === 'AbortError' || innerErr.message?.includes('aborted');
        
        if (isAbort) {
            syncInspector.log('warn', 'NETWORK_ABORT', 'Lifecycle Interruption (App Switch).', causality);
            break; 
        }
        
        syncInspector.log('error', 'UPSERT_ERR', `Sync Blocked: ${innerErr.message}`, causality);
        _backoffIdx++;
        break; 
      }
    }
  } catch (e: any) {
     console.error("Critical Sync Failure:", e);
  } finally {
    _isFlushing = false;
    _activeAbort = null;
    const finalCount = await dbStore.outbox.count();
    syncInspector.updateQueueCount(finalCount);
    window.dispatchEvent(new CustomEvent('sproutly:data_synced'));
  }
}

export const db = {
  generateUuid: () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  updateTokenCache: (token: string) => { },

  notifyResume: (source: string) => {
    syncInspector.log('info', 'RESUME_EVENT', `Lifecycle Wake: ${source}`, { owner: 'Lifecycle', module: 'DB', reason: source });
    
    const now = Date.now();
    if (_isFlushing && (now - _lastFlushPulse > LOCK_TIMEOUT_MS)) {
         _isFlushing = false;
         if (_activeAbort) _activeAbort.abort("Resume Force Break");
    }

    db.scheduleFlush(`lifecycle_wake_${source}`);
  },

  getQueueCount: async () => await dbStore.outbox.count(),

  getOrchestratorState: () => ({
    isFlushing: _isFlushing,
    lockAge: Date.now() - _lastFlushPulse,
    backoff: _backoffIdx
  }),

  scheduleFlush: (reason: string) => {
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(async () => {
        const { data: { session } } = await supabase!.auth.getSession();
        if (session?.user) {
            executeInternalFlush(session.user.id, { owner: 'Orchestrator', module: 'DB', reason });
        }
    }, 1000); 
  },

  requestFlush: (userId: string, causality: SyncCausality) => {
    executeInternalFlush(userId, causality);
  },

  pullFromCloud: async () => {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    try {
      const { data, error } = await supabase.from('clients').select('*');
      if (error) throw error;
      if (data) {
        const clients = data.map(row => ({
          id: row.id,
          user_id: row.user_id,
          org_id: row.org_id,
          data: row.data,
          updated_at: row.updated_at
        }));
        await dbStore.clients.bulkPut(clients);
        // Successful pull clears any error state
        syncInspector.log('success', 'PULL_RESULT' as any, `Pulled ${data.length} records.`, { owner: 'DataLayer', module: 'DB', reason: 'Pull Success' });
      }
    } catch (e: any) { 
        console.error("Cloud Pull Failed:", e);
        // Flag error state
        syncInspector.log('error', 'CLOUD_ERR', `Pull Failed: ${e.message}`, { owner: 'DataLayer', module: 'DB', reason: 'Initial Pull' });
    }
  },

  getClients: async (userId: string, role?: string) => {
    const clients = await dbStore.clients.toArray();
    return clients.map(c => c.data);
  },

  saveClient: async (client: Client, userId: string, causality: Partial<SyncCausality> = {}) => {
    const now = new Date().toISOString();
    const dbClient: DBClient = {
      id: client.id,
      user_id: userId,
      org_id: client.organizationId,
      data: { ...client, lastUpdated: now },
      updated_at: now
    };
    await dbStore.clients.put(dbClient);
    await dbStore.outbox.put({
      id: client.id,
      userId,
      orgId: client.organizationId,
      data: dbClient.data,
      queuedAt: Date.now()
    });
    db.scheduleFlush(causality.reason || 'Local State Mutation');
    return dbClient.data;
  },

  saveClientDirectly: async (client: Client, userId: string) => {
    return await db.saveClient(client, userId, { reason: 'Manual Force Save' });
  },

  createClientsBulk: async (clients: Client[], userId: string) => {
    for (const client of clients) {
      await db.saveClient(client, userId, { reason: 'Bulk Distribution' });
    }
  },

  deleteClient: async (id: string) => {
    await dbStore.clients.delete(id);
    if (supabase) {
        const { error } = await supabase.from('clients').delete().eq('id', id);
        if (error) console.error("Cloud Purge Failed:", error);
    }
  },

  transferOwnership: async (clientId: string, newOwnerId: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('clients').update({ user_id: newOwnerId }).eq('id', clientId);
    if (error) throw error;
  }
};
