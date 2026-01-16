import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './contexts/AuthContext';
import { ClientProvider, useClient } from './contexts/ClientContext';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { DialogProvider } from './contexts/DialogContext';
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
import { supabase } from './lib/supabase'; // iOS resume session restore
import { Client } from './types';

const AppInner: React.FC = () => {
  const { user, isLoading } = useAuth();
  const {
    profile,
    loadClient,
    resetClient,
    generateClientObject,
    promoteToSaved,
    clientId
  } = useClient();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('disclaimer');
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'pending_sync' | 'error'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const lastSavedJson = useRef<string>('');
  const isSavingRef = useRef<boolean>(false);
  const statusTimerRef = useRef<any>(null);

  const updateQueueStatus = useCallback(() => {
    setPendingCount(db.getQueueCount());
  }, []);

  const handleLoadClient = useCallback(
    (client: Client, redirect: boolean = true) => {
      loadClient(client);
      if (redirect) setActiveTab('profile');

      // Seed diff baseline so autosave doesn't spam
      lastSavedJson.current = JSON.stringify(client || {});
    },
    [loadClient]
  );

  const loadClientsList = useCallback(async () => {
    try {
      const data = await db.getClients(user?.id);
      setClients(Array.isArray(data) ? data : []);
    } catch {
      setClients([]);
    } finally {
      updateQueueStatus();
    }
  }, [user?.id, updateQueueStatus]);

  // Initial load + realtime
  useEffect(() => {
    if (!user || (user.status !== 'approved' && user.status !== 'active')) return;

    loadClientsList();
    const sub = db.subscribeToChanges(() => loadClientsList());

    return () => {
      sub?.unsubscribe();
    };
  }, [user, loadClientsList]);

  // ✅ iOS Safari fix: session restore retry (handles AbortError when returning from background)
  const restoreSupabaseSession = useCallback(async () => {
    if (!supabase) return false;

    const tryOnce = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        if ((error as any)?.name === 'AbortError') return { ok: false, abort: true };
        return { ok: false, abort: false };
      }
      return { ok: !!data.session, abort: false };
    };

    try {
      // Try immediately
      let r = await tryOnce();
      if (r.ok) return true;

      // If aborted, wait and retry a couple times
      if (r.abort) {
        await new Promise(res => setTimeout(res, 800));
        r = await tryOnce();
        if (r.ok) return true;

        await new Promise(res => setTimeout(res, 2000));
        r = await tryOnce();
        if (r.ok) return true;
      }

      return false;
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        await new Promise(res => setTimeout(res, 800));
        try {
          const { data } = await supabase.auth.getSession();
          return !!data.session;
        } catch {
          return false;
        }
      }
      return false;
    }
  }, []);

  const handleSaveClient = useCallback(
    async (isAutoSave = false) => {
      if (!user || (user.status !== 'approved' && user.status !== 'active')) return;
      if (isSavingRef.current) return;

      const clientData = generateClientObject();
      if (!clientData?.profile?.name) return;

      // Diff check
      const { lastUpdated: _ts, ...currentContent } = clientData;
      let lastSavedContent: any = {};
      try {
        const parsed = JSON.parse(lastSavedJson.current || '{}');
        const { lastUpdated: _oldTs, ...rest } = parsed || {};
        lastSavedContent = rest;
      } catch {}

      if (JSON.stringify(currentContent) === JSON.stringify(lastSavedContent)) return;

      isSavingRef.current = true;
      setSaveStatus('saving');
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);

      // Optimistic UI update
      setClients(prev => {
        const idx = prev.findIndex(c => c.id === clientData.id);
        const optimisticRecord = { ...clientData, _isSynced: false };
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = optimisticRecord;
          return copy;
        }
        return [...prev, optimisticRecord];
      });

      try {
        const result = await db.saveClient(clientData, user.id);

        if (!clientId) promoteToSaved(result.client);

        setLastSaved(new Date());
        updateQueueStatus();

        // ✅ CRITICAL: update baseline EVEN IF local-only
        lastSavedJson.current = JSON.stringify(result.client || clientData);

        if (result.isLocalOnly) {
          setSaveStatus('pending_sync');

          if (result.error) {
            console.warn('Save local-only due to error:', result.error);
            if (!isAutoSave) toast.info(`Saved to device. Cloud pending: ${result.error}`);
          } else {
            if (!isAutoSave) toast.info('Saved to device. Cloud pending sync.');
          }
        } else {
          setSaveStatus('saved');
          setClients(prev => prev.map(c => (c.id === result.client.id ? result.client : c)));
          statusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2500);
        }
      } catch (e: any) {
        setSaveStatus('error');
        if (!isAutoSave) toast.error('Save failed: ' + (e?.message || 'Unknown error'));
      } finally {
        isSavingRef.current = false;
      }
    },
    [user, generateClientObject, clientId, promoteToSaved, updateQueueStatus, toast]
  );

  // Auto-save (slower helps mobile stability)
  useEffect(() => {
    const interval = setInterval(() => handleSaveClient(true), 15000);
    return () => clearInterval(interval);
  }, [handleSaveClient]);

  // ✅ Resume flush logic (iOS friendly) — restore session first
  useEffect(() => {
    if (!user?.id) return;

    const triggerFlushSafe = async () => {
      console.log('[SYNC] App visible, checking outbox...');

      const ok = await restoreSupabaseSession();
      if (!ok) return;

      const flushed = await db.flushCloudQueue(user.id);
      updateQueueStatus();

      if (flushed) {
        await loadClientsList();
        setLastSaved(new Date());
      }

      if (db.getQueueCount() === 0) setSaveStatus('idle');
      else setSaveStatus('pending_sync');
    };

    const onFocus = () => triggerFlushSafe();
    const onPageShow = () => triggerFlushSafe();
    const onOnline = () => triggerFlushSafe();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') triggerFlushSafe();
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);

    const flushInterval = setInterval(triggerFlushSafe, 20000);

    updateQueueStatus();

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(flushInterval);
    };
  }, [user?.id, loadClientsList, updateQueueStatus, restoreSupabaseSession]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 font-bold text-slate-400 animate-pulse">
        BOOTING QUANTUM CORE...
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
      pendingSyncCount={pendingCount}
    >
      {activeTab === 'disclaimer' && <DisclaimerTab />}

      {activeTab === 'dashboard' && (
        <DashboardTab
          user={user}
          clients={clients}
          setActiveTab={setActiveTab}
          onLoadClient={handleLoadClient}
          onNewClient={() => {
            resetClient();
            lastSavedJson.current = '';
            setActiveTab('profile');
          }}
        />
      )}

      {activeTab === 'profile' && (
        <ProfileTab
          clients={clients}
          onLoadClient={handleLoadClient}
          onNewProfile={() => {
            resetClient();
            lastSavedJson.current = '';
          }}
        />
      )}

      {activeTab === 'crm' && (
        <CrmTab
          clients={clients}
          profile={profile}
          selectedClientId={clientId}
          newClient={() => {
            resetClient();
            lastSavedJson.current = '';
            setActiveTab('profile');
          }}
          saveClient={() => handleSaveClient(false)}
          loadClient={handleLoadClient}
          deleteClient={async (id) => {
            await db.deleteClient(id);
            setClients(prev => prev.filter(c => c.id !== id));
            updateQueueStatus();
          }}
          onRefresh={loadClientsList}
          onUpdateGlobalClient={(c) => {
            setClients(prev => prev.map(x => (x.id === c.id ? c : x)));
            if (c.id === clientId) loadClient(c);
            if (user?.id) db.saveClient(c, user.id);
            updateQueueStatus();
          }}
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

      {activeTab === 'portfolio' && (
        <PortfolioTab
          clients={clients}
          onUpdateClient={(c) => {
            setClients(prev => prev.map(x => (x.id === c.id ? c : x)));
            if (user?.id) db.saveClient(c, user.id);
            updateQueueStatus();
          }}
        />
      )}

      {activeTab === 'market' && <MarketNewsTab />}
      {activeTab === 'reminders' && <RemindersTab />}
      {activeTab === 'report' && <ReportTab />}

      <AiAssistant currentClient={clientId ? generateClientObject() : null} />
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setAuthModalOpen(false)} />
    </AppShell>
  );
};

const App: React.FC = () => (
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

export default App;