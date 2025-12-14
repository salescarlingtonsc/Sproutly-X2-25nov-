
import React from 'react';
import CurrencyInput from './CurrencyInput';

interface LabeledTextProps {
  label: string;
  value: string | number;
  onChange: (val: string) => void;
  type?: string;
  placeholder?: string;
  onBlur?: () => void;
  disabled?: boolean;
  isCurrency?: boolean; // New prop to trigger currency mode
}

const LabeledText: React.FC<LabeledTextProps> = ({ 
  label, value, onChange, type = 'text', placeholder = '', onBlur, disabled = false, isCurrency = false 
}) => {
  // Auto-detect currency intent if label contains "$" or type is number-ish
  const useCurrency = isCurrency || label.includes('($)') || label.includes('Amount') || label.includes('Price') || label.includes('Salary') || label.includes('Income') || label.includes('Premium');

  return (
    <div className="mb-2 group">
      <div className="text-[10px] font-bold mb-1.5 text-gray-500 uppercase tracking-wide group-focus-within:text-indigo-600 transition-colors">
        {label}
      </div>
      
      {useCurrency ? (
        <CurrencyInput 
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={`
            w-full px-4 py-2.5 bg-gray-50 border-2 border-transparent rounded-xl text-sm font-bold text-slate-900 outline-none 
            focus:bg-white focus:border-indigo-500 focus:shadow-lg focus:shadow-indigo-100 transition-all placeholder-gray-300
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        />
      )}
    </div>
  );
};

export default LabeledText;
