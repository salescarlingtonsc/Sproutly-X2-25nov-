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
import { Client } from './types';

const AppInner: React.FC = () => {
  const { user, isLoading } = useAuth();
  const { 
    profile, loadClient, resetClient, generateClientObject, promoteToSaved,
    clientId 
  } = useClient();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('disclaimer');
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle'|'saving'|'saved'|'pending_sync'|'error'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);

  const lastSavedJson = useRef<string>("");
  const isSavingRef = useRef<boolean>(false);
  const statusTimerRef = useRef<any>(null);
  
  const handleLoadClient = useCallback((client: Client, redirect: boolean = true) => {
    loadClient(client);
    if (redirect) setActiveTab('profile');
  }, [loadClient]);

  const loadClientsList = useCallback(async () => {
     try {
       const data = await db.getClients(user?.id);
       if (data && data.length > 0) setClients(data);
     } catch (e) {}
  }, [user?.id]);

  useEffect(() => {
    if (!user || (user.status !== 'approved' && user.status !== 'active')) return;
    loadClientsList();
    const sub = db.subscribeToChanges(() => loadClientsList());
    setIsRealtimeActive(!!sub);
    return () => { sub?.unsubscribe(); };
  }, [user, loadClientsList]);

  const handleSaveClient = useCallback(async (isAutoSave = false) => {
     if (!user || (user.status !== 'approved' && user.status !== 'active')) return;
     if (isSavingRef.current) return;

     const clientData = generateClientObject();
     if (!clientData.profile.name) return; 

     // Diff check
     const { lastUpdated: _ts, ...currentContent } = clientData;
     let lastSavedContent = {};
     try {
        const parsed = JSON.parse(lastSavedJson.current || '{}');
        const { lastUpdated: _oldTs, ...rest } = parsed;
        lastSavedContent = rest;
     } catch (e) {}

     if (JSON.stringify(currentContent) === JSON.stringify(lastSavedContent)) return;

     isSavingRef.current = true;
     setSaveStatus('saving');
     if (statusTimerRef.current) clearTimeout(statusTimerRef.current);

     // Optimistic local state update - mark as unsynced until confirmed
     setClients(prev => {
        const idx = prev.findIndex(c => c.id === clientData.id);
        const optimisticRecord = { ...clientData, _isSynced: false };
        if (idx >= 0) {
            const newList = [...prev];
            newList[idx] = optimisticRecord;
            return newList;
        }
        return [...prev, optimisticRecord];
     });

     try {
        const result = await db.saveClient(clientData, user?.id);
        if (!clientId) promoteToSaved(result.client);

        lastSavedJson.current = JSON.stringify(result.client);
        setLastSaved(new Date());

        if (result.isLocalOnly) {
          setSaveStatus('pending_sync');
        } else {
          setSaveStatus('saved');
          // Update the list immediately with the synced result
          setClients(prev => prev.map(c => c.id === result.client.id ? result.client : c));
          statusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000);
        }
     } catch (e: any) {
        setSaveStatus('error');
     } finally {
        isSavingRef.current = false;
     }
  }, [user, generateClientObject, clientId, promoteToSaved]);

  // Periodic Auto-Save
  useEffect(() => {
     const interval = setInterval(() => handleSaveClient(true), 12000);
     return () => clearInterval(interval);
  }, [handleSaveClient]);

  // RECOVERY & SYNC TRIGGERS
  useEffect(() => {
     if (!user) return;
     
     const triggerFlush = async () => {
         const flushed = await db.flushCloudQueue(user.id);
         if (flushed) {
            await loadClientsList(); // Reload to reflect synced status in UI
            setLastSaved(new Date());
         }
     };

     const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
           console.log("[SYNC] App visible, checking outbox...");
           triggerFlush();
        }
     };

     const handleOnline = () => {
        console.log("[SYNC] Back online, flushing outbox...");
        triggerFlush();
     };

     window.addEventListener('online', handleOnline);
     document.addEventListener('visibilitychange', handleVisibility);
     const flushInterval = setInterval(triggerFlush, 15000); // 15s background flush

     return () => {
        window.removeEventListener('online', handleOnline);
        document.removeEventListener('visibilitychange', handleVisibility);
        clearInterval(flushInterval);
     };
  }, [user, loadClientsList]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 font-bold text-slate-400 animate-pulse">BOOTING QUANTUM CORE...</div>;
  if (!user) return <><LandingPage onLogin={() => setAuthModalOpen(true)} /><AuthModal isOpen={isAuthModalOpen} onClose={() => setAuthModalOpen(false)} /></>;

  return (
    <AppShell 
      activeTab={activeTab} setActiveTab={setActiveTab} 
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
      {activeTab === 'disclaimer' && <DisclaimerTab />}
      {activeTab === 'dashboard' && <DashboardTab user={user} clients={clients} setActiveTab={setActiveTab} onLoadClient={handleLoadClient} onNewClient={() => { resetClient(); setActiveTab('profile'); }} />}
      {activeTab === 'profile' && <ProfileTab clients={clients} onLoadClient={handleLoadClient} onNewProfile={() => resetClient()} />}
      {activeTab === 'crm' && (
          <CrmTab 
            clients={clients} profile={profile} selectedClientId={clientId}
            newClient={() => { resetClient(); setActiveTab('profile'); }}
            saveClient={() => handleSaveClient(false)}
            loadClient={handleLoadClient}
            deleteClient={async (id) => { await db.deleteClient(id); setClients(prev => prev.filter(c => c.id !== id)); }}
            onRefresh={loadClientsList}
            onUpdateGlobalClient={(c) => { setClients(prev => prev.map(x => x.id === c.id ? c : x)); if (c.id === clientId) loadClient(c); db.saveClient(c); }}
          />
      )}
      {activeTab === 'admin' && <AdminTab clients={clients} />}
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
      {activeTab === 'portfolio' && <PortfolioTab clients={clients} onUpdateClient={(c) => { setClients(prev => prev.map(x => x.id === c.id ? c : x)); db.saveClient(c); }} />}
      {activeTab === 'market' && <MarketNewsTab />}
      {activeTab === 'reminders' && <RemindersTab />}
      {activeTab === 'report' && <ReportTab />}

      <AiAssistant currentClient={clientId ? generateClientObject() : null} />
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setAuthModalOpen(false)} />
    </AppShell>
  );
};

const App: React.FC = () => (
  <ToastProvider><DialogProvider><ClientProvider><AiProvider><AppInner /></AiProvider></ClientProvider></DialogProvider></ToastProvider>
);

export default App;