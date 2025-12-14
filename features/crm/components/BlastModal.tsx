
import React from 'react';

interface BlastModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  blastTopic: string;
  setBlastTopic: (val: string) => void;
  blastMessage: string;
  setBlastMessage: (val: string) => void;
  isGeneratingBlast: boolean;
  onGenerateAI: () => void;
  generatedLinks: {name: string, url: string}[];
  onGenerateLinks: () => void;
}

const BlastModal: React.FC<BlastModalProps> = ({ 
  isOpen, onClose, selectedCount, blastTopic, setBlastTopic, 
  blastMessage, setBlastMessage, isGeneratingBlast, onGenerateAI, 
  generatedLinks, onGenerateLinks 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-fade-in-up">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-6 text-white">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <span className="text-2xl">💬</span> Smart Blast Engine
          </h3>
          <p className="text-emerald-100 text-xs mt-1">Generating personalized links for {selectedCount} clients.</p>
        </div>
        
        <div className="p-6">
          {generatedLinks.length === 0 ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Message Topic (for AI)</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    className="flex-1 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="e.g. CPF Rate Changes, Market Update..."
                    value={blastTopic}
                    onChange={(e) => setBlastTopic(e.target.value)}
                  />
                  <button 
                    onClick={onGenerateAI}
                    disabled={!blastTopic || isGeneratingBlast}
                    className="px-3 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold hover:bg-purple-200 transition-colors"
                  >
                    {isGeneratingBlast ? '...' : '✨ Auto-Write'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Message Template</label>
                <textarea 
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none h-32 resize-none"
                  value={blastMessage}
                  onChange={(e) => setBlastMessage(e.target.value)}
                  placeholder="Hi {name}, checking in on your portfolio..."
                />
                <p className="text-[10px] text-gray-400 mt-2">Tip: Use <strong>{'{name}'}</strong> to auto-insert client's first name.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-3 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
                <button 
                  onClick={onGenerateLinks} 
                  disabled={!blastMessage}
                  className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-lg hover:bg-slate-800 transition-all disabled:opacity-50"
                >
                  🚀 Generate Links
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl text-center">
                <div className="text-emerald-600 font-bold text-lg mb-1">Ready to Launch</div>
                <p className="text-xs text-emerald-800">Click each link to open WhatsApp Web instantly.</p>
              </div>
              
              <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {generatedLinks.map((link, i) => (
                  <a 
                    key={i} 
                    href={link.url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl hover:border-emerald-400 hover:shadow-md transition-all group"
                    onClick={(e) => (e.currentTarget.style.opacity = '0.5')}
                  >
                    <span className="text-sm font-bold text-gray-700">{link.name}</span>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      Send ➤
                    </span>
                  </a>
                ))}
              </div>
              
              <button onClick={onClose} className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-colors">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BlastModal;
