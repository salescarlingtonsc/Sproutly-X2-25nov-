import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { syncInspector, SyncLogEntry, SyncSnapshot } from '../../lib/syncInspector';
import { db } from '../../lib/db';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
// Added missing Button import
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

  useEffect(() => {
    if (isOpen) {
      setLogs(syncInspector.getLogs());
      setSnapshot(syncInspector.getSnapshot());
    }
    const hLog = (e: any) => setLogs([...e.detail.logs]);
    const hSnap = (e: any) => setSnapshot({ ...e.detail.snapshot });
    window.addEventListener('sproutly:sync_log', hLog);
    window.addEventListener('sproutly:sync_snapshot', hSnap);
    return () => {
      window.removeEventListener('sproutly:sync_log', hLog);
      window.removeEventListener('sproutly:sync_snapshot', hSnap);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10001] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 text-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-slate-700">
        
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
          <div className="flex items-center gap-4">
            <h2 className="font-bold text-lg">☁️ Causal Sync Inspector</h2>
            <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${snapshot.isFlushing ? 'bg-indigo-500 text-white animate-pulse' : 'bg-slate-700 text-slate-400'}`}>
                {snapshot.isFlushing ? 'Active Flush' : 'Idle'}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        {snapshot.lastViolation && (
            <div className="p-4 bg-red-900/40 border-b border-red-500/50 animate-pulse">
                <h4 className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">State Machine Violation Detected</h4>
                <p className="text-sm font-bold text-white mb-2">{snapshot.lastViolation.message}</p>
                <div className="bg-black/40 p-3 rounded font-mono text-[10px] text-red-200">
                    <div>Module: {snapshot.lastViolation.causality?.module}</div>
                    <details className="mt-2">
                        <summary className="cursor-pointer opacity-70">View Stack Trace</summary>
                        <pre className="mt-2 text-red-400/70">{snapshot.lastViolation.causality?.stack}</pre>
                    </details>
                </div>
            </div>
        )}

        <div className="grid grid-cols-4 border-b border-slate-700 bg-slate-800/30">
            <Metric label="Queue" value={snapshot.queueCount} />
            <Metric label="Latency" value={snapshot.flushLockAgeMs > 0 ? `${(snapshot.flushLockAgeMs/1000).toFixed(1)}s` : '0s'} />
            <Metric label="Last Module" value={snapshot.lastSource} />
            <Metric label="Status" value={snapshot.online ? 'Online' : 'Offline'} color={snapshot.online ? 'text-emerald-400' : 'text-red-400'} />
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-black/40 custom-scrollbar font-mono text-[11px]" ref={scrollRef}>
          {logs.map((log) => (
            <div key={log.id} className={`mb-1 p-1 rounded flex gap-3 ${log.level === 'violation' ? 'bg-red-500/10 border border-red-500/20' : 'hover:bg-white/5'}`}>
              <span className="text-slate-600 shrink-0">{log.ts.split('T')[1].slice(0, 8)}</span>
              <span className={`shrink-0 w-24 font-black uppercase text-[9px] px-1.5 rounded-sm h-fit ${
                log.causality?.module === 'AutoSaver' ? 'text-blue-400 bg-blue-400/10' :
                log.causality?.module === 'SyncRecovery' ? 'text-purple-400 bg-purple-400/10' :
                'text-slate-400 bg-slate-400/10'
              }`}>
                {log.causality?.module || 'System'}
              </span>
              <span className="text-slate-300 flex-1">{log.message}</span>
              <span className="text-slate-500 text-[9px] uppercase font-bold">{log.code}</span>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-800/30 flex justify-between">
           <Button size="sm" variant="danger" onClick={() => { db.resetLocks(); toast.success("Locks reset"); }}>Emergency Unlock</Button>
           <div className="flex gap-2">
               <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(syncInspector.exportJson()); toast.success("Copied"); }}>Export JSON</Button>
               {/* Fixed: Used user.id from auth context */}
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