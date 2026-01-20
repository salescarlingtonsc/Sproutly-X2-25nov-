
import React, { useState, useMemo, useEffect } from 'react';
import { Client, Product, WhatsAppTemplate, ContactStatus, Sale } from '../../types';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { ClientCard } from './components/ClientCard';
import { WhatsAppModal } from './components/WhatsAppModal';
import { CommentsModal } from './components/CommentsModal';
import { AddSaleModal } from './components/AddSaleModal';
import CallSessionModal from './components/CallSessionModal';
import { TemplateManager } from './components/TemplateManager';
import ImportModal from './components/ImportModal';
import StatusDropdown, { STATUS_CONFIG } from './components/StatusDropdown';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { DEFAULT_SETTINGS } from '../../lib/config';
import { DEFAULT_TEMPLATES } from '../../lib/templates';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { db } from '../../lib/db';
import { logActivity } from '../../lib/db/activities';
import { useToast } from '../../contexts/ToastContext';
import { useDialog } from '../../contexts/DialogContext';
import { adminDb } from '../../lib/db/admin';
import { calculateLeadScore } from '../../lib/gemini';
import { fmtDateTime } from '../../lib/helpers';

// Fallback Mock Data
const MOCK_PRODUCTS: Product[] = [
    { id: 'p1', name: 'Wealth Sol', provider: 'Pru', type: 'ILP', tiers: [{ min: 0, max: Infinity, rate: 0.5, dollarUp: 0 }] },
    { id: 'p2', name: 'Term Protect', provider: 'AIA', type: 'Term', tiers: [{ min: 0, max: Infinity, rate: 0.5, dollarUp: 0 }] }
];

// Logical Order for Grouping
const STATUS_ORDER: ContactStatus[] = [
  'new', 'contacted', 'picked_up', 'qualified',
  'npu_1', 'npu_2', 'npu_3', 'npu_4', 'npu_5', 'npu_6',
  'appt_set', 'appt_met', 'proposal', 'pending_decision', 'closing',
  'client', 'case_closed', 'not_keen'
];

interface CrmTabProps {
  clients: Client[];
  profile: any;
  selectedClientId: string | null;
  newClient: () => void;
  saveClient: () => void;
  loadClient: (client: Client, redirect: boolean) => void;
  deleteClient: (id: string) => Promise<void>; 
  onRefresh: () => void;
  onUpdateGlobalClient: (client: Client) => void;
  onTransferStart?: (id: string) => void;
  onTransferEnd?: (id: string) => void;
}

