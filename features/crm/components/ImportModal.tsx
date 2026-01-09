
import React, { useState, useMemo } from 'react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { db } from '../../../lib/db';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';
import { INITIAL_PROFILE, INITIAL_CRM_STATE } from '../../../contexts/ClientContext';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

const DESTINATION_FIELDS = [
  { key: 'name', label: 'Full Name', required: true },
  { key: 'phone', label: 'Phone', required: false },
  { key: 'email', label: 'Email', required: false },
  { key: 'company', label: 'Company / Job Title', required: false },
  { key: 'status', label: 'Status', required: false },
  { key: 'notes', label: 'Notes / Context', required: false },
];

const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onComplete }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [rawText, setRawText] = useState('');
  const [step, setStep] = useState<'input' | 'mapping' | 'preview'>('input');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Parsing State
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});

  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const handleParse = () => {
    if (!rawText.trim()) {
        toast.error("Please paste some data first.");
        return;
    }
    
    const lines = rawText.trim().split('\n');
    const delimiter = lines[0].includes('\t') ? '\t' : ','; // Auto-detect tab or comma
    
    // Parse
    const parsedHeaders = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    const parsedRows = lines.slice(1)
        .map(line => line.split(delimiter).map(cell => cell.trim().replace(/^"|"$/g, '')))
        .filter(row => row.length > 1 && row.some(cell => cell)); // Skip empty rows

    setHeaders(parsedHeaders);
    setRows(parsedRows);

    // Auto-Map Logic
    const newMappings: Record<string, string> = {};
    parsedHeaders.forEach((h, idx) => {
        const lower = h.toLowerCase();
        const idxStr = idx.toString();
        
        if (lower.includes('name')) newMappings['name'] = idxStr;
        else if (lower.includes('phone') || lower.includes('mobile')) newMappings['phone'] = idxStr;
        else if (lower.includes('email')) newMappings['email'] = idxStr;
        else if (lower.includes('company') || lower.includes('job') || lower.includes('title')) newMappings['company'] = idxStr;
        else if (lower.includes('status') || lower.includes('stage')) newMappings['status'] = idxStr;
        else if (lower.includes('note') || lower.includes('remarks') || lower.includes('context')) newMappings['notes'] = idxStr;
    });

    setMappings(newMappings);
    setStep('mapping');
  };

  const getMappedValue = (row: string[], fieldKey: string) => {
      const colIndex = parseInt(mappings[fieldKey]);
      if (isNaN(colIndex) || !row[colIndex]) return '';
      return row[colIndex];
  };

  const cleanPhoneNumber = (raw: string) => {
      let cleaned = raw.replace(/[^\d+]/g, '');
      if (cleaned.startsWith('8') && cleaned.length === 8) cleaned = '+65' + cleaned;
      if (cleaned.startsWith('9') && cleaned.length === 8) cleaned = '+65' + cleaned;
      return cleaned;
  };

  const handleImport = async () => {
    setIsProcessing(true);
    try {
      const newClients = rows.map(row => {
        const name = getMappedValue(row, 'name') || 'Unknown Lead';
        const phone = cleanPhoneNumber(getMappedValue(row, 'phone'));
        const email = getMappedValue(row, 'email');
        const company = getMappedValue(row, 'company');
        const statusRaw = getMappedValue(row, 'status').toLowerCase();
        const notes = getMappedValue(row, 'notes');

        // Normalize status
        let status = 'new';
        if (statusRaw.includes('contact')) status = 'contacted';
        if (statusRaw.includes('client')) status = 'client';
        if (statusRaw.includes('lost')) status = 'not_keen';

        const id = generateUUID();
        const now = new Date().toISOString();

        return {
            ...INITIAL_CRM_STATE,
            id,
            advisorId: user?.id,
            _ownerId: user?.id,
            name,
            phone,
            email,
            company,
            lastUpdated: now,
            lastContact: now,
            profile: { ...INITIAL_PROFILE, name, phone, email },
            followUp: { status },
            notes: notes ? [{ id: `note_${id}`, content: notes, date: now, author: 'Import' }] : []
        };
      });

      await db.createClientsBulk(newClients, user?.id || '');
      toast.success(`Successfully imported ${newClients.length} leads.`);
      onComplete();
      onClose();
    } catch (e: any) {
      toast.error("Import failed: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const previewData = rows.slice(0, 3);

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Mass Import Utility"
      footer={
        <div className="flex gap-2 w-full justify-end">
            {step === 'input' && (
                <>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" onClick={handleParse} disabled={!rawText}>Next: Map Columns</Button>
                </>
            )}
            {step === 'mapping' && (
                <>
                    <Button variant="ghost" onClick={() => setStep('input')}>Back</Button>
                    <Button variant="primary" onClick={() => setStep('preview')}>Next: Verify</Button>
                </>
            )}
            {step === 'preview' && (
                <>
                    <Button variant="ghost" onClick={() => setStep('mapping')}>Back</Button>
                    <Button variant="primary" onClick={handleImport} isLoading={isProcessing} leftIcon="🚀">Import {rows.length} Leads</Button>
                </>
            )}
        </div>
      }
    >
      <div className="space-y-6">
        
        {/* PROGRESS STEPPER */}
        <div className="flex justify-between items-center px-4">
            <div className={`text-xs font-bold ${step === 'input' ? 'text-indigo-600' : 'text-slate-400'}`}>1. Paste</div>
            <div className="h-px w-8 bg-slate-200"></div>
            <div className={`text-xs font-bold ${step === 'mapping' ? 'text-indigo-600' : 'text-slate-400'}`}>2. Map</div>
            <div className="h-px w-8 bg-slate-200"></div>
            <div className={`text-xs font-bold ${step === 'preview' ? 'text-indigo-600' : 'text-slate-400'}`}>3. Verify</div>
        </div>

        {step === 'input' && (
            <div className="space-y-4">
                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex gap-4">
                    <div className="text-2xl">📋</div>
                    <div>
                        <h4 className="font-bold text-indigo-900 text-xs uppercase mb-1">Paste from Excel/Sheets</h4>
                        <p className="text-xs text-indigo-700 leading-relaxed">Copy your rows (including headers) and paste them below. We support tab-separated and comma-separated formats.</p>
                    </div>
                </div>
                <textarea
                    className="w-full h-48 p-4 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-mono focus:border-indigo-500 focus:outline-none resize-none placeholder-slate-400 whitespace-pre"
                    placeholder={`Name\tPhone\tEmail\tNotes\nJohn Doe\t91234567\tjohn@email.com\tMet at roadshow...`}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                />
            </div>
        )}

        {step === 'mapping' && (
            <div className="space-y-4">
                <p className="text-xs text-slate-500 font-medium">Match your spreadsheet columns to Sproutly fields.</p>
                <div className="grid grid-cols-2 gap-4">
                    {DESTINATION_FIELDS.map(field => (
                        <div key={field.key} className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                {field.label}
                                {field.required && <span className="text-red-500">*</span>}
                            </label>
                            <select
                                className={`w-full p-2.5 rounded-lg text-xs font-bold border-2 outline-none transition-all ${mappings[field.key] ? 'border-indigo-100 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500'}`}
                                value={mappings[field.key] || ''}
                                onChange={(e) => setMappings({...mappings, [field.key]: e.target.value})}
                            >
                                <option value="">(Skip)</option>
                                {headers.map((h, i) => (
                                    <option key={i} value={i}>{h}</option>
                                ))}
                            </select>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {step === 'preview' && (
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Data Preview ({rows.length} Rows)</h4>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500">
                            <tr>
                                <th className="p-3">Name</th>
                                <th className="p-3">Phone</th>
                                <th className="p-3">Email</th>
                                <th className="p-3">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {previewData.map((row, i) => (
                                <tr key={i} className="bg-white">
                                    <td className="p-3 font-bold text-slate-800">{getMappedValue(row, 'name') || '-'}</td>
                                    <td className="p-3 font-mono text-slate-600">{getMappedValue(row, 'phone') || '-'}</td>
                                    <td className="p-3 text-slate-600">{getMappedValue(row, 'email') || '-'}</td>
                                    <td className="p-3"><span className="bg-slate-100 px-2 py-0.5 rounded uppercase text-[9px] font-bold">New</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="text-center text-[10px] text-slate-400 italic">...and {rows.length - 3} more rows.</p>
            </div>
        )}

      </div>
    </Modal>
  );
};

export default ImportModal;
