
import React, { useState, useEffect, useRef } from 'react';
import { Client } from '../../../types';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { generateAutomatedPitch } from '../../../lib/gemini';
import { useToast } from '../../../contexts/ToastContext';
import { isAbortError } from '../../../lib/helpers';

interface ScriptGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client;
}

const ScriptGeneratorModal: React.FC<ScriptGeneratorModalProps> = ({ isOpen, onClose, client }) => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [scriptData, setScriptData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    if (isOpen) {
      // Reset state on open
      setScriptData(null);
      setError(null);
      setLoading(true);
      generateScript();
    }
    return () => { isMountedRef.current = false; };
  }, [isOpen]);

  const generateScript = async () => {
    if (!isMountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const data = await generateAutomatedPitch(client);
      if (isMountedRef.current) {
        if (!data) throw new Error("Received empty response from AI.");
        setScriptData(data);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        // Suppress abort errors from UI error state
        if (isAbortError(err)) {
            console.debug('Script generation aborted.');
            setLoading(false);
            return;
        }

        console.error("Script Gen Error:", err);
        // Normalize error message for UX
        let msg = err.message || "Failed to generate script protocol.";
        
        if (msg.includes('fetch failed')) {
            msg = "Network connection failed. Please check your internet.";
        }
        
        setError(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Strategic Communication Protocol"
      footer={
        <div className="flex gap-2 w-full justify-between">
          <Button variant="ghost" onClick={generateScript} isLoading={loading} disabled={loading}>
            ↻ Regenerate Strategy
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-6 animate-fade-in">
        {loading ? (
          <div className="py-12 text-center space-y-4">
            <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-800">Constructing Narrative...</h3>
              <p className="text-xs text-slate-500">Analyzing psychological profile & deal momentum.</p>
            </div>
          </div>
        ) : error ? (
          <div className="py-10 text-center space-y-4 bg-red-50 rounded-xl border border-red-100 p-6">
             <div className="text-red-500 text-3xl">⚠️</div>
             <h3 className="text-sm font-bold text-red-800">Generation Failed</h3>
             <p className="text-xs text-red-600">{error}</p>
             <Button variant="secondary" onClick={generateScript} size="sm" className="mt-2">Try Again</Button>
          </div>
        ) : scriptData ? (
          <>
            {/* OPENING HOOK */}
            <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100 group relative hover:shadow-sm transition-all">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">The Opening Hook</h4>
                <button 
                  onClick={() => copyToClipboard(scriptData.opening_hook, 'Hook')}
                  className="opacity-0 group-hover:opacity-100 text-[10px] bg-white border border-indigo-200 text-indigo-600 px-2 py-1 rounded font-bold transition-all hover:bg-indigo-600 hover:text-white"
                >
                  Copy
                </button>
              </div>
              <p className="text-sm text-slate-700 font-medium leading-relaxed">
                "{scriptData.opening_hook}"
              </p>
            </div>

            {/* MESSAGE DRAFT */}
            <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100 group relative hover:shadow-sm transition-all">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">WhatsApp / Text Draft</h4>
                <button 
                  onClick={() => copyToClipboard(scriptData.whatsapp_draft, 'Message')}
                  className="opacity-0 group-hover:opacity-100 text-[10px] bg-white border border-emerald-200 text-emerald-600 px-2 py-1 rounded font-bold transition-all hover:bg-emerald-600 hover:text-white"
                >
                  Copy
                </button>
              </div>
              <p className="text-sm text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">
                {scriptData.whatsapp_draft}
              </p>
            </div>

            {/* OBJECTION HANDLING */}
            {scriptData.objection_rebuttal && (
              <div className="bg-rose-50/50 p-5 rounded-2xl border border-rose-100 group relative hover:shadow-sm transition-all">
                <div className="flex justify-between items-start mb-3">
                  <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest mt-1">Defensive Maneuver</h4>
                  <div className="text-right">
                    <span className="text-[9px] font-bold text-rose-300 uppercase block mb-1">If they say:</span>
                    <span className="text-xs font-bold text-rose-800 bg-white/50 px-2 py-1 rounded border border-rose-200 block">
                      "{scriptData.objection_rebuttal.objection}"
                    </span>
                  </div>
                </div>
                <div className="relative">
                   <div className="w-0.5 h-full bg-rose-200 absolute left-0 top-0 rounded-full"></div>
                   <p className="pl-3 text-sm text-slate-700 font-medium leading-relaxed">
                     "{scriptData.objection_rebuttal.script}"
                   </p>
                </div>
                <button 
                  onClick={() => copyToClipboard(scriptData.objection_rebuttal.script, 'Rebuttal')}
                  className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 text-[10px] bg-white border border-rose-200 text-rose-600 px-2 py-1 rounded font-bold transition-all hover:bg-rose-600 hover:text-white"
                >
                  Copy Rebuttal
                </button>
              </div>
            )}

            {/* CLOSING STRATEGY */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
               <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Closing Strategy</h4>
               <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  {scriptData.closing_strategy}
               </p>
            </div>
          </>
        ) : (
          <div className="text-center text-slate-400 text-sm py-8">
            Unable to generate protocol. Please try again.
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ScriptGeneratorModal;
