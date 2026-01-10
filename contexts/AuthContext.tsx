
import React, { createContext, useContext, useEffect, useState } from 'react';
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

// Cache key for instant load
const USER_CACHE_KEY = 'sproutly.user_cache.v1';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const ADMIN_EMAIL = 'sales.carlingtonsc@gmail.com';

  useEffect(() => {
    // 1. INSTANT HYDRATION: Check local cache first
    const cachedUser = localStorage.getItem(USER_CACHE_KEY);
    let hasCache = false;

    if (cachedUser) {
      try {
        const parsed = JSON.parse(cachedUser);
        console.log("⚡ Instant Login via Cache");
        setUser(parsed);
        setIsLoading(false); 
        hasCache = true;
      } catch (e) {
        console.warn("Cache corrupted");
      }
    }

    if (!isSupabaseConfigured() || !supabase) {
      setIsLoading(false);
      return;
    }

    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          // 2. ZERO-LATENCY FALLBACK
          // If we have a session but no cache, UNBLOCK UI IMMEDIATELY with a temporary profile
          // The full profile will lazy-load in the background.
          if (!hasCache) {
             const fallbackUser: UserProfile = {
                id: session.user.id,
                email: session.user.email!,
                role: 'advisor', // Temporary safe role
                status: 'active',
                subscriptionTier: 'free', 
                is_admin: false,
                organizationId: 'org_default'
             };
             setUser(fallbackUser);
             setIsLoading(false); // <--- CRITICAL: Remove loading screen immediately
          }

          // 3. BACKGROUND SYNC
          // This will fetch the real roles/permissions and update the UI silently
          loadUserProfile(session.user.id, session.user.email!);
        } else {
          // No session
          if (hasCache) {
             localStorage.removeItem(USER_CACHE_KEY);
             setUser(null);
          }
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Session check failed", err);
        if (!hasCache) setIsLoading(false);
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
    };
  }, []);

  const loadUserProfile = async (uid: string, email: string) => {
    try {
      if (!supabase) return;
      
      const isHardcodedAdmin = email === ADMIN_EMAIL;
      
      // Attempt to fetch profile with a short timeout mechanism implicitly handled by Supabase
      const { data: profileData, error: fetchError } = await supabase
          .from('profiles')
          .select('subscription_tier, role, is_admin, extra_slots, status, modules, organization_id')
          .eq('id', uid)
          .maybeSingle();

      // Check for invite reconciliations if profile is missing
      let finalProfileData = profileData;
      
      if (!finalProfileData) {
          const { data: inviteData } = await supabase
              .from('profiles')
              .select('*')
              .eq('email', email)
              .neq('id', uid)
              .maybeSingle();
              
          if (inviteData) {
              const updates = {
                  status: inviteData.status === 'active' ? 'approved' : inviteData.status,
                  role: inviteData.role,
                  organization_id: inviteData.organization_id,
                  banding_percentage: inviteData.banding_percentage,
                  reporting_to: inviteData.reporting_to,
                  modules: inviteData.modules,
                  subscription_tier: inviteData.subscription_tier,
                  annual_goal: inviteData.annual_goal,
                  is_admin: inviteData.is_admin
              };
              await supabase.from('profiles').update(updates).eq('id', uid);
              await supabase.from('profiles').delete().eq('id', inviteData.id);
              finalProfileData = { ...inviteData, ...updates };
          }
      }

      // Construct Final Profile
      const isAdminByData = finalProfileData?.role === 'admin' || finalProfileData?.is_admin === true;
      const finalRole = (isHardcodedAdmin || isAdminByData) ? 'admin' : (finalProfileData?.role || 'advisor');
      const finalIsAdmin = isHardcodedAdmin || isAdminByData;
      const finalTier = finalRole === 'admin' ? 'diamond' : ((finalProfileData?.subscription_tier as SubscriptionTier) || 'free');
      
      let dbStatus = finalProfileData?.status || 'pending';
      if (dbStatus === 'active') dbStatus = 'approved'; 
      const finalStatus = (isHardcodedAdmin || dbStatus === 'approved') ? 'approved' : dbStatus;

      const newUserProfile: UserProfile = {
        id: uid,
        email: email,
        subscriptionTier: finalTier,
        role: finalRole,
        status: finalStatus as 'pending' | 'approved' | 'rejected',
        extraSlots: finalProfileData?.extra_slots || 0,
        modules: finalProfileData?.modules || [],
        is_admin: finalIsAdmin,
        isAgencyAdmin: finalIsAdmin,
        organizationId: finalProfileData?.organization_id
      };

      // UPDATE STATE
      setUser(newUserProfile);
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(newUserProfile));

    } catch (e) {
      console.error('Profile sync error', e);
      // Don't clear user here, keep the fallback session user to prevent logout
    } finally {
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
