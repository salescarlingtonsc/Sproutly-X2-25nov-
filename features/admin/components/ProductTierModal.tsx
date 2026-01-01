
import React, { useState, useEffect } from 'react';
import { Product, ProductTier } from '../../../types';

interface ProductTierModalProps {
  product: Product;
  onSave: (updatedProduct: Product) => void;
  onClose: () => void;
}

export const ProductTierModal: React.FC<ProductTierModalProps> = ({ product, onSave, onClose }) => {
  const [tiers, setTiers] = useState<ProductTier[]>([]);

  useEffect(() => {
    // Deep copy to prevent mutation reference issues
    setTiers(JSON.parse(JSON.stringify(product.tiers || [])));
  }, [product]);

  const updateTier = (index: number, field: keyof ProductTier, value: number) => {
    const newTiers = [...tiers];
    newTiers[index] = { ...newTiers[index], [field]: value };
    setTiers(newTiers);
  };

  const addTier = () => {
    setTiers([...tiers, { min: 0, max: Infinity, rate: 0.5, dollarUp: 0 }]);
  };

  const removeTier = (index: number) => {
    setTiers(tiers.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    // Sort tiers by min value for consistency
    const sortedTiers = [...tiers].sort((a, b) => a.min - b.min);
    onSave({ ...product, tiers: sortedTiers });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
           <div>
               <h3 className="font-bold text-slate-800 text-lg">Edit Structure: {product.name}</h3>
               <p className="text-xs text-slate-500">{product.provider}</p>
           </div>
           <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
               <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
           </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-white">
            <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-slate-600">Define revenue tiers based on premium amount.</p>
                <button 
                    onClick={addTier}
                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Add Tier
                </button>
            </div>

            <div className="space-y-3">
                {tiers.map((tier, index) => (
                    <div key={index} className="flex flex-col md:flex-row gap-3 items-start md:items-center bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-sm relative group">
                        <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Min Premium ($)</label>
                                <input 
                                    type="number"
                                    className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-sm font-mono text-slate-900 focus:ring-1 focus:ring-emerald-500 outline-none"
                                    value={tier.min}
                                    onChange={(e) => updateTier(index, 'min', parseFloat(e.target.value))}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Max Premium ($)</label>
                                <div className="relative">
                                    <input 
                                        type="number"
                                        className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-sm font-mono text-slate-900 focus:ring-1 focus:ring-emerald-500 outline-none"
                                        value={tier.max === Infinity ? '' : tier.max}
                                        placeholder="∞"
                                        onChange={(e) => updateTier(index, 'max', e.target.value ? parseFloat(e.target.value) : Infinity)}
                                    />
                                    {tier.max === Infinity && <span className="absolute right-2 top-1.5 text-slate-400 text-xs">No Limit</span>}
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 text-emerald-600">Base GR (%)</label>
                                <input 
                                    type="number"
                                    step="0.1"
                                    className="w-full bg-white border border-emerald-200 rounded px-2 py-1.5 text-sm font-mono font-semibold text-emerald-700 focus:ring-1 focus:ring-emerald-500 outline-none"
                                    value={parseFloat((tier.rate * 100).toFixed(2))}
                                    onChange={(e) => updateTier(index, 'rate', parseFloat(e.target.value) / 100)}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Dollar Up (%)</label>
                                <input 
                                    type="number"
                                    step="0.1"
                                    className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-sm font-mono text-slate-900 focus:ring-1 focus:ring-emerald-500 outline-none"
                                    value={parseFloat((tier.dollarUp * 100).toFixed(2))}
                                    onChange={(e) => updateTier(index, 'dollarUp', parseFloat(e.target.value) / 100)}
                                />
                            </div>
                        </div>
                        <button 
                            onClick={() => removeTier(index)}
                            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors absolute -top-2 -right-2 md:static md:bg-transparent"
                            title="Remove Tier"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    </div>
                ))}
                {tiers.length === 0 && (
                    <div className="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                        No revenue tiers defined. Add one to start.
                    </div>
                )}
            </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium transition-colors">Cancel</button>
            <button onClick={handleSave} className="px-6 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold shadow-md hover:bg-slate-800 transition-colors">Save Structure</button>
        </div>
      </div>
    </div>
  );
};
