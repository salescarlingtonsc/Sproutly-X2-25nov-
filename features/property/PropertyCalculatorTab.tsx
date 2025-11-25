import React from 'react';
import { toNum, fmtSGD } from '../../lib/helpers';
import LabeledText from '../../components/common/LabeledText';
import LabeledSelect from '../../components/common/LabeledSelect';
import { CpfData, PropertyState } from '../../types';

interface PropertyCalculatorTabProps {
  age?: number;
  cpfData?: CpfData | null;
  propertyState: PropertyState;
  setPropertyState: (s: PropertyState) => void;
}

const PropertyCalculatorTab: React.FC<PropertyCalculatorTabProps> = ({ 
  age = 30, cpfData, propertyState, setPropertyState 
}) => {
  const { propertyPrice, propertyType, annualValue, downPaymentPercent, loanTenure, interestRate, useCpfOa, cpfOaAmount } = propertyState;

  const updateState = (key: keyof PropertyState, value: any) => {
    setPropertyState({ ...propertyState, [key]: value });
  };

  // Calculations
  const calculateBSD = (price: number) => {
    if (price <= 0) return 0;
    if (price <= 180000) return price * 0.01;
    if (price <= 360000) return 1800 + (price - 180000) * 0.02;
    if (price <= 1000000) return 5400 + (price - 360000) * 0.03;
    if (price <= 1500000) return 24600 + (price - 1000000) * 0.04;
    return 44600 + (price - 1500000) * 0.05;
  };

  const price = toNum(propertyPrice);
  const downPayment = price * (toNum(downPaymentPercent) / 100);
  const bsd = calculateBSD(price);
  const legalFees = price > 0 ? Math.min(3000, price * 0.004) : 0;
  const totalUpfrontCash = downPayment + bsd + legalFees + 500; // + valuation
  
  const cpfOaUsed = useCpfOa ? Math.min(toNum(cpfOaAmount), downPayment) : 0;
  const cashNeeded = totalUpfrontCash - cpfOaUsed;
  
  const loanAmount = price - downPayment;
  const monthlyRate = toNum(interestRate) / 100 / 12;
  const numPayments = toNum(loanTenure) * 12;
  const monthlyPayment = loanAmount > 0 && monthlyRate > 0
    ? loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1)
    : 0;

  return (
    <div className="p-5">
      <div className="bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-500 rounded-xl p-6 mb-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="text-4xl">🏠</div>
          <div>
            <h3 className="m-0 text-amber-900 text-xl font-bold">Property & Mortgage Calculator</h3>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl p-6 mb-5 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <LabeledText label="Property Price" value={propertyPrice} onChange={(v) => updateState('propertyPrice', v)} placeholder="800000" />
          <LabeledSelect
            label="Property Type"
            value={propertyType}
            onChange={(v) => updateState('propertyType', v)}
            options={[
              { label: 'HDB Flat', value: 'hdb' },
              { label: 'Condominium', value: 'condo' },
              { label: 'Landed', value: 'landed' }
            ]}
          />
          <LabeledText label="Loan Tenure (years)" value={loanTenure} onChange={(v) => updateState('loanTenure', v)} placeholder="25" />
          <LabeledText label="Interest Rate (%)" value={interestRate} onChange={(v) => updateState('interestRate', v)} placeholder="3.5" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <LabeledText label="Down Payment (%)" value={downPaymentPercent} onChange={(v) => updateState('downPaymentPercent', v)} placeholder="25" />
           <div className="pt-6">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <input type="checkbox" checked={useCpfOa} onChange={(e) => updateState('useCpfOa', e.target.checked)} />
              Use CPF OA for Downpayment
            </label>
            {useCpfOa && (
              <input 
                type="text" 
                placeholder="CPF OA Amount" 
                value={cpfOaAmount}
                onChange={(e) => updateState('cpfOaAmount', e.target.value)}
                className="w-full p-2 border rounded text-sm mt-2 bg-white"
              />
            )}
          </div>
        </div>
      </div>

      {price > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
           <div className="bg-white p-6 rounded-xl border-2 border-blue-500 shadow-sm">
               <h3 className="mt-0 mb-4 text-blue-800 font-bold">💰 Upfront Costs</h3>
               <div className="flex justify-between mb-2"><span className="text-gray-600">Downpayment</span><span className="font-bold">{fmtSGD(downPayment)}</span></div>
               <div className="flex justify-between mb-2"><span className="text-gray-600">Stamp Duty (BSD)</span><span className="font-bold">{fmtSGD(bsd)}</span></div>
               <div className="flex justify-between pt-3 border-t"><span className="font-bold text-blue-800">Cash Needed</span><span className="font-bold text-xl text-blue-600">{fmtSGD(cashNeeded)}</span></div>
           </div>
           <div className="bg-white p-6 rounded-xl border-2 border-emerald-500 shadow-sm">
               <h3 className="mt-0 mb-4 text-emerald-800 font-bold">📅 Monthly</h3>
               <div className="flex justify-between pt-3 border-t"><span className="font-bold text-emerald-800">Mortgage Payment</span><span className="font-bold text-xl text-emerald-600">{fmtSGD(monthlyPayment)}</span></div>
           </div>
        </div>
      )}
    </div>
  );
};

export default PropertyCalculatorTab;