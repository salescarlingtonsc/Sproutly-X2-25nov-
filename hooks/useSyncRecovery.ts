
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { syncInspector } from '../lib/syncInspector';

export const useSyncRecovery = (userId?: string, onRecovery?: () => void) => {
  useEffect(() => {
    const triggerRecovery = async (source: string) => {
      // Small debounce for mobile stability (allows network stack to wake up)
      await new Promise(r => setTimeout(r, 800));
      
      // 1. Break Zombie Locks Immediately
      db.resetLocks();
      
      syncInspector.log('info', 'RECOVERY_TRIGGER', `Active recovery from ${source}`);
      
      if (!userId) return;

      try {
          // 2. Refresh Session
          const { data: { session } } = await supabase!.auth.getSession();
          if (!session) {
            syncInspector.log('error', 'AUTH_STALE', 'Session expired during background wait');
            return;
          }

          // 3. Trigger External UI Callback
          if (onRecovery) onRecovery();

          // 4. Force a Queue Flush
          db.flushCloudQueue(userId);
      } catch (e) {}
    };

    // Standard Focus
    const handleFocus = () => triggerRecovery('window_focus');
    
    // Nuclear Option: iOS/Android pageshow triggers even if process was frozen
    const handlePageShow = () => triggerRecovery('pageshow_detected');

    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('online', () => triggerRecovery('network_online'));
    
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') triggerRecovery('visibility_visible');
    });

    // Backstop: Check for stuck items every 30s
    const interval = setInterval(() => {
        if (db.getQueueCount() > 0 && !db.isFlushing()) {
            triggerRecovery('interval_backstop');
        }
    }, 30000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
      clearInterval(interval);
    };
  }, [userId, onRecovery]);
};
