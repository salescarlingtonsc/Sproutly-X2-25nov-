
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

// UI Components
import Button from './components/ui/Button';

// Logic
import { db } from './lib/db';
import { logTabUsage } from './lib/db/activities';
import { Client } from './types';
import { canAccessTab, TAB_DEFINITIONS } from './lib/config';

const CLIENT_CACHE_KEY = 'sproutly.clients_cache.v1';

const AppInner: React.FC = () => {
  const { user, signOut, refreshProfile, isLoading } = useAuth();
  const { 
    profile, loadClient, resetClient, generateClientObject, promoteToSaved,
    clientId, 
    // Data States for Auto-Save
    expenses, customExpenses,
    cashflowState, investorState, insuranceState,
    cpfState, propertyState, wealthState, retirement,
    chatHistory // Added to auto-save trigger
  } = useClient();
  const toast = useToast();
  const { confirm } = useDialog();

  const [activeTab, setActiveTab] = useState('disclaimer');
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  // Slow Loading State for Feedback
  const [showLongLoading, setShowLongLoading] = useState(false);

  const lastSavedJson = useRef<string>('');
  const isSavingRef = useRef<boolean>(false);
  const gridSaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Handover Guard
  const [transferringIds, setTransferringIds] = useState<Set<string>>(new Set());

  // Monitor loading time
  useEffect(() => {
    let timer: any;
    if (isLoading) {
      // Show feedback faster (1.5s) to reduce user anxiety during cold starts
      timer = setTimeout(() => setShowLongLoading(true), 1500);
    } else {
      setShowLongLoading(false);
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  // --- AUTO POLL FOR APPROVAL ---
  useEffect(() => {
    let interval: any;
    if (user && (user.status === 'pending' || user.status === 'rejected')) {
        interval = setInterval(() => {
            refreshProfile();
        }, 3000);
    }
    return () => clearInterval(interval);
  }, [user, refreshProfile]);

  // --- PERMISSION ENFORCEMENT & REDIRECT ---
  useEffect(() => {
    if (user && (user.status === 'approved' || user.status === 'active')) {
      // If the current tab is NOT allowed for this user
      if (!canAccessTab(user, activeTab)) {
        // Find the first tab they ARE allowed to access
        const firstAllowed = TAB_DEFINITIONS.find(t => canAccessTab(user, t.id));
        if (firstAllowed) {
          console.log(`Redirecting from restricted tab '${activeTab}' to '${firstAllowed.id}'`);
          setActiveTab(firstAllowed.id);
        }
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
         // 1. Load from Cache Immediate
         const cached = localStorage.getItem(CLIENT_CACHE_KEY);
         if (cached) {
             try {
                 setClients(JSON.parse(cached));
             } catch(e) {}
         }
         // 2. Fetch Fresh
         loadClientsList();
     }
  }, [user]);

  const loadClientsList = async () => {
     try {
       const data = await db.getClients(user?.id);
       setClients(data);
       // Update Cache
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
     lastSavedJson.current = ''; 
     setActiveTab('profile');
     toast.info("Fresh strategy initialized");
  };

  const handleLoadClient = (client: Client, redirect = true) => {
     lastSavedJson.current = JSON.stringify(client); 
     loadClient(client);
     if (redirect) setActiveTab('profile');
  };

  const handleSaveClient = useCallback(async (isAutoSave = false, overrideClient?: Client) => {
     // Allow saving even when hidden to prevent data loss on tab switches
     if (!user || (user.status !== 'approved' && user.status !== 'active')) return;
     
     // STRICT LOCK: Prevent re-entry if already saving (even for autosave)
     if (isSavingRef.current) return;

     const clientData = overrideClient || generateClientObject();
     
     if (transferringIds.has(clientData.id)) {
        console.debug("Autosave Suppressed: Active Handover Lock in place.");
        return;
     }

     if (!clientData.profile.name) return; 

     const { lastUpdated: _ts, ...currentContent } = clientData;
     let lastSavedContent = {};
     try {
        const parsed = JSON.parse(lastSavedJson.current || '{}');
        const { lastUpdated: _oldTs, ...rest } = parsed;
        lastSavedContent = rest;
     } catch (e) {}

     if (JSON.stringify(currentContent) === JSON.stringify(lastSavedContent)) {
        return; 
     }

     isSavingRef.current = true; // LOCK
     if (!isAutoSave) setSaveStatus('saving');

     try {
        const isNewClient = !clientId;
        const saved = await db.saveClient(clientData, user.id);
        
        setClients(prev => {
            const exists = prev.find(c => c.id === saved.id);
            const newList = exists ? prev.map(c => c.id === saved.id ? saved : c) : [...prev, saved];
            localStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify(newList)); // Sync Cache
            return newList;
        });

        if (isNewClient) {
            // CRITICAL: Promote the newly generated ID to state so subsequent autosaves use it
            promoteToSaved(saved);
        }

        lastSavedJson.current = JSON.stringify(saved);
        setLastSaved(new Date());
        
        if (!isAutoSave) {
           setSaveStatus('saved');
           setTimeout(() => setSaveStatus('idle'), 2000);
        }
     } catch (e: any) {
        console.error(e);
        if (!isAutoSave) {
            setSaveStatus('error');
            toast.error(`Save Failed: ${e.message}`);
        } else {
            // For autosave, suppress noisy auth errors, but log them
            if (e.message.includes('Session expired')) {
                console.warn("Autosave paused: Session expired");
            } else {
                // Keep legitimate errors visible
                toast.error(`Sync: ${e.message}`);
            }
        }
     } finally {
        isSavingRef.current = false; // UNLOCK
     }
  }, [user, generateClientObject, transferringIds, clientId, promoteToSaved]);

  // --- RE-SYNC ON VISIBILITY CHANGE ---
  // If user switches tabs/browsers and comes back, ensure we trigger a save if needed
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleSaveClient(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [handleSaveClient]);

  // --- UNIVERSAL AUTO-SAVE LOOP ---
  // Listens to ALL client context state changes
  useEffect(() => {
     const timer = setTimeout(() => {
        handleSaveClient(true);
     }, 2000);
     return () => clearTimeout(timer);
  }, [
    profile, 
    expenses, 
    customExpenses, 
    cashflowState, 
    investorState, 
    insuranceState, 
    cpfState, 
    propertyState, 
    wealthState, 
    retirement, 
    chatHistory, // Trigger save on chat history change
    handleSaveClient
  ]);

  const handleUpdateGlobalClient = useCallback((updatedClient: Client) => {
      setClients(prev => {
          const newList = prev.map(c => c.id === updatedClient.id ? updatedClient : c);
          localStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify(newList)); // Sync Cache
          return newList;
      });
      if (updatedClient.id === clientId) {
          loadClient(updatedClient);
      }
      if (gridSaveDebounceRef.current) clearTimeout(gridSaveDebounceRef.current);
      gridSaveDebounceRef.current = setTimeout(async () => {
          try {
              await db.saveClient(updatedClient, user?.id);
          } catch (e: any) {
              console.error("Background sync failed", e);
              // Suppress noisy auth errors on background sync
              if (!e.message.includes('Session expired')) {
                  toast.error(`Auto-Save Failed: ${e.message}`);
              }
          }
      }, 800);
  }, [clientId, loadClient, user]);

  const handleTransferStart = (id: string) => {
      setTransferringIds(prev => new Set(prev).add(id));
  };

  const handleTransferEnd = (id: string) => {
      setTransferringIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
      });
      loadClientsList();
  };

  // --- AUTH GATE ---
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">INITIALIZING QUANTUM CORE...</p>
          {showLongLoading && (
             <p className="text-xs text-indigo-400 animate-pulse">Waking up database (Cold Start)...</p>
          )}
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

  // --- RESTRICTION GATE ---
  if (user && (user.status === 'pending' || user.status === 'rejected')) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex flex-col items-center justify-center p-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-red-600/10 rounded-full blur-[100px]"></div>
        
        <div className="relative z-10 text-center max-w-lg">
          <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
            <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0-8v4m0 8h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          
          <h1 className="text-3xl font-black mb-4 tracking-tight">Access Restricted</h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            Your access to the Sproutly environment has been restricted or is pending approval.
            If you believe this is an error, please reach out to the Strategic Operations unit.
          </p>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 text-left">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Identity</p>
            <p className="text-white font-mono text-sm font-bold mb-2">{user.email}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Status</p>
            <div className="inline-flex items-center gap-2">
               <span className={`w-2 h-2 rounded-full ${user.status === 'pending' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'}`}></span>
               <span className="text-white font-bold text-xs uppercase">{user.status}</span>
            </div>
          </div>

          <button 
            onClick={() => signOut()}
            className="text-slate-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors"
          >
            Sign Out of Identity
          </button>
          
          <div className="mt-12 text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">
            Secure Intelligence Protocol v3.0
          </div>
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
                // Ensure we await this so errors propagate
                try {
                    await db.deleteClient(id);
                    setClients(prev => prev.filter(c => c.id !== id));
                    if (id === clientId) resetClient();
                    toast.success("Client deleted successfully.");
                } catch (e: any) {
                    // Re-throw so child components know it failed
                    throw e;
                }
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
