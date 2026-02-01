
import React, { useState, useEffect } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { GoogleGenAI } from '@google/genai';
import { Advisor, Client } from '../../../types';
import { INITIAL_PROFILE, INITIAL_CRM_STATE, INITIAL_EXPENSES, INITIAL_CPF, INITIAL_CASHFLOW, INITIAL_INSURANCE, INITIAL_INVESTOR, INITIAL_PROPERTY, INITIAL_WEALTH, INITIAL_RETIREMENT, INITIAL_NINE_BOX } from '../../../contexts/ClientContext';
import { useAuth } from '../../../contexts/AuthContext';
import { adminDb } from '../../../lib/db/admin';
import { db } from '../../../lib/db';
import { generateRefCode, fmtSGD, toNum, parseDob } from '../../../lib/helpers';
import { supabase } from '../../../lib/supabase';

interface LeadImporterProps {
  advisors: Advisor[];
  onClose: () => void;
  onImport: (clients: Client[]) => void;
}

const DESTINATION_FIELDS = [
  { key: 'name', label: 'Full Name', required: true },
  { key: 'phone', label: 'Phone Number', required: true },
  { key: 'email', label: 'Email Address' },
  { key: 'company', label: 'Company / Source' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'gender', label: 'Gender' },
  { key: 'dob', label: 'Date of Birth' },
  { key: 'monthlyInvestmentAmount', label: 'Savings/Investment' },
  { key: 'value', label: 'Deal Value (Revenue)' },
  { key: 'retirementAge', label: 'Retirement Age' },
  { key: 'goals', label: 'Goals / Context' },
  { key: 'status', label: 'Status' },
  { key: 'source', label: 'Platform Source' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'notes', label: 'Notes' }
];

const NAME_EXCLUSIONS = ['male', 'female', 'fb', 'ig', 'facebook', 'instagram', 'new', 'contacted', 'leads', 'sg', 'sgp', 'singapore', 'travel', 'start', 'v1', 'v2', 'v3', 'ads'];

