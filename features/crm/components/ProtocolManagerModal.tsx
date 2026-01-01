
import React, { useState, useEffect } from 'react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { dbTemplates, DBTemplate } from '../../../lib/db/templates';
import { DEFAULT_TEMPLATES, interpolateTemplate } from '../../../lib/templates';
import { useToast } from '../../../contexts/ToastContext';

interface ProtocolManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ProtocolManagerModal: React.FC<ProtocolManagerModalProps> = ({ isOpen, onClose }) => {
  const toast = useToast();
  const [templates, setTemplates] = useState<DBTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<Partial<DBTemplate> | null>(null);
  const [loading, setLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (isOpen) loadTemplates();
  }, [isOpen]);

  const loadTemplates = async () => {
    setLoading(true);
    const tpts = await dbTemplates.getTemplates();
    setTemplates(tpts.length > 0 ? tpts : DEFAULT_TEMPLATES.map(t => ({ id: t.id, label: t.label, content: t.content })));
    setLoading(false);
  };

  const handleSave = async () => {
    if (!editingTemplate?.label || !editingTemplate?.content) return;
    try {
      await dbTemplates.saveTemplate(editingTemplate);
      toast.success("Outreach protocol saved successfully.");
      setEditingTemplate(null);
      setShowGuide(false);
      loadTemplates();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this personal outreach protocol?")) return;
    try {
      await dbTemplates.deleteTemplate(id);
      toast.success("Protocol removed.");
      loadTemplates();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const insertExample = (text: string) => {
      setEditingTemplate(prev => ({...prev, content: text}));
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Personal Outreach Protocols"
      footer={<Button variant="ghost" onClick={onClose}>Close Manager</Button>}
    >
      <div className="space-y-6">
        {editingTemplate ? (
          <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-start">
               <h4 className="font-bold text-slate-800 text-sm">Editor</h4>
               <button 
                  onClick={() => setShowGuide(!showGuide)}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-2 ${showGuide ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'}`}
               >
                  <span>💡</span> {showGuide ? 'Hide Guide' : 'Template Architect Guide'}
               </button>
            </div>

            {/* GUIDE PANEL */}
            {showGuide && (
               <div className="bg-indigo-50/50 rounded-xl p-4 border border-indigo-100 space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div>
                     <h5 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Dynamic Variables</h5>
                     <div className="flex flex-wrap gap-2">
                        {['{name}', '{date}', '{time}', '{formatted_appt}', '{advisor}'].map(v => (
                           <code key={v} className="text-[10px] bg-white border border-indigo-100 px-1.5 py-0.5 rounded text-indigo-600 font-mono">{v}</code>
                        ))}
                     </div>
                  </div>
                  <div>
                     <h5 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Psychological Hooks (Click to Use)</h5>
                     <div className="space-y-2">
                        <button onClick={() => insertExample("Hi {name}, are you still interested in optimizing your portfolio, or should I close this file?")} className="block w-full text-left p-2 bg-white border border-indigo-100 rounded-lg hover:border-indigo-300 transition-all group">
                           <div className="text-[10px] font-bold text-slate-700 group-hover:text-indigo-700">The "Negative Reverse"</div>
                           <div className="text-[10px] text-slate-400 italic">"Are you still interested... or should I close this?"</div>
                        </button>
                        <button onClick={() => insertExample("Hi {name}, confirming our chat on {formatted_appt}. Here is the Zoom link: [Link]. Looking forward to showing you the projection.")} className="block w-full text-left p-2 bg-white border border-indigo-100 rounded-lg hover:border-indigo-300 transition-all group">
                           <div className="text-[10px] font-bold text-slate-700 group-hover:text-indigo-700">The "Value Bridge" Confirmation</div>
                           <div className="text-[10px] text-slate-400 italic">Confirm time + tease the value outcome.</div>
                        </button>
                        <button onClick={() => insertExample("Hi {name}, I saw the market shifted today and thought of our conversation. Do you have 2 mins for a quick update?")} className="block w-full text-left p-2 bg-white border border-indigo-100 rounded-lg hover:border-indigo-300 transition-all group">
                           <div className="text-[10px] font-bold text-slate-700 group-hover:text-indigo-700">The "Recency" Hook</div>
                           <div className="text-[10px] text-slate-400 italic"> leverage news/events to re-engage.</div>
                        </button>
                     </div>
                  </div>
               </div>
            )}

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Internal Label</label>
              <input 
                className="w-full p-4 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                value={editingTemplate.label}
                onChange={e => setEditingTemplate({...editingTemplate, label: e.target.value})}
                placeholder="e.g. Zoom Intro"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Message Template</label>
              <textarea 
                className="w-full h-40 p-4 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-medium focus:bg-white focus:border-indigo-500 outline-none transition-all resize-none"
                value={editingTemplate.content}
                onChange={e => setEditingTemplate({...editingTemplate, content: e.target.value})}
                placeholder="Hi {name}, checking in regarding..."
              />
              <div className="flex flex-wrap gap-2 mt-3">
                {['{name}', '{date}', '{formatted_appt}'].map(tag => (
                  <button 
                    key={tag} 
                    onClick={() => setEditingTemplate({...editingTemplate, content: (editingTemplate.content || '') + ' ' + tag})}
                    className="text-[9px] font-black bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-600 hover:text-white transition-all uppercase"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="p-4 bg-slate-900 rounded-2xl text-white">
              <label className="text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-2 block">Live Preview (Tan Ah Teck)</label>
              <p className="text-[11px] leading-relaxed italic opacity-80">
                "{interpolateTemplate(editingTemplate.content || '', 'Tan Ah Teck', new Date().toISOString(), '14:00')}"
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setEditingTemplate(null)}>Discard</Button>
              <Button variant="primary" className="flex-1" onClick={handleSave}>Confirm Protocol</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-2">
               <p className="text-xs text-slate-400 font-medium">Your customized WhatsApp templates for daily outreach.</p>
               <Button variant="primary" size="sm" onClick={() => setEditingTemplate({ label: '', content: '' })}>＋ New</Button>
            </div>
            
            <div className="max-h-80 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
              {templates.map(t => (
                <div key={t.id} className="bg-white border border-slate-100 p-4 rounded-2xl hover:border-indigo-200 transition-all group">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-1 rounded">{t.label}</span>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingTemplate(t)} className="text-slate-300 hover:text-indigo-600 p-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                      <button onClick={() => handleDelete(t.id)} className="text-slate-300 hover:text-red-500 p-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-2 italic font-medium">"{t.content}"</p>
                </div>
              ))}
              {templates.length === 0 && !loading && (
                <div className="py-12 text-center text-slate-300 italic text-xs">No personal protocols defined.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ProtocolManagerModal;
