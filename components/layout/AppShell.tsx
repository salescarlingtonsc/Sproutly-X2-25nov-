
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { canAccessTab } from '../../lib/config';
import { Client } from '../../types';
import Sidebar from './Sidebar';
import CommandPalette from './CommandPalette';

interface AppShellProps {
  activeTab: string;
  setActiveTab: (id: string) => void;
  children: React.ReactNode;
  onLoginClick: () => void;
  onPricingClick: () => void;
  onSaveClick: () => void;
  clientRef?: string;
  clientName?: string;
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedTime?: Date | null;
  
  // New Props for Navigation/Search
  clients?: Client[];
  onLoadClient?: (client: Client) => void;
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
  onLoadClient
}) => {
  const { user, signOut } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close profile menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileRef]);

  const handleTabChange = (tabId: string) => {
    if (canAccessTab(user, tabId)) {
      setActiveTab(tabId);
    } else {
      onPricingClick();
    }
  };

  const handleClientSelect = (client: Client) => {
     if (onLoadClient) onLoadClient(client);
  };

  const getBadgeColor = (tier: string) => {
    switch(tier) {
      case 'platinum': return 'bg-indigo-100 text-indigo-700 border-indigo-200 shadow-indigo-100';
      case 'diamond': return 'bg-emerald-100 text-emerald-700 border-emerald-200 shadow-emerald-100';
      case 'organisation': return 'bg-purple-100 text-purple-700 border-purple-200 shadow-purple-100';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-900">
      
      {/* 1. SIDEBAR NAVIGATION */}
      <Sidebar 
         activeTab={activeTab} 
         setActiveTab={handleTabChange} 
         user={user} 
         isOpenMobile={isMobileMenuOpen}
         setIsOpenMobile={setIsMobileMenuOpen}
      />

      {/* 2. MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative w-full">
         
         {/* Background Blobs (moved here to stay within content area) */}
         <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
            <div className="absolute -top-20 -left-20 w-96 h-96 bg-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
            <div className="absolute -top-20 -right-20 w-96 h-96 bg-emerald-300 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
         </div>

         {/* Header Bar */}
         <header className="h-16 px-4 md:px-6 border-b border-gray-200 bg-white/80 backdrop-blur-md flex items-center justify-between z-20 shrink-0">
            
            {/* Mobile Toggle & Context */}
            <div className="flex items-center gap-3 md:gap-4">
               <button 
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="lg:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
               >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
               </button>

               <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                     {clientRef ? (
                        <>
                           <h2 className="text-sm font-bold text-slate-900 truncate max-w-[150px] md:max-w-none">{clientName || 'Unnamed Client'}</h2>
                           <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded hidden sm:inline-block">{clientRef}</span>
                        </>
                     ) : (
                        <h2 className="text-sm font-bold text-slate-900">Dashboard</h2>
                     )}
                  </div>
                  <div className="text-[10px] text-slate-400 hidden sm:block">
                     Press <kbd className="font-sans font-bold bg-slate-100 px-1 rounded border border-slate-200">Cmd K</kbd> to search
                  </div>
               </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2 md:gap-3">
               
               {/* Save Status - Always visible now */}
               <div className="flex flex-col items-end mr-1 md:mr-2">
                  {saveStatus === 'saving' && (
                     <span className="text-[10px] text-indigo-600 font-bold flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-full">
                        <span className="animate-spin">↻</span> <span className="hidden sm:inline">Syncing...</span>
                     </span>
                  )}
                  {saveStatus === 'saved' && (
                     <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-full">
                        ✓ <span className="hidden sm:inline">Saved</span>
                     </span>
                  )}
                  {saveStatus === 'error' && (
                     <span className="text-[10px] text-red-600 font-bold flex items-center gap-1 bg-red-50 px-2 py-1 rounded-full">
                        ⚠️ <span className="hidden sm:inline">Failed</span>
                     </span>
                  )}
                  {saveStatus === 'idle' && lastSavedTime && (
                      <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                        <span className="hidden sm:inline">Saved</span> {lastSavedTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                  )}
               </div>

               <button
                  onClick={onSaveClick}
                  disabled={saveStatus === 'saving'}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-all shadow-sm active:scale-95"
                  title="Save Changes"
               >
                  <span>💾</span> <span className="hidden sm:inline">Save</span>
               </button>

               <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block"></div>

               {/* User Profile */}
               {user && (
                  <div className="relative" ref={profileRef}>
                     <button 
                        onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                        className="flex items-center gap-2 hover:bg-gray-100 p-1 rounded-full pr-0 md:pr-3 transition-colors"
                     >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold border-2 border-white shadow-sm">
                           {user.email?.charAt(0).toUpperCase()}
                        </div>
                        <span className={`hidden md:block text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${getBadgeColor(user.subscriptionTier)}`}>
                           {user.subscriptionTier}
                        </span>
                     </button>

                     {/* Dropdown */}
                     {isProfileMenuOpen && (
                        <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 animate-fade-in-up">
                           <div className="px-4 py-3 border-b border-gray-50">
                              <p className="text-xs font-bold text-slate-900 truncate">{user.email}</p>
                              <p className="text-[10px] text-slate-500 capitalize">{user.role}</p>
                           </div>
                           <button 
                              onClick={() => { onPricingClick(); setIsProfileMenuOpen(false); }}
                              className="w-full text-left px-4 py-2 text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2"
                           >
                              💳 Manage Plan
                           </button>
                           <button 
                              onClick={() => { signOut(); setIsProfileMenuOpen(false); }}
                              className="w-full text-left px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 flex items-center gap-2"
                           >
                              🚪 Sign Out
                           </button>
                        </div>
                     )}
                  </div>
               )}
            </div>
         </header>

         {/* Scrollable Content */}
         <main className="flex-1 overflow-y-auto relative z-10 scroll-smooth">
            <div className="max-w-[1400px] mx-auto min-h-full">
               {children}
            </div>
            
            {/* Footer */}
            <div className="py-8 text-center opacity-40">
               <div className="flex justify-center items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Sproutly Intelligence Engine v2.5</span>
               </div>
            </div>
         </main>

      </div>

      {/* Command Palette */}
      <CommandPalette 
         clients={clients} 
         onNavigate={handleTabChange}
         onSelectClient={handleClientSelect}
      />

    </div>
  );
};

export default AppShell;