export const LeadImporter: React.FC<LeadImporterProps> = ({ advisors, onClose, onImport }) => {
  const { user } = useAuth();
  const toast = useToast();
  
  const [step, setStep] = useState<'input' | 'mapping' | 'preview' | 'success'>('input');
  const [rawText, setRawText] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [isMappingAi, setIsMappingAi] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importCount, setImportCount] = useState(0);
  
  const [targetAdvisorId, setTargetAdvisorId] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [campaignOptions, setCampaignOptions] = useState<string[]>([]);
  
  const [preparedClients, setPreparedClients] = useState<(Client & { isDuplicate?: boolean })[]>([]);
  const [existingPhones, setExistingPhones] = useState<Set<string>>(new Set());
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  useEffect(() => {
    const loadData = async () => {
        if (!user) return;
        const settings = await adminDb.getSystemSettings(user?.organizationId);
        if (settings?.appSettings?.campaigns) setCampaignOptions(settings.appSettings.campaigns);

        if (supabase) {
            try {
                const { data } = await supabase.from('clients').select('data');
                if (data) {
                    const phoneSet = new Set<string>();
                    data.forEach((row: any) => {
                        const p = row.data.phone || row.data.profile?.phone;
                        if (p) phoneSet.add(String(p).replace(/\D/g, ''));
                    });
                    setExistingPhones(phoneSet);
                }
            } catch (e) {}
        }
    };
    loadData();
  }, [user]);

  useEffect(() => {
      if (advisors.length === 1 && !targetAdvisorId) setTargetAdvisorId(advisors[0].id);
  }, [advisors, targetAdvisorId]);

  const handleParse = () => {
    if (!rawText.trim()) { toast.error("Please paste some data first."); return; }
    const lines = rawText.trim().split('\n');
    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    
    let parsedHeaders = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    let parsedRows = lines.slice(1).map(line => line.split(delimiter).map(cell => cell.trim().replace(/^"|"$/g, ''))).filter(row => row.length > 0 && row.some(cell => cell));
    
    const firstRowLooksLikeData = parsedHeaders.some(h => 
        h.includes('p:+') || 
        h.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/) || 
        h.toLowerCase() === 'ig' || 
        h.toLowerCase() === 'fb' || 
        h.includes('$') ||
        h.includes('@')
    );
    
    let finalHeaders = parsedHeaders;
    let finalRows = parsedRows;
    
    if (lines.length > 0 && (parsedRows.length === 0 || firstRowLooksLikeData)) {
        finalRows = lines.map(line => line.split(delimiter).map(cell => cell.trim().replace(/^"|"$/g, ''))).filter(row => row.length > 0);
        finalHeaders = Array.from({ length: finalRows[0]?.length || 0 }, (_, i) => `Column ${i + 1}`);
        toast.info("Data rows detected. Optimizing mapping.");
    }
    
    // CONTENT-BASED HEURISTICS FOR AUTO-MAPPING
    const autoHeuristics: Record<string, string> = {};
    if (finalRows.length > 0) {
        const firstRow = finalRows[0];
        
        // 1. Precise Detection Loop (Static Types)
        firstRow.forEach((cell, idx) => {
            const val = cell.toLowerCase().trim();
            const idxStr = idx.toString();
            
            // Gender
            if (val === 'male' || val === 'female') {
                if (!autoHeuristics['gender']) autoHeuristics['gender'] = idxStr;
            }
            // Phone (look for p:+ or long numeric strings)
            else if (val.includes('p:+') || (val.length >= 8 && val.match(/^\+?[\d\s-]{8,}$/))) {
                if (!autoHeuristics['phone']) autoHeuristics['phone'] = idxStr;
            }
            // Email
            else if (val.includes('@') && val.includes('.')) {
                if (!autoHeuristics['email']) autoHeuristics['email'] = idxStr;
            }
            // Date (DOB)
            else if (val.match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/)) {
                if (!autoHeuristics['dob']) autoHeuristics['dob'] = idxStr;
            }
            // Currency/Range (Investment)
            else if (val.includes('$') || val.includes('_to_')) {
                if (!autoHeuristics['monthlyInvestmentAmount']) autoHeuristics['monthlyInvestmentAmount'] = idxStr;
            }
            // Platform
            else if (val === 'fb' || val === 'ig' || val === 'facebook' || val === 'instagram') {
                if (!autoHeuristics['source']) autoHeuristics['source'] = idxStr;
            }
            // NEW: Campaign / Tracking ID detection (e.g. "start travel v1")
            else if (val.includes('v1') || val.includes('v2') || val.includes('start') || val.includes('ads')) {
                if (!autoHeuristics['campaign']) autoHeuristics['campaign'] = idxStr;
            }
        });

        // 2. Name Detection (More robust: exclude already mapped columns and campaign strings)
        const nameIdx = firstRow.findIndex((cell, idx) => {
            const val = cell.toLowerCase().trim();
            const isMapped = Object.values(autoHeuristics).includes(idx.toString());
            
            // Specifically check exclusions and common name characteristics
            const isExcluded = NAME_EXCLUSIONS.some(ex => val.includes(ex));
            const hasMultipleWords = cell.trim().split(/\s+/).length >= 2;
            const looksLikeName = cell.length >= 3 && cell.length < 50 && cell.match(/^[A-Za-z\s\-']+$/);
            
            return !isMapped && !isExcluded && looksLikeName && hasMultipleWords;
        });
        
        if (nameIdx !== -1) {
            autoHeuristics['name'] = nameIdx.toString();
        } else {
            // Fallback to first text column if no multi-word candidate found
            const fallbackIdx = firstRow.findIndex((cell, idx) => {
                const isMapped = Object.values(autoHeuristics).includes(idx.toString());
                const isExcluded = NAME_EXCLUSIONS.some(ex => cell.toLowerCase().includes(ex));
                return !isMapped && !isExcluded && cell.length > 2 && cell.match(/^[A-Za-z\s\-']+$/);
            });
            if (fallbackIdx !== -1) autoHeuristics['name'] = fallbackIdx.toString();
        }

        // 3. Secondary Text detection (Job Title / Company)
        // Usually found in later columns (Index 9+ in common formats)
        const jobIdx = firstRow.findIndex((cell, idx) => {
            const isMapped = Object.values(autoHeuristics).includes(idx.toString());
            const val = cell.toLowerCase().trim();
            // Look for non-numeric, non-exclusion text that isn't the name
            return !isMapped && cell.length > 3 && !NAME_EXCLUSIONS.some(ex => val.includes(ex)) && idx >= (nameIdx === -1 ? 0 : nameIdx + 1);
        });

        if (jobIdx !== -1) {
            autoHeuristics['jobTitle'] = jobIdx.toString();
            // Check next for company
            const companyIdx = firstRow.findIndex((cell, idx) => {
                const isMapped = Object.values(autoHeuristics).includes(idx.toString());
                return !isMapped && cell.length >= 2 && idx > jobIdx;
            });
            if (companyIdx !== -1) autoHeuristics['company'] = companyIdx.toString();
        }
    }

    setHeaders(finalHeaders);
    setRows(finalRows);
    setMappings(autoHeuristics);
    setStep('mapping');
  };

  const handleAiAutoMap = async () => {
    setIsMappingAi(true);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const sampleRows = rows.slice(0, 5).map(r => r.join(' | ')).join('\n');
        const prompt = `Match the following lead data columns to system fields.
        Headers: ${JSON.stringify(headers)}
        Sample Data:\n${sampleRows}\n
        Target fields: ${JSON.stringify(DESTINATION_FIELDS.map(f => f.key))}
        
        Rules:
        - Columns with "p:+65" are 'phone'.
        - Names like "Isabel Siew" are 'name'.
        - Ranges like "$1000_to_$2000" are 'monthlyInvestmentAmount'.
        - Single letters like 'fb' or 'ig' are 'source' or 'company'.
        - Dates are 'dob'.
        
        Return a simple JSON object mapping { fieldKey: headerIndex }`;
        
        const response = await ai.models.generateContent({ 
            model: 'gemini-3-flash-preview', 
            contents: prompt, 
            config: { responseMimeType: "application/json" } 
        });

        const mappingResult = JSON.parse(response.text || '{}');
        const newMappings = { ...mappings };
        Object.entries(mappingResult).forEach(([key, val]) => { 
            const idx = Number(val); 
            if (!isNaN(idx) && idx >= 0 && idx < headers.length) {
                newMappings[key] = String(idx); 
            }
        });
        setMappings(newMappings);
        toast.success("AI Mapping Profile Generated");
    } catch (e) { 
        toast.error("AI Mapping failed. Please map manually."); 
    } finally { 
        setIsMappingAi(false); 
    }
  };

  const generatePreviewData = () => {
    const targetAdvisor = advisors.find(a => a.id === targetAdvisorId);
    if (!targetAdvisor) { toast.error("Please select an advisor."); return; }

    const newClients = rows.map(row => {
        const getVal = (key: string) => { 
            const idx = parseInt(mappings[key]); 
            return (isNaN(idx) || !row[idx]) ? '' : row[idx]; 
        };

        const rawPhone = getVal('phone');
        const cleanPhone = rawPhone.replace(/[^\d]/g, '');
        const isDuplicate = existingPhones.has(cleanPhone);
        
        const name = getVal('name') || `Lead ${cleanPhone.slice(-4) || 'New'}`;
        const rawInvestment = getVal('monthlyInvestmentAmount');
        const investmentVal = toNum(rawInvestment);
        
        const rawRetireAge = getVal('retirementAge');
        const retireAgeNum = parseInt(rawRetireAge.replace(/\D/g, ''));
        const hasQualitativeRetire = isNaN(retireAgeNum);

        const id = db.generateUuid();
        const now = new Date().toISOString();
        
        // Handle Campaigns
        const tags = [];
        if (selectedCampaign) tags.push(`Campaign: ${selectedCampaign}`);
        const mapCampaign = getVal('campaign');
        if (mapCampaign) tags.push(`Campaign: ${mapCampaign}`);
        
        const dobStr = getVal('dob');
        const parsedDob = parseDob(dobStr);
        
        const mappedSource = getVal('source');
        const mappedNotes = getVal('notes');

        return {
            ...INITIAL_CRM_STATE,
            expenses: { ...INITIAL_EXPENSES }, 
            cpfState: { ...INITIAL_CPF }, 
            cashflowState: { ...INITIAL_CASHFLOW }, 
            insuranceState: { ...INITIAL_INSURANCE }, 
            investorState: { ...INITIAL_INVESTOR }, 
            propertyState: { ...INITIAL_PROPERTY }, 
            wealthState: { ...INITIAL_WEALTH }, 
            retirement: { ...INITIAL_RETIREMENT },
            nineBoxState: { ...INITIAL_NINE_BOX },
            id, 
            referenceCode: generateRefCode(), 
            advisorId: targetAdvisorId, 
            organizationId: targetAdvisor.organizationId || 'org_default', 
            _ownerId: targetAdvisorId, 
            _ownerEmail: targetAdvisor.email,
            name, 
            phone: cleanPhone, 
            email: getVal('email'), 
            company: getVal('company'), 
            jobTitle: getVal('jobTitle'), 
            goals: getVal('goals'), 
            value: toNum(getVal('value')),
            platform: mappedSource, // Map Source to Platform
            lastUpdated: now, 
            stage: 'New Lead', 
            profile: { 
                ...INITIAL_PROFILE, 
                name, 
                phone: cleanPhone, 
                email: getVal('email'), 
                jobTitle: getVal('jobTitle'), 
                gender: getVal('gender').toLowerCase() as any,
                dob: parsedDob ? parsedDob.toISOString().split('T')[0] : '',
                monthlyInvestmentAmount: investmentVal.toString(), 
                retirementAge: (!hasQualitativeRetire ? retireAgeNum : 65).toString(), 
                tags 
            },
            followUp: { status: 'new', dealValue: getVal('value') },
            notes: [
                { id: `note_import_${id}`, content: `Source Data: ${row.join(' | ')}`, date: now, author: 'System' },
                ...(mappedNotes ? [{ id: `note_mapped_${id}`, content: mappedNotes, date: now, author: 'Import' }] : []),
                ...(hasQualitativeRetire && rawRetireAge ? [{ id: `note_retire_${id}`, content: `Client Target Timing: ${rawRetireAge}`, date: now, author: 'Import' }] : [])
            ],
            isDuplicate
        } as (Client & { isDuplicate?: boolean });
    });
    setPreparedClients(newClients); 
    setStep('preview');
  };

  const handleImport = async () => {
    if (!targetAdvisorId) return;
    setIsProcessing(true);
    try {
      const finalClients = skipDuplicates ? preparedClients.filter(c => !c.isDuplicate) : preparedClients;
      if (finalClients.length === 0) { onClose(); return; }
      onImport(finalClients as Client[]);
      setImportCount(finalClients.length);
      setStep('success'); 
    } catch (e: any) { toast.error("Import failed: " + e.message); } finally { setIsProcessing(false); }
  };

  // Helper to extract display value for dynamic table
  const getPreviewValue = (c: any, fieldKey: string) => {
      switch(fieldKey) {
          case 'name': return c.name;
          case 'phone': return c.phone;
          case 'email': return c.email;
          case 'company': return c.company;
          case 'jobTitle': return c.jobTitle;
          case 'gender': return c.profile?.gender;
          case 'dob': return c.profile?.dob;
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
    <Modal isOpen={true} onClose={onClose} title="Lead Distribution Engine"
      footer={<div className="flex gap-2 w-full justify-end">
          {step === 'input' && <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={handleParse} disabled={!rawText}>Process Data</Button></>}
          {step === 'mapping' && <><Button variant="ghost" onClick={() => setStep('input')}>Back</Button><Button variant="primary" onClick={generatePreviewData} disabled={!targetAdvisorId}>Preview Batch</Button></>}
          {step === 'preview' && <><Button variant="ghost" onClick={() => setStep('mapping')}>Back</Button><Button variant="primary" onClick={handleImport} isLoading={isProcessing} leftIcon="🚀">Confirm Distribution</Button></>}
          {step === 'success' && <Button variant="primary" onClick={onClose}>Close</Button>}
      </div>}>
      <div className="space-y-6">
        {step === 'input' && (
          <div className="space-y-4">
             <p className="text-xs text-slate-500 font-medium leading-relaxed">Paste row data from your CRM export or Spreadsheet. The system will auto-detect columns for mapping.</p>
             <textarea className="w-full h-60 bg-slate-50 border border-slate-300 rounded-2xl p-4 text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-100 transition-all resize-none shadow-inner" placeholder="Paste lead rows here..." value={rawText} onChange={(e) => setRawText(e.target.value)} />
          </div>
        )}
        
        {step === 'mapping' && (
            <div className="space-y-6 animate-fade-in">
                <div className="bg-indigo-900 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden border border-indigo-700">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-xl"></div>
                    <label className="text-[10px] font-black text-indigo-300 uppercase tracking-widest block mb-2">Primary Custodian</label>
                    <select 
                        className="w-full p-3 bg-indigo-800 border border-indigo-700 rounded-xl text-sm font-bold text-white outline-none focus:ring-2 focus:ring-white/20 transition-all" 
                        value={targetAdvisorId} 
                        onChange={(e) => setTargetAdvisorId(e.target.value)}
                    >
                        <option value="">-- Assign To Advisor --</option>
                        {advisors.map(adv => <option key={adv.id} value={adv.id}>{adv.name} ({adv.email})</option>)}
                    </select>
                </div>

                {/* DATA BLUEPRINT PREVIEW */}
                <div className="bg-slate-900 rounded-xl p-4 overflow-hidden border border-slate-700">
                    <div className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Data Blueprint (Row 1)
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

                <div className="relative">
                    <button 
                        onClick={handleAiAutoMap} 
                        disabled={isMappingAi} 
                        className={`w-full py-3.5 mb-4 bg-indigo-50 border-2 border-indigo-100 rounded-2xl text-indigo-700 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:bg-indigo-100 hover:border-indigo-200 active:scale-[0.98] ${isMappingAi ? 'animate-pulse' : ''}`}
                    >
                        <span>{isMappingAi ? '📡' : '✨'}</span>
                        {isMappingAi ? 'Analyzing Data Topology...' : 'Magic AI Auto-Map'}
                    </button>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar p-1">
                        {DESTINATION_FIELDS.map(f => (
                            <div key={f.key} className="space-y-1 group">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide group-focus-within:text-indigo-600 transition-colors">
                                    {f.label} {f.required && <span className="text-rose-500">*</span>}
                                </label>
                                <select 
                                    className={`w-full p-2.5 bg-slate-50 border-2 rounded-xl text-xs font-bold outline-none transition-all ${mappings[f.key] ? 'border-indigo-200 bg-white text-indigo-700' : 'border-transparent text-slate-500 focus:bg-white focus:border-indigo-100'}`}
                                    value={mappings[f.key] || ''} 
                                    onChange={e => setMappings({...mappings, [f.key]: e.target.value})}
                                >
                                    <option value="">(Skip Field)</option>
                                    {headers.map((h, i) => (
                                        <option key={i} value={i}>
                                            {h} {rows[0] && rows[0][i] && `(${rows[0][i].substring(0, 15)}${rows[0][i].length > 15 ? '...' : ''})`}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}
        
        {step === 'preview' && (
            <div className="space-y-4 animate-fade-in">
                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div>
                        <span className="text-xl font-black text-slate-800">{preparedClients.length}</span>
                        <span className="text-xs text-slate-500 font-bold ml-2 uppercase">Records detected</span>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-all">
                        <input type="checkbox" checked={skipDuplicates} onChange={e => setSkipDuplicates(e.target.checked)} className="accent-indigo-600" /> 
                        Skip {preparedClients.filter(c => c.isDuplicate).length} Duplicates
                    </label>
                </div>
                
                <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-inner max-h-[500px]">
                    <table className="w-full text-[10px] text-left whitespace-nowrap">
                        <thead className="bg-slate-50 border-b border-slate-100 font-black text-slate-400 uppercase sticky top-0 z-10">
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
        
        {step === 'success' && (
            <div className="text-center py-12 animate-scale-in">
                <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-4xl mb-6 mx-auto shadow-lg shadow-emerald-100">🎉</div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">Distribution Synchronized</h3>
                <p className="text-slate-500 text-sm mt-2 max-w-xs mx-auto font-medium">Successfully deployed <strong>{importCount}</strong> leads to the advisor's workspace.</p>
            </div>
        )}
      </div>
    </Modal>
  );
};
