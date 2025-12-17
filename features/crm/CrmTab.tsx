import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Client, FieldDefinition } from '../../types';
import { db } from '../../lib/db';
import { getFieldDefinitions, saveClientFieldValue, createFieldDefinition } from '../../lib/db/dynamicFields';
import { useAuth } from '../../contexts/AuthContext';
import { generateWhatsAppDraft } from '../../lib/gemini';
import ColumnHeader from './components/ColumnHeader';
import ClientDrawer from './components/ClientDrawer';
import BlastModal from './components/BlastModal';
import CrmRow from './components/CrmRow';
import ColumnPicker from './components/ColumnPicker';

const VIEW_SETTINGS_KEY = 'crm_view_settings_v2';
const ROW_HEIGHT = 44; 
const OVERSCAN = 15;

// Base System Columns
const BASE_COLUMNS = [
  { id: 'name', label: 'Name', type: 'text', minWidth: 200, field: 'name', section: 'profile' },
  { id: 'status', label: 'Status', type: 'select', minWidth: 140, field: 'status', section: 'followUp' },
  { id: 'phone', label: 'Phone', type: 'phone', minWidth: 120, field: 'phone', section: 'profile' },
  { id: 'nextAppt', label: 'Next Appt', type: 'date', minWidth: 150, field: 'nextApptDate', section: 'appointments' },
  { id: 'notes', label: 'Notes', type: 'text', minWidth: 250, field: 'notes', section: 'followUp' },
];

