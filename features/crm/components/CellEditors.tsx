import React, { useState, useEffect, useRef, useLayoutEffect, PropsWithChildren } from 'react';
import { createPortal } from 'react-dom';

const OPTION_STYLES: Record<string, string> = {
  'new': 'bg-emerald-100 text-emerald-800',
  'picked_up': 'bg-blue-100 text-blue-800',
  'appt_set': 'bg-indigo-100 text-indigo-800',
  'proposal': 'bg-amber-100 text-amber-800',
  'client': 'bg-slate-800 text-white',
  'not_keen': 'bg-gray-100 text-gray-500',
};

export const getOptionStyle = (val: string) => {
  if (OPTION_STYLES[val]) return OPTION_STYLES[val];
  return 'bg-slate-100 text-slate-800';
};

const EditorPortal = ({ children }: PropsWithChildren<{}>) => {
  return createPortal(
    <div className="fixed inset-0 z-[10000] overflow-hidden" onMouseDown={e => e.stopPropagation()}>
      {children}
    </div>,
    document.body
  );
};

interface BaseEditorProps {
  value: any;
  onChange: (val: any) => void;
  onClose: () => void;
  rect: DOMRect;
  onAddOption?: (newOpt: string) => void;
}

export const SelectEditor = ({ value, onChange, onClose, rect, options }: BaseEditorProps & { options: string[] }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = options.filter(o => o.toLowerCase().includes(searchTerm.toLowerCase()));
  
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[activeIndex]) {
        onChange(filtered[activeIndex]);
        onClose();
      }
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      onClose();
    }
  };

  return (
    <EditorPortal>
      <div className="absolute inset-0" onMouseDown={onClose} />
      <div 
        className="absolute bg-white rounded-xl shadow-2xl border border-slate-200 w-64 overflow-hidden animate-in fade-in zoom-in-95 duration-100 p-1"
        style={{ top: rect.bottom + 4, left: rect.left }}
      >
        <div className="p-2 border-b border-slate-50">
          <input 
            ref={inputRef}
            className="w-full text-xs font-bold p-1.5 outline-none bg-slate-50 rounded-lg"
            placeholder="Search options..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="max-h-60 overflow-y-auto custom-scrollbar">
          {filtered.map((opt, idx) => (
            <div 
              key={opt}
              className={`px-3 py-2 text-[11px] font-bold cursor-pointer rounded-lg flex items-center gap-3 transition-colors ${idx === activeIndex ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={() => { onChange(opt); onClose(); }}
            >
              <div className={`w-2 h-2 rounded-full ${getOptionStyle(opt).split(' ')[0]}`} />
              {opt}
            </div>
          ))}
        </div>
      </div>
    </EditorPortal>
  );
};

export const TextEditor = ({ value, onChange, onClose, rect }: BaseEditorProps) => {
  const [localVal, setLocalVal] = useState(value || '');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onChange(localVal);
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <EditorPortal>
      <div className="absolute inset-0" onMouseDown={() => { onChange(localVal); onClose(); }} />
      <div 
        className="absolute bg-white rounded shadow-2xl ring-2 ring-indigo-500 overflow-hidden"
        style={{ top: rect.top, left: rect.left, width: Math.max(rect.width, 240), height: Math.max(rect.height, 40) }}
      >
        <textarea
          ref={inputRef}
          className="w-full h-full p-2 text-[11px] font-bold outline-none resize-none bg-white"
          value={localVal}
          onChange={e => setLocalVal(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
    </EditorPortal>
  );
};

export const DateEditor = ({ value, onChange, onClose, rect }: BaseEditorProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  return (
    <EditorPortal>
      <div className="absolute inset-0" onMouseDown={onClose} />
      <div className="absolute bg-white rounded-xl shadow-2xl p-3 border border-slate-200" style={{ top: rect.bottom + 4, left: rect.left }}>
        <input 
          ref={inputRef}
          type="date"
          className="p-2 border rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-100"
          value={value || ''}
          onChange={e => { onChange(e.target.value); onClose(); }}
          onKeyDown={e => e.key === 'Escape' && onClose()}
        />
      </div>
    </EditorPortal>
  );
};

export const TimeEditor = ({ value, onChange, onClose, rect }: BaseEditorProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  return (
    <EditorPortal>
      <div className="absolute inset-0" onMouseDown={onClose} />
      <div className="absolute bg-white rounded-xl shadow-2xl p-3 border border-slate-200" style={{ top: rect.bottom + 4, left: rect.left }}>
        <input 
          ref={inputRef}
          type="time"
          className="p-2 border rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-100"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if(e.key === 'Enter') onClose(); if(e.key === 'Escape') onClose(); }}
          onBlur={onClose}
        />
      </div>
    </EditorPortal>
  );
};