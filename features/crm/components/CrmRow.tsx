import React, { memo, useState, useRef, useEffect } from 'react';
import { Client, ContactStatus } from '../../../types';
import EditableCell from './EditableCell';
import StatusDropdown from './StatusDropdown';
import { interpolateTemplate, DEFAULT_TEMPLATES } from '../../../lib/templates';
import { dbTemplates, DBTemplate } from '../../../lib/db/templates';
import { logActivity } from '../../../lib/db/activities';

interface CrmTemplate extends DBTemplate {
  isDefault?: boolean;
}

interface CrmRowProps {
  client: Client;
  columns: any[];
  colWidths: Record<string, number>;
  selectedRowIds: Set<string>;
  activeCell: { rowId: string; colId: string } | null;
  editingCell: { rowId: string; colId: string } | null;
  statusOptions: string[];
  onToggleSelection: (id: string) => void;
  onSetActive: (rowId: string, colId: string) => void;
  onSetEditing: (rowId: string, colId: string) => void;
  onStopEditing: () => void;
  onUpdate: (id: string, field: string, value: any, section?: string) => void;
  onLoadClient: (client: Client, redirect: boolean) => void;
  onQuickView: (client: Client) => void;
  rowHeight: number;
  renderStatus: (id: string) => React.ReactNode;
}

