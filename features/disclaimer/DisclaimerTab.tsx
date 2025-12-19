
import React, { useState, useEffect } from 'react';

const DisclaimerTab = () => {
  const [hasAgreed, setHasAgreed] = useState(false);

  useEffect(() => {
    const agreed = sessionStorage.getItem('disclaimer_agreed');
    if (agreed === 'true') {
      setHasAgreed(true);
    }
  }, []);

  const handleAgree = () => {
    setHasAgreed(true);
    sessionStorage.setItem('disclaimer_agreed', 'true');
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-900 text-3xl mb-4 shadow-lg border-4 border-slate-100">
          ⚖️
        </div>
        <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">
          Planning Protocol
        </h1>
        <p className="text-slate-500 text-sm font-medium uppercase tracking-widest">
          Read & Acknowledge to Unlock Vault
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden relative">
        <div className="h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500"></div>
        
        <div className="p-8 md:p-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-8">
            <div>
              <h2 className="text-sm font-bold text-indigo-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                Sandbox Capabilities
              </h2>
              <ul className="space-y-4">
                <li className="flex gap-3 text-sm text-gray-600">
                  <div className="min-w-[20px] text-indigo-500 font-bold">01</div>
                  <span><strong>Strategic Modeling:</strong> A tool to explore complex financial scenarios and visualize future outcomes based on current data.</span>
                </li>
                <li className="flex gap-3 text-sm text-gray-600">
                  <div className="min-w-[20px] text-indigo-500 font-bold">02</div>
                  <span><strong>Stress Testing:</strong> Simulates market conditions and life events to verify financial resilience.</span>
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-sm font-bold text-red-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                Guidance Limits
              </h2>
              <ul className="space-y-4">
                <li className="flex gap-3 text-sm text-gray-600">
                  <div className="min-w-[20px] text-red-500 font-bold">01</div>
                  <span><strong>Not Formal Advice:</strong> Sproutly provides modeling for educational purposes. Personal advice requires a full professional fact-find.</span>
                </li>
                <li className="flex gap-3 text-sm text-gray-600">
                  <div className="min-w-[20px] text-red-500 font-bold">02</div>
                  <span><strong>Estimated Projections:</strong> Results are based on inputs. Market returns and policy variables will change over time.</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-6 border border-slate-200 mb-8">
            <h3 className="text-slate-900 font-bold text-sm mb-2">User Responsibility</h3>
            <p className="text-slate-600 text-xs leading-relaxed">
              By proceeding, you verify that you are a licensed professional or are using this under the guidance of one. Sproutly is a calculation engine and holds no liability for specific investment or policy decisions.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center pt-4 border-t border-gray-100">
            {hasAgreed ? (
              <div className="animate-fade-in text-center">
                <div className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-100 text-emerald-800 rounded-full font-bold text-sm">
                  <span>✓</span> Protocol Accepted
                </div>
                <p className="text-xs text-gray-400 mt-3">
                  Vault Unlocked. Proceed to <strong className="text-gray-600">Profile</strong>.
                </p>
              </div>
            ) : (
              <button
                onClick={handleAgree}
                className="group relative w-full md:w-auto px-12 py-4 bg-slate-900 text-white rounded-xl font-bold shadow-lg hover:bg-slate-800 transition-all active:scale-95 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                <span className="flex items-center gap-3">
                  <span>Initialize Strategy Desk</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DisclaimerTab;
