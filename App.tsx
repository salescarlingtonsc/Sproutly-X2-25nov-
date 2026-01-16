window.onerror = function (msg, src, line, col, err) {
  alert(
    'JS ERROR:\n' +
    msg +
    '\n' +
    src +
    ':' +
    line +
    ':' +
    col
  );
};
// Catch async / Promise errors (Supabase, fetch, etc.)
window.onunhandledrejection = function (event: any) {
  const r = event?.reason;

  let msg = '';
  try {
    if (!r) msg = '(no reason)';
    else if (typeof r === 'string') msg = r;
    else if (r instanceof Error) msg = r.message + '\n' + (r.stack || '');
    else msg = r.message || JSON.stringify(r, Object.getOwnPropertyNames(r));
  } catch {
    msg = String(r);
  }

  alert('UNHANDLED PROMISE REJECTION:\n' + msg);
};
alert('Debug hook loaded ✅');

// Make console errors visible on iPad too
const _consoleError = console.error;
console.error = (...args: any[]) => {
  try {
    alert('console.error:\n' + args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  } catch {}
  _consoleError(...args);
};
import * as React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './contexts/AuthContext';
import { ClientProvider, useClient } from './contexts/ClientContext';
import { AiProvider } from './contexts/AiContext';
import { db } from './lib/db';
import { Client } from './types';

import AppShell from './components/layout/AppShell';
import LandingPage from './features/auth/LandingPage';
import AuthModal from './features/auth/AuthModal';
import PricingModal from './features/subscription/PricingModal';
import AiAssistant from './features/ai-chat/AiAssistant';

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

const SproutlyApp = () => {
  const { user, isLoading: authLoading } = useAuth();

  const { loadClient, generateClientObject, resetClient, clientRef, profile, clientId } = useClient();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPricingOpen, setIsPricingOpen] = useState(false);

  const [clients, setClients] = useState<Client[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'pending_sync'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // ✅ stop saving on every keystroke
  const debounceTimerRef = useRef<any>(null);

  // WATCHDOG: Force reset "Syncing" loop if it hangs for >20s
  useEffect(() => {
    let watchdogTimer: any;
    if (saveStatus === 'saving') {
        watchdogTimer = setTimeout(() => {
            console.warn("[App] Sync Watchdog Triggered: Resetting stuck state.");
            setSaveStatus('pending_sync');
        }, 20000);
    }
    return () => clearTimeout(watchdogTimer);
  }, [saveStatus]);

  const refreshLocal = useCallback(async () => {
    const localData = await db.getClients(user?.id);
    setClients(Array.isArray(localData) ? localData : []);
    setPendingSyncCount(db.getQueueCount());
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    refreshLocal();

    const sub = db.subscribeToChanges(() => {
      refreshLocal();
    });

    const handleQueueChange = () => {
      setPendingSyncCount(db.getQueueCount());
      db.getClients(user?.id).then((data) => setClients(Array.isArray(data) ? data : []));
    };

    window.addEventListener('sproutly:queue_changed', handleQueueChange);
    const interval = setInterval(handleQueueChange, 5000);

    return () => {
      try { sub?.unsubscribe?.(); } catch {}
      window.removeEventListener('sproutly:queue_changed', handleQueueChange);
      clearInterval(interval);
    };
  }, [user?.id, refreshLocal]);

  // best-effort flush on resume
  useEffect(() => {
    if (!user?.id) return;

    const tryFlush = async () => {
      const ok = await db.flushCloudQueue(user.id);
      setPendingSyncCount(db.getQueueCount());
      if (ok) {
        setLastSavedTime(new Date());
        refreshLocal();
      }
    };

    const onFocus = () => tryFlush();
    const onOnline = () => tryFlush();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tryFlush();
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user?.id, refreshLocal]);

  const handleSave = useCallback(async () => {
    if (!user?.id) return;
    setSaveStatus('saving');

    try {
      const clientObj = generateClientObject();
      const result = await db.saveClient(clientObj, user.id);

      setLastSavedTime(new Date());
      setPendingSyncCount(db.getQueueCount());

      if (result.success) {
        setSaveStatus(result.isLocalOnly ? 'pending_sync' : 'saved');
        await refreshLocal();
        if (!result.isLocalOnly) setTimeout(() => setSaveStatus('idle'), 1500);
      } else {
        setSaveStatus('error');
      }
    } catch (e) {
      console.error('Save error', e);
      setSaveStatus('error');
    }
  }, [user?.id, generateClientObject, refreshLocal]);

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
    setClients((prev) => prev.filter((c) => c.id !== id));
    setPendingSyncCount(db.getQueueCount());
    if (clientId === id) resetClient();
  };

  // ✅ THE FIX: debounce cloud writes from CRM typing
  const handleUpdateGlobalClient = (updatedClient: Client) => {
    setClients((prev) => prev.map((c) => (c.id === updatedClient.id ? updatedClient : c)));

    if (!user?.id) return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    setSaveStatus('saving');

    debounceTimerRef.current = setTimeout(async () => {
      try {
        // Enforce a hard stop if this async call somehow hangs
        const result = await db.saveClient(updatedClient, user.id);

        setLastSavedTime(new Date());
        setPendingSyncCount(db.getQueueCount());
        setSaveStatus(result.isLocalOnly ? 'pending_sync' : 'saved');

        await refreshLocal();

        if (!result.isLocalOnly) setTimeout(() => setSaveStatus('idle'), 1500);
      } catch (e) {
        console.error('Debounced save failed', e);
        setSaveStatus('error');
      }
    }, 900);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
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
            onRefresh={refreshLocal}
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

  const currentClientData = clientId ? { ...generateClientObject(), profile, id: clientId } : null;

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