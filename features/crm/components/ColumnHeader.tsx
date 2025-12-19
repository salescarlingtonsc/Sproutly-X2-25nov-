
import React, { useState, useRef, useEffect } from 'react';

interface ColumnHeaderProps {
  label: string;
  type: string;
  width: number;
  isSorted?: 'asc' | 'desc' | null;
  onSort: (dir: 'asc' | 'desc' | null) => void;
  onHide: () => void;
  onResize: (newWidth: number) => void;
}

const ColumnHeader: React.FC<ColumnHeaderProps> = ({ label, type, width, isSorted, onSort, onHide, onResize }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  useEffect(() => {
    const clickOut = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', clickOut);
    return () => document.removeEventListener('mousedown', clickOut);
  }, []);

  useEffect(() => {
     const move = (e: MouseEvent) => {
        if (!isResizing) return;
        onResize(Math.max(80, startWidthRef.current + (e.clientX - startXRef.current)));
     };
     const up = () => setIsResizing(false);
     if (isResizing) {
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
     }
     return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
  }, [isResizing, onResize]);

  const getIcon = () => {
    switch (type) {
      case 'date': return '🗓️';
      case 'number': return '＃';
      case 'currency': return '💰';
      case 'select': return '▼';
      case 'phone': return '📞';
      default: return 'Aa';
    }
  };

  return (
    <div 
      className={`relative flex items-center justify-between px-3 py-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.05em] h-full group select-none border-r border-slate-100 transition-colors ${isSorted ? 'bg-slate-50 text-indigo-600' : 'hover:bg-slate-50'}`}
      style={{ width }}
    >
      <div className="flex items-center gap-2 overflow-hidden flex-1 cursor-pointer" onClick={() => onSort(isSorted === 'asc' ? 'desc' : (isSorted === 'desc' ? null : 'asc'))}>
        <span className="opacity-40 font-normal shrink-0">{getIcon()}</span>
        <span className="truncate whitespace-nowrap">{label}</span>
        {isSorted && <span className="text-indigo-600 ml-1 shrink-0">{isSorted === 'asc' ? '↓' : '↑'}</span>}
      </div>

      <button 
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        className={`p-1 hover:bg-slate-200 rounded transition-all shrink-0 ${isOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
        <span className="opacity-50">⋮</span>
      </button>

      {isOpen && (
        <div ref={menuRef} className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-2xl border border-slate-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200 py-1.5">
            <button onClick={() => { onSort('asc'); setIsOpen(false); }} className="w-full text-left px-4 py-2 text-[11px] font-bold hover:bg-slate-50 flex items-center gap-3 text-slate-700"><span>↓</span> Sort Ascending</button>
            <button onClick={() => { onSort('desc'); setIsOpen(false); }} className="w-full text-left px-4 py-2 text-[11px] font-bold hover:bg-slate-50 flex items-center gap-3 text-slate-700"><span>↑</span> Sort Descending</button>
            <div className="h-px bg-slate-50 my-1"></div>
            <button onClick={() => { onHide(); setIsOpen(false); }} className="w-full text-left px-4 py-2 text-[11px] font-black text-red-500 hover:bg-red-50 flex items-center gap-3 uppercase tracking-widest"><span>✕</span> Hide Field</button>
        </div>
      )}
      
      <div 
         className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-300 transition-colors z-40 ${isResizing ? 'bg-indigo-500' : ''}`}
         onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); startXRef.current = e.clientX; startWidthRef.current = width; }}
      />
    </div>
  );
};

export default ColumnHeader;
