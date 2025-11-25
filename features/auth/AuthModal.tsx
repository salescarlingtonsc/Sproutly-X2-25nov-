
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { isSupabaseConfigured } from '../../lib/supabase';

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

  // Sync initial error
  useEffect(() => {
    if (initialError) {
      setStatus('error');
      setMessage(initialError);
    }
  }, [initialError, isOpen]);

  // Reset state when modal opens or view changes
  useEffect(() => {
    if (!isOpen) {
      // Reset everything on close
      setEmail('');
      setPassword('');
      setView('login');
      setStatus('idle');
      setMessage('');
    } else {
      // Clear messages when switching views inside an open modal
      setStatus('idle');
      setMessage('');
    }
  }, [isOpen, view]);

  if (!isOpen) return null;

  if (!isSupabaseConfigured()) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-6 max-w-md w-full">
          <div className="text-center">
            <div className="text-4xl mb-3">🛠️</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Backend Not Configured</h2>
            <p className="text-gray-600 mb-4 text-sm">
              To enable Cloud features, you must add your Supabase credentials to <code>src/lib/supabase.ts</code>.
            </p>
            <button onClick={onClose} className="px-4 py-2 bg-gray-800 text-white rounded-lg">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleGoogleLogin = async () => {
    setStatus('loading');
    setMessage('');
    const { error } = await signInWithGoogle();
    if (error) {
      setStatus('error');
      setMessage(error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setMessage('');

    // --- FORGOT PASSWORD FLOW ---
    if (view === 'forgot_password') {
      const { error } = await resetPassword(email);
      if (error) {
        setStatus('error');
        setMessage(error.message);
      } else {
        setStatus('sent');
        setMessage(`Password reset instructions have been sent to ${email}.`);
      }
      return;
    }
    
    // --- MAGIC LINK FLOW ---
    if (useMagicLink) {
      const { error } = await signInWithEmail(email);
      if (error) {
        setStatus('error');
        setMessage(error.message);
      } else {
        setStatus('sent');
        setMessage(`We've sent a magic login link to ${email}.`);
      }
      return;
    }

    // --- PASSWORD LOGIN/SIGNUP FLOW ---
    if (view === 'signup') {
      const { data, error } = await signUpWithPassword(email, password);
      if (error) {
        setStatus('error');
        setMessage(error.message);
      } else {
        if (data?.user && !data.session) {
          setStatus('sent');
          setMessage('Account created! Please check your email to confirm your account.');
        } else {
           onClose();
        }
      }
    } else {
      // Login
      const { error } = await signInWithPassword(email, password);
      if (error) {
        setStatus('error');
        setMessage(error.message);
      } else {
        onClose();
      }
    }
  };

  const renderHeader = () => {
    switch(view) {
      case 'signup': return 'Create Account';
      case 'forgot_password': return 'Reset Password';
      default: return 'Welcome Back';
    }
  };

  const renderSubHeader = () => {
    switch(view) {
      case 'signup': return 'Get started with your financial planning';
      case 'forgot_password': return 'Enter your email to receive instructions';
      default: return 'Login to your advisor dashboard';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
        {status === 'sent' ? (
          <div className="p-8 text-center">
            <div className="text-5xl mb-4">✉️</div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">
               Check your inbox
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              {message}
            </p>
            {useMagicLink && (
              <div className="p-3 bg-blue-50 text-blue-800 text-xs rounded-lg mb-6 text-left">
                <strong>Tip:</strong> If clicking the link gives an error, check that your browser URL is added to the Supabase "Redirect URLs" allowlist.
              </div>
            )}
            <button 
              onClick={() => {
                setStatus('idle');
                setView('login');
              }}
              className="w-full py-2.5 bg-gray-100 text-gray-800 rounded-lg font-semibold hover:bg-gray-200"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
               {/* Mode Toggle Tabs (Only show for login/signup) */}
               {view !== 'forgot_password' ? (
                 <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button 
                    type="button"
                    onClick={() => setView('login')}
                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${view === 'login' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Log In
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                      setView('signup');
                      setUseMagicLink(false); // Sign up usually forces password
                    }}
                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${view === 'signup' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Sign Up
                  </button>
                </div>
               ) : (
                 <button 
                  onClick={() => setView('login')}
                  className="flex items-center text-gray-500 hover:text-gray-800 text-sm font-semibold"
                 >
                   ← Back
                 </button>
               )}
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-800">{renderHeader()}</h2>
              <p className="text-sm text-gray-500">{renderSubHeader()}</p>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">Email Address</label>
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg outline-none focus:border-indigo-500 transition-colors bg-white"
                  placeholder="you@agency.com"
                />
              </div>

              {!useMagicLink && view !== 'forgot_password' && (
                <div className="mb-5">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-gray-700 uppercase">Password</label>
                    {view === 'login' && (
                      <button 
                        type="button"
                        onClick={() => setView('forgot_password')}
                        className="text-[10px] text-indigo-600 font-bold hover:underline"
                      >
                        Forgot Password?
                      </button>
                    )}
                  </div>
                  <input 
                    type="password" 
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg outline-none focus:border-indigo-500 transition-colors bg-white"
                    placeholder="••••••••"
                  />
                  {view === 'signup' && (
                    <p className="text-[10px] text-gray-400 mt-1">Must be at least 6 characters</p>
                  )}
                </div>
              )}

              {status === 'error' && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100">
                  <strong>Error:</strong> {message}
                </div>
              )}

              <button 
                type="submit" 
                disabled={status === 'loading'}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg font-bold shadow-md hover:bg-indigo-700 transition-colors disabled:opacity-70 flex justify-center"
              >
                {status === 'loading' 
                  ? 'Processing...' 
                  : (view === 'forgot_password' 
                      ? 'Send Reset Instructions'
                      : (useMagicLink 
                          ? 'Send Magic Link' 
                          : (view === 'signup' ? 'Create Account' : 'Sign In')
                        )
                    )
                }
              </button>
              
              {/* Toggle Password / Magic Link */}
              {view !== 'forgot_password' && (
                <div className="mt-4 text-center text-xs">
                   <button 
                      type="button"
                      onClick={() => {
                        setUseMagicLink(!useMagicLink);
                        if (useMagicLink) setView('login'); // Reset view if unchecking magic link
                      }}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold underline decoration-indigo-200 underline-offset-2"
                   >
                      {useMagicLink ? '← Use Password Login' : 'Use Magic Link (Passwordless)'}
                   </button>
                </div>
              )}
            </form>

            {!useMagicLink && view === 'login' && (
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">Or use social login</span>
                </div>
              </div>
            )}

            {/* Google Login */}
            {!useMagicLink && view === 'login' && (
              <>
                <button
                  onClick={handleGoogleLogin}
                  disabled={status === 'loading'}
                  className="w-full py-3 bg-white border border-gray-300 rounded-lg text-gray-700 font-semibold shadow-sm hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Sign in with Google
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
