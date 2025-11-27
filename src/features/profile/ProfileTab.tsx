import React, { useMemo, useState, useRef, useEffect } from 'react';
import { toNum, fmtSGD, parseDob, monthsSinceDob } from '../../lib/helpers';
import { computeCpf, calculateChildEducationCost } from '../../lib/calculators';
import { getCpfRates, CPF_WAGE_CEILING } from '../../lib/cpfRules';
import LabeledText from '../../components/common/LabeledText';
import LabeledSelect from '../../components/common/LabeledSelect';
import LineChart from '../../components/common/LineChart';
import { Profile, Expenses, CustomExpense, CpfData, CashflowData, Client } from '../../types';

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
  // New props for client management
  clients?: Client[];
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
  onLoadClient,
  onNewProfile
}) => {
  
  // --- CLIENT SEARCH STATE ---
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
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
    ).slice(0, 5); // Limit results to 5
  }, [clients, searchTerm]);

  // --- PERSISTENT INVESTMENT SETTINGS ---
  const rate1 = profile.investmentRates?.conservative || 0.05;
  const rate2 = profile.investmentRates?.moderate || 6;
  const rate3 = profile.investmentRates?.growth || 12;
  const customInvestmentTarget = profile.wealthTarget || '100000';

  const setRate1 = (v: number) => setProfile({...profile, investmentRates: {...(profile.investmentRates || { conservative: 0.05, moderate: 6, growth: 12 }), conservative: v}});
  const setRate2 = (v: number) => setProfile({...profile, investmentRates: {...(profile.investmentRates || { conservative: 0.05, moderate: 6, growth: 12 }), moderate: v}});
  const setRate3 = (v: number) => setProfile({...profile, investmentRates: {...(profile.investmentRates || { conservative: 0.05, moderate: 6, growth: 12 }), growth: v}});
  const setCustomInvestmentTarget = (v: string) => setProfile({...profile, wealthTarget: v});

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
  
  // Required monthly investment (simple PMT approximation)
  const monthlyRate = 0.08 / 12;
  const requiredMonthlyInvestment = retirementNestEgg / ((Math.pow(1 + monthlyRate, yearsToRetirement * 12) - 1) / monthlyRate);

  // Children Cost Calculation
  const totalChildrenEducationCost = useMemo(() => {
    if (!profile.children) return 0;
    return profile.children.reduce((sum, child) => {
       return sum + calculateChildEducationCost(child, profile.educationSettings);
    }, 0);
  }, [profile.children, profile.educationSettings]);

  return (
    <div className="p-5">
      {/* --- NEW: CLIENT MANAGEMENT TOOLBAR --- */}
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
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
               />
               <span className="absolute left-3 top-2.5 text-gray-400">🔎</span>
             </div>
             
             {/* Dropdown Results */}
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
      <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-500 rounded-xl p-6 mb-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="text-3xl">👋</div>
          <div>
            <h3 className="m-0 text-blue-800 text-xl font-semibold">Let's Get to Know You</h3>
            <p className="m-1 text-blue-800 text-sm opacity-80">
              Your personal details help us create a customized financial roadmap
            </p>
          </div>
        </div>
      </div>

      {/* Personal Info */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 shadow-sm">
        <h3 className="mt-0 text-lg font-bold text-gray-800 mb-4">📋 Personal Information</h3>
        
        {/* Profile Display Card */}
        {profile.name && age > 0 && (
          <div className="mb-5 p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl border-2 border-emerald-500">
            <div className="flex items-center gap-3">
              <div className="text-4xl">👤</div>
              <div>
                <div className="text-2xl font-bold text-emerald-800">
                  {profile.name}, {age} years old
                </div>
                <div className="text-sm text-emerald-800 mt-1">
                  {profile.employmentStatus === 'employed' ? '💼 Employed' : '🏢 Self-Employed'} • 
                  {profile.gender === 'male' ? ' ♂️ Male' : ' ♀️ Female'} • 
                  Target Retirement: Age {profile.retirementAge || 65}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Contact Info Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <LabeledText 
            label='Full Name' 
            value={profile.name} 
            onChange={(val) => setProfile({ ...profile, name: val })} 
            placeholder='Enter client name' 
          />
          <LabeledText 
            label='Email Address' 
            value={profile.email} 
            onChange={(val) => setProfile({ ...profile, email: val })} 
            placeholder='client@email.com' 
            type="email"
          />
          <LabeledText 
            label='Phone Number (WhatsApp)' 
            value={profile.phone} 
            onChange={(val) => setProfile({ ...profile, phone: val })} 
            placeholder='e.g. 6591234567' 
            type="tel"
          />
        </div>

        {/* Demographics Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <LabeledText 
            label='Date of Birth' 
            value={profile.dob} 
            onChange={(val) => setProfile({ ...profile, dob: val })} 
            type='date' 
          />
          <LabeledSelect
            label='Gender'
            value={profile.gender}
            onChange={(val) => setProfile({ ...profile, gender: val as 'male' | 'female' })}
            options={[
              { label: 'Male (Life: 82 yrs)', value: 'male' },
              { label: 'Female (Life: 86 yrs)', value: 'female' }
            ]}
          />
          <LabeledSelect
            label='Employment Status'
            value={profile.employmentStatus || 'employed'}
            onChange={(val) => setProfile({ ...profile, employmentStatus: val as any })}
            options={[
              { label: '💼 Employed', value: 'employed' },
              { label: '🏢 Self-Employed', value: 'self-employed' }
            ]}
          />
        </div>

        <div className="mt-3 mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs text-blue-800">
          <strong>💡 Auto-Sync:</strong> {age ? 
            `Enter either Gross OR Take-Home salary - the other calculates automatically based on your age and CPF rates! ${profile.employmentStatus === 'self-employed' ? '(Self-employed: No employer CPF)' : ''}` : 
            '⚠️ Fill in your Date of Birth above first, then enter either salary field to enable auto-calculation!'}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <LabeledText 
              label='Monthly Gross Salary (SGD) 💼' 
              value={profile.grossSalary || ''} 
              onChange={(val) => {
                const gross = toNum(val);
                const cpfCalc = computeCpf(gross, age); 
                setProfile({ 
                  ...profile, 
                  grossSalary: val,
                  monthlyIncome: val,
                  takeHome: cpfCalc.takeHome.toFixed(2)
                });
              }} 
              placeholder='e.g., 6000' 
            />
             <div className="text-xs text-gray-500 mt-1">
              🏦 Used for CPF calculations • Auto-syncs with Take-Home
            </div>
          </div>
          <div>
            <LabeledText 
              label='Monthly Take-Home (SGD) 💵' 
              value={profile.takeHome || ''} 
              onChange={(val) => {
                const takeHome = toNum(val);
                const rates = getCpfRates(age);
                const maxCPFDeduction = CPF_WAGE_CEILING * rates.employee;
                const ceilingTakeHome = CPF_WAGE_CEILING - maxCPFDeduction;
                let gross;
                if (takeHome <= ceilingTakeHome) {
                  gross = takeHome / (1 - rates.employee);
                } else {
                  gross = takeHome + maxCPFDeduction;
                }
                setProfile({ 
                  ...profile, 
                  takeHome: val,
                  grossSalary: gross.toFixed(2),
                  monthlyIncome: gross.toFixed(2)
                });
              }} 
              placeholder='e.g., 4800' 
            />
            <div className="text-xs text-gray-500 mt-1">
              💸 Used for Cashflow calculations • Auto-syncs with Gross
            </div>
          </div>
        </div>

        {/* Salary Breakdown Info Cards */}
        {profile.grossSalary && age > 0 && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="p-3 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-500">
              <div className="text-xs font-bold text-blue-800 uppercase mb-1">💰 Gross Salary</div>
              <div className="text-xl font-bold text-blue-800">{fmtSGD(profile.grossSalary)}</div>
              <div className="text-[10px] text-blue-600 mt-1 opacity-80">Before CPF deductions</div>
            </div>
            
            <div className="p-3 bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg border border-amber-500">
              <div className="text-xs font-bold text-amber-800 uppercase mb-1">👤 Employee CPF</div>
              <div className="text-xl font-bold text-amber-800">
                {fmtSGD(computeCpf(toNum(profile.grossSalary, 0), age).employee)}
              </div>
              <div className="text-[10px] text-amber-800 mt-1 opacity-80">
                 {(getCpfRates(age).employee * 100).toFixed(0)}% contribution
              </div>
            </div>

            {profile.employmentStatus === 'employed' && (
              <div className="p-3 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg border border-emerald-500">
                <div className="text-xs font-bold text-emerald-800 uppercase mb-1">🏢 Employer CPF</div>
                <div className="text-xl font-bold text-emerald-800">
                  {fmtSGD(computeCpf(toNum(profile.grossSalary, 0), age).employer)}
                </div>
                <div className="text-[10px] text-emerald-800 mt-1 opacity-80">
                   {(getCpfRates(age).employer * 100).toFixed(1)}% contribution
                </div>
              </div>
            )}
          </div>
        )}

        {/* CPF Wage Ceiling Warning */}
        {profile.grossSalary && age > 0 && toNum(profile.grossSalary, 0) > CPF_WAGE_CEILING && (
          <div className="mt-4 p-4 bg-amber-50 rounded-lg border-2 border-amber-400">
            <div className="text-sm font-bold text-amber-900 mb-2 flex items-center gap-2">
              <span className="text-lg">ℹ️</span> CPF Wage Ceiling Applied
            </div>
            <div className="text-xs text-amber-800 space-y-1">
              <div>• Your gross salary: <strong>{fmtSGD(toNum(profile.grossSalary, 0))}</strong></div>
              <div>• CPF calculated on: <strong>{fmtSGD(CPF_WAGE_CEILING)}</strong> (2025 wage ceiling)</div>
              <div>• Excess amount: <strong>{fmtSGD(toNum(profile.grossSalary, 0) - CPF_WAGE_CEILING)}</strong> (no CPF on this amount)</div>
              <div className="mt-2">💡 Consider using this excess for voluntary SRS contributions or other investments!</div>
            </div>
          </div>
        )}

        {/* Financial Independence Section (IMPROVED LAYOUT) */}
        <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
               <LabeledText 
                  label='🎯 Target Financial Independence Age' 
                  value={profile.retirementAge} 
                  onChange={(val) => setProfile({ ...profile, retirementAge: val })} 
                  placeholder='e.g., 65' 
                />
                <div className="text-xs text-gray-500 mt-1">
                  Age when you plan to achieve financial independence and stop working
                </div>
            </div>
            
            <div className="bg-white p-3 rounded-lg border border-gray-300 flex flex-col justify-center opacity-80">
               <div className="text-xs font-bold text-gray-500 uppercase mb-1">Employment Salary (Post-FI)</div>
               <div className="text-xl font-bold text-gray-400 font-mono">SGD $0.00</div>
               <div className="text-[10px] text-gray-400 mt-1">
                  Base employment income stops automatically at age {profile.retirementAge || 65}
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* Expenses (Moved Above Investment Planning) */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 shadow-sm">
        <h3 className="mt-0 text-lg font-bold text-gray-800">💰 Monthly Expenses Breakdown</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Object.keys(expenses).map((key) => (
            <LabeledText
              key={key}
              label={key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              value={expenses[key]}
              onChange={(v) => setExpenses({ ...expenses, [key]: v })}
              placeholder='0'
            />
          ))}
        </div>
        <div className="mt-6">
           <div className="flex justify-between items-center mb-2">
             <h4 className="m-0 text-sm font-bold text-gray-700">➕ Custom Expenses</h4>
             <button 
               onClick={() => setCustomExpenses([...customExpenses, { id: Date.now(), name: '', amount: '' }])}
               className="px-3 py-1.5 bg-indigo-500 text-white text-xs rounded-md hover:bg-indigo-600"
             >
               + Add Custom Expense
             </button>
           </div>
           {customExpenses && customExpenses.length > 0 && (
             <div className="grid gap-3">
                {customExpenses.map((exp) => (
                  <div key={exp.id} className="grid grid-cols-[2fr_1fr_auto] gap-3 items-end">
                    <LabeledText label="Expense Name" value={exp.name} onChange={(v) => setCustomExpenses(customExpenses.map(e => e.id === exp.id ? {...e, name: v} : e))} placeholder="e.g. Pet Care" />
                    <LabeledText label="Amount (SGD)" value={exp.amount} onChange={(v) => setCustomExpenses(customExpenses.map(e => e.id === exp.id ? {...e, amount: v} : e))} placeholder="0" />
                    <button onClick={() => setCustomExpenses(customExpenses.filter(e => e.id !== exp.id))} className="mb-2 px-3 py-2.5 bg-red-500 text-white text-xs rounded">Remove</button>
                  </div>
                ))}
             </div>
           )}
        </div>
        <div className="mt-4 p-4 bg-gray-100 rounded-lg flex justify-between items-center">
          <span className="font-bold text-gray-700">Total Monthly Expenses:</span>
          <span className="text-xl font-bold text-indigo-600">{fmtSGD(totalMonthlyExpenses)}</span>
        </div>
      </div>

      {/* Investment Planning - Accumulation Phase */}
      {age > 0 && (cpfData?.takeHome || profile.takeHome) && (
         <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 shadow-sm">
            <h3 className="mt-0 text-lg font-bold text-gray-800 mb-2">📊 Investment Planning & Accumulation</h3>
            <p className="text-sm text-gray-500 mb-4">Determine your monthly investment capacity and visualize potential growth</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
               <LabeledText label="Conservative (%)" value={rate1} onChange={(v) => setRate1(toNum(v))} type="number" placeholder="0.05" />
               <LabeledText label="Moderate (%)" value={rate2} onChange={(v) => setRate2(toNum(v))} type="number" placeholder="6" />
               <LabeledText label="Growth (%)" value={rate3} onChange={(v) => setRate3(toNum(v))} type="number" placeholder="12" />
            </div>

            <div className="mb-4 p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border-2 border-blue-400">
               <div className="flex flex-wrap gap-4 items-center">
                  <div className="flex-1 min-w-[200px]">
                     <LabeledText 
                        label="💰 Monthly Investment Amount (SGD)" 
                        value={profile.monthlyInvestmentAmount || ''} 
                        onChange={(val) => setProfile({ ...profile, monthlyInvestmentAmount: val })} 
                        placeholder={cashflowData ? fmtSGD(cashflowData.monthlySavings) : '0'} 
                     />
                     <div className="text-[10px] text-blue-800 mt-1">
                        {cashflowData ? `Your current monthly savings: ${fmtSGD(cashflowData.monthlySavings)}` : 'Enter amount'}
                     </div>
                     
                     {/* Quick Preset Buttons */}
                     <div className="flex gap-1.5 flex-wrap mt-2 items-center">
                        <div className="text-[10px] text-blue-800 mr-1">Quick:</div>
                        {[500, 1000, 2000, 3000, 5000].map(v => (
                           <button 
                              key={v} 
                              onClick={() => setProfile({ ...profile, monthlyInvestmentAmount: String(v) })}
                              className={`px-2 py-1 rounded text-[10px] font-bold border border-blue-400 ${toNum(profile.monthlyInvestmentAmount) === v ? 'bg-blue-500 text-white' : 'bg-white text-blue-800'}`}
                           >
                              ${v}
                           </button>
                        ))}
                        {cashflowData && cashflowData.monthlySavings > 0 && (
                           <button 
                              onClick={() => setProfile({ ...profile, monthlyInvestmentAmount: '' })}
                              className="px-2 py-1 rounded text-[10px] font-bold border border-blue-400 bg-white text-blue-800"
                           >
                              Reset
                           </button>
                        )}
                     </div>
                  </div>
                  
                  {toNum(profile.monthlyInvestmentAmount) > 0 && (
                     <div className="p-4 bg-white rounded-lg border-2 border-blue-400 min-w-[150px]">
                        <div className="text-[10px] font-bold text-blue-800 mb-1">Monthly Investment</div>
                        <div className="text-xl font-bold text-blue-600">{fmtSGD(profile.monthlyInvestmentAmount)}</div>
                     </div>
                  )}
               </div>

               {/* Investment Scenarios Comparison - Moved INSIDE the blue box */}
               <div className="mt-4 p-3 bg-white/80 rounded-lg border border-blue-200">
                  <div className="text-xs font-bold text-gray-700 mb-2">💡 Investment Scenarios Comparison</div>
                  <div className="grid gap-2">
                     {(() => {
                        const monthly = toNum(profile.monthlyInvestmentAmount) || (cashflowData?.monthlySavings || 0);
                        const m = yearsToRetirement * 12;
                        
                        const scenarios = [
                           { label: 'Conservative', rate: rate1, color: '#000000', bg: 'bg-white' },
                           { label: 'Moderate', rate: rate2, color: '#92400e', bg: 'bg-white' },
                           { label: 'Growth', rate: rate3, color: '#10b981', bg: 'bg-emerald-50' }
                        ];
                        
                        const results = scenarios.map(s => {
                           const r = s.rate / 100 / 12;
                           const fv = monthly * ((Math.pow(1 + r, m) - 1) / r);
                           return { ...s, fv };
                        });
                        
                        const maxVal = Math.max(...results.map(r => r.fv));

                        return results.map(res => (
                           <div key={res.label} className={`p-2 rounded border ${res.fv === maxVal ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white'} flex justify-between items-center`}>
                              <div>
                                 <div className="text-xs font-bold text-gray-700">
                                    {res.label} ({res.rate}%)
                                    {res.fv === maxVal && <span className="ml-2 text-emerald-600 text-[10px]">🏆 Best Growth</span>}
                                 </div>
                                 <div className="text-[10px] text-gray-500">{fmtSGD(monthly)}/m for {yearsToRetirement} years</div>
                              </div>
                              <div className="text-sm font-bold" style={{ color: res.color }}>{fmtSGD(res.fv)}</div>
                           </div>
                        ));
                     })()}
                  </div>
               </div>
            </div>

            {/* Financial Planning Insights - Moved here from Retirement Journey Section */}
            {retirementNestEgg > 0 && (
              <div className="mb-5 p-4 bg-indigo-50 border-2 border-indigo-400 rounded-xl shadow-sm">
                <div className="text-xs font-bold text-indigo-800 mb-2">💡 Financial Planning Insights:</div>
                <div className="text-xs text-indigo-700 space-y-1.5 leading-relaxed">
                  <p>• <strong>Wealth Building Phase:</strong> You have {toNum(profile.retirementAge, 65) - Math.round(age)} years to save. Compound interest works best here.</p>
                  <p>• <strong>Retirement Duration:</strong> Your money needs to last {retirementYears} years. Plan for {fmtSGD(futureMonthlyRetirementExpenses)}/month.</p>
                  <p>• <strong>Required Nest Egg:</strong> Target {fmtSGD(retirementNestEgg)} by age {toNum(profile.retirementAge, 65)}.</p>
                </div>
              </div>
            )}
            
            {/* Chart Section (Accumulation) */}
            {(() => {
               const monthly = toNum(profile.monthlyInvestmentAmount) || (cashflowData?.monthlySavings || 0);
               if (monthly <= 0) return null;
               
               const data = [];
               for (let y=0; y<=yearsToRetirement + 5; y++) {
                  const m = y*12;
                  const calc = (r: number) => monthly * ((Math.pow(1+r/100/12, m)-1)/(r/100/12));
                  data.push({
                     age: `Age ${Math.round(age+y)}`,
                     con: calc(rate1),
                     mod: calc(rate2),
                     gro: calc(rate3)
                  });
               }

               const target = toNum(customInvestmentTarget);

               return (
                  <>
                     {/* Custom Target Input & Logic */}
                     <div className="mb-5 p-4 bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg border-2 border-amber-400">
                        <div className="flex flex-wrap gap-4 items-center mb-3">
                           <div className="flex-1">
                              <LabeledText label="🎯 Target Portfolio Goal (SGD)" value={customInvestmentTarget} onChange={setCustomInvestmentTarget} placeholder="100000" />
                              <div className="text-[10px] text-amber-800 mt-1">See when you'll achieve this goal</div>
                           </div>
                           <div className="flex gap-1.5 items-center self-end pb-3">
                              <span className="text-[10px] text-amber-800 font-bold">Quick:</span>
                              {[50000, 100000, 250000, 500000, 1000000].map(v => (
                                 <button key={v} onClick={() => setCustomInvestmentTarget(String(v))} className={`px-2 py-1 border border-amber-400 rounded text-[10px] font-bold ${toNum(customInvestmentTarget)===v ? 'bg-amber-500 text-white' : 'bg-white text-amber-800'}`}>
                                    ${v>=1000000 ? v/1000000+'M' : v/1000+'k'}
                                 </button>
                              ))}
                           </div>
                        </div>
                     </div>

                     <div className="mb-5 bg-white rounded-lg border border-gray-200 p-4">
                        <div className="text-sm font-bold text-gray-700 mb-4">📈 Investment Growth Over Time (Starting Age: {Math.round(age)})</div>
                        
                        {/* Time to Reach Target Summary */}
                        {target > 0 && (
                           <div className="mb-4 p-3 bg-amber-50 rounded border border-amber-300">
                              <div className="text-xs font-bold text-amber-900 mb-2 flex items-center gap-2"><span className="text-sm">🎯</span> Time to Reach {fmtSGD(target)}</div>
                              <div className="grid grid-cols-3 gap-2">
                                 {[
                                    { l: 'Con', v: data.findIndex(d=>d.con>=target), c: '#000000' },
                                    { l: 'Mod', v: data.findIndex(d=>d.mod>=target), c: '#92400e' },
                                    { l: 'Gro', v: data.findIndex(d=>d.gro>=target), c: '#10b981' }
                                 ].map(x => (
                                    <div key={x.l} className="p-2 bg-white rounded border text-center">
                                       <div className="text-[10px] font-bold" style={{color:x.c}}>{x.l}</div>
                                       <div className="text-sm font-bold">{x.v > 0 ? `${x.v} yrs` : '-'}</div>
                                    </div>
                                 ))}
                              </div>
                           </div>
                        )}
                        
                        <LineChart 
                           xLabels={data.map(d => d.age)}
                           series={[
                              { name: `Conservative (${rate1}%)`, values: data.map(d => d.con), stroke: '#000000' },
                              { name: `Moderate (${rate2}%)`, values: data.map(d => d.mod), stroke: '#92400e' },
                              { name: `Growth (${rate3}%)`, values: data.map(d => d.gro), stroke: '#10b981' }
                           ]}
                           height={320}
                           onFormatY={(v) => v>=1000000 ? `$${(v/1000000).toFixed(1)}M` : `$${(v/1000).toFixed(0)}k`}
                           onFormatX={(v,i) => i===0 || i===data.length-1 || i%5===0 ? v : ''}
                        />
                        <div className="text-[10px] text-gray-500 text-center mt-2">Based on monthly investment of {fmtSGD(monthly)}</div>
                     </div>

                     {/* Milestone Cards (Vertical) */}
                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[
                           { l: `Conservative (${rate1}%)`, v: data, k: 'con', c: '#000000' },
                           { l: `Moderate (${rate2}%)`, v: data, k: 'mod', c: '#92400e' },
                           { l: `Growth (${rate3}%)`, v: data, k: 'gro', c: '#10b981' }
                        ].map(s => (
                           <div key={s.k} className="p-4 bg-white rounded-lg border-2 shadow-sm" style={{borderColor: s.c}}>
                              <div className="text-xs font-bold uppercase mb-3" style={{color: s.c}}>{s.l}</div>
                              <div className="space-y-2">
                                 {[100000, 250000, 500000, 1000000].map(milestone => {
                                    const idx = s.v.findIndex((d: any) => d[s.k] >= milestone);
                                    if(idx === -1) return null;
                                    const isCustom = milestone === target;
                                    return (
                                       <div key={milestone} className={`flex justify-between items-center p-2 rounded ${isCustom ? 'bg-amber-100 border border-amber-300' : 'bg-gray-50'}`}>
                                          <div>
                                             <div className="text-[10px] font-bold text-gray-700">
                                                {milestone>=1000000 ? `$${milestone/1000000}M` : `$${milestone/1000}k`}
                                                {isCustom && <span className="ml-1 text-[9px] bg-amber-500 text-white px-1 rounded">GOAL</span>}
                                             </div>
                                             <div className="text-[9px] text-gray-500">Age {Math.round(age+idx)}</div>
                                          </div>
                                          <div className="text-xs font-bold" style={{color:s.c}}>{idx} yrs</div>
                                       </div>
                                    );
                                 })}
                              </div>
                              <div className="mt-3 pt-3 border-t border-gray-100 text-[10px] text-gray-500">
                                 Final Value: <span className="font-bold" style={{color:s.c}}>{fmtSGD(s.v[s.v.length-1][s.k])}</span>
                              </div>
                           </div>
                        ))}
                     </div>
                     
                     {/* Key Insights Box */}
                     <div className="mt-5 p-4 bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-400 rounded-lg">
                        <div className="text-xs font-bold text-amber-900 mb-2">💡 Key Insights from Your Scenarios:</div>
                        <div className="text-xs text-amber-800 leading-relaxed space-y-1.5">
                           <p>• <strong>Return Impact:</strong> The difference between conservative ({rate1}%) and aggressive ({rate3}%) investing is <strong>{fmtSGD(data[data.length-1].gro - data[data.length-1].con)}</strong> — that's {((data[data.length-1].gro - data[data.length-1].con)/data[data.length-1].con*100).toFixed(0)}% more wealth!</p>
                           <p>• <strong>Time Advantage:</strong> Starting at age {Math.round(age)}, you have {yearsToRetirement} years for compound growth.</p>
                        </div>
                     </div>
                  </>
               );
            })()}
         </div>
      )}

      {/* Retirement Expense Planning */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 shadow-sm">
        <h3 className="mt-0 text-lg font-bold text-gray-800 mb-4">🌅 Retirement Expense Planning</h3>
        
        {/* Visual Retirement Journey Chart */}
        {age > 0 && retirementNestEgg > 0 && (
          <>
            <div className="mb-5 p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border-2 border-blue-500 shadow-sm">
              <h4 className="m-0 text-blue-800 text-lg font-bold mb-2 flex items-center gap-2">
                <span className="text-2xl">📊</span> Your Wealth Building & Retirement Journey
              </h4>
              <p className="m-0 mb-4 text-blue-600 text-sm">
                Visual timeline from age {Math.round(age)} to {lifeExpectancy}: See exactly when you're building wealth vs living off it
              </p>

              {/* Phase Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                 {/* Accumulation Phase Card */}
                 <div className="p-5 bg-emerald-100 rounded-xl border-2 border-emerald-500 relative overflow-hidden">
                   <div className="text-3xl mb-2">💼</div>
                   <div className="text-xs font-bold text-emerald-800 uppercase mb-1 tracking-wider">WEALTH BUILDING PHASE</div>
                   <div className="text-xl font-bold text-emerald-900 mb-2">Age {Math.round(age)} → {toNum(profile.retirementAge, 65)}</div>
                   <div className="text-sm text-emerald-800 mb-3">Working, saving, investing - growing your nest egg</div>
                   <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/80 rounded-md">
                     <span className="text-xs font-bold text-emerald-800">Duration:</span>
                     <span className="text-base font-bold text-emerald-600">{toNum(profile.retirementAge, 65) - Math.round(age)} years</span>
                   </div>
                 </div>

                 {/* Drawdown Phase Card */}
                 <div className="p-5 bg-amber-100 rounded-xl border-2 border-amber-500 relative overflow-hidden">
                   <div className="text-3xl mb-2">🏖️</div>
                   <div className="text-xs font-bold text-amber-800 uppercase mb-1 tracking-wider">LIVING OFF WEALTH PHASE</div>
                   <div className="text-xl font-bold text-amber-900 mb-2">Age {toNum(profile.retirementAge, 65)} → {lifeExpectancy}</div>
                   <div className="text-sm text-amber-800 mb-3">Retired, withdrawing from savings and investments</div>
                   <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/80 rounded-md">
                     <span className="text-xs font-bold text-amber-800">Duration:</span>
                     <span className="text-base font-bold text-amber-600">{retirementYears} years</span>
                   </div>
                 </div>
              </div>
              
              {/* Visual Timeline Bar */}
              <div className="mb-6">
                 <div className="text-xs font-bold text-blue-800 mb-3">📅 Life Timeline Visualization</div>
                 <div className="relative h-20 bg-gray-100 rounded-lg overflow-hidden border-2 border-gray-200 flex">
                    <div 
                      style={{ width: `${((toNum(profile.retirementAge, 65) - age) / (lifeExpectancy - age)) * 100}%` }} 
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-sm border-r-2 border-white"
                    >
                      💼 BUILDING
                    </div>
                    <div className="flex-1 h-full bg-gradient-to-r from-amber-400 to-amber-600 flex items-center justify-center text-white font-bold text-sm">
                      🏖️ LIVING
                    </div>
                 </div>
              </div>

              {/* Detailed Timeline Breakdown */}
              <div className="bg-white p-4 rounded-xl border border-gray-200">
                <div className="text-sm font-bold text-gray-700 mb-3">📋 Detailed Age Breakdown</div>
                <div className="grid gap-3">
                  <div className="flex items-center gap-3 p-3 bg-emerald-50 border-2 border-emerald-500 rounded-lg">
                    <div className="text-2xl">👤</div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-emerald-800">Current Age</div>
                      <div className="text-[10px] text-emerald-800">You are here now</div>
                    </div>
                    <div className="text-xl font-bold text-emerald-600">{Math.round(age)}</div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-red-50 border-2 border-red-500 rounded-lg">
                    <div className="text-2xl">🎯</div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-red-800">Financial Independence</div>
                      <div className="text-[10px] text-red-800">Stop working, start living</div>
                    </div>
                    <div className="text-xl font-bold text-red-600">{toNum(profile.retirementAge, 65)}</div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-amber-50 border-2 border-amber-500 rounded-lg">
                    <div className="text-2xl">🌅</div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-amber-800">Life Expectancy</div>
                      <div className="text-[10px] text-amber-800">Plan savings to last until here</div>
                    </div>
                    <div className="text-xl font-bold text-amber-600">{lifeExpectancy}</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Quick Adjustments */}
        <div className="mb-4">
          <div className="text-sm font-bold text-gray-700 mb-3">📊 Current Monthly Expenses: {fmtSGD(totalMonthlyExpenses)}</div>
          <div className="mb-4">
             <div className="text-xs font-bold text-gray-500 mb-2">Quick Adjustments:</div>
             <div className="flex flex-wrap gap-2">
               <button onClick={() => setProfile({ ...profile, customRetirementExpense: (totalMonthlyExpenses * 0.5).toFixed(2) })} className="px-3 py-2 bg-emerald-500 text-white text-xs font-bold rounded hover:bg-emerald-600 shadow-sm transition-colors">-50% ({fmtSGD(totalMonthlyExpenses * 0.5)})</button>
               <button onClick={() => setProfile({ ...profile, customRetirementExpense: (totalMonthlyExpenses * 0.75).toFixed(2) })} className="px-3 py-2 bg-emerald-500 text-white text-xs font-bold rounded hover:bg-emerald-600 shadow-sm transition-colors">-25% ({fmtSGD(totalMonthlyExpenses * 0.75)})</button>
               <button onClick={() => setProfile({ ...profile, customRetirementExpense: totalMonthlyExpenses.toFixed(2) })} className="px-3 py-2 bg-blue-500 text-white text-xs font-bold rounded hover:bg-blue-600 shadow-sm transition-colors">Same ({fmtSGD(totalMonthlyExpenses)})</button>
               <button onClick={() => setProfile({ ...profile, customRetirementExpense: (totalMonthlyExpenses * 1.25).toFixed(2) })} className="px-3 py-2 bg-amber-500 text-white text-xs font-bold rounded hover:bg-amber-600 shadow-sm transition-colors">+25% ({fmtSGD(totalMonthlyExpenses * 1.25)})</button>
               <button onClick={() => setProfile({ ...profile, customRetirementExpense: (totalMonthlyExpenses * 1.5).toFixed(2) })} className="px-3 py-2 bg-amber-500 text-white text-xs font-bold rounded hover:bg-amber-600 shadow-sm transition-colors">+50% ({fmtSGD(totalMonthlyExpenses * 1.5)})</button>
             </div>
          </div>
          
          <div className="max-w-md">
             <LabeledText
              label='💰 Custom Retirement Monthly Expense (Before Inflation)'
              value={profile.customRetirementExpense || ''}
              onChange={(val) => setProfile({ ...profile, customRetirementExpense: val })}
              placeholder={`Default: ${fmtSGD(monthlyRetirementExpenses)}`}
            />
             <div className="text-[10px] text-gray-500 mt-1 mb-4">
               💡 Enter your expected monthly expenses in retirement (today's dollars). We'll automatically adjust for inflation over {yearsToRetirement} years.
             </div>
          </div>

          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-900">
             <div className="font-bold text-xs mb-1">📝 Retirement Calculation Using:</div>
             <div>Today's Monthly Expense: <strong>{fmtSGD(monthlyRetirementExpenses)}</strong></div>
             <div className="mt-1 text-red-700 font-bold">
               After {yearsToRetirement} years @ 3% inflation: {fmtSGD(futureMonthlyRetirementExpenses)}/month
             </div>
          </div>
        </div>
      </div>

      {/* Complete Financial Blueprint */}
      {retirementNestEgg > 0 && (
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-500 rounded-xl p-6 mb-5 shadow-sm">
           <h3 className="m-0 text-amber-900 text-xl font-bold mb-4">🎯 Your Complete Financial Blueprint</h3>
           
           <div className="mb-3 p-3 bg-white/70 rounded-lg">
              <div className="text-xs text-amber-900 font-bold">📊 Retirement Expense Calculation:</div>
              <div className="text-xs text-amber-900 mt-1">
                 Using {profile.customRetirementExpense ? 'custom' : 'calculated'} base: <strong>{fmtSGD(monthlyRetirementExpenses)}/month</strong>
              </div>
           </div>

           <div className="bg-emerald-500/10 p-4 rounded-lg border border-emerald-500/20 mb-4">
              <div className="text-sm font-bold text-emerald-800 mb-1">🌅 Retirement Nest Egg Target</div>
              <div className="text-3xl font-bold text-emerald-900">{fmtSGD(retirementNestEgg)}</div>
              <div className="text-xs text-emerald-700 mt-2">
                 {fmtSGD(futureMonthlyRetirementExpenses)}/month × {retirementYears} years
              </div>
              <div className="text-[10px] text-emerald-800 mt-3 leading-relaxed opacity-90">
                 From age {toNum(profile.retirementAge, 65)} to {lifeExpectancy} (life expectancy for {profile.gender} in SG)
              </div>
           </div>

           <div className="bg-white p-5 rounded-lg border-2 border-emerald-500 text-center">
              <div className="text-base font-bold text-emerald-800 mb-2">💎 TOTAL RETIREMENT GOAL</div>
              <div className="text-4xl font-extrabold text-emerald-600 mb-3">{fmtSGD(retirementNestEgg)}</div>
              <div className="text-xs text-emerald-800 mb-4">
                 This covers {retirementYears} years from age {toNum(profile.retirementAge, 65)} to {lifeExpectancy} at {fmtSGD(futureMonthlyRetirementExpenses)}/month
              </div>
              <div className="p-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg text-white">
                 <div className="text-sm opacity-90 mb-2">To reach this goal, invest approximately:</div>
                 <div className="text-3xl font-bold mb-2">
                   {fmtSGD(requiredMonthlyInvestment)}/month
                 </div>
                 <div className="text-xs opacity-90">at 8% annual returns over {yearsToRetirement} years</div>
              </div>
           </div>
        </div>
      )}

      {/* CPF Shortfall Reality Check */}
      {age > 0 && yearsToRetirement > 0 && (
        <div className="bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-500 rounded-xl p-6 mb-5">
           <div className="text-center mb-5">
             <div className="text-4xl mb-3">⚠️</div>
             <h3 className="text-xl font-bold text-red-900 m-0">
               {profile.name || 'Your'} Reality: Why CPF Alone Won't Be Enough
             </h3>
           </div>
           
           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div className="bg-white/60 p-4 rounded-lg">
                 <div className="text-2xl font-bold text-red-900 mb-1">$1,379</div>
                 <div className="text-xs text-red-800 leading-tight"><strong>Average CPF Life payout</strong> per month. Can you live comfortably on this?</div>
              </div>
              <div className="bg-white/60 p-4 rounded-lg">
                 <div className="text-2xl font-bold text-red-900 mb-1">3%</div>
                 <div className="text-xs text-red-800 leading-tight"><strong>Annual inflation.</strong> Your savings lose value every year.</div>
              </div>
              <div className="bg-red-200/50 p-4 rounded-lg">
                 <div className="text-2xl font-bold text-red-900 mb-1">{fmtSGD(futureMonthlyRetirementExpenses).replace('SGD ', '$')}</div>
                 <div className="text-xs text-red-800 leading-tight"><strong>What YOUR lifestyle will cost</strong> at retirement in {yearsToRetirement} years!</div>
              </div>
           </div>
        </div>
      )}

      {/* Detailed Coffee Example (Retirement Income Strategy) */}
      {age > 0 && yearsToRetirement > 0 && (
         <div className="bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-500 rounded-xl p-6 mb-5">
            <div className="flex items-start gap-3">
               <div className="text-3xl">💡</div>
               <div className="flex-1">
                  <h4 className="m-0 text-amber-900 text-lg font-bold mb-2">Your Retirement Income Strategy: Year {new Date().getFullYear() + yearsToRetirement}</h4>
                  <div className="text-sm text-amber-900 mb-4 leading-relaxed">
                     CPF Life provides a <strong>safety net</strong> with monthly payouts that escalate over time. 
                     The <strong>Escalating Plan</strong> starts at ~$1,379. But will it be enough?
                  </div>

                  {(() => {
                     // CPF Life Escalating Plan
                     const cpfLifeBaselineToday = 1379;
                     const cpfInflationAdjustment = 0.02; // 2% escalation
                     const cpfLifeFuture = cpfLifeBaselineToday * Math.pow(1 + cpfInflationAdjustment, yearsToRetirement);
                     const shortfall = Math.max(0, futureMonthlyRetirementExpenses - cpfLifeFuture);
                     const retirementYearsCalc = Math.max(10, lifeExpectancy - toNum(profile.retirementAge, 65));
                     const totalSupplementaryNeeded = shortfall * 12 * retirementYearsCalc;
                     
                     return (
                        <div className="grid gap-3">
                           {/* Current Lifestyle */}
                           <div className="p-4 bg-white rounded-lg border-2 border-blue-500 flex justify-between items-center">
                              <div>
                                 <div className="font-bold text-blue-900 text-xs mb-1">📊 Your Lifestyle Today</div>
                                 <div className="text-[10px] text-blue-600">Monthly expenses in today's dollars</div>
                              </div>
                              <div className="text-xl font-bold text-blue-600">{fmtSGD(monthlyRetirementExpenses)}/m</div>
                           </div>

                           {/* Future Needs */}
                           <div className="p-4 bg-white rounded-lg border-2 border-amber-500 flex justify-between items-center">
                              <div>
                                 <div className="font-bold text-amber-900 text-xs mb-1">💰 Same Lifestyle at Retirement</div>
                                 <div className="text-[10px] text-amber-600">After {yearsToRetirement} years of 3% inflation</div>
                              </div>
                              <div className="text-xl font-bold text-amber-600">{fmtSGD(futureMonthlyRetirementExpenses)}/m</div>
                           </div>

                           {/* Income Breakdown */}
                           <div className="p-5 bg-white rounded-lg border-2 border-emerald-500">
                              <div className="text-sm font-bold text-emerald-800 mb-3">🏛️ Your Retirement Income Sources:</div>
                              
                              {/* CPF Life */}
                              <div className="flex justify-between items-center mb-2 p-3 bg-emerald-50 rounded-lg">
                                 <div>
                                    <div className="text-xs font-bold text-emerald-800">✅ CPF Life - Escalating Plan</div>
                                    <div className="text-[10px] text-emerald-600">Starts at $1,379, grows ~2% yearly</div>
                                 </div>
                                 <div className="text-right">
                                    <div className="text-lg font-bold text-emerald-600">{fmtSGD(cpfLifeFuture)}</div>
                                    <div className="text-[10px] text-emerald-600">at age {toNum(profile.retirementAge, 65)}</div>
                                 </div>
                              </div>

                              {/* The Gap */}
                              {shortfall > 0 && (
                                 <div className="flex justify-between items-center mb-2 p-3 bg-amber-50 rounded-lg">
                                    <div>
                                       <div className="text-xs font-bold text-amber-900">⚠️ Lifestyle Gap (The Problem)</div>
                                       <div className="text-[10px] text-amber-600">CPF grows 2%, but inflation is 3%</div>
                                    </div>
                                    <div className="text-lg font-bold text-amber-600">{fmtSGD(shortfall)}</div>
                                 </div>
                              )}

                              {/* Supplementary Needed */}
                              {shortfall > 0 && (
                                 <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                                    <div>
                                       <div className="text-xs font-bold text-blue-900">🎯 Your Investments (Solution)</div>
                                       <div className="text-[10px] text-blue-600">To maintain your lifestyle</div>
                                    </div>
                                    <div className="text-lg font-bold text-blue-600">{fmtSGD(shortfall)}</div>
                                 </div>
                              )}

                              {/* Total */}
                              <div className="mt-3 p-4 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-lg flex justify-between items-center text-white">
                                 <div className="text-sm font-bold">💎 Total Monthly Income Needed</div>
                                 <div className="text-2xl font-extrabold">{fmtSGD(futureMonthlyRetirementExpenses)}</div>
                              </div>
                           </div>

                           {/* Key Insight */}
                           {shortfall > 0 && (
                              <div className="p-4 bg-emerald-500/10 border border-emerald-500 rounded-lg text-xs text-emerald-900 leading-relaxed">
                                 💡 <strong>The Reality:</strong> CPF Life escalates at ~2% yearly, but actual inflation averages 3%. 
                                 This 1% gap compounds over time! By age {toNum(profile.retirementAge, 65)}, CPF Life will provide 
                                 <strong> {fmtSGD(cpfLifeFuture)}</strong> leaving a <strong>{fmtSGD(shortfall)}/month</strong> gap. 
                                 You'll need <strong>{fmtSGD(totalSupplementaryNeeded)}</strong> in supplementary investments.
                              </div>
                           )}
                        </div>
                     );
                  })()}
               </div>
            </div>
         </div>
      )}

      {/* Early Investment Impact */}
      {age > 0 && yearsToRetirement > 0 && cashflowData && cashflowData.monthlySavings > 0 && (
         <div className="bg-gradient-to-br from-emerald-100 to-emerald-200 border-2 border-emerald-500 rounded-xl p-6 mb-5">
            <div className="flex items-start gap-3">
               <div className="text-3xl">⏰</div>
               <div className="flex-1">
                  <h4 className="m-0 text-emerald-900 text-lg font-bold mb-2">The Power of Starting Early</h4>
                  <div className="text-sm text-emerald-800 mb-4 leading-relaxed">
                     See the dramatic difference between investing NOW versus waiting 5 or 10 years. 
                     Every year you delay costs you tens of thousands in lost compound growth!
                  </div>

                  {(() => {
                     const monthly = cashflowData.monthlySavings;
                     const r = 0.12 / 12;
                     const calcFV = (years: number) => monthly * ((Math.pow(1 + r, years * 12) - 1) / r);
                     
                     const fvNow = calcFV(yearsToRetirement);
                     const fvLater5 = yearsToRetirement > 5 ? calcFV(yearsToRetirement - 5) : 0;
                     const fvLater10 = yearsToRetirement > 10 ? calcFV(yearsToRetirement - 10) : 0;
                     
                     const loss5 = fvNow - fvLater5;
                     const loss10 = fvNow - fvLater10;

                     return (
                        <div className="grid gap-3">
                           <div className="bg-white p-4 rounded-lg border-[3px] border-emerald-500 shadow-sm flex justify-between items-center">
                              <div>
                                 <div className="text-emerald-600 font-bold text-sm mb-1">✅ START NOW (Age {age})</div>
                                 <div className="text-xs text-emerald-800">Invest {fmtSGD(monthly)}/month for {yearsToRetirement} years @ 12%</div>
                              </div>
                              <div className="text-right">
                                 <div className="text-2xl font-extrabold text-emerald-600">{fmtSGD(fvNow)}</div>
                                 <div className="text-xs font-bold text-emerald-700">🏆 BEST OUTCOME</div>
                              </div>
                           </div>

                           {yearsToRetirement > 5 && (
                              <div className="bg-white p-4 rounded-lg border-2 border-amber-500 flex justify-between items-center">
                                 <div>
                                    <div className="text-amber-600 font-bold text-sm mb-1">⚠️ START IN 5 YEARS (Age {age + 5})</div>
                                    <div className="text-xs text-amber-900">Invest {fmtSGD(monthly)}/month for {yearsToRetirement - 5} years</div>
                                 </div>
                                 <div className="text-right">
                                    <div className="text-xl font-bold text-amber-600">{fmtSGD(fvLater5)}</div>
                                    <div className="text-[11px] font-bold text-red-600 mt-1">Lost: {fmtSGD(loss5)} 💸</div>
                                 </div>
                              </div>
                           )}

                           {yearsToRetirement > 10 && (
                              <div className="bg-white p-4 rounded-lg border-2 border-red-500 flex justify-between items-center">
                                 <div>
                                    <div className="text-red-600 font-bold text-sm mb-1">🚨 START IN 10 YEARS (Age {age + 10})</div>
                                    <div className="text-xs text-red-900">Invest {fmtSGD(monthly)}/month for {yearsToRetirement - 10} years</div>
                                 </div>
                                 <div className="text-right">
                                    <div className="text-xl font-bold text-red-600">{fmtSGD(fvLater10)}</div>
                                    <div className="text-[11px] font-bold text-red-600 mt-1">Lost: {fmtSGD(loss10)} 💸💸</div>
                                 </div>
                              </div>
                           )}
                        </div>
                     );
                  })()}
                  
                  <div className="mt-4 p-3 bg-emerald-500/20 rounded-lg text-center text-emerald-900 font-bold text-sm">
                     💚 The choice is yours: Start Today or Lose Hundreds of Thousands Tomorrow?
                  </div>
               </div>
            </div>
         </div>
      )}

      {/* Complete Financial Picture with Children */}
      {totalChildrenEducationCost > 0 && (
         <div className="bg-gradient-to-br from-purple-100 to-purple-200 border-2 border-purple-500 rounded-xl p-6 mb-5">
            <div className="text-center mb-5">
               <div className="text-4xl mb-3">💰</div>
               <h3 className="text-purple-900 text-xl font-bold m-0">Your Complete Financial Picture</h3>
            </div>
            <div className="bg-white p-5 rounded-lg border-2 border-purple-400">
               <div className="mb-4">
                  <div className="text-sm font-bold text-purple-900 mb-2">📊 Total Financial Goals (Inflation-Adjusted):</div>
                  <div className="grid gap-3">
                     <div className="bg-purple-50 p-3 rounded-lg flex justify-between items-center">
                        <span className="text-sm text-purple-900">🌅 Retirement Nest Egg</span>
                        <span className="text-base font-bold text-purple-900">{fmtSGD(retirementNestEgg)}</span>
                     </div>
                     <div className="bg-purple-50 p-3 rounded-lg flex justify-between items-center">
                        <span className="text-sm text-purple-900">🎓 Children's Education ({profile.children?.length} children)</span>
                        <span className="text-base font-bold text-purple-900">{fmtSGD(totalChildrenEducationCost)}</span>
                     </div>
                     <div className="bg-gradient-to-br from-purple-600 to-indigo-600 p-4 rounded-lg flex justify-between items-center mt-2 text-white">
                        <span className="font-bold text-sm">💎 TOTAL FINANCIAL GOAL</span>
                        <span className="text-2xl font-bold">{fmtSGD(retirementNestEgg + totalChildrenEducationCost)}</span>
                     </div>
                  </div>
               </div>
               <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                  <div className="text-xs font-bold text-amber-900 mb-1">💡 Smart Investment Strategy:</div>
                  <div className="text-xs text-amber-900 leading-relaxed">
                     To reach your combined goal of <strong>{fmtSGD(retirementNestEgg + totalChildrenEducationCost)}</strong>, 
                     consider investing approximately <strong>{fmtSGD((retirementNestEgg + totalChildrenEducationCost) / Math.max(1, yearsToRetirement * 12))}/month</strong> at 
                     8% annual returns.
                  </div>
               </div>
            </div>
         </div>
      )}

      {/* Actual Retirement Age with Children */}
      {totalChildrenEducationCost > 0 && profile.children && profile.children.length > 0 && (
         <div className="bg-gradient-to-br from-sky-100 to-sky-200 border-2 border-sky-500 rounded-xl p-6">
            <div className="flex items-start gap-3 mb-3">
               <div className="text-3xl">🗓️</div>
               <div className="flex-1">
                  <h4 className="m-0 text-sky-900 text-lg font-bold">Your Actual Retirement Timeline with Children</h4>
               </div>
            </div>
            
            {(() => {
               const currentYear = new Date().getFullYear();
               let latestRetirement = { year: 0, age: 0, childName: '' };
               
               const durUni = profile.educationSettings ? toNum(profile.educationSettings.universityDuration, 4) : 4;

               profile.children.forEach(child => {
                  if (!child.dobISO) return;
                  const childDob = parseDob(child.dobISO);
                  if (!childDob) return;
                  const ageInMonths = monthsSinceDob(childDob, currentYear, new Date().getMonth());
                  const currentAge = Math.floor(ageInMonths / 12);
                  
                  const uniStartAge = child.gender === 'male' ? 21 : 19;
                  const uniEndAge = uniStartAge + durUni;
                  
                  const uniEndYear = currentYear + (uniEndAge - currentAge);
                  const parentAgeAtUniEnd = age + (uniEndAge - currentAge);
                  
                  if (uniEndYear > latestRetirement.year) {
                     latestRetirement = { year: uniEndYear, age: parentAgeAtUniEnd, childName: child.name || 'Youngest' };
                  }
               });
               
               const standardRetirementAge = toNum(profile.retirementAge, 65);
               const delayedYears = Math.max(0, latestRetirement.age - standardRetirementAge);
               
               return (
                  <div className="text-sm text-sky-900 leading-relaxed space-y-3">
                     <div className="bg-white/70 p-3 rounded border border-sky-300">
                        📅 Standard Retirement Plan: <strong>Age {standardRetirementAge}</strong>
                     </div>
                     
                     <div className={`p-4 rounded-lg border-2 ${delayedYears > 0 ? 'bg-amber-50 border-amber-400' : 'bg-emerald-50 border-emerald-400'}`}>
                        <div className={`font-bold text-base mb-2 ${delayedYears > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
                           {delayedYears > 0 ? '⚠️' : '✅'} Your Realistic Retirement: Age {Math.round(latestRetirement.age)} ({latestRetirement.year})
                        </div>
                        <div className="text-xs mb-2 opacity-90">
                           {latestRetirement.childName} finishes university in {latestRetirement.year} when you'll be {Math.round(latestRetirement.age)} years old.
                        </div>
                        {delayedYears > 0 ? (
                           <div className="font-bold text-amber-900 text-xs">
                              ⏰ That's {Math.round(delayedYears)} years later than standard retirement! Plan your savings to last from Age {Math.round(latestRetirement.age)}.
                           </div>
                        ) : (
                           <div className="font-bold text-emerald-900 text-xs">
                              🎉 Great news! You can retire on schedule while supporting your children's education.
                           </div>
                        )}
                     </div>
                     
                     <div className="p-3 bg-sky-500/10 rounded text-xs italic text-sky-800">
                        💡 <strong>Pro Tip:</strong> Check the Children tab for a detailed timeline showing exactly when each education cost hits!
                     </div>
                  </div>
               );
            })()}
         </div>
      )}
    </div>
  );
};

export default ProfileTab;