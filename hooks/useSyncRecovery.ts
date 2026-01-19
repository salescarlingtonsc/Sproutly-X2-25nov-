
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { syncInspector } from '../lib/syncInspector';

export const useSyncRecovery = (userId?: string) => {
  useEffect(() => {
    const triggerRecovery = async (source: string) => {
      syncInspector.log('info', 'RECOVERY_TRIGGER', `Recovery started via ${source}`);
      
      if (!userId) return;

      // 1. Check Auth
      const { data: { session }, error } = await supabase!.auth.getSession();
      
      if (error || !session) {
        syncInspector.log('error', 'AUTH_STALE', 'Session invalid on recovery check');
        syncInspector.updateSnapshot({ lastSessionErr: 'Session Invalid' });
        // Optionally trigger re-login flow here if needed, but for now just log
        return;
      }

      syncInspector.updateSnapshot({ lastSessionOkAt: Date.now(), lastSessionErr: null });

      // 2. Flush
      db.flushCloudQueue(userId);
    };

    const handleFocus = () => triggerRecovery('window_focus');
    const handleOnline = () => triggerRecovery('network_online');
    const handleVisibility = () => {
        if (document.visibilityState === 'visible') triggerRecovery('visibility_visible');
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    // 3. Gentle Interval Loop (Backstop)
    const interval = setInterval(() => {
        const snapshot = syncInspector.getSnapshot();
        if (snapshot.queueCount > 0 && !snapshot.isFlushing && snapshot.online) {
            triggerRecovery('interval_backstop');
        }
    }, 20000); // Check every 20s

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, [userId]);
};
