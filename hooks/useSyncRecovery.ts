
import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { syncInspector } from '../lib/syncInspector';

export const useSyncRecovery = (userId?: string, onRecovery?: (source: string) => void) => {
  const lastTickRef = useRef<number>(Date.now());
  const hasBootedRef = useRef(false);
  const debounceRef = useRef<any>(null);
  const lastRecoveryRef = useRef<number>(0);

  useEffect(() => {
    // The actual heavy lifting function for HARD RESETS (Tab wake, Focus)
    const executeRecovery = async (source: string) => {
      // Throttle: Prevent double-firing (e.g. visibility + time jump same second)
      const now = Date.now();
      if (now - lastRecoveryRef.current < 2000) return;
      lastRecoveryRef.current = now;

      // 1. Break Zombie Locks (Essential for 'Syncing...' stuck state)
      db.resetLocks();
      
      syncInspector.log('info', 'RECOVERY_TRIGGER', `Sync recovery triggered by: ${source}`);
      
      if (!userId) return;

      // 2. Force Session Verification / Refresh
      if (supabase) {
          const { data, error } = await supabase.auth.getSession();
          if (error || !data.session) {
              syncInspector.log('warn', 'AUTH_STALE', 'Session stale on wake. Attempting refresh...');
              const { error: refreshErr } = await supabase.auth.refreshSession();
              if (refreshErr) {
                  syncInspector.log('error', 'AUTH_FAIL', 'Refresh failed. User may need to re-login.');
              } else {
                  syncInspector.log('success', 'AUTH_OK', 'Session refreshed.');
              }
          }
      }

      // 3. Trigger External UI Callback (Hard Refresh UI)
      if (onRecovery) onRecovery(source);

      // 4. TRIPLE-CHECK FLUSH PROTOCOL
      db.flushCloudQueue(userId);

      // Retry after a short delay to account for network interface wake-up
      setTimeout(() => {
          if (db.getQueueCount() > 0) db.flushCloudQueue(userId);
      }, 1500);
    };

    // DEBOUNCER: Collects rapid-fire events into one execution
    const queueRecovery = (source: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            executeRecovery(source);
            debounceRef.current = null;
        }, 500);
    };

    // --- IMMEDIATE BOOT TRIGGER ---
    if (userId && !hasBootedRef.current) {
        hasBootedRef.current = true;
        executeRecovery('app_mount');
    }

    // --- EVENT LISTENERS ---
    const handleFocus = () => queueRecovery('window_focus');
    const handlePageShow = () => queueRecovery('pageshow_detected');
    const handleOnline = () => queueRecovery('network_online');
    
    // CRITICAL: Handle App Switch Return Immediately
    const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
            // Cancel pending debounces and execute immediately to fix "Call/Chat Return" sync lag
            if (debounceRef.current) clearTimeout(debounceRef.current);
            executeRecovery('visibility_immediate');
        } else {
            // OPTIONAL: Proactive lock reset on backgrounding to prevent stale states
            // Not doing this here yet to allow legitimate syncs to finish if they can.
        }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    // --- TIME JUMP DETECTOR (The "Sleep" Catcher) ---
    const interval = setInterval(() => {
        const now = Date.now();
        const diff = now - lastTickRef.current;
        
        // If lag > 3s, the CPU was likely throttled (tab backgrounded or screen off)
        if (diff > 3000) {
            executeRecovery('time_jump_detected');
        } else if (db.getQueueCount() > 0 && !db.isFlushing()) {
            // Passive Poke: If items exist but code thinks it's not flushing, poke it.
            if (userId) db.flushCloudQueue(userId);
        }
        
        lastTickRef.current = now;
    }, 1000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [userId, onRecovery]);
};
