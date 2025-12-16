
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
  renderStatus: (id: string) => React.ReactNode;
}

const CrmRow: React.FC<CrmRowProps> = memo(({
  client, columns, colWidths, selectedRowIds, activeCell, editingCell, statusOptions,
  onToggleSelection, onSetActive, onSetEditing, onStopEditing, onUpdate, onLoadClient, onQuickView, renderStatus
}) => {
  const isSelected = selectedRowIds.has(client.id);

  // Helper to extract value safely
  const getClientValue = (client: Client, col: any) => {
     if (col.section === 'profile') return (client.profile as any)[col.field];
     if (col.section === 'followUp') return (client.followUp as any)[col.field];
     if (col.section === 'appointments') return (client.appointments as any)[col.field];
     if (col.section === 'investorState') return (client.investorState as any)[col.field];
     return '';
  };

  return (
    <tr className={`hover:bg-gray-50 group transition-colors ${isSelected ? 'bg-indigo-50/30' : ''}`} style={{ height: 44 }}>
      {/* Checkbox */}
      <td className="sticky left-0 bg-white group-hover:bg-gray-50 border-r border-gray-100 z-10 text-center border-b p-0">
         <div className="flex items-center justify-center h-full relative w-10">
            <input 
              type="checkbox" 
              checked={isSelected} 
              onChange={() => onToggleSelection(client.id)} 
              className="rounded border-gray-300 cursor-pointer" 
            />
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${isSelected ? 'bg-indigo-500' : 'bg-transparent'}`}></div>
         </div>
      </td>

      {/* Data Cells */}
      {columns.map((col) => {
         const isActive = activeCell?.rowId === client.id && activeCell?.colId === col.id;
         const isEditing = editingCell?.rowId === client.id && editingCell?.colId === col.id;
         const isName = col.id === 'name';
         const cellValue = getClientValue(client, col);

         return (
            <td 
               key={col.id} 
               className={`p-0 border-r border-b border-gray-100 ${isName ? 'sticky left-10 bg-white group-hover:bg-gray-50 z-10' : ''}`}
               style={{ width: colWidths[col.id] || col.minWidth, minWidth: colWidths[col.id] || col.minWidth }}
               onClick={() => onSetActive(client.id, col.id)}
            >
               {isName ? (
                  <div className="flex items-center justify-between h-full pr-2 relative w-full">
                     <EditableCell 
                        value={cellValue} 
                        type="text" 
                        isActive={isActive} 
                        isEditing={isEditing}
                        onEditStart={() => onSetEditing(client.id, col.id)}
                        onEditStop={onStopEditing}
                        onChange={(v) => onUpdate(client.id, col.field, v, col.section)} 
                        className="font-bold text-gray-900"
                     />
                     
                     {/* Hover Actions */}
                     <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 bg-white/80 backdrop-blur-sm shadow-sm border border-gray-100 rounded px-1">
                        <button onClick={(e) => { e.stopPropagation(); onLoadClient(client, true); }} className="p-1 hover:bg-indigo-50 text-indigo-600 rounded text-[10px]" title="Open Profile">↗</button>
                        <button onClick={(e) => { e.stopPropagation(); onQuickView(client); }} className="p-1 hover:bg-indigo-50 text-indigo-600 rounded text-[10px]" title="Quick View">👁</button>
                     </div>
                     
                     {/* Save Status Indicator */}
                     <div className="absolute right-[-24px] w-6 flex justify-center z-20">
                        {renderStatus(client.id)}
                     </div>
                  </div>
               ) : (
                  <EditableCell 
                     value={cellValue} 
                     type={col.type as any}
                     options={col.id === 'status' ? statusOptions : undefined}
                     isActive={isActive} 
                     isEditing={isEditing}
                     onEditStart={() => onSetEditing(client.id, col.id)}
                     onEditStop={onStopEditing}
                     onChange={(v) => onUpdate(client.id, col.field, v, col.section)}
                     rowContext={{ 
                        name: client.profile.name, 
                        location: client.appointments?.location || 'Zoom', 
                        notes: client.appointments?.notes || client.followUp.notes 
                     }}
                  />
               )}
            </td>
         );
      })}
    </tr>
  );
}, (prev, next) => {
  // Custom comparator for performance
  return (
    prev.client === next.client &&
    prev.selectedRowIds === next.selectedRowIds && // Ref equality check is fast
    prev.activeCell === next.activeCell &&
    prev.editingCell === next.editingCell &&
    prev.colWidths === next.colWidths // Ref equality
  );
});

export default CrmRow;
    