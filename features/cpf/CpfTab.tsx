
import React, { useMemo, useState } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { useAi } from '../../contexts/AiContext';
import { toNum, fmtSGD } from '../../lib/helpers';
import { computeCpf } from '../../lib/calculators';
import { CPF_BHS_LIMIT } from '../../lib/cpfRules';
import LineChart from '../../components/common/LineChart';
import PageHeader from '../../components/layout/PageHeader';
import SectionCard from '../../components/layout/SectionCard';
import Button from '../../components/ui/Button';

const CpfTab: React.FC = () => {
  const { cpfData, age, cpfState, setCpfState } = useClient();
  const { openAiWithPrompt } = useAi();
  const { currentBalances, withdrawals = [] } = cpfState;

  // --- UI STATE ---
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [oaToSaTransfer, setOaToSaTransfer] = useState(0);
  const [cashTopUp, setCashTopUp] = useState(0);
  
  // Withdrawal Form State
  const [newWithdrawal, setNewWithdrawal] = useState<{
    name: string;
    amount: string;
    account: 'oa' | 'sa' | 'ma';
    type: 'monthly' | 'yearly' | 'onetime';
    startAge: string;
    endAge: string;
  }>({
    name: '',
    amount: '',
    account: 'oa',
    type: 'monthly',
    startAge: '',
    endAge: ''
  });

  const updateBalance = (key: 'oa' | 'sa' | 'ma', val: string) => {
    setCpfState({
      ...cpfState,
      currentBalances: { ...currentBalances, [key]: val }
    });
  };

  const handleAddWithdrawal = () => {
    if (!newWithdrawal.name || !newWithdrawal.amount) return;
    const item = { ...newWithdrawal, id: Date.now(), startAge: newWithdrawal.startAge || age.toString() };
    setCpfState({
      ...cpfState,
      withdrawals: [...(withdrawals || []), item]
    });
    setNewWithdrawal({ name: '', amount: '', account: 'oa', type: 'monthly', startAge: '', endAge: '' });
  };

  const removeWithdrawal = (id: number) => {
    setCpfState({
      ...cpfState,
      withdrawals: withdrawals.filter((w: any) => w.id !== id)
    });
  };

  const monthlyProjection = useMemo(() => {
    if (!cpfData) return null;
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const projectionMonths = Math.min(600, (85 - Math.round(age)) * 12); // Project to 85 (max 50 yrs)
    
    // Initial State with Optional Injections
    let oa = toNum(currentBalances.oa, 0) - oaToSaTransfer;
    let sa = toNum(currentBalances.sa, 0) + oaToSaTransfer + (cashTopUp / 2); 
    let ma = toNum(currentBalances.ma, 0) + (cashTopUp / 2);
    let ra = 0; // Retirement Account
    
    if (cashTopUp > 0) {
        sa = toNum(currentBalances.sa, 0) + oaToSaTransfer + cashTopUp; 
        ma = toNum(currentBalances.ma, 0); 
    }

    const projection = [];
    const salaryBasis = cpfData.cpfableSalary;
    
    // Medisave Limit Logic (BHS)
    // Starting in 2025, BHS is $74,000 (assumed approximate)
    let currentBhsLimit = CPF_BHS_LIMIT; 
    
    for (let m = 0; m <= projectionMonths; m++) {
      const monthAge = age + (m / 12);
      const year = currentYear + Math.floor((currentMonth + m) / 12);
      const monthIndex = (currentMonth + m) % 12;
      const isStartOfYear = monthIndex === 0 && m > 0;
      
      // Update BHS Limit annually (4.5% approx growth) until age 65
      if (isStartOfYear && monthAge < 65) {
          currentBhsLimit = currentBhsLimit * 1.045; 
      }

      // --- 1. INTEREST (Start of Year) ---
      // Apply annual interest at month 0 of each year
      if (isStartOfYear) { 
        oa += oa * 0.025; 
        // SA closed at 55, interest applies only if balance exists
        if (sa > 0) sa += sa * 0.0408; 
        ma += ma * 0.0408;
        ra += ra * 0.0408;
      }

      // --- 2. CONTRIBUTIONS (Wages) ---
      if (m > 0 && monthAge < 65) { 
        const dynamicCpf = computeCpf(salaryBasis, monthAge);
        oa += dynamicCpf.oa;
        
        // Age Dependent Allocation
        if (monthAge < 55) {
            sa += dynamicCpf.sa;
        } else {
            // Post-55: SA contribution goes to RA (simplified flow)
            ra += dynamicCpf.sa;
        }
        ma += dynamicCpf.ma;
      }
      
      // --- 3. AGE 55 EVENT (SA CLOSURE) ---
      // Trigger exactly once at 55
      if (m > 0 && Math.floor(monthAge) === 55 && Math.floor(age + ((m-1)/12)) < 55) {
          // FRS estimate
          const yearsTo55 = 55 - age;
          const estimatedFRS = 205800 * Math.pow(1.035, yearsTo55);
          
          // Move SA -> RA
          const saTransfer = Math.min(sa, estimatedFRS);
          ra += saTransfer;
          sa -= saTransfer;
          
          // If SA remaining, move to OA (New 2025 Rule)
          if (sa > 0) {
              oa += sa;
              sa = 0;
          }
          
          // If RA still needs funds, take from OA
          if (ra < estimatedFRS) {
              const oaTransfer = Math.min(oa, estimatedFRS - ra);
              oa -= oaTransfer;
              ra += oaTransfer;
          }
      }

      // --- 4. WITHDRAWALS ---
      withdrawals.forEach((w: any) => {
         const start = toNum(w.startAge, age);
         const amt = toNum(w.amount);
         let shouldDeduct = false;
         
         if (w.type === 'onetime') {
             const targetMonthIndex = Math.round((start - age) * 12);
             if (m === targetMonthIndex) shouldDeduct = true;
         } else {
             const end = w.endAge ? toNum(w.endAge) : 100;
             if (monthAge >= start && monthAge <= end) {
                 if (w.type === 'monthly') shouldDeduct = true;
                 else if (w.type === 'yearly' && monthIndex === 0) shouldDeduct = true;
             }
         }

         if (shouldDeduct) {
             if (w.account === 'oa') oa -= amt;
             else if (w.account === 'sa') sa -= amt;
             else if (w.account === 'ma') ma -= amt;
         }
      });

      // --- 5. BHS OVERFLOW (End of month check) ---
      if (ma > currentBhsLimit) {
          const overflow = ma - currentBhsLimit;
          ma = currentBhsLimit;
          
          if (monthAge < 55) {
              // Age < 55: Overflow to SA
              sa += overflow;
          } else {
              // Age >= 55: SA is closed. Overflow to RA (if need FRS) or OA.
              // For projection visualization: Flow to RA first to maximize interest.
              ra += overflow;
          }
      }

      // Clamp to 0
      oa = Math.max(0, oa);
      sa = Math.max(0, sa);
      ma = Math.max(0, ma);
      ra = Math.max(0, ra);

      projection.push({
        age: Math.floor(monthAge),
        ageExact: monthAge,
        year,
        oa: Math.round(oa), 
        sa: Math.round(sa), 
        ma: Math.round(ma),
        ra: Math.round(ra), // New RA Tracking
        bhs: Math.round(currentBhsLimit), 
        total: Math.round(oa + sa + ma + ra),
        is55: Math.abs(monthAge - 55) < 0.1
      });
    }
    return projection;
  }, [cpfData, age, currentBalances, withdrawals, oaToSaTransfer, cashTopUp]);

  // Derived Stats
  const valueAt55 = monthlyProjection?.find(p => p.is55) || monthlyProjection?.[monthlyProjection.length-1];
  const baselineValueAt55 = useMemo(() => {
      if (oaToSaTransfer === 0 && cashTopUp === 0) return valueAt55?.total || 0;
      return (valueAt55?.total || 0) - (cashTopUp * Math.pow(1.04, 55 - age)) - (oaToSaTransfer * (Math.pow(1.04, 55 - age) - Math.pow(1.025, 55-age))); 
  }, [valueAt55, cashTopUp, oaToSaTransfer, age]);

  const optimizationGain = (valueAt55?.total || 0) - baselineValueAt55;

  const headerAction = (
    <button 
      onClick={() => openAiWithPrompt(`Review my CPF Strategy. Current OA: ${currentBalances.oa}, SA: ${currentBalances.sa}. Age ${age}. Explain the impact of the 2025 SA closure on my Medisave overflow.`)}
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
        subtitle="Forecast balances and optimize interest via transfers. Includes 2025 SA Closure Rules."
        action={headerAction}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* 1. INPUT BALANCES */}
         <SectionCard title="Current Standings" className="lg:col-span-2">
            <div className="grid grid-cols-3 gap-4">
               {['oa', 'sa', 'ma'].map((acc) => (
                  <div key={acc} className={`p-4 rounded-xl border ${acc==='oa' ? 'bg-slate-50 border-slate-200' : acc==='sa' ? 'bg-amber-50 border-amber-200' : 'bg-teal-50 border-teal-200'}`}>
                     <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">{acc.toUpperCase()} Account</div>
                     <div className="text-xs text-gray-400 mb-3">{acc==='oa' ? '2.5%' : '4.08%'} p.a.</div>
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

         {/* 2. OPTIMIZATION PANEL */}
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

      {/* 3. WITHDRAWALS MANAGER */}
      <SectionCard title="Major Withdrawals (Housing / Education)">
         <div className="space-y-4">
            {/* List */}
            <div className="space-y-2">
               {withdrawals.map((w: any) => (
                  <div key={w.id} className="flex items-center gap-4 p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs">
                     <div className="flex-1 font-bold text-slate-700">{w.name}</div>
                     <div className="w-24 text-right font-mono text-red-600">-{fmtSGD(w.amount)}</div>
                     <div className="w-16 text-center uppercase text-[10px] bg-white px-1 py-0.5 rounded border border-slate-200">{w.account.toUpperCase()}</div>
                     <div className="w-24 text-center text-slate-500 text-[10px] uppercase">{w.type.replace('onetime', 'One-Time')}</div>
                     <div className="w-24 text-center text-slate-500 text-[10px]">
                        {w.type === 'onetime' ? `At Age ${w.startAge}` : `Age ${w.startAge} - ${w.endAge || '∞'}`}
                     </div>
                     <button onClick={() => removeWithdrawal(w.id)} className="text-slate-300 hover:text-red-500">×</button>
                  </div>
               ))}
               {withdrawals.length === 0 && <div className="text-center text-slate-300 text-xs py-4 italic">No withdrawals configured.</div>}
            </div>

            {/* Add Form */}
            <div className="flex flex-wrap gap-2 items-end pt-4 border-t border-slate-100">
               <div className="flex-1 min-w-[150px]">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Purpose</label>
                  <input type="text" value={newWithdrawal.name} onChange={e => setNewWithdrawal({...newWithdrawal, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-indigo-500" placeholder="e.g. HDB Loan" />
               </div>
               <div className="w-24">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Amount</label>
                  <input type="text" value={newWithdrawal.amount} onChange={e => setNewWithdrawal({...newWithdrawal, amount: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-indigo-500" placeholder="$" />
               </div>
               <div className="w-20">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Acct</label>
                  <select value={newWithdrawal.account} onChange={e => setNewWithdrawal({...newWithdrawal, account: e.target.value as any})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-1 py-1.5 text-xs font-bold outline-none">
                     <option value="oa">OA</option>
                     <option value="sa">SA</option>
                     <option value="ma">MA</option>
                  </select>
               </div>
               <div className="w-24">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Freq</label>
                  <select value={newWithdrawal.type} onChange={e => setNewWithdrawal({...newWithdrawal, type: e.target.value as any})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-1 py-1.5 text-xs font-bold outline-none">
                     <option value="monthly">Monthly</option>
                     <option value="yearly">Yearly</option>
                     <option value="onetime">One-Time</option>
                  </select>
               </div>
               <div className="w-16">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Start</label>
                  <input type="number" value={newWithdrawal.startAge} onChange={e => setNewWithdrawal({...newWithdrawal, startAge: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none" placeholder={String(age)} />
               </div>
               <div className="w-16">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">End</label>
                  <input 
                     type="number" 
                     value={newWithdrawal.endAge} 
                     onChange={e => setNewWithdrawal({...newWithdrawal, endAge: e.target.value})} 
                     className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none ${newWithdrawal.type === 'onetime' ? 'opacity-30 cursor-not-allowed' : ''}`}
                     placeholder="65" 
                     disabled={newWithdrawal.type === 'onetime'}
                  />
               </div>
               <button onClick={handleAddWithdrawal} className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-700 h-[34px]">Add</button>
            </div>
         </div>
      </SectionCard>

      {/* 4. PROJECTION CHART & LEDGER */}
      {monthlyProjection && (
         <SectionCard 
            title="Projection Analysis" 
            action={
               <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button onClick={() => setViewMode('chart')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${viewMode === 'chart' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Visual</button>
                  <button onClick={() => setViewMode('table')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${viewMode === 'table' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Ledger</button>
               </div>
            }
         >
            {viewMode === 'chart' ? (
               <div className="h-[350px]">
                  <LineChart
                     xLabels={monthlyProjection.filter((_, i) => i % 12 === 0).map(d => `Age ${d.age}`)}
                     series={[
                        { name: 'Ordinary (OA)', values: monthlyProjection.filter((_, i) => i % 12 === 0).map(d => d.oa), stroke: '#94a3b8' },
                        { name: 'Special (SA)', values: monthlyProjection.filter((_, i) => i % 12 === 0).map(d => d.sa), stroke: '#d97706' },
                        { name: 'MediSave (MA)', values: monthlyProjection.filter((_, i) => i % 12 === 0).map(d => d.ma), stroke: '#0d9488' },
                        { name: 'Retirement (RA)', values: monthlyProjection.filter((_, i) => i % 12 === 0).map(d => d.ra), stroke: '#dc2626' },
                        // NEW: BHS Limit Series (Dashed)
                        { name: 'BHS Limit', values: monthlyProjection.filter((_, i) => i % 12 === 0).map(d => d.bhs), stroke: '#2dd4bf', strokeDasharray: '5 5' },
                        { name: 'Total CPF', values: monthlyProjection.filter((_, i) => i % 12 === 0).map(d => d.total), stroke: '#4f46e5' }
                     ]}
                     height={350}
                     onFormatY={(val) => val >= 1000000 ? `$${(val/1000000).toFixed(1)}M` : `$${(val/1000).toFixed(0)}k`}
                  />
                  {/* IMPACT ANALYSIS */}
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
                     </div>
                     <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-center">
                        <div className="text-[10px] uppercase font-bold text-amber-600">Medisave Limit (Age 65)</div>
                        <div className="text-2xl font-black text-amber-700">{fmtSGD(CPF_BHS_LIMIT * 1.5)}</div>
                        <div className="text-[9px] text-amber-500 mt-1">Projected BHS Ceiling</div>
                     </div>
                  </div>
               </div>
            ) : (
               <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-sm text-left">
                     <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase sticky top-0 z-10">
                        <tr>
                           <th className="p-3">Age</th>
                           <th className="p-3 text-right">Ordinary (OA)</th>
                           <th className="p-3 text-right">Special (SA)</th>
                           <th className="p-3 text-right">MediSave (MA)</th>
                           <th className="p-3 text-right">Retirement (RA)</th>
                           <th className="p-3 text-right text-indigo-600">Total</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                        {monthlyProjection.filter((_, i) => i % 12 === 0).map((row, idx) => (
                           <tr key={idx} className={`hover:bg-slate-50 ${row.is55 ? 'bg-emerald-50 font-bold' : ''}`}>
                              <td className="p-3 text-slate-700">Age {row.age}</td>
                              <td className="p-3 text-right font-mono text-slate-600">{fmtSGD(row.oa)}</td>
                              <td className="p-3 text-right font-mono text-amber-700">{fmtSGD(row.sa)}</td>
                              <td className="p-3 text-right font-mono text-teal-700 relative">
                                  {fmtSGD(row.ma)}
                                  {row.ma >= row.bhs && <span className="absolute top-1 right-1 text-[8px] bg-red-100 text-red-600 px-1 rounded">MAX</span>}
                              </td>
                              <td className="p-3 text-right font-mono text-red-700">{fmtSGD(row.ra)}</td>
                              <td className="p-3 text-right font-mono font-bold text-indigo-600">{fmtSGD(row.total)}</td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            )}
         </SectionCard>
      )}
    </div>
  );
};

export default CpfTab;
