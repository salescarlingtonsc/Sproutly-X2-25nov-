
import { supabase } from './supabase';

// --- Save function with local buffer ---
export async function saveNote(note: any) {
  try {
    if (!supabase) throw new Error("Supabase not configured");

    const { error } = await supabase
      .from('activities') // Using the project's existing 'activities' table for compatibility
      .insert([note]);

    if (error) {
      console.error('Supabase write failed:', error);
      bufferUnsynced(note);
    }
  } catch (err) {
    console.error('Write interrupted:', err);
    bufferUnsynced(note);
  }
}

// --- Buffer unsynced changes ---
function bufferUnsynced(note: any) {
  if (typeof window === 'undefined') return;
  const unsynced = JSON.parse(localStorage.getItem('unsynced_notes') || '[]');
  unsynced.push(note);
  localStorage.setItem('unsynced_notes', JSON.stringify(unsynced));
}

// --- Replay buffered writes on wake/focus ---
async function replayUnsynced() {
  if (typeof window === 'undefined' || !supabase) return;
  
  const unsynced = JSON.parse(localStorage.getItem('unsynced_notes') || '[]');
  if (unsynced.length > 0) {
    try {
      const { error } = await supabase
        .from('activities')
        .insert(unsynced);

      if (!error) {
        console.log('Replayed unsynced notes:', unsynced);
        localStorage.removeItem('unsynced_notes');
      } else {
        console.error('Replay failed:', error);
      }
    } catch (err) {
      console.error('Replay interrupted:', err);
    }
  }
}

// --- Attach listeners for recovery triggers ---
if (typeof window !== 'undefined') {
  window.addEventListener('focus', replayUnsynced);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      replayUnsynced();
    }
  });
}
