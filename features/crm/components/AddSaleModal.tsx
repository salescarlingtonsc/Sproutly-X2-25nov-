import React, { useState, useEffect } from 'react';
import { Product, Sale } from '../../../types';
import { toNum, fmtSGD } from '../../../lib/helpers';

interface AddSaleModalProps {
  clientName: string;
  products: Product[];
  advisorBanding: number;
  onClose: () => void;
  onSave: (sale: Sale) => void;
  initialSale?: Sale; // Added for editing mode
}

export const AddSaleModal: React.FC<AddSaleModalProps> = ({ clientName, products, advisorBanding, onClose, onSave, initialSale }) => {
  const [productId, setProductId] = useState(initialSale?.productId || '');
  const [productName, setProductName] = useState(initialSale?.productName || '');
  const [amount, setAmount] = useState(initialSale?.premiumAmount?.toString() || '');
  const [inceptionDate, setInceptionDate] = useState(
      initialSale?.inceptionDate ? new Date(initialSale.inceptionDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState(initialSale?.notes || '');
  
  // Editable Calculation State
  const [grossRevenue, setGrossRevenue] = useState(initialSale?.grossRevenue || 0);
  const [commissionRate, setCommissionRate] = useState(0);
  
  // Track if user has manually overridden the calculated values to prevent auto-overwrite
  const [isManualOverride, setIsManualOverride] = useState(!!initialSale);

  // Initialize rate for editing
  useEffect(() => {
      if (initialSale && initialSale.premiumAmount > 0) {
          setCommissionRate((initialSale.grossRevenue / initialSale.premiumAmount) * 100);
      }
  }, [initialSale]);

  // Sync Product Name on Selection
  useEffect(() => {
      if (productId) {
          const p = products.find(prod => prod.id === productId);
          if (p) setProductName(p.name);
      }
  }, [productId, products]);

  // Auto-Calculate based on Product Tiers (Only if not manually overridden)
  useEffect(() => {
    if (isManualOverride && !initialSale) return; 
    
    const premium = parseFloat(amount) || 0;
    const product = products.find(p => p.id === productId);
    
    // Only update if we are NOT in simple edit mode where we haven't changed the critical factors yet
    const isSameAsInitial = initialSale && initialSale.productId === productId && initialSale.premiumAmount === premium;
    
    if (!isSameAsInitial) {
        if (product && premium > 0 && product.tiers) {
            // Find the applicable tier
            const tier = product.tiers.find(t => premium >= t.min && premium <= t.max);
            if (tier) {
                setCommissionRate(tier.rate * 100); // Store as percentage 50%
                setGrossRevenue(premium * tier.rate);
            }
        }
    }
  }, [amount, productId, products]);

  const handleRateChange = (val: string) => {
      setIsManualOverride(true);
      const rate = parseFloat(val);
      setCommissionRate(rate);
      const premium = parseFloat(amount) || 0;
      if (!isNaN(rate)) {
          setGrossRevenue(premium * (rate / 100));
      }
  };

  const handleRevenueChange = (val: string) => {
      setIsManualOverride(true);
      const rev = parseFloat(val);
      setGrossRevenue(rev);
      const premium = parseFloat(amount) || 0;
      if (premium > 0 && !isNaN(rev)) {
          setCommissionRate((rev / premium) * 100);
      }
  };

  const handleSave = () => {
    if (!amount || (!productId && !productName)) return;
    
    const sale: Sale = {
       id: initialSale?.id || `sale_${Date.now()}`,
       productId: productId || 'custom',
       productName: productName || 'Custom Product',
       premiumAmount: parseFloat(amount),
       grossRevenue: Number(grossRevenue), // Ensure number
       inceptionDate: new Date(inceptionDate).toISOString(),
       date: initialSale?.date || new Date().toISOString(),
       status: 'Closed',
       notes: notes
    };
    onSave(sale);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-emerald-50 shrink-0">
           <h3 className="font-bold text-emerald-800">{initialSale ? 'Edit Sale' : 'Record Sale'}: {clientName}</h3>
           <button onClick={onClose} className="text-emerald-400 hover:text-emerald-700">✕</button>
        </div>
        
        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
           <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Select Product</label>
              <select className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:border-emerald-500" value={productId} onChange={e => setProductId(e.target.value)}>
                 <option value="">-- Choose or Type Below --</option>
                 {products.map(p => <option key={p.id} value={p.id}>{p.provider} - {p.name}</option>)}
              </select>
           </div>

           <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Product Name</label>
              <input type="text" className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:border-emerald-500 font-bold" placeholder="e.g. Wealth Sol" value={productName} onChange={e => setProductName(e.target.value)} />
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

           {/* Manual Override Section */}
           <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
               <div className="flex justify-between items-center mb-2">
                   <label className="text-[10px] font-bold text-slate-500 uppercase">Comm. Rate (%)</label>
                   <input 
                      type="number" 
                      className="w-20 text-right p-1 text-xs font-bold border border-slate-300 rounded outline-none focus:border-emerald-500"
                      value={commissionRate ? parseFloat(commissionRate.toFixed(2)) : ''}
                      onChange={(e) => handleRateChange(e.target.value)}
                      placeholder="0.0"
                   />
               </div>
               <div className="flex justify-between items-center">
                   <label className="text-[10px] font-bold text-slate-500 uppercase">Gross Revenue ($)</label>
                   <input 
                      type="number" 
                      className="w-24 text-right p-1 text-sm font-black text-emerald-600 border border-slate-300 rounded outline-none focus:border-emerald-500"
                      value={grossRevenue ? parseFloat(grossRevenue.toFixed(2)) : ''}
                      onChange={(e) => handleRevenueChange(e.target.value)}
                      placeholder="0.00"
                   />
               </div>
               <p className="text-[9px] text-slate-400 mt-2 italic text-right">*Adjusting either value updates the other</p>
           </div>

           <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Internal Notes (Optional)</label>
              <textarea 
                className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:border-emerald-500 resize-none h-16" 
                placeholder="e.g. Split case with John, policy #12345" 
                value={notes} 
                onChange={e => setNotes(e.target.value)} 
              />
           </div>

           <div className="pt-2">
              <button onClick={handleSave} disabled={!amount} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition-colors disabled:opacity-50">
                  {initialSale ? 'Update Sale Record' : 'Confirm Sale'}
              </button>
           </div>
        </div>
      </div>
    </div>
  );
};