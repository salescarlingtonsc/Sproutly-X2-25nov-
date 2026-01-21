
import { supabase } from './supabase';

export type SyncLogLevel = 'info' | 'success' | 'warn' | 'error' | 'critical';
export type SyncLogCode = 
  | 'INIT' 
  | 'LOCAL_WRITE' 
  | 'OUTBOX_ENQUEUE' 
  | 'OUTBOX_DEQUEUE'
  | 'FLUSH_START'
  | 'FLUSH_END'
  | 'CLOUD_UPSERT_START'
  | 'CLOUD_WRITE_CONFIRMED'
  | 'CLOUD_ERR'
  | 'AUTH_CHECK'
  | 'AUTH_OK'
  | 'AUTH_STALE'
  | 'AUTH_FAIL'
  | 'NETWORK_OFFLINE'
  | 'NETWORK_ONLINE'
  | 'TIMEOUT_ABORTED'
  | 'RECOVERY_TRIGGER'
  | 'LOCKED';

export interface SyncLogEntry {
  id: number;
  ts: string;
  level: SyncLogLevel;
  code: SyncLogCode;
  message: string;
  meta?: any;
}

export interface SyncSnapshot {
  online: boolean;
  visibility: 'visible' | 'hidden';
  lastFlushAt: number | null;
  isFlushing: boolean;
  queueCount: number;
  lastCloudOkAt: number | null;
  lastCloudErr: string | null;
  lastSessionOkAt: number | null;
  lastSessionErr: string | null;
  lastSaveAttemptAt: number | null;
  lastSaveOkAt: number | null;
  lastSaveLocalOnlyAt: number | null;
}

const MAX_LOGS = 500;
const LOG_BUFFER: SyncLogEntry[] = [];
let LOG_COUNTER = 0;

const SNAPSHOT: SyncSnapshot = {
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  visibility: typeof document !== 'undefined' ? (document.visibilityState as 'visible' | 'hidden') : 'visible',
  lastFlushAt: null,
  isFlushing: false,
  queueCount: 0,
  lastCloudOkAt: null,
  // Initialize from storage to ensure error persists across reloads until solved
  lastCloudErr: typeof localStorage !== 'undefined' ? localStorage.getItem('sproutly_last_sync_err') : null,
  lastSessionOkAt: null,
  lastSessionErr: null,
  lastSaveAttemptAt: null,
  lastSaveOkAt: null,
  lastSaveLocalOnlyAt: null,
};

// --- Event Bus ---
const dispatchLog = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('sproutly:sync_log', { detail: { logs: LOG_BUFFER } }));
};

const dispatchSnapshot = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('sproutly:sync_snapshot', { detail: { snapshot: SNAPSHOT } }));
};

// --- Public API ---

export const syncInspector = {
  log: (level: SyncLogLevel, code: SyncLogCode, message: string, meta?: any) => {
    const entry: SyncLogEntry = {
      id: ++LOG_COUNTER,
      ts: new Date().toISOString(),
      level,
      code,
      message,
      meta: meta ? JSON.parse(JSON.stringify(meta)) : undefined
    };

    LOG_BUFFER.unshift(entry);
    if (LOG_BUFFER.length > MAX_LOGS) LOG_BUFFER.pop();

    console.log(`[SyncInspector][${code}] ${message}`, meta || '');
    dispatchLog();
  },

  updateSnapshot: (updates: Partial<SyncSnapshot>) => {
    Object.assign(SNAPSHOT, updates);
    
    // Persist error state to localStorage so it survives hard refreshes
    if (updates.lastCloudErr !== undefined) {
        if (updates.lastCloudErr) {
            localStorage.setItem('sproutly_last_sync_err', updates.lastCloudErr);
        } else {
            localStorage.removeItem('sproutly_last_sync_err');
        }
    }

    dispatchSnapshot();
  },

  getLogs: () => [...LOG_BUFFER],
  
  getSnapshot: () => ({ ...SNAPSHOT }),

  clearLogs: () => {
    LOG_BUFFER.length = 0;
    dispatchLog();
  },

  exportLogsJson: () => JSON.stringify({ snapshot: SNAPSHOT, logs: LOG_BUFFER }, null, 2),

  exportLogsMarkdown: () => {
    const lines = LOG_BUFFER.map(l => {
        const time = l.ts.split('T')[1].replace('Z','');
        const metaStr = l.meta ? ` | ${JSON.stringify(l.meta)}` : '';
        return `\`${time}\` **[${l.level.toUpperCase()}]** \`[${l.code}]\` ${l.message}${metaStr}`;
    });
    return `### Sproutly Diagnostic Report
**Snapshot:**
\`\`\`json
${JSON.stringify(SNAPSHOT, null, 2)}
\`\`\`

**Logs:**
${lines.join('\n')}
    `;
  }
};

// --- Listeners ---
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncInspector.log('info', 'NETWORK_ONLINE', 'Browser reports online');
    syncInspector.updateSnapshot({ online: true });
  });
  
  window.addEventListener('offline', () => {
    syncInspector.log('warn', 'NETWORK_OFFLINE', 'Browser reports offline');
    syncInspector.updateSnapshot({ online: false });
  });

  document.addEventListener('visibilitychange', () => {
    const viz = document.visibilityState;
    syncInspector.log('info', 'RECOVERY_TRIGGER', `Visibility changed: ${viz}`);
    syncInspector.updateSnapshot({ visibility: viz });
  });
}
