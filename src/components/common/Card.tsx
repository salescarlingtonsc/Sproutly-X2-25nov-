import React, { ReactNode } from 'react';

type Tone = 'success' | 'info' | 'warn' | 'danger';

interface CardProps {
  title: string;
  value: string | number | ReactNode;
  tone?: Tone;
  icon?: string;
  onClick?: () => void;
}

const Card: React.FC<CardProps> = ({ title, value, tone = 'info', icon, onClick }) => {
  const toneColors = {
    success: { bg: 'bg-gradient-to-br from-emerald-100 to-emerald-200', border: 'border-emerald-500', text: 'text-emerald-900' },
    info: { bg: 'bg-gradient-to-br from-blue-100 to-blue-200', border: 'border-blue-500', text: 'text-blue-900' },
    warn: { bg: 'bg-gradient-to-br from-amber-100 to-amber-200', border: 'border-amber-500', text: 'text-amber-900' },
    danger: { bg: 'bg-gradient-to-br from-red-100 to-red-200', border: 'border-red-500', text: 'text-red-900' },
  };

  const c = toneColors[tone] || toneColors.info;

  return (
    <div 
      onClick={onClick}
      className={`
        group ${c.bg} border-2 ${c.border} rounded-lg p-4 mb-3 
        ${onClick ? 'cursor-pointer hover:shadow-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]' : ''}
      `}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className={`text-xs font-bold ${c.text} mb-1 uppercase flex items-center gap-2`}>
        {icon && <span>{icon}</span>}
        {title}
      </div>
      <div className={`text-lg font-bold ${c.text}`}>{value}</div>
    </div>
  );
};

export default Card;