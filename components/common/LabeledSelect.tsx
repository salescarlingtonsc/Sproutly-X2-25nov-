import React from 'react';

interface Option {
  label: string;
  value: string;
}

interface LabeledSelectProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: Option[];
}

const LabeledSelect: React.FC<LabeledSelectProps> = ({ label, value, onChange, options }) => (
  <div className="mb-2">
    <div className="text-xs font-bold mb-1 text-gray-700">{label}</div>
    <select 
      value={value} 
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
    >
      {options.map((opt, i) => (
        <option key={i} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

export default LabeledSelect;