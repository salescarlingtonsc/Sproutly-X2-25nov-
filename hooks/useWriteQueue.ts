
import { useState, useRef, useCallback } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface QueueItem {
  status: SaveStatus;
  version: number;
  timer: any;
  lastError?: string;
}

export const useWriteQueue = (saveFn: (id: string, data: any) => Promise<any>) => {
  const [rowStatuses, setRowStatuses] = useState<Record<string, QueueItem>>({});
  const queueStateRef = useRef<Record<string, QueueItem>>({});

  const updateStatus = (id: string, update: Partial<QueueItem>) => {
    const newState = {
      ...queueStateRef.current[id] || { status: 'idle', version: 0, timer: null },
      ...update
    };
    queueStateRef.current[id] = newState;
    setRowStatuses({ ...queueStateRef.current });
  };

  const enqueue = useCallback((id: string, data: any) => {
    const current = queueStateRef.current[id] || { status: 'idle', version: 0, timer: null };
    
    // Clear existing timer for debounce
    if (current.timer) clearTimeout(current.timer);

    const nextVersion = current.version + 1;
    updateStatus(id, { 
      status: 'saving', 
      version: nextVersion,
      timer: setTimeout(async () => {
        try {
          await saveFn(id, data);
          // Only mark as saved if no newer version was enqueued while we were saving
          if (queueStateRef.current[id]?.version === nextVersion) {
            updateStatus(id, { status: 'saved', timer: null });
            // Reset to idle after 2s
            setTimeout(() => {
               if (queueStateRef.current[id]?.status === 'saved') {
                  updateStatus(id, { status: 'idle' });
               }
            }, 2000);
          }
        } catch (e: any) {
          updateStatus(id, { status: 'error', lastError: e.message, timer: null });
        }
      }, 800) // 800ms debounce
    });
  }, [saveFn]);

  return { rowStatuses, enqueue };
};
