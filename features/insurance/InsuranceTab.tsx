
import React, { useMemo, useState } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { toNum, fmtSGD, getAge } from '../../lib/helpers';
import LabeledText from '../../components/common/LabeledText';
import LabeledSelect from '../../components/common/LabeledSelect';
import PageHeader from '../../components/layout/PageHeader';
import SectionCard from '../../components/layout/SectionCard';
import LineChart from '../../components/common/LineChart'; // Reusing LineChart for Timeline
import { InsurancePolicy, PolicyType } from '../../types';

const InsuranceTab: React.FC = () => {
  const { insuranceState, setInsuranceState, profile, propertyState } = useClient();
  const currentAge = getAge(profile.dob);
  
  const [newPolicy, setNewPolicy] = useState<Omit<InsurancePolicy, 'id'>>({
    name: '', type: 'term', deathCoverage: '', tpdCoverage: '', earlyCiCoverage: '', lateCiCoverage: '', expiryAge: '99'
  });
  const [editingId, setEditingId] = useState<number | null>(null);

  const policies = insuranceState.policies || [];
  const monthlyTakeHome = toNum(profile.takeHome) > 0 ? toNum(profile.takeHome) : toNum(profile.grossSalary) * 0.8;

  // --- 1. AGGREGATION (SNAPSHOT) ---
  const totals = useMemo(() => policies.reduce((acc, p) => ({
    death: acc.death + toNum(p.deathCoverage),
    tpd: acc.tpd + toNum(p.tpdCoverage),
    earlyCi: acc.earlyCi + toNum(p.earlyCiCoverage),
    lateCi: acc.lateCi + toNum(p.lateCiCoverage)
  }), { death: 0, tpd: 0, earlyCi: 0, lateCi: 0 }), [policies]);

  const totalCiCombined = totals.earlyCi + totals.lateCi;

  // --- 2. REQUIREMENTS (SNAPSHOT) ---
  const reqDeath = monthlyTakeHome * 12 * 10; // 10 Years Income
  const reqTPD = monthlyTakeHome * 12 * 10;
  const reqCI = monthlyTakeHome * 12 * 5; // 5 Years Income

  // --- 3. TIMELINE SIMULATION (MASTER LEVEL FEATURE) ---
  const timelineData = useMemo(() => {
    const data = [];
    const maxAge = 85;
    const retirementAge = toNum(profile.retirementAge, 65);
    
    // Mortgage
    const mortgageAmount = toNum(propertyState?.propertyPrice) - (toNum(propertyState?.propertyPrice) * toNum(propertyState?.downPaymentPercent)/100);
    const loanTenure = toNum(propertyState?.loanTenure, 25);
    const mortgageEndAge = currentAge + loanTenure;

    for (let age = currentAge; age <= maxAge; age++) {
       const yearsFromNow = age - currentAge;
       
       // A. Liability Calculation
       // 1. Income Replacement (Reduces to 0 at retirement)
       const incomeLiability = age < retirementAge 
          ? (monthlyTakeHome * 12 * Math.max(0, retirementAge - age)) 
          : 0;
       
       // 2. Mortgage (Linear Paydown approximation for visuals)
       const mortgageLiability = age < mortgageEndAge 
          ? Math.max(0, mortgageAmount * (1 - (yearsFromNow / loanTenure))) 
          : 0;
       
       const totalLiability = incomeLiability + mortgageLiability;

       // B. Coverage Calculation
       let coverageDeath = 0;
       let coverageCI = 0;
       
       policies.forEach(p => {
          const expiry = toNum(p.expiryAge, 99);
          if (age <= expiry) {
             coverageDeath += toNum(p.deathCoverage);
             coverageCI += (toNum(p.earlyCiCoverage) + toNum(p.lateCiCoverage));
          }
       });

       data.push({
          age,
          liability: Math.round(totalLiability),
          coverDeath: Math.round(coverageDeath),
          coverCI: Math.round(coverageCI),
          // Gap analysis
          gap: Math.round(coverageDeath - totalLiability)
       });
    }
    return data;
  }, [policies, currentAge, profile.retirementAge, monthlyTakeHome, propertyState]);

  // --- HANDLERS ---
  const savePolicy = () => {
    const policy = { ...newPolicy, id: editingId || Date.now() };
    if (editingId) setInsuranceState({ ...insuranceState, policies: policies.map(p => p.id === editingId ? policy : p) });
    else setInsuranceState({ ...insuranceState, policies: [...policies, policy] });
    resetForm();
  };

  const resetForm = () => {
    setNewPolicy({ name: '', type: 'term', deathCoverage: '', tpdCoverage: '', earlyCiCoverage: '', lateCiCoverage: '', expiryAge: '99' });
    setEditingId(null);
  };

  const removePolicy = (id: number) => {
    setInsuranceState({ ...insuranceState, policies: policies.filter(p => p.id !== id) });
    if (editingId === id) resetForm();
  };

  const editPolicy = (p: InsurancePolicy) => {
    setNewPolicy({ ...p });
    setEditingId(p.id);
  };

  // --- COMPONENT: SHIELD VISUALIZER ---
  const DefenseShield = ({ title, current, required, icon, color }: { title: string, current: number, required: number, icon: string, color: string }) => {
    const percentage = Math.min(100, Math.max(0, (current / required) * 100));
    const shortfall = Math.max(0, required - current);
    const isSafe = percentage >= 100;
    
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 relative overflow-hidden group hover:shadow-md transition-all">
        <div className={`absolute bottom-0 left-0 h-1 transition-all duration-1000 ${isSafe ? 'bg-emerald-500 w-full' : 'bg-red-500'}`} style={{ width: isSafe ? '100%' : `${percentage}%` }}></div>
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${color}`}>{icon}</div>
            <div>
              <h4 className="text-sm font-bold text-gray-900">{title}</h4>
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">Target: {fmtSGD(required)}</div>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-xl font-black ${isSafe ? 'text-emerald-600' : 'text-gray-900'}`}>{percentage.toFixed(0)}%</div>
            <div className="text-[10px] text-gray-400 font-bold uppercase">Secured</div>
          </div>
        </div>
        <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden mb-3 inner-shadow">
          <div className={`h-full rounded-full transition-all duration-1000 ${isSafe ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : 'bg-gradient-to-r from-red-400 to-red-600'}`} style={{ width: `${percentage}%` }}></div>
        </div>
        <div className="flex justify-between items-end">
          <div><div className="text-[10px] text-gray-400 uppercase font-bold">Current Cover</div><div className="text-sm font-bold text-gray-700">{fmtSGD(current)}</div></div>
          {shortfall > 0 ? (
             <div className="text-right"><div className="text-[10px] text-red-400 uppercase font-bold">Risk Exposure</div><div className="text-sm font-bold text-red-600">-{fmtSGD(shortfall)}</div></div>
          ) : (
             <div className="text-right px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold uppercase">🛡️ Fully Protected</div>
          )}
        </div>
      </div>
    );
  };

  if (!profile.name || monthlyTakeHome <= 0) return <div className="p-10 text-center text-gray-500">Please complete income details in Profile first.</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      
      <PageHeader 
        title="Insurance Portfolio"
        icon="🛡️"
        subtitle="Visualize coverage gaps and manage policies."
      />

      {/* 1. TIMELINE OF RISK (NEW) */}
      <SectionCard title="Coverage vs Liability Timeline">
         <div className="flex justify-between items-end mb-4 px-2">
            <div className="text-xs text-gray-500 max-w-lg">
               This chart compares your <strong>Total Liabilities</strong> (Mortgage + Income Replacement) against your <strong>Death Coverage</strong> over time. 
               <br/><span className="text-red-500 font-bold">Red Zones</span> indicate periods where coverage drops below liability (e.g. Term expiry).
            </div>
            <div className="flex gap-4 text-[10px] font-bold uppercase">
               <div className="flex items-center gap-1"><div className="w-3 h-1 bg-red-400"></div> Liability Curve</div>
               <div className="flex items-center gap-1"><div className="w-3 h-1 bg-indigo-600"></div> Coverage</div>
            </div>
         </div>
         <div className="h-[300px]">
            <LineChart 
               xLabels={timelineData.filter((_, i) => i % 5 === 0).map(d => `Age ${d.age}`)}
               series={[
                  { name: 'Liability', values: timelineData.filter((_, i) => i % 5 === 0).map(d => d.liability), stroke: '#f87171' },
                  { name: 'Coverage', values: timelineData.filter((_, i) => i % 5 === 0).map(d => d.coverDeath), stroke: '#4f46e5' }
               ]}
               height={300}
               onFormatY={(v) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : `$${(v/1000).toFixed(0)}k`}
            />
         </div>
      </SectionCard>

      {/* 2. DEFENSE GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <DefenseShield title="Legacy Protection" current={totals.death} required={reqDeath} icon="☠️" color="bg-slate-100 text-slate-600" />
         <DefenseShield title="Income Security (TPD)" current={totals.tpd} required={reqTPD} icon="♿" color="bg-blue-50 text-blue-600" />
         <DefenseShield title="Crisis Recovery (CI)" current={totalCiCombined} required={reqCI} icon="❤️‍🩹" color="bg-red-50 text-red-600" />
      </div>

      {/* 3. PORTFOLIO MANAGER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         <div className="lg:col-span-2">
            <SectionCard title="Active Policies" noPadding action={<span className="text-xs font-bold bg-gray-200 text-gray-600 px-2 py-1 rounded-full">{policies.length} Plans</span>}>
               {policies.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">No policies recorded. Add one to see the analysis.</div>
               ) : (
                  <div className="divide-y divide-gray-100">
                     {policies.map(p => (
                        <div key={p.id} className="p-4 hover:bg-gray-50 transition-colors flex justify-between items-center group">
                           <div>
                              <div className="font-bold text-gray-900 text-sm">{p.name}</div>
                              <div className="flex gap-2 mt-1 items-center">
                                 <span className="text-[10px] uppercase font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{p.type}</span>
                                 <span className="text-[10px] text-gray-400">Ends Age: {p.expiryAge || '99'}</span>
                                 <span className="text-[10px] text-indigo-600 font-bold ml-2">Death: {fmtSGD(p.deathCoverage)}</span>
                              </div>
                           </div>
                           <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => editPolicy(p)} className="text-xs font-bold text-indigo-600 hover:underline">Edit</button>
                              <button onClick={() => removePolicy(p.id)} className="text-xs font-bold text-red-600 hover:underline">Remove</button>
                           </div>
                        </div>
                     ))}
                  </div>
               )}
            </SectionCard>
         </div>

         <SectionCard title={editingId ? 'Edit Policy' : 'Add New Protection'} className="h-fit">
            <div className="space-y-4">
               <LabeledText label="Plan Name" value={newPolicy.name} onChange={(v) => setNewPolicy({...newPolicy, name: v})} placeholder="e.g. AIA Secure Life" />
               <div className="grid grid-cols-2 gap-4">
                  <LabeledSelect 
                     label="Category" 
                     value={newPolicy.type} 
                     onChange={(v) => setNewPolicy({...newPolicy, type: v as PolicyType})} 
                     options={[{label: 'Term Life', value: 'term'}, {label: 'Whole Life', value: 'whole_life'}, {label: 'ILP', value: 'ilp'}, {label: 'Pure CI', value: 'pure_ci'}]} 
                  />
                  <LabeledText label="Expires At Age" value={newPolicy.expiryAge || '99'} onChange={(v) => setNewPolicy({...newPolicy, expiryAge: v})} placeholder="99" />
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <LabeledText label="Death ($)" value={newPolicy.deathCoverage} onChange={(v) => setNewPolicy({...newPolicy, deathCoverage: v})} placeholder="0" />
                  <LabeledText label="TPD ($)" value={newPolicy.tpdCoverage} onChange={(v) => setNewPolicy({...newPolicy, tpdCoverage: v})} placeholder="0" />
                  <LabeledText label="Early CI ($)" value={newPolicy.earlyCiCoverage} onChange={(v) => setNewPolicy({...newPolicy, earlyCiCoverage: v})} placeholder="0" />
                  <LabeledText label="Late CI ($)" value={newPolicy.lateCiCoverage} onChange={(v) => setNewPolicy({...newPolicy, lateCiCoverage: v})} placeholder="0" />
               </div>
               <div className="flex gap-2 pt-2">
                  {editingId && <button onClick={resetForm} className="flex-1 py-2 border border-gray-300 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100">Cancel</button>}
                  <button onClick={savePolicy} disabled={!newPolicy.name} className="flex-1 py-3 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors shadow-lg disabled:opacity-50">
                     {editingId ? 'Save Changes' : 'Add to Portfolio'}
                  </button>
               </div>
            </div>
         </SectionCard>
      </div>
    </div>
  );
};

export default InsuranceTab;
