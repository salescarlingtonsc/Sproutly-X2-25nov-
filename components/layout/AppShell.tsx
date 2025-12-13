
import React, { useState, useRef, useEffect } from 'react';
import TabButton from '../common/TabButton';
import { useAuth } from '../../contexts/AuthContext';
import { TIER_CONFIG, TAB_DEFINITIONS, canAccessTab } from '../../lib/config';

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
}

const AppShell: React.FC<AppShellProps> = ({ 
  activeTab, 
  setActiveTab, 
  children, 
  onLoginClick, 
  onPricingClick, 
  onSaveClick,
  clientRef,
  clientName,
  saveStatus = 'idle',
  lastSavedTime
}) => {
  const { user, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuRef]);

  const handleTabClick = (tabId: string) => {
    if (!user) return;
    
    if (canAccessTab(user, tabId)) {
      setActiveTab(tabId);
    } else {
      // If locked, open pricing modal to encourage upgrade
      onPricingClick();
    }
  };

  const getBadgeColor = (tier: string) => {
    switch(tier) {
      case 'platinum': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'diamond': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'organisation': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="w-10 h-10 text-emerald-600"
              >
                <path d="M7 20h10" />
                <path d="M10 20c5.5-2.5.8-6.4 3-10" />
                <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
                <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1 m-0 leading-tight">Sproutly Quantum</h1>
              <div className="flex items-center gap-2 text-xs text-gray-500 m-0">
                <span>A next-generation financial experience</span>
                {clientRef && (
                  <span className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-700 font-mono font-bold flex items-center gap-1">
                    <span className="text-[9px] text-gray-400 uppercase tracking-wider">REF:</span>
                    {clientRef}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* User Controls */}
          <div className="flex items-center gap-4">
            {user && (
              <>
                 {/* Auto-Save Indicator */}
                 <div className="hidden md:flex flex-col items-end mr-2">
                   {saveStatus === 'saving' && (
                     <span className="text-[10px] text-indigo-600 font-bold flex items-center gap-1">
                       <span className="animate-spin">↻</span> Saving...
                     </span>
                   )}
                   {saveStatus === 'saved' && (
                     <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                       ✓ Saved {lastSavedTime ? lastSavedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                     </span>
                   )}
                   {saveStatus === 'error' && (
                     <span className="text-[10px] text-red-600 font-bold">⚠️ Save Failed</span>
                   )}
                 </div>

                 {/* Global Save Button */}
                 <button
                    onClick={onSaveClick}
                    disabled={saveStatus === 'saving'}
                    className={`flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm border-b-2 border-emerald-800 active:border-b-0 active:translate-y-[2px] ${saveStatus === 'saving' ? 'opacity-70 cursor-not-allowed' : ''}`}
                    title="Save current client"
                 >
                   <span>💾</span> {saveStatus === 'saving' ? 'Saving...' : 'Save'}
                 </button>

                {/* Status Badges & Actions */}
                <div className="flex items-center gap-2">
                   {user.role === 'admin' && (
                      <span className="hidden sm:inline-block bg-purple-100 text-purple-700 text-[10px] px-2 py-1 rounded-full font-bold tracking-wider border border-purple-200">
                        ADMIN
                      </span>
                   )}
                   
                   <span className={`text-[10px] px-2 py-1 rounded-full font-bold tracking-wider border ${getBadgeColor(user.subscriptionTier)}`}>
                     {user.subscriptionTier.toUpperCase()}
                   </span>

                   {(user.subscriptionTier !== 'diamond' && user.subscriptionTier !== 'organisation') && (
                     <button 
                       onClick={onPricingClick} 
                       className="hidden sm:flex bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:opacity-90 text-[10px] px-3 py-1.5 rounded-full font-bold shadow-sm transition-all items-center gap-1"
                     >
                       <span>💎</span> View Pricing
                     </button>
                   )}
                </div>

                {/* Profile Section with Dropdown */}
                <div className="relative pl-4 border-l border-gray-200" ref={menuRef}>
                   <button 
                      onClick={() => setIsMenuOpen(!isMenuOpen)}
                      className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-white flex items-center justify-center shadow-md ring-2 ring-white cursor-pointer transition-transform hover:scale-105 active:scale-95"
                      title="User Menu"
                   >
                      <span className="font-bold text-sm">
                        {user.email?.charAt(0).toUpperCase()}
                      </span>
                   </button>

                   {/* User Dropdown Menu */}
                   {isMenuOpen && (
                      <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden transform origin-top-right transition-all z-50">
                        {/* Menu Header */}
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                          <p className="text-sm font-bold text-gray-900 truncate">{user.email}</p>
                          <p className="text-xs text-gray-500 mt-0.5 capitalize">{user.role} • {user.subscriptionTier}</p>
                        </div>

                        {/* Menu Items */}
                        <div className="py-1">
                          <button 
                             onClick={() => {
                                onPricingClick();
                                setIsMenuOpen(false);
                             }}
                             className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2 transition-colors"
                          >
                             <span>💎</span> View Pricing / Plans
                          </button>
                        </div>

                        {/* Menu Footer */}
                        <div className="border-t border-gray-100 bg-gray-50 py-1">
                          <button 
                             onClick={() => {
                                signOut();
                                setIsMenuOpen(false);
                             }}
                             className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 font-medium flex items-center gap-2 transition-colors"
                          >
                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                             </svg>
                             Sign Out
                          </button>
                        </div>
                      </div>
                   )}
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto pb-2 pt-2">
            {TAB_DEFINITIONS.map(tab => {
              const isLocked = user ? !canAccessTab(user, tab.id) : false;
              
              return (
                <TabButton
                  key={tab.id}
                  active={activeTab === tab.id}
                  onClick={() => handleTabClick(tab.id)}
                >
                  <div className={`flex items-center ${isLocked ? 'opacity-60 grayscale' : ''}`}>
                    <span className="mr-2">{tab.icon}</span>
                    {tab.label}
                    {isLocked && (
                      <span className="ml-2 text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded font-bold">
                        🔒
                      </span>
                    )}
                  </div>
                </TabButton>
              );
            })}
            
            {/* Admin Tab - Only visible if role is admin */}
            {user && user.role === 'admin' && (
               <TabButton
                  active={activeTab === 'admin'}
                  onClick={() => setActiveTab('admin')}
                >
                  <span className="mr-2">👑</span>
                  Admin
                </TabButton>
            )}
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="max-w-7xl mx-auto pb-20 pt-5">
        {children}
      </div>
      
      {/* Footer */}
      <div className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto p-6 text-center">
          <p className="text-xs text-gray-500">
            Sproutly Quantum v2.3.6 | A next-generation financial experience | {user ? 'Online Mode' : 'Local Mode'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AppShell;
