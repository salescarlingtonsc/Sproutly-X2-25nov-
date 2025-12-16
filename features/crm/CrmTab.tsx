import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Client } from '../../types';
import { db } from '../../lib/db';
import { useAuth } from '../../contexts/AuthContext';
import { generateWhatsAppDraft } from '../../lib/gemini';
import ColumnHeader from './components/ColumnHeader';
import ClientDrawer from './components/ClientDrawer';
import BlastModal from './components/BlastModal';
import CrmRow from './components/CrmRow';
import { toNum } from '../../lib/helpers';

// --- CONSTANTS ---
const VIEW_SETTINGS_KEY = 'crm_view_settings_v1';
const STATUS_OPTIONS = ['new', 'picked_up', 'appt_set', 'proposal', 'client', 'not_keen'];
const ROW_HEIGHT = 44; 
const OVERSCAN = 15; // Increased overscan for smoother scrolling

// Column Definitions
const COLUMNS = [
  { id: 'name', label: 'Name', type: 'text', minWidth: 200, field: 'name', section: 'profile' },
  { id: 'status', label: 'Status', type: 'select', minWidth: 140, field: 'status', section: 'followUp' },
  { id: 'phone', label: 'Phone', type: 'phone', minWidth: 120, field: 'phone', section: 'profile' },
  { id: 'nextAppt', label: 'Next Appt', type: 'date', minWidth: 150, field: 'nextApptDate', section: 'appointments' },
  { id: 'location', label: 'Location', type: 'text', minWidth: 150, field: 'location', section: 'appointments' },
  { id: 'notes', label: 'Notes', type: 'text', minWidth: 250, field: 'notes', section: 'followUp' },
  { id: 'income', label: 'Income', type: 'currency', minWidth: 120, field: 'monthlyIncome', section: 'profile' },
  { id: 'aum', label: 'AUM', type: 'currency', minWidth: 120, field: 'portfolioValue', section: 'investorState' }
];

interface CrmTabProps {
  clients: Client[];
  profile: any;
  selectedClientId: string | null;
  newClient: () => void;
  saveClient: () => void;
  loadClient: (client: Client, redirect?: boolean) => void;
  deleteClient: (id: string) => void;
  setFollowUp: (val: any) => void;
  completeFollowUp: (id: string) => void;
  maxClients: number;
  userRole?: string;
  onRefresh: () => void;
}

