import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { chatWithFinancialContext } from '../../lib/gemini';
import { Client, ChatMessage } from '../../types';
import { useAi } from '../../contexts/AiContext';
import { useClient } from '../../contexts/ClientContext';
import { aiLearning } from '../../lib/db/aiLearning';

interface AiAssistantProps {
  currentClient: Client | null;
}

const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

function base64ToUint8Array(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(data: Uint8Array, sampleRate: number = 24000) {
  const dataInt16 = new Int16Array(data.buffer);
  const float32Data = new Float32Array(dataInt16.length);
  for (let i = 0; i < dataInt16.length; i++) {
    float32Data[i] = dataInt16[i] / 32768.0;
  }
  const buffer = audioContext.createBuffer(1, float32Data.length, sampleRate);
  buffer.getChannelData(0).set(float32Data);
  return buffer;
}

const DEFAULT_WELCOME: ChatMessage = { role: 'model', text: 'Hello! I am Sproutly AI. I learn from your feedback. Ask me anything about this client or financial strategy.' };

const AiAssistant: React.FC<AiAssistantProps> = ({ currentClient }) => {
  const { isOpen, toggleAi, activePrompt, clearPrompt } = useAi();
  const { setChatHistory } = useClient(); 
  
  const [messages, setMessages] = useState<ChatMessage[]>([DEFAULT_WELCOME]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [useDeepReasoning, setUseDeepReasoning] = useState(false); 
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  
  const audioQueueRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [contextInjection, setContextInjection] = useState('');
  const lastNoteCount = useRef<number>(0);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isOpen]);

  // Load brain
  useEffect(() => {
    if (isOpen) {
        aiLearning.getKnowledge().then(setContextInjection);
    }
  }, [isOpen]);

  // Handle active client sync and proactive refresh
  useEffect(() => {
    if (currentClient?.id) {
       // Refresh history from persisted store
       setMessages(currentClient.chatHistory?.length ? currentClient.chatHistory : [DEFAULT_WELCOME]);
       
       // PROACTIVE SYNC: Detect new action logs
       const currentNotes = currentClient.notes?.length || 0;
       if (currentNotes > lastNoteCount.current && lastNoteCount.current > 0) {
           const latest = currentClient.notes?.[0];
           if (latest && (latest.content.includes('Call') || latest.content.includes('Calendar') || latest.content.includes('WhatsApp'))) {
               handleSend(`I've just logged this activity: "${latest.content}". Based on this update and the client's profile, what should be my immediate next focus or talking points for follow-up?`);
           }
       }
       lastNoteCount.current = currentNotes;
    } else {
       setMessages([DEFAULT_WELCOME]); 
       lastNoteCount.current = 0;
    }
  }, [currentClient?.id, currentClient?.chatHistory, currentClient?.notes?.length]); 

  useEffect(() => {
    if (activePrompt && isOpen && !isThinking && !isLiveActive) {
      handleSend(activePrompt);
      clearPrompt();
    }
  }, [activePrompt, isOpen]);

  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim()) return;
    
    setInput('');
    const userMsg: ChatMessage = { role: 'user', text: textToSend };
    const newHistory = [...messages, userMsg];
    
    setMessages(newHistory);
    setIsThinking(true);
    
    try {
      const responseText = await chatWithFinancialContext(newHistory, textToSend, currentClient || {}, useDeepReasoning);
      const modelMsg: ChatMessage = { role: 'model', text: responseText || 'Insight unavailable.' };
      const finalHistory = [...newHistory, modelMsg];
      setMessages(finalHistory);
      if (currentClient) setChatHistory(finalHistory);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'model', text: 'Error communicating with reasoning core.' }]);
    } finally {
      setIsThinking(false);
    }
  };

  const startLiveSession = async () => {
    if (isLiveActive) return;
    try {
      setIsLiveActive(true);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const inputContext = new AudioContext({ sampleRate: 16000 });
      const source = inputContext.createMediaStreamSource(stream);
      const processor = inputContext.createScriptProcessor(4096, 1, 1);

      const sessionPromise = ai.live.connect({
         model: 'gemini-2.5-flash-native-audio-preview-12-2025',
         config: { responseModalities: [Modality.AUDIO], systemInstruction: `Sproutly AI. ${contextInjection}. Focus on: ${currentClient?.profile?.name || 'General'}` },
         callbacks: {
            onmessage: async (msg: LiveServerMessage) => {
               const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
               if (audioData) {
                  const buffer = await decodeAudioData(base64ToUint8Array(audioData));
                  const node = audioContext.createBufferSource();
                  node.buffer = buffer; node.connect(audioContext.destination);
                  const startTime = Math.max(audioContext.currentTime, audioQueueRef.current);
                  node.start(startTime); audioQueueRef.current = startTime + buffer.duration;
               }
            },
            onclose: () => { setIsLiveActive(false); stream.getTracks().forEach(t => t.stop()); }
         }
      });

      processor.onaudioprocess = (e) => {
         const inputData = e.inputBuffer.getChannelData(0);
         sessionPromise.then((session) => {
            const int16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
            let binary = '';
            const bytes = new Uint8Array(int16.buffer);
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            session.sendRealtimeInput({ media: { mimeType: 'audio/pcm;rate=16000', data: btoa(binary) } });
         });
      };
      source.connect(processor); processor.connect(inputContext.destination);
    } catch (e) { setIsLiveActive(false); }
  };

  if (!isOpen) return (
    <button onClick={toggleAi} className="fixed bottom-6 right-6 z-50 p-4 rounded-full shadow-2xl transition-all hover:scale-105 bg-indigo-600 text-white font-bold border-2 border-white">
      ✨
    </button>
  );

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[400px] h-[500px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-fade-in-up">
      <div className={`p-4 ${isLiveActive ? 'bg-indigo-600' : 'bg-slate-900'} text-white`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>{isLiveActive ? '🎙️' : '🧠'}</span>
            <div>
                <h3 className="font-bold text-sm m-0">Sproutly AI</h3>
                <p className="text-[9px] uppercase tracking-widest text-indigo-300">{currentClient?.profile?.name || 'Global Mode'}</p>
            </div>
          </div>
          <button onClick={toggleAi}>✕</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-3">
         {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
               <div className={`max-w-[85%] p-3 rounded-xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-800 border border-gray-200'}`}>
                   {msg.text}
               </div>
            </div>
         ))}
         {isThinking && <div className="text-xs text-slate-400 animate-pulse">Thinking...</div>}
         <div ref={messagesEndRef} />
      </div>

      <div className="p-3 bg-white border-t">
         <div className="flex items-center gap-2">
            <button onClick={startLiveSession} className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">🎙️</button>
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} className="flex-1 p-2.5 bg-gray-100 rounded-xl text-sm outline-none" placeholder="Ask Sproutly..." />
         </div>
      </div>
    </div>
  );
};

export default AiAssistant;