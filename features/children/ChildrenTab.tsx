
import React, { useState } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { useAi } from '../../contexts/AiContext';
import { toNum, fmtSGD, parseDob, monthsSinceDob } from '../../lib/helpers';
import LabeledText from '../../components/common/LabeledText';
import PageHeader from '../../components/layout/PageHeader';
import SectionCard from '../../components/layout/SectionCard';
import { Child } from '../../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';

const ChildrenTab: React.FC = () => {
  const { children, setChildren, age, profile, setProfile } = useClient();
  const { openAiWithPrompt } = useAi();
  const safeChildren = Array.isArray(children) ? children : [];
  
  const [showSettings, setShowSettings] = useState(false);
  
  const settings = profile.educationSettings || {
    inflationRate: '3',
    monthlyEducationCost: '0', // Tuition cost
    educationStartAge: '7',
    educationDuration: '10',
    universityCost: '40000', // Total Uni Cost (approx)
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

  // --- COST ENGINE ---
  const calculateChildFinancials = (child: Child) => {
    if (!child.dobISO) return null;
    const childDob = parseDob(child.dobISO);
    if (!childDob) return null;

    const today = new Date();
    const ageInMonths = monthsSinceDob(childDob, today.getFullYear(), today.getMonth());
    const currentAge = Math.floor(ageInMonths / 12);

    const inflationRate = toNum(settings.inflationRate, 3) / 100;
    const uniCostTotal = toNum(settings.universityCost, 40000);
    const investmentRate = 0.04; // Assumed portfolio growth for education fund

    // Auto-detect Uni Start based on Gender (NS for Males)
    const uniStartAge = child.gender === 'male' ? 21 : 19;
    const yearsToUni = Math.max(0, uniStartAge - currentAge);
    
    // 1. Future Cost of University
    const futureUniCost = uniCostTotal * Math.pow(1 + inflationRate, yearsToUni);

    // 2. Projected Funding
    const existing = toNum(child.existingFunds, 0);
    const monthly = toNum(child.monthlyContribution, 0);
    
    // Future Value of Existing
    const fvExisting = existing * Math.pow(1 + investmentRate, yearsToUni);
    // Future Value of Monthly (Annuity)
    const fvMonthly = monthly * 12 * ( (Math.pow(1 + investmentRate, yearsToUni) - 1) / investmentRate );
    
    const projectedFunds = fvExisting + fvMonthly;
    const shortfall = futureUniCost - projectedFunds;
    const fundingRatio = Math.min(100, (projectedFunds / futureUniCost) * 100);

    return {
       currentAge,
       uniStartAge,
       yearsToUni,
       futureUniCost,
       projectedFunds,
       shortfall,
       fundingRatio,
       chartData: [
          { name: 'Cost', amount: Math.round(futureUniCost), fill: '#ef4444' },
          { name: 'Projected', amount: Math.round(projectedFunds), fill: '#10b981' }
       ]
    };
  };

  const headerAction = (
    <button 
      onClick={() => openAiWithPrompt(`Analyze education funding for my children. Inflation 4%. Suggest specific endowment plans vs investing in S&P500 for a ${15}-year horizon.`)}
      className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
    >
      <span>🎓</span> AI Funding Strategy
    </button>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      
      <PageHeader 
        title="Education Fund"
        icon="👶"
        subtitle="Inflation-adjusted liability matching per child."
        action={headerAction}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* 1. GLOBAL SETTINGS */}
         <SectionCard title="Assumptions" className="lg:col-span-1 h-fit">
            <div className="space-y-4">
               <LabeledText label="Education Inflation (%)" value={settings.inflationRate} onChange={(v) => updateSettings('inflationRate', v)} type="number" />
               <LabeledText label="Total Uni Cost (Today $)" value={settings.universityCost} onChange={(v) => updateSettings('universityCost', v)} type="number" placeholder="40000" />
               <div className="text-[10px] text-gray-400">
                  Base cost for 4 years local university.
               </div>
            </div>
         </SectionCard>

         {/* 2. CHILD CARDS */}
         <div className="lg:col-span-2 space-y-6">
            {safeChildren.map((child, idx) => {
               const financials = calculateChildFinancials(child);
               
               return (
                  <SectionCard key={child.id} noPadding>
                     <div className="p-6">
                        {/* Header Inputs */}
                        <div className="flex flex-col md:flex-row gap-4 items-end mb-6">
                           <div className="flex-1">
                              <label className="text-[10px] font-bold text-gray-400 uppercase">Child Name</label>
                              <input type="text" value={child.name} onChange={(e) => updateChild(child.id, 'name', e.target.value)} className="w-full font-bold text-lg border-b border-gray-200 outline-none" placeholder="Name" />
                           </div>
                           <div className="w-32">
                              <label className="text-[10px] font-bold text-gray-400 uppercase">DOB</label>
                              <input type="date" value={child.dobISO} onChange={(e) => updateChild(child.id, 'dobISO', e.target.value)} className="w-full border-b border-gray-200 outline-none text-sm" />
                           </div>
                           <div className="w-24">
                              <select value={child.gender} onChange={(e) => updateChild(child.id, 'gender', e.target.value)} className="w-full border-b border-gray-200 outline-none text-sm font-bold">
                                 <option value="male">Male</option>
                                 <option value="female">Female</option>
                              </select>
                           </div>
                           <button onClick={() => removeChild(child.id)} className="text-red-300 hover:text-red-500">×</button>
                        </div>

                        {/* Financial Inputs */}
                        <div className="grid grid-cols-2 gap-4 mb-6 bg-gray-50 p-4 rounded-xl">
                           <LabeledText label="Current Savings ($)" value={child.existingFunds || ''} onChange={(v) => updateChild(child.id, 'existingFunds', v)} placeholder="0" />
                           <LabeledText label="Monthly Contribution ($)" value={child.monthlyContribution || ''} onChange={(v) => updateChild(child.id, 'monthlyContribution', v)} placeholder="0" />
                        </div>

                        {/* Analysis Output */}
                        {financials ? (
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                              <div className="h-[150px] w-full">
                                 <ResponsiveContainer>
                                    <BarChart data={financials.chartData} layout="vertical">
                                       <XAxis type="number" hide />
                                       <YAxis dataKey="name" type="category" width={60} tick={{fontSize: 10}} />
                                       <Tooltip formatter={(v:number) => fmtSGD(v)} />
                                       <Bar dataKey="amount" barSize={20} radius={[0,4,4,0]} label={{ position: 'right', fill: '#666', fontSize: 10, formatter: (v:number) => fmtSGD(v) }} />
                                    </BarChart>
                                 </ResponsiveContainer>
                              </div>
                              
                              <div className="text-right">
                                 <div className="mb-4">
                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Projected Shortfall</div>
                                    <div className={`text-2xl font-black ${financials.shortfall > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                       {financials.shortfall > 0 ? `-${fmtSGD(financials.shortfall)}` : 'Fully Funded'}
                                    </div>
                                 </div>
                                 <div className="inline-block bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold">
                                    {financials.fundingRatio.toFixed(0)}% Funded
                                 </div>
                                 <div className="text-[10px] text-gray-400 mt-2">
                                    Uni starts in {financials.yearsToUni} years
                                 </div>
                              </div>
                           </div>
                        ) : (
                           <div className="text-center text-xs text-gray-400 italic">Enter DOB to calculate funding.</div>
                        )}
                     </div>
                  </SectionCard>
               );
            })}

            <button onClick={addChild} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 font-bold hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50 transition-all">
               + Add Child
            </button>
         </div>
      </div>
    </div>
  );
};

export default ChildrenTab;
