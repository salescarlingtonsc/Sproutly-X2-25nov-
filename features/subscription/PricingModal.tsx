
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { TIER_CONFIG } from '../../lib/config';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PricingModal: React.FC<PricingModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  
  // Timer State
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  // Countdown Logic (Targeting Dec 31st of current year)
  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const currentYear = now.getFullYear();
      const targetDate = new Date(`${currentYear}-12-31T23:59:59`);
      const difference = targetDate.getTime() - now.getTime();

      if (difference > 0) {
        return {
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        };
      }
      return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    };

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    // Initial calc
    setTimeLeft(calculateTimeLeft());

    return () => clearInterval(timer);
  }, []);
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full overflow-hidden my-10 relative">
        
        {/* PROMO BANNER */}
        <div className="bg-gradient-to-r from-red-600 to-red-500 text-white p-2 text-center shadow-md">
           <div className="flex flex-col sm:flex-row justify-center items-center gap-2 sm:gap-4 text-sm font-bold uppercase tracking-wider">
              <span>🎉 Year End Promo Ends In:</span>
              <div className="flex gap-2 font-mono text-base bg-black/20 px-3 py-1 rounded">
                 <span>{String(timeLeft.days).padStart(2, '0')}d</span> : 
                 <span>{String(timeLeft.hours).padStart(2, '0')}h</span> : 
                 <span>{String(timeLeft.minutes).padStart(2, '0')}m</span> : 
                 <span>{String(timeLeft.seconds).padStart(2, '0')}s</span>
              </div>
           </div>
        </div>

        <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
          <div>
             <h2 className="text-2xl font-bold">Upgrade Your Plan</h2>
             <p className="text-gray-400 text-sm mt-1">Choose the tier that fits your agency needs</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">✕</button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-200">
          
          {/* Free Plan */}
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-600">{TIER_CONFIG.free.label}</h3>
            </div>
            <div className="mb-6 h-[72px] flex items-center">
              <span className="text-3xl font-extrabold text-gray-900">$0</span>
            </div>
            <ul className="space-y-3 mb-8 text-sm">
               <li className="flex items-center gap-2 text-gray-600">
                 <span className="text-green-500 font-bold">✓</span> {TIER_CONFIG.free.clientLimit} Client Profile
               </li>
               <li className="flex items-center gap-2 text-gray-600">
                 <span className="text-green-500 font-bold">✓</span> Profile Tab Access
               </li>
               <li className="flex items-center gap-2 text-gray-400">
                 <span className="text-red-400 font-bold">✕</span> Education & Cashflow
               </li>
               <li className="flex items-center gap-2 text-gray-400">
                 <span className="text-red-400 font-bold">✕</span> Investment Tools
               </li>
            </ul>
            <button 
               disabled
               className="w-full py-2.5 border-2 border-gray-200 text-gray-400 font-bold rounded-lg cursor-not-allowed text-sm"
            >
              {user?.subscriptionTier === 'free' ? 'Current Plan' : 'Basic'}
            </button>
          </div>
          
          {/* Platinum Plan */}
          <div className="p-6 bg-indigo-50/30 relative">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-indigo-900">{TIER_CONFIG.platinum.label}</h3>
              <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-full animate-pulse">PROMO</span>
            </div>
            
            {/* Promo Price Block */}
            <div className="mb-6 h-[72px]">
              <div className="flex items-end gap-2">
                <span className="text-lg text-gray-400 line-through font-bold decoration-red-500">$150</span>
                <span className="text-3xl font-extrabold text-indigo-900">$50</span>
                <span className="text-indigo-600 text-sm mb-1">/mo</span>
              </div>
              <div className="text-[11px] font-bold text-red-600 mt-1 bg-red-50 inline-block px-2 py-0.5 rounded border border-red-100">
                 Year End Promo (First 2 Months)
              </div>
            </div>

            <ul className="space-y-3 mb-8 text-sm">
               <li className="flex items-center gap-2 text-gray-700 font-medium">
                 <span className="text-indigo-500 font-bold">✓</span> {TIER_CONFIG.platinum.clientLimit} Client Profiles
               </li>
               <li className="flex items-center gap-2 text-gray-700 font-medium">
                 <span className="text-indigo-500 font-bold">✓</span> <strong>Profile + Children + Cashflow</strong>
               </li>
               <li className="flex items-center gap-2 text-gray-700 font-medium">
                 <span className="text-indigo-500 font-bold">✓</span> CRM Access
               </li>
               <li className="flex items-center gap-2 text-gray-400">
                 <span className="text-red-400 font-bold">✕</span> Advanced Wealth Tools
               </li>
            </ul>
            <button 
               className="w-full py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-all text-sm shadow-lg shadow-indigo-200"
               onClick={() => alert('Contact administrator to claim offer.')}
            >
              Claim Offer
            </button>
          </div>

          {/* Diamond Plan */}
          <div className="p-6 bg-emerald-50/30 relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-emerald-900">{TIER_CONFIG.diamond.label}</h3>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 text-[10px] font-bold rounded-full">PRO</span>
            </div>
            <div className="mb-6 h-[72px] flex flex-col justify-center">
              <div>
                <span className="text-3xl font-extrabold text-emerald-900">$300</span>
                <span className="text-emerald-600 text-sm">/month</span>
              </div>
            </div>
            <ul className="space-y-3 mb-8 text-sm">
               <li className="flex items-center gap-2 text-gray-700 font-medium">
                 <span className="text-emerald-500 font-bold">✓</span> {TIER_CONFIG.diamond.clientLimit} Client Profiles
               </li>
               <li className="flex items-center gap-2 text-gray-700 font-medium">
                 <span className="text-emerald-500 font-bold">✓</span> <strong>ALL Tabs Unlocked</strong>
               </li>
               <li className="flex items-center gap-2 text-gray-700 font-medium">
                 <span className="text-emerald-500 font-bold">✓</span> Property & Wealth Tools
               </li>
               <li className="flex items-center gap-2 text-gray-700 font-medium">
                 <span className="text-emerald-500 font-bold">✓</span> Priority Support
               </li>
            </ul>
            <button 
               className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-lg hover:opacity-90 transition-all text-sm shadow-md shadow-emerald-200"
               onClick={() => alert('Contact administrator to upgrade.')}
            >
              Get Diamond
            </button>
          </div>

          {/* Organisation Plan */}
          <div className="p-6 bg-purple-50/30 relative overflow-hidden border-l-4 border-purple-500">
             <div className="absolute top-0 right-0 bg-purple-600 text-white text-[9px] font-bold px-6 py-1 rotate-45 translate-x-4 translate-y-2 shadow-sm">ENTERPRISE</div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-purple-900">{TIER_CONFIG.organisation.label}</h3>
            </div>
            <div className="mb-6 h-[72px] flex flex-col justify-center">
              <span className="text-xl font-bold text-purple-900">Custom Pricing</span>
              <div className="text-purple-600 text-xs">Contact Sales</div>
            </div>
            <ul className="space-y-3 mb-8 text-sm">
               <li className="flex items-center gap-2 text-gray-700 font-medium">
                 <span className="text-purple-500 font-bold">✓</span> <strong>Customise & White Label</strong>
               </li>
               <li className="flex items-center gap-2 text-gray-700 font-medium">
                 <span className="text-purple-500 font-bold">✓</span> Management Dashboard
               </li>
               <li className="flex items-center gap-2 text-gray-700 font-medium">
                 <span className="text-purple-500 font-bold">✓</span> Individual Analytical Tools
               </li>
               <li className="flex items-center gap-2 text-gray-700 font-medium">
                 <span className="text-purple-500 font-bold">✓</span> Maximise Production
               </li>
            </ul>
            <button 
               className="w-full py-2.5 bg-purple-700 text-white font-bold rounded-lg hover:bg-purple-800 transition-all text-sm"
               onClick={() => alert('Please contact our sales team for organisation onboarding.')}
            >
              Contact Sales
            </button>
          </div>

        </div>
        
        <div className="bg-gray-50 p-4 text-center border-t border-gray-200">
           <p className="text-sm font-bold text-gray-700">Need more clients?</p>
           <p className="text-xs text-gray-500">Add extra profile slots to any paid plan for just <strong>$2/profile</strong> (one-time fee).</p>
        </div>
      </div>
    </div>
  );
};

export default PricingModal;
