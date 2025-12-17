
import React, { useState, useEffect } from 'react';
import { FieldDefinition } from '../../../types';

interface ColumnPickerProps {
  allColumns: { id: string; label: string; }[];
  visibleColumnIds: Set<string>;
  onChange: (newSet: Set<string>) => void;
  onManageFields: () => void;
}

const ColumnPicker: React.FC<ColumnPickerProps> = ({ allColumns, visibleColumnIds, onChange, onManageFields }) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleColumn = (id: string) => {
    const next = new Set(visibleColumnIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const selectAll = () => onChange(new Set(allColumns.map(c => c.id)));
  const selectNone = () => onChange(new Set(['name'])); // Keep Name mandatory

  return (
    <div className="relative inline-block text-left">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex justify-center w-full px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none"
      >
        👁 Columns ({visibleColumnIds.size})
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-30 cursor-default" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 z-40 w-64 mt-2 origin-top-right bg-white rounded-md shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none animate-fade-in-up">
            <div className="p-2 border-b border-gray-100 flex justify-between bg-gray-50">
               <button onClick={selectAll} className="text-[10px] text-indigo-600 font-bold hover:underline">All</button>
               <button onClick={selectNone} className="text-[10px] text-gray-500 font-bold hover:underline">Min</button>
            </div>
            <div className="py-1 max-h-60 overflow-y-auto custom-scrollbar">
              {allColumns.map((col) => (
                <label key={col.id} className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visibleColumnIds.has(col.id)}
                    onChange={() => toggleColumn(col.id)}
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 mr-3"
                    disabled={col.id === 'name'}
                  />
                  <span className={visibleColumnIds.has(col.id) ? 'font-medium' : 'text-gray-500'}>{col.label}</span>
                </label>
              ))}
            </div>
            <div className="p-2 border-t border-gray-100 bg-gray-50 text-center">
               <button onClick={() => { setIsOpen(false); onManageFields(); }} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 w-full py-1">
                  + Manage Fields
               </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ColumnPicker;
