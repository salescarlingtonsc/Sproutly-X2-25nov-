import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { GoogleGenAI } from '@google/genai';
import { db } from '../../../lib/db';
// Added fmtSGD to imports
import { generateRefCode, fmtSGD } from '../../../lib/helpers';
import { INITIAL_PROFILE, INITIAL_CRM_STATE, INITIAL_EXPENSES, INITIAL_CPF, INITIAL_CASHFLOW, INITIAL_INSURANCE, INITIAL_INVESTOR, INITIAL_PROPERTY, INITIAL_WEALTH, INITIAL_RETIREMENT } from '../../../contexts/ClientContext';
import { Client } from '../../../types';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

const DESTINATION_FIELDS = [
  { key: 'name', label: 'Full Name', required: true },
  { key: 'phone', label: 'Phone Number', required: true },
  { key: 'email', label: 'Email Address' },
  { key: 'company', label: 'Company / Job' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'status', label: 'Status / Stage' },
  { key: 'value', label: 'Exp. Revenue / Deal Value' },
  { key: 'notes', label: 'Notes / Remarks' },
  { key: 'monthlyInvestmentAmount', label: 'Savings Amount' },
  { key: 'retirementAge', label: 'Retirement Age' },
  { key: 'goals', label: 'Goals / Context' },
  { key: 'source', label: 'Source / Platform' },
  { key: 'campaign', label: 'Campaign' }
];

