
import React, { useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastProps {
  id: string;
  type: ToastType;
  message: string;
  onClose: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ id, type, message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [id, onClose]);

  const styles = {
    success: 'bg-white border-emerald-500 text-emerald-800 shadow-emerald-100',
    error: 'bg-white border-red-500 text-red-800 shadow-red-100',
    info: 'bg-white border-indigo-500 text-indigo-800 shadow-indigo-100'
  };

  const icons = {
    success: '✅',
    error: '⚠️',
    info: 'ℹ️'
  };

  return (
    <div className={`
      flex items-center gap-3 px-4 py-3 rounded-xl border-l-4 shadow-lg min-w-[300px] max-w-md animate-slide-in-right bg-white pointer-events-auto
      ${styles[type]}
    `}>
      <span className="text-lg">{icons[type]}</span>
      <p className="text-sm font-bold flex-1">{message}</p>
      <button 
        onClick={() => onClose(id)} 
        className="text-gray-400 hover:text-gray-600 transition-colors"
      >
        ✕
      </button>
    </div>
  );
};

export default Toast;
