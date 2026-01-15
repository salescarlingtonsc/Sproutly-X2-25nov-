
import React, { useState, useMemo } from 'react';
import { Client, PortfolioItem } from '../../types';
import { fmtSGD, toNum } from '../../lib/helpers';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/layout/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { GoogleGenAI } from '@google/genai';

interface PortfolioTabProps {
  clients: Client[];
  onUpdateClient: (client: Client) => void;
}

const FREQUENCY_MULTIPLIERS: Record<string, number> = {
  'monthly': 12,
  'quarterly': 4,
  'half_yearly': 2,
  'yearly': 1,
  'lump_sum': 0
};

// --- HELPER FUNCTIONS ---

const calculateInvested = (p: PortfolioItem) => {
  // Priority: Manual Override (This fixes the calculation issue)
  if (p.totalInvested !== undefined && p.totalInvested !== null && p.totalInvested > 0) {
      return p.totalInvested;
  }

  if (p.frequency === 'lump_sum') return p.premium;
  
  const start = new Date(p.inceptionDate);
  const now = new Date();
  
  // Calculate months diff
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months--;
  months = Math.max(0, months);

  const years = months / 12;

  switch (p.frequency) {
    case 'monthly': return p.premium * (months + 1); // +1 for initial month
    case 'quarterly': return p.premium * (Math.floor(months / 3) + 1);
    case 'half_yearly': return p.premium * (Math.floor(months / 6) + 1);
    case 'yearly': return p.premium * (Math.floor(months / 12) + 1);
    default: return 0;
  }
};

const calculateCAGR = (invested: number, current: number, inception: string) => {
  if (invested <= 0 || current <= 0) return 0;
  const start = new Date(inception);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - start.getTime());
  const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25);
  
  if (diffYears < 1) return ((current - invested) / invested) * 100; // Simple return for <1 year
  
  return ((Math.pow(current / invested, 1 / diffYears) - 1) * 100);
};

