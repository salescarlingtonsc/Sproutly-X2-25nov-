
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { syncInspector, SyncLogEntry, SyncSnapshot } from '../../lib/syncInspector';
import { db } from '../../lib/db';
import Button from '../../components/ui/Button';

interface SyncInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SyncInspectorModal: React.FC<SyncInspectorModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [snapshot, setSnapshot] = useState<SyncSnapshot>(syncInspector.getSnapshot());

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
            <h2 className="font-bold text-lg">☁️ Cloud Sync Engine</h2>
            {snapshot.queueCount > 0 ? (
                <div className="px-2 py-0.5 rounded bg-amber-500 text-black text-[10px] font-black uppercase">
                    {snapshot.queueCount} Items Pending Upload
                </div>
            ) : (
                <div className="px-2 py-0.5 rounded bg-emerald-500 text-black text-[10px] font-black uppercase">
                    All Synced
                </div>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-black/40 custom-scrollbar font-mono text-[11px]">
          {logs.map((log) => (
            <div key={log.id} className={`mb-1 p-1 rounded flex gap-3 hover:bg-white/5`}>
              <span className="text-slate-600 shrink-0">{log.ts.split('T')[1].slice(0, 8)}</span>
              <span className={`shrink-0 w-24 font-black uppercase text-[9px] px-1.5 rounded-sm h-fit ${log.level === 'error' ? 'bg-red-900 text-red-200' : 'bg-slate-800 text-slate-400'}`}>
                {log.code}
              </span>
              <span className="text-slate-300 flex-1">{log.message}</span>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-800/30 flex justify-end gap-2">
           <Button size="sm" variant="accent" onClick={() => db.scheduleFlush('Manual Force')}>Force Cloud Sync Now</Button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SyncInspectorModal;
