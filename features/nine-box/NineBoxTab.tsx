
import React, { useState, useMemo } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { useAi } from '../../contexts/AiContext';
import { BoxCategory, NineBoxItem } from '../../types';
import { toNum, fmtSGD, getAge } from '../../lib/helpers';
import PageHeader from '../../components/layout/PageHeader';
import SectionCard from '../../components/layout/SectionCard';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { GoogleGenAI } from '@google/genai';

const BOXES: { id: BoxCategory; label: string; color: string; targets: string[] }[] = [
  { id: 'death', label: '1. Death / Legacy', color: 'bg-slate-100 border-slate-200', targets: ['deathCov'] },
  { id: 'tpd', label: '2. Total Permanent Disability', color: 'bg-blue-50 border-blue-200', targets: ['tpdCov'] },
  { id: 'ci', label: '3. Critical Illness', color: 'bg-red-50 border-red-200', targets: ['ciCov'] },
  { id: 'accident', label: '4. Accidental Benefits', color: 'bg-amber-50 border-amber-200', targets: [] },
  { id: 'disability', label: '5. Partial Disability', color: 'bg-orange-50 border-orange-200', targets: [] },
  { id: 'hospital', label: '6. Hospitalisation', color: 'bg-emerald-50 border-emerald-200', targets: [] },
  { id: 'cash_inv', label: '7. Cash Investments', color: 'bg-indigo-50 border-indigo-200', targets: [] },
  { id: 'cpf_inv', label: '8. CPF / SRS Investments', color: 'bg-cyan-50 border-cyan-200', targets: [] },
  { id: 'all', label: '9. All Policies Summary', color: 'bg-slate-900 border-slate-900 text-white', targets: [] }
];

