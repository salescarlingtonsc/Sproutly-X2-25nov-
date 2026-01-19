import React, { useState, useMemo } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { useAuth } from '../../contexts/AuthContext';
import { fmtSGD, toNum, getAge } from '../../lib/helpers';
import { projectComprehensiveWealth, computeCpf } from '../../lib/calculators';
import { GoogleGenAI } from '@google/genai';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import Button from '../../components/ui/Button';
import SectionCard from '../../components/layout/SectionCard';
// Add missing PageHeader import
import PageHeader from '../../components/layout/PageHeader';

const ReportTab: React.FC = () => {
  const { user } = useAuth();
  const { 
    profile, cashflowData, investorState, insuranceState, 
    cashflowState, cpfState, age, clientRef, retirement,
    generateClientObject 
  } = useClient();
  
  const [reportMode, setReportMode] = useState<'client' | 'advisor'>('client');
  const [executiveSummary, setExecutiveSummary] = useState('');
  const [loading, setLoading] = useState(false);

  // --- CLIENT DATA ENGINE ---
  const clientReportData = useMemo(() => {
    const retireAge = toNum(profile.retirementAge, 65);
    const currentCpf = { 
        oa: toNum(cpfState.currentBalances.oa), 
        sa: toNum(cpfState.currentBalances.sa), 
        ma: toNum(cpfState.currentBalances.ma) 
    };
    
    const projection = projectComprehensiveWealth({
        currentAge: age,
        retirementAge: retireAge,
        currentCpf,
        currentCash: toNum(cashflowState.currentSavings),
        currentInvestments: toNum(investorState.portfolioValue),
        monthlyIncome: toNum(profile.grossSalary),
        monthlyCashSavings: cashflowData?.monthlySavings || 0,
        monthlyInvestment: toNum(profile.monthlyInvestmentAmount),
        rates: { 
            cpfOa: 0.025, cpfSa: 0.04, cash: 0.005, 
            investments: toNum(retirement.customReturnRate, 5)/100, 
            inflation: 0.03 
        },
        expensesToday: toNum(profile.customRetirementExpense) || (cashflowData?.totalExpenses || 0)
    });

    const retirePoint = projection.find(p => p.age === retireAge) || projection[projection.length-1];
    
    // Insurance Audit
    const monthlyTakeHome = toNum(profile.takeHome) || (computeCpf(toNum(profile.grossSalary), age).takeHome);
    const reqDeath = monthlyTakeHome * 12 * 10;
    const currentDeath = (insuranceState.policies || []).reduce((sum, p) => sum + toNum(p.deathCoverage), 0);
    
    return {
        projection,
        retirePoint,
        insurance: {
            death: { current: currentDeath, required: reqDeath, isMet: currentDeath >= reqDeath },
            ci: { 
                current: (insuranceState.policies || []).reduce((sum, p) => sum + toNum(p.earlyCiCoverage) + toNum(p.lateCiCoverage), 0),
                required: monthlyTakeHome * 12 * 5,
                isMet: (insuranceState.policies || []).reduce((sum, p) => sum + toNum(p.earlyCiCoverage) + toNum(p.lateCiCoverage), 0) >= (monthlyTakeHome * 12 * 5)
            }
        }
    };
  }, [profile, age, cpfState, cashflowState, investorState, cashflowData, insuranceState, retirement]);

  // --- ADVISOR PERFORMANCE ENGINE ---
  const advisorStats = useMemo(() => {
    // This would normally come from the global clients list passed from App.tsx
    // For this tab context, we analyze the current focus if in 'advisor' mode
    const annualGoal = user?.annualGoal || 120000;
    const currentRevenue = (user as any).currentRevenue || 0; // Simulated/Local
    
    return {
        goal: annualGoal,
        actual: currentRevenue,
        percent: (currentRevenue / (annualGoal || 1)) * 100,
        pipeline: [
            { name: 'Prospects', value: 12, color: '#94a3b8' },
            { name: 'Proposal', value: 5, color: '#6366f1' },
            { name: 'Closing', value: 2, color: '#10b981' }
        ]
    };
  }, [user]);

  const handleGenerateSummary = async () => {
    setLoading(true);
    try {
       const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
       const prompt = `Write a professional executive review for ${profile.name}. 
       They want to retire at ${profile.retirementAge}. 
       Projected wealth at retirement: ${fmtSGD(clientReportData.retirePoint?.totalNetWorth)}.
       Insurance Status: ${clientReportData.insurance.death.isMet ? 'Fully Covered' : 'Under Covered'}.
       Focus on the "Why" and the strategy. Concise.`;
       
       const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
       setExecutiveSummary(response.text || "Insight unavailable.");
    } catch (e) {
       setExecutiveSummary("Intelligence engine standby.");
    } finally {
       setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      
      {/* MODE SELECTOR */}
      <div className="flex justify-center mb-8 print:hidden">
         <div className="bg-slate-100 p-1 rounded-2xl flex shadow-inner">
            <button 
                onClick={() => setReportMode('client')}
                className={`px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${reportMode === 'client' ? 'bg-white text-indigo-600 shadow-md scale-105' : 'text-slate-400 hover:text-slate-600'}`}
            >
                Client Deliverable
            </button>
            <button 
                onClick={() => setReportMode('advisor')}
                className={`px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${reportMode === 'advisor' ? 'bg-white text-emerald-600 shadow-md scale-105' : 'text-slate-400 hover:text-slate-600'}`}
            >
                Advisor Analytics
            </button>
         </div>
      </div>

      {reportMode === 'client' ? (
        <div className="animate-fade-in space-y-6">
           {/* CLIENT REPORT HEADER */}
           <div className="flex justify-between items-end print:hidden">
              <div>
                 <h1 className="text-2xl font-black text-slate-900">Strategic Portfolio Review</h1>
                 <p className="text-sm text-slate-500 font-medium italic">Client: {profile.name || 'Unnamed'}</p>
              </div>
              <div className="flex gap-2">
                 <Button variant="secondary" onClick={handleGenerateSummary} isLoading={loading} leftIcon="✨">AI Summary</Button>
                 <Button variant="primary" onClick={() => window.print()} leftIcon="🖨">Export PDF</Button>
              </div>
           </div>

           {/* THE DELIVERABLE CANVAS */}
           <div className="bg-white border border-slate-200 rounded-3xl p-10 shadow-2xl relative overflow-hidden print:shadow-none print:border-none">
              <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                 <div className="space-y-8">
                    <section>
                       <label className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-4 block">Retirement Projection</label>
                       <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                          <p className="text-sm text-slate-500 font-medium">Projected Nest Egg @ Age {profile.retirementAge}</p>
                          <h2 className="text-4xl font-black text-slate-900 tracking-tighter mt-1">{fmtSGD(clientReportData.retirePoint?.totalNetWorth || 0)}</h2>
                          <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center">
                             <span className="text-xs font-bold text-slate-400">Monthly Post-Retire Flow:</span>
                             <span className="text-sm font-black text-indigo-600">{fmtSGD((clientReportData.retirePoint?.expensesAnnual || 0)/12)}</span>
                          </div>
                       </div>
                    </section>

                    <section>
                       <label className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-4 block">Defense & Protection Audit</label>
                       <div className="space-y-3">
                          {[
                             { label: 'Legacy Protection', data: clientReportData.insurance.death },
                             { label: 'Crisis Recovery', data: clientReportData.insurance.ci }
                          ].map((audit, i) => (
                             <div key={i} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl shadow-sm">
                                <div>
                                   <p className="text-xs font-bold text-slate-700">{audit.label}</p>
                                   <p className="text-[10px] text-slate-400 uppercase">Target: {fmtSGD(audit.data.required)}</p>
                                </div>
                                <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${audit.data.isMet ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                   {audit.data.isMet ? 'Secured ✓' : 'Gap Detected ⚠'}
                                </div>
                             </div>
                          ))}
                       </div>
                    </section>
                 </div>

                 <div className="space-y-8">
                    <section>
                       <label className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-4 block">Advisor Executive Summary</label>
                       <div className="prose prose-slate prose-sm font-serif leading-relaxed text-slate-600 bg-indigo-50/30 p-6 rounded-2xl border border-indigo-100 italic min-h-[200px]">
                          {executiveSummary || "Pending AI Analysis..."}
                       </div>
                    </section>
                    
                    <div className="text-center pt-8 border-t border-slate-100">
                       <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest">Sproutly Quantum Protocol • Verified Document</p>
                       <p className="text-[8px] text-slate-200 mt-1">Reference: {clientRef || 'N/A'}</p>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      ) : (
        <div className="animate-fade-in space-y-6">
           <PageHeader title="Advisor Performance Dashboard" icon="📊" subtitle="Internal revenue tracking and pipeline management." />

           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* TARGET TRACKING */}
              <SectionCard title="Annual Revenue Target" className="md:col-span-2">
                 <div className="flex flex-col md:flex-row items-center gap-10">
                    <div className="relative w-48 h-48 flex items-center justify-center">
                       <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                             <Pie data={[{value: advisorStats.percent}, {value: 100 - advisorStats.percent}]} innerRadius={60} outerRadius={80} startAngle={90} endAngle={450} dataKey="value">
                                <Cell fill="#10b981" />
                                <Cell fill="#f1f5f9" />
                             </Pie>
                          </PieChart>
                       </ResponsiveContainer>
                       <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-black text-slate-900">{advisorStats.percent.toFixed(1)}%</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">Achieved</span>
                       </div>
                    </div>
                    <div className="flex-1 space-y-4">
                       <div>
                          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Fiscal Goal</p>
                          <h3 className="text-3xl font-black text-slate-900">{fmtSGD(advisorStats.goal)}</h3>
                       </div>
                       <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                          <div>
                             <p className="text-[10px] text-slate-400 font-bold uppercase">Actual (YTD)</p>
                             <p className="text-lg font-black text-emerald-600">{fmtSGD(advisorStats.actual)}</p>
                          </div>
                          <div>
                             <p className="text-[10px] text-slate-400 font-bold uppercase">Pipeline Gap</p>
                             <p className="text-lg font-black text-slate-400">{fmtSGD(advisorStats.goal - advisorStats.actual)}</p>
                          </div>
                       </div>
                    </div>
                 </div>
              </SectionCard>

              {/* PENDING PIPELINE */}
              <SectionCard title="Pending Value">
                 <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                       <BarChart data={advisorStats.pipeline}>
                          <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ borderRadius: '12px' }} />
                          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                             {advisorStats.pipeline.map((entry, index) => (
                                <Cell key={index} fill={entry.color} />
                             ))}
                          </Bar>
                       </BarChart>
                    </ResponsiveContainer>
                 </div>
                 <div className="mt-4 p-4 bg-indigo-50 rounded-xl border border-indigo-100 text-center">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Opportunity Forecast</p>
                    <p className="text-sm font-bold text-indigo-900 mt-1">High conversion probability this month.</p>
                 </div>
              </SectionCard>
           </div>
        </div>
      )}
    </div>
  );
};

export default ReportTab;
