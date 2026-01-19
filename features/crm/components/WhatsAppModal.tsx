import React, { useState, useEffect } from 'react';
import { Client, WhatsAppTemplate } from '../../../types';
import { interpolateTemplate } from '../../../lib/templates';

interface WhatsAppModalProps {
  client: Client;
  templates: WhatsAppTemplate[]; // Receive templates as prop
  onClose: () => void;
  onSend?: (templateLabel: string, messageBody: string) => void;
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({ client, templates, onClose, onSend }) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id || 'custom');
  const [message, setMessage] = useState('');

  // Update message when template or client changes
  useEffect(() => {
    if (selectedTemplateId === 'custom') {
        if (message === '') setMessage(''); // Only clear if empty to prevent overwrite when switching back from custom
        return;
    }

    const template = templates.find(t => t.id === selectedTemplateId);
    if (template) {
      let content = template.content || '';
      
      const name = client.name || client.profile?.name || '';
      const apptDate = client.firstApptDate ? new Date(client.firstApptDate) : null;
      
      const dateStr = apptDate ? apptDate.toISOString() : '';
      const timeStr = apptDate ? apptDate.toTimeString().split(' ')[0].substring(0, 5) : '';

      const text = interpolateTemplate(content, name, dateStr, timeStr);
      
      setMessage(text);
    }
  }, [selectedTemplateId, client, templates]);

  const handleSend = () => {
    const phoneProp = client.phone || client.profile?.phone || '';
    const phoneNumber = phoneProp.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    
    if (onSend) {
        const tpl = templates.find(t => t.id === selectedTemplateId);
        onSend(tpl ? tpl.label : 'Custom Message', message);
    }

    // Delay to allow state propagation before tab switch
    setTimeout(() => {
        window.open(url, '_blank');
        onClose();
    }, 200);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="bg-[#25D366] p-4 flex justify-between items-center">
            <h3 className="font-bold text-white flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                WhatsApp Message
            </h3>
            <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
        
        <div className="p-6 space-y-4">
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Select Protocol</label>
                <select 
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                    {templates.map(t => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                    <option value="custom">Custom Message</option>
                </select>
            </div>

            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Message Preview</label>
                <textarea 
                    value={message}
                    onChange={(e) => { setMessage(e.target.value); setSelectedTemplateId('custom'); }}
                    className="w-full h-40 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm leading-relaxed focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                    placeholder="Type your message here..."
                />
            </div>

            <button 
                onClick={handleSend}
                className="w-full py-3 bg-[#25D366] hover:bg-[#20b858] text-white font-bold rounded-xl shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-2"
            >
                <span>🚀</span> Launch WhatsApp
            </button>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppModal;