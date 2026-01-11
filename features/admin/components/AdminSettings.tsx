
import React, { useState } from 'react';
import { Product, AppSettings, Advisor } from '../../../types';
import { ProductTierModal } from './ProductTierModal';

interface AdminSettingsProps {
  products: Product[];
  settings: AppSettings;
  advisors: Advisor[];
  onUpdateProducts: (products: Product[]) => void;
  onUpdateSettings: (settings: AppSettings) => void;
  onUpdateAdvisors: (advisors: Advisor[]) => void;
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({ products, settings, advisors, onUpdateProducts, onUpdateSettings, onUpdateAdvisors }) => {
  const [activeTab, setActiveTab] = useState<'products' | 'config' | 'team' | 'benchmarks'>('products');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // --- Product Logic ---
  const handleProductUpdate = (id: string, field: keyof Product, value: any) => {
      const updated = products.map(p => p.id === id ? { ...p, [field]: value } : p);
      onUpdateProducts(updated);
  };
  
  const handleProductStructureUpdate = (updatedProduct: Product) => {
      onUpdateProducts(products.map(p => p.id === updatedProduct.id ? updatedProduct : p));
  };

  const addProduct = () => {
      const newProd: Product = { 
          id: `prod_${Date.now()}`, 
          name: 'New Product', 
          provider: 'TM',
          tiers: [{ min: 0, max: Infinity, rate: 0.5, dollarUp: 0 }] 
      };
      onUpdateProducts([...products, newProd]);
  };

  const deleteProduct = (id: string) => {
      if(confirm("Are you sure you want to delete this product?")) {
          onUpdateProducts(products.filter(p => p.id !== id));
      }
  };

  // --- Config Logic ---
  const handleAddPlatform = () => {
      const p = prompt("Enter new platform name:");
      if (p) onUpdateSettings({ ...settings, platforms: [...settings.platforms, p] });
  };
  const handleAddStatus = () => {
      const s = prompt("Enter new status name:");
      if (s) onUpdateSettings({ ...settings, statuses: [...settings.statuses, s] });
  };
  const handleAddCampaign = () => {
      const c = prompt("Enter new campaign name (e.g. 'Oct Roadshow'):");
      if (!c) return;
      
      const currentList = settings.campaigns || [];
      onUpdateSettings({ ...settings, campaigns: [...currentList, c] });
  };

  const handleRemoveItem = (type: 'platforms' | 'statuses', item: string) => {
      if (confirm(`Remove "${item}" from list?`)) {
          const list = settings[type] || [];
          onUpdateSettings({ ...settings, [type]: list.filter(i => i !== item) });
      }
  };

  const handleRemoveCampaign = (campaignName: string) => {
      if (confirm(`Remove campaign "${campaignName}"?`)) {
          const list = settings.campaigns || [];
          onUpdateSettings({ ...settings, campaigns: list.filter(c => c !== campaignName) });
      }
  };

  // --- Team Logic ---
  const handleAdvisorUpdate = (id: string, banding: number) => {
      const updated = advisors.map(a => a.id === id ? { ...a, bandingPercentage: banding } : a);
      onUpdateAdvisors(updated);
  };

  return (
    <div className="p-8 bg-slate-50 min-h-full animate-fade-in">
        <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-slate-800 mb-6">System Configuration</h1>
            
            <div className="flex gap-4 mb-8 border-b border-slate-200 overflow-x-auto">
                <button onClick={() => setActiveTab('products')} className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'products' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'}`}>Products & Revenue</button>
                <button onClick={() => setActiveTab('team')} className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'team' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'}`}>Advisor Banding</button>
                <button onClick={() => setActiveTab('benchmarks')} className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'benchmarks' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'}`}>Benchmarks</button>
                <button onClick={() => setActiveTab('config')} className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'config' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'}`}>Drop-down Lists</button>
            </div>

            {/* PRODUCTS TAB */}
            {activeTab === 'products' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[600px] text-left text-sm">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-3 font-semibold text-slate-600">Provider</th>
                                    <th className="px-6 py-3 font-semibold text-slate-600">Product Name</th>
                                    <th className="px-6 py-3 font-semibold text-slate-600">Structure</th>
                                    <th className="px-6 py-3 font-semibold text-slate-600 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {products.map(p => (
                                    <tr key={p.id} className="hover:bg-slate-50/50">
                                        <td className="px-6 py-3">
                                            <input 
                                                value={p.provider} 
                                                onChange={e => handleProductUpdate(p.id, 'provider', e.target.value)}
                                                className="w-24 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 focus:ring-1 focus:ring-emerald-500 outline-none"
                                            />
                                        </td>
                                        <td className="px-6 py-3">
                                            <input 
                                                value={p.name} 
                                                onChange={e => handleProductUpdate(p.id, 'name', e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 focus:ring-1 focus:ring-emerald-500 outline-none"
                                            />
                                        </td>
                                        <td className="px-6 py-3">
                                            <button 
                                                onClick={() => setEditingProduct(p)}
                                                className="text-xs bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 px-3 py-1.5 rounded border border-slate-200 transition-colors flex items-center gap-1"
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                Edit Logic ({p.tiers.length} Tiers)
                                            </button>
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <button onClick={() => deleteProduct(p.id)} className="text-slate-400 hover:text-rose-600">
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-100">
                        <button onClick={addProduct} className="text-sm text-indigo-600 font-medium hover:underline flex items-center gap-1">
                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                             Add New Product
                        </button>
                    </div>
                </div>
            )}

            {/* TEAM TAB */}
            {activeTab === 'team' && (
                <div className="space-y-6">
                    {/* AGENCY IDENTITY */}
                    <div className="bg-indigo-900 rounded-xl p-6 text-white shadow-lg">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-white/10 rounded-lg">
                                <span className="text-2xl">🏛️</span>
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-lg mb-1">Agency Identity</h3>
                                <p className="text-indigo-200 text-xs mb-4">This name is displayed to all managers and advisors.</p>
                                
                                <div>
                                    <label className="block text-[10px] font-bold text-indigo-300 uppercase mb-1">Organization Name</label>
                                    <input 
                                        type="text" 
                                        value={settings.agencyName || ''}
                                        onChange={e => onUpdateSettings({ ...settings, agencyName: e.target.value })}
                                        placeholder="e.g. Sproutly Organization"
                                        className="w-full bg-indigo-800 border border-indigo-700 rounded-lg px-4 py-3 text-white font-bold outline-none focus:ring-2 focus:ring-white/20 transition-all placeholder-indigo-400/50"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* BANDING TABLE */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                            <h3 className="font-bold text-slate-700">Commission Structure</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[600px] text-left text-sm">
                                <thead className="bg-slate-50 border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-3 font-semibold text-slate-600">Advisor</th>
                                        <th className="px-6 py-3 font-semibold text-slate-600">Role</th>
                                        <th className="px-6 py-3 font-semibold text-slate-600">Commission Banding (%)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {advisors.map(a => (
                                        <tr key={a.id}>
                                            <td className="px-6 py-3 flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">{a.avatar}</div>
                                                {a.name}
                                            </td>
                                            <td className="px-6 py-3">
                                                <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${a.role === 'manager' ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-600'}`}>{a.role}</span>
                                            </td>
                                            <td className="px-6 py-3">
                                                <div className="flex items-center gap-2">
                                                    <input 
                                                        type="number"
                                                        value={a.bandingPercentage}
                                                        onChange={e => handleAdvisorUpdate(a.id, parseFloat(e.target.value))}
                                                        className="w-20 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-center text-slate-900 focus:ring-1 focus:ring-emerald-500 outline-none"
                                                    />
                                                    <span className="text-slate-400">%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* BENCHMARKS TAB */}
            {activeTab === 'benchmarks' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
                        <h2 className="text-lg font-bold text-slate-800 mb-2">Weekly Activity Goals</h2>
                        <p className="text-sm text-slate-500 mb-6">Set the standard for advisor activity levels. These targets drive the "Deficit" tracking in the dashboard.</p>
                        
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Calls / Contacts per Week</label>
                                <div className="flex items-center gap-3">
                                    <input 
                                        type="number"
                                        value={settings.benchmarks?.callsPerWeek || 0}
                                        onChange={e => onUpdateSettings({...settings, benchmarks: { ...settings.benchmarks, callsPerWeek: parseInt(e.target.value) || 0 }})}
                                        className="w-24 p-2 bg-slate-50 border border-slate-200 rounded-lg text-lg font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                    />
                                    <span className="text-sm text-slate-500">calls</span>
                                </div>
                                <p className="text-xs text-slate-400 mt-1">Tracks leads moved from "New/NPU" to any contacted status.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Appointments Set per Week</label>
                                <div className="flex items-center gap-3">
                                    <input 
                                        type="number"
                                        value={settings.benchmarks?.apptsPerWeek || 0}
                                        onChange={e => onUpdateSettings({...settings, benchmarks: { ...settings.benchmarks, apptsPerWeek: parseInt(e.target.value) || 0 }})}
                                        className="w-24 p-2 bg-slate-50 border border-slate-200 rounded-lg text-lg font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                    />
                                    <span className="text-sm text-slate-500">appointments</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-900 rounded-xl shadow-lg p-8 text-white flex flex-col justify-center">
                        <h3 className="text-xl font-bold mb-4">Why Benchmarks Matter</h3>
                        <p className="text-slate-300 mb-4 leading-relaxed">
                            Sproutly uses these numbers to calculate "Catch-up" metrics. 
                        </p>
                        <p className="text-slate-300 leading-relaxed">
                            If an advisor is behind schedule by Wednesday, the system will automatically calculate how many <em>extra</em> calls they need to make on Thursday and Friday to hit the weekly target.
                        </p>
                    </div>
                </div>
            )}

            {/* CONFIG TAB (Dropdowns & Campaigns) */}
            {activeTab === 'config' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {/* Platforms */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-semibold text-slate-800">Platforms</h3>
                            <button onClick={handleAddPlatform} className="text-xs bg-slate-900 text-white px-2 py-1 rounded shadow hover:bg-slate-800">＋ Add</button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {settings.platforms.map(p => (
                                <div key={p} className="group relative">
                                    <span className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 cursor-default">{p}</span>
                                    <button onClick={() => handleRemoveItem('platforms', p)} className="absolute -top-1 -right-1 bg-red-500 text-white w-3 h-3 rounded-full flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Statuses */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-semibold text-slate-800">Statuses</h3>
                            <button onClick={handleAddStatus} className="text-xs bg-slate-900 text-white px-2 py-1 rounded shadow hover:bg-slate-800">＋ Add</button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {settings.statuses.map(s => (
                                <div key={s} className="group relative">
                                    <span className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 cursor-default">{s}</span>
                                    <button onClick={() => handleRemoveItem('statuses', s)} className="absolute -top-1 -right-1 bg-red-500 text-white w-3 h-3 rounded-full flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Campaigns (NEW) */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-semibold text-slate-800">Campaigns</h3>
                            <button onClick={handleAddCampaign} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded shadow hover:bg-indigo-700">＋ Add</button>
                        </div>
                        <p className="text-[10px] text-slate-400 mb-3">Active marketing tags for client assignment.</p>
                        <div className="flex flex-wrap gap-2">
                            {(settings.campaigns || []).map(c => (
                                <div key={c} className="group relative">
                                    <span className="px-2 py-1 bg-indigo-50 border border-indigo-100 rounded text-xs text-indigo-700 font-bold cursor-default">{c}</span>
                                    <button onClick={() => handleRemoveCampaign(c)} className="absolute -top-1 -right-1 bg-red-500 text-white w-3 h-3 rounded-full flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                                </div>
                            ))}
                            {(!settings.campaigns || settings.campaigns.length === 0) && (
                                <span className="text-xs text-slate-300 italic">No campaigns active.</span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {editingProduct && (
                <ProductTierModal 
                    product={editingProduct} 
                    onSave={handleProductStructureUpdate} 
                    onClose={() => setEditingProduct(null)} 
                />
            )}
        </div>
    </div>
  );
};