const CrmRow: React.FC<CrmRowProps> = memo(({
  client, columns, colWidths, selectedRowIds, activeCell, editingCell, statusOptions,
  onToggleSelection, onSetActive, onSetEditing, onStopEditing, onUpdate, onLoadClient, onQuickView, rowHeight, renderStatus
}) => {
  const isSelected = selectedRowIds.has(client.id);
  const [showWhatsAppMenu, setShowWhatsAppMenu] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<CrmTemplate[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  // Stagnation Logic
  const isStale = (() => {
    // FIX: Safe access to followUp.status
    const status = client.followUp?.status || 'new';
    const terminalStatuses = ['case_closed', 'client', 'not_keen'];
    if (terminalStatuses.includes(status)) return false;
    
    const lastContact = client.followUp?.lastContactedAt ? new Date(client.followUp.lastContactedAt).getTime() : 0;
    const lastUpdated = client.lastUpdated ? new Date(client.lastUpdated).getTime() : 0;
    const mostRecentActivity = Math.max(lastContact, lastUpdated);
    
    if (!mostRecentActivity) return true; // Never touched
    const hoursSince = (Date.now() - mostRecentActivity) / (1000 * 60 * 60);
    return hoursSince > 48; // Stale if no activity for 2 days
  })();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowWhatsAppMenu(false);
      }
    };
    if (showWhatsAppMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      dbTemplates.getTemplates().then(res => {
        const defaults: CrmTemplate[] = DEFAULT_TEMPLATES.map(t => ({ id: t.id, label: t.label, content: t.content, isDefault: true }));
        const merged: CrmTemplate[] = [...defaults];
        res.forEach(r => {
           if (!merged.find(m => m.id === r.id)) merged.push({ ...r, isDefault: false });
        });
        setCustomTemplates(merged);
      });
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showWhatsAppMenu]);

  const getClientValue = (client: Client, col: any) => {
     if (col.section === 'profile') return (client.profile as any)?.[col.field];
     if (col.section === 'followUp') return (client.followUp as any)?.[col.field];
     if (col.section === 'appointments') return (client.appointments as any)?.[col.field];
     if (col.section === 'investorState') return (client.investorState as any)?.[col.field];
     if (col.section === 'dynamic') return (client.fieldValues as any)?.[col.field];
     if (col.section === 'meta') return (client as any)?.[col.field];
     return '';
  };

  const handleTemplateSelect = (template: DBTemplate) => {
    const rawPhone = String(client.profile.phone || '');
    let cleanPhone = rawPhone.replace(/\D/g, ''); 
    if (cleanPhone.length === 8) cleanPhone = '65' + cleanPhone;
    
    if (!cleanPhone || cleanPhone.length < 8) {
      alert("Missing valid mobile number.");
      return;
    }

    const name = client.profile.name || 'there';
    const date = String(client.appointments?.firstApptDate || '').split('T')[0];
    const time = client.appointments?.apptTime || '12pm';
    
    const finalMsg = interpolateTemplate(template.content, name, date, time);
    const encoded = encodeURIComponent(finalMsg);
    
    logActivity(client.id, 'outreach', `Protocol: ${template.label}`, { 
      template_id: template.id,
      protocol_label: template.label,
      target: name
    });

    onUpdate(client.id, 'lastContactedAt', new Date().toISOString(), 'followUp');
    setShowWhatsAppMenu(false);

    // Apply micro-delay before opening to ensure state update commits
    setTimeout(() => {
        window.open(`https://wa.me/${cleanPhone}?text=${encoded}`, '_blank');
    }, 200);
  };

  return (
    <tr className={`group border-b border-slate-100 transition-colors ${isSelected ? 'bg-indigo-50/10' : 'hover:bg-slate-50/30'} ${isStale ? 'bg-red-50/20' : ''}`} style={{ height: rowHeight }}>
      <td className="sticky left-0 bg-white group-hover:bg-slate-50 z-10 text-center p-0 border-r border-slate-100">
         <div className="flex items-center justify-center h-full relative w-12">
            <input type="checkbox" checked={isSelected} onChange={() => onToggleSelection(client.id)} className="rounded border-slate-200 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4" />
            {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600"></div>}
            {isStale && !isSelected && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-400"></div>}
         </div>
      </td>

      {columns.map((col) => {
         const isActive = activeCell?.rowId === client.id && activeCell?.colId === col.id;
         const isEditing = editingCell?.rowId === client.id && editingCell?.colId === col.id;
         const isName = col.id === 'name';
         const isStatus = col.id === 'status';
         const isPhone = col.id === 'phone';
         const isDateTimeCombined = col.type === 'datetime-combined';
         
         const cellValue = getClientValue(client, col);

         return (
            <td 
               key={col.id} 
               className={`p-0 border-r border-slate-100 relative ${isName ? 'sticky left-12 bg-white group-hover:bg-slate-50 z-10' : ''}`}
               style={{ width: colWidths[col.id] || col.minWidth, minWidth: colWidths[col.id] || col.minWidth }}
               onClick={(e) => { e.stopPropagation(); onSetActive(client.id, col.id); }}
            >
               {isName ? (
                  <div className="flex items-center justify-between h-full relative w-full group/name px-3">
                     <div className="flex items-center gap-2 flex-1 min-w-0">
                        <EditableCell 
                           value={cellValue} type="text" isActive={isActive} isEditing={isEditing}
                           onEditStart={() => onSetEditing(client.id, col.id)}
                           onEditStop={onStopEditing}
                           onChange={(v) => onUpdate(client.id, col.field, v, col.section)} 
                           className="font-bold text-slate-900"
                           placeholder="Unnamed"
                        />
                        {isStale && <span title="Stale Lead (>48h stagnation)" className="text-xs">❄️</span>}
                     </div>
                     <button onClick={(e) => { e.stopPropagation(); onQuickView(client); }} className="opacity-100 lg:opacity-0 lg:group-hover/name:opacity-100 transition-all p-1 text-slate-300 hover:text-indigo-600 shrink-0">
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
                     </button>
                  </div>
               ) : isStatus ? (
                  <div className="px-3 flex items-center h-full">
                    <StatusDropdown client={client} onUpdate={(c, s) => onUpdate(c.id, 'status', s, 'followUp')} />
                  </div>
               ) : isPhone ? (
                  <div className="flex items-center justify-between group/phone h-full w-full relative">
                    <EditableCell 
                      value={cellValue} type="phone" isActive={isActive} isEditing={isEditing}
                      onEditStart={() => onSetEditing(client.id, col.id)}
                      onEditStop={onStopEditing}
                      onChange={(v) => onUpdate(client.id, col.field, v, col.section)}
                      className="flex-1"
                    />
                    {cellValue && (
                      <div className="mr-3 relative z-30">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setShowWhatsAppMenu(!showWhatsAppMenu); }} 
                          className="p-1 rounded bg-emerald-50 text-emerald-600 shadow-sm hover:bg-emerald-600 hover:text-white transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.025 3.312l-.542 2.01 2.036-.53c.96.514 1.95.787 3.25.788h.003c3.181 0 5.767-2.586 5.768-5.766 0-3.18-2.587-5.766-5.768-5.766h-.004zm3.003 8.3c-.12.33-.7.63-1.01.69-.24.05-.55.08-1.53-.33-1.3-.54-2.12-1.85-2.19-1.94-.06-.09-.54-.72-.54-1.37s.34-.97.46-1.1c.12-.13.27-.16.36-.16s.18.01.26.01.21-.04.33.25c.12.29.41 1.01.45 1.09.04.08.07.17.01.28-.06.11-.09.18-.18.29-.06.11-.09.18-.18.29-.09.11-.18.23-.26.3-.09.08-.18.17-.08.34.1.17.44.73.94 1.18.64.57 1.18.75 1.35.83.17.08.27.07.37-.04.1-.11.43-.51.55-.68.12-.17.23-.15.39-.09.16.06 1.03.49 1.2.58.17.09.28.14.32.2.04.06.04.35-.08.68z"/></svg>
                        </button>
                        {showWhatsAppMenu && (
                          <div ref={menuRef} className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-2xl border border-slate-100 z-[1000] py-2 animate-in fade-in slide-in-from-top-1">
                            <div className="px-3 py-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 mb-1">Outreach Protocols</div>
                            <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                {customTemplates.map(t => (
                                <button key={t.id} onClick={(e) => { e.stopPropagation(); handleTemplateSelect(t); }} className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-[11px] font-bold text-slate-700 transition-colors flex flex-col group">
                                    <div className="flex items-center gap-2">
                                        <span className={ t.isDefault ? "text-slate-400" : "text-emerald-600"}>{t.label}</span>
                                        { t.isDefault && <span className="text-[7px] font-black bg-slate-100 text-slate-400 px-1 rounded uppercase">System</span> }
                                    </div>
                                    <span className="text-[9px] text-slate-400 font-normal truncate opacity-70 group-hover:opacity-100">"{t.content.substring(0, 45)}..."</span>
                                </button>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
               ) : isDateTimeCombined ? (
                  <div className="flex items-center h-full w-full px-1 overflow-hidden">
                    <div className="flex-1 min-w-0">
                        <EditableCell 
                        value={cellValue} type="date" isActive={isActive} isEditing={editingCell?.rowId === client.id && editingCell?.colId === `${col.id}_date`}
                        onEditStart={() => onSetEditing(client.id, `${col.id}_date`)}
                        onEditStop={onStopEditing}
                        onChange={(v) => onUpdate(client.id, col.field, v, col.section)}
                        className="px-2"
                        />
                    </div>
                    <div className="w-px h-4 bg-slate-100 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <EditableCell 
                        value={getClientValue(client, { ...col, field: col.id === 'next_appt_combined' ? 'apptTime' : 'nextFollowUpTime' })} 
                        type="time" isActive={isActive} isEditing={editingCell?.rowId === client.id && editingCell?.colId === `${col.id}_time`}
                        onEditStart={() => onSetEditing(client.id, `${col.id}_time`)}
                        onEditStop={onStopEditing}
                        onChange={(v) => onUpdate(client.id, col.id === 'next_appt_combined' ? 'apptTime' : 'nextFollowUpTime', v, col.section)}
                        className="px-2"
                        />
                    </div>
                  </div>
               ) : (
                  <EditableCell 
                    value={cellValue} type={col.type} isActive={isActive} isEditing={isEditing}
                    onEditStart={() => onSetEditing(client.id, col.id)}
                    /* Corrected prop name from onStopEditing to onEditStop */
                    onEditStop={onStopEditing}
                    onChange={(v) => onUpdate(client.id, col.field, v, col.section)} 
                  />
               )}
               {isActive && !isEditing && (
                 <div className="absolute inset-0 ring-2 ring-indigo-500 ring-inset pointer-events-none z-20" />
               )}
            </td>
         );
      })}
    </tr>
  );
});

export default CrmRow;