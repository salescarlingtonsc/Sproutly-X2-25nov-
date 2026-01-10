
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

      // ---------------------------------------------------------
      // 1. SMART RECONCILIATION (Handle Pre-Approvals)
      // Check if an Admin created a placeholder 'invite' profile for this email
      // that has a different ID (e.g. 'adv_123') than the real Auth UID.
      // ---------------------------------------------------------
      const { data: inviteProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email)
        .neq('id', uid) // ID doesn't match current user
        .single();

      if (inviteProfile) {
          console.log("Found pre-approved invite. Merging into real account...");
          
          // Merge invite settings into real profile
          // We prioritize the invite's status, role, banding, and org
          const updates = {
              status: inviteProfile.status === 'active' ? 'approved' : inviteProfile.status,
              role: inviteProfile.role,
              organization_id: inviteProfile.organization_id,
              banding_percentage: inviteProfile.banding_percentage,
              reporting_to: inviteProfile.reporting_to, // Team ID
              modules: inviteProfile.modules,
              subscription_tier: inviteProfile.subscription_tier,
              annual_goal: inviteProfile.annual_goal,
              is_admin: inviteProfile.is_admin
          };

          // Apply updates to real profile
          await supabase.from('profiles').update(updates).eq('id', uid);
          
          // Delete the old placeholder to clean up
          await supabase.from('profiles').delete().eq('id', inviteProfile.id);
      }
      // ---------------------------------------------------------

      // 2. Load Final Profile
      let { data, error } = await supabase
        .from('profiles')
        .select('subscription_tier, role, is_admin, extra_slots, status, modules, organization_id')
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
              isAgencyAdmin: isHardcodedAdmin,
              organizationId: 'org_default'
           });
           return;
        }
        console.warn("Profile fetch error:", error.message);
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
        isAgencyAdmin: finalIsAdmin, // Ensure this property is set for UI checks
        organizationId: data?.organization_id
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
        isAgencyAdmin: isAdmin,
        organizationId: 'org_default'
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
     return await supabase.auth.signUp({ 
       email, 
       password,
       options: {
         emailRedirectTo: window.location.origin // Ensure redirection back to this app
       }
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
