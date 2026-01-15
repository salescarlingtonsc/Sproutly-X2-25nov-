
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
import PortfolioTab from './features/portfolio/PortfolioTab'; 
import MarketNewsTab from './features/market/MarketNewsTab';

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
    expenses, customExpenses,
    cashflowState, investorState, insuranceState,
    cpfState, propertyState, wealthState, retirement,
    chatHistory, crmState 
  } = useClient();
  const toast = useToast();
  const { confirm } = useDialog();

  const [activeTab, setActiveTab] = useState('disclaimer');
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);

  const lastSavedJson = useRef<string>("");
  const isSavingRef = useRef<boolean>(false);
  const isHydratedRef = useRef<boolean>(false); 
  
  const [transferringIds, setTransferringIds] = useState<Set<string>>(new Set());

  // --- 1. REAL-TIME STREAMING PROTOCOL ---
  useEffect(() => {
    if (!user || (user.status !== 'approved' && user.status !== 'active')) return;

    console.log('[SYSTEM] Initializing Quantum Real-time Link...');
    
    const subscription = db.subscribeToChanges((payload) => {
      const { eventType, new: newRecord, old: oldRecord } = payload;
      
      setClients(prev => {
        let newList = [...prev];
        
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
          const updatedClient: Client = {
            ...newRecord.data,
            id: newRecord.id,
            _ownerId: newRecord.user_id,
            lastUpdated: newRecord.updated_at
          };

          const idx = newList.findIndex(c => c.id === updatedClient.id);
          if (idx >= 0) {
            // Only update if the incoming data is newer than our local version
            const localTs = new Date(newList[idx].lastUpdated).getTime();
            const remoteTs = new Date(updatedClient.lastUpdated).getTime();
            
            if (remoteTs > localTs) {
              newList[idx] = updatedClient;
              // If this is the client we are CURRENTLY editing, hot-patch the form
              if (clientId === updatedClient.id && !isSavingRef.current) {
                loadClient(updatedClient);
                toast.info(`Updated: ${updatedClient.name}`);
              }
            }
          } else {
            newList.push(updatedClient);
          }
        } else if (eventType === 'DELETE') {
          newList = newList.filter(c => c.id !== oldRecord.id);
        }

        localStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify(newList));
        return newList;
      });
    });

    if (subscription) setIsRealtimeActive(true);

    return () => {
      subscription?.unsubscribe();
      setIsRealtimeActive(false);
    };
  }, [user, clientId, loadClient]);

  const loadClientsList = useCallback(async () => {
     try {
       const data = await db.getClients(user?.id);
       if (data && Array.isArray(data)) {
           setClients(data);
           localStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify(data));
           setLastSaved(new Date());
       }
     } catch (e) {}
  }, [user?.id]);

  useEffect(() => {
     if (user && (user.status === 'approved' || user.status === 'active')) {
         loadClientsList();
     }
  }, [user, loadClientsList]);

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
     isHydratedRef.current = true;
     setActiveTab('profile');
  };

  const handleLoadClient = (client: Client, redirect = true) => {
     const seed = JSON.stringify(client);
     lastSavedJson.current = seed; 
     isHydratedRef.current = true;
     loadClient(client);
     if (redirect) setActiveTab('profile');
  };

  const handleSaveClient = useCallback(async (isAutoSave = false) => {
     if (!user || (user.status !== 'approved' && user.status !== 'active')) return;
     if (isSavingRef.current || transferringIds.size > 0) return;

     const clientData = generateClientObject();
     if (!isHydratedRef.current || !clientData.profile.name) return; 

     // Diff Check
     const { lastUpdated: _ts, ...currentContent } = clientData;
     let lastSavedContent = {};
     try {
        const parsed = JSON.parse(lastSavedJson.current || '{}');
        const { lastUpdated: _oldTs, ...rest } = parsed;
        lastSavedContent = rest;
     } catch (e) {}

     if (JSON.stringify(currentContent) === JSON.stringify(lastSavedContent)) {
        if (!isAutoSave) setSaveStatus('saved');
        return; 
     }

     isSavingRef.current = true;
     if (!isAutoSave) setSaveStatus('saving');

     try {
        const isNewClient = !clientId;
        // Non-blocking save: db.saveClient handles local immediately
        const saved = await db.saveClient(clientData, user?.id);
        
        if (isNewClient) promoteToSaved(saved);

        lastSavedJson.current = JSON.stringify(saved);
        setLastSaved(new Date());
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
     } catch (e: any) {
        setSaveStatus('error');
     } finally {
        isSavingRef.current = false;
     }
  }, [user, generateClientObject, transferringIds, clientId, promoteToSaved]);

  // Wake up sync
  useEffect(() => {
    const handleSync = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
         db.flushCloudQueue(user?.id).catch(() => {});
         loadClientsList();
      }
    };
    window.addEventListener('online', handleSync);
    document.addEventListener('visibilitychange', handleSync);
    return () => {
      window.removeEventListener('online', handleSync);
      document.removeEventListener('visibilitychange', handleSync);
    };
  }, [user, loadClientsList]);

  // Heartbeat
  useEffect(() => {
     const interval = setInterval(() => handleSaveClient(true), 3000);
     return () => clearInterval(interval);
  }, [handleSaveClient]);

  const handleUpdateGlobalClient = useCallback((updatedClient: Client) => {
      setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
      if (updatedClient.id === clientId) loadClient(updatedClient);
      db.saveClient(updatedClient, user?.id).catch(() => setSaveStatus('error'));
  }, [clientId, loadClient, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-bold text-slate-400">INITIALIZING QUANTUM CORE...</p>
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

  return (
    <AppShell 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      onLoginClick={() => setAuthModalOpen(true)}
      onPricingClick={() => {}}
      onSaveClick={() => handleSaveClient(false)}
      clientRef={clientId ? profile.name : undefined}
      clientName={profile.name}
      saveStatus={saveStatus}
      lastSavedTime={lastSaved}
      clients={clients}
      onLoadClient={handleLoadClient}
    >
      <div className="fixed top-20 right-6 z-50">
         {isRealtimeActive && (
            <div className="bg-emerald-500/10 backdrop-blur-md border border-emerald-500/20 px-3 py-1 rounded-full flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
               <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
               <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Real-time Active</span>
            </div>
         )}
      </div>

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
            }}
            onRefresh={loadClientsList}
            onUpdateGlobalClient={handleUpdateGlobalClient}
          />
      )}
      {activeTab === 'portfolio' && <PortfolioTab clients={clients} onUpdateClient={handleUpdateGlobalClient} />}
      {activeTab === 'market' && <MarketNewsTab />}
      {activeTab === 'reminders' && <RemindersTab />}
      {activeTab === 'report' && <ReportTab />}
      {activeTab === 'admin' && <AdminTab clients={clients} />}

      <AiAssistant currentClient={clientId ? generateClientObject() : null} />
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setAuthModalOpen(false)} />
    </AppInner>
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
