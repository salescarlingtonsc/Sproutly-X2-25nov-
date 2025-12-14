
import React, { useState } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { fmtSGD, toNum } from '../../lib/helpers';
import { GoogleGenAI } from '@google/genai';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const getApiKey = () => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      return (import.meta as any).env.VITE_GOOGLE_API_KEY || '';
    }
  } catch (e) {}
  return '';
};

const ReportTab: React.FC = () => {
  const { profile, cashflowData, investorState, insuranceState, cashflowState, cpfState } = useClient();
  const [executiveSummary, setExecutiveSummary] = useState('');
  const [loading, setLoading] = useState(false);

  // --- DERIVED METRICS ---
  const netWorth = (toNum(investorState.portfolioValue) + toNum(cashflowState.currentSavings) + 
                   toNum(cpfState.currentBalances.oa) + toNum(cpfState.currentBalances.sa) + toNum(cpfState.currentBalances.ma));
  
  const insuranceCoverage = (insuranceState.policies || []).reduce((acc, p) => acc + toNum(p.deathCoverage), 0);
  const monthlyBurn = cashflowData ? cashflowData.totalExpenses : 0;
  const runwayMonths = monthlyBurn > 0 ? (toNum(cashflowState.currentSavings) / monthlyBurn).toFixed(1) : '∞';

  const chartData = [
    { name: 'Net Worth', value: netWorth, fill: '#10b981' },
    { name: 'Protection', value: insuranceCoverage, fill: '#3b82f6' },
    { name: 'Liquid Cash', value: toNum(cashflowState.currentSavings), fill: '#f59e0b' },
  ];

  const handleGenerateSummary = async () => {
    const key = getApiKey();
    if (!key) {
       alert("API Key missing.");
       return;
    }
    setLoading(true);
    try {
       const ai = new GoogleGenAI({ apiKey: key });
       const prompt = `
         Write a formal, professional Executive Summary letter for a financial report.
         Client: ${profile.name} (Age: ${2025 - (new Date(profile.dob).getFullYear() || 1990)})
         
         Key Data:
         - Net Worth: ${fmtSGD(netWorth)}
         - Monthly Surplus: ${fmtSGD(cashflowData?.monthlySavings || 0)}
         - Insurance Coverage: ${fmtSGD(insuranceCoverage)}
         - Emergency Runway: ${runwayMonths} months
         
         Tone: Authoritative, encouraging, and strategic.
         Structure:
         1. Salutation
         2. Current Status Assessment (Strengths/Weaknesses)
         3. Strategic Recommendations
         4. Closing
         
         Do not use markdown formatting (bold/italic) as this will be printed in a plain text block. Keep it clean spacing.
       `;
       
       const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt
       });
       
       setExecutiveSummary(response.text || "Summary unavailable.");
    } catch (e) {
       console.error(e);
       setExecutiveSummary("Could not generate summary due to connection error.");
    } finally {
       setLoading(false);
    }
  };

  const handlePrint = () => {
     window.print();
  };

  if (!profile.name) return <div className="p-10 text-center text-gray-400">Please select a client first.</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      
      {/* SCREEN ONLY CONTROLS */}
      <div className="mb-8 flex justify-between items-center print:hidden bg-slate-900 text-white p-4 rounded-xl shadow-lg">
         <div>
            <h1 className="text-xl font-bold">Executive Deliverable</h1>
            <p className="text-sm text-slate-400">Generate and print a professional client report.</p>
         </div>
         <div className="flex gap-3">
            <button 
               onClick={handleGenerateSummary}
               disabled={loading}
               className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-bold text-sm transition-colors flex items-center gap-2"
            >
               {loading ? 'Writing...' : '✨ Write Executive Letter'}
            </button>
            <button 
               onClick={handlePrint}
               className="px-4 py-2 bg-white text-slate-900 hover:bg-gray-100 rounded-lg font-bold text-sm transition-colors flex items-center gap-2"
            >
               🖨 Print PDF
            </button>
         </div>
      </div>

      {/* PRINTABLE AREA */}
      <div className="bg-white p-10 shadow-2xl print:shadow-none print:p-0 min-h-[1123px] w-full mx-auto print:w-full text-slate-900 relative">
         
         {/* Decorative Sidebar for Print */}
         <div className="absolute top-0 bottom-0 left-0 w-3 bg-indigo-600 print:w-2"></div>

         {/* Header */}
         <div className="flex justify-between items-end border-b-2 border-gray-900 pb-6 mb-10 pl-8">
            <div>
               <div className="text-indigo-600 font-black text-2xl tracking-tight uppercase mb-1">Sproutly Quantum</div>
               <div className="text-gray-500 text-xs font-bold tracking-widest uppercase">Financial Intelligence Unit</div>
            </div>
            <div className="text-right">
               <h1 className="text-3xl font-serif font-bold text-gray-900">{profile.name}</h1>
               <div className="text-sm text-gray-500 mt-1">Strategic Financial Review • {new Date().toLocaleDateString()}</div>
            </div>
         </div>

         <div className="pl-8">
            {/* Executive Letter */}
            <div className="mb-12">
               <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Executive Summary</h2>
               {executiveSummary ? (
                  <div className="prose prose-slate max-w-none text-justify whitespace-pre-line font-serif leading-relaxed text-gray-700 text-sm">
                     {executiveSummary}
                  </div>
               ) : (
                  <div className="p-8 border-2 border-dashed border-gray-200 rounded-xl text-center text-gray-400 print:hidden">
                     Click "Write Executive Letter" to generate AI analysis.
                  </div>
               )}
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-8 mb-12 border-t border-b border-gray-100 py-8">
               <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Net Worth</div>
                  <div className="text-3xl font-black text-emerald-600">{fmtSGD(netWorth)}</div>
               </div>
               <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Monthly Surplus</div>
                  <div className={`text-3xl font-black ${cashflowData?.monthlySavings >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>
                     {fmtSGD(cashflowData?.monthlySavings || 0)}
                  </div>
               </div>
               <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Protection</div>
                  <div className="text-3xl font-black text-blue-600">{fmtSGD(insuranceCoverage)}</div>
               </div>
            </div>

            {/* Visuals */}
            <div className="grid grid-cols-2 gap-10 mb-12">
               <div>
                  <h3 className="font-bold text-gray-900 mb-4 text-sm border-b border-gray-200 pb-2">Financial Composition</h3>
                  <div className="h-[200px]">
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                           <XAxis type="number" hide />
                           <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 10}} />
                           <Bar dataKey="value" barSize={20} radius={[0,4,4,0]} label={{ position: 'right', formatter: (v:number) => fmtSGD(v), fontSize: 10, fill: '#666' }} />
                        </BarChart>
                     </ResponsiveContainer>
                  </div>
               </div>
               <div>
                  <h3 className="font-bold text-gray-900 mb-4 text-sm border-b border-gray-200 pb-2">Health Checks</h3>
                  <ul className="space-y-4">
                     <li className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Liquidity Runway</span>
                        <span className={`font-bold ${toNum(runwayMonths) > 6 ? 'text-emerald-600' : 'text-red-600'}`}>
                           {runwayMonths} Months
                        </span>
                     </li>
                     <li className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Savings Rate</span>
                        <span className={`font-bold ${cashflowData?.savingsRate > 20 ? 'text-emerald-600' : 'text-amber-600'}`}>
                           {cashflowData?.savingsRate.toFixed(1)}%
                        </span>
                     </li>
                     <li className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Investment Ratio</span>
                        <span className="font-bold text-gray-800">
                           {profile.monthlyInvestmentAmount && cashflowData.takeHome 
                              ? ((toNum(profile.monthlyInvestmentAmount)/cashflowData.takeHome)*100).toFixed(1) 
                              : '0.0'}%
                        </span>
                     </li>
                  </ul>
               </div>
            </div>

            {/* Footer */}
            <div className="text-[10px] text-gray-400 pt-8 mt-auto">
               <p>Generated by Sproutly Quantum Intelligence. This report is for educational purposes only and does not constitute guaranteed financial advice.</p>
               <p className="mt-1">Prepared for: {profile.name} | Ref: {profile.referenceCode || 'N/A'}</p>
            </div>
         </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          .print\\:p-0 {
            padding: 0 !important;
          }
          .print\\:w-full {
            width: 100% !important;
            max-width: none !important;
          }
          /* Target the report container specifically */
          .max-w-5xl {
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          /* Make report content visible */
          .max-w-5xl > div:last-child,
          .max-w-5xl > div:last-child * {
            visibility: visible;
          }
          .max-w-5xl > div:last-child {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default ReportTab;
