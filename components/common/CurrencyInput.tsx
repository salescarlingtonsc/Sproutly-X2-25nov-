
import React, { useState, useEffect } from 'react';

interface CurrencyInputProps {
  value: string | number;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const CurrencyInput: React.FC<CurrencyInputProps> = ({ value, onChange, placeholder, className, disabled }) => {
  // Internal state to manage display value (with commas) separately from raw value
  const [displayValue, setDisplayValue] = useState('');

  // Sync internal state with external prop, adding commas
  useEffect(() => {
    if (value === '' || value === undefined || value === null) {
      setDisplayValue('');
      return;
    }
    // Ensure we don't double format or mess up if user is typing
    const num = String(value).replace(/[^0-9.]/g, '');
    if (!num) {
      setDisplayValue('');
      return;
    }
    const parts = num.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    setDisplayValue(parts.join('.'));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    
    // 1. Remove non-numeric characters (keep decimal)
    const raw = input.replace(/[^0-9.]/g, '');
    
    // 2. Pass raw value to parent
    onChange(raw);

    // 3. Update display immediately for responsiveness
    // (The useEffect will refine it, but this prevents jumping)
    setDisplayValue(input);
  };

  return (
    <div className="relative group">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold group-focus-within:text-indigo-500 transition-colors">$</span>
      <input
        type="text"
        value={displayValue}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder}
        className={`w-full pl-7 pr-3 py-2.5 bg-gray-50 border-2 border-transparent rounded-xl text-sm font-bold text-slate-900 outline-none focus:bg-white focus:border-indigo-500 focus:shadow-lg focus:shadow-indigo-100 transition-all placeholder-gray-300 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      />
    </div>
  );
};

export default CurrencyInput;
