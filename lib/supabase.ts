
import { createClient } from '@supabase/supabase-js';

// ------------------------------------------------------------------
// ROBUST ENVIRONMENT VARIABLE LOADER
// Works with Vite (import.meta.env), Next.js, and CRA (process.env)
// This prevents white screens if the build tool differs.
// ------------------------------------------------------------------

const getEnv = (key: string) => {
  let val = '';
  
  // Try Vite / Modern Browsers
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      val = (import.meta as any).env[key] || '';
    }
  } catch (e) {}

  // Try Node / CRA / Next.js
  if (!val) {
    try {
      if (typeof process !== 'undefined' && process.env) {
        val = process.env[key] || '';
      }
    } catch (e) {}
  }

  return val;
};

// Load keys looking for VITE_, REACT_APP_, or NEXT_PUBLIC_ prefixes
// We use the hardcoded fallback values to ensure it works in the preview environment
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

// Validation check
const isConfigured = 
  SUPABASE_URL && 
  SUPABASE_URL.startsWith('http') && 
  SUPABASE_ANON_KEY && 
  SUPABASE_ANON_KEY.length > 20;

// Debug log to help user find issues
if (!isConfigured) {
  console.warn('Supabase is not configured. Please create a .env file in the project root with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
} else {
  console.log('Supabase configured with URL:', SUPABASE_URL);
}

// FORCE KEEPALIVE: This tells the browser to NOT kill the request if the tab closes/backgrounds.
const fetchWithKeepAlive = (url: RequestInfo | URL, init?: RequestInit) => {
  return fetch(url, { ...init, keepalive: true });
};

export const supabase = isConfigured 
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        fetch: fetchWithKeepAlive
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }) 
  : null;

export const isSupabaseConfigured = () => !!isConfigured;
