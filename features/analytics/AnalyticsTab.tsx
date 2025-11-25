
import React, { useMemo, useState } from 'react';
import { Client } from '../../types';
import { toNum, fmtSGD, getAge } from '../../lib/helpers';
import { 
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Legend, Cell, PieChart, Pie
} from 'recharts';

interface AnalyticsTabProps {
  clients: Client[];
}

const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ clients }) => {
  const [activeView, setActiveView] = useState<'market_map' | 'opportunities'>('market_map');

  // --- 1. DATA PREPARATION & CALCULATIONS ---
  const analyzedData = useMemo(() => {
    const processed = clients.map(c => {
      const age = c.profile.dob ? getAge(c.profile.dob) : 30;
      const income = toNum(c.profile.monthlyIncome) || toNum(c.profile.grossSalary);
      const takeHome = toNum(c.profile.takeHome) || (income * 0.8);
      
      // Assets
      const cash = toNum(c.cashflowState?.currentSavings, 0);
      const investments = toNum(c.investorState?.portfolioValue, 0);
      const cpf = toNum(c.cpfState?.currentBalances?.oa, 0) + toNum(c.cpfState?.currentBalances?.sa, 0) + toNum(c.cpfState?.currentBalances?.ma, 0);
      const netWorth = cash + investments + cpf;

      // Protection
      const insurance = c.insuranceState || { currentDeath: 0, currentCI: 0 };
      const deathCov = toNum(insurance.currentDeath);
      const ciCov = toNum(insurance.currentCI);
      
      // Gaps
      const deathGap = (takeHome * 12 * 10) - deathCov; // 10x Income
      const ciGap = (takeHome * 12 * 5) - ciCov; // 5x Income
      
      return {
        id: c.id,
        name: c.profile.name,
        gender: c.profile.gender,
        age,
        income,
        netWorth,
        cash,
        investments,
        deathGap,
        ciGap,
        hasInvestment: investments > 10000,
        hasInsurance: deathCov > 100000
      };
    });

    // Sort by Net Worth for "Top Clients" analysis
    const sortedByValue = [...processed].sort((a, b) => b.netWorth - a.netWorth);
    const top20PercentCount = Math.max(1, Math.ceil(processed.length * 0.2));
    const topClients = sortedByValue.slice(0, top20PercentCount);

    return { all: processed, topClients };
  }, [clients]);

  // --- 2. IDEAL CLIENT PROFILE (ICP) GENERATOR ---
  const icp = useMemo(() => {
    if (analyzedData.topClients.length === 0) return null;

    const top = analyzedData.topClients;
    const avgAge = top.reduce((sum, c) => sum + c.age, 0) / top.length;
    const avgIncome = top.reduce((sum, c) => sum + c.income, 0) / top.length;
    const genderCount = top.reduce((acc, c) => { acc[c.gender || 'male']++; return acc; }, { male: 0, female: 0 } as any);
    const dominantGender = genderCount.male >= genderCount.female ? 'Male' : 'Female';

    // Strategy Suggestion
    let strategy = "Balanced Wealth Accumulation";
    if (avgAge > 50) strategy = "Retirement Income & Legacy Planning";
    if (avgAge < 35) strategy = "Aggressive Growth & Income Protection";
    if (avgIncome > 15000) strategy = "Tax Efficiency & Accredited Investment";

    return {
      ageRange: `${Math.floor(avgAge - 5)} - ${Math.floor(avgAge + 5)}`,
      incomeLevel: fmtSGD(avgIncome),
      gender: dominantGender,
      strategy
    };
  }, [analyzedData]);

  // --- 3. SEGMENTATION LOGIC ---
  const segments = useMemo(() => {
    const segs = {
      'Young Pro (<35)': { count: 0, aum: 0 },
      'Mid-Career (35-50)': { count: 0, aum: 0 },
      'Pre-Retiree (50-65)': { count: 0, aum: 0 },
      'Retiree (65+)': { count: 0, aum: 0 },
    };

    analyzedData.all.forEach(c => {
      if (c.age < 35) { segs['Young Pro (<35)'].count++; segs['Young Pro (<35)'].aum += c.netWorth; }
      else if (c.age <= 50) { segs['Mid-Career (35-50)'].count++; segs['Mid-Career (35-50)'].aum += c.netWorth; }
      else if (c.age <= 65) { segs['Pre-Retiree (50-65)'].count++; segs['Pre-Retiree (50-65)'].aum += c.netWorth; }
      else { segs['Retiree (65+)'].count++; segs['Retiree (65+)'].aum += c.netWorth; }
    });

    return Object.entries(segs).map(([name, data]) => ({ name, ...data }));
  }, [analyzedData]);

  // --- 4. CROSS-SELL MATRIX DATA ---
  const matrixData = useMemo(() => {
    const matrix = [
      { name: 'Only Insurance', value: 0, color: '#ef4444', desc: 'Needs Investment' }, // Has Ins, No Inv
      { name: 'Only Investment', value: 0, color: '#f59e0b', desc: 'Needs Protection' }, // No Ins, Has Inv
      { name: 'Fully Covered', value: 0, color: '#10b981', desc: 'Upsell / Review' }, // Has Both
      { name: 'Untapped', value: 0, color: '#6b7280', desc: 'Full Plan Needed' }, // Has Neither
    ];

    analyzedData.all.forEach(c => {
      if (c.hasInsurance && !c.hasInvestment) matrix[0].value++;
      else if (!c.hasInsurance && c.hasInvestment) matrix[1].value++;
      else if (c.hasInsurance && c.hasInvestment) matrix[2].value++;
      else matrix[3].value++;
    });

    return matrix.filter(m => m.value > 0);
  }, [analyzedData]);

  if (clients.length === 0) {
    return (
      <div className="p-10 text-center">
        <div className="text-6xl mb-4">🤖</div>
        <h2 className="text-2xl font-bold text-gray-800">Data Intelligence Engine</h2>
        <p className="text-gray-500 mt-2">Add at least 1 client profile to activate AI market insights.</p>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-6">
      {/* HEADER */}
      <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg flex flex-col md:flex-row justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold m-0 flex items-center gap-2">
            <span>⚡</span> Market Intelligence Dashboard
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Analyzing <strong className="text-white">{clients.length}</strong> client profiles to identify your perfect target market.
          </p>
        </div>
        <div className="flex gap-2 mt-4 md:mt-0">
           <button 
             onClick={() => setActiveView('market_map')}
             className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeView === 'market_map' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
           >
             🗺️ Market Map
           </button>
           <button 
             onClick={() => setActiveView('opportunities')}
             className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeView === 'opportunities' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
           >
             🎯 Opportunities
           </button>
        </div>
      </div>

      {/* --- SECTION 1: IDEAL CLIENT DNA --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* The Persona Card */}
        <div className="lg:col-span-1 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white shadow-md relative overflow-hidden">
           <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/20 rounded-full blur-2xl"></div>
           <h3 className="text-sm font-bold uppercase tracking-wider opacity-80 mb-4">Your Ideal Client Persona</h3>
           
           {icp ? (
             <>
                <div className="flex items-center gap-4 mb-6">
                   <div className="text-5xl bg-white/20 w-16 h-16 flex items-center justify-center rounded-full shadow-inner">
                      {icp.gender === 'Male' ? '👨🏻‍💼' : '👩🏻‍💼'}
                   </div>
                   <div>
                      <div className="text-2xl font-bold">{icp.gender}, {icp.ageRange}</div>
                      <div className="text-indigo-100 text-sm">Top 20% Revenue Driver</div>
                   </div>
                </div>
                
                <div className="space-y-3 text-sm bg-black/20 p-4 rounded-lg border border-white/10">
                   <div className="flex justify-between border-b border-white/10 pb-2">
                      <span className="opacity-70">Avg. Monthly Income</span>
                      <span className="font-bold">{icp.incomeLevel}</span>
                   </div>
                   <div className="flex justify-between border-b border-white/10 pb-2">
                      <span className="opacity-70">Key Priority</span>
                      <span className="font-bold text-right max-w-[150px]">{icp.strategy}</span>
                   </div>
                   <div className="pt-1">
                      <span className="block text-xs opacity-60 mb-1">AI Recommendation:</span>
                      <span className="italic text-xs">
                         "Look for {icp.gender === 'Male' ? 'men' : 'women'} in their {icp.ageRange}s earning ~{icp.incomeLevel}. This demographic yields your highest Net Worth."
                      </span>
                   </div>
                </div>
             </>
           ) : (
             <div className="text-center py-10 opacity-70">Need more data</div>
           )}
        </div>

        {/* Segment Performance */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
           <h3 className="text-lg font-bold text-gray-800 mb-4">📊 Portfolio Segmentation (by Net Worth)</h3>
           <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={segments} layout="vertical" margin={{ left: 40 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 11}} />
                    <Tooltip formatter={(value) => fmtSGD(value as number)} cursor={{fill: 'transparent'}} />
                    <Bar dataKey="aum" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={30}>
                       {segments.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={['#60a5fa', '#3b82f6', '#4f46e5', '#c026d3'][index % 4]} />
                       ))}
                    </Bar>
                 </BarChart>
              </ResponsiveContainer>
           </div>
        </div>
      </div>

      {/* --- SECTION 2: MARKET MAP & OPPORTUNITIES --- */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
         <h3 className="text-lg font-bold text-gray-800 mb-4">
            {activeView === 'market_map' ? '🗺️ Client Market Map (Income vs Net Worth)' : '🎯 Cross-Sell Opportunities'}
         </h3>
         
         <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
               {activeView === 'market_map' ? (
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                     <CartesianGrid />
                     <XAxis type="number" dataKey="income" name="Income" unit="$" />
                     <YAxis type="number" dataKey="netWorth" name="Net Worth" unit="$" />
                     <ZAxis type="number" dataKey="age" range={[60, 400]} name="Age" />
                     <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(value) => fmtSGD(value as number)} />
                     <Scatter name="Clients" data={analyzedData.all} fill="#8884d8">
                        {analyzedData.all.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={entry.hasInsurance && entry.hasInvestment ? '#10b981' : (entry.hasInsurance ? '#ef4444' : '#f59e0b')} />
                        ))}
                     </Scatter>
                  </ScatterChart>
               ) : (
                  <PieChart>
                     <Pie 
                        data={matrixData} 
                        dataKey="value" 
                        nameKey="name" 
                        cx="50%" 
                        cy="50%" 
                        outerRadius={100} 
                        label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                     >
                        {matrixData.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                     </Pie>
                     <Tooltip />
                     <Legend />
                  </PieChart>
               )}
            </ResponsiveContainer>
         </div>
         
         {activeView === 'market_map' && (
            <div className="mt-4 flex justify-center gap-4 text-xs text-gray-500">
               <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-emerald-500"></div> Fully Covered</div>
               <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-500"></div> Only Insurance</div>
               <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-amber-500"></div> Only Investment</div>
            </div>
         )}
      </div>
    </div>
  );
};

export default AnalyticsTab;
