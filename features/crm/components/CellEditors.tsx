
import React, { useState, useEffect, useRef, useLayoutEffect, PropsWithChildren } from 'react';
import { createPortal } from 'react-dom';

// --- STYLES ---
const OPTION_STYLES: Record<string, string> = {
  'new': 'bg-emerald-100 text-emerald-800',
  'picked_up': 'bg-blue-50 text-blue-700',
  'appt_set': 'bg-purple-50 text-purple-700',
  'proposal': 'bg-amber-50 text-amber-700',
  'client': 'bg-slate-800 text-white',
  'not_keen': 'bg-gray-100 text-gray-500 line-through',
  'IG': 'bg-pink-50 text-pink-700',
  'FB': 'bg-blue-50 text-blue-700',
  'LinkedIn': 'bg-sky-100 text-sky-800',
  'Referral': 'bg-amber-50 text-amber-700',
  'Roadshow': 'bg-purple-50 text-purple-700',
  'High': 'bg-red-100 text-red-700',
  'Medium': 'bg-orange-100 text-orange-700',
  'Low': 'bg-gray-100 text-gray-600',
};

export const getOptionStyle = (val: string) => {
  if (OPTION_STYLES[val]) return OPTION_STYLES[val];
  const lower = (val || '').toLowerCase();
  const found = Object.keys(OPTION_STYLES).find(k => k.toLowerCase() === lower);
  return found ? OPTION_STYLES[found] : 'bg-gray-100 text-gray-800';
};

// --- PORTAL ---
const EditorPortal = ({ children }: PropsWithChildren<{}>) => {
  return createPortal(
    <div className="fixed inset-0 z-[9999] isolate" onMouseDown={e => e.stopPropagation()}>
      {children}
    </div>,
    document.body
  );
};

// --- EDITOR PROPS ---
interface BaseEditorProps {
  value: any;
  onChange: (val: any) => void;
  onClose: () => void;
  rect: DOMRect;
  onAddOption?: (newOpt: string) => void;
}

// --- 1. SELECT EDITOR (Airtable Style) ---
interface SelectEditorProps extends BaseEditorProps {
  options: string[];
}

