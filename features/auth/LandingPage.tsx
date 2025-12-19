
import React from 'react';

interface LandingPageProps {
  onLogin: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onLogin }) => {
  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-6 text-white font-sans relative overflow-hidden">
      
      {/* --- BACKGROUND FX --- */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-indigo-600/30 rounded-full blur-[120px] animate-pulse-slow"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-emerald-600/20 rounded-full blur-[120px] animate-pulse-slow delay-700"></div>
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
      </div>

      {/* --- CONTENT --- */}
      <div className="max-w-5xl w-full flex flex-col md:flex-row items-center justify-between gap-12 relative z-10">
        
        {/* LEFT: The Pitch */}
        <div className="flex-1 text-center md:text-left space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-bold uppercase tracking-widest backdrop-blur-md shadow-[0_0_15px_rgba(245,158,11,0.2)]">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            Version 3.0 • Gold Release
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight">
            <span className="gradient-text bg-gradient-to-r from-white via-indigo-100 to-indigo-300">
              Financial Clarity.
            </span>
            <br />
            <span className="gradient-text bg-gradient-to-r from-emerald-400 to-teal-200">
              Engineered Precision.
            </span>
          </h1>
          
          <p className="text-slate-400 text-lg md:text-xl leading-relaxed max-w-lg mx-auto md:mx-0">
            The world's most advanced financial modeling engine. Sproutly utilizes 
            <span className="text-indigo-400 font-bold"> Quantum Core </span> and 
            <span className="text-emerald-400 font-bold"> Strategic Logic</span> protocols to visualize wealth with 99.9% logical consistency.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
            <button
              onClick={onLogin}
              className="w-full sm:w-auto px-8 py-4 bg-white text-slate-900 hover:bg-slate-50 rounded-xl font-bold text-sm transition-all shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] flex items-center justify-center gap-2 group"
            >
              <span>🔐</span> 
              <span>Enter Quantum Portal</span>
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </button>
            <div className="flex items-center gap-[-10px]">
               {[1,2,3].map(i => (
                 <div key={i} className={`w-8 h-8 rounded-full border-2 border-slate-900 bg-slate-700 -ml-3 first:ml-0 z-10 flex items-center justify-center text-[10px]`}>
                    Adv
                 </div>
               ))}
               <span className="ml-3 text-xs text-slate-500 font-medium">Trusted by Top Advisors</span>
            </div>
          </div>
        </div>

        {/* RIGHT: The Login Card */}
        <div className="w-full md:w-[400px]">
          <div className="bg-slate-800/40 backdrop-blur-xl p-8 rounded-3xl border border-white/10 shadow-2xl relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-3xl opacity-20 blur transition duration-1000 group-hover:opacity-40"></div>
            
            <div className="relative">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold text-white">Advisor Sign-In</h2>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center shadow-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-white">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                  </svg>
                </div>
              </div>

              <div className="space-y-4">
                <button
                  onClick={onLogin}
                  className="w-full py-4 bg-white text-slate-900 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all flex items-center justify-center gap-3 shadow-lg"
                >
                  <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />
                  Continue with Google
                </button>
                <button
                  onClick={onLogin}
                  className="w-full py-4 bg-slate-700 text-white border border-white/10 rounded-xl font-bold text-sm hover:bg-slate-600 transition-all flex items-center justify-center gap-3"
                >
                  <span>📧</span>
                  Continue with Email
                </button>
              </div>

              <div className="mt-8 pt-6 border-t border-white/10 text-center">
                <p className="text-xs text-slate-400">
                  Secured Environment. <br/>
                  <span className="text-emerald-400 flex items-center justify-center gap-1 mt-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    256-bit Encryption Active
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>

      <div className="absolute bottom-6 text-xs text-slate-600 font-mono">
        QUANTUM ENGINE: <span className="text-emerald-500">ONLINE</span> • LATENCY: 12ms
      </div>
    </div>
  );
};

export default LandingPage;
