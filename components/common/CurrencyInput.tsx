
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
    
    // Convert to string to handle both numbers and strings safely
    const strVal = String(value);
    
    // Check for negative sign
    const isNegative = strVal.startsWith('-');
    const cleanVal = isNegative ? strVal.substring(1) : strVal;
    
    // Split integer and decimal parts
    const parts = cleanVal.split('.');
    let integerPart = parts[0];
    
    // Add commas to integer part
    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    // Reconstruct
    const formatted = (isNegative ? '-' : '') + integerPart + (parts.length > 1 ? '.' + parts[1] : '');
    
    setDisplayValue(formatted);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    
    // 1. Allow numbers, dots, and negative sign
    let raw = input.replace(/[^0-9.-]/g, '');
    
    // 2. Handle Negative Sign Placement (must be at start)
    // If user types '-' anywhere, we infer they want a negative number
    const hasNegative = raw.includes('-');
    
    // Strip all internal signs/dots for cleanup first
    // We want to allow exactly one dot, and one minus at start
    
    // Remove all minus signs temporarily
    let clean = raw.replace(/-/g, '');
    
    // Add minus back to start if it existed anywhere
    if (hasNegative) {
        clean = '-' + clean;
    }
    
    // 3. Prevent multiple decimal points (e.g. "1.2.3")
    const parts = clean.split('.');
    if (parts.length > 2) {
       clean = parts[0] + '.' + parts.slice(1).join('');
    }

    // 4. Pass raw value to parent (e.g. "-1000.50")
    onChange(clean);
  };

  return (
    <div className="relative group">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold group-focus-within:text-indigo-500 transition-colors select-none">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder}
        className={`w-full pl-6 pr-3 py-2.5 bg-gray-50 border-2 border-transparent rounded-xl text-sm font-bold text-slate-900 outline-none focus:bg-white focus:border-indigo-500 focus:shadow-lg focus:shadow-indigo-100 transition-all placeholder-gray-300 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      />
    </div>
  );
};

export default CurrencyInput;
