
import React, { useState, useEffect, useRef } from 'react';
import { syncInspector, SyncLogEntry, SyncSnapshot } from '../../lib/syncInspector';
import { db } from '../../lib/db';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';

interface SyncInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SyncInspectorModal: React.FC<SyncInspectorModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [snapshot, setSnapshot] = useState<SyncSnapshot>(syncInspector.getSnapshot());
  const [filter, setFilter] = useState<'ALL' | 'ERRORS' | 'CLOUD'>('ALL');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setLogs(syncInspector.getLogs());
      setSnapshot(syncInspector.getSnapshot());
    }

    const handleLog = (e: any) => setLogs([...e.detail.logs]);
    const handleSnap = (e: any) => setSnapshot({ ...e.detail.snapshot });

    window.addEventListener('sproutly:sync_log', handleLog);
    window.addEventListener('sproutly:sync_snapshot', handleSnap);

    return () => {
      window.removeEventListener('sproutly:sync_log', handleLog);
      window.removeEventListener('sproutly:sync_snapshot', handleSnap);
    };
  }, [isOpen]);

  const cloudTest = async () => {
    if (!supabase) return;
    const t0 = Date.now();
    
    const log = (label: string, extra?: any) => {
      syncInspector.log('info', 'NETWORK_ONLINE', `[TEST] ${label}`, extra);
    };

    try {
      log('START');

      // 1) Session check
      const s0 = Date.now();
      const { data: sData, error: sErr } = await supabase.auth.getSession();
      log('SESSION_DONE', { ms: Date.now() - s0, hasSession: !!sData?.session, err: sErr?.message });

      // 2) Quick read ping
      const r0 = Date.now();
      const { data: rData, error: rErr } = await supabase.from('clients').select('id').limit(1);
      log('READ_PING_DONE', { ms: Date.now() - r0, count: rData?.length ?? 0, err: rErr?.message });

      // 3) Write ping
      if (sData?.session?.user?.id) {
          const id = crypto?.randomUUID?.() ?? `test-${Math.random()}`;
          const w0 = Date.now();
          const { data: wData, error: wErr } = await supabase
            .from('clients')
            .upsert({
              id,
              user_id: sData.session.user.id,
              data: { _ping: true, ts: new Date().toISOString() },
              updated_at: new Date().toISOString()
            })
            .select('id, updated_at')
            .single();

          log('WRITE_PING_DONE', { ms: Date.now() - w0, data: wData, err: wErr?.message });
          
          if (!wErr) {
              await supabase.from('clients').delete().eq('id', id);
          }
      } else {
          log('SKIP_WRITE_NO_USER');
      }

      log('END_OK');
    } catch (e: any) {
      log('CRASH', { name: e?.name, message: e?.message });
    }
  };

  const getDiagnosis = () => {
    // 1. Check for recent wake-up (App Switch / YouTube Return)
    // We look for the RECOVERY_TRIGGER log within the last 15 seconds
    const recentWakeUp = logs.find(l => l.code === 'RECOVERY_TRIGGER' && (Date.now() - new Date(l.ts).getTime() < 15000));
    
    if (!snapshot.online) {
        return "⚠️ Device Offline. SOLUTION: Connect to Wi-Fi/4G. Changes are safe locally.";
    }
    
    if (snapshot.lastSessionErr) {
        return "🔒 Session Expired (Background Timeout). SOLUTION: Refresh page to renew token.";
    }

    // 2. Check for "Zombie Lock" (Flushing for > 10s without success)
    const isZombie = snapshot.isFlushing && (Date.now() - (snapshot.lastSaveAttemptAt || 0) > 12000);
    if (isZombie) {
        return "🧟 Connection Zombie. The background switch froze the upload. SOLUTION: Click 'Flush Queue' to reset.";
    }
    
    if (recentWakeUp) {
        if (snapshot.queueCount > 0) return "⚡ App Waking Up. Auto-syncing... If stuck >5s, click 'Flush Queue'.";
        return "⚡ App Waking Up. System check complete. Connection Restored.";
    }

    if (snapshot.lastCloudErr && snapshot.queueCount > 0) {
        return "☁️ Cloud Sync Error. SOLUTION: Click 'Flush Queue' to retry immediately.";
    }
    
    if (snapshot.queueCount > 0 && snapshot.isFlushing) {
        return "🔄 Syncing... Uploading pending changes to cloud.";
    }
    
    if (snapshot.queueCount > 0 && !snapshot.isFlushing) {
        return "⏳ Pending Sync. SOLUTION: Queue idle. Click 'Flush Queue' to force upload.";
    }
    
    return "✅ System Healthy. All changes synced.";
  };

  const filteredLogs = logs.filter(l => {
    if (filter === 'ERRORS') return l.level === 'error' || l.level === 'warn';
    if (filter === 'CLOUD') return l.code.includes('CLOUD') || l.code.includes('OUTBOX') || l.message.includes('[TEST]');
    return true;
  });

  const handleFlush = () => {
    if (user?.id) db.flushCloudQueue(user.id);
  };

  const handleCopyLogs = () => {
    const report = syncInspector.exportLogsMarkdown();
    navigator.clipboard.writeText(report);
    toast.success("Diagnostic Report Copied to Clipboard!");
  };

  const diagnosis = getDiagnosis();
  
  // Dynamic Styles based on Diagnosis State
  const diagStyle = diagnosis.includes('Waking Up') 
    ? 'bg-indigo-900/80 border-indigo-500 text-indigo-200 animate-pulse'
    : diagnosis.includes('Zombie') || diagnosis.includes('Error') || diagnosis.includes('Offline') || diagnosis.includes('Expired')
        ? 'bg-red-900/50 border-red-500 text-red-100'
        : 'bg-emerald-900/30 border-emerald-500/30 text-emerald-200';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10001] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 text-white w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-slate-700">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-lg">☁️ Sync Inspector</h2>
            <div className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${snapshot.online ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
              {snapshot.online ? 'Online' : 'Offline'}
            </div>
            <div className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${snapshot.queueCount === 0 ? 'bg-slate-700 text-slate-400' : 'bg-amber-500/20 text-amber-400'}`}>
              Queue: {snapshot.queueCount}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        {/* Diagnosis Bar (Dynamic Color) */}
        <div className={`p-3 border-b text-xs font-mono font-bold transition-colors duration-300 ${diagStyle}`}>
          {diagnosis}
        </div>

        {/* Controls */}
        <div className="p-2 border-b border-slate-700 flex gap-2 overflow-x-auto">
          <button onClick={() => setFilter('ALL')} className={`px-3 py-1 text-xs rounded transition-colors ${filter === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>All Logs</button>
          <button onClick={() => setFilter('ERRORS')} className={`px-3 py-1 text-xs rounded transition-colors ${filter === 'ERRORS' ? 'bg-red-900/50 text-red-200' : 'text-slate-400 hover:text-white'}`}>Errors Only</button>
          <button onClick={() => setFilter('CLOUD')} className={`px-3 py-1 text-xs rounded transition-colors ${filter === 'CLOUD' ? 'bg-blue-900/50 text-blue-200' : 'text-slate-400 hover:text-white'}`}>Cloud Traffic</button>
          
          <div className="flex-1"></div>
          
          <button onClick={cloudTest} className="px-3 py-1 text-xs bg-indigo-900 hover:bg-indigo-800 text-indigo-100 rounded font-bold border border-indigo-700">Cloud Test</button>
          <button onClick={handleFlush} className="px-3 py-1 text-xs bg-emerald-900 hover:bg-emerald-800 text-emerald-100 rounded font-bold border border-emerald-700">Flush Queue</button>
          <button onClick={handleCopyLogs} className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold flex items-center gap-2">
             <span>📋</span> Copy Report for Support
          </button>
          <button onClick={() => syncInspector.clearLogs()} className="px-3 py-1 text-xs bg-slate-800 hover:bg-red-900 text-slate-400 hover:text-white rounded">Clear</button>
        </div>

        {/* Log Stream */}
        <div className="flex-1 overflow-y-auto p-4 bg-black/20 custom-scrollbar font-mono text-xs" ref={scrollRef}>
          {filteredLogs.length === 0 ? (
            <div className="text-slate-600 italic text-center mt-10">No logs matching filter.</div>
          ) : (
            filteredLogs.map(log => {
              const isRecovery = log.code === 'RECOVERY_TRIGGER';
              const isError = log.level === 'error';
              const isZombie = log.code === 'TIMEOUT_ABORTED' || log.code === 'LOCKED';
              
              return (
                <div key={log.id} className={`mb-1 flex gap-3 hover:bg-white/5 p-1 rounded ${isRecovery ? 'bg-indigo-900/40 border-l-2 border-indigo-400 pl-2' : ''} ${isError ? 'bg-red-900/20' : ''} ${isZombie ? 'bg-amber-900/20' : ''}`}>
                  <span className="text-slate-500 shrink-0">{log.ts.split('T')[1].replace('Z','')}</span>
                  <span className={`shrink-0 w-32 font-bold ${
                    log.level === 'error' ? 'text-red-400' :
                    log.level === 'warn' ? 'text-amber-400' :
                    log.level === 'success' ? 'text-emerald-400' :
                    isRecovery ? 'text-indigo-300' :
                    'text-blue-300'
                  }`}>[{log.code}]</span>
                  <span className={`${isRecovery ? 'text-indigo-200 font-bold' : isError ? 'text-red-200' : 'text-slate-300'} break-all`}>
                    {log.message}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Stats */}
        <div className="p-3 bg-slate-800 border-t border-slate-700 text-[10px] text-slate-400 flex justify-between">
           <span>Last Save: {snapshot.lastSaveOkAt ? new Date(snapshot.lastSaveOkAt).toLocaleTimeString() : 'Never'}</span>
           <span>Last Cloud Sync: {snapshot.lastCloudOkAt ? new Date(snapshot.lastCloudOkAt).toLocaleTimeString() : 'Never'}</span>
           <span>Session Status: {snapshot.lastSessionErr ? 'STALE' : 'OK'}</span>
        </div>
      </div>
    </div>
  );
};

export default SyncInspectorModal;
