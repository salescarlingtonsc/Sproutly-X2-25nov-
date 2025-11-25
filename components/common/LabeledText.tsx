
import React from 'react';

interface LabeledTextProps {
  label: string;
  value: string | number;
  onChange: (val: string) => void;
  type?: string;
  placeholder?: string;
  onBlur?: () => void;
}

const LabeledText: React.FC<LabeledTextProps> = ({ label, value, onChange, type = 'text', placeholder = '', onBlur }) => (
  <div className="mb-2">
    <div className="text-xs font-bold mb-1.5 text-gray-700">{label}</div>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:border-blue-500 outline-none transition-colors bg-white"
    />
  </div>
);

export default LabeledText;
