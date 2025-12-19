
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Client, FieldDefinition, Profile } from '../../types';
import { fetchClients, saveClientUpdate } from '../../lib/db/crm';
import { getFieldDefinitions, upsertFieldValue, createFieldDefinition } from '../../lib/db/dynamicFields';
import { useWriteQueue } from '../../hooks/useWriteQueue';
import { toNum, fmtSGD } from '../../lib/helpers';

// New Apple UI Components
import Button from '../../components/ui/Button';
import ToggleSwitch from '../../components/ui/ToggleSwitch';
import SegmentedControl from '../../components/ui/SegmentedControl';
import Modal from '../../components/ui/Modal';
import CommandBar from '../../components/ui/CommandBar';
import { useHotkeys } from '../../components/ui/useHotkeys';

// CRM Components
import ColumnHeader from './components/ColumnHeader';
import CrmRow from './components/CrmRow';
import ViewsDropdown, { SavedView } from './components/ViewsDropdown';
import ColumnPicker from './components/ColumnPicker';
import ClientDrawer from './components/ClientDrawer';
import BlastModal from './components/BlastModal';

interface CrmTabProps {
  clients: Client[];
  profile: Profile;
  selectedClientId: string | null;
  newClient: () => void;
  saveClient: () => void;
  loadClient: (client: Client, redirect: boolean) => void;
  deleteClient: (id: string) => void;
  setFollowUp: () => void;
  completeFollowUp: (id: string) => void;
  maxClients: number;
  userRole?: string;
  onRefresh: () => void;
}

