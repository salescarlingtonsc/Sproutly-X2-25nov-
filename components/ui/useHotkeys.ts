
import { useEffect } from 'react';

export const useHotkeys = (key: string, callback: () => void, modifiers: { meta?: boolean; ctrl?: boolean; shift?: boolean } = {}) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMeta = modifiers.meta ? (event.metaKey || event.ctrlKey) : true;
      const isShift = modifiers.shift ? event.shiftKey : true;
      const isKey = event.key.toLowerCase() === key.toLowerCase();
      
      if (isMeta && isShift && isKey) {
        event.preventDefault();
        callback();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [key, callback, modifiers]);
};
