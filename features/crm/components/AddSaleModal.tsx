
import React, { useState, useEffect } from 'react';
import { Product, Sale } from '../../../types';
import { toNum, fmtSGD } from '../../../lib/helpers';

interface AddSaleModalProps {
  clientName: string;
  products: Product[];
  advisorBanding: number;
  onClose: () => void;
  onSave: (sale: Sale) => void;
}

export const AddSaleModal: React.FC<AddSaleModalProps> = ({ clientName, products, advisorBanding, onClose, onSave }) => {
  const [productId, setProductId] = useState('');
  const [amount, setAmount] = useState('');
  const [inceptionDate, setInceptionDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Calculated state
  const [grossRevenue, setGrossRevenue] = useState(0);
  const [commissionRate, setCommissionRate] = useState(0);

  useEffect(() => {
    const premium = parseFloat(amount) || 0;
    const product = products.find(p => p.id === productId);
    
    if (product && premium > 0 && product.tiers) {
        // Find the applicable tier
        const tier = product.tiers.find(t => premium >= t.min && premium <= t.max);
        if (tier) {
            setCommissionRate(tier.rate);
            // Gross Revenue = Premium * Tier Rate
            // NOTE: This assumes 'grossRevenue' tracks the total commissionable revenue generated for the agency/advisor
            // before banding splits.
            setGrossRevenue(premium * tier.rate);
        } else {
            setCommissionRate(0);
            setGrossRevenue(0);
        }
    } else {
        setGrossRevenue(0);
        setCommissionRate(0);
    }
  }, [amount, productId, products]);

  const handleSave = () => {
    if (!productId || !amount) return;
    const product = products.find(p => p.id === productId);
    const sale: Sale = {
       id: `sale_${Date.now()}`,
       productId,
       productName: product?.name || 'Unknown',
       premiumAmount: parseFloat(amount),
       grossRevenue, // Save calculated GR
       inceptionDate: new Date(inceptionDate).toISOString(),
       date: new Date().toISOString(),
       status: 'Pending'
    };
    onSave(sale);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-emerald-50">
           <h3 className="font-bold text-emerald-800">Record Sale: {clientName}</h3>
           <button onClick={onClose} className="text-emerald-400 hover:text-emerald-700">✕</button>
        </div>
        <div className="p-6 space-y-4">
           <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Product</label>
              <select className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:border-emerald-500" value={productId} onChange={e => setProductId(e.target.value)}>
                 <option value="">Select Product...</option>
                 {products.map(p => <option key={p.id} value={p.id}>{p.provider} - {p.name}</option>)}
              </select>
           </div>
           
           <div className="grid grid-cols-2 gap-3">
               <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Premium ($)</label>
                  <input type="number" className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:border-emerald-500 font-bold" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
               </div>
               <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Inception Date</label>
                  <input type="date" className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:border-emerald-500" value={inceptionDate} onChange={e => setInceptionDate(e.target.value)} />
               </div>
           </div>

           {/* Live Calculation Preview */}
           <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
               <div className="flex justify-between items-center mb-1">
                   <span className="text-[10px] font-bold text-slate-500 uppercase">Comm. Rate</span>
                   <span className="text-xs font-bold text-slate-700">{(commissionRate * 100).toFixed(1)}%</span>
               </div>
               <div className="flex justify-between items-center">
                   <span className="text-[10px] font-bold text-slate-500 uppercase">Gross Revenue</span>
                   <span className="text-lg font-black text-emerald-600">{fmtSGD(grossRevenue)}</span>
               </div>
               <p className="text-[9px] text-slate-400 mt-1 italic text-right">*Contributes to FY Goal</p>
           </div>

           <div className="pt-2">
              <button onClick={handleSave} disabled={!productId || !amount} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition-colors disabled:opacity-50">Confirm Sale</button>
           </div>
        </div>
      </div>
    </div>
  );
};
