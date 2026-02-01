
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { GoogleGenAI } from '@google/genai';
import { db } from '../../../lib/db';
import { generateRefCode, fmtSGD, toNum, parseDob } from '../../../lib/helpers';
import { INITIAL_PROFILE, INITIAL_CRM_STATE, INITIAL_EXPENSES, INITIAL_CPF, INITIAL_CASHFLOW, INITIAL_INSURANCE, INITIAL_INVESTOR, INITIAL_PROPERTY, INITIAL_WEALTH, INITIAL_RETIREMENT, INITIAL_NINE_BOX } from '../../../contexts/ClientContext';
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

const NAME_EXCLUSIONS = ['male', 'female', 'fb', 'ig', 'facebook', 'instagram', 'new', 'contacted', 'leads', 'sg', 'sgp', 'singapore', 'travel', 'start', 'v1', 'v2', 'v3', 'ads'];

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
            const phones = new Set<string>(clients.map(c => (c.phone || '').replace(/\D/g, '')).filter(p => p.length > 0));
            setExistingPhones(phones);
        });
    }
  }, [isOpen, user]);

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
        h.toLowerCase() === 'ig' || 
        h.toLowerCase() === 'fb' ||
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
        toast.info("Headerless data detected. Running smart mapping.");
    }

    if (finalRows.length === 0) {
        toast.error("No data rows found.");
        return;
    }

    setHeaders(finalHeaders);
    setRows(finalRows);

    const newMappings: Record<string, string> = {};
    
    // HEURISTIC PHASE 1: BY HEADER NAMES (IF AVAILABLE)
    if (!isHeaderless) {
        finalHeaders.forEach((h, idx) => {
            const lower = h.toLowerCase().trim().replace(/_/g, ' ');
            const idxStr = idx.toString();
            
            if (lower.includes('name')) newMappings['name'] = idxStr;
            else if (lower.includes('phone') || lower.includes('mobile')) newMappings['phone'] = idxStr;
            else if (lower.includes('email')) newMappings['email'] = idxStr;
            else if (lower.includes('company') || lower.includes('job') || lower.includes('title')) newMappings['company'] = idxStr;
            else if ((lower.includes('retire') && lower.includes('age')) || lower.includes('when_do_you')) newMappings['retirementAge'] = idxStr;
            else if (lower.includes('status') || lower.includes('stage')) newMappings['status'] = idxStr;
            else if (lower.includes('value') || lower.includes('revenue')) {
                if (!lower.includes('age') && !lower.startsWith('no.') && !lower.startsWith('s/n')) {
                    newMappings['value'] = idxStr;
                }
            }
        });
    }

    // HEURISTIC PHASE 2: BY CONTENT (FALLBACK/ENHANCEMENT)
    if (finalRows.length > 0) {
        const firstRow = finalRows[0];
        
        // Detection Loop for static patterns
        firstRow.forEach((cell, idx) => {
            const val = cell.toLowerCase().trim();
            const idxStr = idx.toString();
            
            if (!newMappings['phone'] && (val.includes('p:+') || (val.length >= 8 && val.match(/^\+?[\d\s-]{8,}$/)))) {
                newMappings['phone'] = idxStr;
            }
            else if (!newMappings['email'] && val.includes('@') && val.includes('.')) {
                newMappings['email'] = idxStr;
            }
            else if (!newMappings['retirementAge'] && val.match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/)) {
                // Potential DOB
                if (!newMappings['dob']) newMappings['dob'] = idxStr;
            }
            else if (!newMappings['value'] && (val.includes('$') || (val.includes('_to_') && !newMappings['monthlyInvestmentAmount']))) {
                newMappings['value'] = idxStr;
            }
            else if (val.includes('v1') || val.includes('v2') || val.includes('start') || val.includes('ads')) {
                if (!newMappings['campaign']) newMappings['campaign'] = idxStr;
            }
        });

        // Name fallback: stricter multi-word check
        if (!newMappings['name']) {
            const nameIdx = firstRow.findIndex((cell, idx) => {
                const val = cell.toLowerCase().trim();
                const isMapped = Object.values(newMappings).includes(idx.toString());
                const isExcluded = NAME_EXCLUSIONS.some(ex => val.includes(ex));
                const hasMultipleWords = cell.trim().split(/\s+/).length >= 2;
                const looksLikeName = cell.length >= 3 && cell.length < 50 && cell.match(/^[A-Za-z\s\-']+$/);
                return !isMapped && !isExcluded && looksLikeName && hasMultipleWords;
            });
            if (nameIdx !== -1) newMappings['name'] = nameIdx.toString();
        }

        // Job Title fallback: first text column after name or phone
        if (!newMappings['jobTitle']) {
            const jobIdx = firstRow.findIndex((cell, idx) => {
                const isMapped = Object.values(newMappings).includes(idx.toString());
                const val = cell.toLowerCase().trim();
                return !isMapped && cell.length > 3 && !NAME_EXCLUSIONS.some(ex => val.includes(ex));
            });
            if (jobIdx !== -1) newMappings['jobTitle'] = jobIdx.toString();
        }
    }

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

          const id = db.generateUuid();
          const now = new Date().toISOString();
          
          const mappedCampaign = getValue('campaign');
          const tags = mappedCampaign ? [`Campaign: ${mappedCampaign}`] : [];
          
          const mappedSource = getValue('source');
          const mappedNotes = getValue('notes');

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
              jobTitle: getValue('jobTitle'),
              value,
              platform: mappedSource,
              goals: getValue('goals'),
              lastUpdated: now,
              profile: { 
                  ...INITIAL_PROFILE, 
                  name: rawName || `Lead ${cleanPhone.slice(-4)}`, 
                  phone, 
                  email: getValue('email'),
                  jobTitle: getValue('jobTitle'),
                  monthlyInvestmentAmount: getValue('monthlyInvestmentAmount'),
                  retirementAge: getValue('retirementAge'), 
                  tags
              },
              followUp: { status: 'new', dealValue: value > 0 ? value.toString() : '' },
              notes: [
                  ...(mappedNotes ? [{ id: `note_mapped_${id}`, content: mappedNotes, date: now, author: 'Import' }] : [])
              ],
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

  // Helper to extract display value for dynamic table
  const getPreviewValue = (c: any, fieldKey: string) => {
      switch(fieldKey) {
          case 'name': return c.name;
          case 'phone': return c.phone;
          case 'email': return c.email;
          case 'company': return c.company;
          case 'jobTitle': return c.jobTitle;
          case 'monthlyInvestmentAmount': return c.profile?.monthlyInvestmentAmount;
          case 'value': return c.value ? fmtSGD(c.value) : '';
          case 'retirementAge': return c.profile?.retirementAge;
          case 'goals': return c.goals;
          case 'status': return c.followUp?.status || c.stage;
          case 'source': return c.platform || '';
          case 'campaign': return c.profile?.tags?.find((t:string) => t.startsWith('Campaign:'))?.replace('Campaign: ', '') || '';
          case 'notes': return c.notes?.find((n:any) => n.id.startsWith('note_mapped'))?.content || '';
          default: return '';
      }
  };

  const activeFields = DESTINATION_FIELDS.filter(f => mappings[f.key]);

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

                {/* DATA BLUEPRINT PREVIEW */}
                <div className="bg-slate-900 rounded-xl p-4 overflow-hidden border border-slate-700">
                    <div className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Data Blueprint (First Row)
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                        {rows[0]?.map((cell, idx) => (
                            <div key={idx} className="shrink-0 bg-slate-800 border border-slate-700 rounded-lg p-2 min-w-[120px]">
                                <div className="text-[8px] font-bold text-slate-500 uppercase mb-1">Column {idx + 1}</div>
                                <div className="text-[10px] font-bold text-slate-200 truncate">{cell || <span className="opacity-30 italic">Empty</span>}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {DESTINATION_FIELDS.map(field => (
                        <div key={field.key} className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <label className="text-xs font-bold text-slate-500">{field.label}</label>
                            <select
                                className="p-1.5 rounded border text-xs font-bold w-56"
                                value={mappings[field.key] || ''}
                                onChange={(e) => setMappings({...mappings, [field.key]: e.target.value})}
                            >
                                <option value="">(Skip)</option>
                                {headers.map((h, i) => (
                                    <option key={i} value={i}>
                                        {h} {rows[0] && rows[0][i] && `(${rows[0][i].substring(0, 15)}...)`}
                                    </option>
                                ))}
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
                <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-inner max-h-[500px]">
                    <table className="w-full text-[10px] text-left whitespace-nowrap">
                        <thead className="bg-slate-50 sticky top-0 z-10 font-bold text-slate-500 uppercase">
                            <tr>
                                {activeFields.length > 0 ? activeFields.map(f => (
                                    <th key={f.key} className="p-3 bg-slate-50">{f.label}</th>
                                )) : (
                                    <>
                                        <th className="p-3">Name</th>
                                        <th className="p-3">Phone</th>
                                        <th className="p-3">Value</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {preparedClients.map((c, i) => (
                                <tr key={i} className={`hover:bg-slate-50 transition-colors ${c.isDuplicate ? 'bg-amber-50/50' : ''}`}>
                                    {activeFields.length > 0 ? activeFields.map(f => (
                                        <td key={f.key} className="p-3 border-r border-slate-50 last:border-0 max-w-[200px] truncate">
                                            {getPreviewValue(c, f.key)}
                                        </td>
                                    )) : (
                                        <>
                                            <td className="p-3 font-bold text-slate-700">{c.name}</td>
                                            <td className="p-3 font-mono text-slate-500">{c.phone}</td>
                                            <td className="p-3 text-right font-black text-emerald-600">{fmtSGD(c.value)}</td>
                                        </>
                                    )}
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
