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
import { generateRefCode } from '../../../lib/helpers';

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
  
  // Safety & Duplication
  const [preparedClients, setPreparedClients] = useState<(Client & { isDuplicate?: boolean })[]>([]);
  const [existingPhones, setExistingPhones] = useState<Set<string>>(new Set());
  const [skipDuplicates, setSkipDuplicates] = useState(true);

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

  useEffect(() => {
    const loadData = async () => {
        const settings = await adminDb.getSystemSettings(user?.organizationId);
        if (settings?.appSettings?.campaigns) {
            setCampaignOptions(settings.appSettings.campaigns);
        }
        const allClients = await db.getClients(); 
        const phones = new Set(allClients.map(c => (c.phone || '').replace(/\D/g, '')).filter(p => p.length > 0));
        setExistingPhones(phones);
    };
    loadData();
  }, [user]);

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
        h.includes('p:+') || h.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/) || h === 'ig' || h === 'fb' || h.includes('$') ||
        (parsedHeaders.length > 3 && !h.toLowerCase().includes('name') && !h.toLowerCase().includes('email'))
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
        toast.error("No valid data rows found.");
        return;
    }

    setHeaders(finalHeaders);
    setRows(finalRows);

    const newMappings: Record<string, string> = {};
    finalHeaders.forEach((header, index) => {
        const h = header.toLowerCase().trim().replace(/_/g, ' '); 
        const idxStr = index.toString();
        if (h.includes('full name') || h === 'name' || h === 'full_name') newMappings['name'] = idxStr;
        else if (h.includes('phone') || h.includes('mobile')) newMappings['phone'] = idxStr;
        else if (h.includes('email')) newMappings['email'] = idxStr;
        else if (h.includes('gender')) newMappings['gender'] = idxStr;
        else if (h.includes('birth') || h.includes('dob')) newMappings['dob'] = idxStr;
        else if (h.includes('job') || h.includes('occupation')) newMappings['jobTitle'] = idxStr;
        else if (h.includes('company')) newMappings['company'] = idxStr;
        else if (h.includes('savings') || h.includes('investment')) newMappings['monthlyInvestmentAmount'] = idxStr;
        else if ((h.includes('retire') && h.includes('age'))) newMappings['retirementAge'] = idxStr;
        else if (h.includes('goal') || h.includes('win')) newMappings['goals'] = idxStr;
        else if (h.includes('status') || h.includes('stage')) newMappings['status'] = idxStr;
        else if (h.includes('source') || h.includes('platform')) newMappings['source'] = idxStr;
        else if (h.includes('campaign')) newMappings['campaign'] = idxStr;
        else if (h.includes('value') || h.includes('revenue') || h.includes('amount')) newMappings['value'] = idxStr;
    });

    setMappings(newMappings);
    setStep('mapping');

    if (isHeaderless) {
        setTimeout(() => executeAiMapping(finalHeaders, finalRows, newMappings), 100);
    }
  };

  const executeAiMapping = async (currentHeaders: string[], currentRows: string[][], currentMappings: Record<string, string>) => {
    setIsMappingAi(true);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const sampleRow = currentRows.length > 0 ? currentRows[0].join(' | ') : '';
        const prompt = `Map CSV to CRM fields. Data: "${sampleRow}". Targets: ${JSON.stringify(DESTINATION_FIELDS.map(f => f.key))}. Return JSON {key:index}`;
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        const mappingResult = JSON.parse(response.text || '{}');
        const newMappings = { ...currentMappings };
        Object.entries(mappingResult).forEach(([key, val]) => {
            if (val !== undefined && val !== null && String(val) !== '' && !isNaN(Number(val))) newMappings[key] = String(val);
        });
        setMappings(newMappings);
        toast.success("AI Auto-Mapped Columns");
    } catch (e) {
        console.error("AI map fail", e);
    } finally {
        setIsMappingAi(false);
    }
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

  const generatePreviewData = () => {
    const targetAdvisor = advisors.find(a => a.id === targetAdvisorId);
    
    const newClients = rows.map(row => {
        const rawName = getMappedValue(row, 'name');
        const name = rawName || `Lead ${cleanPhoneNumber(getMappedValue(row, 'phone')) || 'Unknown'}`;
        const phone = cleanPhoneNumber(getMappedValue(row, 'phone'));
        const cleanPhone = phone.replace(/\D/g, '');
        const email = getMappedValue(row, 'email');
        const gender = getMappedValue(row, 'gender').toLowerCase().includes('fem') ? 'female' : 'male';
        const jobTitle = getMappedValue(row, 'jobTitle');
        const company = getMappedValue(row, 'company');
        const savings = getMappedValue(row, 'monthlyInvestmentAmount').replace(/[^\d]/g, '');
        const isDuplicate = existingPhones.has(cleanPhone);

        // --- ENHANCED DATE PARSING (DD/MM/YYYY Support) ---
        const dobRaw = getMappedValue(row, 'dob');
        let dob = '';
        if (dobRaw) {
            let d = new Date(dobRaw);
            // Try DD/MM/YYYY if ISO fails and slash present
            if (isNaN(d.getTime()) && dobRaw.includes('/')) {
                const parts = dobRaw.split('/');
                if (parts.length === 3) {
                    // Try DD/MM/YYYY
                    d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                }
            }
            // Validate result
            if (!isNaN(d.getTime())) dob = d.toISOString().split('T')[0];
            else dob = dobRaw; // Keep raw string if parsing fails entirely, so user sees something
        }

        let retireAgeStr = getMappedValue(row, 'retirementAge');
        let retireAge = 65;
        const val = parseInt(retireAgeStr.replace(/[^\d]/g, ''), 10);
        if (!isNaN(val)) retireAge = val;

        const valueStr = getMappedValue(row, 'value').replace(/[^\d.]/g, '');
        const value = parseFloat(valueStr) || 0;
        const goals = getMappedValue(row, 'goals');
        const campaignCol = getMappedValue(row, 'campaign');
        const statusRaw = getMappedValue(row, 'status').toLowerCase();
        const notes = getMappedValue(row, 'notes');
        const platform = getMappedValue(row, 'source') || 'Import';

        let status = 'new';
        if (statusRaw.includes('contact')) status = 'contacted';
        if (statusRaw.includes('client')) status = 'client';

        const id = generateUUID();
        const now = new Date().toISOString();
        const tags = [];
        if (selectedCampaign) tags.push(`Campaign: ${selectedCampaign}`);
        else if (campaignCol) tags.push(`Campaign: ${campaignCol}`);

        const uniqueRef = generateRefCode();

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
            referenceCode: uniqueRef,
            advisorId: targetAdvisorId,
            _ownerId: targetAdvisorId,
            _ownerEmail: targetAdvisor?.email,
            name,
            phone,
            email,
            company,
            jobTitle,
            platform,
            // Explicitly set `source` to match DESTINATION_FIELDS['source'] for the Preview Table
            source: platform, 
            goals,
            value,
            retirementAge: retireAge,
            lastUpdated: now,
            lastContact: now,
            stage: 'New Lead',
            profile: { ...INITIAL_PROFILE, name, phone, email, gender: gender as any, jobTitle, monthlyInvestmentAmount: savings, retirementAge: retireAge.toString(), dob, tags },
            tags: tags,
            // Explicitly set `campaign` to match DESTINATION_FIELDS['campaign'] for the Preview Table
            campaign: campaignCol,
            followUp: { status, dealValue: value.toString() },
            notes: notes ? [{ id: `note_${id}`, content: notes, date: now, author: 'Import' }] : [],
            appointments: {},
            documents: [],
            isDuplicate
        } as (Client & { isDuplicate?: boolean });
    });

    setPreparedClients(newClients);
    setStep('preview');
  };

  const handleImport = async () => {
    if (!targetAdvisorId) {
        toast.error("Please select a target advisor.");
        return;
    }
    setIsProcessing(true);
    try {
      const finalClients = skipDuplicates 
        ? preparedClients.filter(c => !c.isDuplicate)
        : preparedClients;

      if (finalClients.length === 0) {
         toast.info("No valid clients to distribute (duplicates skipped).");
         onClose();
         return;
      }

      // Remove temp fields before saving (though extra fields are generally harmless in JSONB)
      const cleanClients = finalClients.map(({ isDuplicate, source, campaign, ...rest }: any) => rest);

      onImport(cleanClients as Client[]);
      setImportCount(cleanClients.length);
      setStep('success'); 
    } catch (e: any) {
      toast.error("Import failed: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const activeFields = DESTINATION_FIELDS.filter(field => mappings[field.key]);
  const duplicateCount = preparedClients.filter(c => c.isDuplicate).length;

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
                    <Button variant="primary" onClick={generatePreviewData} disabled={(!mappings['name'] && !mappings['phone']) || !targetAdvisorId}>
                        {!targetAdvisorId ? 'Select Advisor' : 'Next: Preview & Validate'}
                    </Button>
                </>
            )}
            {step === 'preview' && (
                <>
                    <Button variant="ghost" onClick={() => setStep('mapping')}>Back</Button>
                    <Button variant="primary" onClick={handleImport} isLoading={isProcessing} leftIcon="🚀" disabled={!targetAdvisorId}>
                        Confirm Distribution ({skipDuplicates ? preparedClients.length - duplicateCount : preparedClients.length})
                    </Button>
                </>
            )}
            {step === 'success' && (
                <Button variant="primary" onClick={onClose}>Close & Refresh</Button>
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
                        placeholder={`Name,Phone,Email,Status,Value\nJohn Doe,91234567,john@test.com,New,5000`}
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                    />
                </div>
            </div>
        )}

        {step === 'mapping' && (
            <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
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
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Campaign Tag Override</label>
                        <select 
                            className="w-full p-3 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                            value={selectedCampaign}
                            onChange={(e) => setSelectedCampaign(e.target.value)}
                        >
                            <option value="">(Use CSV Column)</option>
                            {campaignOptions.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 max-h-[400px] overflow-y-auto custom-scrollbar">
                    {DESTINATION_FIELDS.map(field => (
                        <div key={field.key} className="space-y-1">
                            <label className={`text-[10px] font-bold uppercase ${field.required && !mappings[field.key] ? 'text-red-500' : 'text-slate-500'}`}>
                                {field.label} {field.required && '*'}
                            </label>
                            <select
                                className={`w-full p-2 rounded border text-xs ${mappings[field.key] ? 'bg-indigo-50 border-indigo-200 text-indigo-800' : 'border-slate-300'}`}
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
                <div className="flex justify-between items-center mb-2">
                    <div className="text-xs font-bold text-slate-500">Previewing {preparedClients.length} rows</div>
                    <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                        <input type="checkbox" checked={skipDuplicates} onChange={e => setSkipDuplicates(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer" />
                        <span className="text-[10px] font-bold text-slate-600 uppercase">Skip {duplicateCount} Duplicates</span>
                    </label>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden flex-1 flex flex-col">
                    <div className="overflow-auto flex-1">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 sticky top-0 z-10">
                                <tr>
                                    <th className="p-3 bg-slate-50 w-12">#</th>
                                    <th className="p-3 bg-slate-50 text-indigo-600 font-mono">System ID</th>
                                    {activeFields.map(field => (
                                        <th key={field.key} className="p-3 bg-slate-50 whitespace-nowrap">{field.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {preparedClients.map((client, i) => {
                                    const isDup = client.isDuplicate;
                                    const willSkip = isDup && skipDuplicates;
                                    return (
                                        <tr key={i} className={`hover:bg-slate-50 transition-colors ${willSkip ? 'opacity-40 bg-slate-100' : isDup ? 'bg-amber-50' : ''}`}>
                                            <td className="p-3 text-slate-400 font-mono text-[10px]">
                                                {willSkip ? 'SKIP' : i + 1}
                                            </td>
                                            <td className="p-3 font-mono text-[10px] font-bold text-indigo-600">
                                                {client.referenceCode}
                                                {isDup && <span className="ml-2 text-[8px] bg-amber-100 text-amber-700 px-1 rounded uppercase font-bold border border-amber-200">Duplicate</span>}
                                            </td>
                                            {activeFields.map(f => {
                                                // Check top-level (e.g. source, campaign, platform) then profile
                                                let val = (client as any)[f.key];
                                                if (!val && client.profile) val = (client.profile as any)[f.key];
                                                return (
                                                    <td key={f.key} className="p-3 whitespace-nowrap max-w-[200px] truncate">
                                                        {val || '-'}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {step === 'success' && (
            <div className="text-center py-8 space-y-4">
                <div className="text-5xl">🎉</div>
                <h3 className="text-xl font-bold text-slate-800">Import Complete</h3>
                <p className="text-slate-500 text-sm">
                    Successfully queued <strong>{importCount}</strong> leads for distribution.
                </p>
            </div>
        )}

      </div>
    </Modal>
  );
};