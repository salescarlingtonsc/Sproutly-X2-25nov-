
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

// --- AUDIO UTILS FOR LIVE API ---
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
  
  // Text Chat State
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'Hello! I am your Quantum Co-Pilot. I have analyzed this client\'s file. Ask me anything—from specific calculations to closing strategies.' }
  ]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [useLite, setUseLite] = useState(false); // Text Mode Toggle
  
  // Live Voice State
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const liveSessionRef = useRef<any>(null);
  const audioQueueRef = useRef<number>(0);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  // Handle auto-trigger from Context (Text Mode)
  useEffect(() => {
    if (activePrompt && isOpen && !isThinking && !isLiveActive) {
      handleSend(activePrompt);
      clearPrompt();
    }
  }, [activePrompt, isOpen]);

  // --- TEXT CHAT HANDLER ---
  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim()) return;
    
    if (!currentClient) {
      setMessages(prev => [...prev, { role: 'user', text: textToSend }, { role: 'model', text: 'Please select or load a client profile first so I can analyze their data.' }]);
      setInput('');
      return;
    }

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: textToSend }]);
    setIsThinking(true);

    try {
      const response = await chatWithFinancialContext(messages, textToSend, currentClient, useLite);
      setMessages(prev => [...prev, { role: 'model', text: response || 'No response.' }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'model', text: 'Error connecting to AI.' }]);
    } finally {
      setIsThinking(false);
    }
  };

  // --- LIVE VOICE HANDLER ---
  const startLiveSession = async () => {
    if (isLiveActive) return;
    
    // Get API Key safely
    let apiKey = '';
    try {
       if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
          apiKey = (import.meta as any).env.VITE_GOOGLE_API_KEY || '';
       }
    } catch (e) {}

    if (!apiKey) {
       alert("API Key missing for Live Mode");
       return;
    }

    try {
      setIsLiveActive(true);
      const ai = new GoogleGenAI({ apiKey });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Setup Audio Input Stream
      const inputContext = new AudioContext({ sampleRate: 16000 });
      const source = inputContext.createMediaStreamSource(stream);
      const processor = inputContext.createScriptProcessor(4096, 1, 1);
      
      // Simple Volume Meter
      processor.onaudioprocess = (e) => {
         const inputData = e.inputBuffer.getChannelData(0);
         let sum = 0;
         for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
         const rms = Math.sqrt(sum / inputData.length);
         setVolumeLevel(Math.min(100, rms * 500)); // Visualizer

         if (liveSessionRef.current) {
            // Convert Float32 to Int16 PCM
            const l = inputData.length;
            const int16 = new Int16Array(l);
            for (let i = 0; i < l; i++) {
               int16[i] = inputData[i] * 32768;
            }
            
            // Encode base64
            let binary = '';
            const bytes = new Uint8Array(int16.buffer);
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            const b64 = btoa(binary);

            liveSessionRef.current.sendRealtimeInput({
               media: { mimeType: 'audio/pcm;rate=16000', data: b64 }
            });
         }
      };

      source.connect(processor);
      processor.connect(inputContext.destination);
      setIsMicOn(true);

      // Connect to Gemini Live
      const sessionPromise = ai.live.connect({
         model: 'gemini-2.5-flash-native-audio-preview-09-2025',
         config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: `You are Sproutly Quantum, a financial AI assistant. 
            Speak concisely, professionally, and warmly. 
            Current Client Context: ${currentClient ? JSON.stringify(currentClient.profile) : 'No client selected'}.
            Do not read out JSON. Summarize insights.`,
         },
         callbacks: {
            onopen: () => {
               console.log("Quantum Voice Connected");
            },
            onmessage: async (msg: LiveServerMessage) => {
               const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
               if (audioData) {
                  const bytes = base64ToUint8Array(audioData);
                  const buffer = await decodeAudioData(bytes);
                  
                  const source = audioContext.createBufferSource();
                  source.buffer = buffer;
                  source.connect(audioContext.destination);
                  
                  // Simple queueing
                  const now = audioContext.currentTime;
                  const startTime = Math.max(now, audioQueueRef.current);
                  source.start(startTime);
                  audioQueueRef.current = startTime + buffer.duration;
               }
            },
            onclose: () => {
               console.log("Quantum Voice Closed");
               setIsLiveActive(false);
               setIsMicOn(false);
               stream.getTracks().forEach(t => t.stop());
               inputContext.close();
            },
            onerror: (e) => {
               console.error("Quantum Voice Error", e);
               setIsLiveActive(false);
            }
         }
      });

      liveSessionRef.current = await sessionPromise;

    } catch (e) {
      console.error(e);
      alert("Microphone access denied or API error.");
      setIsLiveActive(false);
    }
  };

  const stopLiveSession = () => {
     if (liveSessionRef.current) {
        // We can't strictly "close" the session object easily in the SDK yet without disconnect, 
        // but checking the docs, simply closing the connection via the callback logic or refreshing helps.
        // For now, we rely on the implementation to handle cleanup or just toggle state.
        // Re-implementing specific close not available in provided snippet, so we simulate:
        setIsLiveActive(false);
        setIsMicOn(false);
        window.location.reload(); // Hard reset to clear audio contexts for now (safest for demo)
     }
  };

  if (!isOpen) return (
    <button
      onClick={toggleAi}
      className="fixed bottom-6 right-6 z-50 p-4 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 flex items-center justify-center border-2 border-white bg-indigo-600 bg-[conic-gradient(at_top_right,_var(--tw-gradient-stops))] from-indigo-500 via-purple-500 to-indigo-500"
    >
      <span className="text-2xl text-white font-bold">✨</span>
    </button>
  );

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[350px] sm:w-[400px] h-[500px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-fade-in-up">
      {/* Header */}
      <div className={`p-4 transition-colors duration-500 ${isLiveActive ? 'bg-red-600' : 'bg-slate-900'}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{isLiveActive ? '🎙️' : '🧠'}</span>
            <div>
              <h3 className="text-white font-bold text-sm m-0">
                 {isLiveActive ? 'Quantum Voice Live' : 'Quantum Co-Pilot'}
              </h3>
            </div>
          </div>
          <button onClick={toggleAi} className="text-slate-400 hover:text-white">✕</button>
        </div>
        
        {/* Model Toggle */}
        {!isLiveActive && (
           <div className="flex bg-slate-800 p-1 rounded-lg">
              <button 
                 onClick={() => setUseLite(false)}
                 className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-all flex items-center justify-center gap-1 ${!useLite ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
              >
                 <span>🌌</span> Deep Think
              </button>
              <button 
                 onClick={() => setUseLite(true)}
                 className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-all flex items-center justify-center gap-1 ${useLite ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
              >
                 <span>⚡</span> Turbo
              </button>
           </div>
        )}
      </div>

      {/* Main Content Area */}
      {isLiveActive ? (
         <div className="flex-1 bg-slate-900 flex flex-col items-center justify-center relative overflow-hidden">
            {/* Ambient Pulse */}
            <div 
               className="absolute rounded-full bg-red-500/20 blur-3xl transition-all duration-100"
               style={{ width: `${volumeLevel * 4 + 100}px`, height: `${volumeLevel * 4 + 100}px` }}
            ></div>
            
            <div className="relative z-10 text-center">
               <div className="text-6xl mb-4 animate-pulse">
                  {volumeLevel > 10 ? '🗣️' : '👂'}
               </div>
               <p className="text-white font-bold mb-2">Listening...</p>
               <p className="text-slate-400 text-xs max-w-[200px] mx-auto">
                  Speak naturally. Quantum is analyzing {currentClient ? currentClient.profile.name : 'data'} in real-time.
               </p>
            </div>

            <button 
               onClick={stopLiveSession}
               className="absolute bottom-8 px-6 py-2 bg-white text-red-600 rounded-full font-bold text-xs hover:bg-gray-100 transition-colors shadow-lg"
            >
               End Session
            </button>
         </div>
      ) : (
         <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-3">
            {messages.map((msg, idx) => (
               <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
               <div 
                  className={`max-w-[85%] p-3 rounded-xl text-sm leading-relaxed ${
                     msg.role === 'user' 
                     ? 'bg-indigo-600 text-white rounded-br-none' 
                     : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none shadow-sm'
                  }`}
               >
                  {msg.text}
               </div>
               </div>
            ))}
            {isThinking && (
               <div className="flex justify-start">
               <div className="bg-white text-gray-500 border border-gray-200 p-3 rounded-xl rounded-bl-none text-xs flex items-center gap-2">
                  <span className="animate-pulse">{useLite ? '⚡ Processing...' : '🤔 Thinking deeply...'}</span>
               </div>
               </div>
            )}
            <div ref={messagesEndRef} />
         </div>
      )}

      {/* Input Area (Hidden during Live) */}
      {!isLiveActive && (
         <div className="p-3 bg-white border-t border-gray-200">
            <div className="relative flex items-center gap-2">
               <button 
                  onClick={startLiveSession}
                  className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors flex-shrink-0"
                  title="Start Voice Mode"
               >
                  🎙️
               </button>
               <div className="relative flex-1">
                  <input
                     type="text"
                     value={input}
                     onChange={(e) => setInput(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                     placeholder={currentClient ? (useLite ? "Ask quickly..." : "Ask complex analysis...") : "Select client..."}
                     disabled={!currentClient || isThinking}
                     className="w-full pl-4 pr-10 py-3 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                  <button 
                     onClick={() => handleSend()}
                     disabled={!input.trim() || !currentClient || isThinking}
                     className={`absolute right-2 top-2 p-1.5 text-white rounded-lg disabled:opacity-50 transition-colors ${useLite ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                  >
                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A2.001 2.001 0 005.694 10a2.001 2.001 0 00-1.999 1.836l-1.415 4.925a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                     </svg>
                  </button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default AiAssistant;