const STATUS_OPTIONS = ['new', 'picked_up', 'appt_set', 'proposal', 'client', 'not_keen'];

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
  
  // State
  const [dynamicFields, setDynamicFields] = useState<FieldDefinition[]>([]);
  const [localClients, setLocalClients] = useState<Client[]>(clients);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc'|'desc'|null>(null);
  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<string>>(new Set(BASE_COLUMNS.map(c => c.id)));
  
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [drawerClient, setDrawerClient] = useState<Client | null>(null);
  
  // Cell Editing State
  const [activeCell, setActiveCell] = useState<{rowId: string, colId: string} | null>(null);
  const [editingCell, setEditingCell] = useState<{rowId: string, colId: string} | null>(null);

  // Blast Modal State
  const [blastModalOpen, setBlastModalOpen] = useState(false);
  const [blastTopic, setBlastTopic] = useState('');
  const [blastMessage, setBlastMessage] = useState('');
  const [isGeneratingBlast, setIsGeneratingBlast] = useState(false);
  const [generatedLinks, setGeneratedLinks] = useState<{name: string, url: string}[]>([]);

  // Virtualization
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(800);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Init
  useEffect(() => {
    loadFields();
    // Load local storage view
    const saved = localStorage.getItem(VIEW_SETTINGS_KEY);
    if (saved) {
       const parsed = JSON.parse(saved);
       if (parsed.visibleColumnIds) setVisibleColumnIds(new Set(parsed.visibleColumnIds));
       if (parsed.colWidths) setColWidths(parsed.colWidths);
    }
  }, []);

  useEffect(() => {
     setLocalClients(clients);
  }, [clients]);

  useEffect(() => {
     localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify({
        visibleColumnIds: Array.from(visibleColumnIds),
        colWidths
     }));
  }, [visibleColumnIds, colWidths]);

  // Height Observer
  useEffect(() => {
    const updateHeight = () => {
      if (gridContainerRef.current) setContainerHeight(gridContainerRef.current.clientHeight);
    };
    window.addEventListener('resize', updateHeight);
    updateHeight(); // Initial check
    
    // Safety check for initial render ref availability
    const timer = setTimeout(updateHeight, 100);
    return () => {
      window.removeEventListener('resize', updateHeight);
      clearTimeout(timer);
    };
  }, []);

  const loadFields = async () => {
     const fields = await getFieldDefinitions();
     setDynamicFields(fields);
  };

  // --- MERGE COLUMNS ---
  const allColumns = useMemo(() => {
     const dynCols = dynamicFields.map(f => ({
        id: f.id,
        label: f.label,
        type: f.type,
        minWidth: 120,
        field: f.id, // ID is the key for dynamic values
        section: 'dynamic',
        options: f.options
     }));
     return [...BASE_COLUMNS, ...dynCols];
  }, [dynamicFields]);

  const visibleColumns = useMemo(() => {
     return allColumns.filter(c => visibleColumnIds.has(c.id));
  }, [allColumns, visibleColumnIds]);

  // --- SORTING ---
  const getSortValue = (client: Client, colId: string) => {
     // Check Base
     const base = BASE_COLUMNS.find(c => c.id === colId);
     if (base) {
        if (base.section === 'profile') return (client.profile as any)?.[base.field];
        if (base.section === 'followUp') return (client.followUp as any)?.[base.field];
        if (base.section === 'appointments') return (client.appointments as any)?.[base.field];
     }
     // Check Dynamic
     if (client.fieldValues && client.fieldValues[colId] !== undefined) {
        return client.fieldValues[colId];
     }
     return '';
  };

  const processedClients = useMemo(() => {
    const sorted = [...localClients].sort((a, b) => {
       if (!sortCol || !sortDir) return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
       const valA = getSortValue(a, sortCol) || '';
       const valB = getSortValue(b, sortCol) || '';
       if (valA < valB) return sortDir === 'asc' ? -1 : 1;
       if (valA > valB) return sortDir === 'asc' ? 1 : -1;
       return 0;
    });
    return sorted;
  }, [localClients, sortCol, sortDir, dynamicFields]);

  // --- VIRTUALIZATION ---
  const totalRows = processedClients.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN);
  const visibleRows = processedClients.slice(startIndex, endIndex);
  const paddingTop = startIndex * ROW_HEIGHT;
  const paddingBottom = (totalRows - endIndex) * ROW_HEIGHT;

  // --- UPDATES ---
  const handleUpdate = async (id: string, field: string, value: any, section?: string) => {
     // Optimistic Update
     setLocalClients(prev => prev.map(c => {
        if (c.id !== id) return c;
        const copy = { ...c };
        
        if (section === 'dynamic') {
           copy.fieldValues = { ...(copy.fieldValues || {}), [field]: value };
           saveClientFieldValue(id, field, 'text', value); // Fire and forget
        } else if (section) {
           // Handle specific updates for nested objects or root properties
           if (section === 'profile' || section === 'followUp' || section === 'appointments') {
              (copy as any)[section] = { ...(copy as any)[section], [field]: value };
           } else {
              // Root property update
              (copy as any)[field] = value;
           }
           // Trigger standard save
           db.saveClient(copy, user?.id); 
        }
        return copy;
     }));
  };

  // --- FIELD MANAGER ---
  const handleManageFields = async () => {
     const label = prompt("New Field Name:");
     if (!label) return;
     const type = prompt("Type (text, number, date, select, boolean):", "text");
     if (!type) return;
     
     await createFieldDefinition({ 
       key: label.toLowerCase().replace(/\s/g, '_'), 
       label, 
       type: type as any,
       section: 'dynamic' // FIX: Added section to match type requirements
     });
     loadFields();
  };

  // --- BLAST ACTIONS ---
  const handleGenerateBlastAI = async () => {
    setIsGeneratingBlast(true);
    try {
      const draft = await generateWhatsAppDraft(blastTopic);
      setBlastMessage(draft);
    } catch (e) {
      alert("AI Error. Please try again.");
    } finally {
      setIsGeneratingBlast(false);
    }
  };

  const handleGenerateLinks = () => {
    const targets = localClients.filter(c => selectedRowIds.has(c.id));
    const links = targets.map(c => {
      const phone = c.profile.phone?.replace(/\D/g, '') || '';
      const firstName = c.profile.name.split(' ')[0];
      const personalized = blastMessage.replace('{name}', firstName);
      return {
        name: c.profile.name,
        url: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(personalized)}` : '#'
      };
    });
    setGeneratedLinks(links);
  };

  // --- SELECTION ---
  const toggleSelection = (id: string) => {
    const next = new Set(selectedRowIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRowIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedRowIds.size === localClients.length) setSelectedRowIds(new Set());
    else setSelectedRowIds(new Set(localClients.map(c => c.id)));
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      
      {/* 1. TOOLBAR */}
      <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 bg-white shrink-0 z-20">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-gray-800">CRM <span className="text-gray-400 font-normal">({localClients.length})</span></h2>
          <div className="h-4 w-px bg-gray-200 mx-2"></div>
          <ColumnPicker 
            allColumns={allColumns} 
            visibleColumnIds={visibleColumnIds} 
            onChange={setVisibleColumnIds}
            onManageFields={handleManageFields}
          />
        </div>

        {selectedRowIds.size > 0 && (
          <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-lg animate-fade-in">
            <span className="text-xs font-bold text-indigo-700">{selectedRowIds.size} Selected</span>
            <button 
              onClick={() => { setBlastModalOpen(true); setGeneratedLinks([]); }}
              className="bg-white text-indigo-600 text-[10px] font-bold px-2 py-1 rounded border border-indigo-200 hover:bg-indigo-50 transition-colors"
            >
              💬 WhatsApp Blast
            </button>
            <button 
              onClick={() => setSelectedRowIds(new Set())}
              className="text-indigo-400 hover:text-indigo-600 ml-2"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* 2. GRID HEADER */}
      <div className="flex border-b border-gray-200 bg-gray-50 h-10 sticky top-0 z-20 overflow-hidden shrink-0">
        <div className="w-10 border-r border-gray-200 flex items-center justify-center shrink-0 bg-gray-50 z-20 sticky left-0">
          <input 
            type="checkbox" 
            checked={selectedRowIds.size === localClients.length && localClients.length > 0} 
            onChange={toggleSelectAll}
            className="rounded border-gray-300"
          />
        </div>
        <div className="flex flex-1 overflow-hidden">
          {visibleColumns.map((col) => (
            <div key={col.id} className={col.id === 'name' ? 'sticky left-10 z-20' : ''}>
              <ColumnHeader 
                label={col.label} 
                type={col.type} 
                width={colWidths[col.id] || col.minWidth}
                isSorted={sortCol === col.id ? sortDir : null}
                onSort={(dir) => { setSortCol(col.id); setSortDir(dir); }}
                onResize={(w) => setColWidths(prev => ({...prev, [col.id]: w}))}
                onHide={() => { const next = new Set(visibleColumnIds); next.delete(col.id); setVisibleColumnIds(next); }}
                fixed={col.id === 'name'}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 3. VIRTUALIZED BODY */}
      <div 
        ref={gridContainerRef} 
        className="flex-1 overflow-auto bg-white custom-scrollbar relative"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div style={{ height: totalRows * ROW_HEIGHT, position: 'relative' }}>
          <div style={{ transform: `translateY(${paddingTop}px)` }}>
            <table className="w-full border-collapse table-fixed">
              <tbody>
                {visibleRows.map((client) => (
                  <CrmRow 
                    key={client.id}
                    client={client}
                    columns={visibleColumns}
                    colWidths={colWidths}
                    selectedRowIds={selectedRowIds}
                    activeCell={activeCell}
                    editingCell={editingCell}
                    statusOptions={STATUS_OPTIONS}
                    onToggleSelection={toggleSelection}
                    onSetActive={(rowId, colId) => setActiveCell({rowId, colId})}
                    onSetEditing={(rowId, colId) => setEditingCell({rowId, colId})}
                    onStopEditing={() => setEditingCell(null)}
                    onUpdate={handleUpdate}
                    onLoadClient={loadClient}
                    onQuickView={setDrawerClient}
                    renderStatus={(id) => null} // Placeholder for save indicator if needed
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 4. MODALS & DRAWERS */}
      <ClientDrawer 
        client={drawerClient}
        isOpen={!!drawerClient}
        onClose={() => setDrawerClient(null)}
        onUpdateField={(field, val, section) => drawerClient && handleUpdate(drawerClient.id, field, val, section)}
        onStatusUpdate={(c, s) => handleUpdate(c.id, 'status', s, 'followUp')}
        onOpenFullProfile={() => { if(drawerClient) loadClient(drawerClient, true); }}
        onDelete={() => { if(drawerClient) { deleteClient(drawerClient.id); setDrawerClient(null); } }}
      />

      <BlastModal 
        isOpen={blastModalOpen}
        onClose={() => setBlastModalOpen(false)}
        selectedCount={selectedRowIds.size}
        blastTopic={blastTopic}
        setBlastTopic={setBlastTopic}
        blastMessage={blastMessage}
        setBlastMessage={setBlastMessage}
        isGeneratingBlast={isGeneratingBlast}
        onGenerateAI={handleGenerateBlastAI}
        generatedLinks={generatedLinks}
        onGenerateLinks={handleGenerateLinks}
      />

    </div>
  );
};

export default CrmTab;