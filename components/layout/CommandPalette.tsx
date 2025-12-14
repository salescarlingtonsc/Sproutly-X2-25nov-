
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

  // Toggle with Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setActiveIndex(0);
    }
  }, [isOpen]);

  // Filter Results
  const filteredTabs = TAB_DEFINITIONS.filter(t => 
    t.label.toLowerCase().includes(query.toLowerCase()) && t.id !== 'admin'
  );
  
  const filteredClients = clients.filter(c => 
    c.profile.name.toLowerCase().includes(query.toLowerCase()) || 
    (c.referenceCode || '').toLowerCase().includes(query.toLowerCase())
  ).slice(0, 5);

  const allResults = [
    ...filteredTabs.map(t => ({ type: 'tab', data: t })),
    ...filteredClients.map(c => ({ type: 'client', data: c }))
  ];

  // Navigation Logic
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
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]" onClick={() => setIsOpen(false)}>
      <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity"></div>
      
      <div 
        className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden animate-fade-in-up border border-gray-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3 border-b border-gray-100">
          <span className="text-gray-400 text-lg mr-3">🔍</span>
          <input 
            ref={inputRef}
            type="text" 
            className="flex-1 bg-transparent outline-none text-slate-800 placeholder-gray-400 font-medium h-6"
            placeholder="Go to..."
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
          />
          <div className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded font-bold">ESC</div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-2">
          {allResults.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm italic">No matching results found.</div>
          ) : (
            <>
              {filteredTabs.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tools</div>
                  {filteredTabs.map((tab, idx) => {
                    const globalIdx = idx; // Since tabs come first
                    const isActive = globalIdx === activeIndex;
                    return (
                      <button 
                        key={tab.id}
                        onClick={() => { onNavigate(tab.id); setIsOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-gray-50'}`}
                      >
                        <span className="text-lg">{tab.icon}</span>
                        <span className="font-bold">{tab.label}</span>
                        {isActive && <span className="ml-auto text-[10px] text-indigo-400 font-bold">↵ Enter</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {filteredClients.length > 0 && (
                <div>
                  <div className="px-4 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-2">Clients</div>
                  {filteredClients.map((client, idx) => {
                    const globalIdx = filteredTabs.length + idx;
                    const isActive = globalIdx === activeIndex;
                    return (
                      <button 
                        key={client.id}
                        onClick={() => { onSelectClient(client); setIsOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors ${isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-700 hover:bg-gray-50'}`}
                      >
                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                           {client.profile.name.charAt(0)}
                        </div>
                        <div>
                           <div className="font-bold">{client.profile.name}</div>
                           <div className="text-[10px] opacity-70">{client.profile.email}</div>
                        </div>
                        {isActive && <span className="ml-auto text-[10px] text-emerald-400 font-bold">↵ Open</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
        
        <div className="bg-gray-50 px-4 py-2 border-t border-gray-100 flex justify-between items-center text-[10px] text-gray-400 font-medium">
           <div className="flex gap-2">
              <span>↑↓ Navigate</span>
              <span>↵ Select</span>
           </div>
           <div>Quantum Search</div>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
