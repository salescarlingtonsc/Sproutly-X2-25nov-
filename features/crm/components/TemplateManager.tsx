import React, { useState } from 'react';
import { WhatsAppTemplate } from '../../../types';

interface TemplateManagerProps {
  templates: WhatsAppTemplate[];
  onUpdateTemplates: (templates: WhatsAppTemplate[]) => void;
}

export const TemplateManager: React.FC<TemplateManagerProps> = ({ templates, onUpdateTemplates }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<WhatsAppTemplate>({ id: '', label: '', content: '' });

  const handleEdit = (t: WhatsAppTemplate) => {
    setEditingId(t.id);
    setEditForm(t);
  };

  const handleCreate = () => {
    const newId = `tpl_${Date.now()}`;
    const newTpl = { id: newId, label: 'New Template', content: 'Hi {{name}}, ...' };
    setEditForm(newTpl);
    setEditingId(newId);
  };

  const handleSave = () => {
    if (!editForm.label || !editForm.content) return;
    
    const exists = templates.find(t => t.id === editForm.id);
    if (exists) {
        onUpdateTemplates(templates.map(t => t.id === editForm.id ? editForm : t));
    } else {
        onUpdateTemplates([...templates, editForm]);
    }
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this template?')) {
        onUpdateTemplates(templates.filter(t => t.id !== id));
        if (editingId === id) setEditingId(null);
    }
  };

  return (
    <div className="p-2 animate-fade-in">
       <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-end mb-6">
              <div>
                <h1 className="text-xl font-bold text-slate-800">Templates</h1>
                <p className="text-xs text-slate-500">Presave messages to speed up your workflow.</p>
              </div>
              <button 
                onClick={handleCreate}
                className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm transition-colors flex items-center gap-2"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                New
              </button>
          </div>

          <div className="grid grid-cols-1 gap-6">
              {/* List */}
              <div className="space-y-3">
                  {templates.map(t => (
                      <div 
                        key={t.id}
                        onClick={() => handleEdit(t)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${editingId === t.id ? 'bg-white border-emerald-500 shadow-md ring-1 ring-emerald-500' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}
                      >
                          <div className="flex justify-between items-start mb-1">
                             <h3 className="font-semibold text-slate-800 text-xs">{t.label}</h3>
                             {editingId === t.id && (
                                <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} className="text-rose-500 hover:text-rose-700 text-[10px] font-bold">Delete</button>
                             )}
                          </div>
                          <p className="text-[10px] text-slate-500 line-clamp-2">{t.content}</p>
                      </div>
                  ))}
                  {templates.length === 0 && (
                      <div className="text-center p-8 text-slate-400 text-xs border-2 border-dashed border-slate-200 rounded-xl">
                          No templates yet. Create one!
                      </div>
                  )}
              </div>

              {/* Editor */}
              {editingId && (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sticky bottom-4 z-20">
                      <h2 className="font-bold text-slate-800 mb-4 text-sm flex justify-between items-center">
                          {templates.find(t => t.id === editingId) ? 'Edit Template' : 'New Template'}
                      </h2>
                      
                      <div className="space-y-3">
                          <div>
                              <input 
                                value={editForm.label}
                                onChange={e => setEditForm({...editForm, label: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                                placeholder="Template Name"
                              />
                          </div>

                          <div>
                              <textarea 
                                value={editForm.content}
                                onChange={e => setEditForm({...editForm, content: e.target.value})}
                                className="w-full h-32 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                                placeholder="Hi {{name}}, ..."
                              />
                              <div className="mt-2 text-[10px] text-slate-400">
                                  Use <code>{'{{name}}'}</code>, <code>{'{{time}}'}</code>, <code>{'{{advisor}}'}</code>
                              </div>
                          </div>
                          
                          <div className="flex justify-end gap-2 pt-2">
                              <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-medium">Cancel</button>
                              <button onClick={handleSave} className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-medium shadow-sm hover:bg-slate-800">Save</button>
                          </div>
                      </div>
                  </div>
              )}
          </div>
       </div>
    </div>
  );
};