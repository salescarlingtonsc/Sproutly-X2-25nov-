
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { toNum, fmtSGD, parseDob, monthsSinceDob } from '../../lib/helpers';
import { computeCpf, calculateChildEducationCost } from '../../lib/calculators';
import { getCpfRates, CPF_WAGE_CEILING } from '../../lib/cpfRules';
import LabeledText from '../../components/common/LabeledText';
import LabeledSelect from '../../components/common/LabeledSelect';
import LineChart from '../../components/common/LineChart';
import { Profile, Expenses, CustomExpense, CpfData, CashflowData, Client, InvestorState, CashflowState } from '../../types';

interface ProfileTabProps {
  profile: Profile;
  setProfile: (p: Profile) => void;
  age: number;
  cpfData: CpfData | null;
  expenses: Expenses;
  setExpenses: (e: Expenses) => void;
  customExpenses: CustomExpense[];
  setCustomExpenses: (e: CustomExpense[]) => void;
  cashflowData: CashflowData | null;
  clients?: Client[];
  // New props for Lump Sum integration
  investorState?: InvestorState;
  cashflowState?: CashflowState;
  onLoadClient?: (client: Client) => void;
  onNewProfile?: () => void;
}

const ProfileTab: React.FC<ProfileTabProps> = ({ 
  profile, 
  setProfile, 
  age, 
  cpfData, 
  expenses, 
  setExpenses, 
  customExpenses, 
  setCustomExpenses, 
  cashflowData,
  clients = [],
  investorState,
  cashflowState,
  onLoadClient,
  onNewProfile
}) => {
  
  // --- CLIENT SEARCH STATE ---
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAdvancedRates, setShowAdvancedRates] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

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

  // --- PERSISTENT INVESTMENT SETTINGS ---
  const rate1 = profile.investmentRates?.conservative || 3;
  const rate2 = profile.investmentRates?.moderate || 6;
  const rate3 = profile.investmentRates?.growth || 9;
  const customInvestmentTarget = profile.wealthTarget || '100000';

  const setRate1 = (v: number) => setProfile({...profile, investmentRates: {...(profile.investmentRates || { conservative: 3, moderate: 6, growth: 9 }), conservative: v}});
  const setRate2 = (v: number) => setProfile({...profile, investmentRates: {...(profile.investmentRates || { conservative: 3, moderate: 6, growth: 9 }), moderate: v}});
  const setRate3 = (v: number) => setProfile({...profile, investmentRates: {...(profile.investmentRates || { conservative: 3, moderate: 6, growth: 9 }), growth: v}});

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
  
  const yearsToRetirement = Math.max(1, toNum(profile.retirementAge, 65) - age);
  const lifeExpectancy = profile.gender === 'female' ? 86 : 82;
  const inflationRate = 0.03;
  
  const futureMonthlyRetirementExpenses = monthlyRetirementExpenses * Math.pow(1 + inflationRate, yearsToRetirement);
  const retirementYears = Math.max(10, lifeExpectancy - toNum(profile.retirementAge, 65));
  const retirementNestEgg = futureMonthlyRetirementExpenses * 12 * retirementYears;
  
  // Human Capital Calculation
  const grossAnnual = toNum(profile.grossSalary || profile.monthlyIncome) * 12;
  const humanCapital = grossAnnual * yearsToRetirement;

  // Required monthly investment (simple PMT approximation)
  // Formula: PMT = FV * r / ((1+r)^n - 1)
  const calcRate = rate2 / 100 / 12;
  const nPer = yearsToRetirement * 12;
  const requiredMonthlyInvestment = calcRate > 0 
    ? retirementNestEgg * calcRate / (Math.pow(1 + calcRate, nPer) - 1)
    : retirementNestEgg / nPer;

  const currentMonthlySavings = cashflowData ? cashflowData.monthlySavings : 0;
  const shortfall = Math.max(0, requiredMonthlyInvestment - currentMonthlySavings);
  const hasSurplus = currentMonthlySavings >= requiredMonthlyInvestment;

  // --- COMPOUNDING PROJECTION (THE "LINES") ---
  const compoundingData = useMemo(() => {
    const monthly = toNum(profile.monthlyInvestmentAmount);
    
    // Get Starting Lump Sum (PV)
    const currentPortfolio = investorState ? toNum(investorState.portfolioValue) : 0;
    const currentCash = cashflowState ? toNum(cashflowState.currentSavings) : 0;
    const startingPrincipal = currentPortfolio + currentCash;

    if (monthly <= 0 && startingPrincipal <= 0) return null;

    const rates = [
       { key: 'conservative', label: 'Conservative', rate: rate1, color: '#3b82f6', icon: '🛡️' }, 
       { key: 'moderate', label: 'Moderate', rate: rate2, color: '#10b981', icon: '⚖️' },     
       { key: 'growth', label: 'Growth', rate: rate3, color: '#8b5cf6', icon: '🚀' }        
    ];

    const milestonesCheck = [250000, 500000, 1000000];
    const maxAge = toNum(profile.retirementAge, 65);
    const duration = maxAge - age;
    
    const chartData = [];
    const stats = rates.map(r => ({
        ...r,
        finalAmount: 0,
        milestones: { 250000: null as number|null, 500000: null as number|null, 1000000: null as number|null }
    }));

    for (let y = 0; y <= duration + 5; y++) {
        const currentSimAge = age + y;
        // Optimization: Only push data points periodically to keep chart clean if duration is long
        const shouldRecord = duration > 30 ? y % 2 === 0 : true;
        
        const row: any = { age: `Age ${currentSimAge}` };
        
        stats.forEach(s => {
            const r = s.rate / 100;
            const monthlyRate = r / 12;
            const months = y * 12;

            // FV = PV * (1+r)^n + PMT * ...
            // Part 1: Lump Sum Growth
            const pvGrowth = startingPrincipal * Math.pow(1 + monthlyRate, months);
            
            // Part 2: Monthly Contribution Growth
            const pmtGrowth = monthlyRate > 0 
                ? monthly * ( (Math.pow(1 + monthlyRate, months) - 1) / monthlyRate )
                : monthly * months;
            
            const val = pvGrowth + pmtGrowth;
            
            row[s.key] = Math.round(val);
            
            if (currentSimAge === maxAge) s.finalAmount = val;

            milestonesCheck.forEach(m => {
                if (val >= m && s.milestones[m as keyof typeof s.milestones] === null) {
                    s.milestones[m as keyof typeof s.milestones] = currentSimAge;
                }
            });
        });
        
        if (y <= duration && shouldRecord) chartData.push(row);
    }
    
    return { chartData, stats, startingPrincipal };
  }, [profile.monthlyInvestmentAmount, rate1, rate2, rate3, age, profile.retirementAge, investorState?.portfolioValue, cashflowState?.currentSavings]);

  // Lifestyle Presets
  const LIFESTYLES = [
    { label: 'Basic', value: '1500', icon: '🏠', desc: 'HDB, Simple living' },
    { label: 'Comfort', value: '3500', icon: '☕', desc: 'Dining out, Holiday' },
    { label: 'Affluent', value: '6000', icon: '✈️', desc: 'Car, Frequent Travel' },
    { label: 'Luxury', value: '10000', icon: '💎', desc: 'Legacy, Premium' },
  ];

  return (
    <div className="p-5 max-w-7xl mx-auto">
      {/* --- CLIENT MANAGEMENT TOOLBAR --- */}
      <div className="flex flex-col sm:flex-row justify-between items-end sm:items-center gap-4 mb-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative z-20">
          <div className="w-full sm:flex-1 relative" ref={searchRef}>
             <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">🔍 Find Existing Client</label>
             <div className="relative">
               <input 
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                     setSearchTerm(e.target.value);
                     setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search by name or reference..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white text-gray-900"
               />
               <span className="absolute left-3 top-2.5 text-gray-400">🔎</span>
             </div>
             
             {showDropdown && searchTerm && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto animate-fade-in">
                   {filteredClients.length > 0 ? (
                      filteredClients.map(c => (
                         <button
                            key={c.id}
                            onClick={() => {
                               if (onLoadClient) onLoadClient(c);
                               setSearchTerm('');
                               setShowDropdown(false);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-50 last:border-0 transition-colors group"
                         >
                            <div className="font-bold text-gray-800 group-hover:text-blue-700">{c.profile.name}</div>
                            <div className="text-xs text-gray-500 flex justify-between mt-0.5">
                               <span className="font-mono bg-gray-100 px-1 rounded">{c.referenceCode}</span>
                               <span>Updated: {new Date(c.lastUpdated).toLocaleDateString()}</span>
                            </div>
                         </button>
                      ))
                   ) : (
                      <div className="p-4 text-sm text-gray-500 text-center italic">No clients found matching "{searchTerm}"</div>
                   )}
                </div>
             )}
          </div>
          
          <div className="flex items-center w-full sm:w-auto">
             <button
                onClick={() => {
                   if (onNewProfile) {
                     if (confirm("Start a new profile? Unsaved changes to the current profile will be lost unless you save first.")) {
                       onNewProfile();
                       setSearchTerm('');
                     }
                   }
                }}
                className="w-full sm:w-auto whitespace-nowrap px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 shadow-sm transition-colors flex items-center justify-center gap-2"
             >
                <span>➕</span> New Profile
             </button>
          </div>
       </div>

      {/* Welcome Banner */}
      <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 rounded-xl p-6 mb-5 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-4xl">👋</div>
          <div>
            <h3 className="m-0 text-indigo-900 text-xl font-bold">Discovery & Profile</h3>
            <p className="m-1 text-indigo-800 text-sm opacity-80">
              Build your financial identity
            </p>
          </div>
        </div>
        {/* Human Capital Badge */}
        {humanCapital > 0 && (
           <div className="hidden md:block text-right">
              <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Your Human Capital</div>
              <div className="text-2xl font-extrabold text-indigo-600">{fmtSGD(humanCapital)}</div>
           </div>
        )}
      </div>

      {/* Personal Info */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 shadow-sm">
        <h3 className="mt-0 text-lg font-bold text-gray-800 mb-4">📋 Personal Information</h3>
        
        {/* Profile Display Card */}
        {profile.name && age > 0 && (
          <div className="mb-5 p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl border-2 border-emerald-500 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-24 h-24 text-emerald-900">
                  <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
               </svg>
            </div>
            <div className="flex items-center gap-3 relative z-10">
              <div className="text-4xl">👤</div>
              <div>
                <div className="text-2xl font-bold text-emerald-800">
                  {profile.name}, {age}
                </div>
                <div className="text-sm text-emerald-800 mt-1 flex gap-2">
                  <span className="bg-emerald-200/50 px-2 py-0.5 rounded">{profile.employmentStatus === 'employed' ? 'Employed' : 'Self-Employed'}</span>
                  <span className="bg-emerald-200/50 px-2 py-0.5 rounded">{profile.gender === 'male' ? 'Male' : 'Female'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Life Stage Visualization - Visual Fix */}
        {age > 0 && (
          <div className="mt-8 mb-12"> {/* Increased bottom margin for markers */}
             <div className="flex justify-between items-end mb-4 px-1">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                      {/* Hourglass Icon */}
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 100-16 8 8 0 000 16zm-5-9h10v2H7v-2z" />
                      </svg>
                   </div>
                   <div>
                      <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest m-0">Your Financial Runway</h4>
                      <div className="text-xs text-slate-500 mt-0.5">
                         Visualizing your journey from <strong>{age}</strong> to <strong>{lifeExpectancy}</strong>
                      </div>
                   </div>
                </div>
                <div className="text-right">
                   <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Planning Horizon</div>
                   <div className="text-2xl font-black text-indigo-600 leading-none">{lifeExpectancy - age} <span className="text-sm font-bold text-indigo-400">Years</span></div>
                </div>
             </div>
             
             {/* The Track Container */}
             <div className="relative h-16 select-none">
                
                {/* 1. The Bar Itself (Rounded & Masked) */}
                <div className="absolute inset-0 rounded-2xl overflow-hidden flex shadow-sm ring-1 ring-slate-900/5">
                    
                    {/* PAST */}
                    <div 
                       style={{ width: `${(age / lifeExpectancy) * 100}%` }} 
                       className="h-full bg-slate-100 border-r border-slate-300/50 relative"
                    >
                       <div className="absolute inset-0 opacity-10" 
                            style={{ backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 1px, transparent 0, transparent 50%)', backgroundSize: '10px 10px' }}>
                       </div>
                       <span className="absolute bottom-2 left-3 text-[10px] font-bold text-slate-300 uppercase tracking-wider">Past</span>
                    </div>

                    {/* ACCUMULATION */}
                    <div 
                       style={{ width: `${((Math.max(0, toNum(profile.retirementAge, 65) - age)) / lifeExpectancy) * 100}%` }} 
                       className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 flex items-center justify-center relative overflow-hidden group"
                    >
                       <div className="absolute inset-0 bg-white/10 group-hover:bg-transparent transition-colors"></div>
                       <div className="text-center z-10">
                          <span className="block text-[10px] font-black text-emerald-900/40 uppercase tracking-[0.2em] mb-0.5">Accumulation</span>
                          <span className="block text-[11px] font-bold text-white drop-shadow-md">{Math.max(0, toNum(profile.retirementAge, 65) - age)} Years</span>
                       </div>
                    </div>

                    {/* RETIREMENT */}
                    <div 
                       style={{ width: `${(Math.max(0, lifeExpectancy - toNum(profile.retirementAge, 65)) / lifeExpectancy) * 100}%` }}
                       className="h-full bg-gradient-to-r from-amber-400 to-orange-500 flex items-center justify-center relative overflow-hidden group"
                    >
                        <div className="absolute inset-0 bg-white/10 group-hover:bg-transparent transition-colors"></div>
                        <div className="text-center z-10">
                          <span className="block text-[10px] font-black text-amber-900/30 uppercase tracking-[0.2em] mb-0.5">Freedom</span>
                          <span className="block text-[11px] font-bold text-white drop-shadow-md">{Math.max(0, lifeExpectancy - toNum(profile.retirementAge, 65))} Years</span>
                       </div>
                    </div>
                </div>

                {/* 2. Markers (Outside the Overflow Hidden Bar) */}
                
                {/* Current Age Marker */}
                <div 
                   className="absolute top-0 bottom-0 w-0.5 bg-slate-800 z-20 shadow-[0_0_10px_rgba(0,0,0,0.2)]" 
                   style={{ left: `${(age / lifeExpectancy) * 100}%` }}
                >
                   {/* Top Flag */}
                   <div className="absolute -top-3 -translate-x-1/2 flex flex-col items-center">
                      <div className="bg-slate-800 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg min-w-[30px] text-center">
                         {age}
                      </div>
                      <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-slate-800"></div>
                   </div>
                   
                   {/* Bottom Tag */}
                   <div className="absolute -bottom-3 -translate-x-1/2 flex flex-col items-center">
                      <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[4px] border-b-white"></div>
                      <div className="bg-white text-slate-800 text-[9px] font-extrabold px-2 py-0.5 rounded-full shadow-md border border-slate-200 tracking-wider">
                         NOW
                      </div>
                   </div>
                </div>

                {/* Retirement Age Marker */}
                <div 
                   className="absolute top-0 bottom-0 w-0.5 bg-white/60 z-20 border-l border-dashed border-white mix-blend-overlay" 
                   style={{ left: `${(toNum(profile.retirementAge, 65) / lifeExpectancy) * 100}%` }}
                >
                   <div className="absolute -top-3 -translate-x-1/2 flex flex-col items-center">
                      <div className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg border border-indigo-500 min-w-[30px] text-center">
                         {profile.retirementAge || 65}
                      </div>
                      <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-indigo-600"></div>
                   </div>
                </div>

             </div>
             
             {/* Footer Labels */}
             <div className="flex justify-between mt-4 px-1">
                <div className="flex items-center gap-1.5 text-slate-400">
                   <span className="text-lg">👶</span>
                   <div className="text-[10px] font-bold uppercase tracking-wider">Birth <span className="opacity-50">({new Date(profile.dob).getFullYear() || '?'})</span></div>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400">
                   <div className="text-right">
                      <div className="text-[10px] font-bold uppercase tracking-wider">Life Expectancy <span className="opacity-50">({lifeExpectancy})</span></div>
                   </div>
                   <span className="text-lg">🏁</span>
                </div>
             </div>
          </div>
        )}

        {/* Contact Info Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <LabeledText label='Full Name' value={profile.name} onChange={(val) => setProfile({ ...profile, name: val })} placeholder='e.g. John Tan' />
          <LabeledText label='Email Address' value={profile.email} onChange={(val) => setProfile({ ...profile, email: val })} placeholder='client@email.com' type="email"/>
          <LabeledText label='Phone Number' value={profile.phone} onChange={(val) => setProfile({ ...profile, phone: val })} placeholder='9123 4567' type="tel"/>
        </div>

        {/* Demographics Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <LabeledText label='Date of Birth' value={profile.dob} onChange={(val) => setProfile({ ...profile, dob: val })} type='date' />
          <LabeledSelect
            label='Gender'
            value={profile.gender}
            onChange={(val) => setProfile({ ...profile, gender: val as 'male' | 'female' })}
            options={[{ label: 'Male (Life Exp: 82)', value: 'male' }, { label: 'Female (Life Exp: 86)', value: 'female' }]}
          />
          <LabeledSelect
            label='Employment Status'
            value={profile.employmentStatus || 'employed'}
            onChange={(val) => setProfile({ ...profile, employmentStatus: val as any })}
            options={[{ label: '💼 Employed', value: 'employed' }, { label: '🏢 Self-Employed', value: 'self-employed' }]}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="space-y-4">
             <div className="flex justify-between items-end">
                <label className="text-sm font-bold text-gray-700">Monthly Gross Salary ($)</label>
                {grossAnnual > 0 && <span className="text-xs text-gray-500 font-mono">~{fmtSGD(grossAnnual)}/yr</span>}
             </div>
             <input 
                type="text" 
                value={profile.grossSalary || ''}
                onChange={(e) => {
                   const val = e.target.value;
                   const gross = toNum(val);
                   const cpfCalc = computeCpf(gross, age); 
                   setProfile({ ...profile, grossSalary: val, monthlyIncome: val, takeHome: cpfCalc.takeHome.toFixed(2) });
                }}
                className="w-full text-xl font-bold p-3 border-2 border-gray-300 rounded-lg focus:border-indigo-500 outline-none text-indigo-900 bg-gray-50"
                placeholder="6000"
             />
             <div className="text-xs text-gray-500">🏦 Used for CPF & Human Capital calculation</div>
          </div>
          
          <div className="space-y-4">
             <div className="flex justify-between items-end">
                <label className="text-sm font-bold text-gray-700">Monthly Take-Home ($)</label>
                {toNum(profile.takeHome) > 0 && <span className="text-xs text-emerald-600 font-bold">Spendable Income</span>}
             </div>
             <input 
                type="text" 
                value={profile.takeHome || ''}
                onChange={(e) => {
                   const val = e.target.value;
                   const takeHome = toNum(val);
                   const rates = getCpfRates(age);
                   const maxCPFDeduction = CPF_WAGE_CEILING * rates.employee;
                   const ceilingTakeHome = CPF_WAGE_CEILING - maxCPFDeduction;
                   let gross;
                   if (takeHome <= ceilingTakeHome) gross = takeHome / (1 - rates.employee);
                   else gross = takeHome + maxCPFDeduction;
                   setProfile({ ...profile, takeHome: val, grossSalary: gross.toFixed(2), monthlyIncome: gross.toFixed(2) });
                }}
                className="w-full text-xl font-bold p-3 border-2 border-emerald-300 rounded-lg focus:border-emerald-500 outline-none text-emerald-900 bg-emerald-50"
                placeholder="4800"
             />
             <div className="text-xs text-gray-500">💸 Used for Cashflow planning</div>
          </div>
        </div>

        {/* HUMAN CAPITAL VISUALIZER */}
        {humanCapital > 0 && (
           <div className="mt-6 p-5 bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl text-white shadow-lg relative overflow-hidden group hover:scale-[1.01] transition-transform duration-300">
              <div className="absolute right-0 top-0 h-full w-32 bg-white/5 skew-x-12 transform translate-x-10 group-hover:translate-x-0 transition-transform duration-700"></div>
              <div className="relative z-10">
                 <div className="flex justify-between items-start">
                    <div>
                       <div className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-1">Your Economic Value</div>
                       <div className="text-3xl font-extrabold text-white mb-2">{fmtSGD(humanCapital)}</div>
                       <p className="text-xs text-slate-400 max-w-sm">
                          This is the asset value of your future work until age {profile.retirementAge || 65}. 
                          If this "money machine" stops working tomorrow (due to illness/accident), does your family lose this asset?
                       </p>
                    </div>
                    <div className="text-4xl opacity-50">💎</div>
                 </div>
              </div>
           </div>
        )}
      </div>

      {/* Expenses */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 shadow-sm">
        <h3 className="mt-0 text-lg font-bold text-gray-800 mb-4">💰 Current Monthly Expenses</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.keys(expenses).map((key) => (
            <div key={key} className="bg-gray-50 p-2 rounded-lg border border-gray-200 focus-within:border-indigo-500 focus-within:bg-white transition-colors">
               <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">{key}</label>
               <input 
                  type="text"
                  value={expenses[key]}
                  onChange={(e) => setExpenses({ ...expenses, [key]: e.target.value })}
                  className="w-full bg-transparent outline-none font-bold text-gray-800"
                  placeholder="0"
               />
            </div>
          ))}
        </div>
        
        {customExpenses.length > 0 && (
           <div className="mt-3 grid gap-2">
              {customExpenses.map(exp => (
                 <div key={exp.id} className="flex gap-2 items-center">
                    <input 
                      type="text" 
                      value={exp.name} 
                      onChange={(e) => setCustomExpenses(customExpenses.map(x => x.id === exp.id ? {...x, name: e.target.value} : x))} 
                      className="flex-1 p-2 border rounded text-sm bg-white text-gray-900" 
                      placeholder="Expense Name"
                    />
                    <input 
                      type="text" 
                      value={exp.amount} 
                      onChange={(e) => setCustomExpenses(customExpenses.map(x => x.id === exp.id ? {...x, amount: e.target.value} : x))} 
                      className="w-24 p-2 border rounded text-sm bg-white text-gray-900" 
                      placeholder="Amount"
                    />
                    <button onClick={() => setCustomExpenses(customExpenses.filter(x => x.id !== exp.id))} className="text-red-500 px-2">×</button>
                 </div>
              ))}
           </div>
        )}
        <div className="mt-3 flex justify-between items-center">
           <button onClick={() => setCustomExpenses([...customExpenses, {id: Date.now(), name: '', amount: ''}])} className="text-xs font-bold text-indigo-600 hover:underline">+ Add Custom</button>
           <div className="text-sm font-bold text-gray-700">Total: {fmtSGD(totalMonthlyExpenses)}/mo</div>
        </div>
      </div>

      {/* --- RETIREMENT LIFESTYLE DESIGN --- */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 shadow-sm">
         <div className="flex justify-between items-center mb-4">
            <h3 className="m-0 text-lg font-bold text-gray-800">🌅 Retirement Lifestyle Design</h3>
            <div className="flex items-center gap-2">
               <label className="text-xs font-bold text-gray-600">Target Age:</label>
               <input 
                  type="number" 
                  value={profile.retirementAge || 65} 
                  onChange={(e) => setProfile({...profile, retirementAge: e.target.value})}
                  className="w-16 p-1 border rounded text-center font-bold text-indigo-600 bg-white"
               />
            </div>
         </div>

         <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {LIFESTYLES.map((style) => {
               const isSelected = toNum(profile.customRetirementExpense) === toNum(style.value);
               return (
                  <button 
                     key={style.label}
                     onClick={() => setProfile({...profile, customRetirementExpense: style.value})}
                     className={`p-3 rounded-xl border-2 text-left transition-all hover:scale-105 ${isSelected ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600' : 'border-gray-200 hover:border-indigo-300'}`}
                  >
                     <div className="text-2xl mb-2">{style.icon}</div>
                     <div className={`font-bold text-sm ${isSelected ? 'text-indigo-900' : 'text-gray-700'}`}>{style.label}</div>
                     <div className={`text-xs ${isSelected ? 'text-indigo-700' : 'text-gray-500'} mb-1`}>{fmtSGD(style.value)}/m</div>
                     <div className="text-[10px] text-gray-400 leading-tight">{style.desc}</div>
                  </button>
               );
            })}
         </div>

         <div className="flex flex-col sm:flex-row gap-4 items-center bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="flex-1">
               <label className="text-xs font-bold text-gray-500 uppercase">Custom Monthly Retirement Income Needed (Today's Value)</label>
               <input 
                  type="text" 
                  value={profile.customRetirementExpense || ''} 
                  onChange={(e) => setProfile({...profile, customRetirementExpense: e.target.value})}
                  className="w-full bg-transparent text-xl font-bold text-gray-800 outline-none border-b border-gray-300 focus:border-indigo-500"
                  placeholder={fmtSGD(monthlyRetirementExpenses)}
               />
            </div>
            <div className="text-right">
               <div className="text-xs text-gray-500">Inflation Adjusted ({yearsToRetirement} yrs @ {inflationRate*100}%)</div>
               <div className="text-xl font-bold text-indigo-600">{fmtSGD(futureMonthlyRetirementExpenses)}/mo</div>
            </div>
         </div>
      </div>

      {/* --- GOAL FEASIBILITY (Green/Red) --- */}
      <div className={`p-6 rounded-xl border-l-4 shadow-sm mb-5 ${hasSurplus ? 'bg-emerald-50 border-emerald-500' : 'bg-red-50 border-red-500'}`}>
         <h3 className={`mt-0 text-lg font-bold mb-4 ${hasSurplus ? 'text-emerald-900' : 'text-red-900'}`}>
            🎯 Goal Feasibility Check
         </h3>
         
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
               <div className="text-xs font-bold uppercase tracking-wider opacity-70">Target Nest Egg</div>
               <div className="text-2xl font-bold">{fmtSGD(retirementNestEgg)}</div>
               <div className="text-xs mt-1">Needed at age {profile.retirementAge || 65}</div>
            </div>
            
            <div>
               <div className="text-xs font-bold uppercase tracking-wider opacity-70">Required Investment</div>
               <div className="text-2xl font-bold">{fmtSGD(requiredMonthlyInvestment)}/mo</div>
               <div className="text-xs mt-1">To hit target @ {rate2}% return</div>
            </div>

            <div>
               <div className="text-xs font-bold uppercase tracking-wider opacity-70">Your Savings Capacity</div>
               <div className={`text-2xl font-bold ${hasSurplus ? 'text-emerald-700' : 'text-red-700'}`}>
                  {fmtSGD(currentMonthlySavings)}/mo
               </div>
               <div className="text-xs mt-1 font-bold">
                  {hasSurplus 
                     ? '✅ You have enough surplus!' 
                     : `⚠️ Shortfall of ${fmtSGD(shortfall)}`}
               </div>
            </div>
         </div>
         
         {!hasSurplus && shortfall > 0 && (
            <div className="mt-4 p-3 bg-red-100/50 rounded-lg text-xs text-red-800 flex items-center gap-2">
               <span>🚨</span>
               <span>You need to increase your savings or investment returns to meet this goal.</span>
            </div>
         )}
         
         {hasSurplus && (
            <div className="mt-4">
               <button 
                  onClick={() => setProfile({...profile, monthlyInvestmentAmount: String(Math.round(requiredMonthlyInvestment))})}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-emerald-700 transition-colors"
               >
                  Commit Required Amount ({fmtSGD(requiredMonthlyInvestment)})
               </button>
            </div>
         )}
      </div>

      {/* --- POWER OF COMPOUNDING SECTION (New) --- */}
      {age > 0 && (
         <div className="bg-white border-2 border-indigo-600 rounded-xl p-6 mb-5 shadow-lg">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
               <div>
                  <h3 className="m-0 text-xl font-bold text-indigo-900">📈 The Power of Compounding</h3>
                  <p className="text-xs text-indigo-600 mt-1">
                     How specific return rates accelerate your wealth journey
                  </p>
                  {compoundingData && compoundingData.startingPrincipal > 0 && (
                     <div className="mt-2 inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded text-xs text-indigo-800 font-medium">
                        <span>💰 Includes Starting Wealth: <strong>{fmtSGD(compoundingData.startingPrincipal)}</strong></span>
                        <span className="text-[9px] opacity-70">(Cash + Investments, Excl CPF)</span>
                     </div>
                  )}
               </div>
               
               <div className="w-full md:w-auto bg-gray-50 p-2 rounded-lg border border-gray-200">
                  <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Monthly Investment</label>
                  <input 
                     type="text" 
                     value={profile.monthlyInvestmentAmount || ''} 
                     onChange={(e) => setProfile({...profile, monthlyInvestmentAmount: e.target.value})}
                     className="w-full md:w-32 bg-white px-2 py-1 border rounded font-bold text-indigo-600 text-lg outline-none focus:ring-1 focus:ring-indigo-500"
                     placeholder={fmtSGD(cashflowData ? cashflowData.monthlySavings : 0)}
                  />
               </div>
            </div>

            {compoundingData ? (
               <>
                  <div className="mb-6">
                     <LineChart
                        xLabels={compoundingData.chartData.map(d => d.age)}
                        series={[
                           { name: 'Conservative', values: compoundingData.chartData.map(d => d.conservative), stroke: '#3b82f6' },
                           { name: 'Moderate', values: compoundingData.chartData.map(d => d.moderate), stroke: '#10b981' },
                           { name: 'Growth', values: compoundingData.chartData.map(d => d.growth), stroke: '#8b5cf6' }
                        ]}
                        height={300}
                        onFormatY={(v) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : `$${(v/1000).toFixed(0)}k`}
                     />
                  </div>

                  {/* Milestone Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     {compoundingData.stats.map(stat => (
                        <div key={stat.key} className="border rounded-xl overflow-hidden relative">
                           <div className={`h-2 w-full`} style={{ backgroundColor: stat.color }} />
                           <div className="p-4">
                              <div className="flex justify-between items-center mb-3">
                                 <div className="font-bold text-gray-800 flex items-center gap-2">
                                    <span className="text-xl">{stat.icon}</span> {stat.label}
                                 </div>
                                 <div className="text-sm font-bold bg-gray-100 px-2 py-1 rounded">
                                    {stat.rate}%
                                 </div>
                              </div>
                              
                              <div className="text-center mb-4 p-3 bg-gray-50 rounded-lg">
                                 <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">At Retirement ({profile.retirementAge})</div>
                                 <div className="text-xl font-extrabold text-gray-900">{fmtSGD(stat.finalAmount)}</div>
                              </div>

                              <div className="space-y-2 text-xs">
                                 <div className="flex justify-between items-center">
                                    <span className="text-gray-500">Hit $250k</span>
                                    <span className={`font-bold ${stat.milestones[250000] ? 'text-gray-900' : 'text-gray-300'}`}>
                                       {stat.milestones[250000] ? `Age ${stat.milestones[250000]}` : '-'}
                                    </span>
                                 </div>
                                 <div className="flex justify-between items-center">
                                    <span className="text-gray-500">Hit $500k</span>
                                    <span className={`font-bold ${stat.milestones[500000] ? 'text-gray-900' : 'text-gray-300'}`}>
                                       {stat.milestones[500000] ? `Age ${stat.milestones[500000]}` : '-'}
                                    </span>
                                 </div>
                                 <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                                    <span className="text-emerald-700 font-bold">Hit $1 Million 🏆</span>
                                    <span className={`font-bold bg-emerald-100 px-2 py-0.5 rounded ${stat.milestones[1000000] ? 'text-emerald-800' : 'text-gray-400 bg-gray-100'}`}>
                                       {stat.milestones[1000000] ? `Age ${stat.milestones[1000000]}` : 'Not Reached'}
                                    </span>
                                 </div>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
                  
                  {/* Advanced Rate Toggles */}
                  <div className="mt-4 text-center">
                     <button onClick={() => setShowAdvancedRates(!showAdvancedRates)} className="text-xs text-gray-400 hover:text-gray-600 underline">
                        {showAdvancedRates ? 'Hide' : 'Adjust'} Return Rate Assumptions
                     </button>
                     {showAdvancedRates && (
                        <div className="grid grid-cols-3 gap-3 mt-3 max-w-md mx-auto bg-gray-50 p-3 rounded-lg">
                           <LabeledText label="Conservative %" value={rate1} onChange={(v) => setRate1(toNum(v))} type="number" />
                           <LabeledText label="Moderate %" value={rate2} onChange={(v) => setRate2(toNum(v))} type="number" />
                           <LabeledText label="Growth %" value={rate3} onChange={(v) => setRate3(toNum(v))} type="number" />
                        </div>
                     )}
                  </div>
               </>
            ) : (
               <div className="text-center p-8 text-gray-500 bg-gray-50 rounded-lg">
                  Please enter a monthly investment amount above to see the power of compounding.
               </div>
            )}
         </div>
      )}

      {/* Snapshot Summary Footer */}
      {retirementNestEgg > 0 && (
         <div className="bg-slate-900 text-white p-5 rounded-xl flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
               <div className="text-xs text-slate-400 uppercase tracking-widest font-bold">Financial Independence Target</div>
               <div className="text-2xl font-bold">{fmtSGD(retirementNestEgg)}</div>
               <div className="text-xs text-slate-400">To sustain {fmtSGD(futureMonthlyRetirementExpenses)}/mo lifestyle</div>
            </div>
            {humanCapital > 0 && (
               <div className="md:text-right">
                  <div className="text-xs text-slate-400 uppercase tracking-widest font-bold">Unprotected Asset (Human Capital)</div>
                  <div className="text-2xl font-bold text-indigo-400">{fmtSGD(humanCapital)}</div>
               </div>
            )}
         </div>
      )}
    </div>
  );
};

export default ProfileTab;
