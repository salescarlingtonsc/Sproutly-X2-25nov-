
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import Button from '../../components/ui/Button';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialError?: string | null;
}

type AuthView = 'login' | 'signup' | 'forgot_password';

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialError }) => {
  const { signInWithEmail, signInWithPassword, signUpWithPassword, signInWithGoogle, resetPassword } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [view, setView] = useState<AuthView>('login');
  const [useMagicLink, setUseMagicLink] = useState(false);
  
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error' | 'success'>('idle');
  const [message, setMessage] = useState('');
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);

  // Connection Ping
  useEffect(() => {
    if (isOpen) {
      const checkPing = async () => {
        try {
          const { error } = await supabase!.from('profiles').select('id').limit(1);
          // We ignore "Auth session missing" errors as health is just API reachability
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

  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setPassword('');
      setView('login');
      setStatus('idle');
      setMessage('');
    } else {
      setStatus('idle');
      setMessage('');
    }
  }, [isOpen, view]);

  if (!isOpen) return null;

  if (!isSupabaseConfigured()) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-xl p-8 max-w-md w-full text-center" onClick={e => e.stopPropagation()}>
            <div className="text-5xl mb-4">🛠️</div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Supabase Missing</h2>
            <p className="text-slate-600 mb-6 text-sm">
              Quantum environment requires a cloud backend. Add your keys to <code className="bg-slate-100 px-1 rounded">src/lib/supabase.ts</code> to initialize the portal.
            </p>
            <Button variant="primary" onClick={onClose} className="w-full">Dismiss</Button>
        </div>
      </div>
    );
  }

  const handleGoogleLogin = async () => {
    setStatus('loading');
    setMessage('');
    try {
        const { error } = await signInWithGoogle();
        if (error) throw error;
    } catch (err: any) {
        setStatus('error');
        setMessage(err.message || "Google Authentication Aborted.");
    }
  };

  const handleDiagnostic = async () => {
      setStatus('loading');
      setMessage("Running system diagnostic...");
      try {
          const { error } = await supabase!.from('profiles').select('count', { count: 'exact', head: true });
          if (error) {
              if (error.message.includes('recursion') || error.message.includes('stack depth')) {
                  setMessage("SYSTEM ERROR: Database Recursion Loop. You need to run the Repair SQL in Supabase SQL Editor.");
                  setStatus('error');
              } else {
                  setMessage(`API ERROR: ${error.message}`);
                  setStatus('error');
              }
          } else {
              setMessage("System path clear. Credentials invalid or network flicker.");
              setStatus('error');
          }
      } catch (e: any) {
          setMessage("NETWORK ERROR: Blocked or no connection.");
          setStatus('error');
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
        if (view === 'forgot_password') {
            const { error } = await resetPassword(email);
            if (error) throw error;
            setStatus('sent');
            setMessage(`Instructions sent to ${email}.`);
            return;
        }
        
        if (useMagicLink) {
            const { error } = await signInWithEmail(email);
            if (error) throw error;
            setStatus('sent');
            setMessage(`Magic link dispatched to ${email}.`);
            return;
        }

        if (view === 'signup') {
            const { data, error } = await signUpWithPassword(email, password);
            if (error) throw error;
            if (data?.user && !data.session) {
                setStatus('sent');
                setMessage('Verification email sent! Check your inbox.');
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
        if (err.status === 400 && err.message?.includes('Invalid login credentials')) {
            setMessage("Login failed. Check your email or password.");
        } else if (err.message?.includes('stack depth')) {
            setMessage("CRITICAL: Database Loop Detected. Contact Administrator.");
        } else {
            setMessage(err.message || "An unexpected error occurred.");
        }
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div 
        className="bg-white rounded-[2rem] shadow-2xl max-w-sm w-full overflow-hidden flex flex-col relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-8">
            <div className="flex justify-between items-start mb-8">
                <div>
                   <h2 className="text-2xl font-black text-slate-800 tracking-tight">{view === 'signup' ? 'Create Account' : view === 'forgot_password' ? 'Reset Portal' : 'Advisor Login'}</h2>
                   <p className="text-xs text-slate-400 font-medium mt-1">Sproutly Quantum v3.0 Secured Entrance</p>
                </div>
                <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-900 transition-colors">✕</button>
            </div>
            
            {status === 'sent' ? (
                <div className="text-center py-10 animate-fade-in">
                    <div className="text-5xl mb-6">✉️</div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Check Inbound Signal</h3>
                    <p className="text-sm text-slate-500 mb-8">{message}</p>
                    <Button variant="secondary" onClick={() => { setView('login'); setStatus('idle'); }} className="w-full">Return to Login</Button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Email Node</label>
                        <input 
                            type="email" required value={email} onChange={e => setEmail(e.target.value)}
                            className="w-full bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-3 text-sm font-bold outline-none transition-all placeholder-slate-300"
                            placeholder="you@agency.com"
                        />
                    </div>

                    {!useMagicLink && view !== 'forgot_password' && (
                        <div className="space-y-1">
                            <div className="flex justify-between px-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Access Key</label>
                                {view === 'login' && <button type="button" onClick={() => setView('forgot_password')} className="text-[10px] font-black text-indigo-600 uppercase hover:underline">Forgot?</button>}
                            </div>
                            <input 
                                type="password" required value={password} onChange={e => setPassword(e.target.value)}
                                className="w-full bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-3 text-sm font-bold outline-none transition-all placeholder-slate-300"
                                placeholder="••••••••"
                            />
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="p-4 bg-red-50 border border-red-100 rounded-xl">
                            <p className="text-[11px] font-bold text-red-600 leading-tight">{message}</p>
                            {message.includes("Login failed") === false && (
                                <button type="button" onClick={handleDiagnostic} className="text-[9px] font-black uppercase text-red-400 mt-2 hover:underline">Run Diagnostic →</button>
                            )}
                        </div>
                    )}

                    <Button 
                        type="submit" variant="primary" className="w-full py-4 text-sm" 
                        isLoading={status === 'loading'}
                    >
                        {view === 'signup' ? 'Initiate Account' : view === 'forgot_password' ? 'Send Link' : 'Open Portal'}
                    </Button>

                    {view === 'login' && !useMagicLink && (
                        <>
                            <div className="relative py-2 flex items-center gap-4">
                                <div className="flex-1 h-px bg-slate-100"></div>
                                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">OR</span>
                                <div className="flex-1 h-px bg-slate-100"></div>
                            </div>
                            <button 
                                type="button" onClick={handleGoogleLogin} disabled={status === 'loading'}
                                className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 hover:bg-slate-50 py-3 rounded-xl shadow-sm transition-all active:scale-95"
                            >
                                <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-4 h-4" alt="G" />
                                <span className="text-xs font-bold text-slate-600">Sync with Google</span>
                            </button>
                        </>
                    )}

                    <div className="pt-4 text-center space-y-3">
                        <button 
                            type="button" onClick={() => { setView(view === 'signup' ? 'login' : 'signup'); setUseMagicLink(false); }}
                            className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors"
                        >
                            {view === 'signup' ? 'Already an advisor? Login' : 'New to Quantum? Create Account'}
                        </button>
                    </div>
                </form>
            )}
        </div>
        
        {/* Footer Status Bar */}
        <div className="bg-slate-50 px-8 py-3 border-t border-slate-100 flex justify-between items-center">
            <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : isHealthy === false ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-slate-300 animate-pulse'}`}></div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {isHealthy ? 'System Online' : isHealthy === false ? 'Signal Weak' : 'Pinging Core...'}
                </span>
            </div>
            {status === 'error' && (
                <button onClick={handleDiagnostic} className="text-[9px] font-black text-indigo-400 uppercase tracking-widest hover:text-indigo-600">Troubleshoot ↗</button>
            )}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
