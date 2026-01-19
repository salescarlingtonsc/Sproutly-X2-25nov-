
import React, { useState, useEffect } from 'react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { Diagnostics, DiagnosticLog } from '../../../lib/diagnostics';
import { supabase } from '../../../lib/supabase';

interface SaveDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SaveDiagnosticsModal: React.FC<SaveDiagnosticsModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: string; latency?: string } | null>(null);
  const [analysis, setAnalysis] = useState<{ verdict: string; fix: string; confidence: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      refreshData();
      // Auto-refresh every 2 seconds to see live logs
      const interval = setInterval(refreshData, 2000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const refreshData = () => {
      setLogs(Diagnostics.getLogs());
      setAnalysis(Diagnostics.analyzeRootCause());
  };

  const handleClear = () => {
    Diagnostics.clearLogs();
    setLogs([]);
    setAnalysis(null);
  };

  const handleTestConnection = async () => {
      setIsTesting(true);
      setTestResult(null);
      const start = performance.now();
      try {
          if (!supabase) throw new Error("Supabase client not initialized");
          
          // Simple ping
          const { error } = await supabase.from('profiles').select('count', { count: 'exact', head: true });
          
          if (error) throw error;
          
          const duration = (performance.now() - start).toFixed(0);
          setTestResult({ status: 'Connected', latency: `${duration}ms` });
          Diagnostics.log('System', `Connection Test Passed (${duration}ms)`, 'success');
      } catch (e: any) {
          setTestResult({ status: `Failed: ${e.message}` });
          Diagnostics.log('System', `Connection Test Failed: ${e.message}`, 'error');
      } finally {
          setIsTesting(false);
          refreshData(); // Re-run analysis after test
      }
  };

  const getLogColor = (type: string) => {
    switch (type) {
      case 'error': return 'bg-red-50 text-red-700 border-red-100';
      case 'warning': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'success': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      default: return 'bg-slate-50 text-slate-700 border-slate-100';
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Deep Diagnostics Console"
      footer={
        <div className="flex gap-2 w-full justify-between">
            <Button variant="danger" size="sm" onClick={handleClear}>Clear Logs</Button>
            <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={Diagnostics.exportLogs}>Download Report</Button>
                <Button variant="primary" size="sm" onClick={onClose}>Close</Button>
            </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* ROOT CAUSE ANALYSIS BOX */}
        <div className={`p-4 rounded-xl border-l-4 shadow-sm ${
            analysis?.confidence === 'Very High' ? 'bg-red-50 border-red-500' : 'bg-slate-100 border-slate-400'
        }`}>
            <h4 className="text-xs font-black uppercase tracking-widest mb-1 flex justify-between">
                <span>Root Cause Verdict</span>
                <span className="opacity-50">{analysis?.confidence} Confidence</span>
            </h4>
            <div className="text-lg font-bold text-slate-900 mb-2">
                {analysis?.verdict || "Insufficient Data"}
            </div>
            <div className="text-xs text-slate-700 bg-white/50 p-2 rounded border border-black/5">
                <strong>Fix:</strong> {analysis?.fix || "Perform a Connection Test below."}
            </div>
        </div>

        {/* CONNECTION TESTER */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase">Cloud Connectivity</h4>
                {testResult ? (
                    <p className={`text-[10px] font-mono mt-1 ${testResult.status.startsWith('Failed') ? 'text-red-600' : 'text-emerald-600'}`}>
                        {testResult.status} {testResult.latency && `(${testResult.latency})`}
                    </p>
                ) : (
                    <p className="text-[10px] text-slate-400 mt-1">Ready to ping server...</p>
                )}
            </div>
            <Button size="sm" variant="secondary" onClick={handleTestConnection} isLoading={isTesting}>
                {isTesting ? 'Pinging...' : 'Test Connection'}
            </Button>
        </div>

        <div className="max-h-[300px] overflow-y-auto border border-slate-200 rounded-xl bg-white p-2 space-y-1 custom-scrollbar">
           {logs.length === 0 ? (
               <div className="p-8 text-center text-slate-400 italic text-xs">No logs recorded yet. Try saving a client.</div>
           ) : (
               logs.map((log) => (
                   <div key={log.id} className={`p-2 rounded border text-xs font-mono flex gap-3 ${getLogColor(log.type)}`}>
                       <span className="opacity-50 whitespace-nowrap">{log.ts.split('T')[1].replace('Z','')}</span>
                       <div className="flex-1 min-w-0">
                           <span className="font-bold mr-2">[{log.stage}]</span>
                           <span className="break-all">{log.message}</span>
                           {log.data && (
                               <details className="mt-1">
                                   <summary className="cursor-pointer opacity-70 hover:opacity-100">View Payload</summary>
                                   <pre className="mt-1 p-2 bg-black/5 rounded overflow-x-auto max-w-full">
                                       {JSON.stringify(log.data, null, 2)}
                                   </pre>
                               </details>
                           )}
                       </div>
                   </div>
               ))
           )}
        </div>
      </div>
    </Modal>
  );
};

export default SaveDiagnosticsModal;
