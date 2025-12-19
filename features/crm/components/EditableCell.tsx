
import React, { useRef, memo } from 'react';
import { SelectEditor, TextEditor, DateEditor, getOptionStyle } from './CellEditors';

interface EditableCellProps {
  value: any;
  type: 'text' | 'number' | 'select' | 'date' | 'currency' | 'phone' | 'npu_tracker';
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

  const renderEditor = () => {
    if (!isEditing || !cellRef.current || !onEditStop) return null;
    const rect = cellRef.current.getBoundingClientRect();
    const commonProps = { value, onChange, onClose: onEditStop, rect };
    if (type === 'select' && options) return <SelectEditor {...commonProps} options={options} onAddOption={onAddOption} />;
    if (type === 'date') return <DateEditor {...commonProps} />;
    return <TextEditor {...commonProps} />;
  };

  const renderContent = () => {
    if (type === 'npu_tracker') {
       const currentNum = String(value).startsWith('npu') ? parseInt(String(value).replace('npu', '')) : 0;
       return (
          <div className="flex items-center gap-1">
             {[1, 2, 3, 4, 5, 6].map(num => (
                <div 
                   key={num}
                   onClick={(e) => { e.stopPropagation(); onChange(`npu${num}`); }}
                   className={`w-2.5 h-2.5 rounded-full border transition-all cursor-pointer ${num <= currentNum ? 'bg-amber-400 border-amber-500 scale-110 shadow-sm' : 'bg-slate-100 border-slate-200 hover:border-slate-300'}`}
                />
             ))}
          </div>
       );
    }

    if (type === 'select') {
      if (!value) return <span className="opacity-0 group-hover:opacity-20 text-[10px]">▼</span>;
      return <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider inline-block max-w-full ${getOptionStyle(value)}`}>{value}</span>;
    }
    
    if (type === 'currency') {
      if (value === null || value === undefined || value === '') return <span className="opacity-20">-</span>;
      return <span className="font-mono text-slate-700 font-bold">${Number(value).toLocaleString()}</span>;
    }
    
    if (type === 'date') {
      if (!value) return <span className="opacity-20">-</span>;
      return <span className="text-slate-600 text-xs font-bold">{String(value).split('T')[0]}</span>;
    }
    
    if (type === 'phone') {
        if (!value) return <span className="opacity-20">-</span>;
        return <span className="text-slate-600 text-xs font-medium">{value}</span>;
    }

    const hasVal = value !== null && value !== undefined && value !== '';
    return <span className={`truncate w-full font-medium ${!hasVal ? 'opacity-20 italic' : 'text-slate-800'}`}>{hasVal ? String(value) : (placeholder || '')}</span>;
  };

  return (
    <>
      <div 
        ref={cellRef}
        onDoubleClick={onEditStart}
        className={`relative w-full h-full px-4 flex items-center transition-all duration-150 outline-none cursor-default group ${isActive ? 'bg-white ring-2 ring-inset ring-indigo-600 z-20' : 'border-r border-transparent'}`}
      >
        {renderContent()}
      </div>
      {renderEditor()}
    </>
  );
});

export default EditableCell;
