import React, { useState, useEffect } from 'react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { db } from '../../../lib/db';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onComplete }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<any[]>([]);
  const [rawText, setRawText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'input' | 'preview'>('input');
  
  // Proxy Import State
  const [allAdvisors, setAllAdvisors] = useState<{id: string, email: string}[]>([]);
  const [targetUserId, setTargetUserId] = useState<string>(user?.id || '');

  useEffect(() => {
    if (isOpen && user?.role === 'admin') {
      fetchAdvisors();
    }
    if (user) setTargetUserId(user.id);
  }, [isOpen, user]);

  const fetchAdvisors = async () => {
    if (!supabase) return;
    const { data: profiles } = await supabase.from('profiles').select('id, email').order('email');
    if (profiles) setAllAdvisors(profiles);
  };
  
  const handleParse = () => {
    if (!rawText.trim()) return;
    
    const delimiter = rawText.includes('\t') ? '\t' : ',';
    const lines = rawText.trim().split('\n');
    const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());
    
    const nameIdx = headers.findIndex(h => h.includes('name'));
    const emailIdx = headers.findIndex(h => h.includes('email'));
    const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile'));
    const statusIdx = headers.findIndex(h => h.includes('status') || h.includes('stage'));

    const parsed = lines.slice(1).map(line => {
      const cells = line.split(delimiter);
      return {
        name: cells[nameIdx]?.trim() || '',
        email: cells[emailIdx]?.trim() || '',
        phone: cells[phoneIdx]?.trim() || '',
        status: cells[statusIdx]?.trim().toLowerCase() || 'new'
      };
    }).filter(row => row.name);

    if (parsed.length === 0) {
      toast.error("Format error: No names detected. Ensure headers include 'Name'.");
      return;
    }

    setData(parsed);
    setStep('preview');
  };

  const handleImport = async () => {
    if (!targetUserId) {
        toast.error("Please select a target advisor.");
        return;
    }
    setIsProcessing(true);
    try {
      const count = await db.createClientsBulk(data, targetUserId);
      const targetEmail = allAdvisors.find(a => a.id === targetUserId)?.email || 'the selected user';
      toast.success(`Successfully added ${count} leads to ${targetEmail}'s book.`);
      onComplete();
      onClose();
    } catch (e: any) {
      toast.error(`Import failed: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedAdvisorEmail = allAdvisors.find(a => a.id === targetUserId)?.email || user?.email;

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Lead Ingestion Engine"
      footer={
        step === 'input' ? (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={handleParse} disabled={!rawText}>Analyze Data</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setStep('input')}>Back</Button>
            <Button variant="primary" onClick={handleImport} isLoading={isProcessing}>Commit to {selectedAdvisorEmail?.split('@')[0]}</Button>
          </>
        )
      }
    >
      <div className="space-y-6">
        {step === 'input' ? (
          <>
            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex gap-4 items-start">
               <div className="text-xl">📥</div>
               <div>
                  <h4 className="text-[10px] font-black uppercase text-indigo-900 mb-1">Spreadsheet Ingest</h4>
                  <p className="text-[11px] text-indigo-700 leading-relaxed">
                    Copy rows from Google Sheets and paste below. The first row must contain headers (Name, Email, Phone).
                  </p>
               </div>
            </div>

            {user?.role === 'admin' && (
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Assign Leads To (Advisor)</label>
                <select 
                  className="w-full p-3 bg-slate-50 border-2 border-transparent rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                >
                  {allAdvisors.map(adv => (
                    <option key={adv.id} value={adv.id}>{adv.email} {adv.id === user.id ? '(You)' : ''}</option>
                  ))}
                </select>
              </div>
            )}

            <textarea
              className="w-full h-48 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-mono outline-none focus:bg-white focus:border-indigo-500 transition-all resize-none shadow-inner"
              placeholder="Paste spreadsheet rows here..."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
            />
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-end px-1">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Verify Lead Batch ({data.length})</h4>
                <div className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">Target: {selectedAdvisorEmail}</div>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-50 shadow-inner custom-scrollbar">
              {data.map((row, i) => (
                <div key={i} className="p-3 flex justify-between items-center text-[11px]">
                  <div>
                    <span className="font-bold text-slate-800">{row.name}</span>
                    <span className="text-slate-400 ml-2">{row.email || row.phone}</span>
                  </div>
                  <span className="text-[9px] font-black uppercase bg-slate-100 px-2 py-0.5 rounded text-slate-500">{row.status}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 italic text-center">Ready to commit. These records will be assigned to the selected advisor's book.</p>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ImportModal;