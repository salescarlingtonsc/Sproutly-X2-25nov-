
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
    <div className="p-8 bg-slate-50 min-h-full animate-fade-in">
       <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-end mb-8">
              <div>
                <h1 className="text-2xl font-bold text-slate-800">WhatsApp Templates</h1>
                <p className="text-slate-500">Presave messages to speed up your workflow.</p>
              </div>
              <button 
                onClick={handleCreate}
                className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                New Template
              </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* List */}
              <div className="lg:col-span-1 space-y-3">
                  {templates.map(t => (
                      <div 
                        key={t.id}
                        onClick={() => handleEdit(t)}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${editingId === t.id ? 'bg-white border-emerald-500 shadow-md ring-1 ring-emerald-500' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}
                      >
                          <h3 className="font-semibold text-slate-800 text-sm mb-1">{t.label}</h3>
                          <p className="text-xs text-slate-500 line-clamp-2">{t.content}</p>
                      </div>
                  ))}
                  {templates.length === 0 && (
                      <div className="text-center p-8 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                          No templates yet. Create one!
                      </div>
                  )}
              </div>

              {/* Editor */}
              <div className="lg:col-span-2">
                  {editingId ? (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sticky top-6">
                          <h2 className="font-bold text-slate-800 mb-6 flex justify-between items-center">
                              {templates.find(t => t.id === editingId) ? 'Edit Template' : 'New Template'}
                              <button onClick={() => handleDelete(editingId)} className="text-rose-600 text-xs hover:underline">Delete</button>
                          </h2>
                          
                          <div className="space-y-4">
                              <div>
                                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Template Name</label>
                                  <input 
                                    value={editForm.label}
                                    onChange={e => setEditForm({...editForm, label: e.target.value})}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                    placeholder="e.g. Birthday Wish"
                                  />
                              </div>

                              <div>
                                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Message Content</label>
                                  <textarea 
                                    value={editForm.content}
                                    onChange={e => setEditForm({...editForm, content: e.target.value})}
                                    className="w-full h-40 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                                    placeholder="Hi {{name}}, ..."
                                  />
                                  <div className="mt-2 p-3 bg-blue-50 text-blue-800 text-xs rounded-lg border border-blue-100">
                                      <strong>Auto-Sync Variables:</strong>
                                      <ul className="mt-1 list-disc list-inside opacity-80">
                                          <li><code>{'{{name}}'}</code> - Client Name</li>
                                          <li><code>{'{{time}}'}</code> - Appointment Time</li>
                                          <li><code>{'{{advisor}}'}</code> - Your Name</li>
                                      </ul>
                                  </div>
                              </div>
                              
                              <div className="flex justify-end gap-3 pt-4">
                                  <button onClick={() => setEditingId(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium">Cancel</button>
                                  <button onClick={handleSave} className="px-6 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium shadow-sm hover:bg-slate-800">Save Template</button>
                              </div>
                          </div>
                      </div>
                  ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 p-12 bg-slate-50/50 rounded-xl border-2 border-dashed border-slate-200">
                          <svg className="w-12 h-12 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          <p>Select a template to edit or create a new one.</p>
                      </div>
                  )}
              </div>
          </div>
       </div>
    </div>
  );
};
