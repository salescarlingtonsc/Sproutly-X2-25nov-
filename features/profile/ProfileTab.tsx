import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { toNum, fmtSGD } from '../../lib/helpers';
import { computeCpf, reverseComputeCpf } from '../../lib/calculators';
import { generateClientAudioBriefing, playRawAudio } from '../../lib/gemini';
import { useAi } from '../../contexts/AiContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import PageHeader from '../../components/layout/PageHeader';
import SectionCard from '../../components/layout/SectionCard';
import { Client } from '../../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

// --- HELPER COMPONENT FOR INPUTS ---
const RateInput = ({ value, onChange, className }: { value: number, onChange: (n: number) => void, className?: string }) => {
  const [display, setDisplay] = useState(value.toString());

  useEffect(() => {
    const parsed = parseFloat(display);
    if (display === '' && value === 0) return;
    if (!isNaN(parsed) && parsed === value) return;
    setDisplay(value.toString());
  }, [value]);

  return (
    <input 
      type="number" 
      value={display}
      onChange={(e) => {
        setDisplay(e.target.value);
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) onChange(val);
        else onChange(0);
      }}
      className={className}
    />
  );
};

interface ProfileTabProps {
  clients?: Client[];
  onLoadClient?: (client: Client) => void;
  onNewProfile?: () => void;
}

