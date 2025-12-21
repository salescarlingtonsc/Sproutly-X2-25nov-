
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Client, FieldDefinition, Profile, ContactStatus } from '../../types';
import { getFieldDefinitions } from '../../lib/db/dynamicFields';
import { useClient } from '../../contexts/ClientContext';
import { useAuth } from '../../contexts/AuthContext';
import { calculateLeadScore } from '../../lib/gemini';
import { fmtSGD, toNum } from '../../lib/helpers';
import { dbTemplates, DBTemplate } from '../../lib/db/templates';

// UI Components
import Button from '../../components/ui/Button';
import SegmentedControl from '../../components/ui/SegmentedControl';
import CommandBar from '../../components/ui/CommandBar';
import { useHotkeys } from '../../components/ui/useHotkeys';

// CRM Components
import ColumnHeader from './components/ColumnHeader';
import CrmRow from './components/CrmRow';
import ColumnPicker from './components/ColumnPicker';
import ClientDrawer from './components/ClientDrawer';
import ImportModal from './components/ImportModal';
import BlastModal from './components/BlastModal';
import ProtocolManagerModal from './components/ProtocolManagerModal';
import ViewsDropdown, { SavedView } from './components/ViewsDropdown';

interface CrmTabProps {
  clients: Client[];
  profile: Profile;
  selectedClientId: string | null;
  newClient: () => void;
  saveClient: () => void;
  loadClient: (client: Client, redirect: boolean) => void;
  deleteClient: (id: string) => void;
  onRefresh: () => void;
  onUpdateGlobalClient: (client: Client) => void;
}

