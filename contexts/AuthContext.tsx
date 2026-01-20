
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserProfile, SubscriptionTier } from '../types';

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  signInWithEmail: (email: string) => Promise<{ error: any }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: any }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ data: any; error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  resetPassword: (email: string) => Promise<{ data: any; error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_CACHE_KEY = 'sproutly.user_cache.v1';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const loadingTimeoutRef = useRef<any>(null);

  const ADMIN_EMAIL = 'sales.carlingtonsc@gmail.com';

  useEffect(() => {
    // 1. INSTANT HYDRATION
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

    // 2. SAFETY BACKSTOP: If Supabase hangs for >5s, unblock the UI
    // This prevents the "White Screen" if the DB is looping or network is dead.
    loadingTimeoutRef.current = setTimeout(() => {
      if (isLoading) {
        console.warn("🛡️ Auth Backstop: Supabase check timed out. Unblocking UI.");
        setIsLoading(false);
      }
    }, 5000);

    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) throw error;

        if (session?.user) {
          // If no cache, unblock with minimal user data immediately
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

          // Fetch full profile in background
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        await loadUserProfile(session.user.id, session.user.email!);
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem(USER_CACHE_KEY);
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
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
          if (fetchError.message.includes('stack depth')) {
              console.error("🚨 CRITICAL: Database Recursion Loop Detected. Run Repair SQL.");
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

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    localStorage.removeItem(USER_CACHE_KEY); 
    setUser(null);
  };

  const refreshProfile = async () => {
    if (user) await loadUserProfile(user.id, user.email);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signInWithEmail, signInWithPassword, signUpWithPassword, signInWithGoogle, resetPassword, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
