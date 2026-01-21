import React, { useEffect, useRef } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { useAuth } from '../../contexts/AuthContext';
import { syncInspector } from '../../lib/syncInspector';

interface AutoSaverProps {
  // Updated interface to allow for asynchronous save handlers
  onSave: () => void | Promise<void>;
}

const AutoSaver: React.FC<AutoSaverProps> = ({ onSave }) => {
  const { 
    profile, expenses, customExpenses, cpfState, cashflowState, 
    insuranceState, investorState, propertyState, wealthState, 
    retirement, nineBoxState, crmState 
  } = useClient();
  const { user } = useAuth();

  // Ref to track if it's the initial mount
  const isMounted = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Keep latest onSave reference to avoid re-binding event listeners
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  // 1. DATA WATCHER: Debounce Save
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }

    if (!user) return;

    // GHOST PROTOCOL: Prevent saving if the client is empty
    const hasIdentity = 
        (profile.name && profile.name.trim() !== '') || 
        (profile.phone && profile.phone.trim() !== '') || 
        (crmState.company && crmState.company.trim() !== '');

    if (!hasIdentity) return;

    // Clear existing timer
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // Set new timer
    timeoutRef.current = setTimeout(() => {
      console.log('🔄 Auto-saving changes...');
      onSaveRef.current();
      timeoutRef.current = null;
    }, 2000);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [
    profile, expenses, customExpenses, cpfState, cashflowState, 
    insuranceState, investorState, propertyState, wealthState, 
    retirement, nineBoxState, crmState, user
  ]);

  // 2. FREEZE PROTECTION: Save immediately on App Switch / Tab Hide
  useEffect(() => {
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            // If a save was pending (timer running), force it NOW before browser freezes CPU
            if (timeoutRef.current) {
                console.log('💤 App backgrounding: Forcing immediate save.');
                syncInspector.log('warn', 'LOCAL_WRITE', 'Forced save due to backgrounding');
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
                // handleSave is async, catch it here as it's a floating promise now
                try {
                    // FIX: Explicitly cast to any to handle void vs Promise check without TS errors
                    const result: any = onSaveRef.current();
                    if (result && result instanceof Promise) {
                        result.catch(() => {});
                    }
                } catch (e) {}
            }
        }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return null;
};

export default AutoSaver;