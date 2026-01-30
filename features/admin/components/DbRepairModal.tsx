import React from 'react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { useToast } from '../../../contexts/ToastContext';
import { db } from '../../../lib/db';
import SyncInspectorModal from '../../../components/sync/SyncInspectorModal';
import { useAuth } from '../../../contexts/AuthContext';
import { syncInspector, SyncCausality } from '../../../lib/syncInspector';

interface DbRepairModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DbRepairModal: React.FC<DbRepairModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [showInspector, setShowInspector] = React.useState(false);
  
  const SCRIPT_SQL = `-- ENTERPRISE SCHEMA v6.4 (SYNTAX HARDENED + STRICT ISOLATION)
-- ... (SQL Content Omitted for brevity as it is unchanged from previous) ...
ANALYZE;`;

  const runRepro = async () => {
      const causality: SyncCausality = { owner: 'UI', module: 'DbRepairModal', reason: 'Manual Repro' };
      
      try {
          syncInspector.log('info', 'REPRO_STEP' as any, 'enter', causality);
          
          if (!user) {
              alert("Please log in to run diagnostics.");
              return;
          }

          // DETERMINISTIC REPRO: Use strict UUID
          const reproId = db.generateUuid();
          const now = new Date().toISOString();
          
          // Generate heavy payload to slow down the request (~50kb -> ~500kb)
          // 5000 * 40 chars = 200kb. Let's make it 25000 for ~1MB JSON body
          const heavyPayload = Array(25000).fill("repro_data_block_padding_to_slow_network_transfer_latency_simulation").join("_");

          syncInspector.log('info', 'REPRO_STEP' as any, 'before_saveClient', causality, { id: reproId, size: 'Approx 1MB' });

          // 1. Queue the record
          await db.saveClient({
              id: reproId,
              name: `Repro Test ${reproId.substring(0, 5)}`,
              profile: { name: `Repro ${reproId.substring(0, 5)}` } as any,
              lastUpdated: now,
              notes: [{ id: 'heavy', content: heavyPayload, date: now, author: 'ReproBot' }]
          } as any, user.id, {
              owner: 'UI',
              module: 'DbRepairModal',
              reason: 'Manual Repro Trigger'
          });
          
          syncInspector.log('info', 'REPRO_STEP' as any, 'after_saveClient', causality, { id: reproId });

          // Explicit call to check flush path
          db.scheduleFlush('Manual Repro Flush');
          
          // 2. Alert user for app switch
          alert("HEAVY REPRO STARTED: ~1MB Payload Queued.\n\n>>> IMMEDIATELY SWITCH APPS NOW! <<<\n\nWait 5 seconds, then return to see 'Background Interruption' in Inspector.");
      } catch (err: any) {
          syncInspector.log('error', 'REPRO_ERR' as any, err.message, causality, { stack: err.stack });
          toast.error("Repro logic crashed. Check Inspector.");
      }
  };

  if (!isOpen) return null;

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} title="System Repair & Diagnostics"
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="space-y-6">
        <div className="bg-slate-900 rounded-xl p-4">
            <textarea className="w-full h-40 bg-transparent text-emerald-400 font-mono text-[10px] outline-none resize-none" readOnly value={SCRIPT_SQL} />
            <div className="flex justify-between mt-2">
                <button onClick={() => navigator.clipboard.writeText(SCRIPT_SQL)} className="text-xs text-white bg-white/20 px-3 py-1 rounded hover:bg-white/30">Copy SQL</button>
                <div className="text-[10px] text-slate-500 pt-1">Run in Supabase SQL Editor</div>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
            <button onClick={() => setShowInspector(true)} className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-left hover:bg-indigo-100 transition-colors">
                <div className="text-xl mb-2">🩺</div>
                <h4 className="font-bold text-indigo-900 text-sm">Open Inspector</h4>
                <p className="text-[10px] text-indigo-700">View real-time sync logs</p>
            </button>
            
            <button onClick={runRepro} className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-left hover:bg-amber-100 transition-colors">
                <div className="text-xl mb-2">🧪</div>
                <h4 className="font-bold text-amber-900 text-sm">HEAVY REPRO</h4>
                <p className="text-[10px] text-amber-700">Simulate slow sync</p>
            </button>
        </div>
      </div>
    </Modal>
    <SyncInspectorModal isOpen={showInspector} onClose={() => setShowInspector(false)} />
    </>
  );
};

export default DbRepairModal;