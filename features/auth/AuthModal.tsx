import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import Button from '../../components/ui/Button';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialError?: string | null;
  defaultView?: 'login' | 'signup' | 'forgot_password' | 'update_password';
}

type AuthView = 'login' | 'signup' | 'forgot_password' | 'update_password';

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialError, defaultView = 'login' }) => {
  const { signInWithEmail, signInWithPassword, signUpWithPassword, signInWithGoogle, resetPassword, updatePassword, resendVerificationEmail, isRecoveryMode } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [view, setView] = useState<AuthView>(defaultView);
  const [useMagicLink, setUseMagicLink] = useState(false);
  
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error' | 'success'>('idle');
  const [message, setMessage] = useState('');
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    if (isOpen) {
      const checkPing = async () => {
        try {
          const { error } = await supabase!.from('profiles').select('id').limit(1);
          setIsHealthy(!error || error.code !== 'PGRST116');
        } catch (e) {
          setIsHealthy(false);
        }
      };
      checkPing();
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialError) {
      setStatus('error');
      setMessage(initialError);
    }
  }, [initialError, isOpen]);

  // Handle forcing recovery view
  useEffect(() => {
    if (isOpen) {
      if (isRecoveryMode) {
        setView('update_password');
      } else {
        setView(defaultView);
      }
      setPassword('');
      setConfirmPassword('');
      setStatus('idle');
      setMessage('');
      setUseMagicLink(false);
    }
  }, [isOpen, isRecoveryMode, defaultView]);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setStatus('loading');
    try {
        const { error } = await signInWithGoogle();
        if (error) throw error;
    } catch (err: any) {
        setStatus('error');
        setMessage(err.message || "Google Authentication Failed.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
        if (view === 'update_password') {
            if (password.length < 6) throw new Error("Password must be at least 6 characters.");
            if (password !== confirmPassword) throw new Error("Passwords do not match.");
            
            const { error } = await updatePassword(password);
            if (error) throw error;
            
            setStatus('success');
            setMessage("Password updated. Loading Quantum Core...");
            setTimeout(() => {
              onClose();
              window.location.hash = ''; 
            }, 1500);
            return;
        }

        if (view === 'forgot_password') {
            const { error } = await resetPassword(email);
            if (error) throw error;
            setStatus('sent');
            setMessage(`Check ${email} for reset link.`);
            return;
        }

        if (useMagicLink) {
            const { error } = await signInWithEmail(email);
            if (error) throw error;
            setStatus('sent');
            setMessage(`Magic link dispatched to ${email}. Click the link to log in instantly.`);
            return;
        }

        if (view === 'signup') {
            const { data, error } = await signUpWithPassword(email, password);
            if (error) throw error;
            if (data?.user && !data.session) {
                setStatus('sent');
                setMessage('Verify your email to continue.');
            } else {
                onClose();
            }
        } else {
            const { error } = await signInWithPassword(email, password);
            if (error) throw error;
            onClose();
        }
    } catch (err: any) {
        setStatus('error');
        setMessage(err.message || "An error occurred.");
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-[1000] flex items-center justify-center p-4 backdrop-blur-md animate-fade-in" onClick={isRecoveryMode ? undefined : onClose}>
      <div className="bg-white rounded-[2rem] shadow-2xl max-w-sm w-full overflow-hidden flex flex-col relative" onClick={e => e.stopPropagation()}>
        <div className="p-8">
            <div className="flex justify-between items-start mb-8">
                <div>
                   <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                       {view === 'update_password' ? 'Set New Password' : 
                        view === 'forgot_password' ? 'Reset Portal' : 
                        view === 'signup' ? 'Create Account' : 
                        useMagicLink ? 'Passwordless Login' : 'Advisor Login'}
                   </h2>
                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                       Secure Entrance Protocol
                   </p>
                </div>
                {!isRecoveryMode && <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-900 transition-colors">✕</button>}
            </div>
            
            {status === 'sent' ? (
                <div className="text-center py-10">
                    <div className="text-5xl mb-6">✉️</div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Signal Sent</h3>
                    <p className="text-sm text-slate-500 mb-8">{message}</p>
                    <Button variant="secondary" onClick={() => { setView('login'); setStatus('idle'); setUseMagicLink(false); }} className="w-full">Return to Login</Button>
                </div>
            ) : status === 'success' ? (
                <div className="text-center py-10">
                    <div className="text-5xl mb-6">✅</div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Success</h3>
                    <p className="text-sm text-slate-500 mb-8">{message}</p>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                    {view === 'update_password' ? (
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">New Password:</label>
                                <input 
                                    type="password" required value={password} onChange={e => setPassword(e.target.value)}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-3 text-sm font-bold outline-none transition-all"
                                    placeholder="Min. 6 characters"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Confirm New Password:</label>
                                <input 
                                    type="password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-3 text-sm font-bold outline-none transition-all"
                                    placeholder="Repeat password"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Email:</label>
                                <input 
                                    type="email" required value={email} onChange={e => setEmail(e.target.value)}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-3 text-sm font-bold outline-none transition-all"
                                    placeholder="you@agency.com"
                                />
                            </div>
                            
                            {!useMagicLink && view !== 'forgot_password' && (
                                <div className="space-y-1">
                                    <div className="flex justify-between px-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Password:</label>
                                        <button type="button" onClick={() => setView('forgot_password')} className="text-[10px] font-bold text-indigo-600 hover:underline uppercase">Forgot?</button>
                                    </div>
                                    <input 
                                        type="password" required value={password} onChange={e => setPassword(e.target.value)}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-3 text-sm font-bold outline-none transition-all"
                                        placeholder="••••••••"
                                    />
                                </div>
                            )}

                            {view === 'login' && (
                                <div className="text-right">
                                    <button 
                                        type="button" 
                                        onClick={() => setUseMagicLink(!useMagicLink)}
                                        className="text-[10px] font-black text-emerald-600 uppercase hover:underline tracking-tight"
                                    >
                                        {useMagicLink ? '← Back to Password' : 'Sign in with Magic Link →'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-[11px] font-bold text-red-600 leading-tight">
                            {message}
                        </div>
                    )}

                    <Button 
                        type="submit" variant="primary" className="w-full py-4 text-sm" 
                        isLoading={status === 'loading'}
                    >
                        {view === 'update_password' ? 'Confirm New Password' : 
                         view === 'forgot_password' ? 'Send Link' : 
                         view === 'signup' ? 'Create Account' : 
                         useMagicLink ? 'Send Magic Link' : 'Open Portal'}
                    </Button>

                    {!isRecoveryMode && view === 'login' && !useMagicLink && (
                        <>
                            <div className="relative py-2 flex items-center gap-4">
                                <div className="flex-1 h-px bg-slate-100"></div>
                                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">OR</span>
                                <div className="flex-1 h-px bg-slate-100"></div>
                            </div>
                            <button 
                                type="button" onClick={handleGoogleLogin} disabled={status === 'loading'}
                                className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 hover:bg-slate-50 py-3 rounded-xl shadow-sm transition-all"
                            >
                                <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-4" alt="G" />
                                <span className="text-xs font-bold text-slate-600">Sync with Google</span>
                            </button>
                        </>
                    )}

                    {!isRecoveryMode && (
                        <div className="pt-4 text-center">
                            <button 
                                type="button" onClick={() => { setView(view === 'signup' ? 'login' : 'signup'); setUseMagicLink(false); }}
                                className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors"
                            >
                                {view === 'signup' ? 'Already have an account? Login' : 'New to Sproutly? Create Account'}
                            </button>
                        </div>
                    )}
                </form>
            )}
        </div>
        
        <div className="bg-slate-50 px-8 py-3 border-t border-slate-100 flex justify-between items-center">
            <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-emerald-500' : isHealthy === false ? 'bg-red-500' : 'bg-slate-300 animate-pulse'}`}></div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {isHealthy ? 'System Online' : isHealthy === false ? 'Signal Weak' : 'Pinging...'}
                </span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
