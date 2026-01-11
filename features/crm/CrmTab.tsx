
import React, { useState, useMemo, useEffect } from 'react';
import { Client, Product, Advisor, WhatsAppTemplate, AppSettings, Sale, ContactStatus } from '../../types';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { ClientCard } from './components/ClientCard';
import { WhatsAppModal } from './components/WhatsAppModal';
import { CommentsModal } from './components/CommentsModal';
import { AddSaleModal } from './components/AddSaleModal';
import CallSessionModal from './components/CallSessionModal';
import { TemplateManager } from './components/TemplateManager';
import ImportModal from './components/ImportModal';
import StatusDropdown from './components/StatusDropdown';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { DEFAULT_SETTINGS } from '../../lib/config';
import { DEFAULT_TEMPLATES } from '../../lib/templates';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { db } from '../../lib/db';
import { logActivity } from '../../lib/db/activities';
import { useToast } from '../../contexts/ToastContext';
import { adminDb } from '../../lib/db/admin';

// Fallback Mock Data
const MOCK_PRODUCTS: Product[] = [
    { id: 'p1', name: 'Wealth Sol', provider: 'Pru', type: 'ILP', tiers: [{ min: 0, max: Infinity, rate: 0.5, dollarUp: 0 }] },
    { id: 'p2', name: 'Term Protect', provider: 'AIA', type: 'Term', tiers: [{ min: 0, max: Infinity, rate: 0.5, dollarUp: 0 }] }
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
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('All');
  const [advisorFilter, setAdvisorFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('list');
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
  const [bulkAssignTarget, setBulkAssignTarget] = useState('');
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // Live Product State
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);

  // Modal States
  const [activeWhatsAppClient, setActiveWhatsAppClient] = useState<Client | null>(null);
  const [activeCommentsClient, setActiveCommentsClient] = useState<Client | null>(null);
  const [activeSaleClient, setActiveSaleClient] = useState<Client | null>(null);
  const [activeDetailClient, setActiveDetailClient] = useState<Client | null>(null);
  const [isCallSessionOpen, setIsCallSessionOpen] = useState(false);
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  
  // All Advisors List (For Filter)
  const [allAdvisors, setAllAdvisors] = useState<{id: string, name: string}[]>([]);
  
  // Local state for templates
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>(DEFAULT_TEMPLATES.map(t => ({id: t.id, label: t.label, content: t.content})));

  const isAdmin = user?.role === 'admin' || user?.is_admin === true;
  const isDirector = user?.role === 'director';
  const isManager = user?.role === 'manager';
  
  // Capability Check: Can this user manage/view team members?
  const canManageTeam = isAdmin || isDirector || isManager;
  const canDeleteClient = isAdmin || isDirector;

  // SYNC PRODUCTS FROM ADMIN SETTINGS
  useEffect(() => {
    const fetchSettings = async () => {
        const settings = await adminDb.getSystemSettings();
        if (settings?.products && settings.products.length > 0) {
            setProducts(settings.products);
        }
    };
    fetchSettings();
  }, []);

  // AUTO-OPEN CLIENT DETAIL IF SELECTED ID PROVIDED
  useEffect(() => {
    if (selectedClientId && clients.length > 0) {
        const matchedClient = clients.find(c => c.id === selectedClientId);
        if (matchedClient) {
            setActiveDetailClient(matchedClient);
        }
    }
  }, [selectedClientId, clients]);

  // Fetch all advisors if Manager/Director/Admin to populate filter fully
  useEffect(() => {
    if (canManageTeam && supabase) {
        const fetchAllProfiles = async () => {
            let query = supabase.from('profiles').select('id, email, organization_id').order('email');
            
            // Scope by Organization if not Super Admin
            if (!isAdmin && user?.organizationId) {
                query = query.eq('organization_id', user.organizationId);
            }

            const { data } = await query;
            if (data) {
                setAllAdvisors(data.map(p => ({ id: p.id, name: p.email })));
            }
        };
        fetchAllProfiles();
    }
  }, [canManageTeam, isAdmin, user?.organizationId]);

  // Combined Advisor List
  const availableAdvisors = useMemo(() => {
    if (canManageTeam && allAdvisors.length > 0) return allAdvisors;

    const map = new Map<string, string>();
    clients.forEach(c => {
      if (c._ownerId) {
         const label = c._ownerEmail || `Advisor (${c._ownerId.substring(0, 5)}...)`;
         map.set(c._ownerId, label);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a,b) => a.name.localeCompare(b.name));
  }, [clients, allAdvisors, canManageTeam]);

  const filteredClients = useMemo(() => {
    return clients.filter(client => {
      const name = client.name || client.profile?.name || '';
      const company = client.company || '';
      
      const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            company.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (client.tags || []).some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const currentStatus = client.followUp?.status || client.stage || '';
      const matchesStage = stageFilter === 'All' || currentStatus === stageFilter || client.stage === stageFilter;
      
      const matchesAdvisor = advisorFilter === 'All' || client._ownerId === advisorFilter;

      return matchesSearch && matchesStage && matchesAdvisor;
    });
  }, [clients, searchTerm, stageFilter, advisorFilter]);

  // --- BULK ACTION HANDLERS ---
  const handleToggleSelect = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedIds(newSet);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked) {
          const allIds = filteredClients.map(c => c.id);
          setSelectedIds(new Set(allIds));
      } else {
          setSelectedIds(new Set());
      }
  };

  const executeBulkDelete = async () => {
      if (!confirm(`Are you sure you want to delete ${selectedIds.size} clients? This cannot be undone.`)) return;
      
      setIsBulkProcessing(true);
      try {
          const idsToDelete = Array.from(selectedIds);
          for (const id of idsToDelete) {
              await deleteClient(id);
          }
          toast.success(`Deleted ${idsToDelete.length} clients.`);
          setSelectedIds(new Set());
      } catch (e: any) {
          const msg = e instanceof Error ? e.message : String(e);
          toast.error("Bulk delete partially failed: " + msg);
      } finally {
          setIsBulkProcessing(false);
      }
  };

  const executeBulkAssign = async () => {
      if (!bulkAssignTarget) {
          toast.error("Please select an advisor.");
          return;
      }
      
      const targetAdvisor = availableAdvisors.find(a => a.id === bulkAssignTarget);
      if (!targetAdvisor) return;

      setIsBulkProcessing(true);
      try {
          const idsToAssign = Array.from(selectedIds);
          let successCount = 0;
          
          // Execute sequentially to prevent race conditions and ensure RPC stability
          for (const id of idsToAssign) {
              try {
                  // Use robust RPC transfer which bypasses RLS if needed
                  await db.transferOwnership(id, bulkAssignTarget);
                  successCount++;
              } catch (rawErr) {
                  const innerErr = rawErr as any;
                  console.error(`Failed to transfer ${id}`, innerErr);
                  
                  // If RPC fails (e.g. missing function), notify user specifically
                  const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
                  if (msg.includes('function') && msg.includes('does not exist')) {
                      throw new Error("Missing 'transfer_client_owner' SQL function. Run DB Repair in Admin tab.");
                  }
              }
          }
          
          if (successCount > 0) {
              toast.success(`Transferred ${successCount} clients to ${targetAdvisor.name}`);
              onRefresh(); // Trigger global refresh
              setSelectedIds(new Set());
              setIsBulkAssignOpen(false);
          } else {
              throw new Error("Transfer failed. Please check permissions or DB connection.");
          }
      } catch (e: any) {
          const msg = e instanceof Error ? e.message : String(e);
          toast.error("Bulk assign failed: " + msg);
      } finally {
          setIsBulkProcessing(false);
      }
  };

  const handleClientUpdate = (updated: Client) => {
      onUpdateGlobalClient(updated);
  };

  const handleManualUpdate = (client: Client, changes: Partial<Client>) => {
      onUpdateGlobalClient({ ...client, ...changes });
  };

  const handleStatusChange = (client: Client, newStatus: ContactStatus) => {
      const now = new Date().toISOString();
      const newStageName = newStatus === 'new' ? 'New Lead' : 
                 newStatus === 'picked_up' ? 'Picked Up' :
                 newStatus === 'client' ? 'Client' : 
                 newStatus === 'case_closed' ? 'Case Closed' :
                 newStatus === 'proposal' ? 'Proposal' :
                 newStatus === 'appt_set' ? 'Appt Set' : 
                 newStatus === 'appt_met' ? 'Appt Met' :
                 newStatus.includes('npu') ? newStatus.toUpperCase().replace('_', ' ') : 
                 client.stage;

      const logEntry = {
          id: `sys_${Date.now()}`,
          content: `Status updated: ${client.stage || 'New'} ➔ ${newStageName}`,
          date: now,
          author: 'System'
      };

      const updatedClient = {
          ...client,
          stage: newStageName,
          lastContact: now,
          lastUpdated: now,
          followUp: {
              ...client.followUp,
              status: newStatus,
              lastContactedAt: now
          },
          stageHistory: [
              ...(client.stageHistory || []),
              { stage: newStageName, date: now }
          ],
          notes: [logEntry, ...(client.notes || [])]
      };
      
      logActivity(client.id, 'status_change', `Status changed to ${newStageName}`, {
          from: client.stage,
          to: newStageName,
          newStatus: newStatus
      });

      onUpdateGlobalClient(updatedClient);
  };

  const handleAddNote = (clientId: string, noteContent: string) => {
      const client = clients.find(c => c.id === clientId);
      if (!client) return;
      const newNote = {
          id: `note_${Date.now()}`,
          content: noteContent,
          date: new Date().toISOString(),
          author: user?.email || 'Me'
      };
      onUpdateGlobalClient({ 
          ...client, 
          notes: [newNote, ...(client.notes || [])],
          lastContact: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
      });
  };

  const handleAddSale = (clientId: string, sale: Sale) => {
      const client = clients.find(c => c.id === clientId);
      if(!client) return;
      onUpdateGlobalClient({
          ...client,
          sales: [...(client.sales || []), sale],
          stage: 'Client',
          followUp: { ...client.followUp, status: 'client' },
          momentumScore: 100,
          lastUpdated: new Date().toISOString(),
          stageHistory: [...(client.stageHistory || []), { stage: 'Client', date: new Date().toISOString() }],
          notes: [{ id: `sale_${Date.now()}`, content: `Sale Closed: ${sale.productName} ($${sale.premiumAmount})`, date: new Date().toISOString(), author: 'System' }, ...(client.notes || [])]
      });
      logActivity(client.id, 'sale_recorded', `Sale recorded: ${sale.productName} ($${sale.premiumAmount})`);
  };

  const handleDeleteClientWrapper = async (id: string) => {
      try {
          await deleteClient(id);
          setActiveDetailClient(null);
          toast.success("Client deleted successfully.");
      } catch (error: any) {
          console.error("Failed to delete client:", error);
          const msg = error instanceof Error ? error.message : String(error);
          toast.error(`Delete Failed: ${msg}`);
      }
  };

  const getMomentumColor = (score: number) => {
    if (score >= 70) return 'text-emerald-600 bg-emerald-50';
    if (score >= 40) return 'text-amber-600 bg-amber-50';
    return 'text-rose-600 bg-rose-50';
  };

  return (
    <div className="p-6 md:p-8 animate-fade-in pb-24 md:pb-8">
      <AnalyticsPanel clients={clients} />

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
         {/* Filter UI */}
         <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
             <div className="relative w-full md:w-64 shrink-0">
                 <input type="text" placeholder="Search clients..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm transition-all" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                 <svg className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
             </div>
             
             <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm cursor-pointer shrink-0">
                 <option value="All">All Stages</option>
                 {DEFAULT_SETTINGS.statuses.map(s => <option key={s} value={s}>{s}</option>)}
             </select>

             {availableAdvisors.length > 1 && (
                <select value={advisorFilter} onChange={(e) => setAdvisorFilter(e.target.value)} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm cursor-pointer shrink-0 min-w-[200px]">
                    <option value="All">All Advisors ({availableAdvisors.length})</option>
                    {availableAdvisors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
             )}

             <div className="hidden md:flex bg-white border border-slate-200 rounded-xl items-center p-1 shadow-sm ml-2 shrink-0">
                 <button onClick={() => setViewMode('cards')} className={`p-2 rounded-lg transition-all ${viewMode === 'cards' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="Card View"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg></button>
                 <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="List View"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></button>
             </div>
         </div>

         <div className="flex gap-3 w-full md:w-auto">
             <button onClick={() => setIsTemplateManagerOpen(true)} className="hidden lg:flex bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all items-center gap-2">
                 <span>📝</span> Templates
             </button>
             <button onClick={() => setIsCallSessionOpen(true)} className="flex-1 md:flex-none bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                 <span>⚡</span> Power Dialer
             </button>
             <button onClick={() => setIsImportOpen(true)} className="flex-1 md:flex-none bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
                 <span>📥</span> Import
             </button>
             <button onClick={newClient} className="flex-1 md:flex-none bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md hover:bg-slate-800 hover:shadow-lg transition-all flex items-center justify-center gap-2">
                 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> New Client
             </button>
         </div>
      </div>

      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredClients.map(client => (
                <div key={client.id} className="relative group">
                    <div className={`absolute top-2 left-2 z-10 ${selectedIds.has(client.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                        <input 
                            type="checkbox" 
                            checked={selectedIds.has(client.id)}
                            onChange={() => handleToggleSelect(client.id)}
                            className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shadow-sm"
                        />
                    </div>
                    <div className={selectedIds.has(client.id) ? 'ring-2 ring-indigo-500 rounded-xl' : ''}>
                        <ClientCard 
                            client={client} 
                            products={products} 
                            onUpdate={handleClientUpdate} 
                            currentUser={user}
                            onDelete={handleDeleteClientWrapper}
                            onAddSale={() => setActiveSaleClient(client)}
                        />
                    </div>
                    <div className="absolute top-4 right-4 flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <button onClick={() => loadClient(client, true)} className="bg-indigo-600 text-white p-1.5 rounded-full shadow-lg hover:bg-indigo-700 transition-colors" title="Full Profile"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button>
                        <button onClick={() => setActiveSaleClient(client)} className="bg-emerald-500 text-white p-1.5 rounded-full shadow-lg hover:bg-emerald-600 transition-colors" title="Add Sale"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button>
                        <button onClick={() => setActiveCommentsClient(client)} className="bg-slate-700 text-white p-1.5 rounded-full shadow-lg hover:bg-slate-800 transition-colors" title="View Logs"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg></button>
                        <button onClick={() => setActiveWhatsAppClient(client)} className="bg-[#25D366] text-white p-1.5 rounded-full shadow-lg hover:bg-[#128C7E] transition-colors" title="WhatsApp"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg></button>
                        {canDeleteClient && (
                            <button onClick={(e) => { e.stopPropagation(); if(confirm('Delete client?')) handleDeleteClientWrapper(client.id); }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                        )}
                    </div>
                </div>
            ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
           <div className="overflow-x-auto">
               <table className="w-full text-left text-sm">
                   <thead className="bg-slate-50 border-b border-slate-100">
                       <tr>
                           <th className="px-4 py-3 w-10">
                               <input 
                                   type="checkbox" 
                                   checked={filteredClients.length > 0 && selectedIds.size === filteredClients.length} 
                                   onChange={handleSelectAll} 
                                   className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                               />
                           </th>
                           <th className="px-4 py-3 font-semibold text-slate-500">Name</th>
                           <th className="px-4 py-3 font-semibold text-slate-500">Stage</th>
                           <th className="px-4 py-3 font-semibold text-slate-500">Pipeline</th>
                           <th className="px-4 py-3 font-semibold text-slate-500">Details</th>
                           <th className="px-4 py-3 font-semibold text-slate-500 text-right">Actions</th>
                       </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                       {filteredClients.map(client => (
                           <tr key={client.id} className={`hover:bg-slate-50 transition-colors group cursor-pointer ${selectedIds.has(client.id) ? 'bg-indigo-50/20' : ''}`} onClick={() => setActiveDetailClient(client)}>
                               <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                   <input 
                                       type="checkbox" 
                                       checked={selectedIds.has(client.id)} 
                                       onChange={() => handleToggleSelect(client.id)}
                                       className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                   />
                               </td>
                               <td className="px-4 py-3">
                                   <div className="font-bold text-slate-800">{client.name}</div>
                                   <div className="text-xs text-slate-400">{client.company}</div>
                               </td>
                               <td className="px-4 py-3">
                                   <div onClick={e => e.stopPropagation()}>
                                       <StatusDropdown client={client} onUpdate={handleStatusChange} />
                                   </div>
                               </td>
                               <td className="px-4 py-3">
                                   <div className={`text-sm font-bold ${getMomentumColor(client.momentumScore || 0).split(' ')[0]}`}>
                                       {client.momentumScore || 50} / 100
                                   </div>
                                   <div className="text-xs text-slate-400">${(client.value || 0).toLocaleString()}</div>
                               </td>
                               <td className="px-4 py-3 text-xs text-slate-500">
                                   <div>📞 {client.phone || '-'}</div>
                                   <div>✉️ {client.email || '-'}</div>
                               </td>
                               <td className="px-4 py-3 text-right">
                                   <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                       <button onClick={(e) => { e.stopPropagation(); setActiveWhatsAppClient(client); }} className="p-1.5 text-[#25D366] hover:bg-emerald-50 rounded-lg transition-colors" title="WhatsApp"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg></button>
                                       <button onClick={(e) => { e.stopPropagation(); setActiveSaleClient(client); }} className="p-1.5 text-emerald-500 hover:text-white hover:bg-emerald-500 rounded-lg transition-colors" title="Record Closure"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button>
                                       <button onClick={(e) => { e.stopPropagation(); loadClient(client, true); }} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Full Profile"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button>
                                       {canDeleteClient && (
                                           <button onClick={(e) => { e.stopPropagation(); if(confirm('Delete client?')) handleDeleteClientWrapper(client.id); }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                       )}
                                   </div>
                               </td>
                           </tr>
                       ))}
                   </tbody>
               </table>
           </div>
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-xl border border-slate-200 shadow-2xl rounded-full px-6 py-3 z-50 flex items-center gap-6 animate-in slide-in-from-bottom-4 ring-1 ring-black/5">
             <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 bg-slate-900 text-white rounded-full text-xs font-bold">{selectedIds.size}</span>
                <span className="text-xs font-bold text-slate-700">Selected</span>
             </div>
             <div className="h-4 w-px bg-slate-300"></div>
             <div className="flex gap-2">
                <button onClick={() => setIsBulkAssignOpen(true)} className="px-3 py-1.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors">Assign To...</button>
                {canDeleteClient && (
                    <button onClick={executeBulkDelete} disabled={isBulkProcessing} className="px-3 py-1.5 rounded-full text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 transition-colors flex items-center gap-2">
                       {isBulkProcessing ? <span className="animate-spin">↻</span> : <span>Delete</span>}
                    </button>
                )}
                <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 rounded-full text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors">Clear</button>
             </div>
          </div>
      )}

      {/* Bulk Assign Modal */}
      <Modal isOpen={isBulkAssignOpen} onClose={() => setIsBulkAssignOpen(false)} title={`Assign ${selectedIds.size} Clients`}>
          <div className="space-y-4">
              <p className="text-sm text-slate-600">Select the new portfolio custodian for these clients.</p>
              <select 
                  className="w-full p-3 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={bulkAssignTarget}
                  onChange={(e) => setBulkAssignTarget(e.target.value)}
              >
                  <option value="">Select Advisor...</option>
                  {availableAdvisors.map(adv => (
                      <option key={adv.id} value={adv.id}>{adv.name}</option>
                  ))}
              </select>
              <div className="flex justify-end gap-2 pt-4">
                  <Button variant="ghost" onClick={() => setIsBulkAssignOpen(false)}>Cancel</Button>
                  <Button variant="primary" onClick={executeBulkAssign} isLoading={isBulkProcessing} disabled={!bulkAssignTarget}>Confirm Assignment</Button>
              </div>
          </div>
      </Modal>

      {activeWhatsAppClient && <WhatsAppModal client={activeWhatsAppClient} templates={templates} onClose={() => setActiveWhatsAppClient(null)} />}
      {activeCommentsClient && <CommentsModal client={activeCommentsClient} onClose={() => setActiveCommentsClient(null)} onAddNote={(note) => handleAddNote(activeCommentsClient.id, note)} />}
      {activeSaleClient && <AddSaleModal clientName={activeSaleClient.name} products={products} advisorBanding={user?.bandingPercentage || 50} onClose={() => setActiveSaleClient(null)} onSave={(sale) => handleAddSale(activeSaleClient.id, sale)} />}
      
      {/* Import Modal */}
      {isImportOpen && (
        <ImportModal 
            isOpen={isImportOpen} 
            onClose={() => setIsImportOpen(false)} 
            onComplete={() => { onRefresh(); setIsImportOpen(false); }}
        />
      )}

      {activeDetailClient && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setActiveDetailClient(null)}>
            <div className="w-full max-w-2xl h-[85vh] animate-scale-in flex flex-col" onClick={e => e.stopPropagation()}>
                 <div className="bg-white rounded-xl shadow-2xl h-full overflow-hidden flex flex-col">
                    <ClientCard 
                        client={activeDetailClient}
                        products={products} // Pass products to detail view as well
                        onUpdate={(c) => { handleClientUpdate(c); setActiveDetailClient(c); }} 
                        currentUser={user} 
                        onDelete={handleDeleteClientWrapper} 
                        onAddSale={() => setActiveSaleClient(activeDetailClient)} 
                        onClose={() => setActiveDetailClient(null)}
                    />
                 </div>
            </div>
        </div>
      )}
      
      <CallSessionModal 
         isOpen={isCallSessionOpen}
         onClose={() => setIsCallSessionOpen(false)}
         clients={clients}
         onUpdateClient={handleManualUpdate}
      />

      <Modal
        isOpen={isTemplateManagerOpen}
        onClose={() => setIsTemplateManagerOpen(false)}
        title="Personal Templates"
        footer={<button onClick={() => setIsTemplateManagerOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg">Close</button>}
      >
         <TemplateManager 
            templates={templates} 
            onUpdateTemplates={setTemplates} 
         />
      </Modal>
    </div>
  );
};

export default CrmTab;
