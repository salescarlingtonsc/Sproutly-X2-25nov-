
import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, PieChart, Pie, Legend } from 'recharts';
import { Client, Stage, Advisor, Product, Team } from '../../../types';
import { LeadImporter } from './LeadImporter';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { Activity } from '../../../lib/db/activities';
import { fmtSGD } from '../../../lib/helpers';
import { useToast } from '../../../contexts/ToastContext';
import { generateDirectorBriefing } from '../../../lib/gemini';

interface DirectorDashboardProps {
  clients: Client[];
  advisors: Advisor[];
  teams: Team[];
  currentUser: Advisor;
  activities: Activity[];
  products: Product[];
  onUpdateClient: (client: Client) => void;
  onImport: (newClients: Client[]) => void;
  onUpdateAdvisor: (advisor: Advisor) => Promise<void>; // Updated to Promise
}

type TimeFilter = 'This Month' | 'Last Month' | 'This Quarter' | 'This Year' | 'All Time';
const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#6366f1'];

export const DirectorDashboard: React.FC<DirectorDashboardProps> = ({ clients, advisors, teams, currentUser, activities, products, onUpdateClient, onImport, onUpdateAdvisor }) => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'analytics' | 'products' | 'activity' | 'leads'>('analytics');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('This Month');
  const [showImporter, setShowImporter] = useState(false);
  const [showGoalSetter, setShowGoalSetter] = useState(false);
  const [filterAdvisor, setFilterAdvisor] = useState<string>('all');
  
  // Drill-down Modal States
  const [showActivityBreakdown, setShowActivityBreakdown] = useState(false);
  const [showVolBreakdown, setShowVolBreakdown] = useState(false);
  const [showEffBreakdown, setShowEffBreakdown] = useState(false);
  const [showCloseBreakdown, setShowCloseBreakdown] = useState(false);

  // Goal Setting State
  const [goalUpdates, setGoalUpdates] = useState<Record<string, string | number>>({});
  const [isSavingGoals, setIsSavingGoals] = useState(false);

  // Gemini State
  const [aiInsight, setAiInsight] = useState<{bottleneck: string, coaching_tip: string, strategic_observation: string} | null>(null);
  const [isThinking, setIsThinking] = useState(false);

  // --- Hierarchy Filter Logic ---
  const managedAdvisors = useMemo(() => {
      if (currentUser.isAgencyAdmin) return advisors;
      const myTeam = teams.find(t => t.leaderId === currentUser.id);
      if (!myTeam) return []; 
      return advisors.filter(a => a.teamId === myTeam.id);
  }, [advisors, teams, currentUser]);

  // Active advisors only for dropdowns
  const activeManagedAdvisors = useMemo(() => {
      return managedAdvisors.filter(a => a.status === 'active' || a.status === 'approved');
  }, [managedAdvisors]);

  const managedClients = useMemo(() => {
      const managedAdvisorIds = managedAdvisors.map(a => a.id);
      return clients.filter(c => c.advisorId && managedAdvisorIds.includes(c.advisorId));
  }, [clients, managedAdvisors]);

  // --- Date Range Engine (The Truth Source) ---
  const dateRange = useMemo(() => {
      const now = new Date();
      const start = new Date();
      const end = new Date();
      
      start.setHours(0,0,0,0);
      end.setHours(23,59,59,999);

      if (timeFilter === 'This Month') {
          start.setDate(1); // 1st of current month
      } else if (timeFilter === 'Last Month') {
          start.setMonth(now.getMonth() - 1);
          start.setDate(1);
          end.setDate(0); // Last day of previous month
      } else if (timeFilter === 'This Quarter') {
          const currQ = Math.floor(now.getMonth() / 3);
          start.setMonth(currQ * 3);
          start.setDate(1);
      } else if (timeFilter === 'This Year') {
          start.setMonth(0);
          start.setDate(1);
      } else {
          start.setFullYear(2000); // All time
      }
      return { start, end };
  }, [timeFilter]);

  // --- Aggregated Metrics Calculation (Event-Based) ---
  const breakdownStats = useMemo(() => {
      return managedAdvisors.map(adv => {
          const advClients = managedClients.filter(c => c.advisorId === adv.id);
          
          let closureVol = 0;
          let contacted = 0;
          let apptSet = 0;
          let apptMet = 0;
          let closed = 0;

          advClients.forEach(c => {
              // 1. Sales Volume (Based on Sale Date)
              (c.sales || []).forEach(sale => {
                  const saleDate = new Date(sale.date); // or inceptionDate
                  if (saleDate >= dateRange.start && saleDate <= dateRange.end) {
                      closureVol += (sale.premiumAmount || 0);
                  }
              });

              // 2. Closed Count (Client Level)
              if (c.milestones?.closedAt) {
                  const d = new Date(c.milestones.closedAt);
                  if (d >= dateRange.start && d <= dateRange.end) closed++;
              }

              // 3. Contacted
              if (c.milestones?.contactedAt) {
                  const d = new Date(c.milestones.contactedAt);
                  if (d >= dateRange.start && d <= dateRange.end) contacted++;
              }

              // 4. Appt Set
              if (c.milestones?.appointmentSetAt) {
                  const d = new Date(c.milestones.appointmentSetAt);
                  if (d >= dateRange.start && d <= dateRange.end) apptSet++;
              }

              // 5. Appt Met
              if (c.milestones?.appointmentMetAt) {
                  const d = new Date(c.milestones.appointmentMetAt);
                  if (d >= dateRange.start && d <= dateRange.end) apptMet++;
              }
          });

          // Ratios
          const efficiency = contacted > 0 ? (apptSet / contacted) * 100 : 0;
          const closeRate = apptMet > 0 ? (closed / apptMet) * 100 : 0;

          return {
              advisor: adv,
              closureVol,
              contacted,
              apptSet,
              apptMet,
              closed,
              efficiency,
              closeRate
          };
      }).sort((a, b) => b.closureVol - a.closureVol); 
  }, [managedAdvisors, managedClients, dateRange]);

  // --- Top Level Totals ---
  const totalClosureVol = breakdownStats.reduce((acc, curr) => acc + curr.closureVol, 0);
  const totalContacted = breakdownStats.reduce((acc, curr) => acc + curr.contacted, 0);
  const totalApptSet = breakdownStats.reduce((acc, curr) => acc + curr.apptSet, 0);
  const totalApptMet = breakdownStats.reduce((acc, curr) => acc + curr.apptMet, 0);
  const totalClosed = breakdownStats.reduce((acc, curr) => acc + curr.closed, 0);

  const avgEfficiency = totalContacted > 0 ? (totalApptSet / totalContacted * 100) : 0;
  const avgCloseRate = totalApptMet > 0 ? (totalClosed / totalApptMet * 100) : 0;

  // --- Funnel Data ---
  const funnelData = [
    { name: 'Contacted', value: totalContacted, fill: '#3b82f6' },
    { name: 'Appt Set', value: totalApptSet, fill: '#8b5cf6' },
    { name: 'Appt Met', value: totalApptMet, fill: '#f59e0b' },
    { name: 'Closed', value: totalClosed, fill: '#10b981' },
  ];

  // --- Activity Stats ---
  const activityStats = useMemo(() => {
      const stats: Record<string, { duration: number, lastActive: string }> = {};
      let totalSeconds = 0;

      activities.forEach(act => {
          const d = new Date(act.created_at);
          if (d >= dateRange.start && d <= dateRange.end) {
              if (managedAdvisors.find(a => a.id === act.user_id)) {
                  if (!stats[act.user_id || 'unknown']) {
                      stats[act.user_id || 'unknown'] = { duration: 0, lastActive: act.created_at };
                  }
                  const duration = act.details?.duration_sec || 0;
                  stats[act.user_id || 'unknown'].duration += duration;
                  totalSeconds += duration;
              }
          }
      });

      const breakdown = Object.entries(stats).map(([uid, data]) => {
          const advisor = managedAdvisors.find(a => a.id === uid);
          return {
              id: uid,
              name: advisor?.name || 'Unknown User',
              email: advisor?.email,
              duration: data.duration,
              lastActive: data.lastActive
          };
      }).sort((a,b) => b.duration - a.duration);

      return { totalSeconds, breakdown };
  }, [activities, managedAdvisors, dateRange]);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  // --- Product Logic (Event Based) ---
  const productStats = useMemo(() => {
      const providerRevenue: Record<string, number> = {};
      const productPerformance: Record<string, { count: number, revenue: number, name: string, provider: string }> = {};

      managedClients.forEach(c => {
          c.sales?.forEach(sale => {
             const saleDate = new Date(sale.date);
             if (saleDate >= dateRange.start && saleDate <= dateRange.end) {
                 const prod = products.find(p => p.id === sale.productId);
                 if (prod) {
                     providerRevenue[prod.provider] = (providerRevenue[prod.provider] || 0) + sale.premiumAmount;
                     if (!productPerformance[prod.id]) {
                         productPerformance[prod.id] = { count: 0, revenue: 0, name: prod.name, provider: prod.provider };
                     }
                     productPerformance[prod.id].count += 1;
                     productPerformance[prod.id].revenue += sale.premiumAmount;
                 }
             }
          });
      });

      const providerData = Object.entries(providerRevenue).map(([name, value]) => ({ name, value }));
      const topProducts = Object.values(productPerformance).sort((a,b) => b.revenue - a.revenue).slice(0, 10);

      return { providerData, topProducts };
  }, [managedClients, products, dateRange]);

  // --- Pipeline Velocity (All Time only for accuracy of averages) ---
  const velocityData = React.useMemo(() => {
    const stageDurations: Record<string, number[]> = {};
    const stagesOrdered = ['New Lead', 'Picked Up', 'NPU', 'Appt Set', 'Appt Met', 'Pending Decision'];

    managedClients.forEach(c => {
        if (!c.stageHistory || c.stageHistory.length < 2) return;
        const sortedHistory = [...c.stageHistory].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        for (let i = 0; i < sortedHistory.length - 1; i++) {
            const current = sortedHistory[i];
            const next = sortedHistory[i+1];
            const diffTime = new Date(next.date).getTime() - new Date(current.date).getTime();
            const days = diffTime / (1000 * 3600 * 24);
            const key = current.stage.includes('NPU') ? 'NPU' : current.stage;
            
            if (!stageDurations[key]) stageDurations[key] = [];
            stageDurations[key].push(days);
        }
    });

    return stagesOrdered.map(stage => {
        const durations = stageDurations[stage] || [];
        const avg = durations.length > 0 ? durations.reduce((a,b) => a+b, 0) / durations.length : 0;
        return { name: stage, avgDays: parseFloat(avg.toFixed(1)), count: durations.length };
    }).filter(d => d.avgDays > 0);
  }, [managedClients]);

  // --- Agent Efficiency ---
  const agentEfficiency = useMemo(() => {
    return managedAdvisors.map(advisor => {
        const advisorClients = clients.filter(c => c.advisorId === advisor.id);
        let newLeadDurations: number[] = [];
        advisorClients.forEach(c => {
            // Check milestones for contactedAt to get accurate efficiency regardless of time filter
            if (c.milestones?.createdAt && c.milestones?.contactedAt) {
                const diff = new Date(c.milestones.contactedAt).getTime() - new Date(c.milestones.createdAt).getTime();
                if (diff > 0) newLeadDurations.push(diff / (1000 * 3600));
            }
        });
        const avgResponseHours = newLeadDurations.length > 0 ? newLeadDurations.reduce((a,b) => a+b, 0) / newLeadDurations.length : 0;
        
        let rating: 'Excellent' | 'Average' | 'Needs Coaching' | 'No Data' = 'No Data';
        if (newLeadDurations.length > 0) {
            rating = avgResponseHours < 4 ? 'Excellent' : avgResponseHours > 24 ? 'Needs Coaching' : 'Average';
        }

        return {
            id: advisor.id,
            name: advisor.name,
            avatar: advisor.avatar,
            avgResponseHours,
            leadsProcessed: newLeadDurations.length,
            rating
        };
    }).sort((a,b) => a.avgResponseHours - b.avgResponseHours);
  }, [managedAdvisors, clients]);

  // --- Lead Management Logic ---
  const handleAssign = (clientId: string, newAdvisorId: string) => {
    const client = clients.find(c => c.id === clientId);
    const advisor = advisors.find(a => a.id === newAdvisorId);
    
    // IMPORTANT: Stamp the advisor's email so ClientCard displays correct custodian name immediately
    if (client && advisor) {
        onUpdateClient({ 
            ...client, 
            advisorId: newAdvisorId,
            _ownerId: newAdvisorId, // RLS Owner
            _ownerEmail: advisor.email // Visual Display Owner
        });
        toast.success(`Assigned to ${advisor.name}`);
    }
  };

  // --- Goal Setting Logic ---
  const handleGoalChange = (advisorId: string, val: string) => {
      // Allow raw string to support typing (clearing to empty string, typing decimals etc)
      setGoalUpdates(prev => ({ ...prev, [advisorId]: val }));
  };

  const handleSaveGoals = async () => {
      setIsSavingGoals(true);
      try {
          // Process updates
          const promises = Object.keys(goalUpdates).map(advisorId => {
              const advisor = managedAdvisors.find(a => a.id === advisorId);
              const rawVal = goalUpdates[advisorId];
              const numVal = rawVal === '' ? 0 : parseFloat(String(rawVal));
              
              if (advisor && !isNaN(numVal)) {
                  // Ensure we use the parsed number for the update
                  return onUpdateAdvisor({ ...advisor, annualGoal: numVal });
              }
              return Promise.resolve();
          });
          
          await Promise.all(promises);
          toast.success("Annual targets updated for team.");
          setShowGoalSetter(false);
          setGoalUpdates({});
      } catch (e: any) {
          console.error("Failed to save goals:", e);
          toast.error("Failed to save goals: " + e.message);
      } finally {
          setIsSavingGoals(false);
      }
  };

  const handleGenerateInsight = async () => {
    setIsThinking(true);
    // Prepare stats summary for AI
    const statsForAi = {
        totalClosureVol,
        totalContacted,
        avgEfficiency,
        avgCloseRate,
        topAdvisors: breakdownStats.slice(0, 3).map(b => ({name: b.advisor.name, volume: b.closureVol})),
        funnel: funnelData
    };
    const insight = await generateDirectorBriefing(statsForAi);
    setAiInsight(insight);
    setIsThinking(false);
  };

  const filteredLeadList = filterAdvisor === 'all' 
    ? managedClients 
    : managedClients.filter(c => c.advisorId === filterAdvisor);

  return (
    <div className="p-8 bg-slate-50 min-h-full animate-fade-in">
      {showImporter && (
        <LeadImporter 
          advisors={activeManagedAdvisors} // Use Active List
          onClose={() => setShowImporter(false)} 
          onImport={onImport} 
        />
      )}

      {/* ... (Breakdown Modals Omitted for Brevity - Keeping same as original) ... */}
      {showActivityBreakdown && (
          <Modal isOpen={showActivityBreakdown} onClose={() => setShowActivityBreakdown(false)} title="Team Activity Breakdown" footer={<Button variant="ghost" onClick={() => setShowActivityBreakdown(false)}>Close</Button>}>
             <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                   <thead>
                      <tr className="border-b border-slate-100 text-slate-500 text-xs text-left"><th className="py-2">Advisor</th><th className="py-2 text-right">Time Online</th></tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {activityStats.breakdown.map((row, idx) => (
                         <tr key={idx}><td className="py-3 font-medium text-slate-800">{row.name}</td><td className="py-3 text-right font-bold text-slate-800">{formatTime(row.duration)}</td></tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </Modal>
      )}

      {showVolBreakdown && (
          <Modal isOpen={showVolBreakdown} onClose={() => setShowVolBreakdown(false)} title="Closure Volume Breakdown" footer={<Button variant="ghost" onClick={() => setShowVolBreakdown(false)}>Close</Button>}>
             <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                   <thead>
                      <tr className="border-b border-slate-100 text-slate-500 text-xs text-left"><th className="py-2">Advisor</th><th className="py-2 text-right">Closed Deals</th><th className="py-2 text-right">Volume</th></tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {breakdownStats.sort((a,b) => b.closureVol - a.closureVol).map((row, idx) => (
                         <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-3 font-medium text-slate-800">{row.advisor.name}</td>
                            <td className="py-3 text-right text-slate-500">{row.closed}</td>
                            <td className="py-3 text-right font-bold text-emerald-600">{fmtSGD(row.closureVol)}</td>
                         </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </Modal>
      )}

      {showEffBreakdown && (
          <Modal isOpen={showEffBreakdown} onClose={() => setShowEffBreakdown(false)} title="Appointment Efficiency" footer={<Button variant="ghost" onClick={() => setShowEffBreakdown(false)}>Close</Button>}>
             <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                   <thead>
                      <tr className="border-b border-slate-100 text-slate-500 text-xs text-left"><th className="py-2">Advisor</th><th className="py-2 text-right">Contacted</th><th className="py-2 text-right">Set</th><th className="py-2 text-right">Rate</th></tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {breakdownStats.sort((a,b) => b.efficiency - a.efficiency).map((row, idx) => (
                         <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-3 font-medium text-slate-800">{row.advisor.name}</td>
                            <td className="py-3 text-right text-slate-500">{row.contacted}</td>
                            <td className="py-3 text-right text-slate-500">{row.apptSet}</td>
                            <td className={`py-3 text-right font-bold ${row.efficiency < 30 ? 'text-red-500' : 'text-slate-800'}`}>{row.efficiency.toFixed(1)}%</td>
                         </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </Modal>
      )}

      {showCloseBreakdown && (
          <Modal isOpen={showCloseBreakdown} onClose={() => setShowCloseBreakdown(false)} title="Close Rate Performance" footer={<Button variant="ghost" onClick={() => setShowCloseBreakdown(false)}>Close</Button>}>
             <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                   <thead>
                      <tr className="border-b border-slate-100 text-slate-500 text-xs text-left"><th className="py-2">Advisor</th><th className="py-2 text-right">Met</th><th className="py-2 text-right">Closed</th><th className="py-2 text-right">Rate</th></tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {breakdownStats.sort((a,b) => b.closeRate - a.closeRate).map((row, idx) => (
                         <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-3 font-medium text-slate-800">{row.advisor.name}</td>
                            <td className="py-3 text-right text-slate-500">{row.apptMet}</td>
                            <td className="py-3 text-right text-slate-500">{row.closed}</td>
                            <td className={`py-3 text-right font-bold ${row.closeRate < 20 ? 'text-red-500' : 'text-emerald-600'}`}>{row.closeRate.toFixed(1)}%</td>
                         </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </Modal>
      )}

      {showGoalSetter && (
          <Modal 
            isOpen={showGoalSetter} 
            onClose={() => setShowGoalSetter(false)} 
            title="Set Fiscal Year Targets"
            footer={
                <div className="flex gap-2 w-full">
                    <Button variant="ghost" onClick={() => setShowGoalSetter(false)}>Cancel</Button>
                    <Button variant="primary" onClick={handleSaveGoals} isLoading={isSavingGoals}>Save Targets</Button>
                </div>
            }
          >
             <div className="max-h-96 overflow-y-auto custom-scrollbar">
                <div className="mb-4 text-xs text-slate-500">Define the Annual Gross Revenue (AGR) target for each advisor in your unit.</div>
                <table className="w-full text-sm">
                   <thead className="bg-slate-50 sticky top-0 border-b border-slate-100">
                      <tr className="text-slate-500 text-[10px] uppercase font-bold text-left"><th className="py-3 px-2">Advisor</th><th className="py-3 px-2 text-right">Annual Goal ($)</th></tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {activeManagedAdvisors.map((adv) => (
                         <tr key={adv.id} className="hover:bg-slate-50">
                            <td className="py-3 px-2 flex items-center gap-3">
                                <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">{adv.avatar}</div>
                                <span className="font-bold text-slate-800 text-xs">{adv.name}</span>
                            </td>
                            <td className="py-3 px-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                    <span className="text-slate-400 text-xs">$</span>
                                    <input 
                                        type="number" 
                                        className="w-24 text-right p-1.5 border border-slate-200 rounded text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                        placeholder="0"
                                        value={goalUpdates[adv.id] !== undefined ? goalUpdates[adv.id] : (adv.annualGoal || '')}
                                        onChange={(e) => handleGoalChange(adv.id, e.target.value)}
                                    />
                                </div>
                            </td>
                         </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </Modal>
      )}

      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
                {currentUser.isAgencyAdmin ? 'Agency Overview' : 'Team Performance'}
            </h1>
            <p className="text-slate-500">
                Viewing data for {managedAdvisors.length} advisors.
            </p>
          </div>
          
          <div className="flex gap-4">
             {/* Time Filter */}
             <div className="bg-white rounded-lg border border-slate-200 p-1 flex shadow-sm">
                 {['This Month', 'Last Month', 'This Quarter', 'This Year', 'All Time'].map(tf => (
                    <button
                        key={tf}
                        onClick={() => setTimeFilter(tf as TimeFilter)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${timeFilter === tf ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
                    >
                        {tf}
                    </button>
                 ))}
             </div>

             <div className="bg-white p-1 rounded-xl border border-slate-200 flex shadow-sm">
                {['analytics', 'products', 'activity', 'leads'].map(tab => (
                    <button 
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-all capitalize ${activeTab === tab ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-900'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>
            
            <button 
                onClick={() => setShowGoalSetter(true)}
                className="bg-emerald-50 text-emerald-700 font-bold px-4 py-2 rounded-lg text-xs hover:bg-emerald-100 transition-colors border border-emerald-100 shadow-sm flex items-center gap-2"
            >
                <span>🎯</span> Set Targets
            </button>
          </div>
        </header>

        {activeTab === 'analytics' && (
          <>
            {/* Top Level Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
              <div 
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                onClick={() => setShowActivityBreakdown(true)}
              >
                 <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex justify-between">
                    Team Activity
                    <span className="opacity-0 group-hover:opacity-100 text-indigo-500">View ↗</span>
                 </p>
                 <p className="text-3xl font-bold text-slate-900">{formatTime(activityStats.totalSeconds)}</p>
                 <p className="text-xs text-emerald-600 mt-2 font-medium">Across {managedAdvisors.length} active agents</p>
              </div>
              <div 
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                onClick={() => setShowVolBreakdown(true)}
              >
                 <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex justify-between">
                    Total Closure Vol
                    <span className="opacity-0 group-hover:opacity-100 text-indigo-500">View ↗</span>
                 </p>
                 <p className="text-3xl font-bold text-slate-900">
                    {fmtSGD(totalClosureVol).split('.')[0]}
                 </p>
                 <p className="text-xs text-slate-400 mt-2">Weighted Pipeline ({timeFilter})</p>
              </div>
              <div 
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                onClick={() => setShowEffBreakdown(true)}
              >
                 <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex justify-between">
                    Appt Efficiency
                    <span className="opacity-0 group-hover:opacity-100 text-indigo-500">View ↗</span>
                 </p>
                 <p className="text-3xl font-bold text-slate-900">{avgEfficiency.toFixed(1)}%</p>
                 <p className="text-xs text-slate-500 mt-2">Contact → Appt Rate</p>
              </div>
              <div 
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                onClick={() => setShowCloseBreakdown(true)}
              >
                 <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex justify-between">
                    Close Rate
                    <span className="opacity-0 group-hover:opacity-100 text-indigo-500">View ↗</span>
                 </p>
                 <p className="text-3xl font-bold text-emerald-600">{avgCloseRate.toFixed(1)}%</p>
                 <p className="text-xs text-slate-500 mt-2">Appt Met → Closed</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-semibold text-slate-800 mb-6">Conversion Funnel ({timeFilter})</h3>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                       <XAxis type="number" hide />
                       <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 12}} />
                       <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                       <Bar dataKey="value" barSize={30} radius={[0, 4, 4, 0]}>
                          {funnelData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                       </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* DYNAMIC AI COACHING CARD */}
              <div className="bg-slate-900 p-6 rounded-2xl text-white shadow-lg flex flex-col relative overflow-hidden group">
                {/* Visual Effect */}
                <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/20 rounded-full blur-[60px] group-hover:bg-indigo-500/30 transition-all duration-1000"></div>
                
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2 relative z-10">
                   <span className="text-2xl">🧠</span>
                   Strategic Director
                </h3>
                
                <div className="flex-1 relative z-10">
                   {isThinking ? (
                       <div className="flex flex-col items-center justify-center h-40 animate-pulse">
                           <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mb-3"></div>
                           <p className="text-xs text-indigo-300 font-medium">Analyzing agency data...</p>
                       </div>
                   ) : aiInsight ? (
                       <div className="animate-in fade-in slide-in-from-bottom-2">
                           <div className="mb-4">
                               <p className="text-[10px] text-indigo-300 uppercase font-black tracking-widest mb-1">Identified Bottleneck</p>
                               <p className="text-sm font-bold text-white leading-tight">{aiInsight.bottleneck}</p>
                           </div>
                           <div className="mb-4">
                               <p className="text-[10px] text-emerald-400 uppercase font-black tracking-widest mb-1">Coaching Protocol</p>
                               <p className="text-xs font-medium text-slate-300 leading-relaxed bg-white/5 p-2 rounded-lg border border-white/10">
                                   "{aiInsight.coaching_tip}"
                               </p>
                           </div>
                           <div>
                               <p className="text-[10px] text-amber-400 uppercase font-black tracking-widest mb-1">Observation</p>
                               <p className="text-xs text-slate-400 leading-tight">{aiInsight.strategic_observation}</p>
                           </div>
                       </div>
                   ) : (
                       <div className="flex flex-col justify-center h-40 text-center">
                           <p className="text-sm text-slate-400 mb-2">Ready to analyze team performance.</p>
                           <p className="text-xs text-indigo-400">Uses Gemini 3 Pro reasoning.</p>
                       </div>
                   )}
                </div>
                
                <button 
                    onClick={handleGenerateInsight}
                    disabled={isThinking}
                    className="w-full py-3 mt-4 bg-white text-slate-900 rounded-xl text-xs font-bold hover:bg-indigo-50 transition-colors shadow-lg relative z-10 disabled:opacity-50"
                >
                  {isThinking ? 'Processing...' : aiInsight ? '↻ Regenerate Strategy' : 'Generate Director Brief'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ... (Rest of the tabs: products, activity, leads remain unchanged) ... */}
        {activeTab === 'products' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                    <h3 className="font-bold text-slate-800 mb-2">Revenue by Provider</h3>
                    <div className="flex-1 min-h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={productStats.providerData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {productStats.providerData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                 <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                     <h3 className="font-bold text-slate-800 mb-6">Top Selling Products</h3>
                     <div className="flex-1 overflow-auto">
                         <table className="w-full text-left text-sm">
                             <thead className="bg-slate-50 border-b border-slate-100">
                                 <tr>
                                     <th className="px-4 py-2 font-semibold text-slate-600">Product</th>
                                     <th className="px-4 py-2 font-semibold text-slate-600">Cases</th>
                                     <th className="px-4 py-2 font-semibold text-slate-600 text-right">Revenue</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-slate-50">
                                 {productStats.topProducts.map((p, idx) => (
                                     <tr key={idx}>
                                         <td className="px-4 py-3">
                                             <div className="font-medium text-slate-800">{p.name}</div>
                                             <div className="text-xs text-slate-500">{p.provider}</div>
                                         </td>
                                         <td className="px-4 py-3 font-mono text-slate-600">{p.count}</td>
                                         <td className="px-4 py-3 text-right font-bold text-emerald-600">${p.revenue.toLocaleString()}</td>
                                     </tr>
                                 ))}
                             </tbody>
                         </table>
                     </div>
                </div>
            </div>
        )}

        {/* ACTIVITY TRACKER */}
        {activeTab === 'activity' && (
            <div className="space-y-6">
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="mb-8">
                        <h3 className="text-lg font-bold text-slate-800">Pipeline Velocity (All Time)</h3>
                        <p className="text-sm text-slate-500">Average days spent in each stage across all advisors.</p>
                    </div>
                    <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={velocityData} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="name" tick={{fontSize: 11}} angle={-45} textAnchor="end" height={60} />
                                <YAxis tick={{fontSize: 12}} />
                                <Tooltip 
                                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                    cursor={{fill: '#f8fafc'}}
                                />
                                <Bar dataKey="avgDays" radius={[4, 4, 0, 0]} barSize={40}>
                                    {velocityData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.avgDays > 14 ? '#ef4444' : entry.avgDays > 7 ? '#f59e0b' : '#3b82f6'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 bg-slate-50">
                        <h3 className="text-lg font-bold text-slate-800">Agent Efficiency Tracker</h3>
                        <p className="text-sm text-slate-500">Response times and NPU movement analysis.</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase text-xs tracking-wider">
                                    <th className="px-6 py-4 font-semibold">Advisor</th>
                                    <th className="px-6 py-4 font-semibold">Speed to Contact <span className="normal-case font-normal text-slate-400">(New → Contacted)</span></th>
                                    <th className="px-6 py-4 font-semibold">Leads Processed</th>
                                    <th className="px-6 py-4 font-semibold text-right">Efficiency Rating</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {agentEfficiency.map(agent => (
                                    <tr key={agent.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">{agent.avatar}</div>
                                                <div className="font-medium text-slate-900">{agent.name}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {agent.leadsProcessed > 0 ? (
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-sm font-bold ${agent.avgResponseHours < 4 ? 'text-emerald-600' : agent.avgResponseHours > 24 ? 'text-rose-600' : 'text-slate-700'}`}>
                                                        {agent.avgResponseHours < 24 
                                                            ? `${agent.avgResponseHours.toFixed(1)} hrs`
                                                            : `${(agent.avgResponseHours / 24).toFixed(1)} days`
                                                        }
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-400 text-xs italic">No data</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {agent.leadsProcessed}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {agent.rating === 'Excellent' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">Excellent</span>}
                                            {agent.rating === 'Average' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">Average</span>}
                                            {agent.rating === 'Needs Coaching' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800">Needs Coaching</span>}
                                            {agent.rating === 'No Data' && <span className="text-slate-400 text-xs">-</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {/* LEADS TAB */}
        {activeTab === 'leads' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
             <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <h3 className="font-bold text-slate-800">Lead Assignment</h3>
                  <select 
                    value={filterAdvisor} 
                    onChange={e => setFilterAdvisor(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  >
                    <option value="all">All My Agents</option>
                    {activeManagedAdvisors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <button 
                  onClick={() => setShowImporter(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  Import Leads
                </button>
             </div>
             
             <div className="overflow-x-auto">
               <table className="w-full text-left text-sm">
                 <thead className="bg-slate-50 border-b border-slate-100">
                   <tr>
                     <th className="px-6 py-3 font-semibold text-slate-500">Client Name</th>
                     <th className="px-6 py-3 font-semibold text-slate-500">Stage</th>
                     <th className="px-6 py-3 font-semibold text-slate-500">Value</th>
                     <th className="px-6 py-3 font-semibold text-slate-500">Current Advisor</th>
                     <th className="px-6 py-3 font-semibold text-slate-500">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {filteredLeadList.map(client => {
                     const currentAdvisor = advisors.find(a => a.id === client.advisorId);
                     return (
                       <tr key={client.id} className="hover:bg-slate-50/50 transition-colors">
                         <td className="px-6 py-3">
                           <div className="font-medium text-slate-900">{client.name}</div>
                           <div className="text-xs text-slate-400">{client.company}</div>
                         </td>
                         <td className="px-6 py-3">
                           <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                             {client.stage}
                           </span>
                         </td>
                         <td className="px-6 py-3 font-medium text-slate-600">${(client.value || 0).toLocaleString()}</td>
                         <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                               <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">
                                  {currentAdvisor?.avatar || '??'}
                               </div>
                               <span>{currentAdvisor?.name || 'Unassigned'}</span>
                            </div>
                         </td>
                         <td className="px-6 py-3">
                           <select 
                             value={client.advisorId || ''}
                             onChange={(e) => handleAssign(client.id, e.target.value)}
                             className="bg-white border border-slate-200 text-slate-600 text-xs rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                           >
                             <option value="" disabled>Re-assign...</option>
                             {activeManagedAdvisors.map(adv => (
                               <option key={adv.id} value={adv.id}>{adv.name}</option>
                             ))}
                           </select>
                         </td>
                       </tr>
                     );
                   })}
                 </tbody>
               </table>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
