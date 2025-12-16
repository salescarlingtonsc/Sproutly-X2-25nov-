
import React, { useRef, memo } from 'react';
import { SelectEditor, TextEditor, DateEditor, getOptionStyle } from './CellEditors';

interface EditableCellProps {
  value: any;
  type: 'text' | 'number' | 'select' | 'date' | 'currency' | 'phone';
  options?: string[]; 
  onChange: (val: any) => void;
  isActive?: boolean;
  isEditing?: boolean;
  onEditStart?: () => void;
  onEditStop?: () => void;
  onAddOption?: (newOpt: string) => void;
  placeholder?: string;
  className?: string;
  rowContext?: { name: string; location?: string; notes?: string }; 
}

const EditableCell: React.FC<EditableCellProps> = memo(({ 
  value, type, options, onChange, isActive, isEditing, onEditStart, onEditStop, onAddOption, placeholder, className, rowContext
}) => {
  const cellRef = useRef<HTMLDivElement>(null);

  // --- 3. EDITOR LAYER (Portal) ---
  const renderEditor = () => {
    if (!isEditing || !cellRef.current || !onEditStop) return null;
    const rect = cellRef.current.getBoundingClientRect();

    const commonProps = {
      value,
      onChange,
      onClose: onEditStop,
      rect
    };

    if (type === 'select' && options) {
      return <SelectEditor {...commonProps} options={options} onAddOption={onAddOption} />;
    }
    if (type === 'date') {
      return <DateEditor {...commonProps} />;
    }
    return <TextEditor {...commonProps} />;
  };

  // --- 1. DISPLAY LAYER ---
  const renderContent = () => {
    // Select Pill
    if (type === 'select') {
      if (!value) return <span className="text-gray-300 select-none text-[10px] opacity-0 group-hover:opacity-50 transition-opacity">▼</span>;
      return (
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold truncate inline-block max-w-full ${getOptionStyle(value)}`}>
          {value}
        </span>
      );
    }
    // Currency
    if (type === 'currency') {
      if (value === null || value === undefined || value === '') return <span className="text-gray-300 select-none">-</span>;
      return <span className="font-mono text-gray-700">${Number(value).toLocaleString()}</span>;
    }
    // Date with Calendar Link
    if (type === 'date') {
      if (!value) return <span className="text-gray-300 select-none">-</span>;
      
      const handleCalendarClick = (e: React.MouseEvent) => {
         e.stopPropagation();
         if (!rowContext) return;
         
         const datePart = String(value).split('T')[0].replace(/-/g, '');
         const start = `${datePart}T100000`;
         const end = `${datePart}T110000`;
         
         const title = `Meeting: ${rowContext.name}`;
         const details = rowContext.notes || '';
         const location = rowContext.location || 'Zoom';

         const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${start}/${end}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`;
         window.open(url, '_blank');
      };

      // Timezone-safe display
      const displayDate = String(value).split('T')[0];

      return (
         <div className="flex items-center justify-between w-full group/date">
            <span className="text-gray-600 text-xs font-medium">{displayDate}</span>
            <div className="flex opacity-0 group-hover/date:opacity-100 transition-opacity gap-1">
               <button 
                  onClick={handleCalendarClick} 
                  className="p-1 hover:bg-indigo-50 rounded text-indigo-600 font-bold text-[10px] uppercase tracking-wide border border-indigo-100 bg-white shadow-sm z-20" 
                  title="Add to Google Calendar"
               >
                  📅 Add
               </button>
            </div>
         </div>
      );
    }
    // Phone
    if (type === 'phone') {
        if (!value) return <span className="text-gray-300 select-none">-</span>;
        return (
           <div className="flex items-center justify-between group/phone w-full">
              <span className="truncate">{value}</span>
              <div className="opacity-0 group-hover/phone:opacity-100 flex gap-1">
                 <button 
                    onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/${String(value).replace(/\D/g,'')}`, '_blank'); }}
                    className="text-green-500 hover:text-green-700 bg-green-50 p-0.5 rounded"
                    title="WhatsApp"
                 >
                    💬
                 </button>
              </div>
           </div>
        );
    }
    // Default Text
    const hasVal = value !== null && value !== undefined && value !== '';
    return <span className={`truncate w-full ${!hasVal ? 'text-gray-300 italic' : 'text-gray-800'}`}>{hasVal ? String(value) : (placeholder || '')}</span>;
  };

  return (
    <>
      <div 
        ref={cellRef}
        onDoubleClick={onEditStart}
        className={`
           relative w-full h-full px-3 flex items-center text-sm transition-none outline-none cursor-default group
           ${isActive ? 'ring-2 ring-inset ring-blue-500 z-20 bg-white' : 'hover:bg-gray-50 border-r border-transparent'}
           ${className || ''}
        `}
      >
        {renderContent()}
      </div>
      {renderEditor()}
    </>
  );
}, (prev, next) => {
  return (
    prev.value === next.value &&
    prev.type === next.type &&
    prev.isActive === next.isActive &&
    prev.isEditing === next.isEditing &&
    prev.className === next.className &&
    prev.placeholder === next.placeholder &&
    prev.options === next.options &&
    prev.rowContext?.name === next.rowContext?.name &&
    prev.rowContext?.location === next.rowContext?.location &&
    prev.rowContext?.notes === next.rowContext?.notes
  );
});

export default EditableCell;
