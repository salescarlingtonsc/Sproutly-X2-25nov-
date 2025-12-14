
import React, { ReactNode } from 'react';

interface SectionCardProps {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

const SectionCard: React.FC<SectionCardProps> = ({ title, action, children, className, noPadding = false }) => {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden ${className || ''}`}>
      {(title || action) && (
        <div className="px-6 py-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/30">
          {title && (
            <div className="font-bold text-slate-800 text-sm uppercase tracking-wide flex items-center gap-2">
              {title}
            </div>
          )}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-6'}>
        {children}
      </div>
    </div>
  );
};

export default SectionCard;