export const SelectEditor = ({ value, onChange, onClose, rect, options, onAddOption }: SelectEditorProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = options.filter(o => o.toLowerCase().includes(searchTerm.toLowerCase()));
  
  useEffect(() => {
    if (inputRef.current) {
        inputRef.current.focus();
    }
  }, []);

  const handleSelect = (val: string) => {
    onChange(val);
    onClose();
  };

  const handleCreate = () => {
    if (onAddOption && searchTerm) {
      onAddOption(searchTerm);
      onChange(searchTerm);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Stop propagation so grid doesn't capture Enter/Tab
    e.stopPropagation();

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const maxIndex = searchTerm && !filteredOptions.includes(searchTerm) ? filteredOptions.length : filteredOptions.length - 1;
      setActiveIndex(prev => Math.min(prev + 1, maxIndex));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // If adding new option
      if (activeIndex === filteredOptions.length && searchTerm && !filteredOptions.includes(searchTerm)) {
         handleCreate();
      } else if (filteredOptions[activeIndex]) {
         handleSelect(filteredOptions[activeIndex]);
      } else {
         onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab') {
        if (filteredOptions[activeIndex]) {
           onChange(filteredOptions[activeIndex]);
        }
        onClose();
    }
  };

  return (
    <EditorPortal>
      {/* Invisible backdrop to close on click outside */}
      <div className="absolute inset-0" onMouseDown={onClose} />
      
      <div 
        className="absolute bg-white rounded-lg shadow-xl border border-gray-200 flex flex-col w-64 animate-fade-in-up"
        style={{ 
            top: rect.bottom + 4, 
            left: rect.left,
            maxHeight: '300px'
        }}
        onMouseDown={e => e.stopPropagation()} 
      >
        <div className="p-2 border-b border-gray-100">
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Find or add option"
            className="w-full text-xs p-1.5 bg-gray-50 rounded border-none outline-none focus:ring-1 focus:ring-indigo-500 font-medium text-gray-900"
          />
        </div>
        <div className="overflow-y-auto p-1 custom-scrollbar" style={{ maxHeight: '200px' }}>
          {filteredOptions.map((opt, idx) => (
            <div
              key={opt}
              className={`px-3 py-2 cursor-pointer rounded text-xs font-medium flex items-center gap-2 transition-colors ${idx === activeIndex ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => handleSelect(opt)}
            >
              <span className={`w-3 h-3 rounded-full ${getOptionStyle(opt).split(' ')[0]}`}></span>
              {opt}
            </div>
          ))}
          {/* Add Option Item */}
          {searchTerm && !filteredOptions.includes(searchTerm) && (
            <div
              className={`px-3 py-2 cursor-pointer rounded text-xs font-bold text-indigo-600 flex items-center gap-2 ${activeIndex === filteredOptions.length ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
              onMouseEnter={() => setActiveIndex(filteredOptions.length)}
              onClick={handleCreate}
            >
              <span>+</span> Create "{searchTerm}"
            </div>
          )}
          {filteredOptions.length === 0 && !searchTerm && (
             <div className="px-3 py-2 text-xs text-gray-400 italic">Type to search...</div>
          )}
        </div>
      </div>
    </EditorPortal>
  );
};

// --- 2. TEXT EDITOR (Floating Textarea) ---
export const TextEditor = ({ value, onChange, onClose, rect }: BaseEditorProps) => {
  const [localVal, setLocalVal] = useState(value || '');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation(); // Isolate from Grid

    if (e.key === 'Enter') {
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
         // Allow newline
         return; 
      }
      e.preventDefault();
      onChange(localVal);
      onClose();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab') {
      onChange(localVal);
      onClose(); 
    }
  };

  return (
    <EditorPortal>
      <div className="absolute inset-0" onMouseDown={() => { onChange(localVal); onClose(); }} />
      <div 
        className="absolute bg-white rounded-lg shadow-xl border-2 border-indigo-500 z-50 flex flex-col overflow-hidden"
        style={{ 
          top: rect.top - 1, 
          left: rect.left - 1, 
          width: Math.max(rect.width + 2, 220), 
          minHeight: Math.max(rect.height + 2, 80)
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <textarea
          ref={inputRef}
          value={localVal}
          onChange={e => setLocalVal(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full h-full p-2 text-sm bg-white text-gray-900 outline-none resize-none font-medium"
        />
        <div className="text-[9px] text-gray-400 px-2 pb-1 text-right bg-gray-50 border-t border-gray-100">
           Enter to save • Shift+Enter for newline
        </div>
      </div>
    </EditorPortal>
  );
};

// --- 3. DATE EDITOR ---
export const DateEditor = ({ value, onChange, onClose, rect }: BaseEditorProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Only focus, do NOT showPicker() automatically as it can cause artifacts
    if (inputRef.current) {
       inputRef.current.focus();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
     if(e.key === 'Tab' || e.key === 'Enter') {
        onClose();
     } else if (e.key === 'Escape') {
        onClose();
     }
  };

  return (
    <EditorPortal>
      <div className="absolute inset-0" onMouseDown={onClose} />
      <div 
        className="absolute z-50 bg-white rounded-lg shadow-xl p-2 border border-gray-200"
        style={{ top: rect.bottom + 2, left: rect.left }}
        onMouseDown={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="date"
          value={value || ''}
          onChange={(e) => { onChange(e.target.value); onClose(); }}
          onKeyDown={handleKeyDown}
          className="p-1 border border-gray-300 rounded text-sm outline-none focus:border-indigo-500 bg-white text-gray-900 block w-full"
          style={{ colorScheme: 'light' }}
        />
      </div>
    </EditorPortal>
  );
};