const CrmTab: React.FC<CrmTabProps> = ({ 
  clients: globalClients, 
  loadClient, 
  onRefresh,
  deleteClient
}) => {
  const [localClients, setLocalClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  
  // Persistence & UI State
  const [isCompact, setIsCompact] = useState(() => localStorage.getItem('crm_density') === 'compact');
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem('crm_motion') === 'reduced');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBlastOpen, setIsBlastOpen] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  
  // Filtering & View
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortCol, setSortCol] = useState('updated_at');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<string>>(new Set(['name', 'status', 'phone', 'opportunity']));
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [selectedClientForDrawer, setSelectedClientForDrawer] = useState<Client | null>(null);

  // Persistence
  useEffect(() => {
    localStorage.setItem('crm_density', isCompact ? 'compact' : 'comfortable');
    localStorage.setItem('crm_motion', reducedMotion ? 'reduced' : 'normal');
  }, [isCompact, reducedMotion]);

  // Global Shortcuts
  useHotkeys('k', () => setIsCommandOpen(true), { meta: true });
  useHotkeys('b', () => setIsBlastOpen(true), { meta: true });

  const { rowStatuses, enqueue } = useWriteQueue(async (id, data) => {
     await saveClientUpdate(id, data);
     onRefresh();
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const statuses = statusFilter === 'all' ? [] : [statusFilter];
      const { rows, total } = await fetchClients({ query, statuses, sortBy: sortCol, sortDir });
      setLocalClients(rows);
      setTotal(total);
      setFields(await getFieldDefinitions());
    } catch (e) { console.error(e); } 
    finally { setLoading(false); }
  }, [query, statusFilter, sortCol, sortDir]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleUpdate = (id: string, field: string, value: any, section?: string) => {
    setLocalClients(prev => prev.map(c => {
      if (c.id !== id) return c;
      const copy = { ...c };
      if (section === 'dynamic') {
         copy.fieldValues = { ...(copy.fieldValues || {}), [field]: value };
         const fDef = fields.find(f => f.id === field || f.key === field);
         if(fDef) upsertFieldValue(id, fDef.id, fDef.type, value);
      } else if (section) {
         (copy as any)[section] = { ...(copy as any)[section], [field]: value };
      }
      enqueue(id, copy);
      return copy;
    }));
  };

  const columns = useMemo(() => {
     const base = [
        { id: 'name', label: 'Client Name', type: 'text', field: 'name', section: 'profile', minWidth: 240 },
        { id: 'status', label: 'Lifecycle Stage', type: 'select', field: 'status', section: 'followUp', minWidth: 180 },
        { id: 'opportunity', label: 'Potential', type: 'number', field: 'score', section: 'meta', minWidth: 140 },
        { id: 'phone', label: 'Mobile Contact', type: 'phone', field: 'phone', section: 'profile', minWidth: 180 },
     ];
     const dynamic = fields.map(f => ({
        id: f.id, label: f.label, type: f.type, field: f.key, section: 'dynamic', minWidth: 160
     }));
     return [...base, ...dynamic].filter(c => visibleColumnIds.has(c.id));
  }, [fields, visibleColumnIds]);

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  return (
    <div className={`flex flex-col h-full bg-white overflow-hidden ${reducedMotion ? 'motion-reduce' : ''}`}>
      
      {/* --- PREMIUM TOOLBAR --- */}
      <div className="h-16 border-b flex items-center justify-between px-6 gap-6 bg-white z-40 shrink-0 shadow-sm">
         <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <span className="text-xl">📋</span>
              <div className="flex flex-col">
                 <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 leading-none mb-1">Portfolio Grid</h2>
                 <span className="text-sm font-bold text-slate-900 leading-none">{total} Clients</span>
              </div>
            </div>
            
            <SegmentedControl 
              options={[
                { label: 'All', value: 'all' },
                { label: 'Leads', value: 'new' },
                { label: 'Meetings', value: 'appt_set' },
                { label: 'Clients', value: 'client' }
              ]}
              value={statusFilter}
              onChange={setStatusFilter}
            />
         </div>

         <div className="flex items-center gap-6 flex-1 justify-end">
            <div className="relative max-w-sm w-full group">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-sm group-focus-within:text-indigo-500 transition-colors">🔍</span>
              <input 
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border-transparent rounded-xl text-[11px] font-bold focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all outline-none text-slate-700"
                placeholder="Find records... (Cmd+K)"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            
            <div className="h-4 w-px bg-slate-200" />
            
            <div className="flex items-center gap-5">
              <ToggleSwitch label="Compact" enabled={!!isCompact} onChange={(v) => setIsCompact(v ? 'compact' : '')} size="sm" />
              <ColumnPicker 
                allColumns={columns} 
                visibleColumnIds={visibleColumnIds} 
                onChange={setVisibleColumnIds} 
                onManageFields={onRefresh} 
              />
              <ViewsDropdown 
                currentView={{ filters: { query, statuses: [] }, sort: { col: sortCol, dir: sortDir }, visibleColumnIds, colWidths }} 
                onApply={(v) => {
                  setSortCol(v.sort.col); setSortDir(v.sort.dir); setVisibleColumnIds(new Set(v.visible_column_ids)); setColWidths(v.col_widths);
                }} 
              />
              <Button variant="primary" size="sm" leftIcon="＋" onClick={() => loadClient({} as any, true)}>New Client</Button>
            </div>
         </div>
      </div>

      {/* --- SELECTION HUD --- */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-8 animate-in slide-in-from-bottom-10 duration-300">
           <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-[11px] font-black">{selectedIds.size}</span>
              <span className="text-xs font-black uppercase tracking-widest opacity-60">Selection Active</span>
           </div>
           <div className="h-4 w-px bg-slate-700" />
           <div className="flex items-center gap-3">
              <Button variant="ghost" className="text-white hover:bg-slate-800 border-none" size="sm" onClick={() => setIsBlastOpen(true)} leftIcon="💬">Smart Blast</Button>
              <Button variant="danger" size="sm" onClick={() => { selectedIds.forEach(id => deleteClient(id)); setSelectedIds(new Set()); }} leftIcon="🗑">Delete</Button>
              <button onClick={() => setSelectedIds(new Set())} className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors ml-4">Cancel</button>
           </div>
        </div>
      )}

      {/* --- MAIN GRID --- */}
      <div className="flex-1 overflow-auto custom-scrollbar bg-slate-50/20">
         <table className="w-full border-collapse table-fixed">
            <thead className="sticky top-0 z-30">
               <tr className="bg-white/95 backdrop-blur-md">
                  <th className="w-12 border-r border-b border-slate-100 p-0 h-10 flex items-center justify-center">
                    <input 
                       type="checkbox" 
                       className="rounded border-slate-200 text-indigo-600 focus:ring-indigo-500" 
                       checked={selectedIds.size === localClients.length && localClients.length > 0}
                       onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(localClients.map(c => c.id)));
                          else setSelectedIds(new Set());
                       }}
                    />
                  </th>
                  {columns.map(col => (
                     <th key={col.id} className="p-0 border-r border-b border-slate-100">
                        <ColumnHeader 
                          label={col.label} type={col.type} width={colWidths[col.id] || col.minWidth} 
                          isSorted={sortCol === col.id ? sortDir : null}
                          onSort={dir => { setSortCol(col.id); setSortDir(dir || 'desc'); }}
                          onHide={() => {
                             const next = new Set(visibleColumnIds);
                             next.delete(col.id);
                             setVisibleColumnIds(next);
                          }} 
                          onResize={(w) => setColWidths(prev => ({...prev, [col.id]: w}))}
                        />
                     </th>
                  ))}
               </tr>
            </thead>
            <tbody>
               {localClients.map(client => (
                  <CrmRow 
                    key={client.id}
                    client={client}
                    columns={columns}
                    colWidths={colWidths}
                    selectedRowIds={selectedIds}
                    activeCell={null}
                    editingCell={null}
                    statusOptions={['new', 'picked_up', 'appt_set', 'proposal', 'client', 'not_keen']}
                    onToggleSelection={toggleSelection}
                    onSetActive={() => {}}
                    onSetEditing={() => {}}
                    onStopEditing={() => {}}
                    onUpdate={handleUpdate}
                    onLoadClient={(c) => loadClient(c, true)}
                    onQuickView={setSelectedClientForDrawer}
                    rowHeight={isCompact ? 36 : 44}
                    renderStatus={(id) => {
                       const s = rowStatuses[id]?.status || 'idle';
                       if (s === 'saving') return <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>;
                       if (s === 'saved') return <div className="text-emerald-500 text-[10px] font-bold">✓</div>;
                       return null;
                    }}
                  />
               ))}
               
               {localClients.length === 0 && !loading && (
                 <tr>
                    <td colSpan={columns.length + 1} className="py-40 text-center bg-white">
                       <div className="max-w-md mx-auto space-y-8 px-8">
                          <div className="relative h-32 w-32 mx-auto opacity-5">
                            <svg viewBox="0 0 24 24" className="w-full h-full fill-slate-900"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" /></svg>
                          </div>
                          <div className="space-y-3">
                             <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Vault Empty</h3>
                             <p className="text-sm text-slate-400 font-medium leading-relaxed">No matching client records found. Adjust your lifecycle filters or start a new intake to populate the portfolio.</p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-3 justify-center">
                             <Button variant="secondary" leftIcon="📥">Import CSV</Button>
                             <Button variant="primary" leftIcon="＋" onClick={() => loadClient({} as any, true)}>Create Client</Button>
                          </div>
                       </div>
                    </td>
                 </tr>
               )}
            </tbody>
         </table>
      </div>

      {/* MODALS & OVERLAYS */}
      <CommandBar 
        isOpen={isCommandOpen} 
        onClose={() => setIsCommandOpen(false)} 
        clients={localClients}
        onSelectClient={c => loadClient(c, true)}
        onAction={(action) => {
          if (action === 'toggle_compact') setIsCompact(prev => prev ? '' : 'compact');
          if (action === 'new_client') loadClient({} as any, true);
          if (action === 'open_blast') setIsBlastOpen(true);
        }}
      />

      <BlastModal 
        isOpen={isBlastOpen} onClose={() => setIsBlastOpen(false)} 
        selectedCount={selectedIds.size}
        blastTopic="" setBlastTopic={() => {}} blastMessage="" setBlastMessage={() => {}}
        isGeneratingBlast={false} onGenerateAI={() => {}}
        generatedLinks={[]} onGenerateLinks={() => {}}
      />

      {selectedClientForDrawer && (
        <ClientDrawer 
          client={selectedClientForDrawer} isOpen={!!selectedClientForDrawer} onClose={() => setSelectedClientForDrawer(null)}
          onUpdateField={handleUpdate} onStatusUpdate={(c, s) => handleUpdate(c.id, 'status', s, 'followUp')}
          onOpenFullProfile={() => loadClient(selectedClientForDrawer, true)} onDelete={() => deleteClient(selectedClientForDrawer.id)}
        />
      )}
    </div>
  );
};

export default CrmTab;
