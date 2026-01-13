
import React, { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { GoogleGenAI } from '@google/genai';
import { db } from '../../../lib/db';
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

  // Safe UUID Generator
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

    // Smart detection for headerless data
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

    // Initial Heuristic Mapping
    const newMappings: Record<string, string> = {};
    finalHeaders.forEach((h, idx) => {
        const lower = h.toLowerCase().trim().replace(/_/g, ' ');
        const idxStr = idx.toString();
        
        if (lower.includes('name')) newMappings['name'] = idxStr;
        else if (lower.includes('phone') || lower.includes('mobile')) newMappings['phone'] = idxStr;
        else if (lower.includes('email')) newMappings['email'] = idxStr;
        else if (lower.includes('company') || lower.includes('job') || lower.includes('title')) newMappings['company'] = idxStr;
        else if (lower.includes('saving') || lower.includes('investment')) newMappings['monthlyInvestmentAmount'] = idxStr;
        else if ((lower.includes('retire') && lower.includes('age')) || lower.includes('when_do_you')) newMappings['retirementAge'] = idxStr;
        else if (lower.includes('goal') || lower.includes('win')) newMappings['goals'] = idxStr;
        else if (lower.includes('status') || lower.includes('stage')) newMappings['status'] = idxStr;
        else if (lower.includes('campaign')) newMappings['campaign'] = idxStr;
        else if (lower.includes('source') || lower.includes('platform')) newMappings['source'] = idxStr;
        else if (lower.includes('note') || lower.includes('remarks')) newMappings['notes'] = idxStr;
    });

    setMappings(newMappings);
    setStep('mapping');

    // Auto trigger AI if headerless
    if (isHeaderless) {
        setTimeout(() => executeAiMapping(finalHeaders, finalRows, newMappings), 100);
    }
  };

  const executeAiMapping = async (currentHeaders: string[], currentRows: string[][], currentMappings: Record<string, string>) => {
    setIsMappingAi(true);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const sampleRow = currentRows.length > 0 ? currentRows[0].join(' | ') : '';
        
        const prompt = `
            Match CSV headers to system fields.
            Headers: ${JSON.stringify(currentHeaders)}
            Sample Data: ${sampleRow}
            Fields: ${JSON.stringify(DESTINATION_FIELDS.map(f => f.key))}
            
            Return JSON object { [fieldKey]: index_integer }.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        const result = JSON.parse(response.text || '{}');
        const merged = { ...currentMappings };
        
        Object.entries(result).forEach(([k, v]) => {
            if (v !== undefined && v !== null && String(v) !== '') {
                if (!isNaN(Number(v))) {
                    merged[k] = String(v);
                }
            }
        });
        
        setMappings(merged);
        toast.success("AI Mapping Applied");
    } catch (e) {
        // Silent error
    } finally {
        setIsMappingAi(false);
    }
  };

  const handleAiAutoMap = () => executeAiMapping(headers, rows, mappings);

  const getMappedValue = (row: string[], fieldKey: string) => {
      const colIndex = parseInt(mappings[fieldKey]);
      if (isNaN(colIndex) || !row[colIndex]) return '';
      return row[colIndex];
  };

  const handleImport = async () => {
      if (!user) return;
      setIsProcessing(true);
      
      try {
          const clientsToImport = rows.map(row => {
              const getValue = (key: string) => {
                  const idx = parseInt(mappings[key]);
                  return (idx >= 0 && row[idx]) ? row[idx] : '';
              };

              const rawName = getValue('name');
              const rawPhone = getValue('phone');
              
              // Fallback name if missing
              const name = rawName || `Lead ${rawPhone.replace(/\D/g, '') || 'Unknown'}`;
              
              const phone = rawPhone;
              const email = getValue('email');
              const company = getValue('company');
              const jobTitle = getValue('jobTitle');
              const statusRaw = getValue('status').toLowerCase();
              const notes = getValue('notes');
              
              let status = 'new';
              if (statusRaw.includes('contact')) status = 'contacted';
              if (statusRaw.includes('client')) status = 'client';
              
              const id = generateUUID();
              const now = new Date().toISOString();

              return {
                  ...INITIAL_CRM_STATE,
                  expenses: INITIAL_EXPENSES,
                  cpfState: INITIAL_CPF,
                  cashflowState: INITIAL_CASHFLOW,
                  insuranceState: INITIAL_INSURANCE,
                  investorState: INITIAL_INVESTOR,
                  propertyState: INITIAL_PROPERTY,
                  wealthState: INITIAL_WEALTH,
                  retirement: INITIAL_RETIREMENT,
                  customExpenses: [],
                  id,
                  advisorId: user.id,
                  _ownerId: user.id,
                  name,
                  phone,
                  email,
                  company,
                  jobTitle,
                  lastUpdated: now,
                  lastContact: now,
                  stage: 'New Lead',
                  profile: { 
                      ...INITIAL_PROFILE, 
                      name, phone, email, 
                      jobTitle,
                      monthlyInvestmentAmount: getValue('monthlyInvestmentAmount'),
                      retirementAge: getValue('retirementAge'), 
                  },
                  followUp: { status },
                  goals: getValue('goals'),
                  platform: getValue('source') || 'Import',
                  notes: notes ? [{ id: `note_${id}`, content: notes, date: now, author: 'Import' }] : []
              } as Client;
          });

          await db.createClientsBulk(clientsToImport, user.id);
          toast.success(`Imported ${clientsToImport.length} clients.`);
          onComplete();
      } catch (e: any) {
          toast.error("Import failed: " + e.message);
      } finally {
          setIsProcessing(false);
      }
  };

  // Active columns
  const activeFields = DESTINATION_FIELDS.filter(field => mappings[field.key]);

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Data Import Wizard"
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
                    <Button variant="primary" onClick={() => setStep('preview')} disabled={!mappings['name'] && !mappings['phone']}>
                        {(!mappings['name'] && !mappings['phone']) ? 'Map Name or Phone' : 'Next: Preview'}
                    </Button>
                </>
            )}
            {step === 'preview' && (
                <>
                    <Button variant="ghost" onClick={() => setStep('mapping')}>Back</Button>
                    <Button variant="primary" onClick={handleImport} isLoading={isProcessing}>Import {rows.length} Leads</Button>
                </>
            )}
        </div>
      }
    >
      <div className="space-y-6">
        {step === 'input' && (
            <div>
                <p className="text-xs text-slate-500 mb-2">Paste your CSV or Spreadsheet data (with headers) below.</p>
                <textarea
                    className="w-full h-60 bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                    placeholder={`Name,Phone,Email,Status\nJohn Doe,91234567,john@test.com,New`}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                />
            </div>
        )}

        {step === 'mapping' && (
            <div className="space-y-4">
                <div className="flex justify-between items-center bg-indigo-50 p-3 rounded-lg">
                    <p className="text-xs text-indigo-700 font-medium">Verify column mapping.</p>
                    <button 
                        onClick={handleAiAutoMap} 
                        disabled={isMappingAi}
                        className="text-[10px] font-bold bg-white text-indigo-600 px-3 py-1.5 rounded-lg shadow-sm hover:bg-indigo-50 transition-colors flex items-center gap-1 border border-indigo-100"
                    >
                        {isMappingAi ? 'Scanning...' : '✨ AI Re-Map'}
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {DESTINATION_FIELDS.map(field => (
                        <div key={field.key} className="space-y-1">
                            <label className={`text-[10px] font-bold uppercase flex items-center gap-1 ${field.required && !mappings[field.key] ? 'text-red-500' : 'text-slate-400'}`}>
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
                                    <option key={i} value={i}>
                                        {h} {rows[0] ? `(${rows[0][i]?.substring(0, 15)}...)` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {step === 'preview' && (
            <div className="flex flex-col h-[400px]">
                <div className="text-xs text-slate-500 mb-2 font-bold">Ready to import {rows.length} records.</div>
                <div className="border border-slate-200 rounded-xl overflow-hidden flex-1 flex flex-col">
                    <div className="overflow-auto flex-1">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 sticky top-0 z-10">
                                <tr>
                                    <th className="p-3 bg-slate-50 w-12">#</th>
                                    {activeFields.map(f => (
                                        <th key={f.key} className="p-3 bg-slate-50 whitespace-nowrap">{f.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {rows.map((row, i) => (
                                    <tr key={i} className="hover:bg-slate-50">
                                        <td className="p-3 text-slate-400 font-mono text-[10px]">{i + 1}</td>
                                        {activeFields.map(f => (
                                            <td key={f.key} className="p-3 whitespace-nowrap max-w-[200px] truncate">
                                                {getMappedValue(row, f.key) || '-'}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}
      </div>
    </Modal>
  );
};

export default ImportModal;
