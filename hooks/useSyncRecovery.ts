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

      // Arm the orchestrator for the next event
      db.notifyResume(source);

      const qCount = await db.getQueueCount();
      const orchestratorState = db.getOrchestratorState();
      const { data: { session } } = await supabase!.auth.getSession();

      const meta = {
          source,
          visibility: document.visibilityState,
          online: navigator.onLine,
          queueCount: qCount,
          hasSession: !!session,
          ...orchestratorState
      };

      syncInspector.log('info', 'RESUME_BOUNDARY', `Lifecycle Signal: ${source}`, {
          owner: 'Lifecycle',
          module: 'SyncRecovery',
          reason: source
      }, meta);

      // If we have items, force flush immediately
      if (userId && qCount > 0) {
          db.scheduleFlush(`recovery_${source}`);
      }

      if (onRecovery) onRecovery(source);
      isRecoveringRef.current = false;
    };

    const handleVisibility = () => {
        if (document.visibilityState === 'visible') triggerRecovery('visibility_visible');
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