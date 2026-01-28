import React, { useState, useRef, useEffect } from 'react';
import { Client, ContactStatus } from '../../../types';

// Updated STATUS_CONFIG to match all keys in the expanded ContactStatus type
export const STATUS_CONFIG: Record<ContactStatus, { label: string; dot: string; bg: string; text: string; hover: string }> = {
  'new': { label: 'New Lead', dot: 'bg-indigo-400', bg: 'bg-indigo-50/60', text: 'text-indigo-800', hover: 'hover:bg-indigo-100' },
  'contacted': { label: 'Contacted', dot: 'bg-indigo-300', bg: 'bg-indigo-50/40', text: 'text-indigo-600', hover: 'hover:bg-indigo-100' },
  'qualified': { label: 'Qualified', dot: 'bg-emerald-400', bg: 'bg-emerald-50/40', text: 'text-emerald-700', hover: 'hover:bg-emerald-100' },
  'picked_up': { label: 'Picked up', dot: 'bg-emerald-500', bg: 'bg-emerald-50/60', text: 'text-emerald-800', hover: 'hover:bg-emerald-100' },
  
  // NPU SEQUENCE
  'npu_1': { label: 'NPU 1', dot: 'bg-slate-400', bg: 'bg-slate-50', text: 'text-slate-600', hover: 'hover:bg-slate-100' },
  'npu_2': { label: 'NPU 2', dot: 'bg-slate-500', bg: 'bg-slate-100', text: 'text-slate-700', hover: 'hover:bg-slate-200' },
  'npu_3': { label: 'NPU 3', dot: 'bg-amber-400', bg: 'bg-amber-50', text: 'text-amber-700', hover: 'hover:bg-amber-100' },
  'npu_4': { label: 'NPU 4', dot: 'bg-amber-500', bg: 'bg-amber-100', text: 'text-amber-800', hover: 'hover:bg-amber-200' },
  'npu_5': { label: 'NPU 5', dot: 'bg-red-400', bg: 'bg-red-50', text: 'text-red-700', hover: 'hover:bg-red-100' },
  'npu_6': { label: 'NPU 6', dot: 'bg-red-600', bg: 'bg-red-100', text: 'text-red-900', hover: 'hover:bg-red-200' },
  
  'appt_set': { label: 'Appt set', dot: 'bg-purple-500', bg: 'bg-purple-50/60', text: 'text-purple-800', hover: 'hover:bg-purple-100' },
  'appt_met': { label: 'Appt met', dot: 'bg-blue-500', bg: 'bg-blue-50/60', text: 'text-blue-800', hover: 'hover:bg-blue-100' },
  'proposal': { label: 'Proposal', dot: 'bg-amber-400', bg: 'bg-amber-50/40', text: 'text-amber-700', hover: 'hover:bg-amber-100' },
  'pending_decision': { label: 'Pending Client', dot: 'bg-orange-500', bg: 'bg-orange-50/60', text: 'text-orange-800', hover: 'hover:bg-orange-100' },
  'closing': { label: 'Closing', dot: 'bg-red-400', bg: 'bg-red-50/40', text: 'text-red-700', hover: 'hover:bg-red-100' },
  'case_closed': { label: 'Case closed', dot: 'bg-slate-900', bg: 'bg-slate-100', text: 'text-slate-900', hover: 'hover:bg-slate-200' },
  'client': { label: 'Client', dot: 'bg-slate-800', bg: 'bg-slate-100', text: 'text-slate-900', hover: 'hover:bg-slate-200' },
  'not_keen': { label: 'Lost', dot: 'bg-red-300', bg: 'bg-red-50', text: 'text-red-400', hover: 'hover:bg-red-100' },
};

interface StatusDropdownProps {
  client: Client;
  onUpdate: (client: Client, newStatus: ContactStatus) => void;
}

const StatusDropdown: React.FC<StatusDropdownProps> = ({ client, onUpdate }) => {
  // FIX: Safe access to followUp property
  const currentStatus = client.followUp?.status || (client.stage as any) || 'new';
  const config = STATUS_CONFIG[currentStatus as ContactStatus] || STATUS_CONFIG['new'];
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
        className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 border border-transparent hover:border-slate-200 active:scale-95 shadow-sm ${config.bg} ${config.text} ${config.hover}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot} transition-transform group-hover:scale-125`}></span>
        <span className="flex-1">{config.label}</span>
        <span className="opacity-30 group-hover:opacity-100 transition-opacity text-[8px] ml-1">▼</span>
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-slate-100 z-[1000] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 p-1.5">
          <div className="grid grid-cols-1 divide-y divide-slate-50">
             <div className="py-1">
                {['new', 'picked_up', 'qualified'].map((s) => (
                   <StatusItem key={s} s={s as ContactStatus} current={currentStatus} onClick={(val) => { onUpdate(client, val); setIsOpen(false); }} />
                ))}
             </div>
             <div className="py-1 grid grid-cols-3 gap-1 p-1">
                {['npu_1', 'npu_2', 'npu_3', 'npu_4', 'npu_5', 'npu_6'].map((s) => (
                   <button 
                      key={s} onClick={(e) => { e.stopPropagation(); onUpdate(client, s as ContactStatus); setIsOpen(false); }}
                      className={`py-2 rounded text-[9px] font-black transition-all ${s === currentStatus ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                   >
                      {s.toUpperCase().replace('_', ' ')}
                   </button>
                ))}
             </div>
             <div className="py-1">
                {['appt_set', 'appt_met', 'pending_decision', 'client', 'case_closed', 'not_keen'].map((s) => (
                   <StatusItem key={s} s={s as ContactStatus} current={currentStatus} onClick={(val) => { onUpdate(client, val); setIsOpen(false); }} />
                ))}
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatusItem: React.FC<{ s: ContactStatus; current: string; onClick: (s: ContactStatus) => void }> = ({ s, current, onClick }) => {
   const conf = STATUS_CONFIG[s] || STATUS_CONFIG['new'];
   return (
      <button
         onClick={(e) => { e.stopPropagation(); onClick(s); }}
         className={`w-full text-left px-3 py-2 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-3 ${s === current ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'}`}
      >
         <span className={`w-2 h-2 rounded-full ${conf.dot}`}></span>
         {conf.label}
      </button>
   );
};

export default StatusDropdown;