const CrmTab: React.FC<CrmTabProps> = ({ 
  clients, 
  loadClient, 
  deleteClient, 
  onRefresh
}) => {
  const { user } = useAuth();
  
  // --- 1. LOCAL STATE & REFS ---
  const [localClients, setLocalClients] = useState<Client[]>(clients);
  const localClientsRef = useRef<Client[]>(clients);
  
  useEffect(() => {
    if (!isSavingRef.current && dirtyRowsRef.current.size === 0) {
        setLocalClients(clients);
        localClientsRef.current = clients;
    }
  }, [clients]);

  // Dirty Tracking
  const [dirtyRows, setDirtyRows] = useState<Set<string>>(new Set());
  const dirtyRowsRef = useRef<Set<string>>(new Set());
  const [rowSaveStatus, setRowSaveStatus] = useState<Record<string, string>>({});
  const rowSaveStatusRef = useRef<Record<string, string>>({});

  useEffect(() => {
    rowSaveStatusRef.current = rowSaveStatus;
  }, [rowSaveStatus]);
  
  const isSavingRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowEditVersionRef = useRef<Record<string, number>>({});
  const rowSavingVersionRef = useRef<Record<string, number>>({});

  // View State
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc'|'desc'|null>(null);

  // Virtualization State
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(800);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Keyboard Nav State
  const [activeCell, setActiveCell] = useState<{rowId: string, colId: string} | null>(null);
  const [editingCell, setEditingCell] = useState<{rowId: string, colId: string} | null>(null);

  // UI State
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [drawerClient, setDrawerClient] = useState<Client | null>(null);
  const [blastModalOpen, setBlastModalOpen] = useState(false);
  
  // Blast State
  const [blastTopic, setBlastTopic] = useState('');
  const [blastMessage, setBlastMessage] = useState('');
  const [isGeneratingBlast, setIsGeneratingBlast] = useState(false);
  const [generatedLinks, setGeneratedLinks] = useState<{name: string, url: string}[]>([]);

  // --- 2. INITIALIZATION ---
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.colWidths) setColWidths(parsed.colWidths);
        if (parsed.sortCol) setSortCol(parsed.sortCol);
        if (parsed.sortDir) setSortDir(parsed.sortDir);
      } else {
        const defaults: any = {};
        COLUMNS.forEach(c => defaults[c.id] = c.minWidth);
        setColWidths(defaults);
      }
    } catch(e) { console.error("Failed to load view settings", e); }
  }, []);

  useEffect(() => {
    const updateHeight = () => {
      if (gridContainerRef.current) {
        setContainerHeight(gridContainerRef.current.clientHeight);
      }
    };
    window.addEventListener('resize', updateHeight);
    updateHeight();
    // Allow slight delay for layout calc
    setTimeout(updateHeight, 100);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  useEffect(() => {
    if (Object.keys(colWidths).length === 0) return;
    const settings = { colWidths, sortCol, sortDir };
    localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify(settings));
  }, [colWidths, sortCol, sortDir]);

  // --- 3. SORTING LOGIC ---
  const getSortValue = (client: Client, colId: string) => {
    switch (colId) {
      case 'name': return (client.profile.name || '').toLowerCase();
      case 'status': return (client.followUp.status || '').toLowerCase();
      case 'phone': return (client.profile.phone || '').replace(/\D/g, ''); 
      case 'nextAppt': 
        // Use string comparison for YYYY-MM-DD to avoid timezone issues
        return (client.appointments?.nextApptDate || ''); 
      case 'location': return (client.appointments?.location || '').toLowerCase();
      case 'notes': return (client.followUp.notes || '').toLowerCase();
      case 'income': return toNum(client.profile.monthlyIncome) || toNum(client.profile.grossSalary);
      case 'aum': return toNum(client.investorState?.portfolioValue);
      default: return '';
    }
  };

  const processedClients = useMemo(() => {
    const sorted = [...localClients].sort((a, b) => {
       if (!sortCol || !sortDir) {
         // Default: Last Updated Descending (Stable)
         return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
       }
       
       const valA = getSortValue(a, sortCol);
       const valB = getSortValue(b, sortCol);

       if (valA < valB) return sortDir === 'asc' ? -1 : 1;
       if (valA > valB) return sortDir === 'asc' ? 1 : -1;
       
       return 0;
    });
    return sorted;
  }, [localClients, sortCol, sortDir]);

  // --- 4. VIRTUALIZATION LOGIC ---
  const totalRows = processedClients.length;
  const visibleRows = Math.ceil(containerHeight / ROW_HEIGHT);
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(totalRows, startIndex + visibleRows + (OVERSCAN * 2));
  
  const virtualRows = processedClients.slice(startIndex, endIndex);
  const paddingTop = startIndex * ROW_HEIGHT;
  const paddingBottom = (totalRows - endIndex) * ROW_HEIGHT;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  // --- 5. SELECTION LOGIC ---
  const toggleSelection = useCallback((id: string) => {
     setSelectedRowIds(prev => {
       const next = new Set(prev);
       if (next.has(id)) next.delete(id);
       else next.add(id);
       return next;
     });
  }, []);

  const toggleAll = () => {
     // Select all FILTERED clients, not just visible ones
     const allIds = processedClients.map(c => c.id);
     const allSelected = allIds.length > 0 && allIds.every(id => selectedRowIds.has(id));
     
     if (allSelected) {
       setSelectedRowIds(new Set());
     } else {
       setSelectedRowIds(new Set(allIds));
     }
  };

  // --- 6. UPDATE & AUTOSAVE ---
  const handleUpdateClient = (id: string, updates: Partial<Client> | any) => {
     setLocalClients(prev => {
        const next = prev.map(c => {
           if (c.id === id) {
              const updatedClient = { ...c };
              if (updates.profile) updatedClient.profile = { ...c.profile, ...updates.profile };
              if (updates.followUp) updatedClient.followUp = { ...c.followUp, ...updates.followUp };
              if (updates.appointments) updatedClient.appointments = { ...c.appointments, ...updates.appointments };
              if (updates.investorState) updatedClient.investorState = { ...c.investorState, ...updates.investorState };
              
              const { profile, followUp, appointments, investorState, ...rootUpdates } = updates;
              Object.assign(updatedClient, rootUpdates);
              return updatedClient;
           }
           return c;
        });
        localClientsRef.current = next;
        return next;
     });
     
     dirtyRowsRef.current.add(id);
     setDirtyRows(prev => new Set(prev).add(id));
     setRowSaveStatus(prev => ({ ...prev, [id]: 'idle' }));
     
     rowEditVersionRef.current[id] = (rowEditVersionRef.current[id] || 0) + 1;
  };

  const handleFieldUpdate = useCallback((id: string, field: string, value: any, section?: string) => {
     // Optimization: Only trigger update if value actually changed
     const client = localClientsRef.current.find(c => c.id === id);
     if (!client) return;
     
     const fieldKey = field as string;

     let currentValue;
     if (section === 'profile') currentValue = (client.profile as any)[fieldKey];
     else if (section === 'followUp') currentValue = (client.followUp as any)[fieldKey];
     else if (section === 'appointments') currentValue = (client.appointments as any)[fieldKey];
     else if (section === 'investorState') currentValue = (client.investorState as any)[fieldKey];
     else currentValue = (client as any)[fieldKey];

     if (currentValue === value) return;

     let updates: any = {};
     if (section === 'profile') updates = { profile: { [fieldKey]: value } };
     else if (section === 'followUp') updates = { followUp: { [fieldKey]: value } };
     else if (section === 'appointments') updates = { appointments: { [fieldKey]: value } };
     else if (section === 'investorState') {
        const currentInvestorState = client.investorState || {};
        updates = { investorState: { ...currentInvestorState, [fieldKey]: value } };
     } else {
        updates = { [fieldKey]: value };
     }
     handleUpdateClient(id, updates);
  }, []);

  const onRefreshRef = useRef(onRefresh);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  const triggerAutosave = useCallback(async (retryId?: string) => {
    if (isSavingRef.current && !retryId) return;
    isSavingRef.current = true;

    try {
        const currentStatus = rowSaveStatusRef.current;
        const idsToSave = retryId 
          ? [retryId] 
          : Array.from(dirtyRowsRef.current).filter(id => currentStatus[id] !== 'error');

        if (idsToSave.length === 0) return;

        idsToSave.forEach(id => {
           rowSavingVersionRef.current[id] = rowEditVersionRef.current[id] || 0;
        });

        setRowSaveStatus(prev => {
          const next = { ...prev };
          idsToSave.forEach(id => next[id] = 'saving');
          return next;
        });

        await Promise.all(idsToSave.map(async (id) => {
          const clientToSave = localClientsRef.current.find(x => x.id === id);
          if (!clientToSave) return;

          try {
            const payload = JSON.parse(JSON.stringify(clientToSave));
            await db.saveClient(payload, user?.id);
            
            const latestVer = rowEditVersionRef.current[id] || 0;
            const savedVer = rowSavingVersionRef.current[id] || 0;
            
            if (latestVer === savedVer) {
                dirtyRowsRef.current.delete(id);
                setDirtyRows(prev => {
                   const next = new Set(prev);
                   next.delete(id);
                   return next;
                });
                setRowSaveStatus(prev => ({ ...prev, [id]: 'saved' }));
                setTimeout(() => {
                   setRowSaveStatus(prev => {
                      const next = { ...prev };
                      if (next[id] === 'saved') delete next[id];
                      return next;
                   });
                }, 2000);
            } else {
                dirtyRowsRef.current.add(id);
                setRowSaveStatus(prev => ({ ...prev, [id]: 'idle' }));
            }

          } catch (e) {
            console.error("Save failed for row", id, e);
            setRowSaveStatus(prev => ({ ...prev, [id]: 'error' }));
          }
        }));

        if (onRefreshRef.current) onRefreshRef.current();

    } finally {
        isSavingRef.current = false;
        // Schedule next check
        const currentStatus = rowSaveStatusRef.current;
        const pending = Array.from(dirtyRowsRef.current).filter(id => currentStatus[id] !== 'error');
        if (pending.length > 0) {
             if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
             saveTimeoutRef.current = setTimeout(() => triggerAutosave(), 1000);
        }
    }
  }, [user]);

  useEffect(() => {
    if (dirtyRows.size === 0) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => triggerAutosave(), 1000);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [dirtyRows, triggerAutosave]);

  // --- 7. KEYBOARD NAVIGATION & SCROLL SYNC ---
  const scrollToRow = (rowIndex: number) => {
    if (!gridContainerRef.current) return;
    const rowTop = rowIndex * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    const viewTop = gridContainerRef.current.scrollTop;
    const viewBottom = viewTop + gridContainerRef.current.clientHeight;

    const stickyOffset = 40; // Header height

    if (rowTop < viewTop + stickyOffset) {
      gridContainerRef.current.scrollTop = rowTop - stickyOffset;
    } else if (rowBottom > viewBottom) {
      gridContainerRef.current.scrollTop = rowBottom - gridContainerRef.current.clientHeight + stickyOffset; // Adjust for bottom bar
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (editingCell) return; 
    
    if (!activeCell) {
       if ((e.key.startsWith('Arrow')) && processedClients.length > 0) {
          e.preventDefault();
          setActiveCell({ rowId: processedClients[0].id, colId: COLUMNS[0].id });
       }
       return;
    }

    const rowIndex = processedClients.findIndex(c => c.id === activeCell.rowId);
    const colIndex = COLUMNS.findIndex(c => c.id === activeCell.colId);
    
    if (rowIndex === -1 || colIndex === -1) return;

    let nextRow = rowIndex;
    let nextCol = colIndex;

    if (e.key === 'ArrowDown') {
       e.preventDefault();
       if (rowIndex < processedClients.length - 1) nextRow++;
    } else if (e.key === 'ArrowUp') {
       e.preventDefault();
       if (rowIndex > 0) nextRow--;
    } else if (e.key === 'Tab') {
       e.preventDefault();
       if (e.shiftKey) {
          if (colIndex > 0) nextCol--;
          else if (rowIndex > 0) { nextRow--; nextCol = COLUMNS.length - 1; }
       } else {
          if (colIndex < COLUMNS.length - 1) nextCol++;
          else if (rowIndex < processedClients.length - 1) { nextRow++; nextCol = 0; }
       }
    } else if (e.key === 'ArrowRight') {
       e.preventDefault();
       if (colIndex < COLUMNS.length - 1) nextCol++;
    } else if (e.key === 'ArrowLeft') {
       e.preventDefault();
       if (colIndex > 0) nextCol--;
    } else if (e.key === 'Enter') {
       e.preventDefault();
       setEditingCell(activeCell);
       return;
    }

    if (nextRow !== rowIndex || nextCol !== colIndex) {
       setActiveCell({ rowId: processedClients[nextRow].id, colId: COLUMNS[nextCol].id });
       scrollToRow(nextRow);
    }
  };

  // --- 8. HELPER RENDERERS ---
  const renderStatus = useCallback((id: string) => {
     const s = rowSaveStatus[id];
     if (s === 'saving') return <span className="text-xs animate-spin">↻</span>;
     if (s === 'saved') return <span className="text-xs text-emerald-500 font-bold">✓</span>;
     if (s === 'error') return <span className="text-[10px] text-red-600 font-bold cursor-pointer" onClick={() => triggerAutosave(id)}>⚠️</span>;
     if (dirtyRows.has(id)) return <span className="text-xs text-amber-500">✎</span>;
     return null;
  }, [rowSaveStatus, dirtyRows, triggerAutosave]);

  // Handlers for Row
  const handleSetActive = useCallback((r: string, c: string) => setActiveCell({ rowId: r, colId: c }), []);
  const handleSetEditing = useCallback((r: string, c: string) => setEditingCell({ rowId: r, colId: c }), []);
  const handleStopEditing = useCallback(() => setEditingCell(null), []);

  const handleGenerateBlast = async () => {
    if (!blastTopic) return;
    setIsGeneratingBlast(true);
    try {
      const draft = await generateWhatsAppDraft(blastTopic);
      setBlastMessage(draft);
    } catch (e) {
      console.error("Blast generation failed", e);
    } finally {
      setIsGeneratingBlast(false);
    }
  };

  const handleCreateLinks = () => {
    const links: {name: string, url: string}[] = [];
    const selectedClients = processedClients.filter(c => selectedRowIds.has(c.id));
    
    selectedClients.forEach(client => {
      const phone = client.profile.phone?.replace(/\D/g, '');
      if (phone) {
        const name = client.profile.name || 'Client';
        const msg = blastMessage.replace('{name}', name.split(' ')[0]);
        const encodedMsg = encodeURIComponent(msg);
        links.push({
          name: client.profile.name,
          url: `https://wa.me/${phone}?text=${encodedMsg}`
        });
      }
    });
    setGeneratedLinks(links);
  };

  const isAllSelected = processedClients.length > 0 && processedClients.every(c => selectedRowIds.has(c.id));

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] outline-none" 
         tabIndex={0} 
         ref={gridContainerRef}
         onKeyDown={handleKeyDown}
         onScroll={handleScroll}
         style={{ overflowY: 'auto' }}
    >
       {/* Toolbar */}
       <div className="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center shrink-0 sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-4">
             <h2 className="text-lg font-bold text-gray-800">Pipeline</h2>
             <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">{processedClients.length} Records</span>
             {selectedRowIds.size > 0 && (
                <button 
                   onClick={() => { setBlastModalOpen(true); setGeneratedLinks([]); }}
                   className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded text-xs font-bold hover:bg-emerald-100 flex items-center gap-1"
                >
                   💬 Message ({selectedRowIds.size})
                </button>
             )}
          </div>
          <div className="flex items-center gap-4 text-[10px] text-gray-400 font-medium">
             <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Unsaved</span>
             <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Synced</span>
          </div>
       </div>

       {/* Grid */}
       <div className="relative bg-slate-50 min-h-full">
          <table className="w-full border-collapse bg-white table-fixed" style={{ height: totalRows * ROW_HEIGHT }}>
             <thead className="sticky top-0 z-30 bg-gray-50 shadow-sm text-left h-[44px]">
                <tr>
                   <th className="w-10 p-0 border-r border-b border-gray-200 bg-gray-50 sticky left-0 z-30">
                      <div className="flex items-center justify-center h-full">
                         <input 
                            type="checkbox" 
                            onChange={toggleAll} 
                            checked={isAllSelected}
                            className="rounded border-gray-300 cursor-pointer" 
                         />
                      </div>
                   </th>
                   {COLUMNS.map((col, idx) => (
                      <th 
                        key={col.id} 
                        className={`p-0 border-b border-gray-200 bg-gray-50 ${idx === 0 ? 'sticky left-10 z-30' : ''}`}
                        style={{ width: colWidths[col.id] || col.minWidth }}
                      >
                         <ColumnHeader 
                            label={col.label} type={col.type} width={colWidths[col.id] || col.minWidth} 
                            isSorted={sortCol === col.id ? sortDir : null} 
                            onSort={(d) => { setSortCol(col.id); setSortDir(d); }} 
                            onHide={() => {}} 
                            onResize={(w) => setColWidths({...colWidths, [col.id]: w})} 
                            fixed={idx === 0} 
                         />
                      </th>
                   ))}
                </tr>
             </thead>
             <tbody>
                {paddingTop > 0 && <tr style={{ height: paddingTop }}><td colSpan={COLUMNS.length + 1} /></tr>}
                
                {virtualRows.map((client) => (
                   <CrmRow 
                      key={client.id}
                      client={client}
                      columns={COLUMNS}
                      colWidths={colWidths}
                      selectedRowIds={selectedRowIds}
                      activeCell={activeCell}
                      editingCell={editingCell}
                      statusOptions={STATUS_OPTIONS}
                      onToggleSelection={toggleSelection}
                      onSetActive={handleSetActive}
                      onSetEditing={handleSetEditing}
                      onStopEditing={handleStopEditing}
                      onUpdate={handleFieldUpdate}
                      onLoadClient={loadClient}
                      onQuickView={setDrawerClient}
                      renderStatus={renderStatus}
                   />
                ))}
                
                {paddingBottom > 0 && <tr style={{ height: paddingBottom }}><td colSpan={COLUMNS.length + 1} /></tr>}
             </tbody>
          </table>
       </div>

       <ClientDrawer 
          client={drawerClient} isOpen={!!drawerClient} onClose={() => setDrawerClient(null)}
          onUpdateField={(field, val, section) => drawerClient && handleFieldUpdate(drawerClient.id, field, val, section)}
          onStatusUpdate={(c, s) => handleFieldUpdate(c.id, 'status', s, 'followUp')}
          onOpenFullProfile={() => { if(drawerClient) loadClient(drawerClient, true); }}
          onDelete={() => { if(drawerClient) { deleteClient(drawerClient.id); setDrawerClient(null); } }}
       />

       <BlastModal 
          isOpen={blastModalOpen} onClose={() => setBlastModalOpen(false)}
          selectedCount={selectedRowIds.size} blastTopic={blastTopic} setBlastTopic={setBlastTopic}
          blastMessage={blastMessage} setBlastMessage={setBlastMessage}
          isGeneratingBlast={isGeneratingBlast} onGenerateAI={handleGenerateBlast}
          generatedLinks={generatedLinks} onGenerateLinks={handleCreateLinks}
       />
    </div>
  );
};

export default CrmTab;