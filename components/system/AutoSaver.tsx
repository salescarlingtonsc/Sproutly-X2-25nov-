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

  // Ref to track if it's the initial mount (to skip saving on load)
  const isMounted = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Watch ALL state objects that constitute the client data
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }

    // If no user, don't try to save
    if (!user) return;

    // Debounce the save (wait 2 seconds after last keystroke)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      console.log('🔄 Auto-saving changes...');
      onSave();
    }, 2000);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [
    // Dependency array contains all data parts. Any change here triggers the effect.
    profile, expenses, customExpenses, cpfState, cashflowState, 
    insuranceState, investorState, propertyState, wealthState, 
    retirement, nineBoxState, crmState, user
  ]);

  return null; // Invisible component
};

export default AutoSaver;