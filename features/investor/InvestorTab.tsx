
import React, { useState } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { useAi } from '../../contexts/AiContext';
import { toNum, fmtSGD } from '../../lib/helpers';
import { generateInvestmentThesis } from '../../lib/gemini';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import PageHeader from '../../components/layout/PageHeader';
import SectionCard from '../../components/layout/SectionCard';

const InvestorTab: React.FC = () => {
  const { investorState, setInvestorState, profile } = useClient();
  const { openAiWithPrompt } = useAi();
  const { portfolioValue, portfolioType } = investorState;
  const currentVal = toNum(portfolioValue, 0);

  const data = [];
  const years = 20;
  const cashRate = 0.005;
  const marketRate = portfolioType === 'conservative' ? 0.04 : (portfolioType === 'growth' ? 0.08 : 0.06);
  
  for (let i = 0; i <= years; i++) {
     data.push({
        year: `Year ${i}`,
        cash: Math.round(currentVal * Math.pow(1 + cashRate, i)),
        invested: Math.round(currentVal * Math.pow(1 + marketRate, i))
     });
  }

  const finalCash = data[years].cash;
  const finalInvested = data[years].invested;
  const opportunityCost = finalInvested - finalCash;

  const handleAiThesis = async () => {
     openAiWithPrompt(`Analyze my portfolio strategy. I have $${currentVal} allocated in a '${portfolioType}' strategy. My age is ${2025 - (new Date(profile.dob).getFullYear() || 2000)}. Is this appropriate? Use thinking mode to calculate my inflation-adjusted returns.`);
  };

  const headerAction = (
    <button 
      onClick={handleAiThesis}
      className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
    >
      <span>🧠</span> Sproutly Thesis
    </button>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <PageHeader 
        title="Portfolio Strategy" 
        icon="📈" 
        subtitle="Analyze asset allocation and calculate the cost of inaction."
        action={headerAction}
      />
      
      <div className="bg-[#0B1120] rounded-2xl p-8 text-white shadow-2xl relative overflow-hidden">
         <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/30 rounded-full blur-[80px]"></div>
         <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
               <h2 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">Capital Deployment</h2>
               <div className="text-4xl md:text-5xl font-black tracking-tight mb-2 flex items-baseline bg-white/5 border border-white/10 px-4 py-2 rounded-xl">
                  <span className="text-gray-500 mr-2">$</span>
                  <input 
                     type="text" 
                     value={portfolioValue}
                     onChange={(e) => setInvestorState({ ...investorState, portfolioValue: e.target.value })}
                     className="bg-transparent outline-none w-full placeholder-gray-700 text-white"
                     placeholder="0"
                  />
               </div>
               <p className="text-sm text-gray-400">Enter investable capital to see the cost of inaction.</p>
            </div>
            
            <div className="flex gap-2 bg-white/5 p-1 rounded-xl w-fit backdrop-blur-sm border border-white/10">
               {['conservative', 'balanced', 'growth'].map((type) => (
                  <button
                     key={type}
                     onClick={() => setInvestorState({ ...investorState, portfolioType: type })}
                     className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${portfolioType === type ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                  >
                     {type}
                  </button>
               ))}
            </div>
         </div>
      </div>

      {currentVal > 0 && (
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <SectionCard title="Wealth Divergence (20 Years)" className="lg:col-span-2">
               <div className="h-[300px] w-full">
                  <ResponsiveContainer>
                     <AreaChart data={data}>
                        <defs>
                           <linearGradient id="colorInv" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                           </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="year" fontSize={10} axisLine={false} tickLine={false} tickMargin={10} />
                        <YAxis hide />
                        <Tooltip 
                           contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                           formatter={(val: number) => fmtSGD(val)}
                        />
                        <Area type="monotone" dataKey="invested" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorInv)" name="Invested" />
                        <Area type="monotone" dataKey="cash" stroke="#9ca3af" strokeWidth={2} strokeDasharray="5 5" fill="transparent" name="Cash (Bank)" />
                     </AreaChart>
                  </ResponsiveContainer>
               </div>
            </SectionCard>

            <SectionCard className="flex flex-col justify-center">
               <div className="text-center">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">The Cost of Waiting</div>
                  <div className="mb-6">
                     <div className="text-sm text-gray-500 mb-1">Projected Loss (Inflation Adjusted)</div>
                     <div className="text-3xl font-black text-red-500">{fmtSGD(opportunityCost)}</div>
                  </div>
                  <div className="space-y-3 text-left bg-gray-50 p-4 rounded-xl text-xs border border-gray-100">
                     <div className="flex justify-between">
                        <span className="text-gray-500">Bank Rate</span>
                        <span className="font-bold text-gray-800">0.5%</span>
                     </div>
                     <div className="flex justify-between">
                        <span className="text-gray-500">Market Rate ({portfolioType})</span>
                        <span className="font-bold text-indigo-600">{(marketRate * 100).toFixed(1)}%</span>
                     </div>
                     <div className="pt-2 border-t border-gray-200 mt-2 text-center text-gray-400 italic">
                        "Time in the market beats timing the market."
                     </div>
                  </div>
               </div>
            </SectionCard>
         </div>
      )}
    </div>
  );
};

export default InvestorTab;
