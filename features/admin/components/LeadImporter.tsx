
import React, { useState, useEffect } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { GoogleGenAI } from '@google/genai';
import { Advisor, Client } from '../../../types';
import { INITIAL_PROFILE, INITIAL_CRM_STATE, INITIAL_EXPENSES, INITIAL_CPF, INITIAL_CASHFLOW, INITIAL_INSURANCE, INITIAL_INVESTOR, INITIAL_PROPERTY, INITIAL_WEALTH, INITIAL_RETIREMENT } from '../../../contexts/ClientContext';
import { useAuth } from '../../../contexts/AuthContext';
import { adminDb } from '../../../lib/db/admin';
import { db } from '../../../lib/db';
import { generateRefCode, fmtSGD } from '../../../lib/helpers';
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
  { key: 'company', label: 'Company / Job' },
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
  const [isDbSyncing, setIsDbSyncing] = useState(true);

  const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      try { return crypto.randomUUID(); } catch(e) {}
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  useEffect(() => {
    const loadData = async () => {
        if (!user) return;
        setIsDbSyncing(true);
        const settings = await adminDb.getSystemSettings(user?.organizationId);
        if (settings?.appSettings?.campaigns) setCampaignOptions(settings.appSettings.campaigns);

        if (supabase) {
            try {
                const { data } = await supabase.from('clients').select('data');
                if (data) {
                    const phoneSet = new Set<string>();
                    const addVariations = (raw: any) => {
                        if (!raw) return;
                        const digits = String(raw).replace(/\D/g, '');
                        if (digits.length === 0) return;
                        phoneSet.add(digits);
                        if (digits.startsWith('65') && digits.length === 10) phoneSet.add(digits.substring(2));
                        else if (digits.length === 8 && (digits.startsWith('8') || digits.startsWith('9'))) phoneSet.add(`65${digits}`);
                    };
                    data.forEach((row: any) => { addVariations(row.data.phone); addVariations(row.data.profile?.phone); });
                    setExistingPhones(phoneSet);
                }
            } catch (e) {}
        }
        setIsDbSyncing(false);
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
    const firstRowLooksLikeData = parsedHeaders.some(h => h.includes('p:+') || h.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/) || h === 'ig' || h === 'fb' || h.includes('$') || (parsedHeaders.length > 3 && !h.toLowerCase().includes('name') && !h.toLowerCase().includes('email')));
    let finalHeaders = parsedHeaders; let finalRows = parsedRows;
    if (lines.length > 0 && (parsedRows.length === 0 || firstRowLooksLikeData)) {
        finalRows = lines.map(line => line.split(delimiter).map(cell => cell.trim().replace(/^"|"$/g, ''))).filter(row => row.length > 0);
        finalHeaders = Array.from({ length: finalRows[0]?.length || 0 }, (_, i) => `Column ${i + 1}`);
        toast.info("Raw data detected. Headerless mode.");
    }
    if (finalRows.length === 0) { toast.error("No valid data rows found."); return; }
    setHeaders(finalHeaders); setRows(finalRows);
    const newMappings: Record<string, string> = {};
    finalHeaders.forEach((header, index) => {
        const h = header.toLowerCase().trim().replace(/_/g, ' '); const idxStr = index.toString();
        if (h.includes('full name') || h === 'name') newMappings['name'] = idxStr;
        else if (h.includes('phone') || h.includes('mobile')) newMappings['phone'] = idxStr;
        else if (h.includes('email')) newMappings['email'] = idxStr;
        else if (h.includes('gender')) newMappings['gender'] = idxStr;
        else if (h.includes('birth') || h.includes('dob')) newMappings['dob'] = idxStr;
        else if (h.includes('job') || h.includes('occupation')) newMappings['jobTitle'] = idxStr;
        else if (h.includes('company')) newMappings['company'] = idxStr;
        else if (h.includes('savings') || h.includes('investment')) newMappings['monthlyInvestmentAmount'] = idxStr;
        else if ((h.includes('retire') && h.includes('age'))) newMappings['retirementAge'] = idxStr;
        else if (h.includes('goal')) newMappings['goals'] = idxStr;
        else if (h.includes('status')) newMappings['status'] = idxStr;
        else if (h.includes('source')) newMappings['source'] = idxStr;
        else if (h.includes('campaign')) newMappings['campaign'] = idxStr;
        else if (h.includes('value') || h.includes('revenue')) newMappings['value'] = idxStr;
    });
    setMappings(newMappings); setStep('mapping');
  };

  const handleAiAutoMap = async () => {
    setIsMappingAi(true);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const sampleRows = rows.slice(0, 3).map(r => r.join(' | ')).join('\n');
        const prompt = `Map each field: ${JSON.stringify(DESTINATION_FIELDS.map(f => f.key))} to header index in: ${JSON.stringify(headers)}. Data sample:\n${sampleRows}\nReturn JSON {field:index}`;
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt, config: { responseMimeType: "application/json" } });
        const mappingResult = JSON.parse(response.text || '{}');
        const newMappings = { ...mappings };
        Object.entries(mappingResult).forEach(([key, val]) => { const idx = Number(val); if (!isNaN(idx) && idx >= 0 && idx < headers.length) newMappings[key] = String(idx); });
        setMappings(newMappings);
        toast.success("AI Auto-Map Complete");
    } catch (e) { toast.error("AI Mapping failed."); } finally { setIsMappingAi(false); }
  };

  const generatePreviewData = () => {
    const targetAdvisor = advisors.find(a => a.id === targetAdvisorId);
    if (!targetAdvisor) { toast.error("Please select an advisor."); return; }

    const newClients = rows.map(row => {
        const getVal = (key: string) => { const idx = parseInt(mappings[key]); return (isNaN(idx) || !row[idx]) ? '' : row[idx]; };
        const phone = getVal('phone').replace(/[^\d+]/g, '');
        const checkDigits = phone.replace(/\D/g, '');
        const isDuplicate = existingPhones.has(checkDigits);
        const name = getVal('name') || `Lead ${checkDigits.slice(-4) || 'New'}`;
        const value = parseFloat(getVal('value').replace(/[^\d.]/g, '')) || 0;
        const id = generateUUID();
        const now = new Date().toISOString();
        const tags = [];
        if (selectedCampaign) tags.push(`Campaign: ${selectedCampaign}`);
        else if (getVal('campaign')) tags.push(`Campaign: ${getVal('campaign')}`);

        return {
            ...INITIAL_CRM_STATE,
            expenses: INITIAL_EXPENSES, cpfState: INITIAL_CPF, cashflowState: INITIAL_CASHFLOW, insuranceState: INITIAL_INSURANCE, investorState: INITIAL_INVESTOR, propertyState: INITIAL_PROPERTY, wealthState: INITIAL_WEALTH, retirement: INITIAL_RETIREMENT,
            id, referenceCode: generateRefCode(), 
            advisorId: targetAdvisorId, 
            organizationId: targetAdvisor.organizationId || 'org_default', // CRITICAL: Tag with advisor's org
            _ownerId: targetAdvisorId, _ownerEmail: targetAdvisor.email,
            name, phone, email: getVal('email'), company: getVal('company'), jobTitle: getVal('jobTitle'), goals: getVal('goals'), value,
            lastUpdated: now, stage: 'New Lead', 
            profile: { ...INITIAL_PROFILE, name, phone, email: getVal('email'), jobTitle: getVal('jobTitle'), monthlyInvestmentAmount: getVal('monthlyInvestmentAmount').replace(/[^\d]/g, ''), retirementAge: getVal('retirementAge').replace(/[^\d]/g, ''), tags },
            followUp: { status: 'new', dealValue: value.toString() },
            notes: getVal('notes') ? [{ id: `note_${id}`, content: getVal('notes'), date: now, author: 'Import' }] : [],
            isDuplicate
        } as (Client & { isDuplicate?: boolean });
    });
    setPreparedClients(newClients); setStep('preview');
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

  return (
    <Modal isOpen={true} onClose={onClose} title="Lead Distribution Engine"
      footer={<div className="flex gap-2 w-full justify-end">
          {step === 'input' && <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={handleParse} disabled={!rawText}>Next</Button></>}
          {step === 'mapping' && <><Button variant="ghost" onClick={() => setStep('input')}>Back</Button><Button variant="primary" onClick={generatePreviewData} disabled={!targetAdvisorId}>Preview</Button></>}
          {step === 'preview' && <><Button variant="ghost" onClick={() => setStep('mapping')}>Back</Button><Button variant="primary" onClick={handleImport} isLoading={isProcessing} leftIcon="🚀">Confirm Distribution</Button></>}
          {step === 'success' && <Button variant="primary" onClick={onClose}>Close</Button>}
      </div>}>
      <div className="space-y-6">
        {step === 'input' && <textarea className="w-full h-48 bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs font-mono outline-none" placeholder="Paste CSV/Data here..." value={rawText} onChange={(e) => setRawText(e.target.value)} />}
        {step === 'mapping' && (
            <div className="space-y-4">
                <select className="w-full p-3 bg-white border rounded-lg text-sm font-bold" value={targetAdvisorId} onChange={(e) => setTargetAdvisorId(e.target.value)}>
                    <option value="">-- Assign To Advisor --</option>
                    {advisors.map(adv => <option key={adv.id} value={adv.id}>{adv.name} ({adv.email})</option>)}
                </select>
                <div className="grid grid-cols-2 gap-4 h-64 overflow-y-auto pr-2 custom-scrollbar">
                    {DESTINATION_FIELDS.map(f => (
                        <div key={f.key}>
                            <label className="text-[10px] font-bold text-slate-400 uppercase">{f.label}</label>
                            <select className="w-full p-2 rounded border text-xs" value={mappings[f.key] || ''} onChange={e => setMappings({...mappings, [f.key]: e.target.value})}>
                                <option value="">(Skip)</option>
                                {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                            </select>
                        </div>
                    ))}
                </div>
            </div>
        )}
        {step === 'preview' && (
            <div className="space-y-4">
                <div className="flex justify-between items-center"><span className="text-xs text-slate-500">{preparedClients.length} rows</span><label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={skipDuplicates} onChange={e => setSkipDuplicates(e.target.checked)} /> Skip {preparedClients.filter(c => c.isDuplicate).length} Duplicates</label></div>
                <div className="border rounded-xl overflow-auto max-h-64"><table className="w-full text-[10px] text-left"><thead className="bg-slate-50 border-b"><tr><th className="p-2">Name</th><th className="p-2">Phone</th><th className="p-2">Value</th></tr></thead><tbody>{preparedClients.map((c, i) => (<tr key={i} className={c.isDuplicate ? 'bg-amber-50' : ''}><td className="p-2">{c.name}</td><td className="p-2">{c.phone}</td><td className="p-2">{fmtSGD(c.value)}</td></tr>))}</tbody></table></div>
            </div>
        )}
        {step === 'success' && <div className="text-center py-8"><div className="text-5xl mb-4">🎉</div><h3 className="text-xl font-bold">Import Complete</h3><p className="text-slate-500 text-sm">Queued <strong>{importCount}</strong> leads for advisor view.</p></div>}
      </div>
    </Modal>
  );
};
