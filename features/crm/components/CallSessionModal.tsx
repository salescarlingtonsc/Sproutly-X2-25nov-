
import React, { useState, useEffect, useRef } from 'react';
import { Client, ContactStatus } from '../../../types';
import { STATUS_CONFIG } from './StatusDropdown';
import Button from '../../../components/ui/Button';

interface CallSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: Client[];
  onUpdateClient: (client: Client, changes: Partial<Client>) => void;
}

const CallSessionModal: React.FC<CallSessionModalProps> = ({ isOpen, onClose, clients, onUpdateClient }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timer, setTimer] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [sessionLog, setSessionLog] = useState<{name: string, duration: string, outcome: string}[]>([]);
  const timerRef = useRef<any>(null);

  // Filter for valid leads: 'new' or 'npu_X' or 'picked_up'
  const callQueue = React.useMemo(() => {
    return clients.filter(c => {
       const s = c.followUp.status;
       return s === 'new' || s.startsWith('npu') || s === 'picked_up';
    });
  }, [clients]);

  const currentClient = callQueue[currentIndex];

  useEffect(() => {
    if (isOpen && callQueue.length > 0) {
      setCurrentIndex(0);
      setTimer(0);
      setIsActive(true);
    } else {
      setIsActive(false);
    }
  }, [isOpen, callQueue.length]);

  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        setTimer(t => t + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isActive, currentIndex]); // Reset on index change handled by logic below

  const handleOutcome = (outcome: 'answered' | 'no_answer' | 'bad_number' | 'skip') => {
    if (!currentClient) return;

    let newStatus: ContactStatus = currentClient.followUp.status;
    let noteContent = `Call Session: ${outcome}. Duration: ${formatTime(timer)}.`;

    if (outcome === 'answered') {
       newStatus = 'picked_up';
    } else if (outcome === 'no_answer') {
       // Smart NPU Logic
       if (newStatus === 'new') newStatus = 'npu_1';
       else if (newStatus === 'npu_1') newStatus = 'npu_2';
       else if (newStatus === 'npu_2') newStatus = 'npu_3';
       else if (newStatus === 'npu_3') newStatus = 'npu_4';
       else if (newStatus === 'npu_4') newStatus = 'npu_5';
       else if (newStatus === 'npu_5') newStatus = 'npu_6';
       // Cap at NPU 6
    } else if (outcome === 'bad_number') {
       newStatus = 'not_keen';
       noteContent += " Marked as Dead Lead.";
    }

    if (outcome !== 'skip') {
        const newNote = {
            id: `call_${Date.now()}`,
            content: noteContent,
            date: new Date().toISOString(),
            author: 'Power Dialer'
        };
        
        onUpdateClient(currentClient, {
            followUp: { ...currentClient.followUp, status: newStatus, lastContactedAt: new Date().toISOString() },
            notes: [newNote, ...(currentClient.notes || [])]
        });

        setSessionLog(prev => [...prev, { name: currentClient.profile.name, duration: formatTime(timer), outcome: newStatus }]);
    }

    // Move to next
    if (currentIndex < callQueue.length - 1) {
       setCurrentIndex(prev => prev + 1);
       setTimer(0);
    } else {
       setIsActive(false);
       alert("Session Complete! All queued leads processed.");
       onClose();
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (!isOpen) return null;

  if (callQueue.length === 0) {
     return (
        <div className="fixed inset-0 z-[1000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white rounded-2xl p-8 text-center max-w-sm w-full shadow-2xl">
              <div className="text-4xl mb-4">🎉</div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Queue Empty</h3>
              <p className="text-slate-500 text-sm mb-6">No leads found in 'New' or 'NPU' stages.</p>
              <Button onClick={onClose} className="w-full">Close</Button>
           </div>
        </div>
     );
  }

  const statusConf = STATUS_CONFIG[currentClient.followUp.status] || STATUS_CONFIG['new'];

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900 flex items-center justify-center">
       {/* Background Noise/Effect */}
       <div className="absolute inset-0 opacity-20 pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
       <div className="absolute top-0 right-0 p-8 text-white/30 font-mono text-xs">
          QUEUE: {currentIndex + 1} / {callQueue.length}
       </div>

       <div className="relative z-10 w-full max-w-2xl">
          {/* TIMER CARD */}
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden mb-8">
             <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
                <div className="flex items-center gap-3">
                   <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${statusConf.bg} ${statusConf.text}`}>
                      {statusConf.label}
                   </div>
                   <div className="text-slate-400 text-xs font-medium">Last: {currentClient.lastContact ? new Date(currentClient.lastContact).toLocaleDateString() : 'Never'}</div>
                </div>
                <div className={`font-mono text-4xl font-black tracking-tighter ${timer > 60 ? 'text-amber-500' : 'text-slate-800'}`}>
                   {formatTime(timer)}
                </div>
             </div>
             
             <div className="p-10 text-center space-y-4">
                <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">{currentClient.profile.name}</h1>
                <div className="inline-block bg-slate-100 px-6 py-3 rounded-2xl">
                   <a href={`tel:${currentClient.profile.phone}`} className="text-2xl md:text-3xl font-bold text-indigo-600 hover:underline decoration-2 underline-offset-4 decoration-indigo-300">
                      {currentClient.profile.phone || 'No Number'}
                   </a>
                </div>
                <div className="text-sm text-slate-500 font-medium uppercase tracking-widest pt-4">
                   {currentClient.company || 'No Company'} • {currentClient.profile.jobTitle || 'No Title'}
                </div>
                {/* Note Preview */}
                {currentClient.notes && currentClient.notes.length > 0 && (
                   <div className="mt-6 p-4 bg-yellow-50 text-yellow-800 text-xs text-left rounded-xl border border-yellow-100 italic">
                      "{(currentClient.notes[0].content || '').substring(0, 100)}..."
                   </div>
                )}
             </div>

             {/* CONTROLS */}
             <div className="grid grid-cols-4 divide-x divide-slate-100 border-t border-slate-100">
                <button 
                   onClick={() => handleOutcome('answered')}
                   className="p-6 hover:bg-emerald-50 text-emerald-600 font-bold text-sm uppercase tracking-wider transition-colors flex flex-col items-center gap-2"
                >
                   <span className="text-2xl">📞</span> Picked Up
                </button>
                <button 
                   onClick={() => handleOutcome('no_answer')}
                   className="p-6 hover:bg-slate-50 text-slate-600 font-bold text-sm uppercase tracking-wider transition-colors flex flex-col items-center gap-2"
                >
                   <span className="text-2xl">📵</span> No Answer
                   <span className="text-[9px] text-slate-400 font-normal normal-case">Move to Next NPU</span>
                </button>
                <button 
                   onClick={() => handleOutcome('bad_number')}
                   className="p-6 hover:bg-red-50 text-red-600 font-bold text-sm uppercase tracking-wider transition-colors flex flex-col items-center gap-2"
                >
                   <span className="text-2xl">🗑</span> Dead Lead
                </button>
                <button 
                   onClick={() => handleOutcome('skip')}
                   className="p-6 hover:bg-gray-50 text-gray-400 font-bold text-sm uppercase tracking-wider transition-colors flex flex-col items-center gap-2"
                >
                   <span className="text-2xl">⏭</span> Skip
                </button>
             </div>
          </div>

          <div className="text-center">
             <button onClick={onClose} className="text-slate-500 text-xs font-bold hover:text-white transition-colors uppercase tracking-widest">End Session</button>
          </div>
       </div>
    </div>
  );
};

export default CallSessionModal;
