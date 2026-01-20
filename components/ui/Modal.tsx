import React from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer }) => {
  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[6px] animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between bg-slate-50/40 shrink-0">
          <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-[0.2em]">{title}</h3>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-900 transition-colors p-1 text-sm">✕</button>
        </div>
        
        <div className="p-8 overflow-y-auto custom-scrollbar">
          {children}
        </div>

        {footer && (
          <div className="px-8 py-5 bg-slate-50/80 border-t border-slate-100 flex justify-end gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default Modal;