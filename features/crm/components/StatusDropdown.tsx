
import React, { useState } from 'react';
import { Client, ContactStatus } from '../../../types';

export const STATUS_CONFIG: Record<string, { label: string; style: string; ring: string; icon: string }> = {
  'new': { label: 'New Lead', style: 'bg-emerald-100 text-emerald-700', ring: 'ring-emerald-200', icon: '🌱' },
  'picked_up': { label: 'Contacted', style: 'bg-blue-50 text-blue-700', ring: 'ring-blue-200', icon: '📞' },
  'appt_set': { label: 'Meeting Set', style: 'bg-purple-50 text-purple-700 font-bold', ring: 'ring-purple-200', icon: '📅' },
  'proposal': { label: 'Proposal', style: 'bg-amber-50 text-amber-700', ring: 'ring-amber-200', icon: '📝' },
  'client': { label: 'Closed Won', style: 'bg-slate-800 text-white font-bold', ring: 'ring-slate-600', icon: '🤝' },
  'not_keen': { label: 'Lost', style: 'bg-gray-100 text-gray-500 line-through', ring: 'ring-gray-200', icon: '🗑️' },
};

interface StatusDropdownProps {
  client: Client;
  onUpdate: (client: Client, newStatus: string) => void;
}

const StatusDropdown: React.FC<StatusDropdownProps> = ({ client, onUpdate }) => {
  const currentStatus = client.followUp.status || 'new';
  const config = STATUS_CONFIG[currentStatus] || STATUS_CONFIG['new'];
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button 
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-all shadow-sm hover:scale-105 ${config.style} ring-1 ring-inset ${config.ring}`}
      >
        <span>{config.icon}</span>
        {config.label}
        <span className="opacity-50 ml-1">▼</span>
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 z-[60] overflow-hidden animate-fade-in-up">
          <div className="py-1">
            {Object.entries(STATUS_CONFIG).map(([key, conf]) => (
              <button
                key={key}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  onUpdate(client, key); 
                  setIsOpen(false); 
                }}
                className={`w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-gray-50 flex items-center gap-2 ${key === currentStatus ? 'bg-indigo-50 text-indigo-600' : 'text-gray-700'}`}
              >
                <span>{conf.icon}</span>
                {conf.label}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {isOpen && (
        <div className="fixed inset-0 z-50" onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}></div>
      )}
    </div>
  );
};

export default StatusDropdown;
