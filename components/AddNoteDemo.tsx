
import React, { useState } from 'react';
import { saveNote } from '../lib/sync';
import Button from './ui/Button';

export default function AddNoteDemo() {
  const [text, setText] = useState('');

  const handleSave = () => {
    if (text.trim()) {
      // Create a payload that matches the 'activities' table schema
      const note = { 
        title: 'User Note', 
        message: text,
        type: 'user_note',
        created_at: new Date().toISOString()
      };
      
      saveNote(note);
      setText('');
    }
  };

  return (
    <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
      <h3 className="text-sm font-bold text-slate-800">Sync-Safe Activity Logger</h3>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Log an activity..."
          className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
        />
        <Button variant="primary" size="sm" onClick={handleSave}>
          Save Activity
        </Button>
      </div>
      <p className="text-[10px] text-slate-400">
        If you switch tabs or lose connection, this entry will be buffered in LocalStorage and re-synced automatically when you return.
      </p>
    </div>
  );
}
