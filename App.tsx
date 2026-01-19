
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useClient } from './contexts/ClientContext';
import { useToast } from './contexts/ToastContext';
import { useDialog } from './contexts/DialogContext';
import { db } from './lib/db';
import { supabase } from './lib/supabase'; // Added for session check
import { Diagnostics } from './lib/diagnostics';
import { Client } from './types';

// Components
import AppShell from './components/layout/AppShell';
import LandingPage from './features/auth/LandingPage';
import AuthModal from './features/auth/AuthModal';
import PricingModal from './features/subscription/PricingModal';
import DbRepairModal from './features/admin/components/DbRepairModal';

// Features
import DashboardTab from './features/dashboard/DashboardTab';
import CrmTab from './features/crm/CrmTab';
import ProfileTab from './features/profile/ProfileTab';
import RemindersTab from './features/reminders/RemindersTab';
import MarketNewsTab from './features/market/MarketNewsTab';
import PortfolioTab from './features/portfolio/PortfolioTab';
import LifeEventsTab from './features/life-events/LifeEventsTab';
import ChildrenTab from './features/children/ChildrenTab';
import CpfTab from './features/cpf/CpfTab';
import CashflowTab from './features/planning/CashflowTab';
import InsuranceTab from './features/insurance/InsuranceTab';
import RetirementTab from './features/planning/RetirementTab';
import InvestorTab from './features/investor/InvestorTab';
import WealthToolTab from './features/wealth/WealthToolTab';
import PropertyCalculatorTab from './features/property/PropertyCalculatorTab';
import VisionBoardTab from './features/vision/VisionBoardTab';
import AnalyticsTab from './features/analytics/AnalyticsTab';
import ReportTab from './features/report/ReportTab';
import AdminTab from './features/admin/AdminTab';
import DisclaimerTab from './features/disclaimer/DisclaimerTab';

const CLIENT_CACHE_KEY = 'sproutly_clients_v2';
const PENDING_SYNC_KEY = 'sproutly_pending_sync';
const SESSION_BASELINE_KEY = 'sproutly_session_baseline';
const LAST_TAB_KEY = 'sproutly_last_active_tab';
const LAST_CLIENT_ID_KEY = 'sproutly_last_client_id';

