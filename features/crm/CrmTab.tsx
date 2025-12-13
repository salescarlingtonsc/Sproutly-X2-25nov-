
import React, { useMemo, useState } from 'react';
import { Client, Profile, ContactStatus, LeadSource, ClientDocument } from '../../types';
import { toNum, fmtSGD, getAge } from '../../lib/helpers';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, Legend, ComposedChart, Line
} from 'recharts';

interface CrmTabProps {
  clients: Client[];
  profile: Profile;
  selectedClientId: string | null;
  newClient: () => void;
  saveClient: () => void;
  loadClient: (c: Client, redirect?: boolean) => void;
  deleteClient: (id: string) => void;
  setFollowUp: (id: string, days: number) => void; 
  completeFollowUp: (id: string) => void;
  maxClients: number;
  userRole?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
  onBack?: () => void;
}

// --- AIRTABLE-STYLE CONFIGURATION ---

// 1. PROBABILITY MAPPING (The "Logic")
const STATUS_METRICS: Record<ContactStatus, { label: string; prob: number; color: string; bg: string }> = {
  'new': { label: 'New Lead', prob: 0.1, color: 'text-blue-700', bg: 'bg-blue-100' },
  'picked_up': { label: 'Contacted', prob: 0.2, color: 'text-indigo-700', bg: 'bg-indigo-100' },
  'npu1': { label: 'NPU 1', prob: 0.05, color: 'text-amber-700', bg: 'bg-amber-50' },
  'npu2': { label: 'NPU 2', prob: 0.05, color: 'text-amber-700', bg: 'bg-amber-100' },
  'npu3': { label: 'NPU 3', prob: 0.02, color: 'text-orange-700', bg: 'bg-orange-100' },
  'npu4': { label: 'NPU 4', prob: 0.01, color: 'text-orange-800', bg: 'bg-orange-200' },
  'npu5': { label: 'NPU 5', prob: 0.0, color: 'text-red-700', bg: 'bg-red-100' },
  'npu6': { label: 'NPU 6', prob: 0.0, color: 'text-red-800', bg: 'bg-red-200' },
  'call_back': { label: 'Call Back', prob: 0.3, color: 'text-purple-700', bg: 'bg-purple-100' },
  'not_keen': { label: 'Lost', prob: 0.0, color: 'text-gray-500', bg: 'bg-gray-200' },
  'appt_set': { label: 'Appt Set', prob: 0.6, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  'client': { label: 'Won', prob: 1.0, color: 'text-teal-800', bg: 'bg-teal-200' },
};

const SOURCE_CONFIG: Record<LeadSource, { label: string; color: string }> = {
  'IG': { label: 'Instagram', color: '#E1306C' },
  'FB': { label: 'Facebook', color: '#4267B2' },
  'LinkedIn': { label: 'LinkedIn', color: '#0077b5' },
  'Roadshow': { label: 'Roadshow', color: '#F59E0B' },
  'Referral': { label: 'Referral', color: '#8B5CF6' },
  'Cold': { label: 'Cold Call', color: '#6B7280' },
  'Other': { label: 'Other', color: '#9CA3AF' },
};

// --- SMART LOGIC HELPER ---
const calculateDealMetrics = (c: Client) => {
  // 1. Estimated Deal Size (The "Value")
  let potentialRevenue = 0;
  
  const annualPrem = toNum(c.wealthState?.annualPremium);
  const portfolio = toNum(c.investorState?.portfolioValue);
  const income = toNum(c.profile.monthlyIncome) || toNum(c.profile.grossSalary);

  if (annualPrem > 0) {
    potentialRevenue += annualPrem * 0.5; // High confidence
  } else if (income > 0) {
    potentialRevenue += (income * 12) * 0.03; // Estimated 3% of annual income as revenue
  }

  if (portfolio > 0) {
    potentialRevenue += portfolio * 0.01; // 1% trailer/fee
  }

  // Fallback for new leads with no data
  if (potentialRevenue === 0) potentialRevenue = 1000; 

  // 2. Probability Weighted Value
  const statusKey = c.followUp.status as ContactStatus;
  const probability = STATUS_METRICS[statusKey]?.prob || 0.1;
  const weightedValue = potentialRevenue * probability;

  // 3. Stale Logic
  const lastEdit = new Date(c.lastUpdated).getTime();
  const now = new Date().getTime();
  const daysInactive = Math.floor((now - lastEdit) / (1000 * 60 * 60 * 24));
  const isStale = daysInactive > 14;

  // 4. SMART TAGGING (AUTOMATION)
  const autoTags = [];
  const netWorth = toNum(c.cashflowState?.currentSavings) + portfolio;
  const insuranceDeath = toNum(c.insuranceState?.currentDeath);
  
  if (netWorth > 1000000) autoTags.push({ label: '🐳 Whale', color: 'bg-purple-100 text-purple-800' });
  else if (income > 10000) autoTags.push({ label: '💰 High Income', color: 'bg-emerald-100 text-emerald-800' });
  
  if (income > 0 && insuranceDeath < income * 5) autoTags.push({ label: '🛡️ Gap', color: 'bg-red-100 text-red-800' });
  
  if (c.profile.children && c.profile.children.length > 0) autoTags.push({ label: '👶 Family', color: 'bg-blue-50 text-blue-600' });

  // 5. NEXT BEST ACTION (The Closer)
  let nextAction = "Call & Check-in";
  let actionColor = "text-gray-600 bg-gray-100";

  if (statusKey === 'new') {
     nextAction = "First Contact";
     actionColor = "text-blue-700 bg-blue-100";
  } else if (isStale) {
     nextAction = "Re-engage";
     actionColor = "text-red-700 bg-red-100 animate-pulse";
  } else if (statusKey === 'appt_set') {
     nextAction = "Prep Meeting";
     actionColor = "text-emerald-700 bg-emerald-100";
  } else if (insuranceDeath < income * 5 && income > 0) {
     nextAction = "Pitch Protection";
     actionColor = "text-amber-700 bg-amber-100";
  } else if (netWorth > 100000) {
     nextAction = "Wealth Review";
     actionColor = "text-purple-700 bg-purple-100";
  }

  return { potentialRevenue, probability, weightedValue, daysInactive, isStale, autoTags, nextAction, actionColor };
};

// --- COMPONENTS ---

const StatusBadge = ({ status }: { status: ContactStatus }) => {
  const config = STATUS_METRICS[status] || STATUS_METRICS['new'];
  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded-md border border-transparent ${config.bg}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${config.color.replace('text-', 'bg-')}`}></div>
      <span className={`text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
        {config.label}
      </span>
    </div>
  );
};

