
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { toNum, fmtSGD } from '../../lib/helpers';
import { computeCpf } from '../../lib/calculators';
import { generateClientAudioBriefing, playRawAudio } from '../../lib/gemini';
import { useAi } from '../../contexts/AiContext';
import LineChart from '../../components/common/LineChart';
import PageHeader from '../../components/layout/PageHeader';
import SectionCard from '../../components/layout/SectionCard';
import LabeledText from '../../components/common/LabeledText';
import LabeledSelect from '../../components/common/LabeledSelect';
import { Client } from '../../types';

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
  const { 
    profile, setProfile, 
    age, cpfData, cashflowData,
    expenses, setExpenses,
    customExpenses, setCustomExpenses,
    investorState, cashflowState
  } = useClient();
  
  const { openAiWithPrompt } = useAi();

  // --- CLIENT SEARCH STATE ---
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  
  // Audio State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);

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

  const filteredClients = useMemo(() => {
    if (!searchTerm) return [];
    const lower = searchTerm.toLowerCase();
    return clients.filter(c => 
      c.profile.name.toLowerCase().includes(lower) ||
      (c.referenceCode && c.referenceCode.toLowerCase().includes(lower))
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
  const rate1 = profile.investmentRates?.conservative ?? 0.05;
  const rate2 = profile.investmentRates?.moderate ?? 6;
  const rate3 = profile.investmentRates?.growth ?? 9;

  const setRate1 = (v: number) => setProfile({...profile, investmentRates: {...(profile.investmentRates || { conservative: 0.05, moderate: 6, growth: 9 }), conservative: v}});
  const setRate2 = (v: number) => setProfile({...profile, investmentRates: {...(profile.investmentRates || { conservative: 0.05, moderate: 6, growth: 9 }), moderate: v}});
  const setRate3 = (v: number) => setProfile({...profile, investmentRates: {...(profile.investmentRates || { conservative: 0.05, moderate: 6, growth: 9 }), growth: v}});

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

  // --- COMPOUNDING PROJECTION ---
  const compoundingData = useMemo(() => {
    const monthly = toNum(profile.monthlyInvestmentAmount);
    const currentPortfolio = investorState ? toNum(investorState.portfolioValue) : 0;
    const currentCash = cashflowState ? toNum(cashflowState.currentSavings) : 0;
    const startingPrincipal = currentPortfolio + currentCash;

    if (monthly <= 0 && startingPrincipal <= 0) return null;

    const rates = [
       { key: 'conservative', label: 'Safe', rate: rate1, color: '#3b82f6' }, 
       { key: 'moderate', label: 'Balanced', rate: rate2, color: '#10b981' },     
       { key: 'growth', label: 'Dynamic', rate: rate3, color: '#8b5cf6' }        
    ];

    const maxAge = retirementAge;
    const duration = maxAge - age;
    const chartData = [];
    const stats = rates.map(r => ({ ...r, finalAmount: 0 }));

    for (let y = 0; y <= duration + 5; y++) {
        const currentSimAge = age + y;
        const shouldRecord = duration > 30 ? y % 2 === 0 : true;
        const row: any = { age: `Age ${currentSimAge}` };
        
        stats.forEach(s => {
            const r = s.rate / 100;
            const monthlyRate = r / 12;
            const months = y * 12;
            const pvGrowth = startingPrincipal * Math.pow(1 + monthlyRate, months);
            const pmtGrowth = monthlyRate > 0 
                ? monthly * ( (Math.pow(1 + monthlyRate, months) - 1) / monthlyRate )
                : monthly * months;
            const val = pvGrowth + pmtGrowth;
            row[s.key] = Math.round(val);
            if (currentSimAge === maxAge) s.finalAmount = val;
        });
        
        if (y <= duration && shouldRecord) chartData.push(row);
    }
    return { chartData, stats, startingPrincipal };
  }, [profile.monthlyInvestmentAmount, rate1, rate2, rate3, age, retirementAge, investorState?.portfolioValue, cashflowState?.currentSavings]);

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
        subtitle="Manage personal details and financial identity."
        action={headerActions}
      />

      {/* --- 2. HUMAN CAPITAL HERO --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* Left: The "Asset" Card with Holographic Effect */}
         <div className="lg:col-span-1 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl flex flex-col justify-between group h-full min-h-[280px]">
            {/* Holographic Shine */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
            
            <div className="relative z-10">
               <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[10px] font-bold uppercase tracking-widest text-indigo-200 mb-6 backdrop-blur-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Active Income Engine
               </div>
               
               <div className="space-y-1">
                  <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Your #1 Asset</h2>
                  <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-100 to-indigo-300 tracking-tight drop-shadow-sm">
                     {humanCapital > 0 ? fmtSGD(humanCapital).split('.')[0] : '$0'}
                  </h1>
               </div>
            </div>

            <div className="relative z-10 mt-8 pt-6 border-t border-white/10">
               <p className="text-xs text-slate-400 leading-relaxed">
                  This is the <strong className="text-white">economic value</strong> of your future work until age {retirementAge}. It is your most valuable asset—and the most fragile.
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
                     <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Monthly Take-Home</label>
                     <div className="flex items-baseline">
                        <span className="text-gray-400 mr-1">$</span>
                        <input 
                           type="text" 
                           value={profile.takeHome}
                           onChange={(e) => setProfile({...profile, takeHome: e.target.value})}
                           className="w-full pb-2 border-b-2 border-gray-100 bg-transparent text-lg font-medium text-gray-700 focus:border-indigo-600 focus:outline-none"
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
                        className={`p-3 rounded-xl border text-left transition-all ${toNum(profile.customRetirementExpense) === toNum(style.value) ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500' : 'border-gray-100 hover:border-amber-200'}`}
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

      {/* --- 5. WEALTH ACCELERATION --- */}
      {age > 0 && (
         <div className="bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px] pointer-events-none"></div>
            
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
               <div className="lg:col-span-1 space-y-6">
                  <div>
                     <h3 className="text-xl font-bold text-white mb-2">Wealth Acceleration</h3>
                     <p className="text-sm text-slate-400 leading-relaxed">
                        Small differences in return rates create massive differences in outcome over time. This is the "Snowball Effect".
                     </p>
                  </div>

                  <div className="bg-white/10 rounded-2xl p-4 border border-white/10 backdrop-blur-md">
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
               </div>

               <div className="lg:col-span-2">
                  {compoundingData ? (
                     <div className="h-full flex flex-col">
                        <div className="flex-1 min-h-[250px] bg-slate-800/50 rounded-xl border border-white/5 p-4 mb-4">
                           <LineChart
                              xLabels={compoundingData.chartData.map(d => d.age)}
                              series={[
                                 { name: `Safe (${rate1}%)`, values: compoundingData.chartData.map(d => d.conservative), stroke: '#3b82f6' },
                                 { name: `Balanced (${rate2}%)`, values: compoundingData.chartData.map(d => d.moderate), stroke: '#10b981' },
                                 { name: `Dynamic (${rate3}%)`, values: compoundingData.chartData.map(d => d.growth), stroke: '#a855f7' }
                              ]}
                              height={250}
                              onFormatY={(v) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : `$${(v/1000).toFixed(0)}k`}
                           />
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4 mt-4 bg-slate-800/50 p-4 rounded-xl border border-white/5">
                           {compoundingData.stats.map(s => (
                              <div key={s.key} className="text-center relative">
                                 <div className="flex flex-col items-center justify-center gap-1 mb-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.label}</span>
                                    <div className="flex items-center gap-1 bg-slate-900 rounded-lg px-2 py-1 border border-slate-700 hover:border-slate-500 transition-colors cursor-text group">
                                        <RateInput 
                                            value={s.rate}
                                            onChange={(val) => {
                                                if (s.key === 'conservative') setRate1(val);
                                                if (s.key === 'moderate') setRate2(val);
                                                if (s.key === 'growth') setRate3(val);
                                            }}
                                            className="w-8 bg-transparent text-right font-bold text-white text-xs outline-none focus:text-indigo-400 transition-colors"
                                        />
                                        <span className="text-xs text-slate-500 group-focus-within:text-slate-300">%</span>
                                    </div>
                                 </div>
                                 <div className="text-xl font-bold" style={{ color: s.color }}>{fmtSGD(s.finalAmount)}</div>
                              </div>
                           ))}
                        </div>
                     </div>
                  ) : (
                     <div className="h-full flex items-center justify-center text-slate-600 italic">
                        Enter a monthly investment amount to see projections.
                     </div>
                  )}
               </div>
            </div>
         </div>
      )}

    </div>
  );
};

export default ProfileTab;
