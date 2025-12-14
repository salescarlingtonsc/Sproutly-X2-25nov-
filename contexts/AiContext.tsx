
import React, { createContext, useContext, useState, ReactNode } from 'react';

interface AiContextType {
  isOpen: boolean;
  toggleAi: () => void;
  openAiWithPrompt: (prompt: string) => void;
  closeAi: () => void;
  activePrompt: string | null;
  clearPrompt: () => void;
}

const AiContext = createContext<AiContextType | undefined>(undefined);

export const AiProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activePrompt, setActivePrompt] = useState<string | null>(null);

  const toggleAi = () => setIsOpen(prev => !prev);
  
  const openAiWithPrompt = (prompt: string) => {
    setActivePrompt(prompt);
    setIsOpen(true);
  };

  const closeAi = () => setIsOpen(false);
  
  const clearPrompt = () => setActivePrompt(null);

  return (
    <AiContext.Provider value={{ isOpen, toggleAi, openAiWithPrompt, closeAi, activePrompt, clearPrompt }}>
      {children}
    </AiContext.Provider>
  );
};

export const useAi = () => {
  const context = useContext(AiContext);
  if (context === undefined) {
    throw new Error('useAi must be used within an AiProvider');
  }
  return context;
};
