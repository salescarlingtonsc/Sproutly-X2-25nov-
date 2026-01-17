import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { canAccessTab, TAB_DEFINITIONS } from '../../lib/config';
import { Client } from '../../types';
import Sidebar from './Sidebar';
import CommandPalette from './CommandPalette';
import { fmtTime } from '../../lib/helpers';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { db } from '../../lib/db'; 

interface AppShellProps {
  activeTab: string;
  setActiveTab: (id: string) => void;
  children: React.ReactNode;
  onLoginClick: () => void;
  onPricingClick: () => void;
  onSaveClick: () => void;
  clientRef?: string;
  clientName?: string;
  saveStatus?: 'idle' | 'saving' | 'saved' | 'pending_sync' | 'error';
  lastSavedTime?: Date | null;
  clients?: Client[];
  onLoadClient?: (client: Client) => void;
  pendingSyncCount?: number;
  syncError?: string | null;
}

const AppShell: React.FC<AppShellProps> = ({
  activeTab,
  setActiveTab,
  children,
  onPricingClick,
  onSaveClick,
  clientRef,
  clientName,
  saveStatus = 'idle',
  lastSavedTime,
  clients = [],
  onLoadClient,
  pendingSyncCount = 0,
  syncError
}) => {
  const { user, refreshProfile, signOut } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // UI state for retry button
  const [isRetryingSync, setIsRetryingSync] = useState(false);

  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTabChange = (tabId: string) => {
    if (canAccessTab(user, tabId)) setActiveTab(tabId);
    else onPricingClick();
  };

  const handleSaveProfile = async () => {
    if (!user || !supabase) return;
    setIsSavingProfile(true);
    try {
      const { error } = await supabase.from('profiles').update({ name: editName }).eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
      setIsEditProfileOpen(false);
    } catch (e) {
      alert('Failed to update profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Retry cloud sync (flush local outbox)
  const handleRetryCloudSync = async () => {
    if (!user?.id) return;

    setIsRetryingSync(true);
    try {
      // Attempt flush
      await db.flushCloudQueue(user.id);

      // Tell the app "queue changed" so AppInner can refresh UI if it listens
      window.dispatchEvent(new Event('sproutly:queue_changed'));

      // Fallback: if still pending, at least try a soft refresh after a moment
      setTimeout(() => {
        window.dispatchEvent(new Event('focus'));
      }, 50);
    } catch (e) {
      // We intentionally do not throw; UI will still show pending
      console.warn('[SYNC] Retry failed:', e);
    } finally {
      setIsRetryingSync(false);
    }
  };

  const activeDef = TAB_DEFINITIONS.find(t => t.id === activeTab);
  const headerTitle = activeDef?.label || 'Dashboard';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-900 overscroll-none">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        user={user}
        isOpenMobile={isMobileMenuOpen}
        setIsOpenMobile={setIsMobileMenuOpen}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden relative w-full overscroll-none">
        <header className="h-16 px-4 md:px-6 border-b border-gray-200 bg-white/80 backdrop-blur-md flex items-center justify-between z-20 shrink-0">
          <div className="flex items-center gap-3 md:gap-4">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-6 h-6"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>

            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                {clientRef ? (
                  <>
                    <h2 className="text-sm font-bold text-slate-900 truncate max-w-[150px]">
                      {clientName || 'Unnamed Client'}
                    </h2>
                    <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded hidden sm:inline-block">
                      DRAFT
                    </span>
                  </>
                ) : (
                  <h2 className="text-sm font-bold text-slate-900">{headerTitle}</h2>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <div className="flex flex-col items-end mr-1 md:mr-2 min-w-[160px]">
              {saveStatus === 'saving' && (
                <span className="text-[10px] text-indigo-600 font-black flex items-center gap-1 bg-indigo-50 px-2.5 py-1 rounded-full animate-pulse border border-indigo-100 shadow-sm">
                  <span className="animate-spin text-xs">↻</span> SYNCING
                </span>
              )}

              {saveStatus === 'saved' && (
                <span className="text-[10px] text-emerald-600 font-black flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 shadow-sm">
                  ✓ CLOUD SAVED
                </span>
              )}

              {/* Improved wording for pending with error info */}
              {saveStatus === 'pending_sync' && (
                <button 
                    onClick={() => syncError && alert(`Cloud Sync Error:\n\n${syncError}\n\nTip: Check if you ran the Database Repair script in Admin.`)}
                    className="text-[10px] text-amber-700 font-black flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 shadow-sm hover:bg-amber-100 transition-colors cursor-pointer text-left"
                    title={syncError ? `Sync Error: ${syncError}` : "Waiting for network..."}
                >
                  <span>💾 SAVED LOCAL {syncError ? '⚠️' : '· ☁️ PENDING'}</span>
                </button>
              )}

              {saveStatus === 'error' && (
                <button
                  onClick={() => syncError && alert(`Error: ${syncError}`)}
                  className="text-[10px] text-red-600 font-black flex items-center gap-1 bg-red-50 px-2.5 py-1 rounded-full border border-red-200 hover:bg-red-100"
                >
                  ⚠️ SAVE FAILED
                </button>
              )}

              {saveStatus === 'idle' && (
                <>
                  {pendingSyncCount > 0 ? (
                    <button
                        onClick={handleRetryCloudSync}
                        className="text-[10px] text-amber-700 font-black flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 shadow-sm hover:bg-amber-100"
                    >
                      💾 SAVED LOCAL · ☁️ {pendingSyncCount} PENDING
                    </button>
                  ) : lastSavedTime ? (
                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                      LAST SYNC: {fmtTime(lastSavedTime)}
                    </span>
                  ) : null}
                </>
              )}
            </div>

            {/* Retry Cloud Sync button (only shows when pending exists) */}
            {pendingSyncCount > 0 && (
              <button
                onClick={handleRetryCloudSync}
                disabled={isRetryingSync || saveStatus === 'saving'}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 ${
                  isRetryingSync || saveStatus === 'saving'
                    ? 'bg-amber-100 text-amber-400'
                    : 'bg-amber-600 text-white hover:bg-amber-700'
                }`}
                title="Try pushing pending saves to the cloud"
              >
                <span>{isRetryingSync ? '↻' : '☁️'}</span>
                <span className="hidden sm:inline">{isRetryingSync ? 'Retrying…' : 'Retry Sync'}</span>
              </button>
            )}

            <button
              onClick={onSaveClick}
              disabled={saveStatus === 'saving' || !clientName}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 ${
                saveStatus === 'saving' || !clientName 
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
              title={!clientName ? "Enter a name in Profile to save" : "Push Changes"}
            >
              <span>{saveStatus === 'saving' ? '⏳' : '💾'}</span>{' '}
              <span className="hidden sm:inline">Push Changes</span>
            </button>

            <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block"></div>

            {user && (
              <div className="relative" ref={profileRef}>
                <button
                  onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                  className="flex items-center gap-2 hover:bg-gray-100 p-1 rounded-full pr-0 md:pr-3 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold border-2 border-white shadow-sm">
                    {user.email?.charAt(0).toUpperCase()}
                  </div>
                </button>

                {isProfileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50">
                    <div className="px-4 py-3 border-b border-gray-50">
                      <p className="text-xs font-bold text-slate-900 truncate">{user.email}</p>
                      <p className="text-[10px] text-slate-500 capitalize">{user.role}</p>
                    </div>

                    <button
                      onClick={() => {
                        setEditName(user.name || '');
                        setIsEditProfileOpen(true);
                        setIsProfileMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-xs font-bold text-slate-600 hover:bg-indigo-50 flex items-center gap-2 transition-colors"
                    >
                      👤 Edit Profile
                    </button>

                    <button
                      onClick={() => {
                        signOut();
                        setIsProfileMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 flex items-center gap-2 transition-colors"
                    >
                      🚪 Sign Out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto relative z-10 scroll-smooth">
          <div className="max-w-[1400px] mx-auto min-h-full">{children}</div>
        </main>
      </div>

      <CommandPalette clients={clients} onNavigate={handleTabChange} onSelectClient={onLoadClient || (() => {})} />

      <Modal isOpen={isEditProfileOpen} onClose={() => setIsEditProfileOpen(false)} title="Edit My Profile">
        <div className="space-y-4">
          <input
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm font-bold text-slate-900 outline-none"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setIsEditProfileOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveProfile} isLoading={isSavingProfile}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AppShell;