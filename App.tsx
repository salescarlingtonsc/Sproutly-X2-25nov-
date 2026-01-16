import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';
import { ClientProvider, useClient } from './contexts/ClientContext';
import { AiProvider } from './contexts/AiContext';
import { db } from './lib/db';
import { Client } from './types';

// Layout & Auth
import AppShell from './components/layout/AppShell';
import LandingPage from './features/auth/LandingPage';
import AuthModal from './features/auth/AuthModal';
import PricingModal from './features/subscription/PricingModal';
import AiAssistant from './features/ai-chat/AiAssistant';

// Tabs
import DashboardTab from './features/dashboard/DashboardTab';
import CrmTab from './features/crm/CrmTab';
import RemindersTab from './features/reminders/RemindersTab';
import MarketNewsTab from './features/market/MarketNewsTab';
import PortfolioTab from './features/portfolio/PortfolioTab';
import ProfileTab from './features/profile/ProfileTab';
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
import LifeEventsTab from './features/life-events/LifeEventsTab';

// --- Inner App Component (Inside Providers) ---
const SproutlyApp = () => {
  const { user, isLoading: authLoading } = useAuth();

  // Client Context Access
  const {
    loadClient,
    generateClientObject,
    resetClient,
    lastUpdated,
    clientRef,
    profile,
    clientId
  } = useClient();

  // App State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPricingOpen, setIsPricingOpen] = useState(false);

  // Data State
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'pending_sync'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // --- 1. Load Clients on Auth ---
  const fetchClients = useCallback(async () => {
    const localData = await db.getClients(user?.id);
    setClients(localData);
    setPendingSyncCount(db.getQueueCount());
  }, [user]);

  useEffect(() => {
    fetchClients();

    // Subscribe to DB changes for real-time updates
    const sub = db.subscribeToChanges(() => {
      fetchClients();
    });

    // Also listen for local queue changes
    const handleQueueChange = () => {
      setPendingSyncCount(db.getQueueCount());
      db.getClients(user?.id).then(setClients);
    };

    window.addEventListener('sproutly:queue_changed', handleQueueChange);

    // Poll queue every 5s just in case
    const interval = setInterval(handleQueueChange, 5000);

    return () => {
      if (sub) sub.unsubscribe();
      window.removeEventListener('sproutly:queue_changed', handleQueueChange);
      clearInterval(interval);
    };
  }, [user, fetchClients]);

  // ✅ 1.5) IMPORTANT: Flush queue when app resumes (iPad/iOS background issue)
  const flushNow = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Try to push any queued writes to Supabase
      const flushed = await db.flushCloudQueue(user.id);

      // Refresh UI after flush attempt
      setPendingSyncCount(db.getQueueCount());
      const refreshed = await db.getClients(user.id);
      setClients(refreshed);

      // Update visible save status
      if (db.getQueueCount() === 0) {
        setSaveStatus('idle');
      } else {
        setSaveStatus('pending_sync');
      }

      // Optional: mark last sync time when something flushed
      if (flushed) {
        setLastSavedTime(new Date());
      }
    } catch (e) {
      console.warn('[SYNC] flushNow failed:', e);
    }
  }, [user]);

  useEffect(() => {
    if (!user?.id) return;

    const onFocus = () => flushNow();
    const onOnline = () => flushNow();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') flushNow();
    };
    const onPageShow = () => flushNow(); // iOS bfcache resume

    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);

    // periodic flush while app is open
    const interval = setInterval(() => flushNow(), 15000);

    // run once immediately
    flushNow();

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, [user, flushNow]);

  // --- 2. Save Logic ---
  const handleSave = async () => {
    if (!user) return;
    setSaveStatus('saving');

    try {
      const clientObj = generateClientObject();
      const result = await db.saveClient(clientObj, user.id);

      setLastSavedTime(new Date());

      if (result.success) {
        setSaveStatus(result.isLocalOnly ? 'pending_sync' : 'saved');
        setPendingSyncCount(db.getQueueCount());

        // Update local list immediately to reflect changes
        setClients(prev => {
          const idx = prev.findIndex(c => c.id === clientObj.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = result.client;
            return next;
          }
          return [...prev, result.client];
        });

        // ✅ If it saved locally only, try flushing immediately (sometimes connection is back)
        if (result.isLocalOnly) {
          flushNow();
        } else {
          setTimeout(() => setSaveStatus('idle'), 2000);
        }
      } else {
        setSaveStatus('error');
      }
    } catch (e) {
      console.error('Save error', e);
      setSaveStatus('error');
    }
  };

  // --- 3. Client Management ---
  const handleLoadClient = (client: Client, redirect: boolean = false) => {
    loadClient(client);
    if (redirect) setActiveTab('profile');
  };

  const handleNewClient = () => {
    resetClient();
    setActiveTab('profile');
  };

  const handleDeleteClient = async (id: string) => {
    await db.deleteClient(id);
    setClients(prev => prev.filter(c => c.id !== id));
    if (clientId === id) resetClient();
  };

  const handleUpdateGlobalClient = async (updatedClient: Client) => {
    // Optimistic update for lists
    setClients(prev => prev.map(c => (c.id === updatedClient.id ? updatedClient : c)));

    // Save to DB
    if (user) {
      const result = await db.saveClient(updatedClient, user.id);
      setPendingSyncCount(db.getQueueCount());
      if (result.isLocalOnly) {
        setSaveStatus('pending_sync');
        flushNow();
      }
    }
  };

  // --- 4. Render Logic ---
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LandingPage onLogin={() => setIsAuthModalOpen(true)} />
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      </>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardTab
            user={user}
            clients={clients}
            setActiveTab={setActiveTab}
            onLoadClient={handleLoadClient}
            onNewClient={handleNewClient}
          />
        );
      case 'reminders':
        return <RemindersTab />;
      case 'crm':
        return (
          <CrmTab
            clients={clients}
            profile={profile}
            selectedClientId={clientId}
            newClient={handleNewClient}
            saveClient={handleSave}
            loadClient={handleLoadClient}
            deleteClient={handleDeleteClient}
            onRefresh={fetchClients}
            onUpdateGlobalClient={handleUpdateGlobalClient}
          />
        );
      case 'market':
        return <MarketNewsTab />;
      case 'portfolio':
        return <PortfolioTab clients={clients} onUpdateClient={handleUpdateGlobalClient} />;
      case 'profile':
        return <ProfileTab clients={clients} onLoadClient={handleLoadClient} onNewProfile={handleNewClient} />;
      case 'children':
        return <ChildrenTab />;
      case 'cpf':
        return <CpfTab />;
      case 'cashflow':
        return <CashflowTab />;
      case 'insurance':
        return <InsuranceTab />;
      case 'retirement':
        return <RetirementTab />;
      case 'investor':
        return <InvestorTab />;
      case 'wealth':
        return <WealthToolTab />;
      case 'property':
        return <PropertyCalculatorTab />;
      case 'vision':
        return <VisionBoardTab />;
      case 'analytics':
        return <AnalyticsTab clients={clients} />;
      case 'report':
        return <ReportTab />;
      case 'admin':
        return <AdminTab clients={clients} />;
      case 'disclaimer':
        return <DisclaimerTab />;
      case 'life_events':
        return <LifeEventsTab />;
      default:
        return (
          <DashboardTab
            user={user}
            clients={clients}
            setActiveTab={setActiveTab}
            onLoadClient={handleLoadClient}
            onNewClient={handleNewClient}
          />
        );
    }
  };

  const currentClientData = clientId
    ? {
        ...generateClientObject(),
        profile,
        id: clientId
      }
    : null;

  return (
    <>
      <AppShell
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLoginClick={() => setIsAuthModalOpen(true)}
        onPricingClick={() => setIsPricingOpen(true)}
        onSaveClick={handleSave}
        clientRef={clientRef || undefined}
        clientName={profile.name || undefined}
        saveStatus={saveStatus}
        lastSavedTime={lastSavedTime}
        clients={clients}
        onLoadClient={handleLoadClient}
        pendingSyncCount={pendingSyncCount}
      >
        {renderContent()}
      </AppShell>

      <AiAssistant currentClient={currentClientData} />

      <PricingModal isOpen={isPricingOpen} onClose={() => setIsPricingOpen(false)} />
    </>
  );
};

// --- Main Root Component ---
const App = () => {
  return (
    <ClientProvider>
      <AiProvider>
        <SproutlyApp />
      </AiProvider>
    </ClientProvider>
  );
};

export default App;