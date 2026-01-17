
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Client } from '../../types';

interface CommandBarProps {
  isOpen: boolean;
  onClose: () => void;
  clients: Client[];
  onSelectClient: (client: Client) => void;
  onAction: (actionId: string) => void;
}

const CommandBar: React.FC<CommandBarProps> = ({ isOpen, onClose, clients, onSelectClient, onAction }) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filteredClients = clients.filter(c => 
    c.profile.name.toLowerCase().includes(query.toLowerCase()) || 
    (c.profile.phone || '').includes(query)
  ).slice(0, 5);

  const actions = [
    { id: 'new_client', label: 'Create New Client', icon: '＋' },
    { id: 'toggle_compact', label: 'Toggle Compact Mode', icon: '↕️' },
    { id: 'open_blast', label: 'Open Smart Blast', icon: '💬' },
    { id: 'import_csv', label: 'Import CSV Data', icon: '📥' }
  ].filter(a => a.label.toLowerCase().includes(query.toLowerCase()));

  const results = [
    ...actions.map(a => ({ ...a, type: 'action' })),
    ...filteredClients.map(c => ({ ...c, type: 'client' }))
  ];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % Math.max(1, results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === 'Enter') {
      const selected = results[activeIndex];
      if (selected) {
        if ((selected as any).type === 'action') onAction(selected.id as string);
        else onSelectClient(selected as Client);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-start justify-center pt-[15vh] p-4 bg-slate-900/10 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center px-6 border-b border-slate-100">
          <span className="text-xl mr-4 opacity-30">🔍</span>
          <input
            ref={inputRef}
            className="w-full py-5 text-lg outline-none text-slate-800 placeholder-slate-300 font-medium"
            placeholder="Search clients or commands..."
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
          />
          <kbd className="px-2 py-1 rounded border border-slate-200 text-[10px] font-bold text-slate-400 bg-slate-50 uppercase">Esc</kbd>
        </div>

        <div className="p-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {results.length === 0 ? (
            <div className="py-12 text-center text-slate-300 text-sm font-medium italic">No results for "{query}"</div>
          ) : (
            results.map((item: any, idx) => (
              <button
                key={item.id || idx}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => {
                  if (item.type === 'action') onAction(item.id);
                  else onSelectClient(item as Client);
                  onClose();
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition-colors duration-150 ${
                  idx === activeIndex ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className="text-lg w-6 flex justify-center opacity-70">{item.type === 'action' ? item.icon : '👤'}</span>
                  <div>
                    <div className="text-sm font-bold">{item.type === 'action' ? item.label : item.profile.name}</div>
                    {item.type === 'client' && <div className="text-[10px] opacity-50 uppercase font-black tracking-tighter">{item.profile.phone || item.profile.email}</div>}
                  </div>
                </div>
                {idx === activeIndex && <span className="text-[10px] font-black opacity-30 tracking-widest uppercase">Select ↵</span>}
              </button>
            ))
          )}
        </div>
        
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 flex justify-between items-center text-[10px] font-black text-slate-300 uppercase tracking-widest">
          <div className="flex gap-4">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
          </div>
          <span>Quantum Command</span>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CommandBar;