const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onComplete }) => {
  const { user } = useAuth();
  const toast = useToast();
  
  const [step, setStep] = useState<'input' | 'mapping' | 'preview'>('input');
  const [rawText, setRawText] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [isMappingAi, setIsMappingAi] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [preparedClients, setPreparedClients] = useState<(Client & { isDuplicate?: boolean })[]>([]);
  const [existingPhones, setExistingPhones] = useState<Set<string>>(new Set());
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  useEffect(() => {
    if (isOpen && user) {
        db.getClients(user.id).then(clients => {
            const phones = new Set(clients.map(c => (c.phone || '').replace(/\D/g, '')).filter(p => p.length > 0));
            setExistingPhones(phones);
        });
    }
  }, [isOpen, user]);

  const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      try { return crypto.randomUUID(); } catch(e) {}
    }
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
    
    let parsedHeaders = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    let parsedRows = lines.slice(1)
        .map(line => line.split(delimiter).map(cell => cell.trim().replace(/^"|"$/g, '')))
        .filter(row => row.length > 0 && row.some(cell => cell));

    const firstRowLooksLikeData = parsedHeaders.some(h => 
        h.includes('p:+') || 
        h.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/) || 
        h === 'ig' || h === 'fb' ||
        h.includes('$') ||
        (parsedHeaders.length > 3 && !h.toLowerCase().includes('name'))
    );

    let finalHeaders = parsedHeaders;
    let finalRows = parsedRows;
    let isHeaderless = false;

    if (lines.length > 0 && (parsedRows.length === 0 || firstRowLooksLikeData)) {
        finalRows = lines.map(line => line.split(delimiter).map(cell => cell.trim().replace(/^"|"$/g, ''))).filter(row => row.length > 0);
        const colCount = finalRows[0]?.length || 0;
        finalHeaders = Array.from({ length: colCount }, (_, i) => `Column ${i + 1}`);
        isHeaderless = true;
        toast.info("Raw data detected. Switched to 'Headerless' mode.");
    }

    if (finalRows.length === 0) {
        toast.error("No data rows found.");
        return;
    }

    setHeaders(finalHeaders);
    setRows(finalRows);

    const newMappings: Record<string, string> = {};
    finalHeaders.forEach((h, idx) => {
        const lower = h.toLowerCase().trim().replace(/_/g, ' ');
        const idxStr = idx.toString();
        
        // Stricter Manual Heuristics to avoid "Age" mapping to "Value"
        if (lower.includes('name')) newMappings['name'] = idxStr;
        else if (lower.includes('phone') || lower.includes('mobile')) newMappings['phone'] = idxStr;
        else if (lower.includes('email')) newMappings['email'] = idxStr;
        else if (lower.includes('company') || lower.includes('job') || lower.includes('title')) newMappings['company'] = idxStr;
        else if ((lower.includes('retire') && lower.includes('age')) || lower.includes('when_do_you')) newMappings['retirementAge'] = idxStr;
        else if (lower.includes('status') || lower.includes('stage')) newMappings['status'] = idxStr;
        else if (lower.includes('value') || lower.includes('revenue')) {
            // IGNORE columns that are likely Age or Indexes
            if (!lower.includes('age') && !lower.startsWith('no.') && !lower.startsWith('s/n')) {
                newMappings['value'] = idxStr;
            }
        }
    });

    setMappings(newMappings);
    setStep('mapping');
  };

  const handleAiAutoMap = async () => {
    setIsMappingAi(true);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const sampleRow = rows.length > 0 ? rows[0].join(' | ') : '';
        
        const prompt = `
            Match CSV columns to system fields. 
            Headers: ${JSON.stringify(headers)}
            Sample Data Row: ${sampleRow}
            
            STRICT RULES:
            1. DO NOT map "Age", "No.", or "S/N" columns to "value" or "monthlyInvestmentAmount".
            2. "value" is for monetary estimates (e.g. $50,000).
            
            Return JSON object: { [fieldKey]: index_integer }.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        const result = JSON.parse(response.text || '{}');
        const merged = { ...mappings };
        
        Object.entries(result).forEach(([k, v]) => {
            if (v !== undefined && v !== null && !isNaN(Number(v))) {
                merged[k] = String(v);
            }
        });
        
        setMappings(merged);
        toast.success("AI Refined Mapping");
    } catch (e) {
        toast.error("AI Auto-Map failed.");
    } finally {
        setIsMappingAi(false);
    }
  };

  const generatePreviewData = () => {
      if (!user) return;
      
      const clients = rows.map(row => {
          const getValue = (key: string) => {
              const idx = parseInt(mappings[key]);
              return (idx >= 0 && row[idx]) ? row[idx] : '';
          };

          const rawName = getValue('name');
          const rawPhone = getValue('phone');
          const phone = rawPhone;
          const cleanPhone = phone.replace(/\D/g, '');
          const isDuplicate = existingPhones.has(cleanPhone);
          
          const valueStr = getValue('value').replace(/[^\d.]/g, '');
          const value = parseFloat(valueStr) || 0;

          const id = generateUUID();
          const now = new Date().toISOString();

          return {
              ...INITIAL_CRM_STATE,
              id,
              referenceCode: generateRefCode(), 
              advisorId: user.id,
              _ownerId: user.id,
              _ownerEmail: user.email,
              name: rawName || `Lead ${cleanPhone.slice(-4)}`,
              phone,
              email: getValue('email'),
              company: getValue('company'),
              value,
              lastUpdated: now,
              profile: { 
                  ...INITIAL_PROFILE, 
                  name: rawName || `Lead ${cleanPhone.slice(-4)}`, 
                  phone, 
                  email: getValue('email'),
                  monthlyInvestmentAmount: getValue('monthlyInvestmentAmount'),
                  retirementAge: getValue('retirementAge'), 
              },
              followUp: { status: 'new', dealValue: value > 0 ? value.toString() : '' },
              isDuplicate
          } as (Client & { isDuplicate?: boolean });
      });

      setPreparedClients(clients);
      setStep('preview');
  };

  const handleImport = async () => {
      if (!user) return;
      setIsProcessing(true);
      try {
          const finalClients = skipDuplicates 
            ? preparedClients.filter(c => !c.isDuplicate)
            : preparedClients;

          const cleanClients = finalClients.map(({ isDuplicate, ...rest }) => rest);
          await db.createClientsBulk(cleanClients as Client[], user.id);
          toast.success(`Imported ${cleanClients.length} clients.`);
          onComplete();
      } catch (e: any) {
          toast.error("Import failed: " + e.message);
      } finally {
          setIsProcessing(false);
      }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Data Import Wizard"
      footer={
        <div className="flex gap-2 w-full justify-end">
            {step === 'input' && <Button variant="primary" onClick={handleParse} disabled={!rawText}>Next: Map Fields</Button>}
            {step === 'mapping' && <Button variant="primary" onClick={generatePreviewData}>Next: Preview</Button>}
            {step === 'preview' && <Button variant="primary" onClick={handleImport} isLoading={isProcessing}>Confirm Import</Button>}
        </div>
      }
    >
      <div className="space-y-6">
        {step === 'input' && (
            <textarea
                className="w-full h-60 bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs font-mono outline-none"
                placeholder="Paste your CSV or Spreadsheet data here..."
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
            />
        )}

        {step === 'mapping' && (
            <div className="space-y-4">
                <button onClick={handleAiAutoMap} disabled={isMappingAi} className="w-full py-2 bg-indigo-50 text-indigo-600 font-bold rounded-lg text-xs hover:bg-indigo-100 mb-2">
                    {isMappingAi ? 'Scanning...' : '✨ Magic AI Auto-Map'}
                </button>
                <div className="grid grid-cols-1 gap-4 max-h-[300px] overflow-y-auto">
                    {DESTINATION_FIELDS.map(field => (
                        <div key={field.key} className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <label className="text-xs font-bold text-slate-500">{field.label}</label>
                            <select
                                className="p-1.5 rounded border text-xs font-bold w-48"
                                value={mappings[field.key] || ''}
                                onChange={(e) => setMappings({...mappings, [field.key]: e.target.value})}
                            >
                                <option value="">(Skip)</option>
                                {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                            </select>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {step === 'preview' && (
            <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold text-slate-500">
                    <span>{preparedClients.length} rows detected</span>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={skipDuplicates} onChange={e => setSkipDuplicates(e.target.checked)} /> Skip {preparedClients.filter(c => c.isDuplicate).length} Duplicates</label>
                </div>
                <div className="max-h-60 overflow-auto border rounded-lg">
                    <table className="w-full text-[10px] text-left">
                        <thead className="bg-slate-50 sticky top-0">
                            <tr><th className="p-2">Name</th><th className="p-2">Value ($)</th><th className="p-2">Phone</th></tr>
                        </thead>
                        <tbody>
                            {preparedClients.map((c, i) => (
                                <tr key={i} className={`border-t ${c.isDuplicate ? 'bg-amber-50' : ''}`}>
                                    <td className="p-2">{c.name}</td>
                                    {/* Added fmtSGD which was missing */}
                                    <td className="p-2 font-bold text-emerald-600">{c.value > 0 ? fmtSGD(c.value) : '-'}</td>
                                    <td className="p-2 text-slate-400">{c.phone}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
      </div>
    </Modal>
  );
};

export default ImportModal;