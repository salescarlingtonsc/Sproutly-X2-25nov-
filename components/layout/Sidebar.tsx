
import React from 'react';
import { TAB_DEFINITIONS, TAB_GROUPS, canAccessTab } from '../../lib/config';
import { UserProfile } from '../../types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: UserProfile | null;
  isOpenMobile: boolean;
  setIsOpenMobile: (open: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, user, isOpenMobile, setIsOpenMobile }) => {
  
  const handleNav = (tabId: string) => {
    setActiveTab(tabId);
    setIsOpenMobile(false);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsOpenMobile(false)}
        ></div>
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed top-0 left-0 bottom-0 w-64 bg-white border-r border-gray-200 z-50 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static flex flex-col
        ${isOpenMobile ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo Header */}
        <div className="h-16 flex items-center px-6 border-b border-gray-100">
          <div className="flex items-center justify-center bg-indigo-600 p-1.5 rounded-lg shadow-md mr-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-white">
              <path d="M7 20h10" />
              <path d="M10 20c5.5-2.5.8-6.4 3-10" />
              <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
              <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
            </svg>
          </div>
          <div className="font-extrabold text-slate-800 tracking-tight leading-none">
            Sproutly<span className="text-indigo-600">Quantum</span>
          </div>
        </div>

        {/* Scrollable Nav Area */}
        <div className="flex-1 overflow-y-auto py-6 px-3 space-y-8 custom-scrollbar">
          {TAB_GROUPS.map((group, groupIdx) => {
            // Filter visible tabs based on permissions
            const visibleTabs = group.tabs.filter(tabId => {
               if (!user) return false;
               // Admin tab logic handled in canAccessTab, but double check we hide it from groups if needed
               if (tabId === 'admin' && user.role !== 'admin') return false;
               return true;
            });

            if (visibleTabs.length === 0) return null;

            return (
              <div key={groupIdx}>
                <h3 className="px-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                  {group.title}
                </h3>
                <div className="space-y-0.5">
                  {visibleTabs.map(tabId => {
                    const def = TAB_DEFINITIONS.find(t => t.id === tabId);
                    if (!def) return null;
                    
                    const isLocked = !canAccessTab(user, tabId);
                    const isActive = activeTab === tabId;

                    return (
                      <button
                        key={tabId}
                        onClick={() => !isLocked && handleNav(tabId)}
                        disabled={isLocked}
                        className={`
                          w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all group
                          ${isActive 
                            ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200' 
                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                          }
                          ${isLocked ? 'opacity-50 cursor-not-allowed grayscale' : ''}
                        `}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`text-base transition-transform group-hover:scale-110 ${isActive ? 'scale-110' : ''}`}>
                            {def.icon}
                          </span>
                          <span>{def.label}</span>
                        </div>
                        {isLocked && <span className="text-[9px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded uppercase tracking-wider">Lock</span>}
                        {isActive && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600"></div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Area */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50">
           <div className="text-[10px] text-gray-400 font-medium text-center">
              v2.5.0 • <span className="text-emerald-500">Online</span>
           </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
