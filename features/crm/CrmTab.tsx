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
}

const CrmTab: React.FC<CrmTabProps> = ({ 
    clients = [], // Default to empty array
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
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('list');
  const [isGrouped, setIsGrouped] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'lastUpdated', direction: 'desc' });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeDetailClientId, setActiveDetailClientId] = useState<string | null>(null);
  const [advisorMap, setAdvisorMap] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>(DEFAULT_TEMPLATES.map(t => ({id: t.id, label: t.label, content: t.content})));

  const activeDetailClient = useMemo(() => clients.find(c => c.id === activeDetailClientId) || null, [clients, activeDetailClientId]);

  // AUTO-REFRESH ON MOUNT
  useEffect(() => {
      onRefresh();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('profiles').select('id, name, email').then(({ data }) => {
        if (data) {
            const map: Record<string, string> = {};
            data.forEach(p => map[p.id] = p.name || p.email?.split('@')[0] || 'Unknown');
            setAdvisorMap(map);
        }
    });
  }, [clients.length]);

  const filteredClients = useMemo(() => {
    let filtered = (clients || []).filter(client => {
      const name = client.name || client.profile?.name || '';
      const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase());
      const currentStatus = client.followUp?.status || client.stage || '';
      const matchesStage = stageFilter === 'All' || currentStatus === stageFilter || client.stage === stageFilter;
      const effectiveOwner = client.advisorId || client._ownerId;
      const matchesAdvisor = advisorFilter === 'All' || effectiveOwner === advisorFilter;
      return matchesSearch && matchesStage && matchesAdvisor;
    });

    if (sortConfig.key) {
        filtered.sort((a, b) => {
            let aVal: any = sortConfig.key === 'name' ? (a.name || '').toLowerCase() : new Date(a.lastUpdated || 0).getTime();
            let bVal: any = sortConfig.key === 'name' ? (b.name || '').toLowerCase() : new Date(b.lastUpdated || 0).getTime();
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }
    return filtered;
  }, [clients, searchTerm, stageFilter, advisorFilter, sortConfig]);

  const availableAdvisors = useMemo(() => {
    const map = new Map<string, string>();
    (clients || []).forEach(c => {
      const id = c.advisorId || c._ownerId;
      if (id) map.set(id, advisorMap[id] || c._ownerEmail || 'Advisor');
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [clients, advisorMap]);

  if (!clients) return <div className="p-10 text-center text-slate-400">Loading Pipeline...</div>;

  return (
    <div className="p-6 md:p-8 animate-fade-in pb-24 md:pb-8">
      <AnalyticsPanel clients={clients} advisorFilter={advisorFilter} setAdvisorFilter={setAdvisorFilter} availableAdvisors={availableAdvisors} />

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
         <div className="flex items-center gap-2 w-full md:w-auto">
             <input type="text" placeholder="Search..." className="flex-1 md:w-64 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
             <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm">
                 <option value="All">Stages</option>
                 {DEFAULT_SETTINGS.statuses.map(s => <option key={s} value={s}>{s}</option>)}
             </select>
             <button onClick={() => setViewMode(v => v === 'list' ? 'cards' : 'list')} className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-slate-600 transition-colors">
                {viewMode === 'list' ? '▦' : '☰'}
             </button>
         </div>
         <div className="flex gap-2 w-full md:w-auto">
             <Button variant="secondary" onClick={onRefresh} leftIcon="↻" className="flex-1 md:flex-none">Sync</Button>
             <Button variant="primary" onClick={newClient} leftIcon="＋" className="flex-1 md:flex-none">New Client</Button>
         </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[200px]">
          {filteredClients.length === 0 && (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                  <div className="text-4xl mb-4 opacity-20 grayscale">📭</div>
                  <h3 className="text-slate-800 font-bold">No Clients Found</h3>
                  <p className="text-slate-500 text-sm mb-6">Your pipeline looks empty. Try syncing or adding a new client.</p>
                  <Button onClick={onRefresh} variant="secondary" leftIcon="⚡">Force Data Reload</Button>
              </div>
          )}
          {filteredClients.length > 0 && viewMode === 'list' ? (
              <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                          <th className="px-6 py-3 font-semibold text-slate-500">Client</th>
                          <th className="px-6 py-3 font-semibold text-slate-500">Status</th>
                          <th className="px-6 py-3 font-semibold text-slate-500">Sync</th>
                          <th className="px-6 py-3 font-semibold text-slate-500 text-right">Actions</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {filteredClients.map(client => (
                          <tr key={client.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setActiveDetailClientId(client.id)}>
                              <td className="px-6 py-4">
                                  <div className="font-bold text-slate-800">{client.name}</div>
                                  <div className="text-[10px] text-slate-400 uppercase font-bold">{client.company}</div>
                              </td>
                              <td className="px-6 py-4">
                                  <StatusDropdown client={client} onUpdate={(c, s) => onUpdateGlobalClient({...c, followUp: {...c.followUp, status: s}})} />
                              </td>
                              <td className="px-6 py-4">
                                  {client._isSynced ? <span className="text-emerald-500">✓</span> : <span className="text-amber-500">⌛</span>}
                              </td>
                              <td className="px-6 py-4 text-right">
                                  <button onClick={(e) => { e.stopPropagation(); loadClient(client, true); }} className="text-indigo-600 font-bold hover:underline text-xs">Manage</button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          ) : null}
          
          {filteredClients.length > 0 && viewMode === 'cards' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                  {filteredClients.map(client => (
                      <ClientCard key={client.id} client={client} onUpdate={onUpdateGlobalClient} onDelete={deleteClient} />
                  ))}
              </div>
          )}
      </div>

      {activeDetailClient && (
        <Modal isOpen={!!activeDetailClient} onClose={() => setActiveDetailClientId(null)} title="Client Dossier">
            <ClientCard client={activeDetailClient} onUpdate={onUpdateGlobalClient} onDelete={deleteClient} onClose={() => setActiveDetailClientId(null)} />
        </Modal>
      )}
    </div>
  );
};

export default CrmTab;