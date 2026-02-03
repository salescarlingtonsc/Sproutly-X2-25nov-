
import { useEffect, useRef } from 'react';
import { db } from '../lib/db';
import { syncInspector } from '../lib/syncInspector';
import { supabase } from '../lib/supabase';

// INSTANT REFRESH THRESHOLD: 500ms
// If the app is hidden for more than 0.5 seconds, we force a reload.
const REFRESH_THRESHOLD_MS = 500; 

export const useSyncRecovery = (userId?: string, onRecovery?: (source: string) => void) => {
  const isRecoveringRef = useRef<boolean>(false);
  const lastHiddenTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const triggerRecovery = async (source: string) => {
      if (isRecoveringRef.current) return;
      isRecoveringRef.current = true;

      syncInspector.log('info', 'RESUME_BOUNDARY', `Protocol Initiated: ${source}`, { 
          owner: 'Lifecycle', module: 'SyncRecovery', reason: source 
      });

      // 1. Radio Stabilization
      await new Promise(resolve => setTimeout(resolve, 1200));

      // 2. Auth Integrity
      try {
          if (supabase) {
              const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
              if (sessionError) {
                  syncInspector.log('warn', 'RESUME_BOUNDARY', 'Auth Pulse: Stale session detected.', { 
                      owner: 'Lifecycle', module: 'SyncRecovery', reason: source 
                  });
              } else if (session?.user) {
                  syncInspector.log('success', 'RESUME_BOUNDARY', 'Auth Pulse: Secure context restored.', { 
                      owner: 'Lifecycle', module: 'SyncRecovery', reason: source 
                  });
              }
          }
      } catch (e) {
          console.debug("Auth heartbeat skipped.");
      }

      // 3. Command Orchestrator to flush
      db.notifyResume(source);

      // 4. Trigger UI callback
      if (onRecovery) onRecovery(source);
      
      setTimeout(() => { isRecoveringRef.current = false; }, 2000);
    };

    const handleVisibility = () => {
        if (document.visibilityState === 'hidden') {
            // Mark time immediately upon leaving
            lastHiddenTimeRef.current = Date.now();
        } else if (document.visibilityState === 'visible') {
            const timeAway = Date.now() - lastHiddenTimeRef.current;
            
            // INSTANT HARD REFRESH CHECK
            if (timeAway > REFRESH_THRESHOLD_MS) {
                console.warn(`[Lifecycle] Background duration: ${(timeAway/1000).toFixed(1)}s. Executing HARD REFRESH.`);
                syncInspector.log('warn', 'RESUME_BOUNDARY', `Hard Refresh Triggered: Away for ${(timeAway/1000).toFixed(1)}s`, { 
                    owner: 'Lifecycle', module: 'SyncRecovery', reason: 'instant_refresh' 
                });
                
                // FORCE NAVIGATE to same URL with timestamp query param to bust cache and force reload
                const currentUrl = new URL(window.location.href);
                currentUrl.searchParams.set('ts', Date.now().toString());
                window.location.href = currentUrl.toString();
                
                return;
            }

            // Normal Soft Recovery
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
