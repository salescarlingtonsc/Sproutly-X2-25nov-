
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './contexts/AuthContext';
import { ClientProvider, useClient } from './contexts/ClientContext';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { DialogProvider, useDialog } from './contexts/DialogContext';
import { AiProvider } from './contexts/AiContext';
import AppShell from './components/layout/AppShell';
import LandingPage from './features/auth/LandingPage';
import AuthModal from './features/auth/AuthModal';
import AiAssistant from './features/ai-chat/AiAssistant';

// Feature Tabs
import DisclaimerTab from './features/disclaimer/DisclaimerTab';
import DashboardTab from './features/dashboard/DashboardTab'; 
import ProfileTab from './features/profile/ProfileTab';
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
import CrmTab from './features/crm/CrmTab';
import AdminTab from './features/admin/AdminTab';
import ReportTab from './features/report/ReportTab';
import RemindersTab from './features/reminders/RemindersTab';

// Logic
import { db } from './lib/db';
import { logTabUsage } from './lib/db/activities';
import { Client } from './types';
import { canAccessTab, TAB_DEFINITIONS } from './lib/config';

const CLIENT_CACHE_KEY = 'sproutly.clients_cache.v1';
const SESSION_BASELINE_KEY = 'sproutly.session_baseline';

const AppInner: React.FC = () => {
  const { user, signOut, refreshProfile, isLoading } = useAuth();
  const { 
    profile, loadClient, resetClient, generateClientObject, promoteToSaved,
    clientId, 
    // Data States for Auto-Save
    expenses, customExpenses,
    cashflowState, investorState, insuranceState,
    cpfState, propertyState, wealthState, retirement,
    chatHistory 
  } = useClient();
  const toast = useToast();
  const { confirm } = useDialog();

  const [activeTab, setActiveTab] = useState('disclaimer');
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showLongLoading, setShowLongLoading] = useState(false);

  // --- ARCHITECTURAL FIX: PERSISTENT BASELINE ---
  // We initialize the ref from sessionStorage to survive tab refreshes without triggering a false "diff".
  const getInitialBaseline = () => {
      try {
          return sessionStorage.getItem(SESSION_BASELINE_KEY) || '';
      } catch (e) { return ''; }
  };

  const lastSavedJson = useRef<string>(getInitialBaseline());
  const isSavingRef = useRef<boolean>(false);
  const isHydratedRef = useRef<boolean>(false); 
  const saveStartTimeRef = useRef<number>(0);
  const gridSaveDebounceRef = useRef<any>(null); // Fixed: Missing ref definition
  const [transferringIds, setTransferringIds] = useState<Set<string>>(new Set());

  // Monitor loading time
  useEffect(() => {
    let timer: any;
    if (isLoading) {
      timer = setTimeout(() => setShowLongLoading(true), 1500);
    } else {
      setShowLongLoading(false);
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  // --- WATCHDOG: DETECT STUCK SAVES ---
  useEffect(() => {
    let watchdog: any;
    if (saveStatus === 'saving') {
      watchdog = setTimeout(() => {
        // If still saving after 45s, assume browser throttle or network hang.
        // Force unlock to allow user to retry.
        console.warn("[Watchdog] Save lock force-cleared due to timeout.");
        setSaveStatus('error');
        isSavingRef.current = false;
        saveStartTimeRef.current = 0;
      }, 45000);
    }
    return () => clearTimeout(watchdog);
  }, [saveStatus]);

  // --- EXIT GUARD ---
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'saving') {
        e.preventDefault();
        e.returnValue = ''; 
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus]);

  // --- AUTO POLL FOR APPROVAL ---
  useEffect(() => {
    let interval: any;
    if (user && (user.status === 'pending' || user.status === 'rejected')) {
        interval = setInterval(() => { refreshProfile(); }, 3000);
    }
    return () => clearInterval(interval);
  }, [user, refreshProfile]);

  // --- TAB ACCESS CONTROL ---
  useEffect(() => {
    if (user && (user.status === 'approved' || user.status === 'active')) {
      if (!canAccessTab(user, activeTab)) {
        const firstAllowed = TAB_DEFINITIONS.find(t => canAccessTab(user, t.id));
        if (firstAllowed) setActiveTab(firstAllowed.id);
      }
    }
  }, [user, activeTab]);

  useEffect(() => {
    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible' && user && (user.status === 'approved' || user.status === 'active')) {
        logTabUsage(activeTab, 60);
      }
    }, 60000);
    return () => clearInterval(heartbeat);
  }, [activeTab, user]);

  useEffect(() => {
     if (user && (user.status === 'approved' || user.status === 'active')) {
         const cached = localStorage.getItem(CLIENT_CACHE_KEY);
         if (cached) {
             try { setClients(JSON.parse(cached)); } catch(e) {}
         }
         loadClientsList();
     }
  }, [user]);

  const loadClientsList = async () => {
     try {
       const data = await db.getClients(user?.id);
       setClients(data);
       localStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify(data));
     } catch (e) {
       console.error("Hydration failed.");
     }
  };

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
     // Reset comparison state for new client
     lastSavedJson.current = ""; 
     sessionStorage.removeItem(SESSION_BASELINE_KEY);
     isHydratedRef.current = true;
     
     setActiveTab('profile');
     toast.info("Fresh strategy initialized");
  };

  const handleLoadClient = (client: Client, redirect = true) => {
     // Seed comparison state immediately to prevent false-diff autosaves
     const seed = JSON.stringify(client);
     lastSavedJson.current = seed; 
     sessionStorage.setItem(SESSION_BASELINE_KEY, seed);
     isHydratedRef.current = true;
     
     loadClient(client);
     if (redirect) setActiveTab('profile');
  };

  /**
   * CORE AUTOSAVE LOGIC
   * Fixed to prevent loops via: Visibility Check, Mutex, and Stable Diffing.
   */
  const handleSaveClient = useCallback(async (isAutoSave = false, overrideClient?: Client) => {
     // 1. STRICT VISIBILITY CHECK
     // If tab is backgrounded, DO NOT SAVE. Browsers throttle timers, causing chaos.
     if (typeof document !== 'undefined' && document.hidden) {
         // console.debug("[Autosave] Skipped: Background Tab");
         return;
     }

     // 2. Hydration & Auth Check
     if (!isHydratedRef.current || !user || (user.status !== 'approved' && user.status !== 'active')) return;
     
     // 3. Mutex & Transfer Check
     if (isSavingRef.current || transferringIds.size > 0) return;

     // 4. Data Generation
     const clientData = overrideClient || generateClientObject();
     if (!clientData.profile.name) return; 

     // 5. STABLE DIFFING
     // Strip `lastUpdated` timestamp from comparison. 
     // We only care if meaningful data changed.
     const { lastUpdated: _ts, ...currentContent } = clientData;
     let lastSavedContent = {};
     try {
        const parsed = JSON.parse(lastSavedJson.current || '{}');
        const { lastUpdated: _oldTs, ...rest } = parsed;
        lastSavedContent = rest;
     } catch (e) {}

     const currentHash = JSON.stringify(currentContent);
     const lastHash = JSON.stringify(lastSavedContent);

     if (currentHash === lastHash) {
        return; // No changes detected
     }

     // 6. Lock & Execute
     isSavingRef.current = true;
     saveStartTimeRef.current = Date.now();
     if (!isAutoSave) setSaveStatus('saving');

     try {
        const isNewClient = !clientId;
        
        // Debug Log (As requested)
        console.log('[AUTOSAVE FIRE]', { 
            id: clientData.id, 
            isAuto: isAutoSave, 
            diffKeys: Object.keys(currentContent).length 
        });

        const savePromise = db.saveClient(clientData, user.id);
        
        // 45s Timeout race
        const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Network timeout (45s).')), 45000)
        );

        const saved = await Promise.race([savePromise, timeoutPromise]) as Client;
        
        // 7. Update State & Baseline
        setClients(prev => {
            const exists = prev.find(c => c.id === saved.id);
            const newList = exists ? prev.map(c => c.id === saved.id ? saved : c) : [...prev, saved];
            localStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify(newList));
            return newList;
        });

        if (isNewClient) {
            promoteToSaved(saved);
        }

        // Update baseline to match what we have in memory (stabilize the loop)
        const newBaseline = JSON.stringify(saved);
        lastSavedJson.current = newBaseline;
        sessionStorage.setItem(SESSION_BASELINE_KEY, newBaseline);
        setLastSaved(new Date());
        
        if (!isAutoSave) {
           setSaveStatus('saved');
           setTimeout(() => setSaveStatus('idle'), 2000);
        }
     } catch (e: any) {
        console.error("Save Error:", e);
        if (!isAutoSave) {
            setSaveStatus('error');
            toast.error(e.message?.includes('timeout') ? "Connection slow. Retrying..." : "Save failed.");
        }
     } finally {
        isSavingRef.current = false;
        saveStartTimeRef.current = 0;
     }
  }, [user, generateClientObject, transferringIds, clientId, promoteToSaved]);

  // --- VISIBILITY WAKE-UP PROTOCOL ---
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // If we were "saving" when tab hid, and it's been > 10s, likely stuck. Reset.
        const now = Date.now();
        if (isSavingRef.current && (now - saveStartTimeRef.current > 10000)) {
             console.log("[App] Tab Wake: Resetting stuck save lock.");
             isSavingRef.current = false;
             setSaveStatus('idle');
        }
        // Optional: Trigger a fresh check after delay
        if (isHydratedRef.current) setTimeout(() => handleSaveClient(true), 1000);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [handleSaveClient]);

  // --- MAIN INTERVAL ---
  useEffect(() => {
     const timer = setInterval(() => {
        handleSaveClient(true);
     }, 2000);
     return () => clearInterval(timer);
  }, [
    profile, expenses, customExpenses, cashflowState, investorState, 
    insuranceState, cpfState, propertyState, wealthState, retirement, 
    chatHistory, handleSaveClient
  ]);

  const handleUpdateGlobalClient = useCallback((updatedClient: Client) => {
      // Local optimistic update
      setClients(prev => {
          const newList = prev.map(c => c.id === updatedClient.id ? updatedClient : c);
          localStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify(newList));
          return newList;
      });
      // Update active client if matched
      if (updatedClient.id === clientId) {
          const seed = JSON.stringify(updatedClient);
          lastSavedJson.current = seed;
          sessionStorage.setItem(SESSION_BASELINE_KEY, seed);
          loadClient(updatedClient);
      }
      // Debounced Save
      if (gridSaveDebounceRef.current) clearTimeout(gridSaveDebounceRef.current);
      gridSaveDebounceRef.current = setTimeout(async () => {
          try {
              await db.saveClient(updatedClient, user?.id);
          } catch (e) { console.error("Background sync error", e); }
      }, 800);
  }, [clientId, loadClient, user]);

  const handleTransferStart = (id: string) => setTransferringIds(prev => new Set(prev).add(id));
  const handleTransferEnd = (id: string) => {
      setTransferringIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
      });
      loadClientsList();
  };

  // --- RENDER ---
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">INITIALIZING QUANTUM CORE...</p>
          {showLongLoading && <p className="text-xs text-indigo-400 animate-pulse">Waking up database...</p>}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LandingPage onLogin={() => setAuthModalOpen(true)} />
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setAuthModalOpen(false)} />
      </>
    );
  }

  if (user && (user.status === 'pending' || user.status === 'rejected')) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex flex-col items-center justify-center p-6 text-white">
        <div className="text-center max-w-lg">
          <h1 className="text-3xl font-black mb-4">Access Restricted</h1>
          <p className="text-slate-400 text-sm mb-8">Your account status is: <span className="text-white font-bold uppercase">{user.status}</span></p>
          <button onClick={() => signOut()} className="text-slate-500 hover:text-white text-xs font-bold uppercase tracking-widest">Sign Out</button>
        </div>
      </div>
    );
  }

  return (
    <AppShell 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      onLoginClick={() => setAuthModalOpen(true)}
      onPricingClick={() => alert("Contact Sales for Upgrades")}
      onSaveClick={() => handleSaveClient(false)}
      clientRef={clientId ? profile.name : undefined}
      clientName={profile.name}
      saveStatus={saveStatus}
      lastSavedTime={lastSaved}
      clients={clients}
      onLoadClient={handleLoadClient}
    >
      {activeTab === 'disclaimer' && <DisclaimerTab />}
      {activeTab === 'dashboard' && <DashboardTab user={user} clients={clients} setActiveTab={setActiveTab} onLoadClient={handleLoadClient} onNewClient={handleNewClient} />}
      {activeTab === 'profile' && <ProfileTab clients={clients} onLoadClient={handleLoadClient} onNewProfile={handleNewClient} />}
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
      {activeTab === 'crm' && (
          <CrmTab 
            clients={clients} 
            profile={profile} 
            selectedClientId={clientId}
            newClient={handleNewClient}
            saveClient={() => handleSaveClient(false)}
            loadClient={handleLoadClient}
            deleteClient={async (id) => {
                await db.deleteClient(id);
                setClients(prev => prev.filter(c => c.id !== id));
                if (id === clientId) {
                   resetClient();
                   sessionStorage.removeItem(SESSION_BASELINE_KEY);
                   isHydratedRef.current = false;
                   lastSavedJson.current = "";
                }
                toast.success("Client deleted successfully.");
            }}
            onRefresh={loadClientsList}
            onUpdateGlobalClient={handleUpdateGlobalClient}
            onTransferStart={handleTransferStart}
            onTransferEnd={handleTransferEnd}
          />
      )}
      {activeTab === 'reminders' && <RemindersTab />}
      {activeTab === 'report' && <ReportTab />}
      {activeTab === 'admin' && <AdminTab />}

      <AiAssistant currentClient={clientId ? generateClientObject() : null} />
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setAuthModalOpen(false)} />
    </AppShell>
  );
};

const App: React.FC = () => {
  return (
    <ToastProvider>
      <DialogProvider>
        <ClientProvider>
          <AiProvider>
            <AppInner />
          </AiProvider>
        </ClientProvider>
      </DialogProvider>
    </ToastProvider>
  );
};

export default App;
