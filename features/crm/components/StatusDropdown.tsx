
import React, { useState, useRef, useEffect } from 'react';
import { Client } from '../../../types';

export const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  'new': { label: 'New', dot: 'bg-emerald-500', bg: 'bg-emerald-50/60', text: 'text-emerald-800' },
  'picked_up': { label: 'Contacted', dot: 'bg-blue-500', bg: 'bg-blue-50/60', text: 'text-blue-800' },
  'appt_set': { label: 'Meeting', dot: 'bg-indigo-500', bg: 'bg-indigo-50/60', text: 'text-indigo-800' },
  'proposal': { label: 'Proposal', dot: 'bg-amber-500', bg: 'bg-amber-50/60', text: 'text-amber-800' },
  'client': { label: 'Client', dot: 'bg-slate-900', bg: 'bg-slate-100', text: 'text-slate-900' },
  'not_keen': { label: 'Lost', dot: 'bg-slate-300', bg: 'bg-slate-50', text: 'text-slate-400' },
};

interface StatusDropdownProps {
  client: Client;
  onUpdate: (client: Client, newStatus: string) => void;
}

const StatusDropdown: React.FC<StatusDropdownProps> = ({ client, onUpdate }) => {
  const currentStatus = client.followUp.status || 'new';
  const config = STATUS_CONFIG[currentStatus] || STATUS_CONFIG['new'];
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clickOut = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', clickOut);
    return () => document.removeEventListener('mousedown', clickOut);
  }, []);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button 
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        className={`group flex items-center gap-2 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 border border-transparent hover:border-slate-200 active:scale-95 ${config.bg} ${config.text}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot} transition-transform group-hover:scale-125`}></span>
        {config.label}
        <span className="opacity-20 group-hover:opacity-100 transition-opacity text-[8px] ml-1">▼</span>
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl shadow-2xl border border-slate-100 z-[1000] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 p-1.5">
          {Object.entries(STATUS_CONFIG).map(([key, conf]) => (
            <button
              key={key}
              onClick={(e) => { 
                e.stopPropagation(); 
                onUpdate(client, key); 
                setIsOpen(false); 
              }}
              className={`w-full text-left px-3 py-2 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-3 ${key === currentStatus ? 'bg-slate-50 text-slate-900' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <span className={`w-2 h-2 rounded-full ${conf.dot}`}></span>
              {conf.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default StatusDropdown;
