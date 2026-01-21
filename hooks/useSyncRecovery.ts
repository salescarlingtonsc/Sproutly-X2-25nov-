import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { syncInspector } from '../lib/syncInspector';

export const useSyncRecovery = (userId?:  string, onRecovery?: (source: string) => void) => {
  const lastTickRef = useRef<number>(Date.now());
  const hasBootedRef = useRef(false);
  const debounceRef = useRef<any>(null);
  const lastRecoveryRef = useRef<number>(0);

  useEffect(() => {
    const executeRecovery = async (source: string) => {
      const now = Date.now();
      if (now - lastRecoveryRef.current < 2000) return;
      lastRecoveryRef.current = now;

      db.resetLocks();
      
      syncInspector.log('info', 'RECOVERY_TRIGGER', `Consolidated recovery exec:  ${source}`);
      
      if (! userId) return;

      // ⭐ KEY FIX: Add session refresh BEFORE attempting flush
      if (supabase) {
          try {
              const { data, error } = await supabase. auth.getSession();
              if (error || !data. session) {
                  syncInspector.log('warn', 'AUTH_STALE', 'Session stale on wake.  Attempting refresh...');
                  const { error: refreshErr, data: refreshData } = await supabase. auth.refreshSession();
                  if (refreshErr || !refreshData?. session) {
                      syncInspector.log('error', 'AUTH_FAIL', 'Session refresh failed.  User may need to re-login.');
                      return;
                  } else {
                      syncInspector.log('success', 'AUTH_OK', 'Session refreshed successfully.');
                  }
              }
          } catch (authErr:  any) {
              syncInspector.log('error', 'AUTH_CHECK', `Session check failed: ${authErr.message}`);
              return;
          }
      }

      if (onRecovery) onRecovery(source);

      db.flushCloudQueue(userId);
      setTimeout(() => { if (db.getQueueCount() > 0) db.flushCloudQueue(userId); }, 1000);
      setTimeout(() => { if (db.getQueueCount() > 0) db.flushCloudQueue(userId); }, 3000);
    };

    const queueRecovery = (source: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef. current = setTimeout(() => {
            executeRecovery(source);
            debounceRef.current = null;
        }, 500);
    };

    if (userId && ! hasBootedRef.current) {
        hasBootedRef.current = true;
        executeRecovery('app_mount');
    }

    const handleFocus = () => queueRecovery('window_focus');
    const handlePageShow = () => queueRecovery('pageshow_detected');
    const handleOnline = () => queueRecovery('network_online');
    
    const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            executeRecovery('visibility_immediate');
        }
    };

    window. addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    const interval = setInterval(() => {
        const now = Date.now();
        const diff = now - lastTickRef.current;
        
        if (diff > 3000) {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            executeRecovery('time_jump_detected');
        } else if (db.getQueueCount() > 0 && ! db.isFlushing()) {
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
      if (debounceRef.current) clearTimeout(debounceRef. current);
    };
  }, [userId, onRecovery]);
};