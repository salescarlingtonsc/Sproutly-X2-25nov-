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
  | 'SCHEDULE_FLUSH_CANCELLED'
  | 'TIMER_CREATED'
  | 'TIMER_FIRED'
  | 'TIMER_DROPPED'
  | 'TIMER_WATCHDOG_VIOLATION'
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
  | 'SYNC_INVARIANT_VIOLATION'
  | 'UPSERT_START'
  | 'UPSERT_OK'
  | 'UPSERT_ERR'
  | 'UPSERT_RESULT'
  | 'CLOUD_CONFIRM_FAIL'
  | 'CLOUD_CONFIRM_OK'
  | 'RECOVERY_TRIGGER'
  | 'RESUME_BOUNDARY'
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
  pendingFlush: boolean;
  hasActiveTimer: boolean;
  lastViolation: SyncLogEntry | null;
  flushLockAgeMs: number;
  queueCount: number;
  lastSource: string;
  lastReason: string;
}

const MAX_LOGS = 200;
const LOG_BUFFER: SyncLogEntry[] = [];
let LOG_COUNTER = 0;

const STATE = {
  isFlushing: false,
  pendingFlush: false,
  hasActiveTimer: false,
  flushStart: 0,
  lastSource: 'System',
  lastReason: 'Init',
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
      console.error(`🚨 [SYNC_VIOLATION] ${message}`, causality, meta);
    }

    // State Mirroring
    if (code === 'FLUSH_START') {
      STATE.isFlushing = true;
      STATE.flushStart = Date.now();
    } else if (code === 'FLUSH_END') {
      STATE.isFlushing = false;
      STATE.flushStart = 0;
    } else if (code === 'SCHEDULE_FLUSH_SET') {
      STATE.hasActiveTimer = true;
      STATE.pendingFlush = true;
    } else if (code === 'SCHEDULE_FLUSH_FIRE' || code === 'SCHEDULE_FLUSH_CANCELLED') {
      STATE.hasActiveTimer = false;
    }

    if (causality) {
      STATE.lastSource = causality.module;
      STATE.lastReason = causality.reason;
    }

    LOG_BUFFER.unshift(entry);
    if (LOG_BUFFER.length > MAX_LOGS) LOG_BUFFER.pop();
    
    window.dispatchEvent(new CustomEvent('sproutly:sync_log', { detail: { logs: LOG_BUFFER } }));
    window.dispatchEvent(new CustomEvent('sproutly:sync_snapshot', { detail: { snapshot: syncInspector.getSnapshot() } }));
  },

  checkInvariant: (condition: boolean, code: SyncLogCode, message: string, causality: SyncCausality, meta?: any) => {
    if (!condition) {
      const stack = new Error().stack;
      syncInspector.log('violation', code, message, { ...causality, stack }, meta);
      return false;
    }
    return true;
  },

  getSnapshot: (): SyncSnapshot => {
    return {
      online: navigator.onLine,
      visibility: document.visibilityState as 'visible' | 'hidden',
      isFlushing: STATE.isFlushing,
      pendingFlush: STATE.pendingFlush,
      hasActiveTimer: STATE.hasActiveTimer,
      lastViolation: STATE.lastViolation,
      flushLockAgeMs: STATE.flushStart > 0 ? Date.now() - STATE.flushStart : 0,
      queueCount: 0, 
      lastSource: STATE.lastSource,
      lastReason: STATE.lastReason
    };
  },

  getLogs: () => [...LOG_BUFFER],
  exportJson: () => JSON.stringify({ snapshot: syncInspector.getSnapshot(), logs: LOG_BUFFER }, null, 2)
};