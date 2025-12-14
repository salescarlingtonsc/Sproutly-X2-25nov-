
import React, { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: string;
  action?: ReactNode;
  className?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, icon, action, className }) => {
  return (
    <div className={`flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 ${className}`}>
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
          {icon && <span className="text-3xl">{icon}</span>}
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm font-medium text-slate-500 mt-1 max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <div className="flex items-center gap-3">
          {action}
        </div>
      )}
    </div>
  );
};

export default PageHeader;
