
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
      subscription.unsubscribe();
    };
  }, []);

  const loadUserProfile = async (uid: string, email: string) => {
    try {
      if (!supabase) return;
      
      const isHardcodedAdmin = email === ADMIN_EMAIL;

      // Ensure we fetch the 'modules' column
      let { data, error } = await supabase
        .from('profiles')
        .select('subscription_tier, role, extra_slots, status, modules')
        .eq('id', uid)
        .single();
      
      // Auto-create for new users if not found
      if ((!data && !error) || (error && error.code === 'PGRST116')) {
        const newProfile = {
          id: uid,
          email: email,
          role: isHardcodedAdmin ? 'admin' : 'user',
          subscription_tier: isHardcodedAdmin ? 'diamond' : 'free',
          status: isHardcodedAdmin ? 'approved' : 'pending',
          extra_slots: 0,
          created_at: new Date().toISOString(),
          modules: []
        };
        await supabase.from('profiles').insert(newProfile);
        data = newProfile;
      } else if (error && error.code === 'PGRST116') {
         // Fallback fix for type error
         error = { message: 'No data', details: '', hint: '', code: 'PGRST116', name: 'PostgrestError' };
      }

      // Auto-sync Admin Role
      if (isHardcodedAdmin && data && data.role !== 'admin') {
         await supabase.from('profiles').update({ role: 'admin', subscription_tier: 'diamond', status: 'approved' }).eq('id', uid);
         data.role = 'admin';
         data.subscription_tier = 'diamond';
         data.status = 'approved';
      }
      
      // Determine final state
      const finalRole = isHardcodedAdmin ? 'admin' : (data?.role || 'user');
      const isAdminRole = finalRole === 'admin';
      
      const finalTier = isAdminRole ? 'diamond' : ((data?.subscription_tier as SubscriptionTier) || 'free');
      const finalStatus = isHardcodedAdmin ? 'approved' : (data?.status || 'pending');
      const finalSlots = data?.extra_slots || 0;
      const finalModules = data?.modules || []; // Load manual modules
        
      setUser({
        id: uid,
        email: email,
        subscriptionTier: finalTier,
        role: finalRole,
        status: finalStatus as 'pending' | 'approved' | 'rejected',
        extraSlots: finalSlots,
        modules: finalModules
      });

    } catch (e) {
      console.error('Error loading profile', e);
      const isAdmin = email === ADMIN_EMAIL;
      setUser({ 
        id: uid, 
        email, 
        subscriptionTier: isAdmin ? 'diamond' : 'free', 
        role: isAdmin ? 'admin' : 'user', 
        status: isAdmin ? 'approved' : 'pending',
        extraSlots: 0,
        modules: []
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