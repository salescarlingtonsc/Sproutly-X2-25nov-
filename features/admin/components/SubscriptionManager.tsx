
import React, { useState } from 'react';
import { Advisor, Subscription } from '../../../types';

interface SubscriptionManagerProps {
  subscription: Subscription;
  onUpdateSubscription: (sub: Subscription) => void;
  currentUser: Advisor;
  onUpdateUser: (user: Advisor) => void;
}

export const SubscriptionManager: React.FC<SubscriptionManagerProps> = ({ subscription, onUpdateSubscription, currentUser, onUpdateUser }) => {
  const [activeTab, setActiveTab] = useState<'plans' | 'billing'>('plans');

  const plans = [
      {
          id: 'pro_individual',
          name: 'Pro Advisor',
          price: 29,
          features: ['Unlimited Clients', 'AI Strategy Assistant', 'WhatsApp Integration', 'Financial Calculators'],
          target: 'Individual'
      },
      {
          id: 'growth_agency',
          name: 'Agency Growth',
          price: 199,
          features: ['Everything in Pro', 'Director Dashboard', 'Lead Distribution', 'Advisor Oversight', 'Priority Support'],
          target: 'Agency'
      }
  ];

  const handleUpgrade = (planId: any) => {
      // Simulate Stripe Checkout
      const confirmed = confirm(`Upgrade to ${planId === 'pro_individual' ? 'Pro Advisor' : 'Agency Growth'}? This will charge your card on file.`);
      if (confirmed) {
          // 1. Update Subscription
          onUpdateSubscription({
              ...subscription,
              planId: planId,
              status: 'active',
              seats: planId === 'growth_agency' ? Math.max(subscription.seats, 5) : 1
          });

          // 2. Promote User if Agency Plan
          if (planId === 'growth_agency') {
              onUpdateUser({
                  ...currentUser,
                  role: 'director',
                  isAgencyAdmin: true
              });
              alert("Subscription updated! You are now an Agency Director. Access the new menu items in the sidebar.");
          } else {
              alert("Subscription updated successfully!");
          }
      }
  };

  const handleAddSeat = () => {
       const confirmed = confirm("Add 1 additional seat for $10/mo?");
       if (confirmed) {
           onUpdateSubscription({
               ...subscription,
               seats: subscription.seats + 1
           });
       }
  };

  return (
    <div className="p-8 bg-slate-50 min-h-full animate-fade-in">
        <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Subscription & Billing</h1>
            <p className="text-slate-500 mb-8">Manage your Sproutly license and payment methods.</p>

            <div className="flex gap-4 mb-6 border-b border-slate-200">
                <button 
                    onClick={() => setActiveTab('plans')}
                    className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'plans' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'}`}
                >
                    Current Plan
                </button>
                <button 
                    onClick={() => setActiveTab('billing')}
                    className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'billing' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'}`}
                >
                    Payment Methods
                </button>
            </div>

            {activeTab === 'plans' && (
                <div className="space-y-8">
                    {/* Current Status */}
                    <div className="bg-slate-900 rounded-xl p-6 text-white shadow-lg flex justify-between items-center">
                        <div>
                            <p className="text-slate-400 text-xs uppercase font-bold tracking-wider mb-1">Current Plan</p>
                            <h2 className="text-2xl font-bold flex items-center gap-2">
                                {subscription.planId === 'pro_individual' ? 'Pro Advisor' : 'Agency Growth'}
                                <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">Active</span>
                            </h2>
                            <p className="text-slate-400 text-sm mt-1">Next billing date: {new Date(subscription.nextBillingDate).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                             {subscription.planId === 'growth_agency' && (
                                 <div className="mb-2">
                                     <p className="text-2xl font-bold">{subscription.seats} Seats</p>
                                     <p className="text-slate-400 text-xs">Included in plan</p>
                                 </div>
                             )}
                             <p className="text-xl font-mono">${subscription.planId === 'pro_individual' ? '29.00' : (199 + (Math.max(0, subscription.seats - 5) * 10)).toFixed(2)}<span className="text-sm text-slate-500">/mo</span></p>
                        </div>
                    </div>

                    {/* Pricing Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {plans.map(plan => {
                            const isCurrent = subscription.planId === plan.id;
                            return (
                                <div key={plan.id} className={`bg-white p-6 rounded-2xl border ${isCurrent ? 'border-emerald-500 ring-1 ring-emerald-500 shadow-md' : 'border-slate-200 shadow-sm'} flex flex-col`}>
                                    <div className="mb-4">
                                        <h3 className="text-lg font-bold text-slate-800">{plan.name}</h3>
                                        <p className="text-sm text-slate-500">{plan.target}</p>
                                    </div>
                                    <div className="mb-6">
                                        <span className="text-3xl font-bold text-slate-900">${plan.price}</span>
                                        <span className="text-slate-500">/month</span>
                                    </div>
                                    <ul className="space-y-3 mb-8 flex-1">
                                        {plan.features.map((feat, i) => (
                                            <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                                                <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                {feat}
                                            </li>
                                        ))}
                                    </ul>
                                    <button 
                                        disabled={isCurrent}
                                        onClick={() => handleUpgrade(plan.id)}
                                        className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${isCurrent ? 'bg-emerald-50 text-emerald-700 opacity-50 cursor-default' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-md'}`}
                                    >
                                        {isCurrent ? 'Current Plan' : `Switch to ${plan.name}`}
                                    </button>
                                </div>
                            )
                        })}
                    </div>

                    {/* Seat Management (Agency Only) */}
                    {subscription.planId === 'growth_agency' && (
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h3 className="font-bold text-slate-800">Seat Management</h3>
                                    <p className="text-sm text-slate-500">Add seats for your advisors ($10/seat/mo).</p>
                                </div>
                                <button onClick={handleAddSeat} className="text-sm bg-white border border-slate-300 hover:bg-slate-50 px-3 py-2 rounded-lg font-medium transition-colors">
                                    + Add Seat
                                </button>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2 mb-2 overflow-hidden">
                                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '40%' }}></div>
                            </div>
                            <p className="text-xs text-slate-500 text-right">Using 2 of {subscription.seats} seats</p>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'billing' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 text-slate-400">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                    </div>
                    <h3 className="font-bold text-slate-800 mb-1">Payment Method</h3>
                    <p className="text-sm text-slate-500 mb-6">Visa ending in •••• 4242</p>
                    <button className="text-sm text-emerald-600 font-bold hover:underline">Update Card</button>
                    
                    <div className="w-full border-t border-slate-100 my-8"></div>

                    <h3 className="font-bold text-slate-800 mb-4 self-start">Invoice History</h3>
                    <div className="w-full space-y-2">
                        {[1,2,3].map(i => (
                            <div key={i} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-slate-100 rounded flex items-center justify-center text-slate-500 text-xs font-bold">PDF</div>
                                    <div className="text-left">
                                        <p className="text-sm font-medium text-slate-700">Invoice #INV-2024-00{i}</p>
                                        <p className="text-xs text-slate-400">Oct {i}, 2024</p>
                                    </div>
                                </div>
                                <span className="text-sm font-mono text-slate-600">$29.00</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};
