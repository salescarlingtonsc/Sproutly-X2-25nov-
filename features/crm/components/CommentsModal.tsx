
import React, { useState } from 'react';
import { Client } from '../../../types';

interface CommentsModalProps {
  client: Client;
  onClose: () => void;
  onAddNote: (note: string) => void;
}

export const CommentsModal: React.FC<CommentsModalProps> = ({ client, onClose, onAddNote }) => {
  const [note, setNote] = useState('');

  const handleSubmit = () => {
    if (!note.trim()) return;
    onAddNote(note);
    setNote('');
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
           <h3 className="font-bold text-slate-800">Client Log: {client.name}</h3>
           <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
           {(client.notes || []).map((n: any) => (
              <div key={n.id} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm text-xs">
                 <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-slate-700">{n.author}</span>
                    <span className="text-[10px] text-slate-400">{new Date(n.date).toLocaleString()}</span>
                 </div>
                 <p className="text-slate-600 leading-relaxed">{n.content}</p>
              </div>
           ))}
           {(!client.notes || client.notes.length === 0) && <div className="text-center text-xs text-slate-400 italic py-10">No logs yet.</div>}
        </div>

        <div className="p-4 border-t border-slate-100 bg-white">
           <textarea 
              className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition-colors resize-none mb-2"
              rows={3}
              placeholder="Add a new note..."
              value={note}
              onChange={e => setNote(e.target.value)}
           />
           <button onClick={handleSubmit} disabled={!note.trim()} className="w-full py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors disabled:opacity-50">Add Log</button>
        </div>
      </div>
    </div>
  );
};
