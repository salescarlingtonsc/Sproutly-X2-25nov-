import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { chatWithFinancialContext } from '../../lib/gemini';
import { Client } from '../../types';
import { useAi } from '../../contexts/AiContext';

interface AiAssistantProps {
  currentClient: Client | null;
}

interface Message {
  role: 'user' | 'model';
  text: string;
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

const AiAssistant: React.FC<AiAssistantProps> = ({ currentClient }) => {
  const { isOpen, toggleAi, activePrompt, clearPrompt } = useAi();
  
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'Hello! I am your Sproutly Co-Pilot. I have analyzed this profile. Request specific calculations or strategic insights.' }
  ]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [useLite, setUseLite] = useState(false); 
  
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const audioQueueRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isOpen]);

  useEffect(() => {
    if (activePrompt && isOpen && !isThinking && !isLiveActive) {
      handleSend(activePrompt);
      clearPrompt();
    }
  }, [activePrompt, isOpen]);

  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim()) return;
    if (!currentClient) {
      setMessages(prev => [...prev, { role: 'user', text: textToSend }, { role: 'model', text: 'Please load a profile for Sproutly insights.' }]);
      setInput('');
      return;
    }
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: textToSend }]);
    setIsThinking(true);
    try {
      const response = await chatWithFinancialContext(messages, textToSend, currentClient, useLite);
      setMessages(prev => [...prev, { role: 'model', text: response || 'Insight unavailable.' }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'model', text: 'Sproutly services are currently unavailable.' }]);
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

      /* Fix: Rely solely on sessionPromise resolves to send realtime input as per guidelines */
      const sessionPromise = ai.live.connect({
         model: 'gemini-2.5-flash-native-audio-preview-09-2025',
         config: { 
            responseModalities: [Modality.AUDIO], 
            systemInstruction: `You are Sproutly Co-Pilot.` 
         },
         callbacks: {
            onopen: () => {
               console.debug('Live API session initialized');
            },
            onmessage: async (msg: LiveServerMessage) => {
               const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
               if (audioData) {
                  const bytes = base64ToUint8Array(audioData);
                  const buffer = await decodeAudioData(bytes);
                  const source = audioContext.createBufferSource();
                  source.buffer = buffer; source.connect(audioContext.destination);
                  const startTime = Math.max(audioContext.currentTime, audioQueueRef.current);
                  source.start(startTime); audioQueueRef.current = startTime + buffer.duration;
               }
            },
            onerror: (e: any) => {
               console.error('Live API connection error:', e);
               setIsLiveActive(false);
            },
            onclose: () => { 
               setIsLiveActive(false); 
               setIsMicOn(false); 
               stream.getTracks().forEach(t => t.stop()); 
               inputContext.close(); 
            }
         }
      });

      processor.onaudioprocess = (e) => {
         const inputData = e.inputBuffer.getChannelData(0);
         let sum = 0;
         for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
         setVolumeLevel(Math.min(100, Math.sqrt(sum / inputData.length) * 500));
         
         /* Fix: Use sessionPromise to ensure data is streamed only after connection resolves, preventing stale closures */
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
      setIsMicOn(true);
    } catch (e) { setIsLiveActive(false); }
  };

  if (!isOpen) return (
    <button onClick={toggleAi} className="fixed bottom-6 right-6 z-50 p-4 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 flex items-center justify-center border-2 border-white bg-indigo-600 bg-[conic-gradient(at_top_right,_var(--tw-gradient-stops))] from-indigo-500 via-purple-500 to-indigo-500">
      <span className="text-2xl text-white font-bold">✨</span>
    </button>
  );

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[350px] sm:w-[400px] h-[500px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-fade-in-up">
      <div className={`p-4 transition-colors duration-500 ${isLiveActive ? 'bg-indigo-600' : 'bg-slate-900'}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{isLiveActive ? '🎙️' : '🧠'}</span>
            <h3 className="text-white font-bold text-sm m-0">{isLiveActive ? 'Sproutly Voice' : 'Sproutly Co-Pilot'}</h3>
          </div>
          <button onClick={toggleAi} className="text-slate-400 hover:text-white">✕</button>
        </div>
        {!isLiveActive && (
           <div className="flex bg-slate-800 p-1 rounded-lg">
              <button onClick={() => setUseLite(false)} className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-all ${!useLite ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>🌌 Quantum Analysis</button>
              <button onClick={() => setUseLite(true)} className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-all ${useLite ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>⚡ Immediate Insight</button>
           </div>
        )}
      </div>

      {isLiveActive ? (
         <div className="flex-1 bg-slate-900 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute rounded-full bg-indigo-500/20 blur-3xl transition-all duration-100" style={{ width: `${volumeLevel * 4 + 100}px`, height: `${volumeLevel * 4 + 100}px` }}></div>
            <p className="text-white font-bold mb-2">Sproutly is listening...</p>
            <button onClick={() => window.location.reload()} className="absolute bottom-8 px-6 py-2 bg-white text-indigo-600 rounded-full font-bold text-xs hover:bg-gray-100 transition-colors shadow-lg">End Session</button>
         </div>
      ) : (
         <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-3">
            {messages.map((msg, idx) => (
               <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3 rounded-xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none shadow-sm'}`}>{msg.text}</div>
               </div>
            ))}
            {isThinking && (
               <div className="flex justify-start">
                  <div className="bg-white text-gray-500 border border-gray-200 p-3 rounded-xl rounded-bl-none text-xs animate-pulse">{useLite ? '⚡ Processing...' : '🤔 Exploring logic...'}</div>
               </div>
            )}
            <div ref={messagesEndRef} />
         </div>
      )}

      {!isLiveActive && (
         <div className="p-3 bg-white border-t border-gray-200">
            <div className="relative flex items-center gap-2">
               <button onClick={startLiveSession} className="p-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors flex-shrink-0">🎙️</button>
               <div className="relative flex-1">
                  <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder={currentClient ? "Ask Sproutly..." : "Load profile..."} disabled={!currentClient || isThinking} className="w-full pl-4 pr-10 py-3 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                  <button onClick={() => handleSend()} disabled={!input.trim() || !currentClient || isThinking} className={`absolute right-2 top-2 p-1.5 text-white rounded-lg disabled:opacity-50 transition-colors ${useLite ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A2.001 2.001 0 005.694 10a2.001 2.001 0 00-1.999 1.836l-1.415 4.925a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" /></svg></button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default AiAssistant;
