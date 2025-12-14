
import React, { useState } from 'react';
import { generateDreamVideo } from '../../lib/gemini';

const VisionBoardTab = () => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [loading, setLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');

  const PRESETS = [
    "A happy retired couple walking on a white sand beach in Bali at sunset, 4k cinematic",
    "A modern luxury penthouse in Singapore with a view of Marina Bay Sands, cozy interior, evening",
    "A family having a joyful dinner in a garden, warm lighting, slow motion, high quality",
    "An elderly man playing golf on a green course in Scotland, sunny day, sharp focus"
  ];

  const handleGenerate = async () => {
    if (!prompt) return;
    setLoading(true);
    setVideoUrl(null);
    setStatusMsg('Initializing Quantum Engine...');

    try {
      // Step messages to keep user engaged during wait
      const steps = [
        "Constructing Scene Geometry...", 
        "Raytracing Lighting Paths...", 
        "Rendering Physics...", 
        "Finalizing Video Stream..."
      ];
      let stepIdx = 0;
      const interval = setInterval(() => {
        if (stepIdx < steps.length) {
          setStatusMsg(steps[stepIdx]);
          stepIdx++;
        }
      }, 4000);

      const url = await generateDreamVideo(prompt, aspectRatio);
      
      clearInterval(interval);
      setVideoUrl(url);
    } catch (e: any) {
      alert("Generation Failed: " + e.message);
    } finally {
      setLoading(false);
      setStatusMsg('');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      
      {/* 1. CINEMATIC HEADER */}
      <div className="bg-gradient-to-r from-gray-900 via-slate-900 to-gray-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl border border-gray-800">
         <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
         {/* Spotlight effect */}
         <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-indigo-500/20 rounded-full blur-[100px]"></div>

         <div className="relative z-10 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest mb-4">
               <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
               Veo 3.1 Neural Engine
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-4 text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400">
               Quantum Vision Board
            </h1>
            <p className="text-gray-400 text-sm max-w-lg mx-auto">
               Don't just tell them about their future. <strong className="text-white">Show them.</strong> <br/>
               Generate hyper-realistic video visualizations of their financial goals.
            </p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         
         {/* 2. DIRECTOR'S CONSOLE (Controls) */}
         <div className="lg:col-span-1 bg-white rounded-2xl p-6 border border-gray-200 shadow-sm h-fit">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
               <span>🎬</span> Scene Director
            </h3>
            
            <div className="space-y-6">
               <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Aspect Ratio</label>
                  <div className="flex bg-gray-100 p-1 rounded-lg">
                     <button 
                        onClick={() => setAspectRatio('16:9')}
                        className={`flex-1 py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-2 ${aspectRatio === '16:9' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                     >
                        <span className="border border-current w-4 h-2.5 rounded-sm"></span> Landscape
                     </button>
                     <button 
                        onClick={() => setAspectRatio('9:16')}
                        className={`flex-1 py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-2 ${aspectRatio === '9:16' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                     >
                        <span className="border border-current w-2.5 h-4 rounded-sm"></span> Portrait
                     </button>
                  </div>
               </div>

               <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Visual Prompt</label>
                  <textarea 
                     value={prompt}
                     onChange={(e) => setPrompt(e.target.value)}
                     className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-medium focus:border-indigo-500 focus:bg-white transition-all outline-none resize-none h-32"
                     placeholder="Describe the dream retirement scene..."
                  ></textarea>
               </div>

               <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Quick Presets</label>
                  <div className="space-y-2">
                     {PRESETS.map((p, i) => (
                        <button 
                           key={i}
                           onClick={() => setPrompt(p)}
                           className="w-full text-left p-2 text-[10px] bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg transition-colors truncate"
                        >
                           {p}
                        </button>
                     ))}
                  </div>
               </div>

               <button
                  onClick={handleGenerate}
                  disabled={!prompt || loading}
                  className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
               >
                  {loading ? (
                     <><span className="animate-spin">↻</span> Generating...</>
                  ) : (
                     <><span>✨</span> Generate Video</>
                  )}
               </button>
            </div>
         </div>

         {/* 3. THEATER (Output) */}
         <div className="lg:col-span-2">
            <div className="bg-black rounded-2xl border border-gray-800 p-1 shadow-2xl relative overflow-hidden min-h-[400px] flex items-center justify-center group">
               
               {/* Ambient Glow */}
               {videoUrl && (
                  <div className="absolute inset-0 bg-indigo-500/10 blur-3xl opacity-50"></div>
               )}

               {loading ? (
                  <div className="text-center space-y-4 relative z-10">
                     <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                     <div className="text-indigo-400 font-mono text-sm animate-pulse">{statusMsg}</div>
                     <div className="text-gray-600 text-xs">This may take 1-2 minutes. AI is dreaming.</div>
                  </div>
               ) : videoUrl ? (
                  <div className={`relative w-full h-full flex items-center justify-center ${aspectRatio === '9:16' ? 'max-w-[360px] mx-auto' : ''}`}>
                     <video 
                        src={videoUrl} 
                        controls 
                        autoPlay 
                        loop 
                        className="w-full h-auto rounded-xl shadow-2xl"
                     />
                     <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a 
                           href={videoUrl} 
                           download="vision_board.mp4" 
                           target="_blank"
                           className="bg-white/10 backdrop-blur text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-white/20 transition-colors flex items-center gap-2"
                        >
                           ⬇ Download
                        </a>
                     </div>
                  </div>
               ) : (
                  <div className="text-center text-gray-700 space-y-2">
                     <div className="text-5xl opacity-20 mb-2">🎞️</div>
                     <div className="text-sm font-medium">No active visualization</div>
                     <div className="text-xs opacity-50">Enter a prompt to start the engine</div>
                  </div>
               )}
            </div>
            
            {/* Disclaimer */}
            <div className="mt-4 text-center">
               <p className="text-[10px] text-gray-400">
                  AI Generated Content (Veo 3.1). Visualizations are for illustrative purposes only and do not represent guaranteed outcomes.
               </p>
            </div>
         </div>

      </div>
    </div>
  );
};

export default VisionBoardTab;
