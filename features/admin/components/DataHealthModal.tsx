import React, { useState, useEffect } from 'react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { db } from '../../../lib/db';
import { supabase } from '../../../lib/supabase';
import { runDiagnostics, probeWriteAccess } from '../../../lib/db/debug';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';

interface DataHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DataHealthModal: React.FC<DataHealthModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [localCount, setLocalCount] = useState(0);
  const [cloudCount, setCloudCount] = useState<number | null>(null);
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [unsyncedLocal, setUnsyncedLocal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [flushing, setFlushing] = useState(false);
  
  // Probe State
  const [probeLogs, setProbeLogs] = useState<string[]>([]);
  const [isProbing, setIsProbing] = useState(false);
  const [showSessionFix, setShowSessionFix] = useState(false);

  // Initial Scan on Open
  useEffect(() => {
    if (isOpen && user) {
        runHealthScan();
        
        // 1. Poll Local Queue every 2s (to catch background flushes)
        const interval = setInterval(() => {
            runHealthScan(true); // Silent run
        }, 2000);

        // 2. Subscribe to Cloud Changes (Realtime)
        let subscription: any = null;
        if (supabase) {
            subscription = supabase
                .channel('health_monitor')
                .on(
                    'postgres_changes', 
                    { event: '*', schema: 'public', table: 'clients', filter: `user_id=eq.${user.id}` }, 
                    () => runHealthScan(true)
                )
                .subscribe();
        }

        return () => {
            clearInterval(interval);
            if (subscription) subscription.unsubscribe();
        };
    }
  }, [isOpen, user]);

  const runHealthScan = async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    try {
      // 1. Local Analysis
      const localData = await db.getClients(user.id);
      setLocalCount(localData.length);
      
      // Count how many locally have the "Synced" flag as false
      const dirty = localData.filter(c => c._isSynced === false).length;
      setUnsyncedLocal(dirty);

      // 2. Queue Analysis (The actual Outbox)
      const q = db.getQueueDetails();
      setQueueItems(q);

      // 3. Cloud Analysis (Strictly OWNED by me)
      if (supabase) {
        const { count, error } = await supabase
            .from('clients')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id); 
            
        if (error) throw error;
        setCloudCount(count);
      }
    } catch (e: any) {
      console.error("Diagnostic error", e);
      // Ensure we don't crash with [object Object]
      const msg = e?.message || (typeof e === 'string' ? e : 'Unknown Database Error');
      if (!silent) toast.error(`Health Scan Error: ${msg}`);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleForceFlush = async () => {
    if (!user) return;
    setFlushing(true);
    try {
      await db.flushCloudQueue(user.id);
      await runHealthScan(); // Re-run to update numbers
      toast.success("Outbox processed.");
    } catch (e) {
      toast.error("Flush failed.");
    } finally {
      setFlushing(false);
    }
  };

  const handleResyncAll = async () => {
      if (!user) return;
      if (!window.confirm(`This will force-upload all ${localCount} clients to the server to ensure consistency. Continue?`)) return;
      
      setFlushing(true);
      try {
          // 1. Get all local
          const all = await db.getClients(user.id);
          
          // 2. Mark as dirty
          const dirty = all.map(c => ({
              ...c,
              _isSynced: false,
              lastUpdated: new Date().toISOString()
          }));
          
          // 3. Bulk Queue
          await db.createClientsBulk(dirty, user.id);
          
          toast.success(`Started upload for ${dirty.length} clients...`);
          await runHealthScan();
      } catch (e: any) {
          toast.error("Resync failed: " + e.message);
      } finally {
          setFlushing(false);
      }
  };

  const handleRunProbe = async () => {
      if (isProbing) return;
      setIsProbing(true);
      setShowSessionFix(false);
      setProbeLogs(['Initializing Write Probe...']);
      
      try {
          const res = await probeWriteAccess();
          setProbeLogs(res.logs);
          
          // Check for specific session timeout errors or network aborts
          const errorPattern = /timed out|No Active Session|aborted|Failed to fetch|Network request failed|TypeError/i;
          if (res.logs.some(l => errorPattern.test(l))) {
              setShowSessionFix(true);
          }
      } catch (e: any) {
          const msg = e?.message || String(e);
          setProbeLogs(prev => [...prev, `❌ FATAL ERROR: ${msg}`]);
          setShowSessionFix(true); // Assume fatal error might be fixable by reset
      } finally {
          setIsProbing(false);
      }
  };

  const handleSessionReset = (e?: React.MouseEvent | React.TouchEvent) => {
      if (e) {
          e.preventDefault();
          e.stopPropagation();
      }
      
      console.log("Manual Session Reset Triggered");

      // Detach from event loop to ensure UI renders first
      setTimeout(() => {
          if (!window.confirm("This will clear your local login session and reload the page. You will need to log in again. Proceed?")) return;
          
          try {
              // Collect keys first to avoid index shifting bugs during removal
              const keysToRemove: string[] = [];
              for (let i = 0; i < localStorage.length; i++) {
                  const key = localStorage.key(i);
                  // Target Supabase keys (sb-*), App Auth keys (sproutly_auth), and User Cache
                  if (key && (
                      key.startsWith('sb-') || 
                      key.includes('sproutly_auth') || 
                      key.includes('supabase') ||
                      key.includes('sproutly.user_cache')
                  )) {
                      keysToRemove.push(key);
                  }
              }
              
              keysToRemove.forEach(k => localStorage.removeItem(k));
              // Clear session storage as well for good measure
              sessionStorage.clear();
              
              // Force reload
              window.location.reload();
          } catch (err) {
              console.error("Session reset error", err);
              alert("Automatic reset failed. Please clear browser cookies/data manually.");
          }
      }, 50);
  };

  const handleBackup = async () => {
      const data = await db.getClients();
      // Filename includes user name and date for easy identification
      const safeName = user?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'user';
      const filename = `sproutly_backup_${safeName}_${new Date().toISOString().split('T')[0]}.json`;
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("Backup file downloaded to device.");
  };

  // Status Logic
  const pendingCount = queueItems.length;
  const syncedLocalCount = localCount - unsyncedLocal;
  const isHealthy = pendingCount === 0 && (cloudCount !== null && Math.abs(syncedLocalCount - cloudCount) < 2);
  const isDesync = !isHealthy && queueItems.length === 0 && cloudCount !== null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="My Data Diagnostics"
      footer={
        <div className="flex gap-2 w-full justify-between">
          <Button variant="secondary" onClick={handleBackup} leftIcon="💾">Download Backup</Button>
          <div className="flex gap-2">
             <Button variant="ghost" onClick={onClose}>Close</Button>
             <Button variant="primary" onClick={() => runHealthScan(false)} isLoading={loading} leftIcon="↻">Re-Scan</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        <div className={`p-4 rounded-xl border flex items-start gap-4 ${isHealthy ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
           <div className={`text-2xl ${isHealthy ? 'grayscale-0' : 'animate-pulse'}`}>{isHealthy ? '✅' : '⚠️'}</div>
           <div>
              <h4 className={`font-bold text-sm ${isHealthy ? 'text-emerald-900' : 'text-amber-900'}`}>
                 {isHealthy ? 'Your Data is Synced' : 'Sync In Progress'}
              </h4>
              <p className={`text-xs mt-1 ${isHealthy ? 'text-emerald-700' : 'text-amber-700'}`}>
                 {isHealthy 
                    ? 'Your local device matches your cloud records.' 
                    : `You have ${unsyncedLocal} changes on this device waiting to reach the cloud.`}
              </p>
           </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
           <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">My Device</div>
              <div className="text-2xl font-black text-slate-800">{localCount}</div>
              <div className="text-[10px] text-slate-500 mt-1">Total Clients</div>
           </div>
           
           <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-center">
              <div className="text-[9px] font-bold text-amber-600 uppercase tracking-widest mb-1">Unsaved</div>
              <div className="text-2xl font-black text-amber-700">{unsyncedLocal}</div>
              <div className="text-[10px] text-amber-600 mt-1">Pending Sync</div>
           </div>

           <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-center">
              <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-1">My Cloud</div>
              <div className="text-2xl font-black text-indigo-800">{cloudCount === null ? '-' : cloudCount}</div>
              <div className="text-[10px] text-indigo-500 mt-1">Safe on Server</div>
           </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
           <div className="flex justify-between items-center mb-3">
              <h4 className="font-bold text-slate-700 text-xs uppercase tracking-wide">
                  Outbox Queue ({queueItems.length})
              </h4>
              <div className="flex gap-2">
                  {isDesync && queueItems.length === 0 && (
                     <Button size="sm" variant="danger" onClick={handleResyncAll} isLoading={flushing} leftIcon="☁️">Resync All</Button>
                  )}
                  {queueItems.length > 0 && (
                     <Button size="sm" variant="accent" onClick={handleForceFlush} isLoading={flushing}>Force Push Now</Button>
                  )}
              </div>
           </div>
           
           <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden max-h-40 overflow-y-auto">
              {queueItems.length === 0 ? (
                 <div className="p-6 text-center text-slate-400 text-xs italic">
                    {isDesync ? (
                        <div className="text-amber-600 font-bold">
                            ⚠️ Discrepancy detected. Local ({localCount}) ≠ Cloud ({cloudCount}).
                            <br/>Click "Resync All" to upload local data.
                        </div>
                    ) : (
                        "Queue empty. All changes sent."
                    )}
                 </div>
              ) : (
                 <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 border-b border-slate-200 text-slate-500">
                       <tr><th className="p-2">Client Name</th><th className="p-2">Waiting Since</th><th className="p-2">Status</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {queueItems.map(q => (
                          <tr key={q.id}>
                             <td className="p-2 font-bold text-slate-700">{q.name}</td>
                             <td className="p-2 text-slate-500">{new Date(q.updated).toLocaleTimeString()}</td>
                             <td className="p-2 font-bold text-amber-600">Waiting...</td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              )}
           </div>
           
           <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-[10px] text-blue-800 leading-relaxed">
               <strong>Note:</strong> Your data is saved to this device instantly even if "Cloud Sync" is pending. It will not be lost if you refresh, as long as you are on the same device/browser.
           </div>
        </div>

        {/* CONNECTIVITY PROBE */}
        <div className="border-t border-slate-100 pt-4 relative z-10 isolate">
            <div className="flex justify-between items-center mb-3">
                <h4 className="font-bold text-slate-700 text-xs uppercase tracking-wide">Connectivity Probe</h4>
                <div className="flex gap-2 items-center relative z-[100] pointer-events-auto">
                    {showSessionFix && (
                        <button 
                            type="button"
                            onClick={handleSessionReset}
                            onTouchEnd={handleSessionReset}
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-md ring-2 ring-red-100 transition-all active:scale-95 relative cursor-pointer flex items-center gap-1 z-[9999]"
                            style={{ isolation: 'isolate', pointerEvents: 'auto' }}
                        >
                            <span>🔧</span> Fix Stuck Session
                        </button>
                    )}
                    <Button size="sm" variant="secondary" onClick={handleRunProbe} isLoading={isProbing}>Run Write Test</Button>
                </div>
            </div>
            {probeLogs.length > 0 && (
                <div className="bg-slate-900 rounded-xl p-4 font-mono text-[10px] text-green-400 overflow-y-auto max-h-40">
                    {probeLogs.map((log, i) => (
                        <div key={i} className={log.includes('❌') ? 'text-red-400 font-bold' : ''}>{log}</div>
                    ))}
                </div>
            )}
        </div>
      </div>
    </Modal>
  );
};

export default DataHealthModal;