export default function App() {
  const { user, isLoading: authLoading } = useAuth();
  const { 
    clientId, profile, loadClient, resetClient, generateClientObject, promoteToSaved 
  } = useClient();
  const toast = useToast();
  const { confirm } = useDialog();

  // 1. Initialize Active Tab from Storage (Default to CRM)
  const [activeTab, setActiveTab] = useState(() => {
      if (typeof window !== 'undefined') {
          return localStorage.getItem(LAST_TAB_KEY) || 'crm';
      }
      return 'crm';
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [showEmergencyRepair, setShowEmergencyRepair] = useState(false);
  
  const [clients, setClients] = useState<Client[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  // Refs for Logic
  const isSavingRef = useRef(false);
  const saveStartTimeRef = useRef(0);
  const lastSavedJson = useRef<string>("");
  const isHydratedRef = useRef(false);
  const transferringIds = useRef<Set<string>>(new Set());
  
  // --- RACE CONDITION GUARD ---
  // Tracks when the last "Wake Up" refresh started.
  // Used to invalidate stale background saves that finish AFTER a refresh has begun.
  const lastRefreshTimeRef = useRef<number>(0); 
  
  // Debounce for Wake Up
  const lastWakeUpTime = useRef<number>(0);

  // 2. Persist Tab Selection
  useEffect(() => {
      if (activeTab) localStorage.setItem(LAST_TAB_KEY, activeTab);
  }, [activeTab]);

  // 3. Dynamic Title Updates
  useEffect(() => {
      if (profile.name) {
          document.title = `${profile.name} | Sproutly`;
      } else {
          const tabName = activeTab.charAt(0).toUpperCase() + activeTab.slice(1);
          document.title = `${tabName} | Sproutly`;
      }
  }, [activeTab, profile.name]);

  // --- DATA LOADING ---
  const loadClientsList = useCallback(async () => {
     try {
       // Mark start of refresh to invalidate any pending stale saves
       lastRefreshTimeRef.current = Date.now();
       
       const data = await db.getClients(user?.id);
       setClients(data);
       localStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify(data));
       setLastSaved(new Date()); 
       const pendingSync = localStorage.getItem(PENDING_SYNC_KEY);
       if (pendingSync === 'true' && navigator.onLine) {
           Diagnostics.log('CloudRecovery', 'Pending Sync Flag detected on boot.', 'info');
       }
     } catch (e) {
       console.error("Hydration failed.");
     }
  }, [user]);

  // Initial Load & Storage Listener (Cross-Tab Sync)
  useEffect(() => {
    if (user) {
      loadClientsList();
      
      // Realtime DB subscription
      const unsub = db.subscribeToChanges((event: string) => {
         if (event === 'remote_update') loadClientsList();
      });

      // Cross-Tab Synchronization (LocalStorage events only fire on OTHER tabs)
      const handleStorageChange = (e: StorageEvent) => {
          if (e.key === CLIENT_CACHE_KEY && e.newValue) {
              try {
                  const newClients = JSON.parse(e.newValue);
                  setClients(newClients);
                  Diagnostics.log('TabSync', 'Synced clients from another tab.', 'info');
              } catch (err) {
                  console.error("Tab sync parse error");
              }
          }
      };
      
      window.addEventListener('storage', handleStorageChange);

      return () => { 
          if(unsub) unsub(); 
          window.removeEventListener('storage', handleStorageChange);
      };
    }
  }, [user, loadClientsList]);

  // 4. Restore Last Active Client on Boot
  useEffect(() => {
      if (clients.length > 0 && !clientId) {
          const lastId = localStorage.getItem(LAST_CLIENT_ID_KEY);
          if (lastId) {
              const found = clients.find(c => c.id === lastId);
              if (found) {
                  // Restore without redirecting tab (preserve the tab restored above)
                  handleLoadClient(found, false); 
              }
          }
      }
  }, [clients]);

  // --- ACTIONS ---
  const handleNewClient = async () => {
     if (profile.name && clientId === null) {
        const ok = await confirm({
           title: "Discard Strategy?",
           message: "Your current profile draft will be lost. Proceed?",
           isDestructive: true,
           confirmText: "Discard"
        });
        if (!ok) return;
     }
     resetClient();
     lastSavedJson.current = ""; 
     sessionStorage.removeItem(SESSION_BASELINE_KEY);
     localStorage.removeItem(LAST_CLIENT_ID_KEY); // Clear persisted ID
     isHydratedRef.current = true;
     setActiveTab('profile');
     toast.info("Fresh strategy initialized");
  };

  const handleLoadClient = (client: Client, redirect = true) => {
     const seed = JSON.stringify(client);
     lastSavedJson.current = seed; 
     sessionStorage.setItem(SESSION_BASELINE_KEY, seed);
     localStorage.setItem(LAST_CLIENT_ID_KEY, client.id); // Save ID
     isHydratedRef.current = true;
     loadClient(client);
     if (redirect) setActiveTab('profile');
  };

  const handleSaveClient = useCallback(async (isAutoSave = false, overrideClient?: Client, forceSave = false) => {
     // 1. VISIBILITY CHECK (Override if forceSave is true)
     if (!forceSave && typeof document !== 'undefined' && document.hidden) {
         return;
     }

     if (!user || (user.status !== 'approved' && user.status !== 'active')) return;
     
     if (isSavingRef.current || transferringIds.current.size > 0) {
         if (isSavingRef.current) Diagnostics.log('SaveBlocked', 'Mutex Locked (Already saving)', 'warning');
         return;
     }

     const clientData = overrideClient || generateClientObject();
     
     if (!isHydratedRef.current || !clientData.profile.name) {
         if (!isAutoSave) {
             setSaveStatus('saved');
             setTimeout(() => setSaveStatus('idle'), 2000);
         }
         return; 
     }

     // 5. STABLE DIFFING
     const { lastUpdated: _ts, ...currentContent } = clientData;
     let lastSavedContent = {};
     try {
        const parsed = JSON.parse(lastSavedJson.current || '{}');
        const { lastUpdated: _oldTs, ...rest } = parsed;
        lastSavedContent = rest;
     } catch (e) {}

     const currentHash = JSON.stringify(currentContent);
     const lastHash = JSON.stringify(lastSavedContent);
     const isMarkedDirty = localStorage.getItem(PENDING_SYNC_KEY) === 'true';

     if (currentHash === lastHash && !forceSave && !isMarkedDirty) {
        if (!isAutoSave) {
            setLastSaved(new Date());
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        }
        return; 
     }

     // 6. Lock & Execute
     isSavingRef.current = true;
     const startTime = Date.now();
     saveStartTimeRef.current = startTime;
     
     if (!isAutoSave) setSaveStatus('saving');

     try {
        const isNewClient = !clientId;
        const saved = await db.saveClient(clientData, user.id);
        
        setClients(prev => {
            // RACE CONDITION GUARD:
            if (lastRefreshTimeRef.current > startTime) {
                Diagnostics.log('SaveIgnored', 'Dropped stale save result (refreshed during save)', 'warning');
                return prev;
            }

            const exists = prev.find(c => c.id === saved.id);
            const newList = exists ? prev.map(c => c.id === saved.id ? saved : c) : [...prev, saved];
            localStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify(newList));
            return newList;
        });

        if (isNewClient) {
            promoteToSaved(saved);
            localStorage.setItem(LAST_CLIENT_ID_KEY, saved.id);
        }

        const newBaseline = JSON.stringify(saved);
        lastSavedJson.current = newBaseline;
        sessionStorage.setItem(SESSION_BASELINE_KEY, newBaseline);
        setLastSaved(new Date());
        localStorage.removeItem(PENDING_SYNC_KEY);
        
        Diagnostics.log('SaveSuccess', 'Data persisted successfully', 'success');

        if (!isAutoSave) {
           setSaveStatus('saved');
           setTimeout(() => setSaveStatus('idle'), 2000);
        } else {
           if (saveStatus === 'idle') {
               setSaveStatus('saved');
               setTimeout(() => setSaveStatus('idle'), 2000);
           }
        }
     } catch (e: any) {
        const isNetworkIssue = e.message && (e.message.includes('Timeout') || e.message.includes('fetch') || e.message.includes('Network') || e.message.includes('Offline') || e.message.includes('Saved Offline'));
        
        if (isNetworkIssue) {
             Diagnostics.log('SaveSoftFail', `Network issue. Local save assumed. Flagging for Cloud Recovery.`, 'warning');
             localStorage.setItem(PENDING_SYNC_KEY, 'true');

             setClients(prev => {
                const exists = prev.find(c => c.id === clientData.id);
                const newList = exists ? prev.map(c => c.id === clientData.id ? clientData : c) : [...prev, clientData];
                localStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify(newList));
                return newList;
             });

             setSaveStatus('saved'); 
             setLastSaved(new Date());
             setTimeout(() => setSaveStatus('idle'), 2000);
             
             if (!isAutoSave && !forceSave) toast.success("Saved to Device (Syncing...)");
        } else {
             // Handle Critical Recursion Error
             if (e.message.includes('recursion') || e.message.includes('stack depth')) {
                 Diagnostics.log('SaveCritical', 'Infinite Loop Detected during background save. Repair needed.', 'error');
                 setSaveStatus('error');
                 setShowEmergencyRepair(true); // Surface repair button
                 return; // Exit
             }

             Diagnostics.log('SaveError', e.message, 'error');
             setSaveStatus('error');
             const errorMsg = e.message || String(e);
             if (!isAutoSave && !forceSave) toast.error("Save failed: " + errorMsg);
        }
     } finally {
        isSavingRef.current = false;
        saveStartTimeRef.current = 0;
     }
  }, [user, generateClientObject, clientId, promoteToSaved, saveStatus]);

  // --- ZOMBIE LOCK DETECTION & RESUME ---
  useEffect(() => {
    const handleWakeUp = async (source: string) => {
        // Debounce: If triggered multiple times within 500ms (Reduced from 2000ms)
        const now = Date.now();
        if (now - lastWakeUpTime.current < 500) return;
        lastWakeUpTime.current = now;

        Diagnostics.log('App', `Wake Up Triggered via ${source}. Resetting locks...`, 'info');
        
        // 1. FORCE RESET DB LOCKS
        db.resetLocks(); 
        
        // 2. FORCE RESET LOCAL LOCKS
        isSavingRef.current = false;
        saveStartTimeRef.current = 0;
        if (saveStatus === 'saving') setSaveStatus('idle');

        // 3. CHECK SESSION
        if (supabase) {
            // Only soft check session, don't force refresh unless necessary to be fast
            const { data, error } = await supabase.auth.getSession();
            if (error || !data.session) {
                 Diagnostics.log('Auth', 'Session invalid on wake. Reloading.', 'error');
                 window.location.reload();
                 return;
            }
        }
        
        // 4. VISUAL & DATA REFRESH
        setSaveStatus('saving'); // Give immediate visual feedback ("Syncing...")
        await loadClientsList();
        setTimeout(() => setSaveStatus('idle'), 500); // Clear visual state after quick sync

        setTimeout(() => {
            const isDirty = localStorage.getItem(PENDING_SYNC_KEY) === 'true';
            if (isDirty) {
                 if (navigator.onLine) {
                     Diagnostics.log('CloudRecovery', 'Network warmup complete. Triggering pending sync.', 'info');
                     handleSaveClient(true, undefined, true);
                 }
            }
        }, 1000);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
          // Going background
          Diagnostics.log('App', 'App hidden. Triggering background save.', 'info');
          localStorage.setItem(PENDING_SYNC_KEY, 'true');
          handleSaveClient(true, undefined, true);
      } else {
          // Waking up via Visibility
          handleWakeUp('Visibility');
      }
    };

    const handleWindowFocus = () => {
        // Waking up via Focus (Tab Switch)
        handleWakeUp('Focus');
    };

    const handleOnline = () => {
        Diagnostics.log('Network', 'Online event detected. Triggering immediate sync.', 'success');
        handleSaveClient(true, undefined, true);
        loadClientsList();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus); 
    window.addEventListener('online', handleOnline); 
    
    return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleWindowFocus);
        window.removeEventListener('online', handleOnline);
    };
  }, [handleSaveClient, saveStatus, loadClientsList]);

  // --- RENDERING ---
  
  if (authLoading) return null;

  if (!user) {
    return (
      <>
        <LandingPage onLogin={() => setIsAuthModalOpen(true)} />
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      </>
    );
  }

  // Handle Inactive/Pending Users
  if (user.status !== 'approved' && user.status !== 'active') {
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-50">
              <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md text-center border border-slate-200">
                  <div className="text-4xl mb-4">⏳</div>
                  <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Pending</h1>
                  <p className="text-slate-500 mb-6">
                      Your account ({user.email}) is currently <strong>{user.status}</strong>. 
                      Please contact your agency director for approval.
                  </p>
                  <button 
                      onClick={() => window.location.reload()}
                      className="px-6 py-2 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 transition-colors"
                  >
                      Check Status
                  </button>
              </div>
          </div>
      );
  }

  const handleDeleteClient = async (id: string) => {
      try {
          await db.deleteClient(id);
          setClients(prev => prev.filter(c => c.id !== id));
          if (clientId === id) {
              resetClient();
              localStorage.removeItem(LAST_CLIENT_ID_KEY); // Ensure ID is cleared
          }
      } catch (e: any) {
          toast.error(e.message);
      }
  };

  const handleUpdateGlobalClient = (updated: Client) => {
      setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
      // Auto-save logic for global updates is handled by the component invoking this, 
      // or we can trigger it here:
      db.saveClient(updated, user.id); 
  };

  return (
    <AppShell 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      onLoginClick={() => setIsAuthModalOpen(true)}
      onPricingClick={() => setIsPricingModalOpen(true)}
      onSaveClick={() => handleSaveClient(false, undefined, true)}
      clientRef={profile.name ? (profile.name.substring(0,3).toUpperCase() + '-' + (clientId?.substring(0,4) || 'NEW')) : undefined}
      clientName={profile.name}
      saveStatus={saveStatus}
      lastSavedTime={lastSaved}
      clients={clients}
      onLoadClient={handleLoadClient}
      onSystemRefresh={loadClientsList}
    >
      {activeTab === 'dashboard' && <DashboardTab user={user} clients={clients} onNewClient={handleNewClient} onLoadClient={handleLoadClient} setActiveTab={setActiveTab} />}
      {activeTab === 'crm' && (
          <CrmTab 
              clients={clients} 
              profile={profile} 
              selectedClientId={clientId}
              newClient={handleNewClient} 
              saveClient={() => handleSaveClient(false)} 
              loadClient={handleLoadClient} 
              deleteClient={handleDeleteClient}
              onRefresh={loadClientsList}
              onUpdateGlobalClient={handleUpdateGlobalClient}
          />
      )}
      {activeTab === 'profile' && <ProfileTab clients={clients} onLoadClient={handleLoadClient} onNewProfile={handleNewClient} />}
      {activeTab === 'reminders' && <RemindersTab />}
      {activeTab === 'market' && <MarketNewsTab />}
      {activeTab === 'portfolio' && <PortfolioTab clients={clients} onUpdateClient={handleUpdateGlobalClient} />}
      
      {activeTab === 'life_events' && <LifeEventsTab />}
      {activeTab === 'children' && <ChildrenTab />}
      {activeTab === 'cpf' && <CpfTab />}
      {activeTab === 'cashflow' && <CashflowTab />}
      {activeTab === 'insurance' && <InsuranceTab />}
      {activeTab === 'retirement' && <RetirementTab />}
      {activeTab === 'investor' && <InvestorTab />}
      {activeTab === 'wealth' && <WealthToolTab />}
      {activeTab === 'property' && <PropertyCalculatorTab />}
      {activeTab === 'vision' && <VisionBoardTab />}
      {activeTab === 'analytics' && <AnalyticsTab clients={clients} />}
      {activeTab === 'report' && <ReportTab />}
      {activeTab === 'admin' && <AdminTab />}
      {activeTab === 'disclaimer' && <DisclaimerTab />}

      <PricingModal isOpen={isPricingModalOpen} onClose={() => setIsPricingModalOpen(false)} />
      
      {/* Repair Station triggered by Infinite Loop detection */}
      <DbRepairModal isOpen={showEmergencyRepair} onClose={() => setShowEmergencyRepair(false)} />
    </AppShell>
  );
}
