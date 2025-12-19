
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-bold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.96] select-none whitespace-nowrap';
  
  const variants = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800 shadow-md focus:ring-slate-900',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-sm focus:ring-slate-200',
    ghost: 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:ring-slate-100',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 focus:ring-red-100',
    accent: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md focus:ring-indigo-500'
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-[10px] gap-1.5 uppercase tracking-wider',
    md: 'px-4 py-2.5 text-xs gap-2',
    lg: 'px-6 py-3.5 text-sm gap-3'
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : (
        <>
          {leftIcon && <span className="opacity-70">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="opacity-70">{rightIcon}</span>}
        </>
      )}
    </button>
  );
};

export default Button;
