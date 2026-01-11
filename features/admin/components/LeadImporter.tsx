
import React, { useState } from 'react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { Advisor, Client } from '../../../types';
import { INITIAL_PROFILE, INITIAL_CRM_STATE } from '../../../contexts/ClientContext';
import { useToast } from '../../../contexts/ToastContext';

interface LeadImporterProps {
  advisors: Advisor[];
  onClose: () => void;
  onImport: (clients: Client[]) => void;
}

const DESTINATION_FIELDS = [
  { key: 'name', label: 'Full Name', required: true },
  { key: 'phone', label: 'Phone', required: false },
  { key: 'email', label: 'Email', required: false },
  { key: 'company', label: 'Company / Job Title', required: false },
  { key: 'status', label: 'Status', required: false },
  { key: 'notes', label: 'Notes / Context', required: false },
  { key: 'source', label: 'Source / Platform', required: false },
];

export const LeadImporter: React.FC<LeadImporterProps> = ({ advisors, onClose, onImport }) => {
  const toast = useToast();
  const [step, setStep] = useState<'input' | 'mapping' | 'preview'>('input');
  const [rawText, setRawText] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [targetAdvisorId, setTargetAdvisorId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

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
    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    
    const parsedHeaders = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    const parsedRows = lines.slice(1)
        .map(line => line.split(delimiter).map(cell => cell.trim().replace(/^"|"$/g, '')))
        .filter(row => row.length > 1 && row.some(cell => cell));

    setHeaders(parsedHeaders);
    setRows(parsedRows);

    // INTELLIGENT AUTO-MAPPING
    const newMappings: Record<string, string> = {};
    parsedHeaders.forEach((header, index) => {
        const h = header.toLowerCase().replace(/_/g, ' '); 
        const idxStr = index.toString();
        
        if (h.includes('name')) newMappings['name'] = idxStr;
        else if (h.includes('phone') || h.includes('mobile')) newMappings['phone'] = idxStr;
        else if (h.includes('email')) newMappings['email'] = idxStr;
        else if (h.includes('company') || h.includes('job') || h.includes('title')) newMappings['company'] = idxStr;
        else if (h.includes('status') || h.includes('stage')) newMappings['status'] = idxStr;
        else if (h.includes('note') || h.includes('remarks') || h.includes('context')) newMappings['notes'] = idxStr;
        else if (h.includes('source') || h.includes('platform')) newMappings['source'] = idxStr;
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
    if (!targetAdvisorId) {
        toast.error("Please select a target advisor.");
        return;
    }

    setIsProcessing(true);
    try {
      const newClients = rows.map(row => {
        const name = getMappedValue(row, 'name') || 'Unknown Lead';
        const phone = cleanPhoneNumber(getMappedValue(row, 'phone'));
        const email = getMappedValue(row, 'email');
        const company = getMappedValue(row, 'company');
        const statusRaw = getMappedValue(row, 'status').toLowerCase();
        const notes = getMappedValue(row, 'notes');
        const platform = getMappedValue(row, 'source') || 'Import';

        let status = 'new';
        if (statusRaw.includes('contact')) status = 'contacted';
        if (statusRaw.includes('client')) status = 'client';
        if (statusRaw.includes('lost')) status = 'not_keen';

        const id = generateUUID();
        const now = new Date().toISOString();

        return {
            ...INITIAL_CRM_STATE,
            id,
            advisorId: targetAdvisorId,
            _ownerId: targetAdvisorId,
            name,
            phone,
            email,
            company,
            platform,
            lastUpdated: now,
            lastContact: now,
            profile: { ...INITIAL_PROFILE, name, phone, email },
            followUp: { status },
            notes: notes ? [{ id: `note_${id}`, content: notes, date: now, author: 'Import' }] : []
        };
      });

      onImport(newClients);
      onClose();
    } catch (e: any) {
      toast.error("Import failed: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal 
      isOpen={true} 
      onClose={onClose} 
      title="Lead Distribution Engine"
      footer={
        <div className="flex gap-2 w-full justify-end">
            {step === 'input' && (
                <>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" onClick={handleParse} disabled={!rawText}>Next: Map Fields</Button>
                </>
            )}
            {step === 'mapping' && (
                <>
                    <Button variant="ghost" onClick={() => setStep('input')}>Back</Button>
                    <Button variant="primary" onClick={() => setStep('preview')}>Next: Preview</Button>
                </>
            )}
            {step === 'preview' && (
                <>
                    <Button variant="ghost" onClick={() => setStep('mapping')}>Back</Button>
                    <Button variant="primary" onClick={handleImport} isLoading={isProcessing} leftIcon="🚀" disabled={!targetAdvisorId}>
                        Assign & Import
                    </Button>
                </>
            )}
        </div>
      }
    >
      <div className="space-y-6">
        {step === 'input' && (
            <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <h4 className="font-bold text-slate-700 text-xs uppercase mb-2">Paste Data</h4>
                    <textarea
                        className="w-full h-48 bg-white border border-slate-300 rounded-lg p-3 text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                        placeholder={`Name,Phone,Email,Status\nJohn Doe,91234567,john@test.com,New`}
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                    />
                </div>
            </div>
        )}

        {step === 'mapping' && (
            <div className="space-y-4">
                <div className="bg-indigo-50 p-3 rounded-lg text-xs text-indigo-700 mb-4">
                    Confirm how your columns match the system fields.
                </div>
                <div className="grid grid-cols-2 gap-4 max-h-[400px] overflow-y-auto">
                    {DESTINATION_FIELDS.map(field => (
                        <div key={field.key} className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                                {field.label} {field.required && '*'}
                            </label>
                            <select
                                className="w-full p-2 rounded border border-slate-300 text-xs"
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
            <div className="space-y-6">
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Assign To Advisor</label>
                    <select 
                        className="w-full p-3 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                        value={targetAdvisorId}
                        onChange={(e) => setTargetAdvisorId(e.target.value)}
                    >
                        <option value="">-- Select Target --</option>
                        {advisors.map(adv => (
                            <option key={adv.id} value={adv.id}>{adv.name} ({adv.email})</option>
                        ))}
                    </select>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500">
                            <tr>
                                <th className="p-3">Name</th>
                                <th className="p-3">Phone</th>
                                <th className="p-3">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.slice(0, 5).map((row, i) => (
                                <tr key={i}>
                                    <td className="p-3 font-bold">{getMappedValue(row, 'name')}</td>
                                    <td className="p-3">{getMappedValue(row, 'phone')}</td>
                                    <td className="p-3">{getMappedValue(row, 'status') || 'New'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {rows.length > 5 && (
                        <div className="p-2 text-center text-[10px] text-slate-400 bg-slate-50">
                            ...and {rows.length - 5} more
                        </div>
                    )}
                </div>
            </div>
        )}
      </div>
    </Modal>
  );
};
