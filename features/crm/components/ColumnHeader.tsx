
import React, { useState, useRef, useEffect } from 'react';

interface ColumnHeaderProps {
  label: string;
  type: string;
  width: number;
  isSorted?: 'asc' | 'desc' | null;
  onSort: (dir: 'asc' | 'desc' | null) => void;
  onHide: () => void;
  onResize: (newWidth: number) => void;
  fixed?: boolean;
}

const ColumnHeader: React.FC<ColumnHeaderProps> = ({ label, type, width, isSorted, onSort, onHide, onResize, fixed }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Resize State
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Click Outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Resize Handlers
  useEffect(() => {
     const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing) return;
        const diff = e.clientX - startXRef.current;
        const nextWidth = Math.max(50, startWidthRef.current + diff);
        onResize(nextWidth);
     };
     const handleMouseUp = () => {
        setIsResizing(false);
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
     };

     if (isResizing) {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
     }
     return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
     };
  }, [isResizing, onResize]);

  const startResize = (e: React.MouseEvent) => {
     e.stopPropagation();
     e.preventDefault();
     setIsResizing(true);
     startXRef.current = e.clientX;
     startWidthRef.current = width;
  };

  const getIcon = () => {
    switch (type) {
      case 'date': return '📅';
      case 'number': 
      case 'currency': return '#';
      case 'select': return '▼';
      case 'phone': return '📞';
      default: return 'T';
    }
  };

  // Header click cycles sort
  const handleHeaderClick = () => {
     if (isSorted === 'asc') onSort('desc');
     else if (isSorted === 'desc') onSort(null);
     else onSort('asc');
  };

  return (
    <div 
      className={`
        relative flex items-center justify-between px-3 py-2 text-[11px] font-bold text-gray-500 uppercase tracking-wide border-r border-gray-200 bg-gray-50 h-full group select-none cursor-pointer
        ${fixed ? 'sticky left-0 z-30 bg-gray-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''}
        ${isSorted ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-100'}
      `}
      style={{ minWidth: width, width }}
      onClick={handleHeaderClick}
    >
      <div className="flex items-center gap-2 overflow-hidden flex-1">
        <span className="opacity-50 font-normal">{getIcon()}</span>
        <span className="truncate">{label}</span>
        {isSorted && <span className="text-indigo-600">{isSorted === 'asc' ? '↓' : '↑'}</span>}
      </div>

      <button 
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        className={`hover:bg-gray-200 rounded px-1 text-gray-400 hover:text-gray-800 transition-colors ${isOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
        ⋮
      </button>

      {isOpen && (
        <div ref={menuRef} className="absolute top-full right-0 mt-1 w-40 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden animate-fade-in-up font-medium cursor-default" onClick={e => e.stopPropagation()}>
          <div className="py-1">
            <button onClick={() => { onSort('asc'); setIsOpen(false); }} className="w-full text-left px-4 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 text-gray-700">
              <span>↓</span> Sort A → Z
            </button>
            <button onClick={() => { onSort('desc'); setIsOpen(false); }} className="w-full text-left px-4 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 text-gray-700">
              <span>↑</span> Sort Z → A
            </button>
            {isSorted && (
               <button onClick={() => { onSort(null); setIsOpen(false); }} className="w-full text-left px-4 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 text-gray-400 italic">
                  ✕ Clear Sort
               </button>
            )}
            <div className="h-px bg-gray-100 my-1"></div>
            <button onClick={() => { onHide(); setIsOpen(false); }} className="w-full text-left px-4 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 text-red-600">
              <span>👁️‍🗨️</span> Hide Field
            </button>
          </div>
        </div>
      )}
      
      {/* Visual Resize Handle */}
      <div 
         className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-400 transition-colors opacity-0 hover:opacity-100 z-40"
         onMouseDown={startResize}
         onClick={e => e.stopPropagation()}
      ></div>
    </div>
  );
};

export default ColumnHeader;
