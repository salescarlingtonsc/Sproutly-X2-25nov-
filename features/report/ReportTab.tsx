
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
  const { profile, cashflowData, investorState, insuranceState, cashflowState, cpfState, clientRef } = useClient();
  const [executiveSummary, setExecutiveSummary] = useState('');
  const [loading, setLoading] = useState(false);

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
    if (!key) return;
    setLoading(true);
    try {
       const ai = new GoogleGenAI({ apiKey: key });
       const prompt = `Write a formal, professional Executive Summary letter for ${profile.name}. Net Worth: ${fmtSGD(netWorth)}. Do not use markdown.`;
       const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
       setExecutiveSummary(response.text || "Summary unavailable.");
    } catch (e) {
       setExecutiveSummary("Insight temporarily unavailable.");
    } finally {
       setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8 flex justify-between items-center print:hidden bg-slate-900 text-white p-4 rounded-xl shadow-lg">
         <div>
            <h1 className="text-xl font-bold">Executive Deliverable</h1>
            <p className="text-sm text-slate-400">Generate and print a professional client report.</p>
         </div>
         <div className="flex gap-3">
            <button onClick={handleGenerateSummary} disabled={loading} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-bold text-sm transition-colors flex items-center gap-2">
               {loading ? 'Drafting...' : '✨ Write Executive Letter'}
            </button>
            <button onClick={() => window.print()} className="px-4 py-2 bg-white text-slate-900 hover:bg-gray-100 rounded-lg font-bold text-sm transition-colors flex items-center gap-2">
               🖨 Print PDF
            </button>
         </div>
      </div>

      <div className="bg-white p-10 shadow-2xl print:shadow-none print:p-0 min-h-[1123px] w-full mx-auto print:w-full text-slate-900 relative">
         <div className="absolute top-0 bottom-0 left-0 w-3 bg-indigo-600 print:w-2"></div>
         <div className="flex justify-between items-end border-b-2 border-gray-900 pb-6 mb-10 pl-8">
            <div>
               <div className="text-indigo-600 font-black text-2xl tracking-tight uppercase mb-1">Sproutly Quantum</div>
               <div className="text-gray-500 text-xs font-bold tracking-widest uppercase">Financial Strategy Unit</div>
            </div>
            <div className="text-right">
               <h1 className="text-3xl font-serif font-bold text-gray-900">{profile.name}</h1>
               <div className="text-sm text-gray-500 mt-1">Strategic Financial Review • {new Date().toLocaleDateString()}</div>
            </div>
         </div>

         <div className="pl-8">
            <div className="mb-12">
               <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Executive Summary</h2>
               {executiveSummary ? (
                  <div className="prose prose-slate max-w-none text-justify whitespace-pre-line font-serif leading-relaxed text-gray-700 text-sm">{executiveSummary}</div>
               ) : (
                  <div className="p-8 border-2 border-dashed border-gray-200 rounded-xl text-center text-gray-400 print:hidden">Click "Write Executive Letter" to initiate Sproutly analysis.</div>
               )}
            </div>

            <div className="grid grid-cols-3 gap-8 mb-12 border-t border-b border-gray-100 py-8">
               <div><div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Net Worth</div><div className="text-3xl font-black text-emerald-600">{fmtSGD(netWorth)}</div></div>
               <div><div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Monthly Surplus</div><div className={`text-3xl font-black ${cashflowData?.monthlySavings >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>{fmtSGD(cashflowData?.monthlySavings || 0)}</div></div>
               <div><div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Protection</div><div className="text-3xl font-black text-blue-600">{fmtSGD(insuranceCoverage)}</div></div>
            </div>

            <div className="text-[10px] text-gray-400 pt-8 mt-auto">
               <p>Sproutly Quantum Protocol Analysis. This report is for educational purposes only and does not constitute guaranteed financial advice.</p>
               <p className="mt-1">Prepared for: {profile.name} | Ref: {clientRef || 'N/A'}</p>
            </div>
         </div>
      </div>
    </div>
  );
};

export default ReportTab;
