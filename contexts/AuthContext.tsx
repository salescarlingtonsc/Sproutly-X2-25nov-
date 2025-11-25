
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
    if (!isSupabaseConfigured() || !supabase) {
      setIsLoading(false);
      return;
    }

    // Check active session
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error("Auth Session Error:", error);
        }

        if (session?.user) {
          await loadUserProfile(session.user.id, session.user.email!);
        } else {
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Unexpected auth check error:", err);
        setIsLoading(false);
      }
    };

    checkSession();

    // Listen for auth changes
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
      subscription.unsubscribe();
    };
  }, []);

  const loadUserProfile = async (uid: string, email: string) => {
    try {
      if (!supabase) return;
      
      const isHardcodedAdmin = email === ADMIN_EMAIL;

      // 1. Try to fetch existing profile
      let { data, error } = await supabase
        .from('profiles')
        .select('subscription_tier, role, extra_slots, status')
        .eq('id', uid)
        .single();
      
      // 2. If profile doesn't exist (New Registration), create it
      if (!data && !error) {
         // This shouldn't happen if select works, but if data is null:
         error = { message: 'No data', details: '', hint: '', code: 'PGRST116' };
      }

      // Handle "Row not found" error (PGRST116) by creating the profile
      if (error && error.code === 'PGRST116') {
        console.log("New user detected, creating pending profile...");
        
        const newProfile = {
          id: uid,
          email: email,
          role: isHardcodedAdmin ? 'admin' : 'user',
          subscription_tier: isHardcodedAdmin ? 'diamond' : 'free',
          status: isHardcodedAdmin ? 'approved' : 'pending', // Default to pending for others
          extra_slots: 0,
          created_at: new Date().toISOString()
        };

        const { error: insertError } = await supabase
          .from('profiles')
          .insert(newProfile);
          
        if (insertError) {
          console.error("Error creating profile:", insertError);
        } else {
          // Use the newly created data
          data = newProfile;
        }
      }

      // 3. AUTO-SYNC ADMIN ROLE
      // If the code says they are admin (hardcoded email), but DB says 'user', update DB immediately.
      // This fixes RLS issues where frontend thinks you are admin but DB blocks access.
      if (isHardcodedAdmin && data && data.role !== 'admin') {
         console.log("Auto-syncing Admin Role to Database...");
         const { error: updateError } = await supabase
           .from('profiles')
           .update({ 
             role: 'admin', 
             subscription_tier: 'diamond',
             status: 'approved' 
           })
           .eq('id', uid);
           
         if (!updateError) {
            data.role = 'admin';
            data.subscription_tier = 'diamond';
            data.status = 'approved';
         } else {
            console.warn("Failed to auto-sync admin role. RLS might be blocking update.", updateError);
         }
      }
      
      // 4. Determine final state values
      // If hardcoded admin, force override everything in local state to ensure UI access
      const finalRole = isHardcodedAdmin ? 'admin' : (data?.role || 'user');
      const finalTier = isHardcodedAdmin ? 'diamond' : ((data?.subscription_tier as SubscriptionTier) || 'free');
      const finalStatus = isHardcodedAdmin ? 'approved' : (data?.status || 'pending');
      const finalSlots = data?.extra_slots || 0;
        
      setUser({
        id: uid,
        email: email,
        subscriptionTier: finalTier,
        role: finalRole,
        status: finalStatus as 'pending' | 'approved' | 'rejected',
        extraSlots: finalSlots
      });

    } catch (e) {
      console.error('Error loading profile', e);
      // Fallback for strictly local mode or catastrophic failure
      const isAdmin = email === ADMIN_EMAIL;
      setUser({ 
        id: uid, 
        email, 
        subscriptionTier: isAdmin ? 'diamond' : 'free', 
        role: isAdmin ? 'admin' : 'user', 
        status: isAdmin ? 'approved' : 'pending',
        extraSlots: 0 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithEmail = async (email: string) => {
    if (!supabase) return { error: { message: 'Supabase not configured' } };
    return await supabase.auth.signInWithOtp({ 
      email,
      options: { shouldCreateUser: true }
    });
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
    return await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  };
  
  const resetPassword = async (email: string) => {
    if (!supabase) return { data: null, error: { message: 'Supabase not configured' } };
    return await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
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
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
