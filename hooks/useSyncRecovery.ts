import { useEffect, useRef } from 'react';
import { db } from '../lib/db';
import { syncInspector } from '../lib/syncInspector';
import { supabase } from '../lib/supabase';

export const useSyncRecovery = (userId?: string, onRecovery?: (source: string) => void) => {
  const isRecoveringRef = useRef<boolean>(false);

  useEffect(() => {
    const triggerRecovery = async (source: string) => {
      if (isRecoveringRef.current) return;
      isRecoveringRef.current = true;

      const qCount = await db.getQueueCount();
      const { data } = await supabase!.auth.getSession();

      syncInspector.log('info', 'RESUME_EVENT', `Recovery Signal: ${source}. Queue: ${qCount}`, {
          owner: 'Lifecycle',
          module: 'SyncRecovery',
          reason: source
      }, {
          reason: source,
          visibility: document.visibilityState,
          online: navigator.onLine,
          queueCount: qCount,
          hasSession: !!data.session,
          isFlushing: db.isFlushing()
      });

      syncInspector.log('info', 'RECOVERY_TRIGGER', `Signal Detected: ${source}, Queue: ${qCount}`, {
          owner: 'Lifecycle',
          module: 'SyncRecovery',
          reason: source
      }, { queueCount: qCount });

      // Rely on gated Orchestrator to manage the debounce/warm-up.
      if (userId) {
          db.scheduleFlush(`recovery_${source}`);
      }

      if (onRecovery) onRecovery(source);
      isRecoveringRef.current = false;
    };

    const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
            triggerRecovery('visibility_visible');
        }
    };

    const handleOnline = () => triggerRecovery('network_online');

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [userId, onRecovery]);
};