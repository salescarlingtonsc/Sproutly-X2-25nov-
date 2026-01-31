
import { createClient } from '@supabase/supabase-js';

const getEnv = (key: string) => {
  if (typeof window !== 'undefined' && (window as any).process?.env?.[key]) {
      return (window as any).process.env[key];
  }
  
  // Try Vite
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      const viteKey = `VITE_${key}`;
      return (import.meta as any).env[viteKey] || (import.meta as any).env[key] || '';
    }
  } catch (e) {}

  // Try standard Node/Next
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key] || '';
    }
  } catch (e) {}

  return '';
};

const SUPABASE_URL = getEnv('SUPABASE_URL') || 'https://koibycgvdasjphceqmqo.supabase.co';
const SUPABASE_ANON_KEY = getEnv('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvaWJ5Y2d2ZGFzanBoY2VxbXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2MDc0ODUsImV4cCI6MjA3OTE4MzQ4NX0.psZsaHVLrwIsRx4N7fO-cnWcls_eGCq8YdUa0gaGYF4';

const isConfigured = SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.length > 20;

export const supabase = isConfigured 
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
  : null;

export const isSupabaseConfigured = () => !!isConfigured;
export { SUPABASE_URL };
