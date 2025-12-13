
import React, { useState, useRef, useEffect } from 'react';
import { chatWithFinancialContext } from '../../lib/gemini';
import { Client } from '../../types';

interface AiAssistantProps {
  currentClient: Client | null;
}

interface Message {
  role: 'user' | 'model';
  text: string;
}

const AiAssistant: React.FC<AiAssistantProps> = ({ currentClient }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'Hello! I am your Quantum Co-Pilot. I have analyzed this client\'s file. Ask me anything—from specific calculations to closing strategies.' }
  ]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    if (!currentClient) {
      setMessages(prev => [...prev, { role: 'user', text: input }, { role: 'model', text: 'Please select or load a client profile first so I can analyze their data.' }]);
      setInput('');
      return;
    }

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsThinking(true);

    try {
      // Pass the previous messages as context history
      const response = await chatWithFinancialContext(messages, userMsg, currentClient);
      setMessages(prev => [...prev, { role: 'model', text: response || 'No response.' }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'model', text: 'Error connecting to AI.' }]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 p-4 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 flex items-center justify-center border-2 border-white ${isOpen ? 'bg-red-500 rotate-45' : 'bg-indigo-600 bg-[conic-gradient(at_top_right,_var(--tw-gradient-stops))] from-indigo-500 via-purple-500 to-indigo-500'}`}
      >
        <span className="text-2xl text-white font-bold">{isOpen ? '＋' : '✨'}</span>
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[350px] sm:w-[400px] h-[500px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-fade-in-up">
          {/* Header */}
          <div className="bg-slate-900 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🧠</span>
              <div>
                <h3 className="text-white font-bold text-sm m-0">Quantum Co-Pilot</h3>
                <div className="text-slate-400 text-[10px] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Gemini 3 Pro Active
                </div>
              </div>
            </div>
            {currentClient && (
              <div className="text-[10px] bg-slate-800 text-slate-200 px-2 py-1 rounded border border-slate-700">
                Context: {currentClient.profile.name}
              </div>
            )}
          </div>

          {/* Messages Area */}
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
                  <span className="animate-pulse">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-white border-t border-gray-200">
            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={currentClient ? "Ask about gap analysis..." : "Select a client first..."}
                disabled={!currentClient || isThinking}
                className="w-full pl-4 pr-12 py-3 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
              <button 
                onClick={handleSend}
                disabled={!input.trim() || !currentClient || isThinking}
                className="absolute right-2 top-2 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A2.001 2.001 0 005.694 10a2.001 2.001 0 00-1.999 1.836l-1.415 4.925a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AiAssistant;
