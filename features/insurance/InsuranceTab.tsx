
import React, { useMemo, useState } from 'react';
import { toNum, fmtSGD } from '../../lib/helpers';
import LabeledText from '../../components/common/LabeledText';
import LabeledSelect from '../../components/common/LabeledSelect';
import Card from '../../components/common/Card';
import { InsuranceState, Profile, InsurancePolicy, PolicyType } from '../../types';

interface InsuranceTabProps {
  insuranceState: InsuranceState;
  setInsuranceState: (s: InsuranceState) => void;
  profile: Profile;
}

const InsuranceTab: React.FC<InsuranceTabProps> = ({ insuranceState, setInsuranceState, profile }) => {
  // Form State
  const [newPolicy, setNewPolicy] = useState<Omit<InsurancePolicy, 'id'>>({
    name: '',
    type: 'term',
    deathCoverage: '',
    tpdCoverage: '',
    earlyCiCoverage: '',
    lateCiCoverage: ''
  });

  // Edit State
  const [editingId, setEditingId] = useState<number | null>(null);

  const policies = insuranceState.policies || [];

  // Use Take Home if available, else derive from gross, else 0
  const monthlyTakeHome = toNum(profile.takeHome) > 0 
    ? toNum(profile.takeHome) 
    : toNum(profile.grossSalary) * 0.8; // Rough estimate if take home not set

  // --- CALCULATE TOTALS FROM POLICIES ---
  const totals = useMemo(() => {
    return policies.reduce((acc, p) => ({
      death: acc.death + toNum(p.deathCoverage),
      tpd: acc.tpd + toNum(p.tpdCoverage),
      earlyCi: acc.earlyCi + toNum(p.earlyCiCoverage),
      lateCi: acc.lateCi + toNum(p.lateCiCoverage)
    }), { death: 0, tpd: 0, earlyCi: 0, lateCi: 0 });
  }, [policies]);

  const totalCiCombined = totals.earlyCi + totals.lateCi;

  // --- REQUIREMENTS ---
  // Death & TPD: 10 Years (120 months)
  // CI: 5 Years (60 months)
  const reqDeath = monthlyTakeHome * 12 * 10;
  const reqTPD = monthlyTakeHome * 12 * 10;
  const reqCI = monthlyTakeHome * 12 * 5;

  const shortfallDeath = reqDeath - totals.death;
  const shortfallTPD = reqTPD - totals.tpd;
  const shortfallCI = reqCI - totalCiCombined;

  // --- HELPERS ---
  const formatInput = (val: string | number) => {
    if (val === '' || val === undefined || val === null) return '';
    const num = parseFloat(String(val).replace(/[^0-9.]/g, ''));
    if (isNaN(num)) return '';
    return num.toLocaleString('en-US');
  };

  // --- ACTIONS ---
  const savePolicy = () => {
    if (editingId) {
      // Update existing
      setInsuranceState({
        ...insuranceState,
        policies: policies.map(p => p.id === editingId ? { ...newPolicy, id: editingId } : p)
      });
    } else {
      // Create new
      const policy: InsurancePolicy = {
        ...newPolicy,
        id: Date.now()
      };
      setInsuranceState({
        ...insuranceState,
        policies: [...policies, policy]
      });
    }
    resetForm();
  };

  const resetForm = () => {
    setNewPolicy({
      name: '',
      type: 'term',
      deathCoverage: '',
      tpdCoverage: '',
      earlyCiCoverage: '',
      lateCiCoverage: ''
    });
    setEditingId(null);
  };

  const editPolicy = (policy: InsurancePolicy) => {
    setNewPolicy({
      name: policy.name,
      type: policy.type,
      deathCoverage: formatInput(policy.deathCoverage),
      tpdCoverage: formatInput(policy.tpdCoverage),
      earlyCiCoverage: formatInput(policy.earlyCiCoverage),
      lateCiCoverage: formatInput(policy.lateCiCoverage)
    });
    setEditingId(policy.id);
    // Optional: Scroll to form could be added here
  };

  const duplicatePolicy = (policy: InsurancePolicy) => {
    const dup: InsurancePolicy = {
      ...policy,
      id: Date.now(),
      name: `${policy.name} (Copy)`
    };
    setInsuranceState({
      ...insuranceState,
      policies: [...policies, dup]
    });
  };

  const removePolicy = (id: number) => {
    if (editingId === id) resetForm();
    setInsuranceState({
      ...insuranceState,
      policies: policies.filter(p => p.id !== id)
    });
  };

  const updateNewPolicy = (field: keyof typeof newPolicy, value: string) => {
    setNewPolicy({ ...newPolicy, [field]: value });
  };

  const handleBlur = (field: keyof typeof newPolicy) => {
    const val = newPolicy[field];
    setNewPolicy(prev => ({
      ...prev,
      [field]: formatInput(val)
    }));
  };

  if (!profile.name || monthlyTakeHome <= 0) {
    return (
      <div className="p-5">
        <Card title="⚠️ Profile Required" value="Please enter salary details in the Profile tab first." tone="warn" />
      </div>
    );
  }

  const renderAnalysis = (title: string, required: number, current: number, shortfall: number, desc: string) => {
    const isCovered = shortfall <= 0;
    return (
      <div className={`p-5 rounded-xl border-2 mb-4 transition-all ${isCovered ? 'bg-emerald-50 border-emerald-500' : 'bg-red-50 border-red-500'}`}>
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div className="flex-1">
            <h3 className={`text-lg font-bold m-0 mb-1 ${isCovered ? 'text-emerald-800' : 'text-red-800'}`}>
              {title} Coverage
            </h3>
            <p className="text-sm text-gray-600 mb-2">{desc}</p>
            <div className="flex flex-wrap gap-2 text-xs">
              <div className="bg-white/60 px-2 py-1 rounded border border-gray-200">
                Required: <strong>{fmtSGD(required)}</strong>
              </div>
              <div className="bg-white/60 px-2 py-1 rounded border border-gray-200">
                Current Total: <strong>{fmtSGD(current)}</strong>
              </div>
            </div>
          </div>
          
          <div className="text-right">
             <div className="text-xs font-bold uppercase mb-1 opacity-70">
                {isCovered ? 'Surplus' : 'Shortfall'}
             </div>
             <div className="text-3xl font-extrabold tracking-tight">
               {isCovered ? (
                 <span className="text-emerald-600">+{fmtSGD(Math.abs(shortfall))}</span>
               ) : (
                 <span className="text-red-600">-{fmtSGD(Math.abs(shortfall))}</span>
               )}
             </div>
             {isCovered && <div className="text-xs font-bold text-emerald-700 mt-1">✅ Fully Covered</div>}
             {!isCovered && <div className="text-xs font-bold text-red-700 mt-1">⚠️ Protection Gap</div>}
          </div>
        </div>
      </div>
    );
  };

  const getPolicyTypeLabel = (type: PolicyType) => {
    switch(type) {
      case 'term': return 'Term Life';
      case 'whole_life': return 'Whole Life';
      case 'ilp': return 'Invest + Insure (ILP)';
      case 'pure_ci': return 'Pure CI Plan';
      case 'investment_only': return 'Investment';
      default: return type;
    }
  };

  const getPolicyColor = (type: PolicyType) => {
    switch(type) {
      case 'term': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'whole_life': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'ilp': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'pure_ci': return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'investment_only': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-5">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-2 border-indigo-500 rounded-xl p-6 mb-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="text-4xl">🛡️</div>
          <div>
            <h3 className="m-0 text-indigo-900 text-xl font-bold">Comprehensive Insurance Planning</h3>
            <p className="m-1 text-indigo-800 text-sm opacity-80">
              Analysis based on take-home income of <strong>{fmtSGD(monthlyTakeHome)}/month</strong>
            </p>
          </div>
        </div>
      </div>

      {/* 1. GAP ANALYSIS (Smart Tools) */}
      <div className="mb-8">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <span>📊</span> Protection Gap Analysis
        </h3>
        
        {renderAnalysis(
          'Death / Terminal Illness', 
          reqDeath, 
          totals.death, 
          shortfallDeath, 
          `Target: 10 Years Annual Income`
        )}

        {renderAnalysis(
          'Total Permanent Disability (TPD)', 
          reqTPD, 
          totals.tpd, 
          shortfallTPD, 
          `Target: 10 Years Annual Income`
        )}

        {renderAnalysis(
          'Critical Illness (Early + Late)', 
          reqCI, 
          totalCiCombined, 
          shortfallCI, 
          `Target: 5 Years Annual Income (Sum of Early & Late Coverage)`
        )}
      </div>

      {/* 2. EXISTING POLICIES LIST */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">📜 Your Policy Portfolio</h3>
        
        {policies.length === 0 ? (
          <div className="text-center p-8 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-gray-500">
            No policies added yet. Add your current insurance policies below to see your gap analysis.
          </div>
        ) : (
          <div className="grid gap-3">
            {policies.map((p) => (
              <div key={p.id} className={`flex flex-col md:flex-row justify-between items-start md:items-center p-4 rounded-lg border gap-4 transition-colors ${editingId === p.id ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${getPolicyColor(p.type)}`}>
                      {getPolicyTypeLabel(p.type)}
                    </span>
                    <span className="font-bold text-gray-900">
                      {p.name || 'Unnamed Policy'}
                      {editingId === p.id && <span className="ml-2 text-xs text-indigo-600">(Editing...)</span>}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 mt-2">
                    {toNum(p.deathCoverage) > 0 && <span>💀 Death: <strong>{fmtSGD(p.deathCoverage)}</strong></span>}
                    {toNum(p.tpdCoverage) > 0 && <span>♿ TPD: <strong>{fmtSGD(p.tpdCoverage)}</strong></span>}
                    {toNum(p.earlyCiCoverage) > 0 && <span>🏥 Early CI: <strong>{fmtSGD(p.earlyCiCoverage)}</strong></span>}
                    {toNum(p.lateCiCoverage) > 0 && <span>🏥 Late CI: <strong>{fmtSGD(p.lateCiCoverage)}</strong></span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => editPolicy(p)}
                    className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 rounded text-xs font-bold transition-colors"
                    disabled={editingId === p.id}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => duplicatePolicy(p)}
                    className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 rounded text-xs font-bold transition-colors"
                  >
                    Duplicate
                  </button>
                  <button 
                    onClick={() => removePolicy(p.id)}
                    className="px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 rounded text-xs font-bold transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            
            {/* Total Summary Footer */}
            <div className="mt-2 p-3 bg-gray-100 rounded-lg flex flex-wrap gap-4 text-xs font-bold text-gray-700 justify-end">
              <span>Total Death: {fmtSGD(totals.death)}</span>
              <span>Total TPD: {fmtSGD(totals.tpd)}</span>
              <span>Total CI (Early+Late): {fmtSGD(totalCiCombined)}</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. ADD / EDIT POLICY FORM */}
      <div className={`border-2 border-dashed rounded-xl p-6 transition-colors ${editingId ? 'bg-indigo-50 border-indigo-300' : 'bg-gray-50 border-gray-300'}`}>
        <div className="flex justify-between items-center mb-4">
           <h3 className={`text-base font-bold ${editingId ? 'text-indigo-800' : 'text-gray-800'}`}>
             {editingId ? '✏️ Edit Policy' : '➕ Add Policy'}
           </h3>
           {editingId && (
             <button onClick={resetForm} className="text-xs text-red-600 font-bold hover:underline">
               Cancel Edit
             </button>
           )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <LabeledText 
            label="Policy Name / Provider" 
            value={newPolicy.name} 
            onChange={(v) => updateNewPolicy('name', v)} 
            placeholder="e.g. Prudential PruActive" 
          />
          <LabeledSelect 
            label="Policy Type" 
            value={newPolicy.type} 
            onChange={(v) => updateNewPolicy('type', v)} 
            options={[
              { label: 'Term Life', value: 'term' },
              { label: 'Whole Life Plan', value: 'whole_life' },
              { label: 'Invest + Insure (ILP)', value: 'ilp' },
              { label: 'Pure CI Plan', value: 'pure_ci' },
              { label: 'Investment Only', value: 'investment_only' }
            ]}
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <LabeledText 
            label="Death Coverage ($)" 
            value={newPolicy.deathCoverage} 
            onChange={(v) => updateNewPolicy('deathCoverage', v)} 
            onBlur={() => handleBlur('deathCoverage')}
            placeholder="0" 
            type="text" // Changed to text to support commas
          />
          <LabeledText 
            label="TPD Coverage ($)" 
            value={newPolicy.tpdCoverage} 
            onChange={(v) => updateNewPolicy('tpdCoverage', v)} 
            onBlur={() => handleBlur('tpdCoverage')}
            placeholder="0" 
            type="text"
          />
          <LabeledText 
            label="Early Stage CI ($)" 
            value={newPolicy.earlyCiCoverage} 
            onChange={(v) => updateNewPolicy('earlyCiCoverage', v)} 
            onBlur={() => handleBlur('earlyCiCoverage')}
            placeholder="0" 
            type="text"
          />
          <LabeledText 
            label="Late Stage CI ($)" 
            value={newPolicy.lateCiCoverage} 
            onChange={(v) => updateNewPolicy('lateCiCoverage', v)} 
            onBlur={() => handleBlur('lateCiCoverage')}
            placeholder="0" 
            type="text"
          />
        </div>

        <button 
          onClick={savePolicy}
          disabled={!newPolicy.name}
          className={`px-5 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm ${editingId ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-800 text-white hover:bg-gray-900'}`}
        >
          {editingId ? 'Update Policy' : 'Add Policy to Portfolio'}
        </button>
      </div>
    </div>
  );
};

export default InsuranceTab;
