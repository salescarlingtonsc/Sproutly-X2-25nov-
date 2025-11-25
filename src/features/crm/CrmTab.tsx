
import React, { useMemo, useState } from 'react';
import { Client, Profile, LifecycleStage } from '../../types';
import { toNum, fmtSGD, getAge } from '../../lib/helpers';
import { computeCpf } from '../../lib/calculators';

interface CrmTabProps {
  clients: Client[];
  profile: Profile;
  selectedClientId: string | null;
  newClient: () => void;
  saveClient: () => void;
  loadClient: (c: Client) => void;
  deleteClient: (id: string) => void;
  setFollowUp: (id: string, days: number) => void;
  completeFollowUp: (id: string) => void;
  maxClients: number;
  userRole?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
}

type SortKey = 'name' | 'updated' | 'aum' | 'income' | 'followup_date';
type ViewMode = 'list' | 'pipeline';

// --- STAGE CONFIG ---
const PIPELINE_STAGES: { id: LifecycleStage; label: string; color: string; bg: string }[] = [
  { id: 'lead', label: 'New Lead', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  { id: 'contacted', label: 'Contacted', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' },
  { id: 'meeting', label: 'Meeting Set', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  { id: 'proposal', label: 'Proposal Sent', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
  { id: 'client', label: 'Active Client', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  { id: 'cold', label: 'Cold / Lost', color: 'text-gray-600', bg: 'bg-gray-100 border-gray-200' },
];

// Helper Components
const WhatsAppButton = ({ phone, name }: { phone: string, name: string }) => {
  if (!phone) return <span className="text-gray-300 text-xs">No Phone</span>;
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  // Assume SG if 8 digits, else keep as is
  const finalPhone = cleanPhone.length === 8 ? `65${cleanPhone}` : cleanPhone;
  
  return (
     <a 
        href={`https://wa.me/${finalPhone}?text=Hi ${name}, checking in regarding your financial plan.`} 
        target="_blank" 
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-colors"
        title="Open WhatsApp"
     >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
     </a>
  );
};

const CrmTab: React.FC<CrmTabProps> = (props) => {
  const { 
    clients, 
    selectedClientId, 
    newClient, 
    loadClient, 
    deleteClient, 
    completeFollowUp,
    maxClients,
    userRole,
    onRefresh,
    isLoading
  } = props;

  const isAdmin = userRole === 'admin';
  
  // --- STATE ---
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('pipeline');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'followup_date', direction: 'asc' });
  
  // Modal / Popover States
  const [datePickerTarget, setDatePickerTarget] = useState<string | null>(null); // Client ID
  
  const handleStageChange = (client: Client, newStage: LifecycleStage) => {
    loadClient({ ...client, lifecycleStage: newStage });
  };

  const handleFollowUpChange = (client: Client, date: string) => {
    loadClient({ 
       ...client, 
       followUp: { ...client.followUp, nextDate: date, status: 'pending' } 
    });
    setDatePickerTarget(null); // Close picker
  };

  const getFollowUpStatus = (dateStr: string | null, status: string) => {
    if (status === 'completed' || status === 'none' || !dateStr) return 'none';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    
    if (target < today) return 'overdue';
    if (target.getTime() === today.getTime()) return 'today';
    return 'upcoming';
  };

  // Process clients with metrics calculated inside the memo to avoid stale closures
  const processedClients = useMemo(() => {
    const currentDate = new Date();

    const calculateMetrics = (c: Client) => {
      // 1. Base Values (Snapshot at Start)
      const baseInvest = toNum(c.investorState?.portfolioValue, 0);
      const baseCpf = 
          toNum(c.cpfState?.currentBalances?.oa, 0) + 
          toNum(c.cpfState?.currentBalances?.sa, 0) + 
          toNum(c.cpfState?.currentBalances?.ma, 0);
      const baseCash = toNum(c.cashflowState?.currentSavings, 0);
      
      // 2. Income Calculation
      const gross = toNum(c.profile.monthlyIncome) || toNum(c.profile.grossSalary);
      let takeHome = toNum(c.profile.takeHome);
      
      // Estimate take home if missing
      if (!takeHome && gross > 0) {
          const age = c.profile.dob ? getAge(c.profile.dob) : 30;
          const cpfCalc = computeCpf(gross, age);
          takeHome = cpfCalc.takeHome;
      }
      
      // 3. Monthly Savings Calculation
      const expenseSum = Object.values(c.expenses).reduce((a, b) => a + toNum(b), 0);
      const customExpenseSum = (c.customExpenses || []).reduce((a, b) => a + toNum(b.amount), 0);
      const totalExpenses = expenseSum + customExpenseSum;
      
      // Net Monthly Savings (can be negative)
      const monthlySavings = (takeHome || 0) - totalExpenses;

      // 4. Time Projection
      // Use profile reference date or fallback to lastUpdated
      const refYear = c.profile.referenceYear || new Date(c.lastUpdated).getFullYear();
      const refMonth = c.profile.referenceMonth ?? new Date(c.lastUpdated).getMonth();
      
      // Calculate months passed since profile creation/update
      const monthsPassed = Math.max(0, (currentDate.getFullYear() - refYear) * 12 + (currentDate.getMonth() - refMonth));
      
      // 5. Projected Totals
      const projectedCash = baseCash + (monthlySavings * monthsPassed);
      
      // Net Worth = Investments + CPF + (BaseCash + AccumulatedSavings)
      const aum = baseInvest + baseCpf + projectedCash;
      
      return { income: takeHome, aum, monthlySavings, monthsPassed };
    };

    let result = clients.map(c => ({
      ...c,
      metrics: calculateMetrics(c)
    }));

    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(c => 
        c.profile.name.toLowerCase().includes(lowerTerm) || 
        c.profile.email.toLowerCase().includes(lowerTerm)
      );
    }
    
    // Sort
    result.sort((a, b) => {
      const metricsA = a.metrics;
      const metricsB = b.metrics;
      let valA: any = '';
      let valB: any = '';

      switch (sortConfig.key) {
        case 'name': valA = a.profile.name.toLowerCase(); valB = b.profile.name.toLowerCase(); break;
        case 'updated': valA = new Date(a.lastUpdated).getTime(); valB = new Date(b.lastUpdated).getTime(); break;
        case 'aum': valA = metricsA.aum; valB = metricsB.aum; break;
        case 'income': valA = metricsA.income; valB = metricsB.income; break;
        case 'followup_date':
          const dateA = a.followUp.status === 'pending' && a.followUp.nextDate ? new Date(a.followUp.nextDate).getTime() : (sortConfig.direction === 'asc' ? 9999999999999 : 0);
          const dateB = b.followUp.status === 'pending' && b.followUp.nextDate ? new Date(b.followUp.nextDate).getTime() : (sortConfig.direction === 'asc' ? 9999999999999 : 0);
          valA = dateA; valB = dateB;
          break;
      }
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [clients, searchTerm, sortConfig]);

  const handleSort = (key: SortKey) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const usedSlots = clients.length;

  // Render logic for the date picker popover
  const DatePickerPopover = ({ client }: { client: Client }) => {
     if (datePickerTarget !== client.id) return null;
     
     return (
        <div className="absolute z-50 mt-2 p-3 bg-white rounded-lg shadow-xl border border-gray-200 w-64" onClick={(e) => e.stopPropagation()}>
           <div className="text-xs font-bold text-gray-600 mb-2">Select Follow Up Date:</div>
           <input 
              type="date" 
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mb-2"
              onChange={(e) => handleFollowUpChange(client, e.target.value)}
              autoFocus
           />
           <div className="flex justify-between gap-2">
              <button 
                 onClick={(e) => { e.stopPropagation(); handleFollowUpChange(client, new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0]); }}
                 className="text-[10px] px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
              >
                 +7 Days
              </button>
              <button 
                 onClick={(e) => { e.stopPropagation(); handleFollowUpChange(client, new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]); }}
                 className="text-[10px] px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
              >
                 +1 Month
              </button>
              <button 
                 onClick={(e) => { e.stopPropagation(); setDatePickerTarget(null); }}
                 className="text-[10px] px-2 py-1 text-gray-500 hover:text-gray-700"
              >
                 Cancel
              </button>
           </div>
        </div>
     );
  };

  return (
    <div className="p-0 sm:p-5 h-[calc(100vh-100px)] flex flex-col bg-gray-50">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            🚀 Deal Pipeline & CRM
            {!isAdmin && (
              <span className={`text-xs px-2 py-0.5 rounded-full border ${maxClients - usedSlots < 3 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-white text-gray-600 border-gray-200'}`}>
                {usedSlots}/{maxClients} Active
              </span>
            )}
          </h2>
          <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
             📅 System Date: <span className="font-mono font-bold text-gray-700">{new Date().toLocaleDateString()}</span> 
             <span className="text-gray-400 mx-1">|</span> 
             Net Worth values projected to today
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
           {/* View Toggle */}
           <div className="flex bg-white border border-gray-200 rounded-lg p-1 mr-2 shadow-sm">
              <button 
                 onClick={() => setViewMode('pipeline')}
                 className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${viewMode === 'pipeline' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                 📶 Pipeline
              </button>
              <button 
                 onClick={() => setViewMode('list')}
                 className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${viewMode === 'list' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                 📋 List
              </button>
           </div>

           {onRefresh && (
             <button
                onClick={onRefresh}
                disabled={isLoading}
                className="px-3 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg text-xs font-bold hover:bg-gray-50 flex items-center gap-2 transition-colors"
             >
                <span className={isLoading ? 'animate-spin' : ''}>↻</span>
             </button>
           )}
           <button
             onClick={newClient}
             className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 shadow-sm text-xs flex items-center justify-center gap-2 transition-colors"
           >
             <span>+</span> New Deal
           </button>
        </div>
      </div>

      {/* SEARCH BAR (Common) */}
      <div className="mb-4 flex-shrink-0">
         <input 
            type="text" 
            placeholder="Search clients by name..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none"
         />
      </div>

      {/* ================= VIEW: PIPELINE (KANBAN) ================= */}
      {viewMode === 'pipeline' && (
         <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
            <div className="flex h-full gap-4 min-w-[1200px]">
               {PIPELINE_STAGES.map(stage => {
                  const stageClients = processedClients.filter(c => (c.lifecycleStage || 'lead') === stage.id);
                  const totalValue = stageClients.reduce((sum, c) => sum + c.metrics.aum, 0);

                  return (
                     <div key={stage.id} className={`flex-1 min-w-[280px] max-w-[320px] flex flex-col rounded-xl border ${stage.bg} h-full max-h-full`}>
                        {/* Column Header */}
                        <div className="p-3 border-b border-black/5 flex justify-between items-center bg-white/50 rounded-t-xl">
                           <div>
                              <div className={`text-sm font-bold uppercase tracking-wide ${stage.color}`}>{stage.label}</div>
                              <div className="text-[10px] text-gray-500 font-mono">{stageClients.length} deals • {fmtSGD(totalValue)}</div>
                           </div>
                        </div>

                        {/* Cards Container */}
                        <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-hide">
                           {stageClients.map(client => {
                              const metrics = client.metrics;
                              const fuStatus = getFollowUpStatus(client.followUp.nextDate, client.followUp.status);
                              const followUpDateObj = client.followUp.nextDate ? new Date(client.followUp.nextDate) : null;

                              return (
                                 <div 
                                    key={client.id} 
                                    onClick={() => loadClient(client)}
                                    className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group relative"
                                 >
                                    {/* Card Header */}
                                    <div className="flex justify-between items-start mb-2">
                                       <div>
                                          <div className="font-bold text-gray-800 text-sm">{client.profile.name}</div>
                                          <div className="text-[10px] text-gray-400">{client.profile.email}</div>
                                       </div>
                                       <WhatsAppButton phone={client.profile.phone} name={client.profile.name} />
                                    </div>

                                    {/* Metrics */}
                                    <div className="grid grid-cols-2 gap-1 mb-3">
                                       <div className="bg-gray-50 p-1.5 rounded border border-gray-100">
                                          <div className="text-[9px] text-gray-400 uppercase">Net Worth (Live)</div>
                                          <div className="text-xs font-bold text-emerald-700">{fmtSGD(metrics.aum)}</div>
                                       </div>
                                       <div className="bg-gray-50 p-1.5 rounded border border-gray-100">
                                          <div className="text-[9px] text-gray-400 uppercase">Mth Savings</div>
                                          <div className={`text-xs font-bold ${metrics.monthlySavings >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                                             {metrics.monthlySavings !== 0 ? fmtSGD(metrics.monthlySavings) : '-'}
                                          </div>
                                       </div>
                                    </div>

                                    {/* Follow Up Status */}
                                    <div className="flex justify-between items-center border-t border-gray-100 pt-2 relative">
                                       <div className="flex items-center gap-1.5">
                                          {client.followUp.status === 'pending' && followUpDateObj ? (
                                             <>
                                                <div className={`w-2 h-2 rounded-full ${fuStatus === 'overdue' ? 'bg-red-500 animate-pulse' : fuStatus === 'today' ? 'bg-amber-500' : 'bg-blue-500'}`}></div>
                                                <span className={`text-[10px] font-bold ${fuStatus === 'overdue' ? 'text-red-600' : 'text-gray-600'}`}>
                                                   {followUpDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                </span>
                                             </>
                                          ) : (
                                             <span className="text-[10px] text-gray-400 italic">No tasks</span>
                                          )}
                                       </div>
                                       
                                       {/* Quick Actions */}
                                       <div className="flex gap-1">
                                          <button
                                             onClick={(e) => { e.stopPropagation(); setDatePickerTarget(client.id); }}
                                             className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                             title="Schedule Follow Up"
                                          >
                                             📅
                                          </button>
                                          {/* Move Stage Dropdown (Hacky visual approach) */}
                                          <select
                                             onClick={(e) => e.stopPropagation()}
                                             onChange={(e) => handleStageChange(client, e.target.value as LifecycleStage)}
                                             value={client.lifecycleStage || 'lead'}
                                             className="w-4 h-6 opacity-0 absolute right-0 bottom-0" 
                                             title="Move Stage"
                                          />
                                          <button className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors pointer-events-none">
                                             ➡️
                                          </button>
                                       </div>
                                       
                                       {/* Date Picker Component Injection */}
                                       <DatePickerPopover client={client} />
                                    </div>
                                 </div>
                              );
                           })}
                        </div>
                     </div>
                  );
               })}
            </div>
         </div>
      )}

      {/* ================= VIEW: LIST (TABLE) ================= */}
      {viewMode === 'list' && (
         <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex-1 flex flex-col shadow-sm">
            <div className="flex-1 overflow-auto">
               <table className="min-w-full text-left border-collapse">
                  <thead className="bg-gray-50 sticky top-0 z-20 shadow-sm border-b border-gray-200">
                     <tr>
                        <th className="p-3 text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 border-r" onClick={() => handleSort('name')}>Client</th>
                        <th className="p-3 text-xs font-bold text-gray-500 uppercase tracking-wider border-r">Stage</th>
                        <th className="p-3 text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 border-r" onClick={() => handleSort('followup_date')}>📅 Next Action</th>
                        <th className="p-3 text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 border-r" onClick={() => handleSort('aum')}>Net Worth (Live)</th>
                        <th className="p-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Actions</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                     {processedClients.map(client => {
                        const metrics = client.metrics;
                        const fuStatus = getFollowUpStatus(client.followUp.nextDate, client.followUp.status);
                        const followUpDateObj = client.followUp.nextDate ? new Date(client.followUp.nextDate) : null;
                        
                        return (
                           <tr key={client.id} onClick={() => loadClient(client)} className="hover:bg-blue-50/50 transition-colors cursor-pointer text-sm group">
                              {/* Name */}
                              <td className="p-3 border-r border-gray-100">
                                 <div className="font-bold text-gray-800">{client.profile.name}</div>
                                 <div className="text-[10px] text-gray-400">{client.profile.email}</div>
                              </td>
                              
                              {/* Stage Selector */}
                              <td className="p-3 border-r border-gray-100" onClick={(e) => e.stopPropagation()}>
                                 <select 
                                    value={client.lifecycleStage || 'lead'}
                                    onChange={(e) => handleStageChange(client, e.target.value as LifecycleStage)}
                                    className="text-xs border-none bg-transparent font-semibold text-gray-600 focus:ring-0 cursor-pointer hover:bg-gray-100 rounded p-1"
                                 >
                                    {PIPELINE_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                 </select>
                              </td>

                              {/* Follow Up */}
                              <td className="p-3 border-r border-gray-100 relative">
                                 <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                       {client.followUp.status === 'pending' && followUpDateObj ? (
                                          <>
                                             <span className={`w-2 h-2 rounded-full ${fuStatus === 'overdue' ? 'bg-red-500' : 'bg-blue-500'}`}></span>
                                             <span className={`text-xs font-mono ${fuStatus === 'overdue' ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                                                {followUpDateObj.toLocaleDateString()}
                                             </span>
                                          </>
                                       ) : (
                                          <span className="text-gray-300 text-xs">-</span>
                                       )}
                                    </div>
                                    <div className="flex gap-1">
                                       {client.followUp.status === 'pending' && (
                                          <button 
                                             onClick={(e) => { e.stopPropagation(); completeFollowUp(client.id); }}
                                             className="p-1 text-emerald-500 hover:bg-emerald-50 rounded" 
                                             title="Complete"
                                          >✓</button>
                                       )}
                                       <button 
                                          onClick={(e) => { e.stopPropagation(); setDatePickerTarget(client.id); }}
                                          className="p-1 text-blue-500 hover:bg-blue-50 rounded" 
                                          title="Set Date"
                                       >📅</button>
                                    </div>
                                 </div>
                                 <DatePickerPopover client={client} />
                              </td>

                              {/* Net Worth */}
                              <td className="p-3 border-r border-gray-100 font-mono text-gray-700">
                                 <div>{fmtSGD(metrics.aum)}</div>
                                 <div className="text-[10px] text-gray-400">
                                    +{fmtSGD(metrics.monthlySavings)}/mo
                                 </div>
                              </td>

                              {/* Actions */}
                              <td className="p-3 text-center">
                                 <div className="flex justify-center gap-2">
                                    <WhatsAppButton phone={client.profile.phone} name={client.profile.name} />
                                    <button 
                                       onClick={(e) => { e.stopPropagation(); deleteClient(client.id); }}
                                       className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                       title="Delete"
                                    >
                                       🗑️
                                    </button>
                                 </div>
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
  );
};

export default CrmTab;
