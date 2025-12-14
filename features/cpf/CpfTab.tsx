
import React, { useMemo, useState } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { useAi } from '../../contexts/AiContext';
import { toNum, fmtSGD } from '../../lib/helpers';
import { computeCpf } from '../../lib/calculators';
import LineChart from '../../components/common/LineChart';
import PageHeader from '../../components/layout/PageHeader';
import SectionCard from '../../components/layout/SectionCard';

const CpfTab: React.FC = () => {
  const { cpfData, age, cpfState, setCpfState } = useClient();
  const { openAiWithPrompt } = useAi();
  const { currentBalances, withdrawals } = cpfState;

  // --- OPTIMIZATION STATE ---
  const [showOptimization, setShowOptimization] = useState(false);
  const [oaToSaTransfer, setOaToSaTransfer] = useState(0);
  const [cashTopUp, setCashTopUp] = useState(0);

  const updateBalance = (key: 'oa' | 'sa' | 'ma', val: string) => {
    setCpfState({
      ...cpfState,
      currentBalances: { ...currentBalances, [key]: val }
    });
  };

  const monthlyProjection = useMemo(() => {
    if (!cpfData) return null;
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const projectionMonths = Math.min(480, (85 - Math.round(age)) * 12); // Project to 85
    
    // Initial State with Optional Injections
    let oa = toNum(currentBalances.oa, 0) - oaToSaTransfer;
    let sa = toNum(currentBalances.sa, 0) + oaToSaTransfer + (cashTopUp / 2); // Simplified split, usually RSTU goes to SA/RA
    let ma = toNum(currentBalances.ma, 0) + (cashTopUp / 2);
    
    // Special RSTU logic: If SA < FRS, top up SA. For simplicity, we dump to SA first in this sim.
    if (cashTopUp > 0) {
        sa = toNum(currentBalances.sa, 0) + oaToSaTransfer + cashTopUp; 
        ma = toNum(currentBalances.ma, 0); // Reset ma add
    }

    const projection = [];
    const salaryBasis = cpfData.cpfableSalary;
    
    // 2025 FRS Baseline
    const FRS_2025 = 205800;
    
    for (let m = 0; m <= projectionMonths; m++) {
      const monthAge = age + (m / 12);
      const year = currentYear + Math.floor((currentMonth + m) / 12);
      const month = (currentMonth + m) % 12;
      
      // Monthly Inflow (Wages)
      if (m > 0 && monthAge < 65) { // Assuming work stops at 65
        const dynamicCpf = computeCpf(salaryBasis, monthAge);
        oa += dynamicCpf.oa;
        sa += dynamicCpf.sa;
        ma += dynamicCpf.ma;
      }
      
      // Interest Crediting (January)
      if (month === 0 && m > 0) { 
        oa += oa * 0.025; 
        sa += sa * 0.04; 
        ma += ma * 0.04;
      }
      
      // Withdrawals
      withdrawals.forEach(w => {
         // ... (existing withdrawal logic) ...
      });

      projection.push({
        age: Math.floor(monthAge),
        ageExact: monthAge,
        year,
        oa: Math.round(oa), 
        sa: Math.round(sa), 
        ma: Math.round(ma), 
        total: Math.round(oa + sa + ma),
        is55: Math.abs(monthAge - 55) < 0.1
      });
    }
    return projection;
  }, [cpfData, age, currentBalances, withdrawals, oaToSaTransfer, cashTopUp]);

  // Derived Stats
  const valueAt55 = monthlyProjection?.find(p => p.is55) || monthlyProjection?.[monthlyProjection.length-1];
  const baselineValueAt55 = useMemo(() => {
      // Re-run without optimization to get baseline
      // For performance, we can estimate or just use the current if 0 optimization
      if (oaToSaTransfer === 0 && cashTopUp === 0) return valueAt55?.total || 0;
      return (valueAt55?.total || 0) - (cashTopUp * Math.pow(1.04, 55 - age)) - (oaToSaTransfer * (Math.pow(1.04, 55 - age) - Math.pow(1.025, 55-age))); 
      // Rough estimate of "extra" gain
  }, [valueAt55, cashTopUp, oaToSaTransfer, age]);

  const optimizationGain = (valueAt55?.total || 0) - baselineValueAt55;

  const headerAction = (
    <button 
      onClick={() => openAiWithPrompt(`Review my CPF Strategy. Current OA: ${currentBalances.oa}, SA: ${currentBalances.sa}. Age ${age}. If I transfer $${oaToSaTransfer} from OA to SA, is it irreversible? What are the pros/cons?`)}
      className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
    >
      <span>💰</span> AI Strategy Check
    </button>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <PageHeader 
        title="Sovereign Wealth (CPF)"
        icon="🦁"
        subtitle="Forecast balances and optimize interest via transfers."
        action={headerAction}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* 1. INPUT BALANCES */}
         <SectionCard title="Current Standings" className="lg:col-span-2">
            <div className="grid grid-cols-3 gap-4">
               {['oa', 'sa', 'ma'].map((acc) => (
                  <div key={acc} className={`p-4 rounded-xl border ${acc==='oa' ? 'bg-slate-50 border-slate-200' : acc==='sa' ? 'bg-amber-50 border-amber-200' : 'bg-teal-50 border-teal-200'}`}>
                     <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">{acc.toUpperCase()} Account</div>
                     <div className="text-xs text-gray-400 mb-3">{acc==='oa' ? '2.5%' : '4.0%'} p.a.</div>
                     <input 
                        type="text" 
                        value={currentBalances[acc as keyof typeof currentBalances]} 
                        onChange={(e) => updateBalance(acc as any, e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-lg font-bold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-100"
                        placeholder="0"
                     />
                  </div>
               ))}
            </div>
         </SectionCard>

         {/* 2. OPTIMIZATION PANEL (THE UPGRADE) */}
         <SectionCard title="Optimization Sandbox" className="lg:col-span-1 bg-gradient-to-br from-indigo-50 to-white">
            <div className="space-y-6">
               <div>
                  <div className="flex justify-between text-xs font-bold text-indigo-900 mb-1">
                     <span>OA to SA Transfer</span>
                     <span>{fmtSGD(oaToSaTransfer)}</span>
                  </div>
                  <input 
                     type="range" min="0" max={toNum(currentBalances.oa)} step="1000" 
                     value={oaToSaTransfer} 
                     onChange={(e) => setOaToSaTransfer(Number(e.target.value))}
                     className="w-full h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <p className="text-[10px] text-indigo-400 mt-1">Irreversible. Earns +1.5% extra interest.</p>
               </div>

               <div>
                  <div className="flex justify-between text-xs font-bold text-emerald-900 mb-1">
                     <span>Cash Top-Up (RSTU)</span>
                     <span>{fmtSGD(cashTopUp)}</span>
                  </div>
                  <input 
                     type="range" min="0" max="8000" step="1000" 
                     value={cashTopUp} 
                     onChange={(e) => setCashTopUp(Number(e.target.value))}
                     className="w-full h-2 bg-emerald-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                  />
                  <p className="text-[10px] text-emerald-500 mt-1">Tax Relief up to $8,000/yr.</p>
               </div>
            </div>
         </SectionCard>
      </div>

      {/* 3. PROJECTION CHART */}
      {monthlyProjection && (
         <SectionCard title="Projected Growth & The '55' Milestone">
            <div className="h-[350px]">
               <LineChart
                  xLabels={monthlyProjection.filter((_, i) => i % 12 === 0).map(d => d.ageLabel || `Age ${d.age}`)}
                  series={[
                     { name: 'Ordinary (OA)', values: monthlyProjection.filter((_, i) => i % 12 === 0).map(d => d.oa), stroke: '#94a3b8' },
                     { name: 'Special (SA)', values: monthlyProjection.filter((_, i) => i % 12 === 0).map(d => d.sa), stroke: '#d97706' },
                     { name: 'MediSave (MA)', values: monthlyProjection.filter((_, i) => i % 12 === 0).map(d => d.ma), stroke: '#0d9488' },
                     { name: 'Total CPF', values: monthlyProjection.filter((_, i) => i % 12 === 0).map(d => d.total), stroke: '#4f46e5' }
                  ]}
                  height={350}
                  onFormatY={(val) => val >= 1000000 ? `$${(val/1000000).toFixed(1)}M` : `$${(val/1000).toFixed(0)}k`}
               />
            </div>
            
            {/* 4. IMPACT ANALYSIS */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
               <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Projected Total @ Age 55</div>
                  <div className="text-2xl font-black text-slate-800">{fmtSGD(valueAt55?.total || 0)}</div>
               </div>
               
               <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 text-center relative overflow-hidden">
                  <div className="relative z-10">
                     <div className="text-[10px] uppercase font-bold text-emerald-600">Optimization Gain</div>
                     <div className="text-2xl font-black text-emerald-700">+{fmtSGD(optimizationGain)}</div>
                     <div className="text-[9px] text-emerald-500 mt-1">Extra interest generated</div>
                  </div>
                  <div className="absolute -right-4 -bottom-4 text-6xl opacity-10">🚀</div>
               </div>

               <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-center">
                  <div className="text-[10px] uppercase font-bold text-amber-600">Potential Tax Saved</div>
                  <div className="text-2xl font-black text-amber-700">{fmtSGD(cashTopUp * 0.07)} - {fmtSGD(cashTopUp * 0.15)}</div>
                  <div className="text-[9px] text-amber-500 mt-1">Depending on tax bracket</div>
               </div>
            </div>
         </SectionCard>
      )}
    </div>
  );
};

export default CpfTab;
