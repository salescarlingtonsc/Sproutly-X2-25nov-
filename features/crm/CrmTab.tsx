
import React, { useMemo, useState } from 'react';
import { Client, ContactStatus } from '../../types';
import { generateWhatsAppDraft } from '../../lib/gemini';
import { db } from '../../lib/db'; 
import { toNum } from '../../lib/helpers';
import Sparkline from '../../components/common/Sparkline';
import PageHeader from '../../components/layout/PageHeader';
import SectionCard from '../../components/layout/SectionCard';
import StatusDropdown, { STATUS_CONFIG } from './components/StatusDropdown';
import ClientDrawer from './components/ClientDrawer';
import BlastModal from './components/BlastModal';

interface CrmTabProps {
  clients: Client[];
  profile: any;
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
}

const PIPELINE_STAGES = ['new', 'picked_up', 'appt_set', 'proposal', 'client'];

const CrmTab: React.FC<CrmTabProps> = (props) => {
  const { clients, loadClient, deleteClient, newClient, onRefresh } = props;

  // View State
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Drawer State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [focusedClient, setFocusedClient] = useState<Client | null>(null);
  
  // Actions State
  const [blastModalOpen, setBlastModalOpen] = useState(false);
  const [blastTopic, setBlastTopic] = useState('');
  const [blastMessage, setBlastMessage] = useState('');
  const [isGeneratingBlast, setIsGeneratingBlast] = useState(false);
  const [generatedLinks, setGeneratedLinks] = useState<{name: string, url: string}[]>([]);

  // --- FILTERS & SORTING ---
  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const search = searchTerm.toLowerCase();
      return c.profile.name.toLowerCase().includes(search) || 
             c.profile.phone.includes(search) || 
             (c.profile.jobTitle || '').toLowerCase().includes(search);
    }).sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
  }, [clients, searchTerm]);

  // --- HANDLERS ---

  const handleRowClick = (client: Client) => {
    loadClient(client, false); 
    setFocusedClient(client);
    setDrawerOpen(true);
  };

  const handleSaveDrawer = async (updatedClient: Client) => {
      try {
          setFocusedClient(updatedClient);
          await db.saveClient(updatedClient);
          if (onRefresh) onRefresh();
      } catch (e) {
          console.error("Auto-save failed", e);
      }
  };

  const updateFocusedField = (field: string, value: any, section: 'profile' | 'followUp' | 'root' = 'profile') => {
    if (!focusedClient) return;
    const updated = { ...focusedClient };
    if (section === 'profile') {
        updated.profile = { ...updated.profile, [field]: value };
    } else if (section === 'followUp') {
        updated.followUp = { ...updated.followUp, [field]: value };
    } else {
        (updated as any)[field] = value;
    }
    handleSaveDrawer(updated);
  };

  const openFullWorkspace = () => {
      if (focusedClient) {
          loadClient(focusedClient, true); 
      }
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    const allVisibleIds = filteredClients.map(c => c.id);
    const allSelected = allVisibleIds.every(id => selectedIds.has(id));
    if (allSelected) {
      const next = new Set(selectedIds);
      allVisibleIds.forEach(id => next.delete(id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      allVisibleIds.forEach(id => next.add(id));
      setSelectedIds(next);
    }
  };

  const handlePrepareBlast = () => {
    setBlastMessage('');
    setBlastTopic('');
    setGeneratedLinks([]);
    setBlastModalOpen(true);
  };

  const handleGenerateAIBlast = async () => {
    if (!blastTopic) return;
    setIsGeneratingBlast(true);
    try {
      const draft = await generateWhatsAppDraft(blastTopic, { count: selectedIds.size, role: 'Financial Advisor' });
      setBlastMessage(draft);
    } catch (e) {
      setBlastMessage("Hi {name}, checking in!");
    } finally {
      setIsGeneratingBlast(false);
    }
  };

  const generateBlastLinks = () => {
    const links = Array.from(selectedIds).map(id => {
      const client = clients.find(c => c.id === id);
      if (!client) return null;
      const personalizedMsg = blastMessage.replace('{name}', client.profile.name.split(' ')[0]);
      const encodedMsg = encodeURIComponent(personalizedMsg);
      const phone = client.profile.phone.replace(/\D/g, '');
      return {
        name: client.profile.name,
        url: `https://wa.me/${phone}?text=${encodedMsg}`
      };
    }).filter(Boolean) as {name: string, url: string}[];
    setGeneratedLinks(links);
  };

  const handleInlineStatusUpdate = async (client: Client, newStatus: string) => {
     try {
       const updatedClient = {
         ...client,
         followUp: { ...client.followUp, status: newStatus as ContactStatus },
         lastUpdated: new Date().toISOString()
       };
       await db.saveClient(updatedClient); 
       if (onRefresh) onRefresh();
       if (focusedClient && focusedClient.id === client.id) {
           setFocusedClient(updatedClient);
       }
     } catch (e) {
       console.error("Failed to update status", e);
     }
  };

  const getDaysSinceUpdate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  };

  const generateSparklineData = (client: Client) => {
     const startValue = toNum(client.cashflowState?.currentSavings) + toNum(client.investorState?.portfolioValue);
     const monthlySave = (toNum(client.profile.monthlyIncome) - toNum(client.profile.takeHome)*0.5) || 1000;
     const annualGrowth = 0.05;
     
     const data = [];
     let val = startValue || 1000;
     for (let i = 0; i < 10; i++) {
        val = (val + (monthlySave * 12)) * (1 + annualGrowth);
        data.push(val);
     }
     return data;
  };

  // HEADER ACTIONS
  const headerActions = (
    <div className="flex items-center gap-3">
      <div className="relative group flex-1 md:flex-none">
         <input 
            type="text" 
            placeholder="Search clients..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:w-64 bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
         />
         <span className="absolute left-3.5 top-2.5 text-gray-400 group-focus-within:text-indigo-500">🔍</span>
      </div>
      
      <div className="flex bg-gray-100 p-1 rounded-lg">
         <button 
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
         >
            List
         </button>
         <button 
            onClick={() => setViewMode('kanban')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'kanban' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
         >
            Pipeline
         </button>
      </div>

      <button onClick={newClient} className="bg-slate-900 text-white hover:bg-slate-800 px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-slate-200 active:scale-95 transition-all">
         New Deal
      </button>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto min-h-screen">
      
      <PageHeader 
        title="Velocity CRM"
        icon="⚡"
        subtitle="Manage relationships and track deal flow."
        action={headerActions}
        className="mb-6"
      />

      {/* FLOATING ACTION ISLAND */}
      {selectedIds.size > 0 && (
         <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-bounce-in">
            <div className="bg-slate-900 text-white pl-6 pr-2 py-2 rounded-full shadow-2xl flex items-center gap-4 border border-slate-700">
               <span className="font-bold text-xs">{selectedIds.size} Selected</span>
               <div className="h-4 w-px bg-slate-700"></div>
               
               <button onClick={handlePrepareBlast} className="hover:bg-white/10 px-3 py-1.5 rounded-full flex items-center gap-2 text-xs font-bold transition-colors text-emerald-400">
                  <span>💬</span> WhatsApp Blast
               </button>
               
               <button onClick={() => { if(confirm("Delete selected?")) selectedIds.forEach(id => deleteClient(id)); }} className="hover:bg-white/10 px-3 py-1.5 rounded-full flex items-center gap-2 text-xs font-bold transition-colors text-red-400">
                  <span>🗑</span> Delete
               </button>
               
               <button onClick={() => setSelectedIds(new Set())} className="ml-2 w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors">
                  ✕
               </button>
            </div>
         </div>
      )}

      {/* MAIN CONTENT AREA */}
      <SectionCard noPadding className="min-h-[600px] relative">
         
         {/* LIST VIEW (Enhanced) */}
         {viewMode === 'list' && (
            <div className="space-y-0">
               {/* Header Row */}
               <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  <div className="col-span-1 text-center flex items-center justify-center">
                     <input 
                        type="checkbox" 
                        onChange={selectAll} 
                        checked={filteredClients.length > 0 && filteredClients.every(c => selectedIds.has(c.id))} 
                        className="accent-indigo-600 cursor-pointer w-4 h-4 rounded" 
                     />
                  </div>
                  <div className="col-span-3">Client Name</div>
                  <div className="col-span-2">Wealth Track</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-2">Phone</div>
                  <div className="col-span-2">Activity</div>
               </div>

               {/* Rows */}
               <div className="divide-y divide-gray-100">
               {filteredClients.map(client => {
                  const daysIdle = getDaysSinceUpdate(client.lastUpdated);
                  const sparkData = generateSparklineData(client);
                  
                  return (
                     <div 
                        key={client.id} 
                        onClick={() => handleRowClick(client)}
                        className={`grid grid-cols-12 gap-4 px-6 py-4 items-center transition-all hover:bg-gray-50/80 cursor-pointer group ${selectedIds.has(client.id) ? 'bg-indigo-50/30' : ''}`}
                     >
                        <div className="col-span-1 flex justify-center" onClick={(e) => e.stopPropagation()}>
                           <input 
                              type="checkbox" 
                              checked={selectedIds.has(client.id)}
                              onChange={() => toggleSelection(client.id)}
                              className="accent-indigo-600 w-4 h-4 cursor-pointer rounded"
                           />
                        </div>
                        <div className="col-span-3 flex items-center gap-3">
                           <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-black border border-indigo-200">
                              {client.profile.name.charAt(0).toUpperCase()}
                           </div>
                           <div>
                              <div className="font-bold text-sm text-slate-800 group-hover:text-indigo-600 transition-colors">{client.profile.name}</div>
                              <div className="text-[10px] text-slate-400 font-medium">{client.profile.jobTitle || 'Unknown Role'}</div>
                           </div>
                        </div>
                        {/* MICRO CHART */}
                        <div className="col-span-2">
                           <div className="h-8 w-24">
                              <Sparkline data={sparkData} width={100} height={30} fill={true} />
                           </div>
                        </div>
                        <div className="col-span-2" onClick={(e) => e.stopPropagation()}>
                           <StatusDropdown client={client} onUpdate={handleInlineStatusUpdate} />
                        </div>
                        <div className="col-span-2 text-xs font-mono text-slate-500">
                           {client.profile.phone || '-'}
                        </div>
                        <div className="col-span-2">
                           <div className={`text-xs font-bold flex items-center gap-2 ${daysIdle > 30 ? 'text-red-500' : 'text-slate-400'}`}>
                              {daysIdle > 30 && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>}
                              {daysIdle === 0 ? 'Today' : `${daysIdle}d ago`}
                           </div>
                        </div>
                     </div>
                  );
               })}
               </div>
               
               {filteredClients.length === 0 && (
                  <div className="p-12 text-center text-gray-400 text-sm italic">
                     No clients found. Click "New Deal" to start.
                  </div>
               )}
            </div>
         )}

         {/* KANBAN VIEW */}
         {viewMode === 'kanban' && (
            <div className="flex gap-6 overflow-x-auto p-6 h-full min-h-[600px] bg-gray-50/50">
               {PIPELINE_STAGES.map(stageKey => {
                  const stageConfig = STATUS_CONFIG[stageKey];
                  const stageClients = filteredClients.filter(c => (c.followUp.status || 'new') === stageKey);
                  const totalValue = stageClients.reduce((acc, c) => acc + (c.wealthState ? Number(c.wealthState.annualPremium || 0) : 0), 0);

                  return (
                     <div key={stageKey} className="min-w-[280px] w-[280px] flex flex-col h-full">
                        <div className="flex justify-between items-center mb-3 px-1">
                           <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${stageConfig.ring.replace('ring-', 'bg-').replace('-200', '-400')}`}></span>
                              <h3 className="text-xs font-black text-slate-700 uppercase tracking-wide">{stageConfig.label}</h3>
                              <span className="bg-white border border-gray-200 text-gray-600 text-[10px] px-1.5 rounded font-bold">{stageClients.length}</span>
                           </div>
                        </div>
                        
                        <div className="flex-1 space-y-2">
                           {stageClients.map(client => (
                              <div 
                                 key={client.id}
                                 onClick={() => handleRowClick(client)}
                                 className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group relative"
                              >
                                 <div className="flex justify-between items-start mb-2">
                                    <div className="font-bold text-xs text-slate-800">{client.profile.name}</div>
                                    <div className="w-5 h-5 rounded-full bg-gray-50 flex items-center justify-center text-[9px] text-gray-400 font-bold border border-gray-100">
                                       {client.profile.name.charAt(0)}
                                    </div>
                                 </div>
                                 <div className="text-[10px] text-slate-500 line-clamp-2 mb-2">
                                    {client.followUp.notes || "No notes added yet."}
                                 </div>
                                 <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                                    <span className={`text-[9px] font-mono ${getDaysSinceUpdate(client.lastUpdated) > 30 ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                                       {getDaysSinceUpdate(client.lastUpdated)}d ago
                                    </span>
                                    {/* Quick Actions (Move Next) */}
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                       <button 
                                          onClick={() => handleInlineStatusUpdate(client, PIPELINE_STAGES[Math.min(PIPELINE_STAGES.length-1, PIPELINE_STAGES.indexOf(stageKey)+1)])}
                                          className="w-5 h-5 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 text-[10px]" title="Move Next"
                                       >→</button>
                                    </div>
                                 </div>
                              </div>
                           ))}
                           {stageClients.length === 0 && (
                              <div className="h-24 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg">
                                 <span className="text-gray-300 text-xs font-bold opacity-50">Empty</span>
                              </div>
                           )}
                        </div>
                        
                        {/* Stage Summary */}
                        {totalValue > 0 && (
                           <div className="mt-2 text-center">
                              <span className="text-[10px] font-bold text-gray-400 uppercase">Potential Value</span>
                              <div className="text-xs font-bold text-slate-700">${totalValue.toLocaleString()}</div>
                           </div>
                        )}
                     </div>
                  );
               })}
            </div>
         )}

      </SectionCard>

      <ClientDrawer 
        client={focusedClient} 
        isOpen={drawerOpen} 
        onClose={() => setDrawerOpen(false)}
        onUpdateField={updateFocusedField}
        onStatusUpdate={handleInlineStatusUpdate}
        onOpenFullProfile={openFullWorkspace}
        onDelete={() => { if(confirm("Delete this client permanently?")) { deleteClient(focusedClient!.id); setDrawerOpen(false); } }}
      />

      <BlastModal 
        isOpen={blastModalOpen}
        onClose={() => setBlastModalOpen(false)}
        selectedCount={selectedIds.size}
        blastTopic={blastTopic}
        setBlastTopic={setBlastTopic}
        blastMessage={blastMessage}
        setBlastMessage={setBlastMessage}
        isGeneratingBlast={isGeneratingBlast}
        onGenerateAI={handleGenerateAIBlast}
        generatedLinks={generatedLinks}
        onGenerateLinks={generateBlastLinks}
      />

    </div>
  );
};

export default CrmTab;
