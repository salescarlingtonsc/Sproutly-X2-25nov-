
import { supabase, SUPABASE_URL } from './supabase';
import { Client, ContactStatus, Profile, UserRole } from '../types';
import { syncInspector, SyncCausality } from './syncInspector';
import Dexie, { type EntityTable } from 'dexie';

console.log(`🚀 Sproutly DB v24.44: Initial Load Safety Engaged`);

// --- DEXIE (THE OUTBOX) ---
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

// --- SYNC ORCHESTRATOR STATE ---
let _isFlushing = false;
let _syncTimer: any = null;
let _activeAbort: AbortController | null = null;
let _backoffIdx = 0;
let _currentScheduledReason = '';

const BASE_TIMEOUT_MS = 30000;

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
  if (_isFlushing) return; 

  _isFlushing = true;
  _activeAbort = new AbortController();
  
  const finalCausality = { ...causality, module: 'lib/db.ts:Flush' };
  syncInspector.log('info', 'FLUSH_START', `Initiating Cloud Handshake...`, finalCausality);

  try {
    let hasMore = true;
    while (hasMore && _activeAbort && !_activeAbort.signal.aborted) {
      const candidates = await dbStore.outbox.orderBy('queuedAt').limit(20).toArray();
      const totalQueue = await dbStore.outbox.count();
      syncInspector.updateQueueCount(totalQueue);
      
      if (candidates.length === 0) {
        hasMore = false;
        break;
      }

      if (!navigator.onLine) {
        syncInspector.log('warn', 'GATE_BLOCKED', 'Network offline. Pausing sync.', finalCausality);
        break;
      }

      const payload = candidates.map(item => ({
        id: item.id,
        user_id: item.userId,
        org_id: item.orgId || item.data.organizationId || 'org_default',
        data: item.data,
        updated_at: item.data.lastUpdated || new Date().toISOString()
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
        syncInspector.log('success', 'UPSERT_RESULT', `Pushed ${candidates.length} records to Cloud.`, finalCausality);
        _backoffIdx = 0; 
        
      } catch (innerErr: any) {
        syncInspector.log('error', 'UPSERT_ERR', `Cloud rejected save: ${innerErr.message}`, finalCausality);
        _backoffIdx++;
        break; 
      }
    }
  } catch (e: any) {
     console.error("Flush Engine Failure:", e);
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
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
    } catch (e) {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },

  isValidUuid: (id: string) => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  },

  updateTokenCache: (token: string) => localStorage.setItem('sproutly_auth_token_cache', token),
  
  notifyResume: (source: string) => {
     db.scheduleFlush(`resume_${source}`);
  },

  getQueueCount: () => dbStore.outbox.count(),

  pullFromCloud: async () => {
    if (!supabase || !navigator.onLine) return;
    try {
        const { data, error } = await supabase.from('clients').select('*').limit(2000);
        if (error) {
            // Identify common "Missing Table" or "Recursion" errors specifically
            if (error.code === '42P01') {
                console.warn("Table 'clients' not found in Supabase. Check schema.");
            } else {
                console.warn("Initial Cloud Pull Error:", error.message);
            }
            return;
        }
        
        if (!data) return;
        
        const records: DBClient[] = data.map((row: any) => ({ 
            id: row.id, 
            user_id: row.user_id, 
            org_id: row.org_id, 
            data: {
                ...row.data,
                id: row.id,
                organizationId: row.org_id || row.data.organizationId
            } as Client, 
            updated_at: row.updated_at 
        }));
        
        if (records.length > 0) {
            await dbStore.clients.bulkPut(records);
            window.dispatchEvent(new CustomEvent('sproutly:data_synced'));
            console.log(`Synced ${records.length} records from Cloud.`);
        }
    } catch (e) {
        console.error("Sync Protocol Failure:", e);
    }
  },

  scheduleFlush: async (reason: string) => {
    _currentScheduledReason = reason;
    const causality: SyncCausality = { owner: 'Orchestrator', module: 'lib/db.ts', reason };
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(async () => {
      _syncTimer = null;
      if (_isFlushing || document.visibilityState === 'hidden') return;
      try {
          const { data: { session } } = await supabase!.auth.getSession();
          if (session?.user) await executeInternalFlush(session.user.id, causality);
      } catch (e) {}
    }, 1500);
  },

  requestFlush: (userId: string, causality: SyncCausality) => {
    db.scheduleFlush(causality.reason);
  },

  createClientsBulk: async (clients: Client[], targetAdvisorId: string) => {
    const now = new Date().toISOString();
    let orgId = 'org_default';
    
    try {
        const { data: profile } = await supabase!.from('profiles').select('organization_id').eq('id', targetAdvisorId).single();
        if (profile?.organization_id) orgId = profile.organization_id;
    } catch (e) {}

    const records = clients.map(c => ({ 
        id: db.isValidUuid(c.id) ? c.id : db.generateUuid(), 
        user_id: targetAdvisorId, 
        org_id: orgId,
        data: { ...c, organizationId: orgId, advisorId: targetAdvisorId, lastUpdated: now }, 
        updated_at: now 
    }));

    await dbStore.clients.bulkPut(records);
    
    const payload = records.map(r => ({ id: r.id, user_id: r.user_id, org_id: r.org_id, data: r.data, updated_at: r.updated_at }));
    const { error } = await supabase!.from('clients').upsert(payload, { onConflict: 'id' });
    
    if (error) {
        const outboxItems = records.map(r => ({ id: r.id, userId: targetAdvisorId, orgId: r.org_id, data: r.data, queuedAt: Date.now() }));
        await dbStore.outbox.bulkPut(outboxItems);
        throw error;
    }
  },

  deleteClient: async (id: string) => {
    await dbStore.clients.delete(id);
    await dbStore.outbox.delete(id);
    if (supabase) await supabase.from('clients').delete().eq('id', id);
  },

  transferOwnership: async (clientId: string, newOwnerId: string) => {
    if (!supabase) return;
    try {
        const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', newOwnerId).single();
        const { error } = await supabase.from('clients').update({ user_id: newOwnerId, org_id: profile?.organization_id || 'org_default' }).eq('id', clientId);
        if (error) throw error;
    } catch (e) {
        throw e;
    }
  },

  getClients: async (userId: string, role?: UserRole): Promise<Client[]> => {
      try {
          const records = await dbStore.clients.toArray();
          const filtered = records.filter(r => {
              if (!r?.data) return false;
              if (!role || role === 'advisor' || role === 'viewer') {
                  return r.user_id === userId || r.data.advisorId === userId || r.data._ownerId === userId;
              }
              return true;
          });
          return filtered.map(r => r.data);
      } catch (e) {
          return [];
      }
  },

  getOrchestratorState: () => ({
    isFlushing: _isFlushing,
    hasTimer: !!_syncTimer,
    backoffIdx: _backoffIdx,
    reason: _currentScheduledReason
  }),

  saveClientDirectly: async (client: Client, userId: string): Promise<Client> => {
    const now = new Date().toISOString();
    const finalId = db.isValidUuid(client.id) ? client.id : db.generateUuid();
    
    let orgId = client.organizationId || 'org_default';
    try {
        const { data: profile } = await supabase!.from('profiles').select('organization_id').eq('id', userId).single();
        if (profile?.organization_id) orgId = profile.organization_id;
    } catch (e) {}

    const updatedClient = { ...client, id: finalId, lastUpdated: now, organizationId: orgId };
    await dbStore.clients.put({ id: finalId, user_id: userId, org_id: orgId, data: updatedClient, updated_at: now });
    
    if (navigator.onLine) {
        const { error } = await supabase!
            .from('clients')
            .upsert({ id: finalId, user_id: userId, org_id: orgId, data: updatedClient, updated_at: now }, { onConflict: 'id' });

        if (error) {
            await dbStore.outbox.put({ id: finalId, userId, orgId: orgId, data: updatedClient, queuedAt: Date.now() });
            throw error;
        }
    } else {
        await dbStore.outbox.put({ id: finalId, userId, orgId: orgId, data: updatedClient, queuedAt: Date.now() });
    }

    return updatedClient;
  },

  saveClient: async (client: Client, userId: string, causality?: SyncCausality) => {
    const now = new Date().toISOString();
    const finalId = db.isValidUuid(client.id) ? client.id : db.generateUuid();
    
    const existing = await dbStore.clients.get(finalId);
    const orgId = existing?.org_id || client.organizationId || 'org_default';

    const updatedClient = { ...client, id: finalId, lastUpdated: now, organizationId: orgId };
    
    await dbStore.clients.put({ id: finalId, user_id: userId, org_id: orgId, data: updatedClient, updated_at: now });
    await dbStore.outbox.put({ id: finalId, userId, org_id: orgId, data: updatedClient, queuedAt: Date.now() });
    db.scheduleFlush(causality?.reason || 'Local Edit');
    return updatedClient;
  }
};