const CrmTab: React.FC<CrmTabProps> = ({ 
  clients: globalClients, 
  loadClient, 
  onRefresh,
  deleteClient,
  selectedClientId,
  onUpdateGlobalClient
}) => {
  const { user } = useAuth();
  const { loadClient: syncToContext } = useClient();
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isBlastOpen, setIsBlastOpen] = useState(false);
  const [isProtocolOpen, setIsProtocolOpen] = useState(false);
  const [templateCount, setTemplateCount] = useState(0);
  
  const [localClients, setLocalClients] = useState<Client[]>(globalClients);
  const isEditingRef = useRef(false);

  const isReadOnly = user?.role === 'viewer';

  useEffect(() => {
    if (!isEditingRef.current) {
      setLocalClients(globalClients);
    }
  }, [globalClients]);

  useEffect(() => {
    (async () => {
      setFields(await getFieldDefinitions());
      setLoadingFields(false);
      const tpts = await dbTemplates.getTemplates();
      setTemplateCount(tpts.length);
    })();
  }, []);

  const [isCompact, setIsCompact] = useState(() => localStorage.getItem('crm_density') === 'compact');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  
  const [activeCell, setActiveCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null);

  // Filtering & View
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortCol, setSortCol] = useState('updated_at');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  // Updated defaults to include consolidated schedule columns
  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<string>>(new Set(['name', 'phone', 'next_appt_combined', 'next_follow_up_combined', 'status', 'ai_score', 'expected_revenue', 'owner_email']));
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [selectedClientForDrawer, setSelectedClientForDrawer] = useState<Client | null>(null);

  const handleApplyView = (view: SavedView) => {
    if (view.filters?.query !== undefined) setQuery(view.filters.query);
    if (view.sort) {
      setSortCol(view.sort.col);
      setSortDir(view.sort.dir);
    }
    if (view.visible_column_ids) setVisibleColumnIds(new Set(view.visible_column_ids));
    if (view.col_widths) setColWidths(view.col_widths);
  };

  const filteredAndSortedClients = useMemo(() => {
    let result = [...localClients];
    if (query) {
      const q = query.toLowerCase();
      result = result.filter(c => 
        (c.profile?.name || '').toLowerCase().includes(q) || 
        (String(c.profile?.phone || '')).includes(q)
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter(c => (c.followUp?.status || 'new') === statusFilter);
    }
    result.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';
      if (sortCol === 'name') { valA = a.profile?.name || ''; valB = b.profile?.name || ''; }
      else if (sortCol === 'status') { valA = a.followUp?.status || ''; valB = b.followUp?.status || ''; }
      else if (sortCol === 'ai_score') { valA = toNum(a.followUp?.ai_propensity_score); valB = toNum(b.followUp?.ai_propensity_score); }
      else if (sortCol === 'expected_revenue') { 
        valA = toNum(a.followUp?.dealValue) * (toNum(a.followUp?.ai_propensity_score, 50)/100); 
        valB = toNum(b.followUp?.dealValue) * (toNum(b.followUp?.ai_propensity_score, 50)/100); 
      }
      else if (sortCol === 'last_contact') { valA = a.followUp?.lastContactedAt || ''; valB = b.followUp?.lastContactedAt || ''; }
      else if (sortCol === 'next_follow_up_combined') { valA = a.followUp?.nextFollowUpDate || ''; valB = b.followUp?.nextFollowUpDate || ''; }
      else if (sortCol === 'next_appt_combined') { valA = a.appointments?.firstApptDate || ''; valB = b.appointments?.firstApptDate || ''; }
      else if (sortCol === 'updated_at') { valA = a.lastUpdated || ''; valB = b.lastUpdated || ''; }
      else { valA = a.fieldValues?.[sortCol] || ''; valB = b.fieldValues?.[sortCol] || ''; }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [localClients, query, statusFilter, sortCol, sortDir]);

  const columns = useMemo(() => {
     const base = [
        { id: 'name', label: 'Client Identity', type: 'text', field: 'name', section: 'profile', minWidth: 200 },
        { id: 'phone', label: 'Contact (WA)', type: 'phone', field: 'phone', section: 'profile', minWidth: 160 },
        // Consolidated Date & Time Columns (Requirement 2 & 3)
        { id: 'next_appt_combined', label: 'Appointment', type: 'datetime-combined', field: 'firstApptDate', section: 'appointments', minWidth: 180 },
        { id: 'next_follow_up_combined', label: 'Follow Up', type: 'datetime-combined', field: 'nextFollowUpDate', section: 'followUp', minWidth: 180 },
        { id: 'status', label: 'Stage', type: 'select', field: 'status', section: 'followUp', minWidth: 160 },
        { id: 'ai_score', label: 'Propensity %', type: 'number', field: 'ai_propensity_score', section: 'followUp', minWidth: 120 },
        { id: 'expected_revenue', label: 'Weighted Val', type: 'currency', field: 'dealValue', section: 'followUp', minWidth: 140 },
        { id: 'last_contact', label: 'Last Touch', type: 'date', field: 'lastContactedAt', section: 'followUp', minWidth: 140 },
        { id: 'owner_email', label: 'Manager', type: 'text', field: '_ownerEmail', section: 'meta', minWidth: 180 },
     ];
     const dynamic = fields.map(f => ({ id: f.id, label: f.label, type: f.type, field: f.key, section: 'dynamic', minWidth: 150 }));
     return [...base, ...dynamic].filter(c => visibleColumnIds.has(c.id));
  }, [fields, visibleColumnIds]);

  const handleUpdate = (id: string, field: string, value: any, section?: string) => {
    if (isReadOnly) return;
    isEditingRef.current = true;
    const clientToUpdate = localClients.find(c => c.id === id);
    if (!clientToUpdate) return;
    const copy = JSON.parse(JSON.stringify(clientToUpdate));
    
    if (section === 'dynamic') {
       copy.fieldValues = { ...(copy.fieldValues || {}), [field]: value };
    } else if (section) {
       const parts = section.split('.');
       let target = copy;
       for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          if (i === parts.length - 1) { target[p] = { ...(target[p] || {}), [field]: value }; }
          else { target[p] = target[p] || {}; target = target[p]; }
       }
    }
    setLocalClients(prev => prev.map(c => c.id === id ? copy : c));
    onUpdateGlobalClient(copy);
    if (id === selectedClientId) syncToContext(copy);
    setTimeout(() => { isEditingRef.current = false; }, 2000);
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  useHotkeys('k', () => setIsCommandOpen(true), { meta: true });

  const customStatusOptions: ContactStatus[] = [
    'new', 'picked_up', 'npu_1', 'npu_2', 'npu_3', 'npu_4', 'npu_5', 'npu_6', 
    'appt_set', 'appt_met', 'pending_decision', 'case_closed', 'not_keen'
  ];

  return (
    <div className={`flex flex-col h-full bg-white overflow-hidden`}>
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center gap-10">
         <div className="flex flex-col">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Global pipeline</span>
            <span className="text-xl font-black text-slate-900">{fmtSGD(filteredAndSortedClients.length * 5000).split('.')[0]} <span className="text-[10px] text-slate-300 font-bold uppercase ml-1">Est</span></span>
         </div>
         <div className="flex-col hidden md:flex">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Active Velocity</span>
            <span className="text-xl font-black text-indigo-600">{((filteredAndSortedClients.filter(c => c.followUp.status !== 'new').length / (localClients.length || 1))*100).toFixed(0)}%</span>
         </div>
         <div className="flex-1" />
         <div className="flex items-center gap-3">
             <ViewsDropdown currentView={{ filters: { query, statuses: [] }, sort: { col: sortCol, dir: sortDir }, visibleColumnIds, colWidths }} onApply={handleApplyView} />
         </div>
      </div>

      <div className="h-16 border-b flex items-center justify-between px-6 gap-6 bg-white shrink-0 shadow-sm">
         <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xl">📋</span>
              <div className="flex flex-col">
                 <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 leading-none mb-1">Quantum Spreadsheet</h2>
                 <span className="text-sm font-bold text-slate-900 leading-none">{filteredAndSortedClients.length} Records</span>
              </div>
            </div>
            <div className="h-8 w-px bg-slate-100 mx-2" />
            <SegmentedControl 
              options={[{ label: 'All', value: 'all' }, { label: 'Inbound', value: 'new' }, { label: 'Meetings', value: 'appt_set' }]}
              value={statusFilter} onChange={setStatusFilter}
            />
         </div>

         <div className="flex items-center gap-6 flex-1 justify-end">
            <div className="relative max-w-xs w-full group">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-sm group-focus-within:text-indigo-500 transition-colors">🔍</span>
              <input className="w-full pl-9 pr-4 py-2 bg-slate-50 border-transparent rounded-xl text-[11px] font-bold focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all outline-none text-slate-700" placeholder="Airtable-style Search..." value={query} onChange={e => setQuery(e.target.value)} />
            </div>
            <div className="flex items-center gap-4">
              {!isReadOnly && <Button variant="ghost" size="sm" leftIcon="📥" onClick={() => setIsImportOpen(true)}>Import</Button>}
              <Button variant="ghost" size="sm" leftIcon="💬" onClick={() => setIsProtocolOpen(true)} className="relative">
                Protocols
                {templateCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-600 text-white text-[8px] rounded-full flex items-center justify-center font-black">
                    {templateCount}
                  </span>
                )}
              </Button>
              <ColumnPicker allColumns={columns} visibleColumnIds={visibleColumnIds} onChange={setVisibleColumnIds} onManageFields={onRefresh} />
              {!isReadOnly && <Button variant="primary" size="sm" leftIcon="＋" onClick={() => loadClient({} as any, true)}>Add</Button>}
            </div>
         </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar bg-slate-50/20" onClick={() => { if(!editingCell) setActiveCell(null); }}>
         <table className="w-full border-collapse table-fixed">
            <thead className="sticky top-0 z-30">
               <tr className="bg-white/95 backdrop-blur-md">
                  <th className="w-12 border-r border-b border-slate-100 p-0 h-10 flex items-center justify-center">
                    <input type="checkbox" className="rounded border-slate-200 text-indigo-600 focus:ring-indigo-500" checked={selectedIds.size === filteredAndSortedClients.length && filteredAndSortedClients.length > 0} onChange={(e) => e.target.checked ? setSelectedIds(new Set(filteredAndSortedClients.map(c => c.id))) : setSelectedIds(new Set())} />
                  </th>
                  {columns.map(col => (
                     <th key={col.id} className="p-0 border-r border-b border-slate-100">
                        <ColumnHeader label={col.label} type={col.type} width={colWidths[col.id] || col.minWidth} isSorted={sortCol === col.id ? sortDir : null} onSort={dir => { setSortCol(col.id); setSortDir(dir || 'desc'); }} onHide={() => { const next = new Set(visibleColumnIds); next.delete(col.id); setVisibleColumnIds(next); }} onResize={(w) => setColWidths(prev => ({...prev, [col.id]: w}))} />
                     </th>
                  ))}
               </tr>
            </thead>
            <tbody>
               {filteredAndSortedClients.map(client => (
                  <CrmRow 
                    key={client.id} 
                    client={client} 
                    columns={columns} 
                    colWidths={colWidths} 
                    selectedRowIds={selectedIds} 
                    activeCell={activeCell} 
                    editingCell={editingCell} 
                    statusOptions={customStatusOptions} 
                    onToggleSelection={toggleSelection} 
                    onSetActive={(r, c) => { if(!editingCell) setActiveCell({rowId: r, colId: c}); }} 
                    onSetEditing={(rowId, colId) => setEditingCell({ rowId, colId })} 
                    onStopEditing={() => setEditingCell(null)} 
                    onUpdate={handleUpdate} 
                    onLoadClient={(c) => loadClient(c, true)} 
                    onQuickView={setSelectedClientForDrawer} 
                    rowHeight={isCompact ? 36 : 46} 
                    renderStatus={() => null} 
                  />
               ))}
            </tbody>
         </table>
      </div>

      <CommandBar isOpen={isCommandOpen} onClose={() => setIsCommandOpen(false)} clients={globalClients} onSelectClient={c => loadClient(c, true)} onAction={(action) => { if (action === 'toggle_compact') setIsCompact(prev => !prev); if (action === 'new_client' && !isReadOnly) loadClient({} as any, true); if (action === 'open_blast') setIsBlastOpen(true); if (action === 'import_csv' && !isReadOnly) setIsImportOpen(true); }} />

      {selectedClientForDrawer && <ClientDrawer client={selectedClientForDrawer} isOpen={!!selectedClientForDrawer} onClose={() => setSelectedClientForDrawer(null)} onUpdateField={handleUpdate} onStatusUpdate={(c, s) => handleUpdate(c.id, 'status', s, 'followUp')} onOpenFullProfile={() => loadClient(selectedClientForDrawer, true)} onDelete={() => deleteClient(selectedClientForDrawer.id)} />}

      <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} onComplete={onRefresh} />
      <ProtocolManagerModal isOpen={isProtocolOpen} onClose={() => { setIsProtocolOpen(false); onRefresh(); }} />
    </div>
  );
};

export default CrmTab;
