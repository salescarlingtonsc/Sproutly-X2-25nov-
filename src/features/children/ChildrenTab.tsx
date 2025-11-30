
import React, { useMemo, useState } from 'react';
import { toNum, fmtSGD, parseDob, monthsSinceDob } from '../../lib/helpers';
import LabeledText from '../../components/common/LabeledText';
import LabeledSelect from '../../components/common/LabeledSelect';
import { Child, Profile } from '../../types';

interface ChildrenTabProps {
  children: Child[];
  setChildren: (c: Child[]) => void;
  ageYears: number;
  profile: Profile; // Added profile access
  setProfile: (p: Profile) => void; // Added setProfile access
}

const ChildrenTab: React.FC<ChildrenTabProps> = ({ children, setChildren, ageYears, profile, setProfile }) => {
  // Ensure children is always an array
  const safeChildren = Array.isArray(children) ? children : [];
  const [showSettings, setShowSettings] = useState(false);
  
  // Extract settings from profile or defaults
  const settings = profile.educationSettings || {
    inflationRate: '3',
    monthlyEducationCost: '800', // Default 800/mo
    educationStartAge: '7',
    educationDuration: '10',
    universityCost: '8750',
    universityDuration: '4'
  };

  const updateSettings = (key: string, val: string) => {
    setProfile({
      ...profile,
      educationSettings: {
        ...settings,
        [key]: val
      }
    });
  };
  
  // Add, remove, update logic
  const addChild = () => {
    setChildren([...safeChildren, { id: Date.now(), name: '', dobISO: '', gender: 'male' }]);
  };

  const removeChild = (id: number) => {
    setChildren(safeChildren.filter(c => c.id !== id));
  };

  const updateChild = (id: number, field: string, value: any) => {
    setChildren(safeChildren.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  // Cost calculation, inflation, milestones
  const calculateChildCosts = (child: Child) => {
    if (!child.dobISO) return null;
    const childDob = parseDob(child.dobISO);
    if (!childDob) return null;

    const today = new Date();
    const ageInMonths = monthsSinceDob(childDob, today.getFullYear(), today.getMonth());
    const currentAge = Math.floor(ageInMonths / 12);

    // USE CUSTOM SETTINGS
    const inflationRate = toNum(settings.inflationRate, 3) / 100;
    
    // Monthly Cost & Duration Logic
    const monthlyCost = toNum(settings.monthlyEducationCost, 800);
    const startAge = toNum(settings.educationStartAge, 7);
    const duration = toNum(settings.educationDuration, 10);
    const endAge = startAge + duration - 1; // e.g. 7 + 10 - 1 = 16 (Inclusive range)

    const costUni = toNum(settings.universityCost, 8750);
    const durUni = toNum(settings.universityDuration, 4);

    const uniStartAge = child.gender === 'male' ? 21 : 19;
    const uniEndAge = uniStartAge + durUni - 1;

    const stages = [
      {
        name: `Tuition & Enrichment (Ages ${startAge}-${endAge})`,
        start: startAge,
        end: endAge,
        monthlyCost: monthlyCost,
        yearlyCost: monthlyCost * 12,
        description: 'Monthly fees for tuition, enrichment, school misc.',
        breakdown: `${duration} years × ${fmtSGD(monthlyCost * 12)}/yr = ${fmtSGD(monthlyCost * 12 * duration)} total (before inflation)`
      },
      {
        name: `University (Ages ${uniStartAge}-${uniEndAge})${child.gender === 'male' ? ' - After NS' : ''}`,
        start: uniStartAge,
        end: uniEndAge,
        monthlyCost: 0,
        yearlyCost: costUni,
        description: 'Tuition fees (subsidized), living allowance, textbooks',
        breakdown: `${durUni} years × ${fmtSGD(costUni)}/year = ${fmtSGD(costUni * durUni)} total (before inflation)`,
        hasLoanOption: true
      }
    ];

    let totalCost = 0;
    let totalCostWithLoan = 0;
    let breakdown: any[] = [];

    stages.forEach(stage => {
      if (currentAge <= stage.end) {
        const yearsUntilStart = Math.max(0, stage.start - currentAge);
        const duration = stage.end - Math.max(stage.start, currentAge) + 1;
        if (duration > 0) {
          let stageCost = 0;
          for (let year = 0; year < duration; year++) {
            const yearsFromNow = yearsUntilStart + year;
            const inflatedCost = stage.yearlyCost * Math.pow(1 + inflationRate, yearsFromNow);
            stageCost += inflatedCost;
          }
          totalCost += stageCost;

          // Loan simulation if university
          let loanTotalCost = stageCost;
          let loanInterest = 0;
          if (stage.hasLoanOption) {
            // Bank loan: 4% interest, 10-year repayment
            const loanAmount = stageCost;
            const annualRate = 0.04;
            const years = 10;
            const monthlyRate = annualRate / 12;
            const numPayments = years * 12;
            const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
            loanTotalCost = monthlyPayment * numPayments;
            loanInterest = loanTotalCost - loanAmount;
          }

          totalCostWithLoan += loanTotalCost;
          breakdown.push({
            stage: stage.name,
            yearsUntilStart,
            duration,
            cost: stageCost,
            description: stage.description,
            breakdownText: stage.breakdown,
            currentYearlyCost: stage.yearlyCost,
            inflatedFirstYearCost: stage.yearlyCost * Math.pow(1 + inflationRate, yearsUntilStart),
            hasLoanOption: !!stage.hasLoanOption,
            loanTotalCost: stage.hasLoanOption ? loanTotalCost : 0,
            loanInterest: stage.hasLoanOption ? loanInterest : 0
          });
        }
      }
    });

    return { totalCost, totalCostWithLoan, breakdown, currentAge };
  };

  const allChildrenCosts = safeChildren.map(child => ({
    child,
    costs: calculateChildCosts(child)
  })).filter(c => c.costs !== null);

  const grandTotal = allChildrenCosts.reduce((sum, c) => sum + (c.costs?.totalCost || 0), 0);

  // Timeline with realistic "when do you retire"
  const calculateRetirementTimeline = () => {
    if (!ageYears || allChildrenCosts.length === 0) return null;
    const currentYear = new Date().getFullYear();

    let latestUniEndYear = 0;
    const timeline = allChildrenCosts.map(({ child, costs }) => {
      if (!costs) return null;
      const uniStage = costs.breakdown.find((s: any) => s.stage.includes('University'));
      const psleStage = costs.breakdown.find((s: any) => s.stage.includes('Tuition')); // Changed from PSLE to Tuition
      if (!uniStage) return null;
      
      // Recalculate uni end based on custom duration
      const durUni = toNum(settings.universityDuration, 4);
      const uniEndAge = (child.gender === 'male' ? 21 : 19) + durUni;
      
      const uniEndYear = currentYear + (uniEndAge - costs.currentAge);
      if (uniEndYear > latestUniEndYear) {
        latestUniEndYear = uniEndYear;
      }
      return {
        child,
        currentAge: costs.currentAge,
        psleStart: psleStage ? currentYear + psleStage.yearsUntilStart : null,
        psleEnd: psleStage ? currentYear + psleStage.yearsUntilStart + psleStage.duration - 1 : null,
        psleCost: psleStage ? psleStage.cost : 0,
        uniStart: currentYear + uniStage.yearsUntilStart,
        uniEnd: uniEndYear,
        uniCost: uniStage.cost,
      };
    }).filter(t => t !== null);

    const retirementAge = ageYears + (latestUniEndYear - currentYear);

    return {
      timeline, retirementYear: latestUniEndYear, retirementAge, currentYear
    };
  };

  const retirementTimeline = calculateRetirementTimeline();

  // Calculate milestones for timeline visualization
  const calculateAllMilestones = () => {
    if (!ageYears || safeChildren.length === 0) return [];
    const currentYear = new Date().getFullYear();
    
    // Milestones dynamic based on settings
    const eduStart = toNum(settings.educationStartAge, 7);
    const eduDuration = toNum(settings.educationDuration, 10);
    const eduEnd = eduStart + eduDuration;

    const allMilestones = safeChildren
      .filter(c => c.dobISO)
      .map((child) => {
        const childDob = parseDob(child.dobISO);
        if (!childDob) return null;
        
        const today = new Date();
        const ageInMonths = monthsSinceDob(childDob, today.getFullYear(), today.getMonth());
        const currentChildAge = Math.floor(ageInMonths / 12);
        
        const durUni = toNum(settings.universityDuration, 4);
        const uniStart = child.gender === 'male' ? 21 : 19;

        const milestones = [
          {
            name: 'Start Tuition',
            childAge: eduStart,
            icon: '🎒',
            color: '#06b6d4', // cyan-500
            description: 'Education Savings Start'
          },
          {
            name: 'End Tuition',
            childAge: eduEnd,
            icon: '🏁',
            color: '#8b5cf6', // violet-500
            description: 'Education Savings End'
          },
          ...(child.gender === 'male' ? [{
            name: 'NS/Army',
            childAge: 18,
            icon: '🎖️',
            color: '#059669', // emerald-600
            description: 'National Service (2 years)'
          }] : []),
          {
            name: 'University Start',
            childAge: uniStart,
            icon: '🎓',
            color: '#f59e0b', // amber-500
            description: child.gender === 'male' ? 'After NS completion' : 'Direct entry'
          },
          {
            name: 'University End',
            childAge: uniStart + durUni, // Dynamic duration
            icon: '🎉',
            color: '#10b981', // emerald-500
            description: 'Graduation'
          }
        ];
        
        return milestones
          .filter(m => currentChildAge < m.childAge) // Only future milestones
          .map(milestone => {
            const yearsFromNow = milestone.childAge - currentChildAge;
            const yearOfMilestone = currentYear + yearsFromNow;
            const parentAgeAtMilestone = ageYears + yearsFromNow;
            
            return {
              childName: child.name || 'Unnamed Child',
              childGender: child.gender,
              currentChildAge,
              milestone: milestone.name,
              childAgeAtMilestone: milestone.childAge,
              parentAgeAtMilestone: Math.round(parentAgeAtMilestone),
              yearOfMilestone,
              yearsFromNow,
              icon: milestone.icon,
              color: milestone.color,
              description: milestone.description
            };
          });
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .flat()
      .sort((a, b) => a.yearsFromNow - b.yearsFromNow);
    
    return allMilestones;
  };

  const allMilestones = calculateAllMilestones();

  return (
    <div className="p-5">
      {/* Welcome Header */}
      <div className="bg-gradient-to-br from-amber-100 to-amber-200 border border-amber-500 rounded-xl p-6 mb-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="text-4xl">👶</div>
          <div>
            <h3 className="m-0 text-amber-800 text-xl font-bold">Children & Education Planning</h3>
            <p className="m-1 text-amber-800 text-sm opacity-80">
              Factor in childcare, education costs with inflation up to university
            </p>
          </div>
        </div>
      </div>
      
      {/* SETTINGS CONFIGURATION */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 shadow-sm">
        <div 
          className="flex justify-between items-center cursor-pointer" 
          onClick={() => setShowSettings(!showSettings)}
        >
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <span>⚙️</span> Configuration & Assumptions
          </h3>
          <button className="text-gray-500 text-sm font-semibold">
            {showSettings ? 'Hide ▲' : 'Customize ▼'}
          </button>
        </div>
        
        {showSettings && (
          <div className="mt-5 pt-5 border-t border-gray-100 animate-fade-in">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <LabeledText 
                   label="Inflation Rate (%)" 
                   value={settings.inflationRate} 
                   onChange={(v) => updateSettings('inflationRate', v)} 
                   type="number"
                   placeholder="3"
                />
                <LabeledText 
                   label="Monthly Tuition & Enrichment ($)" 
                   value={settings.monthlyEducationCost} 
                   onChange={(v) => updateSettings('monthlyEducationCost', v)} 
                   type="number"
                   placeholder="800"
                />
                <LabeledText 
                   label="Tuition Start Age (e.g. 7)" 
                   value={settings.educationStartAge} 
                   onChange={(v) => updateSettings('educationStartAge', v)} 
                   type="number"
                   placeholder="7"
                />
                 <LabeledText 
                   label="Tuition Duration (Years)" 
                   value={settings.educationDuration} 
                   onChange={(v) => updateSettings('educationDuration', v)} 
                   type="number"
                   placeholder="10"
                />
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <LabeledText 
                   label="Annual Uni Fees + Living ($)" 
                   value={settings.universityCost} 
                   onChange={(v) => updateSettings('universityCost', v)} 
                   type="number"
                   placeholder="8750"
                />
                <LabeledText 
                   label="University Duration (Years)" 
                   value={settings.universityDuration} 
                   onChange={(v) => updateSettings('universityDuration', v)} 
                   type="number"
                   placeholder="4"
                />
             </div>
             
             <div className="p-4 bg-blue-50 rounded-lg text-xs text-blue-800 space-y-2">
                <p className="font-bold">ℹ️ How we derived these figures:</p>
                <p>
                  <strong>1. Inflation (3%):</strong> Based on long-term Singapore education inflation averages (typically higher than core inflation).
                </p>
                <p>
                  <strong>2. Monthly Tuition ({fmtSGD(toNum(settings.monthlyEducationCost))}):</strong> Monthly spend on tuition (Math, Science, English), enrichment, and school miscellaneous fees.
                </p>
                <p>
                   <strong>3. Duration:</strong> From Age {settings.educationStartAge} for {settings.educationDuration} years (ends at age {toNum(settings.educationStartAge)+toNum(settings.educationDuration)-1}).
                </p>
                <p>
                  <strong>4. University Cost ({fmtSGD(toNum(settings.universityCost))}):</strong> Based on local autonomous university tuition fees (e.g., NUS/NTU General Arts/Science ~8k/yr) plus basic living allowance.
                </p>
             </div>
          </div>
        )}
        
        {!showSettings && (
           <div className="mt-2 text-xs text-gray-500">
             Using <strong>{settings.inflationRate}% inflation</strong>, 
             <strong>{fmtSGD(toNum(settings.monthlyEducationCost))}/mth</strong> for school (Age {settings.educationStartAge}-{toNum(settings.educationStartAge)+toNum(settings.educationDuration)-1}), and 
             <strong>{fmtSGD(toNum(settings.universityCost))}/yr</strong> for Uni.
           </div>
        )}
      </div>
      
      {/* Add Child Button */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 shadow-sm">
        <button
          onClick={addChild}
          className="px-6 py-3 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-lg text-sm font-bold hover:opacity-90 shadow-md transition-all"
        >
          + Add Child
        </button>
      </div>

      {/* Visual Milestones Timeline */}
      {allMilestones.length > 0 && (
        <div className="bg-white border-2 border-blue-500 rounded-xl p-6 mb-5 shadow-md">
          <div className="mb-5">
            <h3 className="m-0 text-blue-800 text-xl font-bold mb-2">
              📊 Parent's Age at Children's Education Milestones
            </h3>
            <p className="m-0 text-blue-500 text-sm">
              Visual timeline showing your age when each child reaches key education stages
            </p>
          </div>

          {(() => {
            // Group by parent age for visualization
            const groupedByParentAge = allMilestones.reduce((acc: Record<number, typeof allMilestones>, m) => {
              const key = m.parentAgeAtMilestone;
              if (!acc[key]) acc[key] = [];
              acc[key].push(m);
              return acc;
            }, {});
            
            const parentAges = Object.keys(groupedByParentAge).map(Number).sort((a, b) => a - b);
            const maxParentAge = Math.max(...parentAges);
            
            // Find busiest year
            const ageWithMostMilestones = parentAges.reduce((max, age) => 
              groupedByParentAge[age].length > groupedByParentAge[max].length ? age : max
            , parentAges[0]);
            const peakCount = groupedByParentAge[ageWithMostMilestones].length;
            const peakAge = ageWithMostMilestones;
            
            return (
              <>
                {/* Timeline Visualization */}
                <div className="mb-6 overflow-x-auto">
                  <div className="min-w-[600px]">
                    {/* Timeline Header */}
                    <div className="flex mb-3 pb-2 border-b-2 border-gray-200">
                      <div className="w-[120px] text-sm font-bold text-gray-700">
                        Your Age
                      </div>
                      <div className="flex-1 text-sm font-bold text-gray-700">
                        Milestones
                      </div>
                    </div>
                    
                    {/* Timeline Rows */}
                    {parentAges.map(parentAge => {
                      const milestonesAtAge = groupedByParentAge[parentAge];
                      const year = milestonesAtAge[0].yearOfMilestone;
                      
                      return (
                        <div key={parentAge} className="flex mb-4 p-3 bg-gradient-to-r from-gray-50 to-white rounded-lg border border-gray-200">
                          {/* Parent Age Column */}
                          <div className="w-[120px]">
                            <div className="text-2xl font-bold text-blue-800 mb-1">
                              {parentAge}
                            </div>
                            <div className="text-[11px] text-gray-500">
                              Year {year}
                            </div>
                          </div>
                          
                          {/* Milestones Column */}
                          <div className="flex-1 flex flex-wrap gap-2">
                            {milestonesAtAge.map((m, idx) => (
                              <div key={idx} className="inline-flex items-center px-3 py-2 rounded-lg border-2 min-w-[200px]" style={{ borderColor: m.color, backgroundColor: `${m.color}15` }}>
                                <div className="text-xl mr-2">{m.icon}</div>
                                <div className="flex-1">
                                  <div className="text-xs font-bold mb-0.5" style={{ color: m.color }}>
                                    {m.childName} - {m.milestone}
                                  </div>
                                  <div className="text-[11px] text-gray-500">
                                    Child age: {m.childAgeAtMilestone} • {m.description}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Card 1: Next Milestone */}
                  <div className="p-4 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg border-2 border-blue-500">
                    <div className="text-xs font-bold text-blue-800 mb-2 uppercase">
                      ⏰ Next Milestone
                    </div>
                    <div className="text-base font-bold text-blue-800 mb-1">
                      {allMilestones[0].childName}'s {allMilestones[0].milestone}
                    </div>
                    <div className="text-sm text-blue-800">
                      In {allMilestones[0].yearsFromNow} {allMilestones[0].yearsFromNow === 1 ? 'year' : 'years'} ({allMilestones[0].yearOfMilestone})
                    </div>
                    <div className="text-xs text-blue-600 mt-2">
                      You'll be {allMilestones[0].parentAgeAtMilestone} years old
                    </div>
                  </div>
                  
                  {/* Card 2: Years Until Last Milestone */}
                  <div className="p-4 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-lg border-2 border-emerald-500">
                    <div className="text-xs font-bold text-emerald-800 mb-2 uppercase">
                      🎯 Planning Horizon
                    </div>
                    <div className="text-base font-bold text-emerald-800 mb-1">
                      {allMilestones[allMilestones.length - 1].yearsFromNow} years
                    </div>
                    <div className="text-sm text-emerald-800">
                      Until {allMilestones[allMilestones.length - 1].childName}'s graduation
                    </div>
                    <div className="text-xs text-emerald-600 mt-2">
                      You'll be {allMilestones[allMilestones.length - 1].parentAgeAtMilestone} years old
                    </div>
                  </div>
                  
                  {/* Card 3: Busiest Year */}
                  <div className="p-4 bg-gradient-to-br from-amber-100 to-amber-200 rounded-lg border-2 border-amber-500">
                    <div className="text-xs font-bold text-amber-900 mb-2 uppercase">
                      📅 Busiest Year
                    </div>
                    <div className="text-base font-bold text-amber-900 mb-1">
                      Age {peakAge}
                    </div>
                    <div className="text-sm text-amber-900">
                      {peakCount} milestone{peakCount > 1 ? 's' : ''} in one year
                    </div>
                    <div className="text-xs text-amber-700 mt-2">
                      Plan finances accordingly! 💰
                    </div>
                  </div>
                </div>
                
                {/* Key Insights */}
                <div className="mt-5 p-4 bg-gradient-to-br from-sky-50 to-sky-100 rounded-lg border border-blue-300">
                  <div className="text-sm font-bold text-blue-800 mb-2">
                    💡 Key Planning Insights:
                  </div>
                  <div className="text-xs text-blue-800 leading-relaxed space-y-1.5">
                    <div>
                      • <strong>Financial Independence Timeline:</strong> You'll be fully free from education expenses at age {maxParentAge}, so plan your wealth to last from that age onwards.
                    </div>
                    <div>
                      • <strong>Financial Peak:</strong> Your highest education expense periods are highlighted above - ensure adequate savings or income during those years.
                    </div>
                    <div>
                      • <strong>Current Focus:</strong> Your next milestone is in {allMilestones[0].yearsFromNow} {allMilestones[0].yearsFromNow === 1 ? 'year' : 'years'}. Start preparing financially now!
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* List/Editor for Children */}
      {safeChildren.map((child, idx) => {
        const costs = calculateChildCosts(child);
        return (
          <div key={child.id} className="bg-yellow-50 border border-yellow-400 rounded-xl p-6 mb-5">
            <div className="flex justify-between items-center mb-4">
              <h4 className="m-0 text-yellow-900 font-bold">👦 Child {idx + 1}</h4>
              <button
                onClick={() => removeChild(child.id)}
                className="px-3 py-1.5 bg-red-500 text-white rounded-md text-xs hover:bg-red-600 transition-colors"
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <LabeledText
                label="Child's Name"
                value={child.name}
                onChange={(v) => updateChild(child.id, 'name', v)}
                placeholder='e.g., Emma'
              />
              <LabeledText
                label='Date of Birth'
                value={child.dobISO}
                onChange={(v) => updateChild(child.id, 'dobISO', v)}
                type='date'
              />
              <LabeledSelect
                label='Gender'
                value={child.gender}
                onChange={(v) => updateChild(child.id, 'gender', v)}
                options={[
                  { label: 'Male', value: 'male' },
                  { label: 'Female', value: 'female' }
                ]}
              />
            </div>
            {costs && (
              <div className="bg-white p-4 rounded-lg border-2 border-yellow-400">
                <div className="mb-3">
                  <div className="text-sm font-bold text-yellow-800 mb-1">
                    Current Age: {costs.currentAge} years
                  </div>
                  <div className="text-2xl font-bold text-yellow-600">
                    Total Education Cost: {fmtSGD(costs.totalCost)}
                  </div>
                  <div className="text-[11px] text-yellow-800 mt-1 italic">
                    (Inflation-adjusted at {settings.inflationRate}% annual)
                  </div>
                </div>
                <div className="text-xs font-bold text-yellow-800 mb-2">📚 Education Stages Breakdown:</div>
                {costs.breakdown.map((stage: any, i: number) => (
                  <div key={i} className={`p-3 rounded-md mb-2 border ${stage.stage.includes('Tuition') ? 'bg-blue-50 border-blue-200' : 'bg-amber-100 border-amber-200'}`}>
                    <div className="flex justify-between items-center mb-1.5">
                      <div>
                        <div className={`text-xs font-bold mb-0.5 ${stage.stage.includes('Tuition') ? 'text-blue-800' : 'text-amber-800'}`}>
                          {stage.stage}
                        </div>
                        <div className={`text-[10px] ${stage.stage.includes('Tuition') ? 'text-blue-800' : 'text-amber-800'} opacity-80`}>{stage.description}</div>
                      </div>
                      <div className={`text-base font-bold ml-3 ${stage.stage.includes('Tuition') ? 'text-blue-800' : 'text-amber-800'}`}>
                        {fmtSGD(stage.cost)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Grand Total */}
      {allChildrenCosts.length > 0 && (
        <div className="bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-500 rounded-xl p-6 mb-5">
          <div className="text-center">
            <div className="text-sm text-red-900 mb-2 font-bold uppercase">💰 Total Children Education Costs</div>
            <div className="text-4xl font-bold text-red-900 mb-1">{fmtSGD(grandTotal)}</div>
            <div className="text-xs text-red-900 opacity-90">
              For {safeChildren.length} {safeChildren.length === 1 ? 'child' : 'children'} • Inflation-adjusted to completion
            </div>
          </div>
        </div>
      )}

      {/* Retirement Timeline */}
      {retirementTimeline && (
        <div className="bg-gradient-to-br from-sky-100 to-sky-200 border-2 border-sky-500 rounded-xl p-6 mb-5">
          <h3 className="mt-0 text-sky-900 text-lg font-bold mb-4">
            📅 Family Education Timeline
          </h3>
          <div className="text-sm text-sky-900 mb-4">
            Based on your children's ages, here's when education costs will hit and when you can realistically achieve financial independence:
          </div>
          {retirementTimeline.timeline.map((t: any, idx: number) => (
            <div key={idx} className="bg-white/70 p-3.5 rounded-lg mb-3">
              <div className="text-sm font-bold text-sky-900 mb-2">
                {t.child.name || `Child ${idx + 1}`} (Currently {t.currentAge} years old)
              </div>
              <div className="text-xs text-sky-900 leading-relaxed">
                {t.psleStart && (
                  <div>📚 Tuition/School: {t.psleStart}-{t.psleEnd} ({fmtSGD(t.psleCost)})</div>
                )}
                <div>🎓 University: {t.uniStart}-{t.uniEnd} ({fmtSGD(t.uniCost)})</div>
              </div>
            </div>
          ))}
          <div className="mt-4 p-4 bg-white rounded-lg border-2 border-sky-500">
            <div className="text-sm font-bold text-sky-900 mb-2">
              🗓️ Your Realistic Financial Independence Year: {retirementTimeline.retirementYear}
            </div>
            <div className="text-xs text-sky-900 leading-relaxed">
              You'll be <strong>{Math.round(retirementTimeline.retirementAge)} years old</strong> when your youngest child completes university. 
              Consider planning your wealth to sustain from this age onwards for a comfortable transition.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChildrenTab;
