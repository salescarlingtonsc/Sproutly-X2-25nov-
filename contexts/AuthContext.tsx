
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserProfile, SubscriptionTier } from '../types';

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

  // Hardcoded Admin Email for override
  const ADMIN_EMAIL = 'sales.carlingtonsc@gmail.com';

  useEffect(() => {
    // 1. INSTANT HYDRATION FROM LOCAL STORAGE (Speed)
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

    // 2. SAFETY TIMEOUT (Prevent infinite loading screens)
    loadingTimeoutRef.current = setTimeout(() => {
      if (isLoading) {
        console.warn("🛡️ Auth Backstop: Supabase check timed out. Unblocking UI.");
        setIsLoading(false);
      }
    }, 5000);

    const checkSession = async () => {
      try {
        // Use getSession instead of getUser for speed + token check
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) throw error;

        if (session?.user) {
          // If we didn't have cache, show SOMETHING immediately while we fetch the full profile
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
          // Now fetch the real profile from DB
          loadUserProfile(session.user.id, session.user.email!);
        } else {
          // No session, clear everything
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

    // 3. PROACTIVE REFRESH ON APP SWITCHING (The Fix)
    // When user switches apps (visibility change) or focuses window, check token validity immediately.
    const handleFocus = async () => {
        if (!supabase) return;
        const { data } = await supabase.auth.getSession();
        if (data.session) {
            // If token expires in less than 60 minutes, force refresh now to be safe
            const expiresAt = data.session.expires_at; // Unix timestamp in seconds
            const now = Math.floor(Date.now() / 1000);
            const timeRemaining = expiresAt ? expiresAt - now : 0;
            
            if (timeRemaining < 3600) { // 1 hour buffer
                console.log("⚡ Proactive Session Refresh triggered on wake.");
                await supabase.auth.refreshSession();
            }
        }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') handleFocus();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        await loadUserProfile(session.user.id, session.user.email!);
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem(USER_CACHE_KEY);
        setUser(null);
        setIsLoading(false);
      } else if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
      } else if (event === 'TOKEN_REFRESHED') {
        // Token refreshed successfully
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
          // Detect infinite recursion in RLS policies (Database bug)
          if (fetchError.message.includes('stack depth') || fetchError.message.includes('recursion')) {
              console.error("🚨 CRITICAL: Database Recursion Loop Detected in Auth.");
          }
          throw fetchError;
      }

      // Merge DB data with local override logic
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
