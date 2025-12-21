
import React, { useState } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { useAi } from '../../contexts/AiContext';
import { toNum, fmtSGD, parseDob, monthsSinceDob, getAge } from '../../lib/helpers';
import LabeledText from '../../components/common/LabeledText';
import PageHeader from '../../components/layout/PageHeader';
import SectionCard from '../../components/layout/SectionCard';
import { Child } from '../../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const ChildrenTab: React.FC = () => {
  const { children, setChildren, profile, setProfile } = useClient();
  const { openAiWithPrompt } = useAi();
  const safeChildren = Array.isArray(children) ? children : [];
  
  const parentAge = getAge(profile.dob);
  
  const settings = profile.educationSettings || {
    inflationRate: '3',
    monthlyEducationCost: '0',
    educationStartAge: '7',
    educationDuration: '10',
    universityCost: '40000',
    universityDuration: '4'
  };

  const updateSettings = (key: string, val: string) => {
    setProfile({
      ...profile,
      educationSettings: { ...settings, [key]: val }
    });
  };
  
  const addChild = () => setChildren([...safeChildren, { id: Date.now(), name: '', dobISO: '', gender: 'male', existingFunds: '0', monthlyContribution: '0' }]);
  const removeChild = (id: number) => setChildren(safeChildren.filter(c => c.id !== id));
  const updateChild = (id: number, field: string, value: any) => setChildren(safeChildren.map(c => c.id === id ? { ...c, [field]: value } : c));

  const calculateChildFinancials = (child: Child) => {
    if (!child.dobISO) return null;
    const childDob = parseDob(child.dobISO);
    if (!childDob) return null;

    const today = new Date();
    const ageInMonths = monthsSinceDob(childDob, today.getFullYear(), today.getMonth());
    const currentAge = Math.floor(ageInMonths / 12);

    const inflationRate = toNum(settings.inflationRate, 3) / 100;
    const uniCostTotal = toNum(settings.universityCost, 40000);
    const investmentRate = 0.04;

    const uniStartAge = child.gender === 'male' ? 21 : 19;
    const yearsToUni = Math.max(0, uniStartAge - currentAge);
    
    const futureUniCost = uniCostTotal * Math.pow(1 + inflationRate, yearsToUni);
    const existing = toNum(child.existingFunds, 0);
    const monthly = toNum(child.monthlyContribution, 0);
    
    const fvExisting = existing * Math.pow(1 + investmentRate, yearsToUni);
    const fvMonthly = monthly * 12 * ( (Math.pow(1 + investmentRate, yearsToUni) - 1) / investmentRate );
    
    const projectedFunds = fvExisting + fvMonthly;
    const shortfall = futureUniCost - projectedFunds;
    const fundingRatio = Math.min(100, (projectedFunds / futureUniCost) * 100);

    // Milestones for Timeline
    const milestones = [
      { label: 'P1 Entry', age: 7, parentAge: parentAge + (7 - currentAge) },
      { label: 'Sec 1', age: 13, parentAge: parentAge + (13 - currentAge) },
      { label: 'University', age: uniStartAge, parentAge: parentAge + (uniStartAge - currentAge), isMajor: true }
    ];

    return {
       currentAge,
       uniStartAge,
       yearsToUni,
       futureUniCost,
       projectedFunds,
       shortfall,
       fundingRatio,
       milestones,
       chartData: [
          { name: 'Cost', amount: Math.round(futureUniCost), fill: '#ef4444' },
          { name: 'Projected', amount: Math.round(projectedFunds), fill: '#10b981' }
       ]
    };
  };

  const headerAction = (
    <button 
      onClick={() => openAiWithPrompt(`Evaluate my education funding strategy. I have ${safeChildren.length} children. Check for age gap risks between parent retirement and uni fees.`)}
      className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
    >
      <span>🎓</span> Funding Strategy Audit
    </button>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <PageHeader 
        title="Education Funding"
        icon="👶"
        subtitle="Aligning generational milestones and liability matching."
        action={headerAction}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         <SectionCard title="Global Assumptions" className="lg:col-span-1 h-fit">
            <div className="space-y-4">
               <LabeledText label="Education Inflation (%)" value={settings.inflationRate} onChange={(v) => updateSettings('inflationRate', v)} type="number" />
               <LabeledText label="Target University Fund ($)" value={settings.universityCost} onChange={(v) => updateSettings('universityCost', v)} type="number" placeholder="40000" isCurrency />
               <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Parent Current Age</div>
                  <div className="text-lg font-black text-slate-700">{parentAge} Years Old</div>
               </div>
            </div>
         </SectionCard>

         <div className="lg:col-span-2 space-y-6">
            {safeChildren.map((child) => {
               const financials = calculateChildFinancials(child);
               
               return (
                  <SectionCard key={child.id} noPadding className="group/card">
                     <div className="p-6">
                        <div className="flex flex-col md:flex-row gap-6 items-start mb-8">
                           <div className="flex-1 w-full">
                              <label className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] block mb-1">Child Identity</label>
                              <div className="flex gap-4">
                                 <input type="text" value={child.name} onChange={(e) => updateChild(child.id, 'name', e.target.value)} className="flex-1 font-bold text-xl border-b-2 border-slate-100 focus:border-indigo-500 outline-none pb-1 transition-all" placeholder="Name" />
                                 <input type="date" value={child.dobISO} onChange={(e) => updateChild(child.id, 'dobISO', e.target.value)} className="w-40 border-b-2 border-slate-100 focus:border-indigo-500 outline-none text-sm font-medium pb-1 transition-all" />
                                 <select value={child.gender} onChange={(e) => updateChild(child.id, 'gender', e.target.value)} className="w-24 border-b-2 border-slate-100 focus:border-indigo-500 outline-none text-sm font-bold pb-1 transition-all">
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                 </select>
                              </div>
                           </div>
                           <button onClick={() => removeChild(child.id)} className="text-slate-300 hover:text-red-500 transition-colors text-xl">✕</button>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-8">
                           <LabeledText label="Existing Fund ($)" value={child.existingFunds || ''} onChange={(v) => updateChild(child.id, 'existingFunds', v)} placeholder="0" isCurrency />
                           <LabeledText label="Monthly Commitment ($)" value={child.monthlyContribution || ''} onChange={(v) => updateChild(child.id, 'monthlyContribution', v)} placeholder="0" isCurrency />
                        </div>

                        {financials && (
                           <div className="space-y-10">
                              {/* 1. AGES SYNC TIMELINE */}
                              <div>
                                 <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-6">Milestone Synchronization</label>
                                 <div className="relative pt-6 pb-2">
                                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-100 -translate-y-1/2"></div>
                                    <div className="flex justify-between relative z-10">
                                       {financials.milestones.map((ms, i) => (
                                          <div key={i} className="flex flex-col items-center">
                                             <div className="text-[10px] font-black text-slate-400 mb-2 uppercase">{ms.label}</div>
                                             <div className={`w-3 h-3 rounded-full border-2 border-white shadow-sm transition-all duration-500 ${ms.isMajor ? 'bg-indigo-600 scale-125' : 'bg-slate-300'}`}></div>
                                             <div className="mt-3 text-center">
                                                <div className="text-xs font-black text-slate-800">Age {ms.age}</div>
                                                <div className={`text-[10px] font-bold mt-0.5 px-1.5 py-0.5 rounded ${ms.parentAge >= 60 ? 'bg-red-50 text-red-600' : 'text-indigo-500 bg-indigo-50'}`}>
                                                   Parent: {ms.parentAge}
                                                </div>
                                             </div>
                                          </div>
                                       ))}
                                    </div>
                                 </div>
                              </div>

                              {/* 2. FUNDING ANALYSIS */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center pt-6 border-t border-slate-50">
                                 <div className="h-[120px] w-full">
                                    <ResponsiveContainer>
                                       <BarChart data={financials.chartData} layout="vertical">
                                          <XAxis type="number" hide />
                                          <YAxis dataKey="name" type="category" width={60} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} axisLine={false} tickLine={false} />
                                          <Tooltip formatter={(v:number) => fmtSGD(v)} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                          <Bar dataKey="amount" barSize={16} radius={[0,8,8,0]} />
                                       </BarChart>
                                    </ResponsiveContainer>
                                 </div>
                                 
                                 <div className="bg-slate-50 p-5 rounded-2xl flex justify-between items-center">
                                    <div>
                                       <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Projected Gap</div>
                                       <div className={`text-2xl font-black ${financials.shortfall > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                          {financials.shortfall > 0 ? `${fmtSGD(financials.shortfall)}` : 'Fully Funded'}
                                       </div>
                                    </div>
                                    <div className="text-right">
                                       <div className="inline-block bg-white px-3 py-1 rounded-full text-[10px] font-black text-indigo-600 shadow-sm border border-indigo-50">
                                          {financials.fundingRatio.toFixed(0)}% READY
                                       </div>
                                       <p className="text-[9px] text-slate-400 mt-2 font-bold uppercase tracking-tighter">Target: {fmtSGD(financials.futureUniCost)}</p>
                                    </div>
                                 </div>
                              </div>
                           </div>
                        )}
                        {!financials && <div className="text-center py-10 text-slate-300 italic text-sm border-2 border-dashed border-slate-100 rounded-2xl">Initialize child data to sync milestones.</div>}
                     </div>
                  </SectionCard>
               );
            })}

            <button onClick={addChild} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all active:scale-[0.99]">
               ＋ Add Generational Milestone
            </button>
         </div>
      </div>
    </div>
  );
};

export default ChildrenTab;