const CrmTab: React.FC<CrmTabProps> = ({ 
    clients, 
    newClient, 
    loadClient, 
    onUpdateGlobalClient,
    deleteClient,
    onRefresh,
    selectedClientId 
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const { confirm } = useDialog();
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('All');
  const [advisorFilter, setAdvisorFilter] = useState<string>('All');
  const [momentumFilter, setMomentumFilter] = useState<'Hot' | 'Moving' | 'Stalled' | 'All'>('All');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('list');
  const [isGrouped, setIsGrouped] = useState(false);
  
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'lastUpdated', direction: 'desc' });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
  const [bulkAssignTarget, setBulkAssignTarget] = useState('');
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [activeWhatsAppClient, setActiveWhatsAppClient] = useState<Client | null>(null);
  const [activeCommentsClient, setActiveCommentsClient] = useState<Client | null>(null);
  const [activeSaleClient, setActiveSaleClient] = useState<Client | null>(null);
  const [activeDetailClient, setActiveDetailClient] = useState<Client | null>(null);
  const [isCallSessionOpen, setIsCallSessionOpen] = useState(false);
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isQuantumThinking, setIsQuantumThinking] = useState(false);
  const [advisorMap, setAdvisorMap] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>(DEFAULT_TEMPLATES.map(t => ({id: t.id, label: t.label, content: t.content})));

  useEffect(() => {
    const resolveNames = async () => {
        if (!supabase) return;
        try {
            const { data, error } = await supabase.from('profiles').select('id, name, email');
            if (error) return;
            if (data) {
                const newMap: Record<string, string> = {};
                data.forEach(p => {
                    let displayLabel = p.name || p.email?.split('@')[0] || 'Unknown';
                    newMap[p.id] = displayLabel;
                });
                setAdvisorMap(newMap);
            }
        } catch (e) {}
    };
    resolveNames();
  }, [clients.length]);

  const availableAdvisors = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach(c => {
      const ownerId = c.advisorId || c._ownerId;
      if (ownerId) {
         let label = advisorMap[ownerId] || c._ownerEmail || `Advisor ${ownerId.substring(0, 4)}`;
         map.set(ownerId, label);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a,b) => a.name.localeCompare(b.name));
  }, [clients, advisorMap]);

  const showAdvisorCol = availableAdvisors.length > 1;

  useEffect(() => {
    const fetchSettings = async () => {
        const settings = await adminDb.getSystemSettings(user?.organizationId);
        if (settings?.products?.length) setProducts(settings.products);
    };
    fetchSettings();
  }, [user?.organizationId]);

  useEffect(() => {
    if (selectedClientId && clients.length > 0) {
        const matchedClient = clients.find(c => c.id === selectedClientId);
        if (matchedClient) setActiveDetailClient(matchedClient);
    }
  }, [selectedClientId, clients]);

  const handleClearFilters = () => {
      setSearchTerm('');
      setStageFilter('All');
      setMomentumFilter('All');
      setAdvisorFilter('All');
      toast.info("All search filters cleared.");
  };

  /**
   * FIX: Added handleSort function to manage column sorting state.
   */
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredClients = useMemo(() => {
    let filtered = clients.filter(client => {
      const name = client.name || client.profile?.name || '';
      const company = client.company || '';
      const phone = client.phone || client.profile?.phone || '';
      
      const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            company.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            phone.includes(searchTerm) ||
                            (client.tags || []).some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const currentStatus = client.followUp?.status || client.stage || '';
      const matchesStage = stageFilter === 'All' || currentStatus === stageFilter || client.stage === stageFilter;
      const effectiveOwner = client.advisorId || client._ownerId;
      const matchesAdvisor = advisorFilter === 'All' || effectiveOwner === advisorFilter;

      let matchesMomentum = true;
      if (momentumFilter === 'Hot') matchesMomentum = (client.momentumScore || 0) > 70;
      else if (momentumFilter === 'Moving') matchesMomentum = (client.momentumScore || 0) >= 30 && (client.momentumScore || 0) <= 70;
      else if (momentumFilter === 'Stalled') matchesMomentum = (client.momentumScore || 0) < 30;

      return matchesSearch && matchesStage && matchesAdvisor && matchesMomentum;
    });

    if (sortConfig.key) {
        filtered.sort((a, b) => {
            let aVal: any = '';
            let bVal: any = '';
            switch (sortConfig.key) {
                case 'name':
                    aVal = (a.name || a.profile?.name || '').toLowerCase();
                    bVal = (b.name || b.profile?.name || '').toLowerCase();
                    break;
                case 'advisor':
                    const aId = a.advisorId || a._ownerId || '';
                    const bId = b.advisorId || b._ownerId || '';
                    aVal = (advisorMap[aId] || a._ownerEmail || '').toLowerCase();
                    bVal = (advisorMap[bId] || b._ownerEmail || '').toLowerCase();
                    break;
                case 'stage':
                    aVal = (a.stage || a.followUp?.status || '').toLowerCase();
                    bVal = (b.stage || b.followUp?.status || '').toLowerCase();
                    break;
                case 'pipeline':
                    aVal = a.value || 0;
                    bVal = b.value || 0;
                    break;
                case 'lastUpdated':
                    aVal = new Date(a.lastUpdated || 0).getTime();
                    bVal = new Date(b.lastUpdated || 0).getTime();
                    break;
                default:
                    return 0;
            }
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }
    return filtered;
  }, [clients, searchTerm, stageFilter, advisorFilter, momentumFilter, sortConfig, advisorMap]);

  const groupedClients = useMemo(() => {
    if (!isGrouped) return null;
    const groups: Record<string, Client[]> = {};
    STATUS_ORDER.forEach(s => groups[s] = []);
    groups['other'] = [];
    filteredClients.forEach(c => {
        const status = c.followUp?.status || 'new';
        if (groups[status]) groups[status].push(c);
        else groups['other'].push(c);
    });
    return groups;
  }, [filteredClients, isGrouped]);

  const handleToggleSelect = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedIds(newSet);
  };

  const handleStatusChange = (client: Client, newStatus: ContactStatus) => {
      const now = new Date().toISOString();
      const newStageName = STATUS_CONFIG[newStatus]?.label || client.stage;
      const updatedClient = {
          ...client,
          stage: newStageName,
          lastContact: now,
          lastUpdated: now,
          followUp: { ...client.followUp, status: newStatus, lastContactedAt: now },
          notes: [{ id: `sys_${Date.now()}`, content: `Stage updated: ${client.stage || 'New'} ➔ ${newStageName}`, date: now, author: 'System' }, ...(client.notes || [])]
      };
      onUpdateGlobalClient(updatedClient);
  };

  const isFiltered = searchTerm !== '' || stageFilter !== 'All' || momentumFilter !== 'All' || (advisorFilter !== 'All' && availableAdvisors.length > 1);

  return (
    <div className="p-6 md:p-8 animate-fade-in pb-24 md:pb-8">
      <AnalyticsPanel 
        clients={clients}
        advisorFilter={advisorFilter}
        setAdvisorFilter={setAdvisorFilter}
        availableAdvisors={availableAdvisors}
        onStageClick={(stage) => setStageFilter(stage)}
        onMomentumClick={(range) => setMomentumFilter(range)}
      />

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
         <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
             <div className="relative w-full md:w-64 shrink-0">
                 <input type="text" placeholder="Search name, phone, or tags..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                 <svg className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
             </div>
             
             <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm cursor-pointer shrink-0">
                 <option value="All">All Stages</option>
                 {DEFAULT_SETTINGS.statuses.map(s => <option key={s} value={s}>{s}</option>)}
             </select>

             {availableAdvisors.length > 1 && (
               <select value={advisorFilter} onChange={(e) => setAdvisorFilter(e.target.value)} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm cursor-pointer shrink-0 max-w-[200px]">
                 <option value="All">All Advisors</option>
                 {availableAdvisors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
               </select>
             )}

             {isFiltered && (
                <button 
                    onClick={handleClearFilters}
                    className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-rose-100 transition-all shadow-sm shrink-0"
                >
                   <span>✕</span> Reset Filters
                </button>
             )}

             <div className="hidden md:flex bg-white border border-slate-200 rounded-xl items-center p-1 shadow-sm ml-2 shrink-0">
                 <button onClick={() => setIsGrouped(!isGrouped)} className={`p-2 rounded-lg transition-all ${isGrouped ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-slate-400 hover:text-slate-600'}`} title="Group by Status"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></button>
                 <button onClick={() => setViewMode('cards')} className={`p-2 rounded-lg transition-all ${viewMode === 'cards' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="Card View"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-1-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg></button>
                 <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="List View"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></button>
             </div>
         </div>

         <div className="flex gap-3 w-full md:w-auto">
             <button onClick={() => setIsTemplateManagerOpen(true)} className="hidden lg:flex bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all items-center gap-2"><span>📝</span> Templates</button>
             <button onClick={() => setIsImportOpen(true)} className="flex-1 md:flex-none bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"><span>📥</span> Import</button>
             <button onClick={newClient} className="flex-1 md:flex-none bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md hover:bg-slate-800 transition-all flex items-center justify-center gap-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> New Client</button>
         </div>
      </div>

      {filteredClients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border-2 border-dashed border-slate-100 text-center animate-fade-in">
              <div className="text-6xl mb-4 grayscale opacity-20">👤</div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">No Clients Found</h3>
              <p className="text-slate-500 max-w-sm mx-auto mb-8">
                  {isFiltered 
                    ? "Adjust your search parameters or reset filters to see more results." 
                    : "Your client book is currently empty. Start by importing leads or creating a new profile."}
              </p>
              {isFiltered && (
                  <Button variant="primary" onClick={handleClearFilters}>Clear All Filters</Button>
              )}
          </div>
      ) : (
          viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredClients.map(client => (
                    <div key={client.id} className="relative group">
                        <div className={`absolute top-2 left-2 z-10 ${selectedIds.has(client.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                            <input type="checkbox" checked={selectedIds.has(client.id)} onChange={() => handleToggleSelect(client.id)} className="w-5 h-5 rounded border-slate-300 text-indigo-600 cursor-pointer shadow-sm" />
                        </div>
                        <div className={selectedIds.has(client.id) ? 'ring-2 ring-indigo-500 rounded-xl' : ''}>
                            <ClientCard client={client} products={products} onUpdate={onUpdateGlobalClient} currentUser={user} onDelete={async (id) => { const c = await confirm({title:"Delete?", message:"Permanently remove lead?"}); if(c) deleteClient(id); }} onAddSale={() => setActiveSaleClient(client)} />
                        </div>
                    </div>
                ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
               <div className="overflow-x-auto">
                   <table className="w-full text-left text-sm">
                       <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-20">
                           <tr>
                               <th className="px-4 py-3 w-10"><input type="checkbox" checked={filteredClients.length > 0 && selectedIds.size === filteredClients.length} onChange={(e) => setSelectedIds(e.target.checked ? new Set(filteredClients.map(c => c.id)) : new Set())} className="rounded border-slate-300 text-indigo-600 cursor-pointer" /></th>
                               <SortHeader label="Name" sortKey="name" sortConfig={sortConfig} onSort={handleSort} />
                               {showAdvisorCol && <SortHeader label="Advisor" sortKey="advisor" sortConfig={sortConfig} onSort={handleSort} />}
                               <SortHeader label="Stage" sortKey="stage" sortConfig={sortConfig} onSort={handleSort} />
                               <SortHeader label="Pipeline" sortKey="pipeline" sortConfig={sortConfig} onSort={handleSort} />
                               <th className="px-4 py-3 font-semibold text-slate-500">Details</th>
                               <SortHeader label="Last Edited" sortKey="lastUpdated" sortConfig={sortConfig} onSort={handleSort} />
                               <th className="px-4 py-3 font-semibold text-slate-500 text-right">Actions</th>
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                           {isGrouped && groupedClients ? (
                               STATUS_ORDER.concat(['other'] as any).map(statusKey => {
                                   const group = groupedClients[statusKey as string];
                                   if (!group || group.length === 0) return null;
                                   const config = STATUS_CONFIG[statusKey as ContactStatus] || { label: 'Other', bg: 'bg-slate-100', text: 'text-slate-600' };
                                   return (
                                       <React.Fragment key={statusKey}>
                                           <tr className="bg-slate-50/80"><td colSpan={showAdvisorCol ? 8 : 7} className="px-4 py-2 border-y border-slate-200/50"><div className="flex items-center gap-2"><span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${config.bg} ${config.text}`}>{config.label}</span><span className="text-xs text-slate-400 font-bold">{group.length}</span></div></td></tr>
                                           {group.map(client => <ClientRow key={client.id} client={client} isSelected={selectedIds.has(client.id)} onToggle={() => handleToggleSelect(client.id)} onClick={() => setActiveDetailClient(client)} onStatusUpdate={handleStatusChange} onWhatsApp={() => setActiveWhatsAppClient(client)} onRecordSale={() => setActiveSaleClient(client)} onLoadProfile={() => loadClient(client, true)} onDelete={async () => { const c = await confirm({title:"Delete?", message:"Permanently remove lead?"}); if(c) deleteClient(client.id); }} canDelete={true} advisorName={advisorMap[client.advisorId || client._ownerId || ''] || client._ownerEmail} showAdvisor={showAdvisorCol} />)}
                                       </React.Fragment>
                                   );
                               })
                           ) : (
                               filteredClients.map(client => <ClientRow key={client.id} client={client} isSelected={selectedIds.has(client.id)} onToggle={() => handleToggleSelect(client.id)} onClick={() => setActiveDetailClient(client)} onStatusUpdate={handleStatusChange} onWhatsApp={() => setActiveWhatsAppClient(client)} onRecordSale={() => setActiveSaleClient(client)} onLoadProfile={() => loadClient(client, true)} onDelete={async () => { const c = await confirm({title:"Delete?", message:"Permanently remove lead?"}); if(c) deleteClient(client.id); }} canDelete={true} advisorName={advisorMap[client.advisorId || client._ownerId || ''] || client._ownerEmail} showAdvisor={showAdvisorCol} />)
                           )}
                       </tbody>
                   </table>
               </div>
            </div>
          )
      )}

      {/* ... MODALS ... */}
      <CallSessionModal isOpen={isCallSessionOpen} onClose={() => setIsCallSessionOpen(false)} clients={clients} onUpdateClient={(c, changes) => onUpdateGlobalClient({...c, ...changes})} />
      <Modal isOpen={isTemplateManagerOpen} onClose={() => setIsTemplateManagerOpen(false)} title="Personal Templates" footer={<button onClick={() => setIsTemplateManagerOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg">Close</button>}>
         <TemplateManager templates={templates} onUpdateTemplates={setTemplates} />
      </Modal>
      {activeWhatsAppClient && <WhatsAppModal client={activeWhatsAppClient} templates={templates} onClose={() => setActiveWhatsAppClient(null)} />}
      {activeCommentsClient && <CommentsModal client={activeCommentsClient} onClose={() => setActiveCommentsClient(null)} onAddNote={(note) => onUpdateGlobalClient({...activeCommentsClient, notes: [{ id: `note_${Date.now()}`, content: note, date: new Date().toISOString(), author: user?.email || 'Me' }, ...(activeCommentsClient.notes || [])]})} />}
      {activeSaleClient && <AddSaleModal clientName={activeSaleClient.name} products={products} advisorBanding={user?.bandingPercentage || 50} onClose={() => setActiveSaleClient(null)} onSave={(sale) => {
          onUpdateGlobalClient({ ...activeSaleClient, sales: [...(activeSaleClient.sales || []), sale], stage: 'Client', followUp: { ...activeSaleClient.followUp, status: 'client' }, lastUpdated: new Date().toISOString() });
      }} />}
      {isImportOpen && <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} onComplete={() => { onRefresh(); setIsImportOpen(false); }} />}

      {activeDetailClient && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setActiveDetailClient(null)}>
            <div className="w-full max-w-2xl h-[85vh] animate-scale-in flex flex-col" onClick={e => e.stopPropagation()}>
                 <div className="bg-white rounded-xl shadow-2xl h-full overflow-hidden flex flex-col">
                    <ClientCard client={activeDetailClient} products={products} onUpdate={(c) => { onUpdateGlobalClient(c); setActiveDetailClient(c); }} currentUser={user} onDelete={async (id) => { const c = await confirm({title:"Delete?", message:"Permanently remove lead?"}); if(c) { deleteClient(id); setActiveDetailClient(null); } }} onAddSale={() => setActiveSaleClient(activeDetailClient)} onClose={() => setActiveDetailClient(null)} />
                 </div>
            </div>
        </div>
      )}
    </div>
  );
};

const SortHeader = ({ label, sortKey, sortConfig, onSort }: any) => {
    const isSorted = sortConfig.key === sortKey;
    return (
        <th className={`px-4 py-3 font-semibold text-slate-500 cursor-pointer hover:bg-slate-100 transition-colors select-none`} onClick={() => onSort(sortKey)}>
            <div className={`flex items-center gap-1`}>
                {label}
                {isSorted && (
                    <span className="text-indigo-500 font-bold">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                )}
            </div>
        </th>
    );
};

const ClientRow: React.FC<{ 
    client: Client, isSelected: boolean, onToggle: () => void, onClick: () => void, onStatusUpdate: (c: Client, s: ContactStatus) => void, onWhatsApp: () => void, onRecordSale: () => void, onLoadProfile: () => void, onDelete: () => void, canDelete: boolean, advisorName?: string, showAdvisor?: boolean
}> = ({ client, isSelected, onToggle, onClick, onStatusUpdate, onWhatsApp, onRecordSale, onLoadProfile, onDelete, canDelete, advisorName, showAdvisor }) => {
    return (
        <tr className={`hover:bg-slate-50 transition-colors group cursor-pointer ${isSelected ? 'bg-indigo-50/20' : ''}`} onClick={onClick}>
            <td className="px-4 py-3" onClick={e => e.stopPropagation()}><input type="checkbox" checked={isSelected} onChange={onToggle} className="rounded border-slate-300 text-indigo-600 cursor-pointer" /></td>
            <td className="px-4 py-3"><div className="font-bold text-slate-800">{client.name}</div><div className="text-xs text-slate-400">{client.company}</div></td>
            {showAdvisor && <td className="px-4 py-3 text-xs font-medium text-slate-600 truncate max-w-[150px]">{advisorName || 'Unassigned'}</td>}
            <td className="px-4 py-3" onClick={e => e.stopPropagation()}><StatusDropdown client={client} onUpdate={onStatusUpdate} /></td>
            <td className="px-4 py-3"><div className="text-sm font-bold text-slate-700">{client.momentumScore || 50}/100</div><div className="text-xs text-slate-400">${(client.value || 0).toLocaleString()}</div></td>
            <td className="px-4 py-3 text-xs text-slate-500"><div>📞 {client.phone || '-'}</div><div>✉️ {client.email || '-'}</div></td>
            <td className="px-4 py-3 text-xs text-slate-500 font-medium">{client.lastUpdated ? fmtDateTime(client.lastUpdated) : '-'}</td>
            <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity items-center">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onWhatsApp(); }} 
                        className="p-2 text-[#25D366] hover:bg-green-50 rounded-lg transition-colors" 
                        title="WhatsApp"
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.025 3.312l-.542 2.01 2.036-.53c.96.514 1.95.787 3.25.788h.003c3.181 0 5.767-2.586 5.768-5.766 0-3.18-2.587-5.766-5.768-5.766h-.004zm3.003 8.3c-.12.33-.7.63-1.01.69-.24.05-.55.08-1.53-.33-1.3-.54-2.12-1.85-2.19-1.94-.06-.09-.54-.72-.54-1.37s.34-.97.46-1.1c.12-.13.27-.16.36-.16s.18.01.26.01.21-.04.33.25c.12.29.41 1.01.45 1.09.04.08.07.17.01.28-.06.11-.09.18-.18.29-.06.11-.09.18-.18.29-.09.11-.18.23-.26.3-.09.08-.18.17-.08.34.1.17.44.73.94 1.18.64.57 1.18.75 1.35.83.17.08.27.07.37-.04.1-.11.43-.51.55-.68.12-.17.23-.15.39-.09.16.06 1.03.49 1.2.58.17.09.28.14.32.2.04.06.04.35-.08.68z"/></svg>
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onRecordSale(); }} 
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" 
                        title="Record Sale"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onLoadProfile(); }} 
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" 
                        title="Open Profile"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    );
};

export default CrmTab;
