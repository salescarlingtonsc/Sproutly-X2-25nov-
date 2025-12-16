
import React, { useState, useRef, useEffect } from 'react';
import { Client } from '../../../types';
import StatusDropdown from './StatusDropdown';
import { SelectEditor, TextEditor, DateEditor, getOptionStyle } from './CellEditors';

interface ClientDrawerProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateField: (field: string, value: any, section?: 'profile' | 'followUp' | 'appointments' | 'root') => void;
  onStatusUpdate: (client: Client, newStatus: string) => void;
  onOpenFullProfile: () => void;
  onDelete: () => void;
}

const DrawerField = ({ 
  value, type, options, onChange, placeholder 
}: { 
  value: any, type: string, options?: string[], onChange: (v: any) => void, placeholder?: string 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  // Need to ensure rect is available even after state update
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
     if (isEditing && ref.current) {
        setRect(ref.current.getBoundingClientRect());
     }
  }, [isEditing]);

  const handleStartEdit = () => setIsEditing(true);

  return (
    <div 
      ref={ref}
      onClick={handleStartEdit}
      className={`
         flex-1 p-2 border border-transparent hover:border-gray-200 hover:bg-gray-50 rounded text-sm text-gray-900 transition-all cursor-pointer min-h-[36px] flex items-center
         ${isEditing ? 'ring-2 ring-indigo-500 bg-white' : ''}
      `}
    >
      {type === 'select' && value ? (
         <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${getOptionStyle(value)}`}>{value}</span>
      ) : (
         <span className={!value ? 'text-gray-300' : ''}>{value || placeholder}</span>
      )}

      {isEditing && rect && (
        <>
          {type === 'select' && (
            <SelectEditor 
              value={value} options={options || []} rect={rect}
              onChange={onChange} onClose={() => setIsEditing(false)}
            />
          )}
          {type === 'text' && (
            <TextEditor 
              value={value} rect={rect}
              onChange={onChange} onClose={() => setIsEditing(false)}
            />
          )}
          {type === 'date' && (
            <DateEditor 
              value={value} rect={rect}
              onChange={onChange} onClose={() => setIsEditing(false)}
            />
          )}
        </>
      )}
    </div>
  );
};

const ClientDrawer: React.FC<ClientDrawerProps> = ({ 
  client, isOpen, onClose, onUpdateField, onStatusUpdate, onOpenFullProfile, onDelete 
}) => {
  if (!isOpen || !client) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-center items-center p-4 sm:p-8">
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      ></div>
      
      <div className="relative w-full max-w-5xl bg-white rounded-lg shadow-2xl flex flex-col z-10 h-[90vh] overflow-hidden animate-fade-in-up">
        
        {/* Header */}
        <div className="px-6 py-3 border-b border-gray-200 flex justify-between items-center bg-white shrink-0">
          <div className="flex items-center gap-2 text-sm text-gray-500">
             <button onClick={onClose} className="hover:bg-gray-100 p-1 rounded transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
             </button>
             <span className="font-medium text-gray-400">/ Record View / {client.profile.name}</span>
          </div>
          <div className="flex items-center gap-2">
             <button onClick={onDelete} className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded hover:bg-red-100 transition-colors">
                Delete
             </button>
             <button onClick={onOpenFullProfile} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded hover:bg-indigo-100 transition-colors">
                Open Full Profile ↗
             </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
           
           {/* LEFT: Fields */}
           <div className="flex-1 overflow-y-auto p-8 custom-scrollbar border-r border-gray-200 bg-white">
              <div className="max-w-2xl mx-auto space-y-8">
                 
                 {/* Title Field (Name) */}
                 <div>
                    <input 
                       type="text" 
                       value={client.profile.name}
                       onChange={(e) => onUpdateField('name', e.target.value)}
                       className="text-3xl font-bold text-gray-900 w-full outline-none placeholder-gray-300 bg-transparent"
                       placeholder="Unnamed Record"
                    />
                 </div>

                 <div className="space-y-6">
                    {/* Status */}
                    <div className="flex gap-4 items-start">
                       <div className="w-32 pt-2 text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><span className="text-lg">▼</span> Status</div>
                       <div className="flex-1">
                          <StatusDropdown client={client} onUpdate={onStatusUpdate} />
                       </div>
                    </div>

                    {/* Phone */}
                    <div className="flex gap-4 items-center group">
                       <div className="w-32 text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><span className="text-lg">#</span> Phone</div>
                       <DrawerField 
                          type="text" 
                          value={client.profile.phone} 
                          onChange={(v) => onUpdateField('phone', v)} 
                          placeholder="+65..." 
                       />
                    </div>

                    {/* Platform */}
                    <div className="flex gap-4 items-center group">
                       <div className="w-32 text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><span className="text-lg">≡</span> Platform</div>
                       <DrawerField 
                          type="select" 
                          options={['IG', 'FB', 'LinkedIn', 'Referral', 'Roadshow', 'Other']}
                          value={client.profile.source} 
                          onChange={(v) => onUpdateField('source', v)} 
                          placeholder="Select..." 
                       />
                    </div>

                    {/* Retirement Age */}
                    <div className="flex gap-4 items-center group">
                       <div className="w-32 text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><span className="text-lg">🕒</span> Retire Age</div>
                       <DrawerField 
                          type="text" 
                          value={client.profile.retirementAge} 
                          onChange={(v) => onUpdateField('retirementAge', v)} 
                          placeholder="65" 
                       />
                    </div>

                    {/* Remarks */}
                    <div className="flex gap-4 items-start group">
                       <div className="w-32 pt-2 text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><span className="text-lg">¶</span> Remarks</div>
                       <DrawerField 
                          type="text" 
                          value={client.followUp?.notes} 
                          onChange={(v) => onUpdateField('notes', v, 'followUp')} 
                          placeholder="Add notes..." 
                       />
                    </div>

                    {/* Motivation */}
                    <div className="flex gap-4 items-start group">
                       <div className="w-32 pt-2 text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><span className="text-lg">¶</span> Motivation</div>
                       <DrawerField 
                          type="text" 
                          value={client.profile.motivation} 
                          onChange={(v) => onUpdateField('motivation', v)} 
                          placeholder="Client goal..." 
                       />
                    </div>

                    <div className="h-px bg-gray-100 my-4"></div>

                    {/* Appointment Data */}
                    <div className="flex gap-4 items-center group">
                       <div className="w-32 text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><span className="text-lg">📅</span> 1st Appt</div>
                       <DrawerField 
                          type="date" 
                          value={client.appointments?.firstApptDate} 
                          onChange={(v) => onUpdateField('firstApptDate', v, 'appointments')} 
                          placeholder="Set date..." 
                       />
                    </div>

                    {/* Outcome Status */}
                    <div className="flex gap-4 items-center group">
                       <div className="w-32 text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><span className="text-lg">▼</span> Outcome</div>
                       <DrawerField 
                          type="select" 
                          options={['Pending', 'Zoom (not Keen)', 'Zoom (Keen)', 'Attended zoom', 'No Show']}
                          value={client.appointments?.status || 'Pending'} 
                          onChange={(v) => onUpdateField('status', v, 'appointments')} 
                       />
                    </div>

                 </div>
              </div>
           </div>

           {/* RIGHT: Activity History */}
           <div className="w-[350px] bg-gray-50 flex flex-col border-l border-gray-200">
              <div className="p-4 border-b border-gray-200 bg-white">
                 <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Activity</h3>
              </div>
              <div className="flex-1 p-8 flex items-center justify-center text-gray-400 text-xs italic">
                 History log coming soon...
              </div>
           </div>

        </div>
      </div>
    </div>
  );
};

export default ClientDrawer;