const ProfileTab: React.FC<ProfileTabProps> = ({ 
  clients = [],
  onLoadClient,
  onNewProfile
}) => {
  const { user } = useAuth();
  const { 
    profile, setProfile, 
    age, cpfData, cashflowData,
    expenses, setExpenses,
    customExpenses, setCustomExpenses,
    investorState, cashflowState,
    ownerId, setOwnerId, // Exposed for admin assignment
    clientRef // Reference code from context
  } = useClient();
  
  const { openAiWithPrompt } = useAi();

  // --- CLIENT SEARCH STATE ---
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  
  // Audio State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);

  // Chart State
  const [showCostOfWaiting, setShowCostOfWaiting] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<'conservative' | 'moderate' | 'growth'>('moderate');
  
  // Dynamic Simulation State
  const [delayYears, setDelayYears] = useState(5);
  const [simulationReturn, setSimulationReturn] = useState(6.0);

  // Admin Assignment
  const [adminAdvisors, setAdminAdvisors] = useState<{id: string, email: string}[]>([]);
  const isAdmin = user?.role === 'admin' || user?.is_admin === true;

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [searchRef]);

  // Fetch Advisors if Admin
  useEffect(() => {
    if (isAdmin && supabase) {
        supabase.from('profiles').select('id, email').order('email').then(({ data }) => {
            if (data) setAdminAdvisors(data);
        });
    }
  }, [isAdmin]);

  const filteredClients = useMemo(() => {
    if (!searchTerm) return [];
    const lower = searchTerm.toLowerCase();
    return clients.filter(c => 
      c.profile.name.toLowerCase().includes(lower) ||
      (c.referenceCode && c.referenceCode.toLowerCase().includes(lower)) ||
      (c.profile.phone && c.profile.phone.includes(lower))
    ).slice(0, 5);
  }, [clients, searchTerm]);

  // --- AUDIO BRIEFING ---
  const handlePlayBriefing = async () => {
    if (loadingAudio || isPlayingAudio) return;
    if (!profile.name) {
       alert("Enter client name first.");
       return;
    }
    
    setLoadingAudio(true);
    try {
       const summaryData = {
          profile,
          cashflow: cashflowData,
          netWorth: (investorState ? toNum(investorState.portfolioValue) : 0) + (cashflowState ? toNum(cashflowState.currentSavings) : 0)
       };
       const base64Audio = await generateClientAudioBriefing(summaryData);
       setIsPlayingAudio(true);
       await playRawAudio(base64Audio);
       // Simple timeout
       setTimeout(() => setIsPlayingAudio(false), 20000); 
    } catch (e: any) {
       alert("Audio Gen Failed: " + e.message);
       setIsPlayingAudio(false);
    } finally {
       setLoadingAudio(false);
    }
  };

  // --- PERSISTENT INVESTMENT SETTINGS ---
  const rate1 = profile.investmentRates?.conservative ?? 3.0; 
  const rate2 = profile.investmentRates?.moderate ?? 6.0;
  const rate3 = profile.investmentRates?.growth ?? 9.0;

  const setRate1 = (v: number) => setProfile({...profile, investmentRates: {...(profile.investmentRates || { conservative: 3, moderate: 6, growth: 9 }), conservative: v}});
  const setRate2 = (v: number) => setProfile({...profile, investmentRates: {...(profile.investmentRates || { conservative: 3, moderate: 6, growth: 9 }), moderate: v}});
  const setRate3 = (v: number) => setProfile({...profile, investmentRates: {...(profile.investmentRates || { conservative: 3, moderate: 6, growth: 9 }), growth: v}});

  // Sync simulation return when strategy changes
  useEffect(() => {
      const rates = { conservative: rate1, moderate: rate2, growth: rate3 };
      setSimulationReturn(rates[selectedStrategy]);
  }, [selectedStrategy, rate1, rate2, rate3]);

  // --- CALCULATIONS ---

  const totalMonthlyExpenses = useMemo(() => {
    let sum = 0;
    for (const key in expenses) {
      sum += toNum(expenses[key], 0);
    }
    if (customExpenses) {
      customExpenses.forEach(exp => {
        sum += toNum(exp.amount, 0);
      });
    }
    return sum;
  }, [expenses, customExpenses]);
  
  const monthlyRetirementExpenses = profile.customRetirementExpense && toNum(profile.customRetirementExpense, 0) > 0
    ? toNum(profile.customRetirementExpense, 0)
    : (totalMonthlyExpenses > 0 
      ? totalMonthlyExpenses 
      : (cpfData ? cpfData.takeHome * 0.7 : 0));
  
  const retirementAge = toNum(profile.retirementAge, 65);
  const yearsToRetirement = Math.max(0, retirementAge - age);
  const lifeExpectancy = profile.gender === 'female' ? 86 : 82;
  const inflationRate = 0.03;
  
  const futureMonthlyRetirementExpenses = monthlyRetirementExpenses * Math.pow(1 + inflationRate, yearsToRetirement);
  const retirementYears = Math.max(10, lifeExpectancy - retirementAge);
  const retirementNestEgg = futureMonthlyRetirementExpenses * 12 * retirementYears;
  
  // Human Capital Calculation
  const grossAnnual = toNum(profile.grossSalary || profile.monthlyIncome) * 12;
  const humanCapital = grossAnnual * yearsToRetirement;

  // Required monthly investment
  const calcRate = rate2 / 100 / 12;
  const nPer = yearsToRetirement * 12;
  const requiredMonthlyInvestment = (nPer > 0 && calcRate > 0)
    ? retirementNestEgg * calcRate / (Math.pow(1 + calcRate, nPer) - 1)
    : 0;

  const currentMonthlySavings = cashflowData ? cashflowData.monthlySavings : 0;
  const shortfall = Math.max(0, requiredMonthlyInvestment - currentMonthlySavings);
  const hasSurplus = currentMonthlySavings >= requiredMonthlyInvestment;

  // --- COMPOUNDING PROJECTION (IMPROVED) ---
  const compoundingData = useMemo(() => {
    const monthly = toNum(profile.monthlyInvestmentAmount);
    const currentPortfolio = investorState ? toNum(investorState.portfolioValue) : 0;
    const currentCash = cashflowState ? toNum(cashflowState.currentSavings) : 0;
    const startingPrincipal = currentPortfolio + currentCash;

    if (monthly <= 0 && startingPrincipal <= 0) return null;

    // Use dynamic simulation return
    const r = simulationReturn / 100;
    const monthlyRate = r / 12;
    
    // --- SCENARIO 2: WAIT X YEARS ---
    // Rules: 
    // 1. Existing Principal sits in Bank (0.5%) for delayYears.
    // 2. Monthly Contributions are ZERO for delayYears (delaying the start).
    // 3. At Year X, Principal moves to Market + Monthly Contributions begin.
    const delayDuration = delayYears;
    const bankRate = 0.005 / 12; // 0.5% p.a.

    const maxAge = retirementAge;
    const duration = maxAge - age;
    const chartData = [];
    
    let finalNow = 0;
    let finalLater = 0;

    for (let y = 0; y <= duration + 5; y++) {
        const currentSimAge = age + y;
        
        // --- CALC NOW ---
        const months = y * 12;
        const growthFactor = Math.pow(1 + monthlyRate, months);
        const pmtFactor = monthlyRate > 0 ? (growthFactor - 1) / monthlyRate : months;
        const valNow = (startingPrincipal * growthFactor) + (monthly * pmtFactor);

        // --- CALC LATER ---
        let valLater = 0;
        if (y < delayDuration) {
            // Delay Phase: Principal sits in bank. NO monthly contributions.
            const bankGrowth = Math.pow(1 + bankRate, months);
            valLater = startingPrincipal * bankGrowth;
        } else {
            // Catch Up Phase:
            // 1. Principal has grown in bank for Delay Period
            const monthsDelay = delayDuration * 12;
            const bankGrowthDelayed = Math.pow(1 + bankRate, monthsDelay);
            const principalAtStart = startingPrincipal * bankGrowthDelayed;

            // 2. Grow that new principal for (y - delay) years at Investment Rate
            // 3. START monthly contributions now
            const activeMonths = (y - delayDuration) * 12;
            const growthFactorActive = Math.pow(1 + monthlyRate, activeMonths);
            const pmtFactorActive = (growthFactorActive - 1) / monthlyRate;
            
            valLater = (principalAtStart * growthFactorActive) + (monthly * pmtFactorActive);
        }

        if (currentSimAge === maxAge) {
            finalNow = valNow;
            finalLater = valLater;
        }

        chartData.push({
            age: currentSimAge,
            label: `Age ${currentSimAge}`,
            now: Math.round(valNow),
            later: Math.round(valLater),
            gap: Math.round(valNow - valLater)
        });
    }
    
    return { chartData, finalNow, finalLater, opportunityCost: finalNow - finalLater };
  }, [profile.monthlyInvestmentAmount, simulationReturn, delayYears, age, retirementAge, investorState?.portfolioValue, cashflowState?.currentSavings]);

  const LIFESTYLES = [
    { label: 'Basic', value: '2500', icon: '⛺', desc: 'Simple needs' },
    { label: 'Comfort', value: '4500', icon: '🏡', desc: 'Occasional treats' },
    { label: 'Affluent', value: '8000', icon: '🥂', desc: 'Travel & Dining' },
    { label: 'Legacy', value: '15000', icon: '🏛️', desc: 'Generational wealth' },
  ];

  // ACTION BUTTONS
  const headerActions = (
    <div className="flex items-center gap-3">
        <div className="relative" ref={searchRef}>
             <input 
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Find client..."
                className="w-48 pl-3 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
             />
             {showDropdown && searchTerm && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden z-50">
                   {filteredClients.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { if (onLoadClient) onLoadClient(c); setSearchTerm(''); setShowDropdown(false); }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-50 text-xs flex justify-between"
                      >
                        <span className="font-bold">{c.profile.name}</span>
                        <span className="text-gray-400">{c.referenceCode}</span>
                      </button>
                   ))}
                </div>
             )}
        </div>
        
        <button
            onClick={() => openAiWithPrompt("Audit this client profile for missing information and suggest 3 high-impact questions to ask them.")}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
        >
            <span>🧠</span> AI Audit
        </button>

        <button
            onClick={handlePlayBriefing}
            disabled={loadingAudio}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-50 transition-colors"
        >
            {loadingAudio ? 'Loading...' : isPlayingAudio ? '🔊 Playing...' : '🎙️ Briefing'}
        </button>

        <button
            onClick={() => { if (onNewProfile && confirm("Create new profile? Unsaved data will be lost.")) { onNewProfile(); setSearchTerm(''); } }}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors shadow-sm"
        >
            ＋ New
        </button>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 font-sans">
      
      <PageHeader 
        title="Client Profile" 
        icon="👤" 
        subtitle={
            <span className="flex items-center gap-2">
                Manage personal details and financial identity.
                {clientRef && (
                    <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[10px] font-mono border border-slate-200">
                        {clientRef}
                    </span>
                )}
            </span>
        }
        action={headerActions}
      />

      {/* --- ADMIN: ASSIGNMENT PANEL --- */}
      {isAdmin && (
         <div className="bg-indigo-900 rounded-xl p-4 mb-6 flex justify-between items-center text-white shadow-lg">
            <div className="flex items-center gap-3">
               <span className="text-2xl">👑</span>
               <div>
                  <h3 className="font-bold text-sm">Portfolio Custodian</h3>
                  <p className="text-[10px] text-indigo-300">Assign this client to an advisor</p>
               </div>
            </div>
            <div className="relative group">
                <select 
                    value={ownerId || ''} 
                    onChange={(e) => setOwnerId(e.target.value)}
                    className="appearance-none bg-indigo-800 border border-indigo-700 hover:bg-indigo-700 rounded-lg px-4 py-2 pr-8 text-xs font-bold text-white outline-none cursor-pointer transition-all min-w-[200px]"
                >
                    <option value={user?.id || ''}>Me (Admin)</option>
                    {adminAdvisors.filter(a => a.id !== user?.id).map(adv => (
                        <option key={adv.id} value={adv.id}>{adv.email}</option>
                    ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-300 text-[10px]">▼</div>
            </div>
         </div>
      )}

      {/* --- 2. HUMAN CAPITAL HERO --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* Left: The "Asset" Card with Holographic Effect */}
         <div className="lg:col-span-1 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl flex flex-col justify-between group h-full min-h-[280px]">
            {/* Holographic Shine */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
            
            <div className="relative z-10">
               <div className="flex justify-between items-start mb-6">
                   <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[10px] font-bold uppercase tracking-widest text-indigo-200 backdrop-blur-md">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Active Income Engine
                   </div>
                   {/* Age Indicator */}
                   <div className="text-right opacity-80">
                      <div className="text-3xl font-black text-white leading-none tracking-tighter">{age}</div>
                      <div className="text-[9px] font-bold text-indigo-300 uppercase tracking-widest">Current Age</div>
                   </div>
               </div>
               
               <div className="space-y-1">
                  <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Your #1 Asset</h2>
                  {/* FIX: Removed text-transparent bg-clip-text to ensure white text visibility on all browsers */}
                  <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight drop-shadow-sm">
                     {humanCapital > 0 ? fmtSGD(humanCapital).split('.')[0] : '$0'}
                  </h1>
               </div>
            </div>

            <div className="relative z-10 mt-8 pt-6 border-t border-white/10">
               <p className="text-xs text-slate-400 leading-relaxed">
                  This is the <strong className="text-white">economic value</strong> of your future work ({yearsToRetirement} years until age {retirementAge}). It is your most valuable asset—and the most fragile.
               </p>
            </div>
         </div>

         {/* Right: The Identity Form (Apple-esque) */}
         <SectionCard className="lg:col-span-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
               <div className="space-y-4">
                  <div className="group">
                     <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 group-focus-within:text-indigo-600 transition-colors">Full Name</label>
                     <input 
                        type="text" 
                        value={profile.name} 
                        onChange={(e) => setProfile({...profile, name: e.target.value})}
                        className="w-full pb-2 border-b-2 border-gray-100 bg-transparent text-lg font-semibold text-gray-900 focus:border-indigo-600 focus:outline-none transition-colors placeholder-gray-200"
                        placeholder="Enter Client Name"
                     />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                     <div className="group">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Date of Birth</label>
                        <input 
                           type="date" 
                           value={profile.dob} 
                           onChange={(e) => setProfile({...profile, dob: e.target.value})}
                           className="w-full pb-2 border-b-2 border-gray-100 bg-transparent text-sm font-medium text-gray-900 focus:border-indigo-600 focus:outline-none"
                        />
                     </div>
                     <div className="group">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Gender</label>
                        <select 
                           value={profile.gender}
                           onChange={(e) => setProfile({...profile, gender: e.target.value as any})}
                           className="w-full py-2 border-b-2 border-gray-100 bg-transparent text-sm font-medium text-gray-900 focus:border-indigo-600 focus:outline-none"
                        >
                           <option value="male">Male</option>
                           <option value="female">Female</option>
                        </select>
                     </div>
                  </div>

                  <div className="group">
                     <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 group-focus-within:text-indigo-600 transition-colors">Retirement Age</label>
                     <input 
                        type="number" 
                        value={profile.retirementAge || '65'} 
                        onChange={(e) => setProfile({...profile, retirementAge: e.target.value})}
                        className="w-full pb-2 border-b-2 border-gray-100 bg-transparent text-sm font-bold text-indigo-700 focus:border-indigo-600 focus:outline-none transition-colors"
                        placeholder="65"
                        min="20"
                        max="90"
                     />
                  </div>
               </div>

               <div className="space-y-4">
                  <div className="group relative">
                     <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 group-focus-within:text-emerald-600 transition-colors">Monthly Gross Income</label>
                     <div className="flex items-baseline">
                        <span className="text-gray-400 mr-1 text-lg font-medium">$</span>
                        <input 
                           type="text" 
                           value={profile.grossSalary}
                           onChange={(e) => {
                              const val = e.target.value;
                              const gross = toNum(val);
                              const cpfCalc = computeCpf(gross, age);
                              setProfile({...profile, grossSalary: val, monthlyIncome: val, takeHome: cpfCalc.takeHome.toFixed(2)});
                           }}
                           className="w-full pb-2 border-b-2 border-gray-100 bg-transparent text-3xl font-extrabold text-emerald-700 focus:border-emerald-600 focus:outline-none transition-colors placeholder-gray-200"
                           placeholder="0"
                        />
                     </div>
                  </div>

                  <div className="group">
                     <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 group-focus-within:text-indigo-600 transition-colors">Monthly Take-Home</label>
                     <div className="flex items-baseline">
                        <span className="text-gray-400 mr-1">$</span>
                        <input 
                           type="text" 
                           value={profile.takeHome}
                           onChange={(e) => {
                              const val = e.target.value;
                              const grossEstimate = reverseComputeCpf(val, age);
                              setProfile({
                                 ...profile, 
                                 takeHome: val, 
                                 grossSalary: grossEstimate.toFixed(2), 
                                 monthlyIncome: grossEstimate.toFixed(2)
                              });
                           }}
                           className="w-full pb-2 border-b-2 border-gray-100 bg-transparent text-lg font-bold text-indigo-600 focus:border-indigo-600 focus:outline-none transition-colors"
                           placeholder="Calculated"
                        />
                     </div>
                  </div>
               </div>
            </div>
         </SectionCard>
      </div>

      {/* --- 4. EXPENSE & LIFESTYLE --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         
         {/* Current Lifestyle */}
         <SectionCard title="Current Burn Rate" action={<span className="text-red-500 font-bold">{fmtSGD(totalMonthlyExpenses)}/mo</span>}>
            <div className="grid grid-cols-2 gap-3 mb-4">
               {Object.keys(expenses).map((key) => (
                  <div key={key} className="relative group">
                     <label className="absolute top-2 left-3 text-[9px] font-bold text-gray-400 uppercase">{key}</label>
                     <input 
                        type="text"
                        value={expenses[key]}
                        onChange={(e) => setExpenses({ ...expenses, [key]: e.target.value })}
                        className="w-full pt-6 pb-2 px-3 bg-gray-50 rounded-lg text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-100 transition-all text-right"
                     />
                  </div>
               ))}
            </div>
            
            {/* Custom Expense Adder */}
            <div className="space-y-2">
               {customExpenses.map(exp => (
                  <div key={exp.id} className="flex gap-2">
                     <input type="text" value={exp.name} onChange={(e) => setCustomExpenses(customExpenses.map(x => x.id === exp.id ? {...x, name: e.target.value} : x))} className="flex-1 bg-gray-50 rounded-lg px-3 py-2 text-xs font-bold" />
                     <input type="text" value={exp.amount} onChange={(e) => setCustomExpenses(customExpenses.map(x => x.id === exp.id ? {...x, amount: e.target.value} : x))} className="w-24 bg-gray-50 rounded-lg px-3 py-2 text-xs font-bold text-right" />
                     <button onClick={() => setCustomExpenses(customExpenses.filter(x => x.id !== exp.id))} className="text-red-400 hover:text-red-600 px-1">×</button>
                  </div>
               ))}
               <button onClick={() => setCustomExpenses([...customExpenses, {id: Date.now(), name: 'New Expense', amount: '0'}])} className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-xs font-bold text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition-colors">
                  + Add Custom Expense
               </button>
            </div>
         </SectionCard>

         {/* Future Lifestyle Design */}
         <SectionCard title="Design Future Lifestyle" className="flex flex-col">
            <div className="flex-1 space-y-4">
               <div className="grid grid-cols-2 gap-2">
                  {LIFESTYLES.map((style) => (
                     <button 
                        key={style.label}
                        onClick={() => setProfile({...profile, customRetirementExpense: style.value})}
                        className={`p-3 rounded-xl border text-left transition-all ${toNum(profile.customRetirementExpense) === toNum(style.value) ? 'border-amber-50 bg-amber-50 ring-1 ring-amber-500' : 'border-gray-100 hover:border-amber-200'}`}
                     >
                        <div className="text-xl mb-1">{style.icon}</div>
                        <div className="font-bold text-xs text-gray-800">{style.label}</div>
                        <div className="text-[10px] text-gray-500">{style.desc}</div>
                     </button>
                  ))}
               </div>

               <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 mt-auto">
                  <label className="text-[10px] font-bold text-amber-800 uppercase tracking-widest">Target Monthly Income (Today's Value)</label>
                  <input 
                     type="text" 
                     value={profile.customRetirementExpense || ''} 
                     onChange={(e) => setProfile({...profile, customRetirementExpense: e.target.value})}
                     className="w-full bg-transparent text-2xl font-bold text-amber-900 outline-none border-b border-amber-200 focus:border-amber-500 mt-1"
                     placeholder={fmtSGD(monthlyRetirementExpenses)}
                  />
                  <div className="text-[10px] text-amber-700 mt-2 flex justify-between">
                     <span>Inflation Adjusted ({inflationRate*100}%)</span>
                     <span className="font-bold">{fmtSGD(futureMonthlyRetirementExpenses)}/mo</span>
                  </div>
               </div>
            </div>
         </SectionCard>
      </div>

      {/* --- 5. WEALTH ACCELERATION (UPDATED NARRATIVE) --- */}
      {age > 0 && (
         <div className="bg-gradient-to-br from-slate-900 via-[#0B1120] to-indigo-950 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none"></div>
            
            {/* Header: Investment Narrative */}
            <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start gap-8 mb-8">
               <div className="space-y-4 max-w-lg">
                  <div>
                     <div className="inline-flex items-center gap-2 mb-2">
                        <h3 className="text-xl font-bold text-white">Wealth Acceleration</h3>
                        {showCostOfWaiting && (
                           <span className="text-[10px] font-bold uppercase tracking-widest bg-red-500/20 text-red-400 px-2 py-0.5 rounded border border-red-500/30 animate-pulse">Gap Analysis Active</span>
                        )}
                     </div>
                     <p className="text-sm text-slate-400 leading-relaxed">
                        Compound interest is not intuitive. Visualizing the difference between starting now versus waiting reveals the true cost of delay.
                     </p>
                  </div>

                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-md space-y-4">
                     {/* Monthly Input */}
                     <div>
                        <label className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Monthly Commitment</label>
                        <div className="flex items-center mt-1">
                           <span className="text-xl text-gray-400 mr-1">$</span>
                           <input 
                              type="text" 
                              value={profile.monthlyInvestmentAmount || ''} 
                              onChange={(e) => setProfile({...profile, monthlyInvestmentAmount: e.target.value})}
                              className="w-full bg-transparent text-2xl font-bold text-white outline-none placeholder-gray-600"
                              placeholder={fmtSGD(currentMonthlySavings)}
                           />
                        </div>
                     </div>

                     <div className="h-px bg-white/10 w-full"></div>

                     {/* Strategy Controls - Presets + Custom Slider */}
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <label className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-1 block">Target Return</label>
                           <div className="flex items-center gap-2 mb-2">
                              <span className="text-xl font-bold text-white">{simulationReturn.toFixed(1)}%</span>
                              <div className="flex gap-1">
                                 {['conservative', 'moderate', 'growth'].map(s => (
                                    <button
                                       key={s}
                                       onClick={() => setSelectedStrategy(s as any)}
                                       className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold uppercase transition-all ${selectedStrategy === s ? 'bg-indigo-50 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'}`}
                                       title={s}
                                    >
                                       {s[0].toUpperCase()}
                                    </button>
                                 ))}
                              </div>
                           </div>
                           <input 
                              type="range" min="1" max="15" step="0.5" 
                              value={simulationReturn} 
                              onChange={(e) => setSimulationReturn(Number(e.target.value))}
                              className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                           />
                        </div>

                        <div>
                           <label className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-1 block">Delay Impact</label>
                           <div className="flex items-center gap-2 mb-2">
                              <span className={`text-xl font-bold ${showCostOfWaiting ? 'text-red-400' : 'text-slate-500'}`}>
                                 {showCostOfWaiting ? `${delayYears} Yrs` : 'None'}
                              </span>
                              <button 
                                 onClick={() => setShowCostOfWaiting(!showCostOfWaiting)}
                                 className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all ${showCostOfWaiting ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                              >
                                 {showCostOfWaiting ? 'Active' : 'Enable'}
                              </button>
                           </div>
                           {showCostOfWaiting && (
                              <input 
                                 type="range" min="1" max="20" step="1" 
                                 value={delayYears} 
                                 onChange={(e) => setDelayYears(Number(e.target.value))}
                                 className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                              />
                           )}
                        </div>
                     </div>
                  </div>
               </div>

               {/* Impact Card - Only shows when waiting toggled */}
               <div className={`transition-all duration-500 ${showCostOfWaiting ? 'opacity-100 translate-y-0' : 'opacity-50 translate-y-2 grayscale'}`}>
                  <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-2xl backdrop-blur-sm text-center min-w-[240px]">
                     <div className="text-[10px] font-bold text-red-300 uppercase tracking-widest mb-1">Projected Loss ({delayYears} Yrs)</div>
                     <div className="text-3xl font-black text-red-400 tracking-tighter">
                        {compoundingData ? fmtSGD(compoundingData.opportunityCost) : '$0'}
                     </div>
                     <div className="text-[10px] text-red-300/70 mt-2 font-medium">
                        Cost of Inaction
                     </div>
                  </div>
               </div>
            </div>

            <div className="relative z-10">
               {compoundingData ? (
                  <div className="h-full flex flex-col">
                     <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                           <AreaChart data={compoundingData.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                              <defs>
                                 <linearGradient id="colorNow" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                 </linearGradient>
                                 <linearGradient id="colorLater" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.8}/>
                                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                                 </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                              <XAxis dataKey="age" tick={{fill: '#475569', fontSize: 10}} axisLine={false} tickLine={false} tickFormatter={(v) => `Age ${v}`} />
                              <YAxis tick={{fill: '#475569', fontSize: 10}} axisLine={false} tickLine={false} tickFormatter={(val) => val >= 1000000 ? `$${(val/1000000).toFixed(1)}m` : `$${(val/1000).toFixed(0)}k`} />
                              <Tooltip 
                                 contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff' }} 
                                 itemStyle={{ fontSize: 12 }}
                                 formatter={(val: number) => fmtSGD(val)}
                                 labelFormatter={(l) => `Age ${l}`}
                              />
                              
                              <Area 
                                 type="monotone" 
                                 dataKey="now" 
                                 stroke="#10b981" 
                                 strokeWidth={3}
                                 fill="url(#colorNow)" 
                                 name="Start Today" 
                                 animationDuration={1500}
                              />
                              
                              {showCostOfWaiting && (
                                 <Area 
                                    type="monotone" 
                                    dataKey="later" 
                                    stroke="#94a3b8" 
                                    strokeWidth={2} 
                                    strokeDasharray="5 5"
                                    fill="url(#colorLater)" 
                                    name={`Wait ${delayYears} Years`} 
                                    animationDuration={1500}
                                 />
                              )}
                           </AreaChart>
                        </ResponsiveContainer>
                     </div>
                     
                     <div className="grid grid-cols-3 gap-4 mt-6 bg-slate-800/50 p-4 rounded-xl border border-white/5">
                        <div className="text-center">
                           <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Target Return</div>
                           <div className="text-xl font-bold text-indigo-400">
                              {simulationReturn.toFixed(1)}%
                           </div>
                        </div>
                        <div className="text-center">
                           <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Projected Wealth</div>
                           <div className="text-xl font-bold text-white">{fmtSGD(compoundingData.finalNow)}</div>
                        </div>
                        <div className="text-center relative">
                           <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Wait {delayYears} Years</div>
                           <div className={`text-xl font-bold ${showCostOfWaiting ? 'text-red-400 line-through' : 'text-gray-500'}`}>
                              {fmtSGD(compoundingData.finalLater)}
                           </div>
                           {!showCostOfWaiting && <div className="absolute inset-0 flex items-center justify-center bg-slate-800/90 text-[10px] text-white font-bold rounded cursor-pointer" onClick={() => setShowCostOfWaiting(true)}>Tap to Reveal</div>}
                        </div>
                     </div>
                     
                     {/* DISCLAIMER TEXT */}
                     <p className="mt-4 text-[9px] text-indigo-400/60 text-center font-medium leading-relaxed italic">
                        Illustration purpose only to demonstrate compounding interest. Actual investment returns fluctuate and capital is not protected.
                     </p>
                  </div>
               ) : (
                  <div className="h-full flex items-center justify-center text-slate-600 italic">
                     Enter a monthly investment amount to see projections.
                  </div>
               )}
            </div>
         </div>
      )}

    </div>
  );
};

export default ProfileTab;