
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
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from 'recharts';

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
    ownerId, setOwnerId,
    clientRef,
    retirement, setRetirement
  } = useClient();
  
  const { openAiWithPrompt } = useAi();

  // --- CLIENT SEARCH STATE ---
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  
  // Audio State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);

  // Chart Presentation State
  const [chartLockedIndex, setChartLockedIndex] = useState<number | null>(null);
  const [currHoverIdx, setCurrHoverIdx] = useState<number | null>(null);
  const [lockedTooltipPos, setLockedTooltipPos] = useState<{x: number, y: number} | null>(null);
  
  // Dynamic Simulation State - Synced with Global Retirement Settings
  const [simulationReturn, setSimulationReturn] = useState(toNum(retirement.customReturnRate) || 8.0);
  const [simulationConservativeReturn, setSimulationConservativeReturn] = useState(4.0);
  const [simulationBankReturn, setSimulationBankReturn] = useState(0.05);

  // Update Global Return Rate when slider moves
  const updateSimulationReturn = (val: number) => {
      setSimulationReturn(val);
      setRetirement({ ...retirement, customReturnRate: val.toString() });
  };

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
    // INCREASED LIMIT TO 50
    return clients.filter(c => 
      c.profile.name.toLowerCase().includes(lower) ||
      (c.referenceCode && c.referenceCode.toLowerCase().includes(lower)) ||
      (c.profile.phone && c.profile.phone.includes(lower))
    ).slice(0, 50);
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
       setTimeout(() => setIsPlayingAudio(false), 20000); 
    } catch (e: any) {
       alert("Audio Gen Failed: " + e.message);
       setIsPlayingAudio(false);
    } finally {
       setLoadingAudio(false);
    }
  };

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

  const currentMonthlySavings = cashflowData ? cashflowData.monthlySavings : 0;

  // --- COMPOUNDING PROJECTION (BANK VS CONSERVATIVE VS INVESTMENTS) ---
  const compoundingData = useMemo(() => {
    const monthly = toNum(profile.monthlyInvestmentAmount);
    const currentPortfolio = investorState ? toNum(investorState.portfolioValue) : 0;
    const currentCash = cashflowState ? toNum(cashflowState.currentSavings) : 0;
    const startingPrincipal = currentPortfolio + currentCash;

    if (monthly <= 0 && startingPrincipal <= 0) return null;

    const rInv = simulationReturn / 100 / 12;
    const rCons = simulationConservativeReturn / 100 / 12;
    const rBank = simulationBankReturn / 100 / 12;
    
    const maxAge = retirementAge;
    const duration = maxAge - age;
    const chartData = [];
    
    let finalInv = 0;
    let finalCons = 0;
    let finalBank = 0;

    for (let y = 0; y <= duration + 5; y++) {
        const currentSimAge = age + y;
        const months = y * 12;
        
        // --- CALC INVESTMENT PATH ---
        const growthFactorInv = Math.pow(1 + rInv, months);
        const pmtFactorInv = rInv > 0 ? (growthFactorInv - 1) / rInv : months;
        const valInv = (startingPrincipal * growthFactorInv) + (monthly * pmtFactorInv);

        // --- CALC CONSERVATIVE PATH ---
        const growthFactorCons = Math.pow(1 + rCons, months);
        const pmtFactorCons = rCons > 0 ? (growthFactorCons - 1) / rCons : months;
        const valCons = (startingPrincipal * growthFactorCons) + (monthly * pmtFactorCons);

        // --- CALC BANK PATH ---
        const growthFactorBank = Math.pow(1 + rBank, months);
        const pmtFactorBank = rBank > 0 ? (growthFactorBank - 1) / rBank : months;
        const valBank = (startingPrincipal * growthFactorBank) + (monthly * pmtFactorBank);

        if (currentSimAge === maxAge) {
            finalInv = valInv;
            finalCons = valCons;
            finalBank = valBank;
        }

        chartData.push({
            age: currentSimAge,
            label: `Age ${currentSimAge}`,
            invested: Math.round(valInv),
            conservative: Math.round(valCons),
            bank: Math.round(valBank),
            liquidity: Math.round(valBank) // Add liquidity property to match type
        });
    }
    
    return { 
      chartData, 
      finalInv, 
      finalCons, 
      finalBank, 
      alphaVsBank: finalInv - finalBank,
      alphaVsCons: finalInv - finalCons
    };
  }, [profile.monthlyInvestmentAmount, simulationReturn, simulationConservativeReturn, simulationBankReturn, age, retirementAge, investorState?.portfolioValue, cashflowState?.currentSavings]);

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
                    className="appearance-none bg-indigo-800 border border-indigo-700 rounded-lg px-4 py-2 pr-8 text-xs font-bold text-white outline-none cursor-pointer transition-all min-w-[200px]"
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
         <SectionCard title="Monthly Expenses" action={<span className="text-red-500 font-bold">{fmtSGD(totalMonthlyExpenses)}/mo</span>}>
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

               <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Monthly Income Requirement (Today)</label>
                  <input 
                     type="text" 
                     value={profile.customRetirementExpense || ''} 
                     onChange={(e) => setProfile({...profile, customRetirementExpense: e.target.value})}
                     className="w-full bg-transparent text-xl font-bold text-slate-900 outline-none border-b border-slate-200 focus:border-indigo-500 mt-1"
                     placeholder={fmtSGD(monthlyRetirementExpenses)}
                  />
                  <div className="text-[10px] text-slate-500 mt-2 flex justify-between">
                     <span>Inflation Adjusted ({inflationRate*100}%) @ Age {retirementAge}</span>
                     <span className="font-bold text-indigo-600">{fmtSGD(futureMonthlyRetirementExpenses)}/mo</span>
                  </div>
               </div>

               {/* HIGH VALUE IMPACT BOX: TOTAL NEST EGG REQUIRED */}
               <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-6 rounded-2xl text-white shadow-xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 group-hover:scale-125 transition-transform duration-1000"></div>
                  
                  <div className="relative z-10">
                     <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-100 opacity-80 mb-3 flex justify-between items-center">
                        <span>Projected Nest Egg Required</span>
                        <span className="bg-white/10 px-2 py-0.5 rounded text-[9px] border border-white/20">Target Year: {new Date().getFullYear() + yearsToRetirement}</span>
                     </h4>
                     
                     <div className="text-4xl font-black tracking-tighter mb-2">
                        {retirementNestEgg > 0 ? fmtSGD(retirementNestEgg).split('.')[0] : '$0'}
                     </div>
                     
                     <p className="text-xs text-indigo-100/70 leading-relaxed font-medium">
                        Total capital needed to sustain <strong className="text-white">{fmtSGD(monthlyRetirementExpenses)}/mo</strong> (adjusted for inflation) for <strong className="text-white">{retirementYears} years</strong> of retirement.
                     </p>
                  </div>
               </div>
            </div>
         </SectionCard>
      </div>

      {/* --- 5. WEALTH ACCELERATION (3-WAY COMPARISON) --- */}
      {age > 0 && (
         <div className="bg-gradient-to-br from-slate-900 via-[#0B1120] to-indigo-950 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none"></div>
            
            {/* Header: Investment Narrative */}
            <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start gap-8 mb-8">
               <div className="space-y-4 max-w-lg">
                  <div>
                     <div className="inline-flex items-center gap-2 mb-2">
                        <h3 className="text-xl font-bold text-white">Wealth Acceleration</h3>
                        <span className="text-[10px] font-bold uppercase tracking-widest bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30">Compound Interest</span>
                        {chartLockedIndex !== null && (
                            <span className="ml-2 text-[10px] font-black uppercase tracking-widest bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded border border-amber-500/30 animate-pulse">PINNED</span>
                        )}
                     </div>
                     <p className="text-sm text-slate-400 leading-relaxed">
                        Comparing high-growth investments, conservative strategies, and traditional bank savings. <span className="text-white font-bold underline">Click chart to pin specific age</span> for presentation.
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

                     {/* Strategy Controls - Editable Rates */}
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                           <label className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-1 block">Investments</label>
                           <div className="flex items-center gap-2 mb-2">
                              <span className="text-xl font-bold text-white">{simulationReturn.toFixed(1)}%</span>
                           </div>
                           <input 
                              type="range" min="1" max="20" step="0.5" 
                              value={simulationReturn} 
                              onChange={(e) => updateSimulationReturn(Number(e.target.value))}
                              className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                           />
                        </div>

                        <div>
                           <label className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-1 block">Conservative</label>
                           <div className="flex items-center gap-2 mb-2">
                              <span className="text-xl font-bold text-teal-400">{simulationConservativeReturn.toFixed(1)}%</span>
                           </div>
                           <input 
                              type="range" min="1" max="10" step="0.5" 
                              value={simulationConservativeReturn} 
                              onChange={(e) => setSimulationConservativeReturn(Number(e.target.value))}
                              className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
                           />
                        </div>

                        <div>
                           <label className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-1 block">Bank (Cash)</label>
                           <div className="flex items-center gap-2 mb-2">
                              <span className="text-xl font-bold text-amber-400">
                                 {simulationBankReturn.toFixed(2)}%
                              </span>
                           </div>
                           <input 
                              type="range" min="0" max="5" step="0.05" 
                              value={simulationBankReturn} 
                              onChange={(e) => setSimulationBankReturn(Number(e.target.value))}
                              className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                           />
                        </div>
                     </div>
                  </div>
               </div>

               {/* Impact Card */}
               <div className="transition-all duration-500">
                  <div className="bg-indigo-500/10 border border-indigo-500/30 p-6 rounded-2xl backdrop-blur-sm text-center min-w-[240px]">
                     <div className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-1">Growth Differential</div>
                     <div className="text-3xl font-black text-white tracking-tighter">
                        {compoundingData ? fmtSGD(compoundingData.alphaVsBank) : '$0'}
                     </div>
                     <div className="text-[10px] text-indigo-300/70 mt-2 font-medium uppercase">
                        Compound Effect
                     </div>
                  </div>
               </div>
            </div>

            <div className={`relative z-10 h-[300px] w-full ${chartLockedIndex !== null ? 'cursor-default' : 'cursor-crosshair'}`}>
               {compoundingData ? (
                  <div className="h-full flex flex-col relative">
                     {/* OVERLAY for Interaction Blocking */}
                     {chartLockedIndex !== null && (
                        <div 
                           className="absolute inset-0 z-50 cursor-zoom-out"
                           onClick={() => setChartLockedIndex(null)}
                           title="Click to Unlock"
                        />
                     )}

                     <ResponsiveContainer width="100%" height="100%">
                        <AreaChart 
                           data={compoundingData.chartData} 
                           margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                           onMouseMove={(e) => {
                               // Only update hover if NOT locked
                               if (chartLockedIndex === null) {
                                   if (e.activeTooltipIndex !== undefined) {
                                       setCurrHoverIdx(e.activeTooltipIndex);
                                   }
                                   if (e.activeCoordinate) {
                                       setLockedTooltipPos(e.activeCoordinate);
                                   }
                               }
                           }}
                           onMouseLeave={() => {
                               if (chartLockedIndex === null) {
                                   setCurrHoverIdx(null);
                                   setLockedTooltipPos(null);
                               }
                           }}
                           onClick={() => {
                               // Toggle Lock
                               if (chartLockedIndex !== null) {
                                   setChartLockedIndex(null);
                               } else if (currHoverIdx !== null) {
                                   setChartLockedIndex(currHoverIdx);
                               }
                           }}
                        >
                           <defs>
                              <linearGradient id="colorInv" x1="0" y1="0" x2="0" y2="1">
                                 <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                                 <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="colorCons" x1="0" y1="0" x2="0" y2="1">
                                 <stop offset="5%" stopColor="#10b981" stopOpacity={0.6}/>
                                 <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="colorBank" x1="0" y1="0" x2="0" y2="1">
                                 <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.4}/>
                                 <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                              </linearGradient>
                           </defs>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                           <XAxis dataKey="age" tick={{fill: '#475569', fontSize: 10}} axisLine={false} tickLine={false} tickFormatter={(v) => `Age ${v}`} />
                           <YAxis tick={{fill: '#475569', fontSize: 10}} axisLine={false} tickLine={false} tickFormatter={(val) => val >= 1000000 ? `$${(val/1000000).toFixed(1)}m` : `$${(val/1000).toFixed(0)}k`} />
                           
                           <Tooltip 
                              // Force active if locked, using the locked index or current hover
                              active={chartLockedIndex !== null || currHoverIdx !== null}
                              // If locked, use locked pos. If hovering, let Recharts handle it (undefined)
                              position={chartLockedIndex !== null ? (lockedTooltipPos || undefined) : undefined}
                              // Content
                              contentStyle={{ 
                                 backgroundColor: '#0f172a', 
                                 borderColor: chartLockedIndex !== null ? '#f59e0b' : '#334155', 
                                 borderWidth: chartLockedIndex !== null ? '2px' : '1px',
                                 borderRadius: '16px', 
                                 color: '#fff',
                                 boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                                 pointerEvents: 'none'
                              }} 
                              itemStyle={{ fontSize: 12, padding: '2px 0' }}
                              formatter={(val: number) => fmtSGD(val)}
                              labelFormatter={(l) => (
                                 <div className="flex items-center justify-between gap-4 mb-2 border-b border-white/10 pb-1">
                                     <span className="font-black text-sm">Age {l}</span>
                                     {chartLockedIndex !== null && (
                                         <span className="bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded animate-pulse uppercase">Pinned</span>
                                     )}
                                 </div>
                              )}
                              // If locked, manually feed payload to ensure it renders even if mouse is blocked
                              payload={chartLockedIndex !== null && compoundingData.chartData[chartLockedIndex] ? [
                                  { name: 'Investment Growth', value: compoundingData.chartData[chartLockedIndex].invested, color: '#6366f1' },
                                  { name: 'Conservative Growth', value: compoundingData.chartData[chartLockedIndex].conservative, color: '#10b981' },
                                  { name: 'Bank Savings (Cash)', value: compoundingData.chartData[chartLockedIndex].bank, color: '#94a3b8' }
                              ] : undefined}
                           />
                           
                           <Area 
                              type="monotone" 
                              dataKey="invested" 
                              stroke="#6366f1" 
                              strokeWidth={3}
                              fill="url(#colorInv)" 
                              name="Investment Growth" 
                              animationDuration={1500}
                              activeDot={chartLockedIndex === null ? { r: 6 } : false}
                           />

                           <Area 
                              type="monotone" 
                              dataKey="conservative" 
                              stroke="#10b981" 
                              strokeWidth={2}
                              fill="url(#colorCons)" 
                              name="Conservative Growth" 
                              animationDuration={1500}
                              activeDot={chartLockedIndex === null ? { r: 4 } : false}
                           />
                           
                           <Area 
                              type="monotone" 
                              dataKey="bank" 
                              stroke="#94a3b8" 
                              strokeWidth={2} 
                              strokeDasharray="5 5"
                              fill="url(#colorBank)" 
                              name="Bank Savings (Cash)" 
                              animationDuration={1500}
                              activeDot={chartLockedIndex === null ? { r: 3 } : false}
                           />

                           {/* LOCKED STATE VISUALS (Manual Render) */}
                           {chartLockedIndex !== null && compoundingData.chartData[chartLockedIndex] && (
                               <>
                                   <ReferenceLine 
                                     x={compoundingData.chartData[chartLockedIndex].age} 
                                     stroke="#f59e0b" 
                                     strokeWidth={2} 
                                     strokeDasharray="0" 
                                   />
                                   {/* Manual Dots for Pinned State */}
                                   <ReferenceDot 
                                       x={compoundingData.chartData[chartLockedIndex].age} 
                                       y={compoundingData.chartData[chartLockedIndex].invested} 
                                       r={8} fill="#6366f1" stroke="none" 
                                   />
                                   <ReferenceDot 
                                       x={compoundingData.chartData[chartLockedIndex].age} 
                                       y={compoundingData.chartData[chartLockedIndex].conservative} 
                                       r={6} fill="#10b981" stroke="none" 
                                   />
                                   <ReferenceDot 
                                       x={compoundingData.chartData[chartLockedIndex].age} 
                                       y={compoundingData.chartData[chartLockedIndex].bank} 
                                       r={4} fill="#94a3b8" stroke="none" 
                                   />
                               </>
                           )}
                        </AreaChart>
                     </ResponsiveContainer>
                     
                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 bg-slate-800/50 p-4 rounded-xl border border-white/5">
                        <div className="text-center">
                           <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Investments ({simulationReturn.toFixed(1)}%)</div>
                           <div className="text-xl font-bold text-white">{fmtSGD(compoundingData.finalInv)}</div>
                        </div>
                        <div className="text-center">
                           <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Conservative ({simulationConservativeReturn.toFixed(1)}%)</div>
                           <div className="text-xl font-bold text-teal-400">{fmtSGD(compoundingData.finalCons)}</div>
                        </div>
                        <div className="text-center">
                           <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Bank Savings ({simulationBankReturn.toFixed(2)}%)</div>
                           <div className="text-xl font-bold text-gray-500">
                              {fmtSGD(compoundingData.finalBank)}
                           </div>
                        </div>
                     </div>
                     
                     {/* DISCLAIMER TEXT */}
                     <p className="mt-4 text-[9px] text-indigo-400/60 text-center font-medium leading-relaxed italic">
                        Illustration purpose only to demonstrate compounding interest differences. Rates are projected for comparison and subject to market fluctuation.
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
