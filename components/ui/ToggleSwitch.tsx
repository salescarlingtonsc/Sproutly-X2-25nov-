
import React from 'react';

interface ToggleProps {
  enabled: boolean;
  onChange: (val: boolean) => void;
  label?: string;
  size?: 'sm' | 'md';
}

const ToggleSwitch: React.FC<ToggleProps> = ({ enabled, onChange, label, size = 'md' }) => {
  const toggleSize = size === 'sm' ? 'w-8 h-4.5' : 'w-11 h-6';
  const dotSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5';
  const translate = size === 'sm' ? 'translate-x-3.5' : 'translate-x-5';

  return (
    <label className="flex items-center gap-3 cursor-pointer group select-none">
      {label && <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] group-hover:text-slate-600 transition-colors">{label}</span>}
      <div className="relative">
        <input 
          type="checkbox" 
          className="sr-only" 
          checked={enabled} 
          onChange={(e) => onChange(e.target.checked)} 
        />
        <div className={`block ${toggleSize} rounded-full transition-colors duration-200 ${enabled ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
        <div className={`absolute left-0.5 top-0.5 bg-white ${dotSize} rounded-full transition-transform duration-200 transform shadow-sm ${enabled ? translate : 'translate-x-0'}`}></div>
      </div>
    </label>
  );
};

export default ToggleSwitch;
