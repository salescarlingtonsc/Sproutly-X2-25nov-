
import React from 'react';

interface LabeledTextProps {
  label: string;
  value: string | number;
  onChange: (val: string) => void;
  type?: string;
  placeholder?: string;
  onBlur?: () => void;
  disabled?: boolean;
}

const LabeledText: React.FC<LabeledTextProps> = ({ label, value, onChange, type = 'text', placeholder = '', onBlur, disabled = false }) => (
  <div className="mb-2">
    <div className="text-xs font-bold mb-1.5 text-gray-700">{label}</div>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm outline-none transition-colors ${
        disabled 
          ? 'bg-gray-100 text-gray-500 cursor-not-allowed' 
          : 'bg-white text-gray-900 focus:border-blue-500'
      }`}
    />
  </div>
);

export default LabeledText;
