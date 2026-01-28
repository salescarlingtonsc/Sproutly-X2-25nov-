import React, { useEffect, useRef } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { useAuth } from '../../contexts/AuthContext';

interface AutoSaverProps {
  onSave: () => void;
}

const AutoSaver: React.FC<AutoSaverProps> = ({ onSave }) => {
  const { 
    profile, expenses, customExpenses, cpfState, cashflowState, 
    insuranceState, investorState, propertyState, wealthState, 
    retirement, nineBoxState, crmState 
  } = useClient();
  const { user } = useAuth();

  const isMounted = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);

  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  // Handle local data mutation and scheduled saves
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return; }
    if (!user) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      onSaveRef.current();
      timeoutRef.current = null;
    }, 2000);

    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [
    profile, expenses, customExpenses, cpfState, cashflowState, 
    insuranceState, investorState, propertyState, wealthState, 
    retirement, nineBoxState, crmState, user
  ]);

  // Beacon Protocol: Handle App Backgrounding
  useEffect(() => {
    const handleVisibilityChange = () => {
        if (!user) return;

        if (document.visibilityState === 'hidden') {
            // iOS Safety Rule: Never attempt a network flush on hidden.
            // Persist state to DURABLE IndexedDB only.
            if (timeoutRef.current) { 
                clearTimeout(timeoutRef.current); 
                timeoutRef.current = null; 
            }
            onSaveRef.current(); 
        }
        // NOTE: 'visible' trigger is now handled exclusively by hooks/useSyncRecovery.ts
        // to prevent duplicate SCHEDULE_FLUSH signals.
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user]);

  return null;
};

export default AutoSaver;