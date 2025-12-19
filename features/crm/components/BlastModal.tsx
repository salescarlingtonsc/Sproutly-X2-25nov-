
import React from 'react';
import Button from '../../../components/ui/Button';

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
    <div className="fixed inset-0 bg-slate-900/10 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-slate-900 p-8 text-white relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>
          <h3 className="text-xl font-black flex items-center gap-3 relative z-10">
            <span className="text-2xl">💬</span> Smart Outreach
          </h3>
          <p className="text-slate-400 text-xs mt-2 relative z-10 font-medium">Batch messaging optimized for {selectedCount} profile(s).</p>
        </div>
        
        <div className="p-8">
          {generatedLinks.length === 0 ? (
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Goal of Outreach</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    className="flex-1 px-4 py-2.5 bg-slate-50 border-transparent border-2 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-100 outline-none transition-all placeholder-slate-300"
                    placeholder="e.g. Market update, Annual Review"
                    value={blastTopic}
                    onChange={(e) => setBlastTopic(e.target.value)}
                  />
                  <Button 
                    variant="ghost" 
                    onClick={onGenerateAI}
                    isLoading={isGeneratingBlast}
                    className="whitespace-nowrap"
                  >
                    ✨ Sproutly Draft
                  </Button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Message Content</label>
                <textarea 
                  className="w-full p-4 bg-slate-50 border-transparent border-2 rounded-2xl text-sm font-medium focus:bg-white focus:border-indigo-100 outline-none h-40 resize-none transition-all"
                  value={blastMessage}
                  onChange={(e) => setBlastMessage(e.target.value)}
                  placeholder="Hi {name}, checking in..."
                />
              </div>
              <div className="flex gap-4 pt-2">
                <Button variant="ghost" className="flex-1" onClick={onClose}>Discard</Button>
                <Button variant="primary" className="flex-1" onClick={onGenerateLinks} disabled={!blastMessage} leftIcon="🚀">Confirm Batch</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl text-center">
                <div className="text-emerald-700 font-black text-lg mb-1 uppercase tracking-tighter">Ready for delivery</div>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {generatedLinks.map((link, i) => (
                  <a key={i} href={link.url} target="_blank" rel="noreferrer" className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl hover:border-emerald-500 hover:shadow-md transition-all group" onClick={(e) => (e.currentTarget.style.opacity = '0.4')}>
                    <span className="text-sm font-black text-slate-700">{link.name}</span>
                    <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full group-hover:bg-emerald-600 group-hover:text-white transition-all uppercase tracking-widest">Launch ➤</span>
                  </a>
                ))}
              </div>
              <Button variant="secondary" className="w-full" onClick={onClose}>Finish Batch</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BlastModal;
