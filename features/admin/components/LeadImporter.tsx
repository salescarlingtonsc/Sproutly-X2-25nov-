import React, { useState, useMemo } from 'react';
import { Advisor, Client, Stage, Sentiment } from '../../../types';
import { INITIAL_PROFILE, INITIAL_CASHFLOW, INITIAL_RETIREMENT, INITIAL_CRM_STATE, INITIAL_INSURANCE, INITIAL_INVESTOR, INITIAL_PROPERTY, INITIAL_WEALTH, INITIAL_CPF } from '../../../contexts/ClientContext';
import { toNum, getAge } from '../../../lib/helpers';
import { GoogleGenAI, Type } from "@google/genai";

interface LeadImporterProps {
  advisors: Advisor[];
  onImport: (newClients: Client[]) => void;
  onClose: () => void;
}

// Destination fields in Sproutly
const DESTINATION_FIELDS = [
  { key: 'name', label: 'Full Name', required: true },
  { key: 'jobTitle', label: 'Job Title', required: false },
  { key: 'phone', label: 'Phone Number', required: false },
  { key: 'email', label: 'Email Address', required: false },
  { key: 'gender', label: 'Gender', required: false },
  { key: 'dob', label: 'Date of Birth', required: false },
  { key: 'monthlySavings', label: 'Monthly Savings', required: false },
  { key: 'retirementAge', label: 'Target Retirement Age', required: false },
  { key: 'notes', label: 'Context / Survey Answer', required: false },
  { key: 'platform', label: 'Source / Platform', required: false },
  { key: 'campaign', label: 'Campaign Tag', required: false },
];

const CAMPAIGN_PRESETS = [
    "PS5 Giveaway", 
    "DJI Drone", 
    "Dyson Airwrap", 
    "Retirement eBook", 
    "Tax Masterclass"
];

