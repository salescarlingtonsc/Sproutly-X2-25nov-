import React from 'react';
import { toNum, fmtSGD } from '../../lib/helpers';
import { InvestorState } from '../../types';

interface InvestorTabProps {
  investorState: InvestorState;
  setInvestorState: (s: InvestorState) => void;
}

const InvestorTab: React.FC<InvestorTabProps> = ({ investorState, setInvestorState }) => {
  const { portfolioValue, portfolioType } = investorState;

  const updateState = (key: keyof InvestorState, value: any) => {
    setInvestorState({ ...investorState, [key]: value });
  };
  
  const value = toNum(portfolioValue, 0);
  
  // Simplified for brevity, logic remains same as original
  const scenarios = {
    'stock-picking': { best: 0.30, crash: -0.50 },
    'diversified': { best: 0.25, crash: -0.35 },
    'index': { best: 0.20, crash: -0.30 }
  };
  const scenario = scenarios[portfolioType as keyof typeof scenarios] || scenarios['index'];

  return (
    <div className="p-5">
      <div className="bg-gradient-to-br from-indigo-900 to-indigo-800 border-2 border-indigo-500 rounded-xl p-6 mb-5 shadow-md">
        <h3 className="m-0 text-white text-2xl font-bold">Investor Education</h3>
      </div>
      <div className="bg-white border-l-4 border-red-600 rounded-xl p-6 mb-5 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2">Your Portfolio Value (SGD)</label>
            <input
              type="text"
              value={portfolioValue}
              onChange={(e) => updateState('portfolioValue', e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg font-bold bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2">Strategy</label>
            <select 
              value={portfolioType} 
              onChange={(e) => updateState('portfolioType', e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg bg-white"
            >
              <option value="stock-picking">Stock Picking</option>
              <option value="diversified">Diversified</option>
              <option value="index">Index Fund</option>
            </select>
          </div>
        </div>
        <div className="p-5 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl mb-5 text-center text-white">
          <div className="text-4xl font-extrabold mb-1">{fmtSGD(value)}</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
           <div className="p-3 bg-emerald-50 border border-emerald-500 rounded text-center">
              <div className="text-xs font-bold">BEST CASE (+{(scenario.best * 100).toFixed(0)}%)</div>
              <div className="font-bold text-emerald-800">{fmtSGD(value * (1 + scenario.best))}</div>
           </div>
           <div className="p-3 bg-red-50 border border-red-500 rounded text-center">
              <div className="text-xs font-bold">CRASH ({(scenario.crash * 100).toFixed(0)}%)</div>
              <div className="font-bold text-red-800">{fmtSGD(value * (1 + scenario.crash))}</div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default InvestorTab;