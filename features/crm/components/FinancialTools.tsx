
import React from 'react';
import { Client } from '../../../types';

interface FinancialToolsProps {
  client: Client;
  onUpdate: (updatedClient: Client) => void;
}

export const FinancialTools: React.FC<FinancialToolsProps> = ({ client }) => {
  return (
    <div className="space-y-4 p-4 text-center">
      <div className="p-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
        <h3 className="text-sm font-bold text-slate-700 mb-2">Financial Tools</h3>
        <p className="text-xs text-slate-500 mb-4">
          Access comprehensive financial calculators in the main navigation tabs.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
           <span className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs text-slate-600">CPF Calculator</span>
           <span className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs text-slate-600">Wealth Projector</span>
           <span className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs text-slate-600">Insurance Gap</span>
        </div>
      </div>
    </div>
  );
};
