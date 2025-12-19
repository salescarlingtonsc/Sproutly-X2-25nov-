
import React from 'react';

interface Option {
  label: string;
  value: string;
}

interface SegmentedControlProps {
  options: Option[];
  value: string;
  onChange: (val: string) => void;
  className?: string;
}

const SegmentedControl: React.FC<SegmentedControlProps> = ({ options, value, onChange, className = '' }) => {
  const activeIndex = options.findIndex(o => o.value === value);
  
  return (
    <div className={`inline-flex p-1 bg-slate-100 rounded-xl relative ${className}`}>
      {/* Sliding Active Background */}
      <div 
        className="absolute h-[calc(100%-8px)] bg-white rounded-lg shadow-sm transition-all duration-220 ease-out z-0"
        style={{
          width: `calc(${(100 / options.length)}% - 4px)`,
          left: `calc(${(activeIndex * 100) / options.length}% + 4px)`,
          top: '4px'
        }}
      />
      
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`relative z-10 px-4 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors duration-200 whitespace-nowrap min-w-[70px] ${
            value === opt.value ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};

export default SegmentedControl;
