import React, { useState, useEffect, useRef } from 'react';
import { TAB_DEFINITIONS } from '../../lib/config';
import { Client } from '../../types';

interface CommandPaletteProps {
  clients: Client[];
  onNavigate: (tabId: string) => void;
  onSelectClient: (client: Client) => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ clients, onNavigate, onSelectClient }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setActiveIndex(0);
    }
  }, [isOpen]);

  const filteredTabs = TAB_DEFINITIONS.filter(t => 
    t.label.toLowerCase().includes(query.toLowerCase()) && t.id !== 'admin'
  ).slice(0, 4);
  
  const filteredClients = clients.filter(c => {
    const name = c.profile?.name || c.name || '';
    const ref = c.referenceCode || '';
    return name.toLowerCase().includes(query.toLowerCase()) || ref.toLowerCase().includes(query.toLowerCase());
  }).slice(0, 5);

  const allResults = [
    ...filteredTabs.map(t => ({ type: 'tab', data: t })),
    ...filteredClients.map(c => ({ type: 'client', data: c }))
  ];

  useEffect(() => {
    const handleNavKeys = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => Math.min(prev + 1, allResults.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => Math.max(prev - 1, 0));
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const selected = allResults[activeIndex];
        if (selected) {
          if (selected.type === 'tab') onNavigate((selected.data as any).id);
          if (selected.type === 'client') onSelectClient(selected.data as any);
          setIsOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleNavKeys);
    return () => window.removeEventListener('keydown', handleNavKeys);
  }, [isOpen, allResults, activeIndex, onNavigate, onSelectClient]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-start justify-center pt-[15vh] p-4 bg-slate-900/10 backdrop-blur-[8px] animate-in fade-in duration-200" onClick={() => setIsOpen(false)}>
      <div 
        className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center px-6 py-5 border-b border-slate-100">
          <span className="text-xl mr-4 opacity-30 font-light">🔍</span>
          <input 
            ref={inputRef}
            type="text" 
            className="flex-1 bg-transparent outline-none text-lg text-slate-800 placeholder-slate-300 font-medium"
            placeholder="Search clients or commands..."
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
          />
          <div className="flex items-center gap-1.5">
             <kbd className="text-[10px] bg-slate-50 text-slate-400 px-2 py-1 rounded border border-slate-200 font-bold uppercase">Esc</kbd>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-2 px-2 custom-scrollbar">
          {allResults.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm font-medium italic">No matches for "{query}"</div>
          ) : (
            <div className="space-y-1">
              {allResults.map((item, idx) => {
                const isActive = idx === activeIndex;
                const isTab = item.type === 'tab';
                const d = item.data as any;
                
                return (
                  <button 
                    key={idx}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => {
                      if (isTab) onNavigate(d.id);
                      else onSelectClient(d);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-4 transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    <span className={`text-xl w-8 h-8 flex items-center justify-center rounded-lg ${isActive ? 'bg-indigo-100' : 'bg-slate-100'}`}>
                      {isTab ? d.icon : '👤'}
                    </span>
                    <div className="flex-1 min-w-0">
                       <div className="font-bold text-sm truncate">{isTab ? d.label : (d.profile?.name || d.name || 'Unnamed')}</div>
                       {!isTab && <div className={`text-[10px] uppercase font-black tracking-tighter opacity-50`}>{d.profile?.phone || d.profile?.email || '-'}</div>}
                    </div>
                    {isActive && <span className="text-[10px] font-black opacity-30 tracking-widest uppercase pr-2">Return ↵</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 flex justify-between items-center text-[10px] font-black text-slate-300 uppercase tracking-widest">
           <div className="flex gap-6">
              <span className="flex items-center gap-1.5">↑↓ Navigate</span>
              <span className="flex items-center gap-1.5">↵ Select</span>
           </div>
           <span>Quantum Search</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;