const NineBoxTab: React.FC = () => {
  const { nineBoxState, setNineBoxState, age, profile } = useClient();
  const { openAiWithPrompt } = useAi();
  
  const [selectedBox, setSelectedBox] = useState<BoxCategory | null>(null);
  const [editingItem, setEditingItem] = useState<Partial<NineBoxItem> | null>(null);
  const [showReplacementTool, setShowReplacementTool] = useState(false);
  const [justificationScript, setJustificationScript] = useState('');
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  
  // NEW: Toggle for Optimization View
  const [viewMode, setViewMode] = useState<'current' | 'optimized'>('current');

  // --- STATE SETTERS ---
  const updateReplacement = (plan: 'old' | 'new', field: string, val: string) => {
    setNineBoxState({
      ...nineBoxState,
      replacement: {
        ...nineBoxState.replacement,
        [plan === 'old' ? 'oldPlan' : 'newPlan']: {
          ...nineBoxState.replacement[plan === 'old' ? 'oldPlan' : 'newPlan'],
          [field]: val
        }
      }
    });
  };

  const handleSaveItem = () => {
    if (!editingItem || !selectedBox) return;
    
    const newItem: NineBoxItem = {
      id: editingItem.id || Date.now().toString(),
      category: selectedBox,
      name: editingItem.name || 'New Policy',
      policyNo: editingItem.policyNo || '',
      startDate: editingItem.startDate || '',
      matureDate: editingItem.matureDate || '',
      sumAssured: editingItem.sumAssured || '0',
      cpfPremium: editingItem.cpfPremium || '0',
      cashPremium: editingItem.cashPremium || '0'
    };

    const newItems = nineBoxState.items.filter(i => i.id !== newItem.id).concat(newItem);
    setNineBoxState({ ...nineBoxState, items: newItems });
    setEditingItem(null);
  };

  const deleteItem = (id: string) => {
    setNineBoxState({
      ...nineBoxState,
      items: nineBoxState.items.filter(i => i.id !== id)
    });
  };

  // --- REPLACEMENT LOGIC ---
  const { oldPlan, newPlan } = nineBoxState.replacement;
  const currentAge = age || 30;
  
  const oldYearsRemaining = Math.max(0, toNum(oldPlan.paymentTermAge) - currentAge);
  const newYearsRemaining = Math.max(0, toNum(newPlan.paymentTermAge) - currentAge);
  
  const oldTotalCost = toNum(oldPlan.premium) * oldYearsRemaining;
  const newTotalCost = toNum(newPlan.premium) * newYearsRemaining;
  
  const surrenderValue = toNum(oldPlan.surrenderValue);
  const yearsFree = toNum(newPlan.premium) > 0 ? surrenderValue / toNum(newPlan.premium) : 0;
  const premiumSavingsAnnual = toNum(oldPlan.premium) - toNum(newPlan.premium);
  const totalSavings = oldTotalCost - newTotalCost + surrenderValue;

  // --- AGGREGATORS ---
  const getBoxTotals = (cat: BoxCategory, mode: 'current' | 'optimized') => {
    const relevantItems = cat === 'all' 
      ? nineBoxState.items 
      : nineBoxState.items.filter(i => i.category === cat);

    const totals = relevantItems.reduce((acc, item) => ({
      sumAssured: acc.sumAssured + toNum(item.sumAssured),
      cashPrem: acc.cashPrem + toNum(item.cashPremium),
      cpfPrem: acc.cpfPrem + toNum(item.cpfPremium)
    }), { sumAssured: 0, cashPrem: 0, cpfPrem: 0 });

    if (mode === 'optimized') {
      const boxDef = BOXES.find(b => b.id === cat);
      // If this box is a target of the replacement (Death, TPD, CI)
      if (boxDef?.targets.length) {
         boxDef.targets.forEach(target => {
            const oldVal = toNum((oldPlan as any)[target]);
            const newVal = toNum((newPlan as any)[target]);
            totals.sumAssured = totals.sumAssured - oldVal + newVal;
         });
         // Apply premium reduction logic (Simplified: apply reduction to Death box as primary example)
         if (cat === 'death' || cat === 'all') {
            totals.cashPrem = Math.max(0, totals.cashPrem - toNum(oldPlan.premium) + toNum(newPlan.premium));
         }
      }
    }

    return totals;
  };

  const handleGenerateScript = async () => {
    setIsGeneratingScript(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `
        Act as a top financial advisor. Justify replacing an old insurance plan with a new one for client ${profile.name} (Age ${currentAge}).
        
        OLD PLAN:
        - Premium: ${fmtSGD(toNum(oldPlan.premium))}/yr until Age ${oldPlan.paymentTermAge}
        - Total Remaining Cost: ${fmtSGD(oldTotalCost)}
        - Surrender Value NOW: ${fmtSGD(surrenderValue)}
        - Coverage: Death ${fmtSGD(oldPlan.deathCov)}, CI ${fmtSGD(oldPlan.ciCov)}

        NEW PLAN (PROPOSED):
        - Premium: ${fmtSGD(toNum(newPlan.premium))}/yr until Age ${newPlan.paymentTermAge}
        - Total Remaining Cost: ${fmtSGD(newTotalCost)}
        - Coverage: Death ${fmtSGD(newPlan.deathCov)}, CI ${fmtSGD(newPlan.ciCov)}

        KEY METRICS:
        - The surrender value alone can pay for ${yearsFree.toFixed(1)} years of the new plan.
        - Total net financial benefit (savings + cash out): ${fmtSGD(totalSavings)}.

        Task: Write a persuasive 3-paragraph script. 
        1. Acknowledge the old plan served its purpose but is now expensive/outdated.
        2. Highlight the "Free Coverage" period using the surrender value.
        3. Close on the massive total savings and/or better coverage.
      `;
      
      const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
      setJustificationScript(res.text || "Could not generate script.");
    } catch (e) {
      setJustificationScript("AI Service Unavailable.");
    } finally {
      setIsGeneratingScript(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-fade-in pb-24">
      <PageHeader 
        title="9 Box Matrix" 
        icon="▦" 
        subtitle="Holistic consolidation of all insurance and assets."
        action={
          <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200">
             <button 
                onClick={() => setViewMode('current')}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${viewMode === 'current' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
             >
                Status Quo
             </button>
             <button 
                onClick={() => setViewMode('optimized')}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${viewMode === 'optimized' ? 'bg-emerald-600 text-white shadow-lg scale-105' : 'text-slate-400 hover:text-slate-600'}`}
             >
                Quantum Optimized ✨
             </button>
          </div>
        }
      />

      {/* --- WOW IMPACT BANNER --- */}
      {viewMode === 'optimized' && (
         <div className="bg-slate-900 text-white rounded-[2rem] p-8 shadow-2xl border border-white/5 relative overflow-hidden animate-in slide-in-from-top-4">
            <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] -mr-20 -mt-20 pointer-events-none"></div>
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-4 gap-8">
               <div className="md:col-span-1">
                  <div className="inline-block bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 rounded-full text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">Alpha Strategy</div>
                  <h2 className="text-3xl font-black tracking-tighter">Strategic Gain</h2>
                  <p className="text-xs text-slate-400 mt-2">Value unlocked over full payment term.</p>
               </div>
               <div className="text-center md:text-left border-l border-white/10 md:pl-8">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Coverage Alpha</div>
                  <div className="text-2xl font-black text-emerald-400">+{fmtSGD(toNum(newPlan.deathCov) - toNum(oldPlan.deathCov))}</div>
                  <div className="text-[9px] text-slate-500 uppercase font-bold mt-1">Death Benefit Boost</div>
               </div>
               <div className="text-center md:text-left border-l border-white/10 md:pl-8">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Premium Savings</div>
                  <div className="text-2xl font-black text-emerald-400">{fmtSGD(premiumSavingsAnnual)}/yr</div>
                  <div className="text-[9px] text-slate-500 uppercase font-bold mt-1">Ongoing Cashflow Gain</div>
               </div>
               <div className="text-center md:text-left border-l border-white/10 md:pl-8">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Surrender Leverage</div>
                  <div className="text-2xl font-black text-amber-400">{yearsFree.toFixed(1)} Years</div>
                  <div className="text-[9px] text-slate-500 uppercase font-bold mt-1">Zero Premium Period</div>
               </div>
            </div>
         </div>
      )}

      {/* --- THE 9 BOX GRID --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {BOXES.map((box) => {
          const currentTotals = getBoxTotals(box.id, 'current');
          const optimizedTotals = getBoxTotals(box.id, 'optimized');
          const totals = viewMode === 'current' ? currentTotals : optimizedTotals;
          const isAll = box.id === 'all';
          
          const saDelta = optimizedTotals.sumAssured - currentTotals.sumAssured;
          const premDelta = optimizedTotals.cashPrem - currentTotals.cashPrem;

          return (
            <div 
              key={box.id}
              onClick={() => { setSelectedBox(box.id); setEditingItem(null); }}
              className={`
                rounded-2xl p-6 border-2 transition-all cursor-pointer hover:shadow-lg active:scale-[0.98] flex flex-col justify-between min-h-[180px] relative
                ${box.color} ${isAll ? 'shadow-2xl' : 'hover:border-indigo-300'}
                ${viewMode === 'optimized' && !isAll ? 'ring-2 ring-emerald-500/20' : ''}
              `}
            >
              <div>
                <h3 className={`text-sm font-bold uppercase tracking-wider mb-4 ${isAll ? 'text-white' : 'text-slate-700'}`}>{box.label}</h3>
              </div>

              {/* Delta Badges */}
              {viewMode === 'optimized' && !isAll && (
                 <div className="absolute top-6 right-6 flex flex-col items-end gap-1">
                    {saDelta !== 0 && (
                       <span className={`text-[10px] font-black px-1.5 py-0.5 rounded shadow-sm ${saDelta > 0 ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                          {saDelta > 0 ? '↑' : '↓'} {Math.abs(saDelta/1000)}k SA
                       </span>
                    )}
                    {premDelta !== 0 && (
                       <span className={`text-[10px] font-black px-1.5 py-0.5 rounded shadow-sm ${premDelta < 0 ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-red-100 text-red-700'}`}>
                          {premDelta < 0 ? '↓' : '↑'} {fmtSGD(Math.abs(premDelta))} PREM
                       </span>
                    )}
                 </div>
              )}

              <div className="space-y-2">
                <div className="flex justify-between items-end">
                   <span className={`text-[10px] font-bold uppercase ${isAll ? 'text-slate-400' : 'text-slate-400'}`}>Sum Assured</span>
                   <span className={`text-xl font-black ${isAll ? 'text-white' : 'text-slate-900'}`}>{fmtSGD(totals.sumAssured)}</span>
                </div>
                <div className="w-full h-px bg-current opacity-10"></div>
                <div className="flex justify-between items-end">
                   <span className={`text-[10px] font-bold uppercase ${isAll ? 'text-slate-400' : 'text-slate-400'}`}>Total Prem/Yr</span>
                   <span className={`text-sm font-bold ${isAll ? 'text-emerald-300' : 'text-emerald-600'}`}>{fmtSGD(totals.cashPrem + totals.cpfPrem)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-4">
         <Button variant="primary" onClick={() => setShowReplacementTool(!showReplacementTool)} leftIcon="⚡" className="flex-1 py-4">
             {showReplacementTool ? 'Hide Replacement Desk' : 'Open Replacement Desk'}
         </Button>
      </div>

      {/* --- REPLACEMENT CALCULATOR --- */}
      {showReplacementTool && (
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-4">
           <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
              <div>
                 <h3 className="text-lg font-black uppercase tracking-widest">Quantum Replacement Desk</h3>
                 <p className="text-xs text-slate-400">Values here will instantly optimize the 9-box visualization above.</p>
              </div>
              <div className="text-right">
                 <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Total Strategy Savings</div>
                 <div className="text-3xl font-black">{fmtSGD(totalSavings)}</div>
              </div>
           </div>

           <div className="p-8">
              {/* Spreadsheet Layout */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl mb-8 shadow-inner">
                 <table className="w-full text-sm text-center">
                    <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase">
                       <tr>
                          <th className="p-4 text-left">Strategy Node</th>
                          <th className="p-4 w-24">Pay To Age</th>
                          <th className="p-4">Death ($)</th>
                          <th className="p-4">TPD ($)</th>
                          <th className="p-4">CI ($)</th>
                          <th className="p-4">Premium/Yr</th>
                          <th className="p-4 text-indigo-600">Surrender Val</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {/* OLD PLAN ROW */}
                       <tr className="bg-red-50/20">
                          <td className="p-4 text-left font-bold text-slate-700">
                             <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-400"></span>
                                <input className="bg-transparent font-bold w-full outline-none" value={oldPlan.name} onChange={e => updateReplacement('old', 'name', e.target.value)} />
                             </div>
                          </td>
                          <td><input type="number" className="w-16 text-center bg-white border rounded p-1" value={oldPlan.paymentTermAge} onChange={e => updateReplacement('old', 'paymentTermAge', e.target.value)} /></td>
                          <td><input type="text" className="w-24 text-center bg-white border rounded p-1" value={oldPlan.deathCov} onChange={e => updateReplacement('old', 'deathCov', e.target.value)} /></td>
                          <td><input type="text" className="w-24 text-center bg-white border rounded p-1" value={oldPlan.tpdCov} onChange={e => updateReplacement('old', 'tpdCov', e.target.value)} /></td>
                          <td><input type="text" className="w-24 text-center bg-white border rounded p-1" value={oldPlan.ciCov} onChange={e => updateReplacement('old', 'ciCov', e.target.value)} /></td>
                          <td><input type="text" className="w-24 text-center bg-white border rounded p-1 font-bold text-red-600" value={oldPlan.premium} onChange={e => updateReplacement('old', 'premium', e.target.value)} /></td>
                          <td><input type="text" className="w-24 text-center bg-white border border-indigo-200 rounded p-1 font-bold text-indigo-600" value={oldPlan.surrenderValue} onChange={e => updateReplacement('old', 'surrenderValue', e.target.value)} /></td>
                       </tr>
                       {/* NEW PLAN ROW */}
                       <tr className="bg-emerald-50/20">
                          <td className="p-4 text-left font-bold text-emerald-800">
                             <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                <input className="bg-transparent font-bold w-full outline-none" value={newPlan.name} onChange={e => updateReplacement('new', 'name', e.target.value)} />
                             </div>
                          </td>
                          <td><input type="number" className="w-16 text-center bg-white border rounded p-1" value={newPlan.paymentTermAge} onChange={e => updateReplacement('new', 'paymentTermAge', e.target.value)} /></td>
                          <td><input type="text" className="w-24 text-center bg-white border rounded p-1" value={newPlan.deathCov} onChange={e => updateReplacement('new', 'deathCov', e.target.value)} /></td>
                          <td><input type="text" className="w-24 text-center bg-white border rounded p-1" value={newPlan.tpdCov} onChange={e => updateReplacement('new', 'tpdCov', e.target.value)} /></td>
                          <td><input type="text" className="w-24 text-center bg-white border rounded p-1" value={newPlan.ciCov} onChange={e => updateReplacement('new', 'ciCov', e.target.value)} /></td>
                          <td><input type="text" className="w-24 text-center bg-white border rounded p-1 font-bold text-emerald-600" value={newPlan.premium} onChange={e => updateReplacement('new', 'premium', e.target.value)} /></td>
                          <td className="text-xs text-slate-400 italic">N/A</td>
                       </tr>
                    </tbody>
                 </table>
              </div>

              {/* IMPACT ANALYSIS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="bg-indigo-50 p-8 rounded-3xl border border-indigo-100 flex flex-col justify-center text-center shadow-inner">
                    <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">Power of Surrender Value</h4>
                    <div className="text-5xl font-black text-indigo-900 mb-2">{yearsFree.toFixed(1)} Years</div>
                    <p className="text-sm font-medium text-indigo-700">of FREE premiums for the proposed solution</p>
                    <div className="mt-4 pt-4 border-t border-indigo-200">
                       <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">Surrender Now: {fmtSGD(surrenderValue)}</p>
                    </div>
                 </div>
                 
                 <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                       <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Advisor Justification</h4>
                       <button onClick={handleGenerateScript} disabled={isGeneratingScript} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold shadow-sm hover:bg-indigo-700 transition-colors">
                          {isGeneratingScript ? 'Writing...' : '✨ AI Script'}
                       </button>
                    </div>
                    <div className="flex-1 prose prose-sm text-slate-600 text-xs leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap italic bg-white p-4 rounded-xl border border-slate-100 font-serif">
                       {justificationScript || "Enter plan details and click AI Script to generate a talking point."}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* --- CONSOLIDATED SCHEDULE --- */}
      <SectionCard title="Consolidated Policy Schedule" noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 uppercase">
              <tr>
                <th className="p-4 w-12">No</th>
                <th className="p-4">Asset Name</th>
                <th className="p-4">Policy No</th>
                <th className="p-4">Start</th>
                <th className="p-4">Mature</th>
                <th className="p-4 text-right">Cover $</th>
                <th className="p-4 text-right text-amber-700">CPF Prem</th>
                <th className="p-4 text-right text-emerald-700">Cash Prem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {nineBoxState.items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 text-slate-400 font-mono">{idx + 1}</td>
                  <td className="p-4 font-bold text-slate-700">{item.name}</td>
                  <td className="p-4 font-mono text-slate-500">{item.policyNo}</td>
                  <td className="p-4 text-slate-600">{item.startDate}</td>
                  <td className="p-4 text-slate-600">{item.matureDate}</td>
                  <td className="p-4 text-right font-mono font-medium">{fmtSGD(item.sumAssured)}</td>
                  <td className="p-4 text-right font-mono font-medium text-amber-600">{fmtSGD(item.cpfPremium)}</td>
                  <td className="p-4 text-right font-mono font-bold text-emerald-600">{fmtSGD(item.cashPremium)}</td>
                </tr>
              ))}
              {nineBoxState.items.length === 0 && (
                  <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 italic">No policies recorded. Click a box above to add items.</td>
                  </tr>
              )}
            </tbody>
            {nineBoxState.items.length > 0 && (
              <tfoot className="bg-slate-100 border-t-2 border-slate-200 font-bold text-slate-800">
                  <tr>
                      <td colSpan={5} className="p-4 text-right uppercase tracking-widest text-[10px] text-slate-500">Total Consolidated:</td>
                      <td className="p-4 text-right">{fmtSGD(nineBoxState.items.reduce((sum, i) => sum + toNum(i.sumAssured), 0))}</td>
                      <td className="p-4 text-right text-amber-700">{fmtSGD(nineBoxState.items.reduce((sum, i) => sum + toNum(i.cpfPremium), 0))}</td>
                      <td className="p-4 text-right text-emerald-700 text-sm">{fmtSGD(nineBoxState.items.reduce((sum, i) => sum + toNum(i.cashPremium), 0))}</td>
                  </tr>
              </tfoot>
            )}
          </table>
        </div>
      </SectionCard>

      {/* --- BOX EDITOR MODAL --- */}
      {selectedBox && (
        <Modal 
          isOpen={true} 
          onClose={() => { setSelectedBox(null); setEditingItem(null); }} 
          title={`Edit: ${BOXES.find(b => b.id === selectedBox)?.label}`}
          footer={
             <Button variant="ghost" onClick={() => { setSelectedBox(null); setEditingItem(null); }}>Close</Button>
          }
        >
           <div className="space-y-6">
              {/* List of existing items */}
              {selectedBox !== 'all' && (
                 <div className="space-y-2">
                    {nineBoxState.items.filter(i => i.category === selectedBox).map(item => (
                       <div key={item.id} className="p-3 border border-slate-200 rounded-lg flex justify-between items-center bg-slate-50">
                          <div>
                             <div className="font-bold text-sm text-slate-800">{item.name}</div>
                             <div className="text-xs text-slate-500 font-mono">{item.policyNo} • Ends: {item.matureDate || '-'}</div>
                             <div className="text-[10px] text-indigo-600 font-bold mt-1">SA: {fmtSGD(item.sumAssured)} | Prem: {fmtSGD(toNum(item.cashPremium) + toNum(item.cpfPremium))}</div>
                          </div>
                          <button onClick={() => deleteItem(item.id)} className="text-red-400 hover:text-red-600 px-2">✕</button>
                       </div>
                    ))}
                    {nineBoxState.items.filter(i => i.category === selectedBox).length === 0 && (
                       <div className="text-center text-slate-400 text-xs py-4">No items in this box yet.</div>
                    )}
                 </div>
              )}

              {/* Add New Item Form */}
              {selectedBox !== 'all' && (
                 <div className="bg-white p-4 rounded-xl border-2 border-dashed border-slate-200">
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Add Entry</h4>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                       <div><label className="text-[10px] font-bold text-slate-400 uppercase">Policy Name</label><input className="w-full p-2 bg-slate-50 rounded border border-slate-200 text-xs font-bold" value={editingItem?.name || ''} onChange={e => setEditingItem({...editingItem, name: e.target.value})} placeholder="e.g. AIA Secure" /></div>
                       <div><label className="text-[10px] font-bold text-slate-400 uppercase">Policy No.</label><input className="w-full p-2 bg-slate-50 rounded border border-slate-200 text-xs" value={editingItem?.policyNo || ''} onChange={e => setEditingItem({...editingItem, policyNo: e.target.value})} placeholder="X123456" /></div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                       <div><label className="text-[10px] font-bold text-slate-400 uppercase">Start Date</label><input type="date" className="w-full p-2 bg-slate-50 rounded border border-slate-200 text-xs" value={editingItem?.startDate || ''} onChange={e => setEditingItem({...editingItem, startDate: e.target.value})} /></div>
                       <div><label className="text-[10px] font-bold text-slate-400 uppercase">Mature Date</label><input type="date" className="w-full p-2 bg-slate-50 rounded border border-slate-200 text-xs" value={editingItem?.matureDate || ''} onChange={e => setEditingItem({...editingItem, matureDate: e.target.value})} /></div>
                       <div><label className="text-[10px] font-bold text-slate-400 uppercase">Sum Assured</label><input type="number" className="w-full p-2 bg-slate-50 rounded border border-slate-200 text-xs" value={editingItem?.sumAssured || ''} onChange={e => setEditingItem({...editingItem, sumAssured: e.target.value})} placeholder="0" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                       <div><label className="text-[10px] font-bold text-slate-400 uppercase">Cash Prem/Yr</label><input type="number" className="w-full p-2 bg-slate-50 rounded border border-slate-200 text-xs" value={editingItem?.cashPremium || ''} onChange={e => setEditingItem({...editingItem, cashPremium: e.target.value})} placeholder="0" /></div>
                       <div><label className="text-[10px] font-bold text-slate-400 uppercase">CPF Prem/Yr</label><input type="number" className="w-full p-2 bg-slate-50 rounded border border-slate-200 text-xs" value={editingItem?.cpfPremium || ''} onChange={e => setEditingItem({...editingItem, cpfPremium: e.target.value})} placeholder="0" /></div>
                    </div>
                    <Button variant="primary" onClick={handleSaveItem} className="w-full">Add to Box</Button>
                 </div>
              )}
              
              {selectedBox === 'all' && (
                 <div className="text-center text-slate-500 text-sm">
                    Summary View. Click specific boxes to edit items.
                 </div>
              )}
           </div>
        </Modal>
      )}
    </div>
  );
};

export default NineBoxTab;
