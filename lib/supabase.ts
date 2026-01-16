import { createClient } from '@supabase/supabase-js';

// --- robust env getter (AI Studio / Vite / others) ---
const getEnv = (key: string) => {
  let val = '';

  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      val = (import.meta as any).env[key] || '';
    }
  } catch {}

  if (!val) {
    try {
      if (typeof process !== 'undefined' && (process as any).env) {
        val = (process as any).env[key] || '';
      }
    } catch {}
  }

  return val;
};

// --- url/key with fallback (prevents "supabase = null" in preview) ---
const rawUrl =
  getEnv('VITE_SUPABASE_URL') ||
  getEnv('REACT_APP_SUPABASE_URL') ||
  getEnv('NEXT_PUBLIC_SUPABASE_URL') ||
  'https://koibycgvdasjphceqmqo.supabase.co';

const SUPABASE_URL = rawUrl ? rawUrl.replace(/\/$/, '') : '';

const SUPABASE_ANON_KEY =
  getEnv('VITE_SUPABASE_ANON_KEY') ||
  getEnv('REACT_APP_SUPABASE_ANON_KEY') ||
  getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvaWJ5Y2d2ZGFzanBoY2VxbXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2MDc0ODUsImV4cCI6MjA3OTE4MzQ4NX0.psZsaHVLrwIsRx4N7fO-cnWcls_eGCq8YdUa0gaGYF4';

const isConfigured =
  !!SUPABASE_URL &&
  SUPABASE_URL.startsWith('http') &&
  !!SUPABASE_ANON_KEY &&
  SUPABASE_ANON_KEY.length > 20;

// --- hard timeout fetch (prevents iOS "hang forever") ---
const fetchWithTimeout: typeof fetch = async (input, init: any = {}) => {
  const timeoutMs = 12000;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(t);
  }
};

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { fetch: fetchWithTimeout },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'sproutly_auth_v1',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined
      }
    })
  : null;

export const isSupabaseConfigured = () => !!(isConfigured && supabase);