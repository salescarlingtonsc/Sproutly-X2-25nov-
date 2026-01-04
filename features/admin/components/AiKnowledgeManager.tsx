import React, { useState, useEffect } from 'react';
import { aiLearning, KnowledgeItem } from '../../../lib/db/aiLearning';
import Button from '../../../components/ui/Button';
import { useToast } from '../../../contexts/ToastContext';

export const AiKnowledgeManager: React.FC = () => {
  const toast = useToast();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Editor State
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formQuestion, setFormQuestion] = useState('');
  const [formAnswer, setFormAnswer] = useState('');
  const [formCategory, setFormCategory] = useState('general');

  useEffect(() => {
    loadKnowledge();
  }, []);

  const loadKnowledge = async () => {
    setLoading(true);
    const data = await aiLearning.getAllKnowledge();
    setItems(data);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!formQuestion || !formAnswer) {
      toast.error("Question and Answer are required.");
      return;
    }

    try {
      if (editId) {
        await aiLearning.updateKnowledge(editId, { 
          question: formQuestion, 
          answer: formAnswer, 
          category: formCategory 
        });
        toast.success("Knowledge updated.");
      } else {
        await aiLearning.train(formQuestion, formAnswer, formCategory);
        toast.success("New knowledge added to Sproutly AI.");
      }
      resetForm();
      loadKnowledge();
    } catch (e: any) {
      toast.error("Failed to save: " + e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Delete this knowledge item? Sproutly will no longer know this.")) {
      try {
        await aiLearning.deleteKnowledge(id);
        toast.success("Item deleted.");
        loadKnowledge();
      } catch (e: any) {
        toast.error("Delete failed: " + e.message);
      }
    }
  };

  const handleEdit = (item: KnowledgeItem) => {
    setEditId(item.id);
    setFormQuestion(item.question);
    setFormAnswer(item.answer);
    setFormCategory(item.category);
    setIsEditing(true);
  };

  const resetForm = () => {
    setIsEditing(false);
    setEditId(null);
    setFormQuestion('');
    setFormAnswer('');
    setFormCategory('general');
  };

  const filteredItems = items.filter(i => 
    i.question.toLowerCase().includes(searchTerm.toLowerCase()) || 
    i.answer.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-8 bg-slate-50 min-h-full animate-fade-in">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Sproutly AI Brain</h1>
            <p className="text-slate-500">Manage the Verified Knowledge Base used by the AI to answer advisor queries.</p>
          </div>
          <Button variant="primary" onClick={() => { resetForm(); setIsEditing(true); }} leftIcon="🧠">
            Teach New Concept
          </Button>
        </div>

        {isEditing && (
          <div className="bg-white rounded-xl shadow-lg border border-indigo-100 p-6 mb-8 animate-slide-in-from-top-4">
            <h3 className="font-bold text-indigo-900 mb-4">{editId ? 'Edit Concept' : 'Teach New Concept'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Trigger Question / Topic</label>
                <input 
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-700"
                  placeholder="e.g. What is our strategy for medical underwriting?"
                  value={formQuestion}
                  onChange={e => setFormQuestion(e.target.value)}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Correct Answer / Protocol</label>
                    <textarea 
                      className="w-full p-3 h-32 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                      placeholder="e.g. Always declare pre-existing conditions. Use the X-15 form for..."
                      value={formAnswer}
                      onChange={e => setFormAnswer(e.target.value)}
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Category</label>
                    <select 
                       className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
                       value={formCategory}
                       onChange={e => setFormCategory(e.target.value)}
                    >
                       <option value="general">General</option>
                       <option value="product">Products</option>
                       <option value="compliance">Compliance</option>
                       <option value="sales_script">Sales Script</option>
                       <option value="objection">Objection Handling</option>
                    </select>
                    <div className="mt-4 text-[10px] text-slate-400 leading-relaxed">
                       <strong>Tip:</strong> Be specific. The AI uses this to "Ground" its answers. If you add a script here, the AI will use it when asked.
                    </div>
                 </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={resetForm}>Cancel</Button>
                <Button variant="accent" onClick={handleSave}>Save to Brain</Button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
           <div className="p-4 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50">
              <div className="relative flex-1">
                 <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
                 <input 
                    type="text" 
                    placeholder="Search knowledge base..." 
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-300 transition-all"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                 />
              </div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{filteredItems.length} Records</div>
           </div>

           <div className="max-h-[600px] overflow-y-auto">
              {loading ? (
                 <div className="p-12 text-center text-slate-400">Loading neural network...</div>
              ) : filteredItems.length === 0 ? (
                 <div className="p-12 text-center text-slate-400 italic">No knowledge found. Add some!</div>
              ) : (
                 <div className="divide-y divide-slate-100">
                    {filteredItems.map(item => (
                       <div key={item.id} className="p-6 hover:bg-slate-50 transition-colors group">
                          <div className="flex justify-between items-start mb-2">
                             <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                   item.category === 'sales_script' ? 'bg-emerald-100 text-emerald-700' :
                                   item.category === 'compliance' ? 'bg-red-100 text-red-700' :
                                   'bg-indigo-100 text-indigo-700'
                                }`}>
                                   {item.category.replace('_', ' ')}
                                </span>
                                <h3 className="font-bold text-slate-800 text-sm">{item.question}</h3>
                             </div>
                             <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleEdit(item)} className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                                <button onClick={() => handleDelete(item.id)} className="text-rose-600 hover:bg-rose-50 p-1.5 rounded"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                             </div>
                          </div>
                          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap pl-1 border-l-2 border-slate-200">
                             {item.answer}
                          </p>
                       </div>
                    ))}
                 </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};