export const LeadImporter: React.FC<LeadImporterProps> = ({ advisors, onImport, onClose }) => {
  const [selectedAdvisorId, setSelectedAdvisorId] = useState<string>(advisors[0]?.id || '');
  const [globalCampaign, setGlobalCampaign] = useState<string>('');
  const [rawData, setRawData] = useState('');
  const [step, setStep] = useState<'input' | 'mapping' | 'preview'>('input');
  
  // Parsed Raw Data
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  
  // Mapping State: destinationKey -> sourceHeaderIndex
  const [mappings, setMappings] = useState<Record<string, string>>({});

  // --- CLEANING UTILS ---
  
  const cleanPhoneNumber = (raw: string) => {
      if (!raw) return '';
      // Specific fix for "p:+65..." format from Excel exports
      let cleaned = raw.replace(/^p:/i, '').replace(/[^\d+]/g, '');
      
      // Standardize SG numbers
      if (cleaned.startsWith('8') && cleaned.length === 8) cleaned = '+65' + cleaned;
      if (cleaned.startsWith('9') && cleaned.length === 8) cleaned = '+65' + cleaned;
      if (cleaned.startsWith('6') && cleaned.length === 8) cleaned = '+65' + cleaned;
      
      return cleaned;
  };

  const cleanCurrency = (raw: string) => {
      if (!raw) return '0';
      // Handles "below_$500", "$1000_to_$2000", "$2000_&_above"
      const numbers = raw.match(/\d+/g);
      if (!numbers) return '0';
      
      // Strategy: Take the highest number found to be optimistic about potential
      const max = Math.max(...numbers.map(n => parseInt(n)));
      return max.toString();
  };

  const safeParseDate = (raw: string) => {
      if (!raw) return '';
      const clean = raw.trim();
      
      // Check for US format MM/DD/YYYY (e.g. 05/31/1988)
      // 31 is definitely day, so if 2nd part > 12, it is MM/DD/YYYY
      const parts = clean.split(/[\/\-]/);
      if (parts.length === 3) {
          const p0 = parseInt(parts[0]);
          const p1 = parseInt(parts[1]);
          const p2 = parseInt(parts[2]);
          
          const year = p2 > 100 ? p2 : p0 > 100 ? p0 : 2000; // Assume 4 digit year is year
          
          if (p1 > 12) {
              // Format is MM/DD/YYYY
              return new Date(year, parts[0] as any - 1, p1).toISOString().split('T')[0];
          } 
          if (p0 > 12) {
              // Format is DD/MM/YYYY
              return new Date(year, p1 - 1, p0).toISOString().split('T')[0];
          }
          
          // Ambiguous cases (e.g. 05/04/1990) -> Default to international DD/MM/YYYY unless known US source
          // But looking at dataset "05/31/1988", it implies US format sometimes appears.
          // Let's use JS date constructor which often defaults to MM/DD if ambiguous
          const d = new Date(clean);
          if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      }
      return '';
  };

  const parseRetirement = (raw: string, dob: string) => {
      if (!raw) return '65';
      const clean = raw.toLowerCase().trim();
      
      // Handle "Never"
      if (clean.includes('never')) return '100';

      // Handle "In the next X years"
      const relativeMatch = clean.match(/next (\d+)/);
      if (relativeMatch) {
          const yearsToGo = parseInt(relativeMatch[1]);
          const currentAge = dob ? getAge(dob) : 30; // Fallback to 30 if age unknown
          return (currentAge + yearsToGo).toString();
      }

      // Handle "2027" (Year)
      if (parseInt(clean) > 1900 && parseInt(clean) < 2100) {
          const currentYear = new Date().getFullYear();
          const currentAge = dob ? getAge(dob) : 30;
          const targetYear = parseInt(clean);
          return (currentAge + (targetYear - currentYear)).toString();
      }

      // Handle "60" (Age)
      const numbers = clean.match(/\d+/);
      if (numbers) return numbers[0];

      return '65';
  };

  const handleParse = () => {
    if (!rawData.trim()) return;
    
    const lines = rawData.trim().split('\n');
    // Detect delimiter (Tab for Excel copy-paste, Comma for CSV)
    const firstLine = lines[0];
    const delimiter = firstLine.includes('\t') ? '\t' : ',';

    const parsedHeaders = firstLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    const parsedRows = lines.slice(1)
        .map(line => line.split(delimiter).map(cell => cell.trim().replace(/^"|"$/g, '')))
        .filter(row => row.length > 1); // Skip empty rows

    setHeaders(parsedHeaders);
    setRows(parsedRows);

    // INTELLIGENT AUTO-MAPPING
    const newMappings: Record<string, string> = {};
    parsedHeaders.forEach((header, index) => {
        const h = header.toLowerCase().replace(/_/g, ' ').replace(/[^\w\s]/g, ''); // Normalize
        const idxStr = index.toString();
        
        // Exact & Fuzzy Matches based on provided dataset
        if (h.includes('full name') || h === 'name') newMappings['name'] = idxStr;
        else if (h.includes('job') || h.includes('occupation')) newMappings['jobTitle'] = idxStr;
        else if (h.includes('phone') || h.includes('mobile')) newMappings['phone'] = idxStr;
        else if (h.includes('email')) newMappings['email'] = idxStr;
        else if (h.includes('gender') || h.includes('sex')) newMappings['gender'] = idxStr;
        else if (h.includes('dob') || h.includes('date of birth')) newMappings['dob'] = idxStr;
        
        else if (h.includes('savings') || h.includes('investment')) newMappings['monthlySavings'] = idxStr;
        else if (h.includes('retire')) newMappings['retirementAge'] = idxStr;
        
        else if (h.includes('platform') || h.includes('source')) newMappings['platform'] = idxStr;
        
        // Context/Notes: Catch-all for long questions (e.g. "why you want to win...")
        else if (h.length > 30 || h.includes('win') || h.includes('message') || h.includes('comment')) newMappings['notes'] = idxStr;
    });

    setMappings(newMappings);
    setStep('mapping');
  };

  const getMappedValue = (row: string[], fieldKey: string) => {
      const colIndex = parseInt(mappings[fieldKey]);
      if (isNaN(colIndex) || !row[colIndex]) return '';
      return row[colIndex];
  };

  // Preview the first 3 rows with cleaning applied
  const previewData = useMemo(() => {
      return rows.slice(0, 3).map(row => {
          const dob = safeParseDate(getMappedValue(row, 'dob'));
          
          return {
              name: getMappedValue(row, 'name'),
              jobTitle: getMappedValue(row, 'jobTitle'),
              phone: cleanPhoneNumber(getMappedValue(row, 'phone')),
              dob,
              savings: cleanCurrency(getMappedValue(row, 'monthlySavings')),
              retirement: parseRetirement(getMappedValue(row, 'retirementAge'), dob),
              notes: getMappedValue(row, 'notes'),
              platform: getMappedValue(row, 'platform')
          };
      });
  }, [rows, mappings]);

  const handleImport = () => {
    if (!selectedAdvisorId) {
      alert('Please select an advisor.');
      return;
    }

    try {
      const newClients: any[] = rows.map((row, idx) => {
        const name = getMappedValue(row, 'name') || 'Unknown Lead';
        const jobTitle = getMappedValue(row, 'jobTitle');
        const phone = cleanPhoneNumber(getMappedValue(row, 'phone'));
        const email = getMappedValue(row, 'email');
        const dobRaw = getMappedValue(row, 'dob');
        const dob = safeParseDate(dobRaw);
        const gender = getMappedValue(row, 'gender').toLowerCase().startsWith('f') ? 'female' : 'male';
        
        const platform = getMappedValue(row, 'platform') || 'Import';
        const campaign = getMappedValue(row, 'campaign') || globalCampaign;
        
        const savingsRaw = getMappedValue(row, 'monthlySavings');
        const savingsClean = cleanCurrency(savingsRaw);
        
        const retireRaw = getMappedValue(row, 'retirementAge');
        const retireClean = parseRetirement(retireRaw, dob);

        const notesRaw = getMappedValue(row, 'notes');
        
        // Construct rich notes
        const noteEntries = [];
        if (notesRaw) noteEntries.push({ id: `note_${Date.now()}_${idx}`, content: `Survey Answer: ${notesRaw}`, date: new Date().toISOString(), author: 'System' });
        if (savingsRaw) noteEntries.push({ id: `note_fin_${idx}`, content: `Declared Savings: ${savingsRaw}`, date: new Date().toISOString(), author: 'System' });
        if (retireRaw) noteEntries.push({ id: `note_ret_${idx}`, content: `Target Retire: ${retireRaw}`, date: new Date().toISOString(), author: 'System' });

        const tags = ['Imported', platform];
        if (campaign) tags.push(`Campaign: ${campaign}`);

        return {
          id: `imported_${Date.now()}_${idx}`,
          advisorId: selectedAdvisorId,
          _ownerId: selectedAdvisorId,
          
          name,
          company: jobTitle, // Map job title to company field for CRM view
          jobTitle,
          email,
          phone,
          
          stage: Stage.NEW,
          value: 0, // Unknown value initially
          lastContact: new Date().toISOString(),
          sentiment: Sentiment.UNKNOWN,
          momentumScore: 50,
          
          notes: noteEntries,
          tags,
          goals: notesRaw, // Use the long answer as the "Goal/Context"
          
          milestones: { createdAt: new Date().toISOString() },
          platform,
          
          profile: { 
              ...INITIAL_PROFILE, 
              name, 
              gender,
              email, 
              phone, 
              dob,
              jobTitle,
              retirementAge: retireClean,
              monthlyInvestmentAmount: savingsClean,
              tags
          },
          
          // Initialize financial states with defaults but inject savings if available
          cashflowState: { ...INITIAL_CASHFLOW, currentSavings: savingsClean !== '0' ? savingsClean : '' },
          insuranceState: INITIAL_INSURANCE,
          investorState: INITIAL_INVESTOR,
          propertyState: INITIAL_PROPERTY,
          wealthState: INITIAL_WEALTH,
          cpfState: INITIAL_CPF,
          retirement: { ...INITIAL_RETIREMENT }, // Standard defaults
          expenses: {},
          
          followUp: { status: 'new' },
          ...INITIAL_CRM_STATE
        };
      });

      onImport(newClients);
      onClose(); 
    } catch (e) {
      console.error(e);
      alert('Failed to process data. Check console.');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in">
        
        {/* HEADER */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-xl font-bold text-slate-800">Smart Data Ingest</h3>
            <div className="flex gap-2 mt-2">
               <span className={`text-[10px] uppercase font-bold px-3 py-1 rounded-full ${step === 'input' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>1. Paste Data</span>
               <span className="text-slate-300">→</span>
               <span className={`text-[10px] uppercase font-bold px-3 py-1 rounded-full ${step === 'mapping' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>2. Map Columns</span>
               <span className="text-slate-300">→</span>
               <span className={`text-[10px] uppercase font-bold px-3 py-1 rounded-full ${step === 'preview' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>3. Verify & Commit</span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 text-2xl">✕</button>
        </div>
        
        <div className="p-8 flex-1 overflow-y-auto bg-slate-50/30">
          
          {step === 'input' && (
              <div className="space-y-6 h-full flex flex-col">
                  <div className="bg-blue-50 p-5 rounded-xl border border-blue-100 flex gap-4 items-start">
                      <div className="text-3xl">📋</div>
                      <div>
                          <h4 className="text-sm font-bold text-blue-900 mb-1">Copy & Paste from Spreadsheet</h4>
                          <p className="text-xs text-blue-700 leading-relaxed max-w-2xl">
                              Select your cells in Excel, Google Sheets, or a CSV file (including the header row) and paste them into the box below. 
                              We will automatically handle tabs, commas, and special characters.
                          </p>
                      </div>
                  </div>

                  <div className="flex-1 flex flex-col">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Raw Data Buffer</label>
                    <textarea 
                      value={rawData}
                      onChange={(e) => setRawData(e.target.value)}
                      placeholder={`platform\tmy_savings_per_month\tjob_title\tfull name\tin_20_words_or_fewer... \nig\tbelow_$500\tStudent\tJohn Doe\tI want to win because...`}
                      className="w-full h-full min-h-[300px] p-4 bg-white border-2 border-slate-200 rounded-xl text-xs font-mono text-slate-700 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all resize-none placeholder:text-slate-300 whitespace-pre shadow-inner"
                    />
                  </div>
                  
                  <div className="flex justify-end pt-4 border-t border-slate-200">
                      <button 
                        onClick={handleParse} 
                        disabled={!rawData}
                        className="px-8 py-4 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 disabled:opacity-50 transition-all shadow-xl flex items-center gap-3 transform active:scale-95"
                      >
                        <span>Analyze & Map Columns</span>
                        <span>→</span>
                      </button>
                  </div>
              </div>
          )}

          {step === 'mapping' && (
              <div className="space-y-8">
                  <div className="flex flex-col md:flex-row gap-8 pb-8 border-b border-slate-200">
                      <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Assign Leads To</label>
                          <select 
                            value={selectedAdvisorId}
                            onChange={(e) => setSelectedAdvisorId(e.target.value)}
                            className="w-full p-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm"
                          >
                            {advisors.map(adv => (
                              <option key={adv.id} value={adv.id}>{adv.name} ({adv.email})</option>
                            ))}
                          </select>
                      </div>
                      
                      <div className="flex-1">
                          <label className="block text-xs font-bold text-emerald-600 uppercase mb-2">Batch Campaign (Optional)</label>
                          <div className="relative">
                              <input 
                                list="campaign-presets"
                                value={globalCampaign}
                                onChange={(e) => setGlobalCampaign(e.target.value)}
                                placeholder="e.g. PS5 Giveaway 2025"
                                className="w-full p-3 bg-emerald-50 border-2 border-emerald-100 rounded-xl text-sm font-bold text-emerald-900 focus:ring-2 focus:ring-emerald-500 outline-none transition-all shadow-sm placeholder-emerald-300/50"
                              />
                              <datalist id="campaign-presets">
                                {CAMPAIGN_PRESETS.map(c => <option key={c} value={c} />)}
                              </datalist>
                          </div>
                      </div>
                  </div>

                  <div>
                      <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                          <span>🧬</span> Map Data Fields
                          <span className="text-[10px] font-normal text-slate-400 ml-2 bg-slate-100 px-2 py-0.5 rounded">Detected {headers.length} columns</span>
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
                          {DESTINATION_FIELDS.map(field => (
                              <div key={field.key} className="flex flex-col gap-2">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                      {field.label}
                                      {field.required && <span className="text-red-500">*</span>}
                                  </label>
                                  <select
                                      value={mappings[field.key] || ''}
                                      onChange={(e) => setMappings({...mappings, [field.key]: e.target.value})}
                                      className={`w-full p-3 rounded-lg text-xs font-bold outline-none transition-all border-2 ${mappings[field.key] ? 'border-indigo-100 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-white text-slate-400'}`}
                                  >
                                      <option value="">-- Skip / Not Found --</option>
                                      {headers.map((h, i) => (
                                          <option key={i} value={i}>{h} (Column {i+1})</option>
                                      ))}
                                  </select>
                              </div>
                          ))}
                      </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-0 overflow-hidden shadow-sm mt-6">
                      <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex justify-between items-center">
                          <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Data Preview (First 3 Rows)</h4>
                          {globalCampaign && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">Applying Tag: {globalCampaign}</span>}
                      </div>
                      <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left">
                              <thead className="text-slate-500 font-bold border-b border-slate-100 bg-slate-50/50">
                                  <tr>
                                      <th className="py-3 px-4">Name</th>
                                      <th className="py-3 px-4">Phone (Cleaned)</th>
                                      <th className="py-3 px-4">Job Title</th>
                                      <th className="py-3 px-4 text-emerald-600">Savings</th>
                                      <th className="py-3 px-4 text-indigo-600 max-w-xs">Context (Notes)</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                  {previewData.map((row, i) => (
                                      <tr key={i} className="text-slate-700 hover:bg-slate-50">
                                          <td className="py-3 px-4 font-bold">{row.name || <span className="text-red-400 italic">Missing</span>}</td>
                                          <td className="py-3 px-4 font-mono text-emerald-600">{row.phone}</td>
                                          <td className="py-3 px-4">{row.jobTitle || '-'}</td>
                                          <td className="py-3 px-4 font-mono">${row.savings}</td>
                                          <td className="py-3 px-4 text-slate-500 italic truncate max-w-xs" title={row.notes}>{row.notes || <span className="text-slate-300">-</span>}</td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  </div>

                  <div className="flex justify-between pt-6 border-t border-slate-200">
                      <button 
                        onClick={() => setStep('input')} 
                        className="px-6 py-3 text-slate-500 font-bold hover:text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
                      >
                        ← Back to Paste
                      </button>
                      <button 
                        onClick={handleImport}
                        className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2"
                      >
                        <span>🚀</span> Commit {rows.length} Leads
                      </button>
                  </div>
              </div>
          )}

        </div>
      </div>
    </div>
  );
};