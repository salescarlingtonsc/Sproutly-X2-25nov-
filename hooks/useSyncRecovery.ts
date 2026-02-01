
import { useEffect, useRef } from 'react';
import { db } from '../lib/db';
import { syncInspector } from '../lib/syncInspector';
import { supabase } from '../lib/supabase';

export const useSyncRecovery = (userId?: string, onRecovery?: (source: string) => void) => {
  const isRecoveringRef = useRef<boolean>(false);

  useEffect(() => {
    const triggerRecovery = async (source: string) => {
      // Prevent double-firing (e.g. online + visibility triggering simultaneously)
      if (isRecoveringRef.current) return;
      isRecoveringRef.current = true;

      syncInspector.log('info', 'RESUME_BOUNDARY', `Protocol Initiated: ${source}`, { 
          owner: 'Lifecycle', module: 'SyncRecovery', reason: source 
      });

      // 1. RADIO STABILIZATION (CRITICAL FOR MOBILE)
      // When app wakes, visibility=visible happens immediately, but LTE/5G takes ~500-1000ms to route packets.
      // We wait 1.2s to ensure the socket is actually viable.
      await new Promise(resolve => setTimeout(resolve, 1200));

      // 2. AUTH RESURRECTION
      // If app was backgrounded for >1hr, JWT is dead. RLS will block writes.
      // Force a session check/refresh before attempting any DB ops.
      try {
          if (supabase) {
              const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
              if (sessionError) {
                  syncInspector.log('warn', 'RESUME_BOUNDARY', 'Auth Pulse: Session Stale.', { 
                      owner: 'Lifecycle', module: 'SyncRecovery', reason: source 
                  });
              } else if (session?.user) {
                  syncInspector.log('success', 'RESUME_BOUNDARY', 'Auth Pulse: Secured.', { 
                      owner: 'Lifecycle', module: 'SyncRecovery', reason: source 
                  });
              }
          }
      } catch (e) {
          console.debug("Auth heartbeat skipped.");
      }

      // 3. EXECUTE ORCHESTRATOR
      // Now that radio is warm and auth is fresh, tell DB to flush the outbox.
      db.notifyResume(source);

      // 4. UI CALLBACK
      if (onRecovery) onRecovery(source);
      
      // Reset lock
      setTimeout(() => { isRecoveringRef.current = false; }, 2000);
    };

    const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
            triggerRecovery('visible');
        }
    };
    
    const handleOnline = () => triggerRecovery('online');

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [userId, onRecovery]);
};
