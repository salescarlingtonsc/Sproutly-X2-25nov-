
import React, { useState } from 'react';
import { Product, Sale } from '../../../types';

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
  
  const handleSave = () => {
    if (!productId || !amount) return;
    const product = products.find(p => p.id === productId);
    const sale: Sale = {
       id: `sale_${Date.now()}`,
       productId,
       productName: product?.name || 'Unknown',
       premiumAmount: parseFloat(amount),
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
           <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Premium ($)</label>
              <input type="number" className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:border-emerald-500" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
           </div>
           <div className="pt-2">
              <button onClick={handleSave} disabled={!productId || !amount} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition-colors disabled:opacity-50">Confirm Sale</button>
           </div>
        </div>
      </div>
    </div>
  );
};
