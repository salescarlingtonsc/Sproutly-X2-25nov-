
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Hardcoded admin email for safety/recovery
  const ADMIN_EMAIL = 'sales.carlingtonsc@gmail.com';

  useEffect(() => {
    // Safety Timeout: Force stop loading after 8 seconds to prevent infinite hang
    const safetyTimer = setTimeout(() => {
      setIsLoading(prev => {
        if (prev) {
          console.warn("Auth initialization timed out - Forcing app load.");
          return false;
        }
        return prev;
      });
    }, 8000);

    if (!isSupabaseConfigured() || !supabase) {
      setIsLoading(false);
      clearTimeout(safetyTimer);
      return;
    }

    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (session?.user) {
          await loadUserProfile(session.user.id, session.user.email!);
        } else {
          setIsLoading(false);
        }
      } catch (err) {
        setIsLoading(false);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        await loadUserProfile(session.user.id, session.user.email!);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsLoading(false);
      } else if (event === 'INITIAL_SESSION' && !session) {
        setIsLoading(false);
      }
    });

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const loadUserProfile = async (uid: string, email: string) => {
    try {
      if (!supabase) return;
      
      const isHardcodedAdmin = email === ADMIN_EMAIL;

      // Select both role and is_admin boolean
      let { data, error } = await supabase
        .from('profiles')
        .select('subscription_tier, role, is_admin, extra_slots, status, modules')
        .eq('id', uid)
        .single();
      
      if (error) {
        if (error.message.includes('stack depth')) {
           console.error("CRITICAL: Auth Recursion Error. Falling back to safe profile state.");
           // Fallback for admins to allow access to the repair script
           setUser({
              id: uid,
              email: email,
              subscriptionTier: isHardcodedAdmin ? 'diamond' : 'free',
              role: isHardcodedAdmin ? 'admin' : 'user',
              status: isHardcodedAdmin ? 'approved' : 'pending',
              extraSlots: 0,
              modules: [],
              is_admin: isHardcodedAdmin,
              isAgencyAdmin: isHardcodedAdmin
           });
           return;
        }
        // Don't throw, just use fallback if profile missing
        console.warn("Profile fetch error:", error.message);
      }

      // Auto-create for new users if not found
      if (!data && !error) { 
         // Logic mainly for first-time login if trigger didn't fire
      }

      // Determine final role status (Inclusive Check)
      // PRIORITY: Hardcoded Email > DB Role
      const isAdminByData = data?.role === 'admin' || data?.is_admin === true;
      const finalRole = (isHardcodedAdmin || isAdminByData) ? 'admin' : (data?.role || 'user');
      const finalIsAdmin = isHardcodedAdmin || isAdminByData;
      
      const finalTier = finalRole === 'admin' ? 'diamond' : ((data?.subscription_tier as SubscriptionTier) || 'free');
      
      // STATUS NORMALIZATION FIX
      // Treat 'active' same as 'approved' to prevent lockouts
      let dbStatus = data?.status || 'pending';
      if (dbStatus === 'active') dbStatus = 'approved'; 
      const finalStatus = (isHardcodedAdmin || dbStatus === 'approved') ? 'approved' : dbStatus;

      const finalSlots = data?.extra_slots || 0;
      const finalModules = data?.modules || [];
        
      setUser({
        id: uid,
        email: email,
        subscriptionTier: finalTier,
        role: finalRole,
        status: finalStatus as 'pending' | 'approved' | 'rejected',
        extraSlots: finalSlots,
        modules: finalModules,
        is_admin: finalIsAdmin,
        isAgencyAdmin: finalIsAdmin // Ensure this property is set for UI checks
      });

    } catch (e) {
      console.error('Error loading profile', e);
      // Fail-safe for the specific admin email
      const isAdmin = email === ADMIN_EMAIL;
      setUser({ 
        id: uid, 
        email, 
        subscriptionTier: isAdmin ? 'diamond' : 'free', 
        role: isAdmin ? 'admin' : 'user', 
        status: isAdmin ? 'approved' : 'pending',
        extraSlots: 0,
        modules: [],
        is_admin: isAdmin,
        isAgencyAdmin: isAdmin
      });
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
     return await supabase.auth.signUp({ email, password });
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
