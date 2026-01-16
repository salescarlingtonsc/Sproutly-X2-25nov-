import React, { useState, useEffect } from 'react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { db } from '../../../lib/db';
import { supabase } from '../../../lib/supabase';
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

  // Initial Scan on Open
  useEffect(() => {
    if (isOpen && user) {
        runDiagnostics();
        
        // 1. Poll Local Queue every 2s (to catch background flushes)
        const interval = setInterval(() => {
            runDiagnostics(true); // Silent run
        }, 2000);

        // 2. Subscribe to Cloud Changes (Realtime)
        let subscription: any = null;
        if (supabase) {
            subscription = supabase
                .channel('health_monitor')
                .on(
                    'postgres_changes', 
                    { event: '*', schema: 'public', table: 'clients', filter: `user_id=eq.${user.id}` }, 
                    () => runDiagnostics(true)
                )
                .subscribe();
        }

        return () => {
            clearInterval(interval);
            if (subscription) subscription.unsubscribe();
        };
    }
  }, [isOpen, user]);

  const runDiagnostics = async (silent = false) => {
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
    } catch (e) {
      console.error("Diagnostic error", e);
      if (!silent) toast.error("Failed to query database.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleForceFlush = async () => {
    if (!user) return;
    setFlushing(true);
    try {
      await db.flushCloudQueue(user.id);
      await runDiagnostics(); // Re-run to update numbers
      toast.success("Outbox processed.");
    } catch (e) {
      toast.error("Flush failed.");
    } finally {
      setFlushing(false);
    }
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
  // Healthy if: Queue is empty AND (Local Count - Unsynced) roughly equals Cloud Count
  // We allow a small drift due to network lag or caching, but generally they should match.
  const syncedLocalCount = localCount - unsyncedLocal;
  const isHealthy = pendingCount === 0 && (cloudCount !== null && Math.abs(syncedLocalCount - cloudCount) < 2);

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
             <Button variant="primary" onClick={() => runDiagnostics(false)} isLoading={loading} leftIcon="↻">Re-Scan</Button>
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
              {queueItems.length > 0 && (
                 <Button size="sm" variant="accent" onClick={handleForceFlush} isLoading={flushing}>Force Push Now</Button>
              )}
           </div>
           
           <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden max-h-40 overflow-y-auto">
              {queueItems.length === 0 ? (
                 <div className="p-6 text-center text-slate-400 text-xs italic">
                    Queue empty. All changes sent.
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
      </div>
    </Modal>
  );
};

export default DataHealthModal;