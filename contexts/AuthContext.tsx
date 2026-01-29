import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserProfile, SubscriptionTier } from '../types';
import { db } from '../lib/db'; 
import { syncInspector } from '../lib/syncInspector';

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isRecoveryMode: boolean;
  signInWithEmail: (email: string) => Promise<{ error: any }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: any }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ data: any; error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  resetPassword: (email: string) => Promise<{ data: any; error: any }>;
  updatePassword: (password: string) => Promise<{ data: any; error: any }>;
  resendVerificationEmail: (email: string) => Promise<{ data: any; error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_CACHE_KEY = 'sproutly.user_cache.v1';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const loadingTimeoutRef = useRef<any>(null);

  useEffect(() => {
    const cachedUser = localStorage.getItem(USER_CACHE_KEY);
    if (cachedUser) {
      try {
        setUser(JSON.parse(cachedUser));
        setIsLoading(false); 
      } catch (e) {}
    }

    const checkSession = async () => {
      if (!supabase) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          if (session.access_token) db.updateTokenCache(session.access_token);
          loadUserProfile(session.user.id, session.user.email!);
        } else {
          setIsLoading(false);
        }
      } catch (err) {
        setIsLoading(false);
      }
    };

    checkSession();

    const handleFocus = async () => {
        if (!supabase) return;
        
        // Notify Orchestrator of resume
        db.notifyResume('focus');
        
        syncInspector.log('info', 'RESUME_BOUNDARY', 'Auth Pulse: Focus Detected', { owner: 'Lifecycle', module: 'AuthContext', reason: 'focus' });
        try {
            const { data } = await supabase.auth.getSession();
            if (data.session) {
                if (data.session.access_token) db.updateTokenCache(data.session.access_token);
                const expiresAt = data.session.expires_at || 0;
                const now = Math.floor(Date.now() / 1000);
                if (expiresAt - now < 3600) { 
                    const { data: refreshed } = await supabase.auth.refreshSession();
                    if (refreshed.session?.access_token) db.updateTokenCache(refreshed.session.access_token);
                }
            }
        } catch (e) {}
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            db.notifyResume('visibility');
            syncInspector.log('info', 'RESUME_BOUNDARY', 'Auth Pulse: Visibility Visible', { owner: 'Lifecycle', module: 'AuthContext', reason: 'visibility' });
            handleFocus();
        }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.access_token) db.updateTokenCache(session.access_token);
      if (event === 'SIGNED_IN' && session?.user) {
        await loadUserProfile(session.user.id, session.user.email!);
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem(USER_CACHE_KEY);
        setUser(null);
        setIsLoading(false);
      } else if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const loadUserProfile = async (uid: string, email: string) => {
    try {
      if (!supabase) return;
      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
      const finalRole = profileData?.role || 'advisor';
      const newUserProfile: UserProfile = {
        id: uid,
        email: email,
        subscriptionTier: (profileData?.subscription_tier as SubscriptionTier) || 'free',
        role: finalRole,
        status: (profileData?.status || 'approved') as any,
        extraSlots: profileData?.extra_slots || 0,
        modules: profileData?.modules || [],
        is_admin: profileData?.is_admin || false,
        organizationId: profileData?.organization_id || 'org_default',
        name: profileData?.name
      };
      setUser(newUserProfile);
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(newUserProfile));
      setIsLoading(false);
    } catch (e) {
      setIsLoading(false);
    }
  };

  const signInWithEmail = async (email: string) => supabase!.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  const signInWithPassword = async (email: string, password: string) => supabase!.auth.signInWithPassword({ email, password });
  const signUpWithPassword = async (email: string, password: string) => supabase!.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
  const signInWithGoogle = async () => supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  const resetPassword = async (email: string) => supabase!.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  const updatePassword = async (password: string) => {
    const result = await supabase!.auth.updateUser({ password });
    if (!result.error) setIsRecoveryMode(false);
    return result;
  };
  const resendVerificationEmail = async (email: string) => supabase!.auth.resend({ type: 'signup', email });
  const signOut = async () => { if (supabase) await supabase.auth.signOut(); localStorage.removeItem(USER_CACHE_KEY); setUser(null); };
  const refreshProfile = async () => { if (user) await loadUserProfile(user.id, user.email); };

  return <AuthContext.Provider value={{ user, isLoading, isRecoveryMode, signInWithEmail, signInWithPassword, signUpWithPassword, signInWithGoogle, resetPassword, updatePassword, resendVerificationEmail, signOut, refreshProfile }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};