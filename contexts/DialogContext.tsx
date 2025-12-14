
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import ConfirmDialog from '../components/common/ConfirmDialog';

interface DialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

interface DialogContextType {
  confirm: (options: DialogOptions) => Promise<boolean>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dialogConfig, setDialogConfig] = useState<DialogOptions | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const resolveRef = useRef<(value: boolean) => void>(() => {});

  const confirm = useCallback((options: DialogOptions) => {
    setDialogConfig(options);
    setIsOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = () => {
    setIsOpen(false);
    resolveRef.current(true);
  };

  const handleCancel = () => {
    setIsOpen(false);
    resolveRef.current(false);
  };

  return (
    <DialogContext.Provider value={{ confirm }}>
      {children}
      {dialogConfig && (
        <ConfirmDialog
          isOpen={isOpen}
          title={dialogConfig.title}
          message={dialogConfig.message}
          confirmText={dialogConfig.confirmText}
          cancelText={dialogConfig.cancelText}
          isDestructive={dialogConfig.isDestructive}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </DialogContext.Provider>
  );
};

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) throw new Error('useDialog must be used within DialogProvider');
  return context;
};