const CrmTab: React.FC<CrmTabProps> = (props) => {
  const {
    clients,
    loadClient,
    deleteClient,
    saveClient,
    onRefresh,
    newClient
  } = props;

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'pipeline'>('pipeline');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeClient, setActiveClient] = useState<Client | null>(null);

  // --- ACTIONS ---

  const handleRowClick = (client: Client) => {
    setActiveClient(client);
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setActiveClient(null);
  };

  const updateActiveClient = (field: string, value: any, nested?: string) => {
    if (!activeClient) return;
    let updatedClient = { ...activeClient };

    if (nested === 'profile') {
      updatedClient.profile = { ...updatedClient.profile, [field]: value };
    } else if (nested === 'appointments') {
      updatedClient.appointments = { ...updatedClient.appointments || { firstApptDate: null, nextFollowUpDate: null }, [field]: value };
    } else if (nested === 'followUp') {
        updatedClient.followUp = { ...updatedClient.followUp, [field]: value };
    } else {
      (updatedClient as any)[field] = value;
    }

    setActiveClient(updatedClient);
    loadClient(updatedClient, false); // Auto-sync to parent
    setTimeout(() => saveClient(), 500); // Debounce save
  };

  // --- DATA PROCESSING (THE BRAIN) ---

  const enrichedClients = useMemo(() => {
    return clients.map(c => ({
      ...c,
      metrics: calculateDealMetrics(c)
    })).filter(c => {
      const matchesSearch = 
        c.profile.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.profile.phone.includes(searchTerm);
      const matchesStatus = filterStatus === 'all' || c.followUp.status === filterStatus;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated)); // Newest first
  }, [clients, searchTerm, filterStatus]);

  const pipelineStats = useMemo(() => {
    let totalPotential = 0;
    let totalWeighted = 0;
    let staleCount = 0;
    
    // Aggregate for Chart
    const stageMap: Record<string, { name: string, potential: number, weighted: number, count: number }> = {};

    enrichedClients.forEach(c => {
      totalPotential += c.metrics.potentialRevenue;
      totalWeighted += c.metrics.weightedValue;
      if (c.metrics.isStale) staleCount++;

      const statusKey = c.followUp.status;
      const label = STATUS_METRICS[statusKey as ContactStatus]?.label || statusKey;
      
      if (!stageMap[label]) {
        stageMap[label] = { name: label, potential: 0, weighted: 0, count: 0 };
      }
      stageMap[label].potential += c.metrics.potentialRevenue;
      stageMap[label].weighted += c.metrics.weightedValue;
      stageMap[label].count += 1;
    });

    // Convert map to array for Recharts, sorted by probability (Pipeline Flow)
    const chartData = Object.values(stageMap).sort((a, b) => {
       const order = ['New Lead', 'Contacted', 'Appt Set', 'Won', 'Lost', 'NPU 1', 'NPU 2', 'Call Back'];
       return order.indexOf(a.name) - order.indexOf(b.name);
    });

    return { totalPotential, totalWeighted, staleCount, chartData };
  }, [enrichedClients]);

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col bg-gray-50 overflow-hidden">
      
      {/* 1. TOP STATS BAR (The "Money" View) */}
      <div className="bg-white border-b border-gray-200 p-4 flex flex-wrap gap-6 items-center shadow-sm z-20">
         <div className="flex-1 min-w-[200px]">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
               CRM <span className="text-gray-400 font-light">|</span> <span className="text-sm font-medium text-gray-500">Pipeline View</span>
            </h2>
         </div>
         
         <div className="flex gap-8">
            <div className="text-right">
               <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Weighted Pipeline</div>
               <div className="text-xl font-extrabold text-emerald-600">{fmtSGD(pipelineStats.totalWeighted)}</div>
            </div>
            <div className="text-right hidden sm:block">
               <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Potential</div>
               <div className="text-xl font-bold text-gray-700">{fmtSGD(pipelineStats.totalPotential)}</div>
            </div>
            <div className="text-right hidden sm:block">
               <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Stale Leads</div>
               <div className={`text-xl font-bold ${pipelineStats.staleCount > 0 ? 'text-red-500' : 'text-gray-700'}`}>
                  {pipelineStats.staleCount}
               </div>
            </div>
         </div>

         <div className="flex bg-gray-100 p-1 rounded-lg">
            <button 
              onClick={() => setViewMode('pipeline')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'pipeline' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              📊 Forecast
            </button>
            <button 
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              📋 Master List
            </button>
         </div>
         
         <button 
            onClick={newClient}
            className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-indigo-700 flex items-center gap-2"
         >
            <span>＋</span> New Lead
         </button>
      </div>

      {/* 2. MAIN CONTENT AREA */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        
        {/* VIEW: FORECAST ANALYTICS */}
        {viewMode === 'pipeline' && (
          <div className="w-full h-full overflow-y-auto p-6 animate-fade-in">
             <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6">
                <div className="flex justify-between items-center mb-6">
                   <h3 className="font-bold text-gray-700">Revenue Forecast by Stage</h3>
                   <div className="flex gap-2 text-xs">
                      <span className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-400 rounded-sm"></div> Weighted (Likely)</span>
                      <span className="flex items-center gap-1"><div className="w-3 h-3 bg-indigo-200 rounded-sm"></div> Upside (Total)</span>
                   </div>
                </div>
                <div className="h-[300px]">
                   <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={pipelineStats.chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} />
                         <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                         <YAxis fontSize={11} tickFormatter={(val) => `$${val/1000}k`} tickLine={false} axisLine={false} />
                         <Tooltip 
                            cursor={{ fill: '#f9fafb' }}
                            formatter={(value: number) => fmtSGD(value)}
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                         />
                         <Bar dataKey="potential" fill="#e0e7ff" radius={[4, 4, 0, 0]} barSize={40} name="Total Potential" />
                         <Bar dataKey="weighted" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} name="Weighted Value" />
                      </ComposedChart>
                   </ResponsiveContainer>
                </div>
             </div>

             {/* Stale Leads Warning */}
             {pipelineStats.staleCount > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                   <h4 className="font-bold text-red-800 text-sm flex items-center gap-2 mb-3">
🔥 Action Required: {pipelineStats.staleCount} Stale Leads (&gt;14 days inactive)                   </h4>
                   <div className="overflow-x-auto">
                      <div className="flex gap-4 pb-2">
                         {enrichedClients.filter(c => c.metrics.isStale).map(c => (
                            <div 
                              key={c.id} 
                              onClick={() => handleRowClick(c)}
                              className="min-w-[200px] bg-white p-3 rounded-lg border border-red-100 shadow-sm cursor-pointer hover:border-red-300 transition-colors"
                            >
                               <div className="font-bold text-gray-800">{c.profile.name}</div>
                               <div className="text-xs text-red-500 font-mono mt-1">{c.metrics.daysInactive} days idle</div>
                               <div className="mt-2 text-xs text-gray-500 truncate">{c.profile.phone}</div>
                            </div>
                         ))}
                      </div>
                   </div>
                </div>
             )}
          </div>
        )}

        {/* VIEW: AIRTABLE GRID */}
        {viewMode === 'grid' && (
          <div className="flex-1 flex flex-col bg-white">
            {/* Toolbar */}
            <div className="bg-white border-b border-gray-200 p-2 flex gap-2 items-center">
               <div className="relative">
                  <span className="absolute left-2.5 top-2 text-gray-400 text-xs">🔍</span>
                  <input 
                    type="text" 
                    placeholder="Search..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-md w-48 focus:ring-1 focus:ring-indigo-500 outline-none bg-gray-50"
                  />
               </div>
               <select 
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="py-1.5 px-2 text-xs border border-gray-300 rounded-md bg-gray-50 font-medium text-gray-700"
               >
                  <option value="all">All Statuses</option>
                  {Object.keys(STATUS_METRICS).map(k => <option key={k} value={k}>{STATUS_METRICS[k as ContactStatus].label}</option>)}
               </select>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse min-w-[1200px]">
                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="p-3 text-[10px] font-extrabold text-gray-400 uppercase border-b border-r border-gray-200 w-[200px]">Client</th>
                    <th className="p-3 text-[10px] font-extrabold text-gray-400 uppercase border-b border-r border-gray-200 w-[140px]">Next Best Action</th>
                    <th className="p-3 text-[10px] font-extrabold text-gray-400 uppercase border-b border-r border-gray-200 w-[140px]">Status</th>
                    <th className="p-3 text-[10px] font-extrabold text-gray-400 uppercase border-b border-r border-gray-200 w-[100px] text-right">Value</th>
                    <th className="p-3 text-[10px] font-extrabold text-gray-400 uppercase border-b border-r border-gray-200 w-[150px]">Smart Tags</th>
                    <th className="p-3 text-[10px] font-extrabold text-gray-400 uppercase border-b border-r border-gray-200 w-[100px]">Last Touch</th>
                    <th className="p-3 text-[10px] font-extrabold text-gray-400 uppercase border-b border-gray-200">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {enrichedClients.map(client => {
                    return (
                      <tr 
                        key={client.id} 
                        onClick={() => handleRowClick(client)}
                        className="hover:bg-indigo-50/50 cursor-pointer transition-colors group text-sm"
                      >
                        <td className="p-3 border-r border-gray-100">
                           <div className="font-bold text-gray-900">{client.profile.name}</div>
                           <div className="text-[11px] text-gray-400 truncate">{client.profile.jobTitle || 'No Title'}</div>
                        </td>
                        <td className="p-3 border-r border-gray-100">
                           <span className={`text-[10px] font-bold px-2 py-1 rounded border border-transparent ${client.metrics.actionColor}`}>
                              {client.metrics.nextAction}
                           </span>
                        </td>
                        <td className="p-3 border-r border-gray-100">
                           <StatusBadge status={client.followUp.status} />
                        </td>
                        <td className="p-3 border-r border-gray-100 text-right font-mono text-gray-600">
                           {fmtSGD(client.metrics.potentialRevenue)}
                        </td>
                        <td className="p-3 border-r border-gray-100">
                           <div className="flex gap-1 flex-wrap">
                              {client.metrics.autoTags.map((tag, i) => (
                                 <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded border border-transparent ${tag.color}`}>
                                    {tag.label}
                                 </span>
                              ))}
                           </div>
                        </td>
                        <td className="p-3 border-r border-gray-100">
                           <div className="flex items-center gap-2">
                              {client.metrics.isStale && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="Stale Lead"></div>}
                              <span className={`text-xs ${client.metrics.isStale ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                                 {client.metrics.daysInactive === 0 ? 'Today' : `${client.metrics.daysInactive}d`}
                              </span>
                           </div>
                        </td>
                        <td className="p-3 border-gray-100 text-xs text-gray-500">
                           <span className="px-2 py-0.5 border rounded bg-gray-50">
                              {SOURCE_CONFIG[client.profile.source as LeadSource]?.label || 'Other'}
                           </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. DEAL DRAWER (Slide Over) */}
        {drawerOpen && activeClient && (
          <div className="absolute inset-y-0 right-0 w-full md:w-[450px] bg-white shadow-2xl border-l border-gray-200 transform transition-transform duration-300 ease-in-out z-30 flex flex-col">
             
             {/* Drawer Header */}
             <div className="bg-gray-50 p-4 border-b border-gray-200 flex justify-between items-start">
                <div>
                   <h2 className="text-xl font-bold text-gray-900">{activeClient.profile.name}</h2>
                   <div className="text-xs text-gray-500 mt-1 flex gap-2">
                      <span className="bg-white border px-1.5 rounded">{activeClient.referenceCode}</span>
                   </div>
                </div>
                <button onClick={handleCloseDrawer} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
             </div>

             {/* Drawer Content */}
             <div className="flex-1 overflow-y-auto p-5 space-y-6">
                
                {/* 1. Status Control */}
                <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                   <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-2">Deal Stage</label>
                   <div className="grid grid-cols-2 gap-3">
                      <select 
                        className="w-full p-2 text-sm border border-indigo-200 rounded-lg bg-white font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={activeClient.followUp.status}
                        onChange={(e) => updateActiveClient('status', e.target.value, 'followUp')}
                      >
                         {Object.keys(STATUS_METRICS).map(k => (
                            <option key={k} value={k}>{STATUS_METRICS[k as ContactStatus].label}</option>
                         ))}
                      </select>
                      <div className="text-right">
                         <div className="text-[10px] text-gray-400 uppercase font-bold">Deal Value</div>
                         <div className="text-lg font-bold text-emerald-600">
                            {fmtSGD(calculateDealMetrics(activeClient).potentialRevenue)}
                         </div>
                      </div>
                   </div>
                </div>

                {/* 2. Core Details */}
                <div>
                   <h3 className="text-xs font-bold text-gray-400 uppercase mb-3 border-b pb-1">Client Details</h3>
                   <div className="space-y-3">
                      <div>
                         <label className="text-xs text-gray-500 font-semibold">Job Title</label>
                         <input 
                           type="text" 
                           className="w-full p-2 border border-gray-200 rounded text-sm outline-none focus:border-indigo-500 transition-colors"
                           value={activeClient.profile.jobTitle || ''}
                           onChange={(e) => updateActiveClient('jobTitle', e.target.value, 'profile')}
                           placeholder="e.g. Software Engineer"
                         />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                         <div>
                            <label className="text-xs text-gray-500 font-semibold">Phone</label>
                            <input 
                              type="text" 
                              className="w-full p-2 border border-gray-200 rounded text-sm outline-none focus:border-indigo-500"
                              value={activeClient.profile.phone}
                              onChange={(e) => updateActiveClient('phone', e.target.value, 'profile')}
                            />
                         </div>
                         <div>
                            <label className="text-xs text-gray-500 font-semibold">Source</label>
                            <select 
                              className="w-full p-2 border border-gray-200 rounded text-sm bg-white"
                              value={activeClient.profile.source || 'Other'}
                              onChange={(e) => updateActiveClient('source', e.target.value, 'profile')}
                            >
                               {Object.keys(SOURCE_CONFIG).map(k => (
                                  <option key={k} value={k}>{SOURCE_CONFIG[k as LeadSource].label}</option>
                               ))}
                            </select>
                         </div>
                      </div>
                   </div>
                </div>

                {/* 3. The Motivation */}
                <div>
                   <label className="block text-xs font-bold text-gray-400 uppercase mb-2 border-b pb-1">Client Motivation</label>
                   <textarea 
                      className="w-full p-3 border border-gray-200 rounded-xl text-sm h-24 focus:ring-2 focus:ring-indigo-100 outline-none resize-none"
                      placeholder="Why do they want to solve their financial problem? What is their pain point?"
                      value={activeClient.profile.motivation || ''}
                      onChange={(e) => updateActiveClient('motivation', e.target.value, 'profile')}
                   />
                </div>

                {/* 4. Action Dates */}
                <div className="grid grid-cols-2 gap-4">
                   <div className="p-3 border rounded-lg bg-gray-50">
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Last Appt</label>
                      <input 
                        type="date" 
                        className="w-full bg-transparent text-sm font-bold text-gray-900 outline-none"
                        value={activeClient.appointments?.firstApptDate ? activeClient.appointments.firstApptDate.split('T')[0] : ''}
                        onChange={(e) => updateActiveClient('firstApptDate', e.target.value, 'appointments')}
                      />
                   </div>
                   <div className="p-3 border rounded-lg bg-indigo-50 border-indigo-100">
                      <label className="block text-[10px] font-bold text-indigo-500 uppercase mb-1">Next Follow Up</label>
                      <input 
                        type="date" 
                        className="w-full bg-transparent text-sm font-bold text-indigo-700 outline-none"
                        value={activeClient.appointments?.nextFollowUpDate ? activeClient.appointments.nextFollowUpDate.split('T')[0] : ''}
                        onChange={(e) => updateActiveClient('nextFollowUpDate', e.target.value, 'appointments')}
                      />
                   </div>
                </div>

                {/* 5. Danger Zone */}
                <div className="pt-6 mt-10 border-t border-gray-100">
                   <button 
                     onClick={() => {
                        if(confirm('Delete this client permanently?')) {
                           deleteClient(activeClient.id);
                           handleCloseDrawer();
                        }
                     }}
                     className="w-full py-3 border border-red-200 text-red-600 rounded-lg text-xs font-bold hover:bg-red-50 transition-colors"
                   >
                      Delete Client Record
                   </button>
                </div>

             </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default CrmTab;