const PortfolioTab: React.FC<PortfolioTabProps> = ({ clients, onUpdateClient }) => {
  const { user } = useAuth();
  const toast = useToast();
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  
  // Form State
  const [formPlanName, setFormPlanName] = useState('');
  const [formInsurer, setFormInsurer] = useState('');
  const [formInception, setFormInception] = useState('');
  const [formPremium, setFormPremium] = useState('');
  const [formFreq, setFormFreq] = useState<'monthly'|'yearly'|'lump_sum'>('monthly');
  const [formCurrentValue, setFormCurrentValue] = useState('');
  const [formInvestedOverride, setFormInvestedOverride] = useState(''); // New State for Override
  
  const [editingItem, setEditingItem] = useState<{clientId: string, item: PortfolioItem} | null>(null);
  
  const [analysisResult, setAnalysisResult] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Masking State
  const [maskNames, setMaskNames] = useState(false);

  // --- AGGREGATION ---
  const consolidatedData = useMemo(() => {
    let totalAUM = 0;
    let totalInvested = 0;
    const rows: any[] = [];

    clients.forEach(client => {
      if (!client.portfolios || client.portfolios.length === 0) return;

      client.portfolios.forEach(p => {
        const invested = calculateInvested(p);
        totalAUM += toNum(p.currentValue);
        totalInvested += invested;
        
        const pl = toNum(p.currentValue) - invested;
        const plPercent = invested > 0 ? (pl / invested) * 100 : 0;
        const cagr = calculateCAGR(invested, toNum(p.currentValue), p.inceptionDate);

        rows.push({
          id: p.id,
          clientId: client.id,
          clientName: client.profile.name || client.name,
          clientRef: client.referenceCode || client.id.substring(0, 6),
          advisor: client._ownerEmail?.split('@')[0] || 'Unassigned',
          plan: p.planName,
          insurer: p.insurer,
          inception: p.inceptionDate,
          premium: p.premium,
          freq: p.frequency,
          invested,
          current: toNum(p.currentValue),
          pl,
          plPercent,
          cagr,
          originalItem: p
        });
      });
    });

    return { totalAUM, totalInvested, rows: rows.sort((a, b) => b.current - a.current) };
  }, [clients]);

  const profitLossTotal = consolidatedData.totalAUM - consolidatedData.totalInvested;
  const overallReturn = consolidatedData.totalInvested > 0 ? (profitLossTotal / consolidatedData.totalInvested) * 100 : 0;

  // --- ACTIONS ---

  const handleSave = () => {
    if (!selectedClientId) { toast.error("Select a client"); return; }
    if (!formPlanName || !formPremium || !formCurrentValue) { toast.error("Missing fields"); return; }

    const client = clients.find(c => c.id === selectedClientId);
    if (!client) return;

    const newItem: PortfolioItem = {
      id: editingItem ? editingItem.item.id : `port_${Date.now()}`,
      planName: formPlanName,
      insurer: formInsurer,
      inceptionDate: formInception,
      premium: parseFloat(formPremium),
      frequency: formFreq as any,
      currentValue: parseFloat(formCurrentValue),
      totalInvested: formInvestedOverride ? parseFloat(formInvestedOverride) : undefined, // Save override value
      lastUpdated: new Date().toISOString()
    };

    let newPortfolios = [...(client.portfolios || [])];
    if (editingItem) {
       newPortfolios = newPortfolios.map(p => p.id === newItem.id ? newItem : p);
    } else {
       newPortfolios.push(newItem);
    }

    onUpdateClient({ ...client, portfolios: newPortfolios });
    closeModal();
    toast.success("Portfolio updated");
  };

  const openEdit = (row: any) => {
    setEditingItem({ clientId: row.clientId, item: row.originalItem });
    setSelectedClientId(row.clientId);
    setFormPlanName(row.plan);
    setFormInsurer(row.insurer);
    setFormInception(row.inception);
    setFormPremium(row.premium.toString());
    setFormFreq(row.freq);
    setFormCurrentValue(row.current.toString());
    // Load existing override or empty
    setFormInvestedOverride(row.originalItem.totalInvested ? row.originalItem.totalInvested.toString() : '');
    setIsAddModalOpen(true);
  };

  const closeModal = () => {
    setIsAddModalOpen(false);
    setEditingItem(null);
    setFormPlanName('');
    setFormInsurer('');
    setFormInception('');
    setFormPremium('');
    setFormCurrentValue('');
    setFormInvestedOverride('');
  };

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `
        Analyze this agency AUM data.
        Total AUM: ${fmtSGD(consolidatedData.totalAUM)}
        Total Invested: ${fmtSGD(consolidatedData.totalInvested)}
        P/L: ${fmtSGD(profitLossTotal)} (${overallReturn.toFixed(1)}%)
        
        Top 5 Holdings:
        ${consolidatedData.rows.slice(0, 5).map(r => `- ${r.plan} (${r.insurer}): ${fmtSGD(r.current)} (CAGR ${r.cagr.toFixed(1)}%)`).join('\n')}
        
        Provide a concise executive summary (3 bullet points) on portfolio health and 1 actionable advice for underperforming assets.
      `;
      
      const res = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      setAnalysisResult(res.text || "Analysis unavailable.");
    } catch (e) {
      toast.error("AI Analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-fade-in">
      <PageHeader 
        title="AUM & Portfolio Tracker" 
        icon="📈" 
        subtitle="Consolidated view of all Investment-Linked Policies under management."
        action={
          <div className="flex gap-2">
             <Button 
                variant="ghost" 
                onClick={() => setMaskNames(!maskNames)} 
                className={maskNames ? 'bg-indigo-50 text-indigo-600' : ''}
                leftIcon={maskNames ? '🙈' : '👁️'}
             >
                {maskNames ? 'Masked' : 'Mask Names'}
             </Button>
             <Button variant="secondary" onClick={runAnalysis} isLoading={isAnalyzing} leftIcon="🧠">
                AI Analyst
             </Button>
             <Button variant="primary" onClick={() => setIsAddModalOpen(true)} leftIcon="＋">
                Add Portfolio
             </Button>
          </div>
        }
      />

      {/* --- DASHBOARD CARDS --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-[60px]"></div>
            <div className="relative z-10">
               <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total AUM</p>
               <h2 className="text-4xl font-black tracking-tight">{fmtSGD(consolidatedData.totalAUM)}</h2>
               <p className="text-xs text-indigo-300 mt-2 font-medium">Assets Under Management</p>
            </div>
         </div>

         <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-center">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Net Performance</p>
            <div className={`text-3xl font-black ${profitLossTotal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
               {profitLossTotal >= 0 ? '+' : ''}{fmtSGD(profitLossTotal)}
            </div>
            <p className={`text-xs mt-2 font-bold ${overallReturn >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
               {overallReturn.toFixed(2)}% All-Time Return
            </p>
         </div>

         <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100 flex flex-col justify-center">
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-1">Active Portfolios</p>
            <div className="text-3xl font-black text-indigo-900">
               {consolidatedData.rows.length}
            </div>
            <p className="text-xs text-indigo-600 mt-2 font-medium">Across {new Set(consolidatedData.rows.map(r => r.clientId)).size} Clients</p>
         </div>
      </div>

      {/* --- AI INSIGHTS --- */}
      {analysisResult && (
         <div className="bg-white rounded-2xl border border-indigo-100 p-6 shadow-sm animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-2 mb-4">
               <span className="text-xl">🤖</span>
               <h3 className="font-bold text-slate-800">Sproutly AI Insight</h3>
            </div>
            <div className="prose prose-sm text-slate-600 max-w-none whitespace-pre-line leading-relaxed">
               {analysisResult}
            </div>
         </div>
      )}

      {/* --- LEADERBOARD TABLE --- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
         <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Client Portfolios</h3>
            <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-1 rounded font-bold">LIVE DATA</span>
         </div>
         <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
               <thead className="bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase">
                  <tr>
                     <th className="px-6 py-3">Client</th>
                     <th className="px-6 py-3">Plan Info</th>
                     <th className="px-6 py-3 text-right">Invested</th>
                     <th className="px-6 py-3 text-right">Current Value</th>
                     <th className="px-6 py-3 text-right">P/L ($)</th>
                     <th className="px-6 py-3 text-right">CAGR</th>
                     <th className="px-6 py-3 text-center">Action</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                  {consolidatedData.rows.length === 0 ? (
                     <tr><td colSpan={7} className="p-8 text-center text-slate-400 italic">No portfolios recorded. Click "Add Portfolio" to start tracking.</td></tr>
                  ) : (
                     consolidatedData.rows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/80 transition-colors group">
                           <td className="px-6 py-4">
                              <div className="font-bold text-slate-900">
                                  {/* MASKING APPLIED HERE */}
                                  {maskNames ? `Client ${row.clientRef}` : row.clientName}
                              </div>
                              <div className="text-[10px] text-slate-400 font-medium">Adv: {row.advisor}</div>
                           </td>
                           <td className="px-6 py-4">
                              <div className="font-medium text-slate-700">{row.plan}</div>
                              <div className="text-[10px] text-slate-500">{row.insurer} • Since {new Date(row.inception).getFullYear()}</div>
                           </td>
                           <td className="px-6 py-4 text-right font-mono text-slate-600">
                               {fmtSGD(row.invested)}
                               {row.originalItem.totalInvested && <span className="text-[9px] text-slate-400 ml-1">(Fixed)</span>}
                           </td>
                           <td className="px-6 py-4 text-right font-mono font-bold text-slate-800">{fmtSGD(row.current)}</td>
                           <td className="px-6 py-4 text-right">
                              <div className={`font-bold ${row.pl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                 {row.pl >= 0 ? '+' : ''}{fmtSGD(row.pl)}
                              </div>
                              <div className={`text-[10px] font-bold ${row.plPercent >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                                 {row.plPercent.toFixed(1)}%
                              </div>
                           </td>
                           <td className="px-6 py-4 text-right">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${row.cagr >= 7 ? 'bg-emerald-100 text-emerald-700' : row.cagr < 0 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                                 {row.cagr.toFixed(1)}%
                              </span>
                           </td>
                           <td className="px-6 py-4 text-center">
                              <button onClick={() => openEdit(row)} className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded transition-colors opacity-0 group-hover:opacity-100">
                                 Edit
                              </button>
                           </td>
                        </tr>
                     ))
                  )}
               </tbody>
            </table>
         </div>
      </div>

      {/* --- ADD/EDIT MODAL --- */}
      <Modal isOpen={isAddModalOpen} onClose={closeModal} title={editingItem ? "Update Portfolio Valuation" : "Add New Portfolio"}>
         <div className="space-y-4">
            {!editingItem && (
               <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Select Client</label>
                  <select 
                     className="w-full p-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                     value={selectedClientId}
                     onChange={e => setSelectedClientId(e.target.value)}
                  >
                     <option value="">-- Choose Client --</option>
                     {/* MASKING APPLIED HERE TOO */}
                     {clients.map(c => <option key={c.id} value={c.id}>{maskNames ? c.referenceCode : c.profile.name}</option>)}
                  </select>
               </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Plan Name</label>
                  <input className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none font-bold" value={formPlanName} onChange={e => setFormPlanName(e.target.value)} placeholder="e.g. PruWealth" />
               </div>
               <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Insurer</label>
                  <input className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none" value={formInsurer} onChange={e => setFormInsurer(e.target.value)} placeholder="e.g. Prudential" />
               </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Inception Date</label>
                  <input type="date" className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none" value={formInception} onChange={e => setFormInception(e.target.value)} />
               </div>
               <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Frequency</label>
                  <select className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none" value={formFreq} onChange={e => setFormFreq(e.target.value as any)}>
                     <option value="monthly">Monthly</option>
                     <option value="quarterly">Quarterly</option>
                     <option value="half_yearly">Half Yearly</option>
                     <option value="yearly">Yearly</option>
                     <option value="lump_sum">Lump Sum</option>
                  </select>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Premium Amount ($)</label>
                  <input type="number" className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none font-bold" value={formPremium} onChange={e => setFormPremium(e.target.value)} placeholder="0.00" />
               </div>
               <div>
                  <label className="block text-[10px] font-bold text-emerald-600 uppercase mb-1">Current Value ($)</label>
                  <input type="number" className="w-full p-2 border border-emerald-200 rounded-lg text-sm outline-none font-bold text-emerald-700 bg-emerald-50" value={formCurrentValue} onChange={e => setFormCurrentValue(e.target.value)} placeholder="Updated Value" />
               </div>
            </div>

            {/* NEW FIELD: Total Net Invested Override */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-2">
               <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                   Total Net Invested (Override)
               </label>
               <input 
                   type="number" 
                   className="w-full p-2 border border-slate-300 rounded-lg text-sm outline-none font-mono" 
                   value={formInvestedOverride} 
                   onChange={e => setFormInvestedOverride(e.target.value)} 
                   placeholder="Auto-calculated if empty" 
               />
               <p className="text-[10px] text-slate-400 mt-1 italic">
                   Set this value manually to fix the cost basis. P/L will be calculated as Current Value - this amount.
               </p>
            </div>

            <div className="pt-4 flex gap-3">
               <Button variant="ghost" className="flex-1" onClick={closeModal}>Cancel</Button>
               <Button variant="primary" className="flex-1" onClick={handleSave}>Save Record</Button>
            </div>
         </div>
      </Modal>
    </div>
  );
};

export default PortfolioTab;
