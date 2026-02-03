
export type SyncLogLevel = 'info' | 'success' | 'warn' | 'error' | 'critical' | 'violation';

export interface SyncCausality {
  owner: 'Orchestrator' | 'DataLayer' | 'Lifecycle' | 'UI';
  module: string;
  reason: string;
  stack?: string;
}

export type SyncLogCode = 
  | 'INIT' | 'LOCAL_WRITE' | 'OUTBOX_ENQUEUE' | 'SCHEDULE_FLUSH'
  | 'FLUSH_START' | 'FLUSH_END' | 'FLUSH_ABORTED' | 'FLUSH_SKIPPED'
  | 'GATE_BLOCKED' | 'LOCKED' | 'CLOUD_ERR' | 'UPSERT_RESULT' | 'PULL_RESULT'
  | 'RECOVERY_TRIGGER' | 'RESUME_BOUNDARY' | 'SYNC_ABORT_DIAGNOSIS'
  | 'APP_HIDDEN' | 'APP_VISIBLE' | 'NETWORK_ABORT' | 'TRAFFIC_SHAPING'
  | 'UPSERT_ERR' | 'RESUME_EVENT' | 'REPRO_STEP' | 'REPRO_ERR';

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
  queueCount: number;
  lastSource: string;
  lastReason: string;
  flushLockAgeMs: number;
  hasActiveTimer: boolean;
  lastViolation: string | null;
  failedAttempts: number;
}

const MAX_LOGS = 200;
const LOG_BUFFER: SyncLogEntry[] = [];
let LOG_COUNTER = 0;

const STATE = {
  isFlushing: false,
  pendingFlush: false,
  flushStart: 0,
  queueCount: 0,
  lastSource: 'System',
  lastReason: 'Init',
  failedAttempts: 0
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

    if (code === 'FLUSH_START') {
      STATE.isFlushing = true;
      STATE.flushStart = Date.now();
    } else if (code === 'FLUSH_END' || code === 'FLUSH_ABORTED') {
      STATE.isFlushing = false;
      STATE.flushStart = 0;
    }

    // ERROR TRACKING
    if (code === 'UPSERT_ERR' || code === 'CLOUD_ERR') {
        STATE.failedAttempts++;
    } else if (code === 'UPSERT_RESULT' || code === 'PULL_RESULT') {
        STATE.failedAttempts = 0;
    }

    if (causality) {
      STATE.lastSource = causality.module;
      STATE.lastReason = causality.reason;
    }

    LOG_BUFFER.unshift(entry);
    if (LOG_BUFFER.length > MAX_LOGS) LOG_BUFFER.pop();
    
    // Broadcast for UI components
    window.dispatchEvent(new CustomEvent('sproutly:sync_log', { detail: { logs: LOG_BUFFER } }));
    window.dispatchEvent(new CustomEvent('sproutly:sync_snapshot', { detail: { snapshot: syncInspector.getSnapshot() } }));
  },

  updateQueueCount: (count: number) => {
    STATE.queueCount = count;
    window.dispatchEvent(new CustomEvent('sproutly:sync_snapshot', { detail: { snapshot: syncInspector.getSnapshot() } }));
  },

  getSnapshot: (): SyncSnapshot => {
    return {
      online: navigator.onLine,
      visibility: document.visibilityState as 'visible' | 'hidden',
      isFlushing: STATE.isFlushing,
      pendingFlush: STATE.pendingFlush,
      flushLockAgeMs: STATE.flushStart > 0 ? Date.now() - STATE.flushStart : 0,
      queueCount: STATE.queueCount, 
      lastSource: STATE.lastSource,
      lastReason: STATE.lastReason,
      hasActiveTimer: false,
      lastViolation: null,
      failedAttempts: STATE.failedAttempts
    };
  },

  getLogs: () => [...LOG_BUFFER],
  exportJson: () => JSON.stringify({ snapshot: syncInspector.getSnapshot(), logs: LOG_BUFFER }, null, 2)
};
