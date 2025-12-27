
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

const AppInner: React.FC = () => {
  const { user, signOut } = useAuth();
  const { 
    profile, loadClient, resetClient, generateClientObject, 
    clientId 
  } = useClient();
  const toast = useToast();
  const { confirm } = useDialog();

  const [activeTab, setActiveTab] = useState('disclaimer');
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const lastSavedJson = useRef<string>('');
  const isSavingRef = useRef<boolean>(false);
  const gridSaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Handover Guard: Prevents autosave from reverting ownership changes during handover
  const [transferringIds, setTransferringIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible' && user && user.status === 'approved') {
        logTabUsage(activeTab, 60);
      }
    }, 60000);
    return () => clearInterval(heartbeat);
  }, [activeTab, user]);

  useEffect(() => {
     if (user && user.status === 'approved') loadClientsList();
  }, [user]);

  const loadClientsList = async () => {
     try {
       const data = await db.getClients(user?.id);
       setClients(data);
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
     if (document.hidden && isAutoSave) return;
     if (!user || user.status !== 'approved') return;
     if (isSavingRef.current && !isAutoSave) return;

     const clientData = overrideClient || generateClientObject();
     
     // CRITICAL: Block autosave if this client is currently being handed over
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

     if (!isAutoSave) {
        isSavingRef.current = true;
        setSaveStatus('saving');
     }
     
     try {
        const saved = await db.saveClient(clientData, user.id);
        
        // Sync local memory to new DB reality
        if (!isAutoSave || (isAutoSave && !clientId)) {
           loadClient(saved); 
        }
        
        lastSavedJson.current = JSON.stringify(saved);
        setLastSaved(new Date());

        if (!isAutoSave) {
           setSaveStatus('saved');
           loadClientsList(); 
           toast.success("Intelligence Cloud Synced");
           setTimeout(() => setSaveStatus(prev => prev === 'saved' ? 'idle' : prev), 3000);
        } else if (overrideClient) {
           loadClientsList();
        }
     } catch (e: any) {
        if (!isAutoSave) {
           setSaveStatus('error');
           toast.error(e.message || "Sync Error");
        }
     } finally {
        if (!isAutoSave) isSavingRef.current = false;
     }
  }, [user, clientId, generateClientObject, toast, loadClient, transferringIds]);

  const handleUpdateClientInList = (updatedClient: Client) => {
     setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
     if (gridSaveDebounceRef.current) clearTimeout(gridSaveDebounceRef.current);
     gridSaveDebounceRef.current = setTimeout(() => {
        handleSaveClient(true, updatedClient);
     }, 1000);
  };

  const handleDeleteClient = async (id: string) => {
    const ok = await confirm({
      title: "Delete Record?",
      message: "This action is irreversible and will purge the dossier from the vault.",
      isDestructive: true,
      confirmText: "Delete Permanently"
    });
    if (!ok) return;

    try {
      await db.deleteClient(id);
      toast.success("Dossier purged successfully");
      if (clientId === id) resetClient();
      loadClientsList();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
       if (document.visibilityState === 'visible' && user?.status === 'approved') {
          handleSaveClient(true);
       }
    }, 15000); 
    return () => clearInterval(timer);
  }, [handleSaveClient, user]);

  if (user && user.status !== 'approved' && user.role !== 'admin') {
     return (
        <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-6 text-white font-sans overflow-hidden relative">
           <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse"></div>
           <div className="max-w-md w-full text-center space-y-8 relative z-10">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-white/5 border border-white/10 shadow-2xl mb-4 relative overflow-hidden group">
                 <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/20 to-emerald-500/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                 <span className="text-5xl relative z-10">{user.status === 'pending' ? '⏳' : '🚫'}</span>
              </div>
              <div>
                 <h1 className="text-3xl font-black tracking-tight mb-3">
                    {user.status === 'pending' ? 'Activation Required' : 'Access Restricted'}
                 </h1>
                 <p className="text-slate-400 leading-relaxed">
                    {user.status === 'pending' 
                       ? "Welcome to Sproutly. Your advisor credentials have been submitted for verification. Please contact your Agency Administrator to activate your portal."
                       : "Your access to the Sproutly environment has been restricted. If you believe this is an error, please reach out to the Strategic Operations unit."}
                 </p>
              </div>
              <div className="flex flex-col gap-4">
                 <div className="p-4 bg-white/5 border border-white/10 rounded-2xl text-left">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Identity</div>
                    <div className="text-sm font-bold text-slate-200">{user.email}</div>
                    <div className="text-[10px] font-mono text-indigo-400 mt-1 uppercase tracking-tighter">Status: {user.status}</div>
                 </div>
                 <Button variant="ghost" className="text-slate-400" onClick={signOut}>Sign Out of Identity</Button>
              </div>
              <div className="pt-10">
                 <div className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-600">Secure Intelligence Protocol v3.0</div>
              </div>
           </div>
        </div>
     );
  }

  return (
    <>
     <AppShell
        activeTab={activeTab} setActiveTab={setActiveTab}
        onLoginClick={() => setAuthModalOpen(true)}
        onPricingClick={() => toast.info("Contact Admin for Tier Elevation")}
        onSaveClick={() => handleSaveClient(false)}
        clientRef={profile.name ? 'Strategy Active' : undefined} clientName={profile.name}
        saveStatus={saveStatus} lastSavedTime={lastSaved}
        clients={clients} onLoadClient={(c) => handleLoadClient(c, true)}
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
            onUpdateGlobalClient={handleUpdateClientInList}
            onTransferStart={(id) => setTransferringIds(prev => new Set(prev).add(id))}
            onTransferEnd={(id) => setTransferringIds(prev => { const n = new Set(prev); n.delete(id); return n; })}
          />
        )}
        {activeTab === 'reminders' && <RemindersTab />}
        {activeTab === 'admin' && user?.role === 'admin' && <AdminTab />}
      </AppShell>
      <AiAssistant currentClient={generateClientObject()} />
    </>
  );
};

const App: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-[#0F172A]"><div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>;
  if (!user) return <ToastProvider><LandingPage onLogin={() => setAuthModalOpen(true)} /><AuthModal isOpen={isAuthModalOpen} onClose={() => setAuthModalOpen(false)} /></ToastProvider>;
  return <ToastProvider><DialogProvider><ClientProvider><AiProvider><AppInner /></AiProvider></ClientProvider></DialogProvider></ToastProvider>;
};

export default App;
