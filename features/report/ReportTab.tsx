import React, { useState, useMemo } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { useAuth } from '../../contexts/AuthContext';
import { fmtSGD, toNum } from '../../lib/helpers';
import { projectComprehensiveWealth, computeCpf } from '../../lib/calculators';
import { GoogleGenAI } from '@google/genai';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import Button from '../../components/ui/Button';
import SectionCard from '../../components/layout/SectionCard';
import PageHeader from '../../components/layout/PageHeader';
import { Client } from '../../types';

interface ReportTabProps {
  clients: Client[];
}

const ReportTab: React.FC<ReportTabProps> = ({ clients }) => {
  const { user } = useAuth();
  const { 
    profile, cashflowData, investorState, insuranceState, 
    cashflowState, cpfState, age, clientRef, retirement
  } = useClient();
  
  const [reportMode, setReportMode] = useState<'client' | 'advisor'>('client');
  const [executiveSummary, setExecutiveSummary] = useState('');
  const [loading, setLoading] = useState(false);

  // --- CLIENT REPORT ENGINE ---
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
    const annualGoal = user?.annualGoal || 120000;
    
    // Filter clients belonging to current advisor
    const myClients = clients.filter(c => c._ownerId === user?.id || c.advisorId === user?.id);
    
    // Sum Actual Closed Revenue
    let totalClosedRevenue = 0;
    myClients.forEach(c => {
        (c.sales || []).forEach(s => {
            totalClosedRevenue += (s.grossRevenue || 0);
        });
    });

    // Calculate Pipeline Per Stage
    const pipelineStages = [
        { name: 'Proposal', value: 0, color: '#6366f1' },
        { name: 'Pending', value: 0, color: '#f59e0b' },
        { name: 'Closed', value: totalClosedRevenue, color: '#10b981' }
    ];

    myClients.forEach(c => {
        const val = toNum(c.value);
        if (c.followUp?.status === 'proposal') pipelineStages[0].value += val;
        if (c.followUp?.status === 'pending_decision') pipelineStages[1].value += val;
    });

    // High Prob. Potential Clients (Top 5 by Momentum)
    const potentialClients = myClients
        .filter(c => c.followUp?.status !== 'client' && c.followUp?.status !== 'case_closed')
        .sort((a,b) => (b.momentumScore || 0) - (a.momentumScore || 0))
        .slice(0, 5);

    return {
        goal: annualGoal,
        actual: totalClosedRevenue,
        percent: Math.min(100, (totalClosedRevenue / (annualGoal || 1)) * 100),
        pipeline: pipelineStages,
        potentialClients
    };
  }, [user, clients]);

  const handleGenerateSummary = async () => {
    setLoading(true);
    try {
       const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
       const prompt = `Write a professional executive review for ${profile.name}. 
       Retiring at: ${profile.retirementAge}. 
       Wealth at retirement: ${fmtSGD(clientReportData.retirePoint?.totalNetWorth)}.
       Monthly Cashflow: ${fmtSGD((clientReportData.retirePoint?.expensesAnnual || 0)/12)}.
       Insurance: ${clientReportData.insurance.death.isMet ? 'Secured' : 'Under-covered'}.
       Output 3 concise bullet points for a strategy letter.`;
       
       const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
       setExecutiveSummary(response.text || "Insight unavailable.");
    } catch (e) {
       setExecutiveSummary("Intelligence engine standby.");
    } finally {
       setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      {/* MODE SELECTOR */}
      <div className="flex justify-center mb-8 print:hidden">
         <div className="bg-slate-100 p-1 rounded-2xl flex shadow-inner border border-slate-200">
            <button 
                onClick={() => setReportMode('client')}
                className={`px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${reportMode === 'client' ? 'bg-white text-indigo-600 shadow-md scale-105' : 'text-slate-400 hover:text-slate-600'}`}
            >
                Client Dossier
            </button>
            <button 
                onClick={() => setReportMode('advisor')}
                className={`px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${reportMode === 'advisor' ? 'bg-white text-emerald-600 shadow-md scale-105' : 'text-slate-400 hover:text-slate-600'}`}
            >
                My Performance
            </button>
         </div>
      </div>

      {reportMode === 'client' ? (
        <div className="animate-fade-in space-y-6">
           <PageHeader title="Strategic Outcome Report" icon="📄" subtitle="Comprehensive projection of wealth and protection." action={
              <div className="flex gap-2">
                 <Button variant="secondary" onClick={handleGenerateSummary} isLoading={loading} leftIcon="✨">AI Summarize</Button>
                 <Button variant="primary" onClick={() => window.print()} leftIcon="🖨">Export PDF</Button>
              </div>
           } />

           <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* LEFT: Identity & Outlook */}
              <div className="lg:col-span-8 space-y-6">
                 {/* Basic Profile */}
                 <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm flex flex-col md:flex-row gap-8 justify-between items-center">
                    <div className="flex items-center gap-4">
                       <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-2xl font-bold text-indigo-600 border-2 border-white shadow-md">
                          {profile.name?.charAt(0) || 'C'}
                       </div>
                       <div>
                          <h2 className="text-xl font-black text-slate-800">{profile.name || 'Unnamed Client'}</h2>
                          <p className="text-xs text-slate-400 uppercase font-bold tracking-widest">Age {age} • {profile.gender}</p>
                       </div>
                    </div>
                    <div className="grid grid-cols-2 gap-8 text-center">
                       <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Current Income</p>
                          <p className="text-lg font-black text-slate-700">{fmtSGD(toNum(profile.grossSalary))}</p>
                       </div>
                       <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Savings Rate</p>
                          <p className="text-lg font-black text-emerald-600">{cashflowData?.savingsRate.toFixed(1)}%</p>
                       </div>
                    </div>
                 </div>

                 {/* Retirement & Cashflow */}
                 <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/20 rounded-full blur-[80px]"></div>
                    <label className="text-[10px] font-black text-indigo-300 uppercase tracking-[0.3em] mb-6 block">Target Outcome @ Age {profile.retirementAge}</label>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                       <div>
                          <p className="text-sm text-slate-400 font-medium">Projected Investable Wealth</p>
                          <h2 className="text-5xl font-black text-white tracking-tighter mt-1">{fmtSGD(clientReportData.retirePoint?.totalNetWorth || 0)}</h2>
                       </div>
                       <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                          <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mb-1">Monthly Passive Floor</p>
                          <p className="text-3xl font-black text-white">{fmtSGD((clientReportData.retirePoint?.expensesAnnual || 0)/12)}</p>
                          <p className="text-[10px] text-slate-500 mt-2">Sustainable withdrawal rate adjusted for inflation.</p>
                       </div>
                    </div>
                 </div>

                 {/* Insurance Breakdown */}
                 <SectionCard title="Protection Audit">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       {[
                          { label: 'Legacy/Death Benefit', data: clientReportData.insurance.death, icon: '🛡️' },
                          { label: 'Crisis/Late CI Recovery', data: clientReportData.insurance.ci, icon: '🏥' }
                       ].map((audit, i) => (
                          <div key={i} className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between group hover:border-indigo-300 transition-all">
                             <div className="flex items-center gap-4">
                                <span className="text-2xl">{audit.icon}</span>
                                <div>
                                   <p className="text-sm font-bold text-slate-700">{audit.label}</p>
                                   <p className="text-[10px] text-slate-400 uppercase font-black">Coverage: {fmtSGD(audit.data.current)}</p>
                                </div>
                             </div>
                             <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${audit.data.isMet ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                {audit.data.isMet ? 'Fully Secured ✓' : 'Under-covered ⚠️'}
                             </div>
                          </div>
                       ))}
                    </div>
                 </SectionCard>
              </div>

              {/* RIGHT: AI Analysis */}
              <div className="lg:col-span-4 space-y-6">
                 <div className="bg-indigo-50/50 rounded-3xl p-8 border border-indigo-100 min-h-[400px]">
                    <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-6 flex items-center gap-2">
                       <span>✨</span> AI Strategic Review
                    </h3>
                    <div className="prose prose-slate prose-sm italic font-serif text-slate-600 leading-relaxed whitespace-pre-line">
                       {executiveSummary || "Request an AI summary to generate the executive letter based on current dossier data."}
                    </div>
                 </div>
                 <div className="text-center opacity-30 text-[9px] font-bold uppercase tracking-widest">
                    Sproutly Intelligence Protocol • Ref: {clientRef || 'N/A'}
                 </div>
              </div>
           </div>
        </div>
      ) : (
        <div className="animate-fade-in space-y-10">
           <PageHeader title="Advisor Performance" icon="📊" subtitle="Revenue tracking and potential opportunity heatmap." />

           <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              {/* Target Tracking */}
              <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 p-10 shadow-sm flex flex-col items-center">
                 <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-10 w-full">Fiscal Year Momentum</h3>
                 <div className="relative w-64 h-64 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                       <PieChart>
                          <Pie data={[{value: advisorStats.percent}, {value: 100 - advisorStats.percent}]} innerRadius={80} outerRadius={100} startAngle={90} endAngle={450} dataKey="value">
                             <Cell fill="#10b981" />
                             <Cell fill="#f1f5f9" />
                          </Pie>
                       </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                       <span className="text-5xl font-black text-slate-900">{advisorStats.percent.toFixed(1)}%</span>
                       <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Achieved</span>
                    </div>
                 </div>
                 <div className="mt-10 grid grid-cols-2 gap-10 w-full text-center">
                    <div>
                       <p className="text-[10px] text-slate-400 font-black uppercase mb-1">Total Goal</p>
                       <p className="text-2xl font-black text-slate-800">{fmtSGD(advisorStats.goal).split('.')[0]}</p>
                    </div>
                    <div>
                       <p className="text-[10px] text-slate-400 font-black uppercase mb-1">Actual (YTD)</p>
                       <p className="text-2xl font-black text-emerald-600">{fmtSGD(advisorStats.actual).split('.')[0]}</p>
                    </div>
                 </div>
              </div>

              {/* Pipeline Value */}
              <div className="lg:col-span-7 space-y-10">
                 <div className="bg-white rounded-3xl border border-slate-200 p-10 shadow-sm">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-10">Unrealized Revenue (Pipeline)</h3>
                    <div className="h-64">
                       <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={advisorStats.pipeline}>
                             <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 'bold'}} />
                             <Tooltip cursor={{fill: 'transparent'}} formatter={(v) => fmtSGD(toNum(v))} contentStyle={{borderRadius: '16px'}} />
                             <Bar dataKey="value" radius={[12, 12, 0, 0]} barSize={60}>
                                {advisorStats.pipeline.map((entry, index) => (
                                   <Cell key={index} fill={entry.color} />
                                ))}
                             </Bar>
                          </BarChart>
                       </ResponsiveContainer>
                    </div>
                 </div>

                 {/* High Potential Heatmap */}
                 <div className="bg-indigo-900 rounded-3xl p-10 text-white shadow-2xl">
                    <h3 className="text-xs font-black text-indigo-300 uppercase tracking-[0.2em] mb-8">High Probability Heatmap</h3>
                    <div className="space-y-4">
                       {advisorStats.potentialClients.map((c, i) => (
                          <div key={c.id} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl group hover:bg-white/10 transition-all">
                             <div className="flex items-center gap-4">
                                <div className="text-xl font-black text-indigo-400 w-6">0{i+1}</div>
                                <div>
                                   <p className="text-sm font-bold">{c.profile.name}</p>
                                   <p className="text-[10px] text-indigo-300/60 uppercase font-black tracking-widest">{c.stage}</p>
                                </div>
                             </div>
                             <div className="flex items-center gap-4">
                                <div className="text-right">
                                   <p className="text-xs font-black text-emerald-400">{fmtSGD(toNum(c.value))}</p>
                                   <p className="text-[9px] text-slate-500 uppercase font-bold">Exp. Revenue</p>
                                </div>
                                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex flex-col items-center justify-center border border-indigo-500/30">
                                   <span className="text-sm font-black">{c.momentumScore || 50}</span>
                                   <span className="text-[7px] uppercase font-black opacity-60">Score</span>
                                </div>
                             </div>
                          </div>
                       ))}
                       {advisorStats.potentialClients.length === 0 && (
                          <div className="text-center py-10 opacity-30 text-xs italic">No active opportunities found.</div>
                       )}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default ReportTab;