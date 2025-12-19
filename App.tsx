
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

// Logic
import { db } from './lib/db';
import { logTabUsage } from './lib/db/activities';
import { Client } from './types';

const AppInner: React.FC = () => {
  const { user } = useAuth();
  const { 
    clientRef, profile, loadClient, resetClient, generateClientObject, 
    clientId 
  } = useClient();
  const toast = useToast();
  const { confirm } = useDialog();

  // Navigation State
  const [activeTab, setActiveTab] = useState('disclaimer');
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);

  // CRM State
  const [clients, setClients] = useState<Client[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Auto-Save Refs
  const lastSavedJson = useRef<string>('');
  const isSavingRef = useRef<boolean>(false);

  // --- STABLE TAB USAGE TELEMETRY ---
  const tabStartTimeRef = useRef<number>(Date.now());
  const lastActiveTabRef = useRef<string>(activeTab);

  useEffect(() => {
    const recordUsage = () => {
      const now = Date.now();
      const elapsedSec = Math.floor((now - tabStartTimeRef.current) / 1000);
      
      // Thresholds: 2s min, 1hr max
      if (elapsedSec >= 2 && elapsedSec < 3600) {
        // Fire-and-forget: No await here to prevent blocking visibility transitions
        logTabUsage(lastActiveTabRef.current, elapsedSec);
      }
      
      tabStartTimeRef.current = now;
      lastActiveTabRef.current = activeTab;
    };

    // Handle visibility changes (switching apps/tabs)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        recordUsage();
      } else {
        // Reset timer when coming back to the app
        tabStartTimeRef.current = Date.now();
      }
    };

    // Initial transition record
    recordUsage(); 

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', recordUsage);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', recordUsage);
    };
  }, [activeTab]);

  // --- Effects ---
  useEffect(() => {
     if (user) {
        loadClientsList();
     }
  }, [user]);

  // --- Handlers ---
  const loadClientsList = async () => {
     const data = await db.getClients(user?.id);
     setClients(data);
  };

  const handleNewClient = async () => {
     if (profile.name && clientId === null) {
        const ok = await confirm({
           title: "Unsaved Profile",
           message: "You have an unsaved profile open. Discard changes?",
           isDestructive: true,
           confirmText: "Discard"
        });
        if (!ok) return;
     }
     resetClient();
     lastSavedJson.current = ''; 
     setActiveTab('profile');
     toast.info("New profile started");
  };

  const handleLoadClient = (client: Client, redirect = true) => {
     lastSavedJson.current = JSON.stringify(client); 
     loadClient(client);
     if (redirect) setActiveTab('profile');
  };

  // --- SAVE LOGIC ---
  const handleSaveClient = useCallback(async (isAutoSave = false) => {
     if (!user) {
        if (!isAutoSave) setAuthModalOpen(true);
        return;
     }
     if (!profile.name) {
        if (!isAutoSave) toast.error("Please enter a client name first.");
        return;
     }
     if (isSavingRef.current) return;
     const clientData = generateClientObject();
     const { lastUpdated: _newTs, ...currentContent } = clientData;
     let lastSavedContent = {};
     try {
        const parsed = JSON.parse(lastSavedJson.current || '{}');
        const { lastUpdated: _oldTs, ...rest } = parsed;
        lastSavedContent = rest;
     } catch (e) {}

     if (isAutoSave && JSON.stringify(currentContent) === JSON.stringify(lastSavedContent)) return;

     isSavingRef.current = true;
     setSaveStatus('saving');
     try {
        const saved = await db.saveClient(clientData, user.id);
        lastSavedJson.current = JSON.stringify(saved);
        setLastSaved(new Date());
        if (!clientId) loadClient(saved);
        setSaveStatus('saved');
        if (!isAutoSave) {
           loadClientsList(); 
           toast.success("Client saved successfully");
        }
        setTimeout(() => setSaveStatus(prev => prev === 'saved' ? 'idle' : prev), 2000);
     } catch (e: any) {
        console.error(e);
        setSaveStatus('error');
        if (!isAutoSave) toast.error("Save failed: " + e.message);
     } finally {
        isSavingRef.current = false;
     }
  }, [user, profile.name, clientId, generateClientObject, toast]);

  const saveRef = useRef(handleSaveClient);
  useEffect(() => { saveRef.current = handleSaveClient; });

  useEffect(() => {
    const timer = setInterval(() => saveRef.current(true), 15000); 
    return () => clearInterval(timer);
  }, []);

  const handleDeleteClient = async (id: string) => {
     const ok = await confirm({
        title: "Delete Client?",
        message: "This action cannot be undone.",
        isDestructive: true,
        confirmText: "Delete Forever"
     });
     if (ok) {
        try {
           await db.deleteClient(id, user?.id);
           if (clientId === id) handleNewClient();
           loadClientsList();
           toast.success("Client deleted");
        } catch (e) {
           toast.error("Could not delete client");
        }
     }
  };

  const handleCompleteFollowUp = (id: string) => {
     const client = clients.find(c => c.id === id);
     if (client) {
        const updated = { ...client, followUp: { ...client.followUp, status: 'contacted' as any } }; 
        db.saveClient(updated, user?.id).then(loadClientsList);
     }
  };

  return (
    <>
     <AppShell
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLoginClick={() => setAuthModalOpen(true)}
        onPricingClick={() => toast.info("Upgrade module coming soon!")}
        onSaveClick={() => handleSaveClient(false)}
        clientRef={clientRef || undefined}
        clientName={profile.name}
        saveStatus={saveStatus}
        lastSavedTime={lastSaved}
        clients={clients}
        onLoadClient={(c) => handleLoadClient(c, true)}
     >
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setAuthModalOpen(false)} />
        {activeTab === 'disclaimer' && <DisclaimerTab />}
        {activeTab === 'dashboard' && <DashboardTab user={user!} clients={clients} setActiveTab={setActiveTab} onLoadClient={handleLoadClient} onNewClient={handleNewClient} />}
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
        {activeTab === 'report' && <ReportTab />}
        {activeTab === 'crm' && <CrmTab clients={clients} profile={profile} selectedClientId={clientId} newClient={handleNewClient} saveClient={() => handleSaveClient(false)} loadClient={handleLoadClient} deleteClient={handleDeleteClient} setFollowUp={() => {}} completeFollowUp={handleCompleteFollowUp} maxClients={100} userRole={user?.role} onRefresh={loadClientsList} />}
        {activeTab === 'admin' && user?.role === 'admin' && <AdminTab />}
      </AppShell>
      <AiAssistant currentClient={generateClientObject()} />
    </>
  );
};

const App: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin text-4xl">⏳</div></div>;
  if (!user) {
     return (
        <ToastProvider>
           <LandingPage onLogin={() => setAuthModalOpen(true)} />
           <AuthModal isOpen={isAuthModalOpen} onClose={() => setAuthModalOpen(false)} />
        </ToastProvider>
     );
  }
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
