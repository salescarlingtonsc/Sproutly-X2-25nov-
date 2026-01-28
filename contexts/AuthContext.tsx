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

  const ADMIN_EMAIL = 'sales.carlingtonsc@gmail.com';

  useEffect(() => {
    const cachedUser = localStorage.getItem(USER_CACHE_KEY);
    let hasCache = false;

    if (cachedUser) {
      try {
        const parsed = JSON.parse(cachedUser);
        setUser(parsed);
        setIsLoading(false); 
        hasCache = true;
      } catch (e) {}
    }

    if (!isSupabaseConfigured() || !supabase) {
      setIsLoading(false);
      return;
    }

    loadingTimeoutRef.current = setTimeout(() => {
      if (isLoading) {
        console.warn("🛡️ Auth Backstop: Supabase check timed out. Unblocking UI.");
        setIsLoading(false);
      }
    }, 6000);

    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session?.user) {
          if (session.access_token) db.updateTokenCache(session.access_token);

          if (!hasCache) {
             const fallbackUser: UserProfile = {
                id: session.user.id,
                email: session.user.email!,
                role: 'advisor',
                status: 'approved',
                subscriptionTier: 'free', 
                is_admin: false,
                organizationId: 'org_default',
                extraSlots: 0, 
                modules: [],
                name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0]
             };
             setUser(fallbackUser);
             setIsLoading(false);
          }
          loadUserProfile(session.user.id, session.user.email!);
        } else {
          if (hasCache) {
             localStorage.removeItem(USER_CACHE_KEY);
             setUser(null);
          }
          setIsLoading(false);
        }
      } catch (err: any) {
        console.error("Session check failed:", err.message);
        setIsLoading(false);
      } finally {
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      }
    };

    checkSession();

    const handleFocus = async () => {
        if (!supabase) return;
        
        // 1. NON-BLOCKING Heartbeat
        // We use console.debug here for the absolute minimum noise
        try {
            const { data } = await supabase.auth.getSession();
            if (data.session) {
                if (data.session.access_token) db.updateTokenCache(data.session.access_token);
                
                const expiresAt = data.session.expires_at; 
                const now = Math.floor(Date.now() / 1000);
                const timeRemaining = expiresAt ? expiresAt - now : 0;
                
                if (timeRemaining < 3600) { 
                    syncInspector.log('info', 'AUTH_CHECK', "Proactive Session Refresh triggered.");
                    const { data: refreshed } = await supabase.auth.refreshSession();
                    if (refreshed.session?.access_token) db.updateTokenCache(refreshed.session.access_token);
                } else {
                    syncInspector.log('info', 'AUTH_CHECK', `Session valid (${Math.floor(timeRemaining/60)}m remaining).`);
                }
            } else {
                // Heartbeat failure is informational ONLY, not a system error
                syncInspector.log('info', 'AUTH_PENDING', "Wake Heartbeat: No session yet. Waiting for resume grace period.");
            }
        } catch (e: any) {
            // INFORMATION ONLY during wake
            console.debug('Wake heartbeat bypassed.', e.message);
        }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') handleFocus();
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
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    };
  }, []);

  const loadUserProfile = async (uid: string, email: string) => {
    try {
      if (!supabase) return;
      const isHardcodedAdmin = email === ADMIN_EMAIL;
      
      const { data: profileData, error: fetchError } = await supabase
          .from('profiles')
          .select('subscription_tier, role, is_admin, extra_slots, status, modules, organization_id, name')
          .eq('id', uid)
          .maybeSingle();

      if (fetchError) {
          if (fetchError.message.includes('stack depth') || fetchError.message.includes('recursion')) {
              console.error("🚨 CRITICAL: Database Recursion Loop Detected in Auth.");
          }
          throw fetchError;
      }

      const isAdminByData = profileData?.role === 'admin' || profileData?.is_admin === true;
      const finalRole = (isHardcodedAdmin || isAdminByData) ? 'admin' : (profileData?.role || 'advisor');
      const finalIsAdmin = isHardcodedAdmin || isAdminByData;
      const finalTier = finalRole === 'admin' ? 'diamond' : ((profileData?.subscription_tier as SubscriptionTier) || 'free');
      
      const newUserProfile: UserProfile = {
        id: uid,
        email: email,
        subscriptionTier: finalTier,
        role: finalRole,
        status: (profileData?.status || 'approved') as any,
        extraSlots: profileData?.extra_slots || 0,
        modules: profileData?.modules || [],
        is_admin: finalIsAdmin,
        isAgencyAdmin: finalIsAdmin,
        organizationId: profileData?.organization_id || 'org_default',
        name: profileData?.name
      };

      setUser(newUserProfile);
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(newUserProfile));
      setIsLoading(false);

    } catch (e) {
      console.error('Profile loading error:', e);
      setIsLoading(false);
    }
  };

  const signInWithEmail = async (email: string) => {
    if (!supabase) return { error: { message: 'Supabase not configured' } };
    return await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  };

  const signInWithPassword = async (email: string, password: string) => {
    if (!supabase) return { error: { message: 'Supabase not configured' } };
    return await supabase.auth.signInWithPassword({ email, password });
  };
  
  const signUpWithPassword = async (email: string, password: string) => {
     if (!supabase) return { data: null, error: { message: 'Supabase not configured' } };
     return await supabase.auth.signUp({ 
       email, 
       password,
       options: { emailRedirectTo: window.location.origin }
     });
  };

  const signInWithGoogle = async () => {
    if (!supabase) return { error: { message: 'Supabase not configured' } };
    return await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  };
  
  const resetPassword = async (email: string) => {
    if (!supabase) return { data: null, error: { message: 'Supabase not configured' } };
    return await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  };

  const updatePassword = async (password: string) => {
    if (!supabase) return { data: null, error: { message: 'Supabase not configured' } };
    const result = await supabase.auth.updateUser({ password });
    if (!result.error) {
        setIsRecoveryMode(false);
    }
    return result;
  };

  const resendVerificationEmail = async (email: string) => {
    if (!supabase) return { data: null, error: { message: 'Supabase not configured' } };
    return await supabase.auth.resend({ 
      type: 'signup', 
      email, 
      options: { emailRedirectTo: window.location.origin } 
    });
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    localStorage.removeItem(USER_CACHE_KEY); 
    setUser(null);
  };

  const refreshProfile = async () => {
    if (user) await loadUserProfile(user.id, user.email);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isRecoveryMode, signInWithEmail, signInWithPassword, signUpWithPassword, signInWithGoogle, resetPassword, updatePassword, resendVerificationEmail, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};