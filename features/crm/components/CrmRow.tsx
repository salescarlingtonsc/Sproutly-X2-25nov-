
import React, { memo } from 'react';
import { Client } from '../../../types';
import EditableCell from './EditableCell';

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

  const getClientValue = (client: Client, col: any) => {
     if (col.section === 'profile') return (client.profile as any)?.[col.field];
     if (col.section === 'followUp') return (client.followUp as any)?.[col.field];
     if (col.section === 'appointments') return (client.appointments as any)?.[col.field];
     if (col.section === 'investorState') return (client.investorState as any)?.[col.field];
     if (col.section === 'dynamic') return (client.fieldValues as any)?.[col.field];
     return '';
  };

  return (
    <tr className={`group border-b border-slate-50 transition-colors ${isSelected ? 'bg-indigo-50/20' : 'hover:bg-slate-50/50'}`} style={{ height: rowHeight }}>
      {/* Checkbox Pillar */}
      <td className="sticky left-0 bg-white group-hover:bg-slate-50 z-10 text-center p-0 border-r border-slate-50">
         <div className="flex items-center justify-center h-full relative w-12">
            <input 
              type="checkbox" 
              checked={isSelected} 
              onChange={() => onToggleSelection(client.id)} 
              className="rounded border-slate-200 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4" 
            />
            {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600"></div>}
         </div>
      </td>

      {/* Dynamic Data Pillars */}
      {columns.map((col) => {
         const isActive = activeCell?.rowId === client.id && activeCell?.colId === col.id;
         const isEditing = editingCell?.rowId === client.id && editingCell?.colId === col.id;
         const isName = col.id === 'name';
         const cellValue = getClientValue(client, col);

         return (
            <td 
               key={col.id} 
               className={`p-0 border-r border-slate-50 ${isName ? 'sticky left-12 bg-white group-hover:bg-slate-50 z-10' : ''}`}
               style={{ width: colWidths[col.id] || col.minWidth, minWidth: colWidths[col.id] || col.minWidth }}
               onClick={() => onSetActive(client.id, col.id)}
            >
               {isName ? (
                  <div className="flex items-center justify-between h-full relative w-full group/name">
                     <EditableCell 
                        value={cellValue} 
                        type="text" 
                        isActive={isActive} 
                        isEditing={isEditing}
                        onEditStart={() => onSetEditing(client.id, col.id)}
                        onEditStop={onStopEditing}
                        onChange={(v) => onUpdate(client.id, col.field, v, col.section)} 
                        className="font-black text-slate-800 tracking-tighter"
                        placeholder="Untitled Profile"
                     />
                     
                     <div className="flex items-center gap-1 opacity-0 group-hover/name:opacity-100 transition-all duration-200 absolute right-4 translate-x-2 group-hover/name:translate-x-0">
                        <button 
                           onClick={(e) => { e.stopPropagation(); onQuickView(client); }} 
                           className="p-1.5 hover:bg-white hover:shadow-sm text-slate-400 hover:text-indigo-600 rounded-lg transition-all" 
                           title="Peek"
                        >
                           <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                           </svg>
                        </button>
                        <button 
                           onClick={(e) => { e.stopPropagation(); onLoadClient(client, true); }} 
                           className="p-1.5 hover:bg-white hover:shadow-sm text-slate-400 hover:text-indigo-600 rounded-lg transition-all" 
                           title="Strategy Desk"
                        >
                           <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                           </svg>
                        </button>
                     </div>

                     <div className="absolute right-0 w-2 flex justify-center translate-x-3">
                        {renderStatus(client.id)}
                     </div>
                  </div>
               ) : (
                  <EditableCell 
                     value={cellValue} 
                     type={col.type as any}
                     options={col.id === 'status' ? statusOptions : col.options}
                     isActive={isActive} 
                     isEditing={isEditing}
                     onEditStart={() => onSetEditing(client.id, col.id)}
                     onEditStop={onStopEditing}
                     onChange={(v) => onUpdate(client.id, col.field, v, col.section)}
                     className="font-bold text-slate-600"
                  />
               )}
            </td>
         );
      })}
    </tr>
  );
}, (prev, next) => {
  return (
    prev.client === next.client &&
    prev.selectedRowIds === next.selectedRowIds && 
    prev.activeCell === next.activeCell &&
    prev.editingCell === next.editingCell &&
    prev.colWidths === next.colWidths &&
    prev.rowHeight === next.rowHeight
  );
});

export default CrmRow;
