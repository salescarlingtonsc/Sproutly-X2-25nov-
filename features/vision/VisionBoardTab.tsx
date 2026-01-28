
import React, { useState } from 'react';
import { generateDreamVideo } from '../../lib/gemini';

const VisionBoardTab = () => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [loading, setLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');

  const PRESETS = [
    "A happy retired couple walking on a white sand beach at sunset, 4k cinematic",
    "A modern luxury residence with city views, cozy interior, evening",
    "A family dinner in a peaceful garden, warm lighting, slow motion",
    "A professional enjoying a golf game on a lush course, sunny day"
  ];

  const handleGenerate = async () => {
    if (!prompt) return;

    if ((window as any).aistudio && !(await (window as any).aistudio.hasSelectedApiKey())) {
      await (window as any).aistudio.openSelectKey();
    }

    setLoading(true);
    setVideoUrl(null);
    setStatusMsg('Initializing Visual Engine...');

    try {
      const steps = [
        "Constructing Perspective...", 
        "Raytracing Lighting...", 
        "Optimizing Motion...", 
        "Finalizing Stream..."
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
      // Silently handle aborts
      if (e.name === 'AbortError' || e.message?.includes('aborted') || e.message?.includes('cancelled')) {
          console.debug('Vision generation cancelled.');
      } else {
          alert("Visualization Failed: " + e.message);
      }
    } finally {
      setLoading(false);
      setStatusMsg('');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="bg-gradient-to-r from-gray-900 via-slate-900 to-gray-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl border border-gray-800">
         <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
         <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-indigo-500/20 rounded-full blur-[100px]"></div>

         <div className="relative z-10 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/20 text-[10px] font-bold uppercase tracking-widest mb-4">
               <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
               Visual Insights Engine
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-4 text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400">
               Sproutly Visualizer
            </h1>
            <p className="text-gray-400 text-sm max-w-lg mx-auto">
               Provide clients with a high-fidelity window into their future. <strong className="text-white">Experience the outcome.</strong>
            </p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         <div className="lg:col-span-1 bg-white rounded-2xl p-6 border border-gray-200 shadow-sm h-fit">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
               <span>🎬</span> Scene Controller
            </h3>
            
            <div className="space-y-6">
               <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Aspect Ratio</label>
                  <div className="flex bg-gray-100 p-1 rounded-lg">
                     <button onClick={() => setAspectRatio('16:9')} className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${aspectRatio === '16:9' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>Landscape</button>
                     <button onClick={() => setAspectRatio('9:16')} className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${aspectRatio === '9:16' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>Portrait</button>
                  </div>
               </div>

               <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Vision Prompt</label>
                  <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-medium focus:border-indigo-500 outline-none h-32 resize-none" placeholder="Describe the dream scenario..."></textarea>
               </div>

               <button onClick={handleGenerate} disabled={!prompt || loading} className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                  {loading ? 'Processing...' : 'Generate Visualization'}
               </button>
            </div>
         </div>

         <div className="lg:col-span-2">
            <div className="bg-black rounded-2xl border border-gray-800 p-1 shadow-2xl relative overflow-hidden min-h-[400px] flex items-center justify-center group">
               {loading ? (
                  <div className="text-center space-y-4">
                     <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                     <div className="text-indigo-400 font-mono text-sm animate-pulse">{statusMsg}</div>
                  </div>
               ) : videoUrl ? (
                  <video src={videoUrl} controls autoPlay loop className="w-full h-auto rounded-xl shadow-2xl" />
               ) : (
                  <div className="text-center text-gray-700 space-y-2">
                     <div className="text-5xl opacity-20 mb-2">🎞️</div>
                     <div className="text-sm font-medium">Ready for input</div>
                  </div>
               )}
            </div>
            <div className="mt-4 text-center">
               <p className="text-[10px] text-gray-400">
                  Visualizations are for illustrative purposes and do not represent guaranteed outcomes.
               </p>
            </div>
         </div>
      </div>
    </div>
  );
};

export default VisionBoardTab;
