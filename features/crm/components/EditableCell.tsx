import React, { useRef, memo, useEffect } from 'react';
import { SelectEditor, TextEditor, DateEditor, TimeEditor, getOptionStyle } from './CellEditors';
import { convert24to12 } from '../../../lib/helpers';

interface EditableCellProps {
  value: any;
  type: any;
  options?: string[]; 
  onChange: (val: any) => void;
  isActive?: boolean;
  isEditing?: boolean;
  onEditStart?: () => void;
  onEditStop?: () => void;
  onAddOption?: (newOpt: string) => void;
  placeholder?: string;
  className?: string;
}

const EditableCell: React.FC<EditableCellProps> = memo(({ 
  value, type, options, onChange, isActive, isEditing, onEditStart, onEditStop, onAddOption, placeholder, className
}) => {
  const cellRef = useRef<HTMLDivElement>(null);

  const renderEditor = () => {
    if (!isEditing || !cellRef.current || !onEditStop) return null;
    const rect = cellRef.current.getBoundingClientRect();
    const commonProps = { value, onChange, onClose: onEditStop, rect };
    
    if (type === 'select' && options) return <SelectEditor {...commonProps} options={options} onAddOption={onAddOption} />;
    if (type === 'date') return <DateEditor {...commonProps} />;
    if (type === 'time') return <TimeEditor {...commonProps} />;
    return <TextEditor {...commonProps} />;
  };

  const handleCellClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isActive && onEditStart) {
      onEditStart();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEditStart) onEditStart();
  };

  const renderContent = () => {
    if (type === 'select') {
      if (!value) return <span className="text-[10px] opacity-20">▼</span>;
      return <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider inline-block max-w-full truncate ${getOptionStyle(value)}`}>{value}</span>;
    }
    
    if (type === 'currency' || type === 'number') {
      const num = parseFloat(value);
      if (isNaN(num)) return <span className="opacity-20">-</span>;
      return <span className="font-mono font-bold">{type === 'currency' ? `$${num.toLocaleString()}` : num}</span>;
    }
    
    if (type === 'date') {
      if (!value) return <span className="opacity-20 text-[10px]">No Date</span>;
      const d = new Date(value);
      return <span className="text-[11px] font-bold">{isNaN(d.getTime()) ? value : d.toLocaleDateString('en-SG', { day: '2-digit', month: 'short' })}</span>;
    }

    if (type === 'time') {
      if (!value) return <span className="opacity-20 text-[10px]">Set Time</span>;
      // Convert 24h stored string to 12h for display
      return <span className="text-[11px] font-bold text-indigo-600">{convert24to12(value)}</span>;
    }
    
    if (type === 'phone') {
        if (!value) return <span className="opacity-20">-</span>;
        return <span className="text-[11px]">{value}</span>;
    }

    return (
      <span className={`truncate w-full ${!value ? 'opacity-20 italic' : ''}`}>
        {value || placeholder}
      </span>
    );
  };

  return (
    <>
      <div 
        ref={cellRef}
        onDoubleClick={handleDoubleClick}
        onClick={handleCellClick}
        className={`w-full h-full px-3 flex items-center transition-all duration-75 outline-none cursor-default select-none text-[11px] font-medium leading-none ${isActive ? 'bg-white' : ''} ${className || ''}`}
      >
        {renderContent()}
      </div>
      {renderEditor()}
    </>
  );
});

export default EditableCell;