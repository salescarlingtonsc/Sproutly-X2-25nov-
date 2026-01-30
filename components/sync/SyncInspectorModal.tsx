
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { syncInspector, SyncLogEntry, SyncSnapshot } from '../../lib/syncInspector';
import { db } from '../../lib/db';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import Button from '../../components/ui/Button';

interface SyncInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SyncInspectorModal: React.FC<SyncInspectorModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [snapshot, setSnapshot] = useState<SyncSnapshot>(syncInspector.getSnapshot());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-refresh snapshot for timer visualization
  useEffect(() => {
      let interval: any;
      if (isOpen) {
          setLogs(syncInspector.getLogs());
          setSnapshot(syncInspector.getSnapshot());
          interval = setInterval(() => {
              setSnapshot(syncInspector.getSnapshot());
          }, 1000);
      }
      
      const hLog = (e: any) => setLogs([...e.detail.logs]);
      const hSnap = (e: any) => setSnapshot({ ...e.detail.snapshot });
      
      window.addEventListener('sproutly:sync_log', hLog);
      window.addEventListener('sproutly:sync_snapshot', hSnap);
      
      return () => {
          clearInterval(interval);
          window.removeEventListener('sproutly:sync_log', hLog);
          window.removeEventListener('sproutly:sync_snapshot', hSnap);
      };
  }, [isOpen]);

  // --- AUTO-DIAGNOSIS ENGINE ---
  const diagnosis = React.useMemo(() => {
      if (logs.length === 0) return { status: 'neutral', title: 'System Idle', desc: 'No activity recorded yet.' };

      // 0. Check for ACTIVE HEAVY LIFT
      if (snapshot.isFlushing) {
          const age = snapshot.flushLockAgeMs / 1000;
          if (age > 10) {
              return {
                  status: 'active',
                  title: age > 60 ? 'Heavy Upload (Slow Network)' : 'Uploading Data...',
                  desc: `Transfer active for ${age.toFixed(0)}s. Max timeout is 180s for large files.`,
                  action: 'Please wait. Do not close app.'
              };
          }
          return { status: 'active', title: 'Sync in Progress', desc: 'Uploading data to cloud...', action: 'Do not close app.' };
      }

      // 1. Root Cause Ranking (Failures)
      const fail = logs.find(l => l.level === 'error' || l.code === 'FLUSH_ABORTED' || l.code === 'SYNC_ABORT_DIAGNOSIS');
      
      if (fail) {
          const successIndex = logs.findIndex(l => l.code === 'UPSERT_RESULT');
          const failIndex = logs.indexOf(fail);
          
          // Only diagnose if failure is more recent than success
          if (successIndex === -1 || successIndex > failIndex) {
              
              // A. Backgrounding Check
              const abortLog = logs.find(l => l.code === 'SYNC_ABORT_DIAGNOSIS');
              if (abortLog && abortLog.meta?.cause === 'app_background_interrupt') {
                   return {
                      status: 'warning',
                      title: 'Background Interruption',
                      desc: 'The operating system suspended the network connection when you switched apps.',
                      action: 'The system has scheduled a recovery sync.'
                   };
              }
              
              // B. Heavy Payload Check
              const heavyLog = logs.find(l => l.code === 'TRAFFIC_SHAPING' && (l.message.includes('too large') || l.message.includes('Sanitizing')));
              const timeoutLog = logs.find(l => l.message.includes('TIMEOUT_HARD'));
              
              if (heavyLog || (timeoutLog && logs.find(l => l.code === 'SYNC_ABORT_DIAGNOSIS' && l.meta?.cause === 'payload_too_large'))) {
                   return {
                       status: 'error',
                       title: 'Heavy Payload Timeout',
                       desc: 'Data packet > 1MB caused a network timeout. Heavy content (images/text) has been auto-pruned to restore sync.',
                       action: 'Avoid pasting large files/text directly into notes.'
                   };
              }

              // C. Generic Timeout
              if (fail.message.includes('TIMEOUT_HARD')) {
                   return {
                       status: 'error',
                       title: 'Network Timeout',
                       desc: 'The cloud took too long to respond. The Orchestrator is scaling the window for the next try.',
                       action: 'Auto-retry will occur with a 3-minute window.'
                   };
              }
              
              return {
                   status: 'error',
                   title: 'Sync Failure',
                   desc: fail.message,
                   action: 'Check internet connection or retry.'
               };
          }
      }

      if (snapshot.pendingFlush) return { status: 'neutral', title: 'Sync Scheduled', desc: 'Waiting for debounce timer...', action: 'Will start shortly.' };

      // 4. Default Success
      const lastSuccess = logs.find(l => l.code === 'UPSERT_RESULT');
      if (lastSuccess && snapshot.queueCount === 0) {
          return {
              status: 'success',
              title: 'System Synced',
              desc: `Last successful handshake at ${new Date(lastSuccess.ts).toLocaleTimeString()}.`,
              action: 'All local changes are secured in the cloud.'
          };
      }

      return { status: 'neutral', title: 'Ready', desc: 'System is online and waiting for changes.', action: '' };
  }, [logs, snapshot]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10001] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 text-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-slate-700">
        
        {/* HEADER */}
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
          <div className="flex items-center gap-4">
            <h2 className="font-bold text-lg">☁️ Causal Sync Inspector</h2>
            <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${snapshot.isFlushing ? 'bg-indigo-500 text-white animate-pulse' : 'bg-slate-700 text-slate-400'}`}>
                {snapshot.isFlushing ? `Transferring (${(snapshot.flushLockAgeMs/1000).toFixed(0)}s)` : 'Idle'}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        {/* DIAGNOSIS BANNER */}
        <div className={`p-4 border-b border-slate-700 flex items-start gap-4 ${
            diagnosis.status === 'error' ? 'bg-red-900/30' : 
            diagnosis.status === 'warning' ? 'bg-amber-900/30' : 
            diagnosis.status === 'success' ? 'bg-emerald-900/30' : 
            diagnosis.status === 'active' ? 'bg-indigo-900/30' :
            'bg-slate-800/50'
        }`}>
            <div className={`text-2xl ${
                diagnosis.status === 'error' ? 'text-red-500' : 
                diagnosis.status === 'warning' ? 'text-amber-500' : 
                diagnosis.status === 'success' ? 'text-emerald-500' : 
                diagnosis.status === 'active' ? 'text-indigo-400 animate-spin' :
                'text-slate-400'
            }`}>
                {diagnosis.status === 'error' ? '❌' : diagnosis.status === 'warning' ? '⚠️' : diagnosis.status === 'success' ? '✅' : diagnosis.status === 'active' ? '⏳' : 'ℹ️'}
            </div>
            <div className="flex-1">
                <h3 className={`text-sm font-bold uppercase tracking-wide ${
                    diagnosis.status === 'error' ? 'text-red-400' : 
                    diagnosis.status === 'warning' ? 'text-amber-400' : 
                    diagnosis.status === 'success' ? 'text-emerald-400' : 
                    diagnosis.status === 'active' ? 'text-indigo-300' :
                    'text-slate-300'
                }`}>
                    {diagnosis.title}
                </h3>
                <p className="text-xs text-slate-300 mt-1">{diagnosis.desc}</p>
                {/* PROGRESS BAR FOR ACTIVE SYNC */}
                {diagnosis.status === 'active' && snapshot.flushLockAgeMs > 2000 && (
                    <div className="mt-3 w-full max-w-md h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-indigo-500 transition-all duration-1000 ease-linear" 
                            style={{ width: `${Math.min(100, (snapshot.flushLockAgeMs / 180000) * 100)}%` }}
                        ></div>
                    </div>
                )}
                {diagnosis.action && <p className="text-[10px] text-slate-500 mt-2 font-bold uppercase">Recommendation: {diagnosis.action}</p>}
            </div>
        </div>

        <div className="grid grid-cols-4 border-b border-slate-700 bg-slate-800/30">
            <Metric label="Queue" value={snapshot.queueCount} />
            <Metric label="Lock Age" value={snapshot.flushLockAgeMs > 0 ? `${(snapshot.flushLockAgeMs/1000).toFixed(1)}s` : '0s'} />
            <Metric label="Last Module" value={snapshot.lastSource} />
            <Metric label="Status" value={snapshot.online ? 'Online' : 'Offline'} color={snapshot.online ? 'text-emerald-400' : 'text-red-400'} />
        </div>

        {/* LOG STREAM */}
        <div className="flex-1 overflow-y-auto p-4 bg-black/40 custom-scrollbar font-mono text-[11px]" ref={scrollRef}>
          {logs.map((log) => (
            <div key={log.id} className={`mb-1 p-1 rounded flex gap-3 ${log.level === 'violation' ? 'bg-red-500/10 border border-red-500/20' : log.code === 'SYNC_ABORT_DIAGNOSIS' ? 'bg-amber-500/10 border border-amber-500/30' : 'hover:bg-white/5'}`}>
              <span className="text-slate-600 shrink-0">{log.ts.split('T')[1].slice(0, 8)}</span>
              <span className={`shrink-0 w-24 font-black uppercase text-[9px] px-1.5 rounded-sm h-fit ${
                log.causality?.module === 'AutoSaver' ? 'text-blue-400 bg-blue-400/10' :
                log.causality?.module === 'SyncRecovery' ? 'text-purple-400 bg-purple-400/10' :
                'text-slate-400 bg-slate-400/10'
              }`}>
                {log.causality?.module.split(':').pop() || 'System'}
              </span>
              <div className="flex-1">
                  <span className={log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-amber-400' : 'text-slate-300'}>{log.message}</span>
                  {log.meta && (
                      <pre className="mt-1 text-[9px] text-slate-500 overflow-x-auto">{JSON.stringify(log.meta, null, 0)}</pre>
                  )}
              </div>
              <span className={`text-[9px] uppercase font-bold ${log.level === 'success' ? 'text-emerald-500' : 'text-slate-500'}`}>{log.code}</span>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-800/30 flex justify-between">
           <Button size="sm" variant="danger" onClick={() => { db.resetLocks(); toast.success("Locks reset"); }}>
               {snapshot.isFlushing ? 'Cancel Upload' : 'Emergency Unlock'}
           </Button>
           <div className="flex gap-2">
               <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(syncInspector.exportJson()); toast.success("Copied"); }}>Export JSON</Button>
               <Button size="sm" variant="accent" onClick={() => user && db.requestFlush(user.id, { owner: 'UI', module: 'Inspector', reason: 'Manual force' })}>Force Flush</Button>
           </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const Metric = ({ label, value, color }: any) => (
    <div className="p-4 border-r border-slate-700 last:border-0 text-center">
        <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">{label}</div>
        <div className={`text-sm font-bold truncate ${color || 'text-slate-200'}`}>{value}</div>
    </div>
);

export default SyncInspectorModal;
