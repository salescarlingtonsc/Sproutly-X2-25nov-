
import React, { useState } from 'react';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import ToggleSwitch from '../../../components/ui/ToggleSwitch';
import { createFieldDefinition } from '../../../lib/db/dynamicFields';

interface ColumnPickerProps {
  allColumns: { id: string; label: string; }[];
  visibleColumnIds: Set<string>;
  onChange: (newSet: Set<string>) => void;
  onManageFields: () => void;
}

const ColumnPicker: React.FC<ColumnPickerProps> = ({ allColumns, visibleColumnIds, onChange, onManageFields }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAddingField, setIsAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<any>('text');
  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const toggleColumn = (id: string) => {
    const next = new Set(visibleColumnIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const handleCreateField = async () => {
     if (!newFieldName) return;
     setIsCreating(true);
     try {
        const key = newFieldName.toLowerCase().replace(/\s+/g, '_');
        await createFieldDefinition({ 
          key, 
          label: newFieldName, 
          type: newFieldType, 
          section: 'custom' 
        });
        onManageFields();
        setIsAddingField(false);
        setNewFieldName('');
     } catch (e) {
        alert("Failed to create attribute.");
     } finally {
        setIsCreating(false);
     }
  };

  const filtered = allColumns.filter(c => c.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="relative inline-block">
      <Button variant="ghost" size="sm" onClick={() => setIsOpen(!isOpen)} leftIcon="▦">Fields</Button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-3 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[1000] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-4 border-b border-slate-50 bg-slate-50/50">
              <input 
                className="w-full px-4 py-2 bg-white border-slate-200 border-2 rounded-xl text-[11px] font-bold outline-none focus:border-indigo-100 transition-all placeholder-slate-300"
                placeholder="Find attribute..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            
            <div className="max-h-[350px] overflow-y-auto p-2 custom-scrollbar">
               <div className="px-3 py-2 text-[9px] font-black text-slate-300 uppercase tracking-widest">Available Fields</div>
              {filtered.map((col) => (
                <label 
                  key={col.id} 
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-[11px] font-bold cursor-pointer transition-all ${visibleColumnIds.has(col.id) ? 'bg-indigo-50/60 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  <span>{col.label}</span>
                  <ToggleSwitch 
                    enabled={visibleColumnIds.has(col.id)} 
                    onChange={() => toggleColumn(col.id)} 
                    size="sm" 
                  />
                </label>
              ))}
            </div>

            <div className="p-3 border-t border-slate-50 bg-slate-50/50">
              <Button 
                 variant="ghost" 
                 size="sm" 
                 className="w-full text-indigo-600 font-black tracking-widest uppercase text-[9px] hover:bg-indigo-50" 
                 onClick={() => { setIsAddingField(true); setIsOpen(false); }}
              >
                 ＋ Custom Attribute
              </Button>
            </div>
          </div>
        </>
      )}

      <Modal 
        isOpen={isAddingField} 
        onClose={() => setIsAddingField(false)} 
        title="Add Data Attribute"
        footer={
           <>
              <Button variant="ghost" onClick={() => setIsAddingField(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreateField} isLoading={isCreating} disabled={!newFieldName}>Initialize</Button>
           </>
        }
      >
         <div className="space-y-6">
            <p className="text-xs text-slate-400 font-medium leading-relaxed">Define a new attribute to track across your client book. This will be available as a unique column in your workspace.</p>
            <div>
               <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Attribute Name</label>
               <input 
                  className="w-full p-4 bg-slate-50 border-transparent border-2 rounded-2xl text-sm font-bold text-slate-700 focus:bg-white focus:border-indigo-100 outline-none transition-all placeholder-slate-300 shadow-inner"
                  placeholder="e.g. Risk Appetite, Net Worth Tier"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  autoFocus
               />
            </div>
            <div>
               <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Data Archetype</label>
               <div className="grid grid-cols-2 gap-2">
                  {[
                    {id: 'text', label: 'Text String'}, 
                    {id: 'number', label: 'Numeric'}, 
                    {id: 'currency', label: 'Currency ($)'}, 
                    {id: 'date', label: 'Calendar Date'}
                  ].map(type => (
                     <button 
                        key={type.id} 
                        onClick={() => setNewFieldType(type.id)}
                        className={`p-3 rounded-xl text-[11px] font-bold border-2 transition-all text-left ${newFieldType === type.id ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100'}`}
                     >
                        {type.label}
                     </button>
                  ))}
               </div>
            </div>
         </div>
      </Modal>
    </div>
  );
};

export default ColumnPicker;
