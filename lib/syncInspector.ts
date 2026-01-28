import { supabase } from './supabase';

export type SyncLogLevel = 'info' | 'success' | 'warn' | 'error' | 'critical' | 'violation';

export interface SyncCausality {
  owner: 'Orchestrator' | 'DataLayer' | 'Lifecycle' | 'UI';
  module: string;
  reason: string;
  stack?: string;
}

export type SyncLogCode = 
  | 'INIT' 
  | 'LOCAL_WRITE' 
  | 'OUTBOX_ENQUEUE' 
  | 'SCHEDULE_FLUSH'
  | 'SCHEDULE_FLUSH_SET'
  | 'SCHEDULE_FLUSH_FIRE'
  | 'SCHEDULE_FLUSH_REPLACED'
  | 'FLUSH_CANCELLED_BY_DEDUPE'
  | 'CALL_FLUSH'
  | 'FLUSH_START'
  | 'FLUSH_END'
  | 'FLUSH_ABORTED'
  | 'FLUSH_SKIPPED'
  | 'GATE_BLOCKED'
  | 'LOCKED'
  | 'AUTH_CHECK'
  | 'CLOUD_ERR'
  | 'AUTH_OK'
  | 'AUTH_ERR'
  | 'AUTH_PENDING'
  | 'STATE_MACHINE_VIOLATION'
  | 'UPSERT_START'
  | 'UPSERT_OK'
  | 'UPSERT_ERR'
  | 'RECOVERY_TRIGGER'
  | 'RESUME_START'
  | 'RESUME_EVENT';

export interface SyncLogEntry {
  id: number;
  ts: string;
  level: SyncLogLevel;
  code: SyncLogCode;
  message: string;
  causality?: SyncCausality;
  meta?: any;
}

export interface SyncSnapshot {
  online: boolean;
  visibility: 'visible' | 'hidden';
  isFlushing: boolean;
  lastViolation: SyncLogEntry | null;
  flushLockAgeMs: number;
  queueCount: number;
  lastSource: string;
}

const MAX_LOGS = 200;
const LOG_BUFFER: SyncLogEntry[] = [];
let LOG_COUNTER = 0;

const STATE = {
  isFlushing: false,
  flushStart: 0,
  lastSource: 'System',
  lastViolation: null as SyncLogEntry | null
};

export const syncInspector = {
  log: (level: SyncLogLevel, code: SyncLogCode, message: string, causality?: SyncCausality, meta?: any) => {
    const entry: SyncLogEntry = {
      id: ++LOG_COUNTER,
      ts: new Date().toISOString(),
      level,
      code,
      message,
      causality,
      meta
    };

    if (level === 'violation') {
      STATE.lastViolation = entry;
      console.error(`🚨 [SYNC_VIOLATION] ${message}`, causality);
    }

    if (code === 'FLUSH_START') {
      STATE.isFlushing = true;
      STATE.flushStart = Date.now();
    } else if (code === 'FLUSH_END') {
      STATE.isFlushing = false;
      STATE.flushStart = 0;
    }

    if (causality) STATE.lastSource = causality.module;

    LOG_BUFFER.unshift(entry);
    if (LOG_BUFFER.length > MAX_LOGS) LOG_BUFFER.pop();
    
    window.dispatchEvent(new CustomEvent('sproutly:sync_log', { detail: { logs: LOG_BUFFER } }));
    window.dispatchEvent(new CustomEvent('sproutly:sync_snapshot', { detail: { snapshot: syncInspector.getSnapshot() } }));
  },

  checkInvariant: (condition: boolean, code: SyncLogCode, message: string, causality: SyncCausality) => {
    if (!condition) {
      const stack = new Error().stack;
      syncInspector.log('violation', 'STATE_MACHINE_VIOLATION', message, { ...causality, stack });
      return false;
    }
    return true;
  },

  getSnapshot: (): SyncSnapshot => {
    return {
      online: navigator.onLine,
      visibility: document.visibilityState as 'visible' | 'hidden',
      isFlushing: STATE.isFlushing,
      lastViolation: STATE.lastViolation,
      flushLockAgeMs: STATE.flushStart > 0 ? Date.now() - STATE.flushStart : 0,
      queueCount: 0, // Simplified for snapshot as IndexedDB count is async
      lastSource: STATE.lastSource
    };
  },

  getLogs: () => [...LOG_BUFFER],
  exportJson: () => JSON.stringify({ snapshot: syncInspector.getSnapshot(), logs: LOG_BUFFER }, null, 2)
};