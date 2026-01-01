
import React, { useState } from 'react';
import { Advisor, Client, Stage, Sentiment } from '../../../types';

interface LeadImporterProps {
  advisors: Advisor[];
  onImport: (newClients: Client[]) => void;
  onClose: () => void;
}

export const LeadImporter: React.FC<LeadImporterProps> = ({ advisors, onImport, onClose }) => {
  const [selectedAdvisorId, setSelectedAdvisorId] = useState<string>(advisors[0]?.id || '');
  const [rawData, setRawData] = useState('');
  const [error, setError] = useState('');

  const cleanPhoneNumber = (raw: string) => {
      // 1. Aggressively remove ALL non-digit characters (letters, +, -, spaces, parens, etc.)
      let cleaned = raw.replace(/\D/g, '');

      // 2. Remove leading '65' (Country Code) if it exists and results in a valid SG length (8 digits)
      if (cleaned.startsWith('65') && cleaned.length === 10) {
          cleaned = cleaned.substring(2);
      }
      
      return cleaned;
  };

  const cleanCurrency = (raw: string) => {
      // Remove '$', ',', and spaces to parse number correctly
      if (!raw) return 0;
      return parseFloat(raw.replace(/[$,\s]/g, '')) || 0;
  };

  const handleImport = () => {
    if (!rawData.trim()) {
      setError('Please paste some data first.');
      return;
    }
    if (!selectedAdvisorId) {
      setError('Please select an advisor.');
      return;
    }

    try {
      const rows = rawData.split('\n').filter(r => r.trim());
      
      // Validation: Check first row columns
      const firstRowCols = rows[0].split('\t');
      if (firstRowCols.length < 3) {
          setError('Format looks wrong. Ensure you copied columns from Google Sheets (Name, Company, Email...).');
          return;
      }

      const newClients: any[] = rows.map((row, idx) => {
        // STRICTLY split by Tab (\t) which is what Sheets/Excel uses on copy
        // This prevents "Company, Inc." from splitting into two columns
        const cols = row.split('\t').map(c => c.trim());
        
        const name = cols[0] || 'Unknown Lead';
        const company = cols[1] || 'Unknown Co';
        const email = cols[2] || '';
        
        let phone = '';
        let value = 0;

        // Handle varying column counts safely
        if (cols.length >= 5) {
             phone = cleanPhoneNumber(cols[3]);
             value = cleanCurrency(cols[4]);
        } else if (cols.length === 4) {
             // Assume Name, Company, Email, Value (No Phone)
             value = cleanCurrency(cols[3]);
        }
        
        // Return a partial client structure that will be finalized by the handler
        return {
          id: `imported_${Date.now()}_${idx}`,
          advisorId: selectedAdvisorId,
          _ownerId: selectedAdvisorId, // Sync internal prop
          name,
          company,
          email,
          phone,
          stage: Stage.NEW,
          value: value,
          lastContact: new Date().toISOString(),
          sentiment: Sentiment.UNKNOWN,
          momentumScore: 10,
          notes: [{ id: `note_${idx}`, content: 'Imported via Lead Manager', date: new Date().toISOString(), author: 'Admin' }],
          tags: ['Imported'],
          milestones: { createdAt: new Date().toISOString() },
          sales: [],
          familyMembers: [],
          policies: [],
          platform: 'Others',
          // Default deeply nested structures to avoid crashes
          profile: { name, email, phone, children: [] },
          expenses: {},
          followUp: { status: 'new' }
        };
      });

      onImport(newClients);
      // Removed the alert to keep flow fast, simply closing implies success
      onClose(); 
    } catch (e) {
      console.error(e);
      setError('Failed to parse data. Ensure you copied directly from a spreadsheet.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Bulk Import Leads</h3>
            <p className="text-xs text-slate-500">Optimized for Google Sheets & Excel Copy-Paste</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto">
          <div className="mb-6">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">1. Assign Leads To</label>
            <select 
              value={selectedAdvisorId}
              onChange={(e) => setSelectedAdvisorId(e.target.value)}
              className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            >
              {advisors.map(adv => (
                <option key={adv.id} value={adv.id}>{adv.name} ({adv.email})</option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
              2. Paste Data (Ctrl+V)
            </label>
            <div className="bg-emerald-50/50 p-3 rounded-lg mb-3 border border-emerald-100">
                <div className="flex justify-between items-center mb-1">
                    <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wide">Required Column Order:</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-700 font-mono overflow-x-auto pb-1">
                    <span className="bg-white px-2 py-1 rounded border shadow-sm whitespace-nowrap">1. Name</span>
                    <span className="text-slate-400">→</span>
                    <span className="bg-white px-2 py-1 rounded border shadow-sm whitespace-nowrap">2. Company</span>
                    <span className="text-slate-400">→</span>
                    <span className="bg-white px-2 py-1 rounded border shadow-sm whitespace-nowrap">3. Email</span>
                    <span className="text-slate-400">→</span>
                    <span className="bg-white px-2 py-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 font-bold shadow-sm whitespace-nowrap">4. Phone</span>
                    <span className="text-slate-400">→</span>
                    <span className="bg-white px-2 py-1 rounded border shadow-sm whitespace-nowrap">5. Est. Value</span>
                </div>
            </div>
            <textarea 
              value={rawData}
              onChange={(e) => setRawData(e.target.value)}
              placeholder={`Click here and press Ctrl+V to paste your spreadsheet rows...`}
              className="w-full h-48 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none placeholder:text-slate-400"
            />
            <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <strong>Smart Clean:</strong> We auto-remove currency symbols ($) and format phone numbers.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 text-rose-600 text-sm rounded-lg mb-4 flex items-center gap-2 border border-rose-100 animate-pulse">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {error}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-bold transition-colors">Cancel</button>
          <button onClick={handleImport} className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-bold shadow-md transition-all transform active:scale-95 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Import Leads
          </button>
        </div>
      </div>
    </div>
  );
};
