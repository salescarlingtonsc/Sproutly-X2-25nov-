import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useClient } from './contexts/ClientContext';
import { useToast } from './contexts/ToastContext';
import { useDialog } from './contexts/DialogContext';
import { db, DB_KEYS } from './lib/db';
import { supabase } from './lib/supabase';
import { Client } from './types';
import { canAccessTab } from './lib/config';
import { useSyncRecovery } from './hooks/useSyncRecovery';
import { syncInspector } from './lib/syncInspector';

import AppShell from './components/layout/AppShell';
import LandingPage from './features/auth/LandingPage';
import AuthModal from './features/auth/AuthModal';
import PricingModal from './features/subscription/PricingModal';
import AutoSaver from './components/system/AutoSaver';

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
import NineBoxTab from './features/nine-box/NineBoxTab';
import VisionBoardTab from './features/vision/VisionBoardTab';
import AnalyticsTab from './features/analytics/AnalyticsTab';
import ReportTab from './features/report/ReportTab';
import AdminTab from './features/admin/AdminTab';
import DisclaimerTab from './features/disclaimer/DisclaimerTab';
import AiAssistant from './features/ai-chat/AiAssistant';

const App: React.FC = () => {
  const { user, isLoading: isAuthLoading, isRecoveryMode } = useAuth();
  const { clientId, generateClientObject, loadClient, promoteToSaved, resetClient } = useClient();
  const toast = useToast();
  
  const [clients, setClients] = useState<Client[]>([]);
  const [activeTab, setActiveTab] = useState('disclaimer');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);

  const refreshClients = useCallback(async () => {
    if (user) {
      const data = await db.getClients();
      setClients(data.filter((c: any) => c.profile?.name || c.name));
    }
  }, [user]);

  // INITIAL CLOUD SYNC: Restore leads on boot
  useEffect(() => {
    if (user) {
        db.pullFromCloud().then(() => {
            refreshClients();
        });
    }
  }, [user, refreshClients]);

  useEffect(() => {
    db.getClients().then(data => {
        if (data && data.length > 0) setClients(data.filter((c: any) => c.name || c.profile?.name));
    });
  }, []);

  useEffect(() => {
      const h = () => refreshClients();
      window.addEventListener('sproutly:data_synced', h);
      return () => window.removeEventListener('sproutly:data_synced', h);
  }, [refreshClients]);

  // Handle centralized recovery hook
  useSyncRecovery(user?.id, refreshClients);

  const handleSave = async () => {
    if (!user) return;
    const clientObj = generateClientObject();
    if (!clientObj.profile.name && !clientObj.name) return;

    setSaveStatus('saving');
    try {
      const saved = await db.saveClient(clientObj, user.id, { owner: 'UI', module: 'App', reason: 'Manual Save' });
      setClients(prev => {
        const idx = prev.findIndex(c => c.id === saved.id);
        if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n; }
        return [saved, ...prev];
      });
      promoteToSaved(saved);
      db.scheduleFlush('Manual Save Trigger');
      setSaveStatus('saved');
      setLastSavedTime(new Date());
      setTimeout(() => setSaveStatus(s => s === 'saved' ? 'idle' : s), 3000);
    } catch (e: any) {
      setSaveStatus('error');
    }
  };

  const handleLoadClient = (client: Client, redirect: boolean = true) => {
    loadClient(client);
    if (redirect) setActiveTab('profile');
  };

  if (isAuthLoading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-600 rounded-full animate-spin"></div></div>;
  }

  if (!user) {
    return <><LandingPage onLogin={() => setIsAuthModalOpen(true)} /><AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} /></>;
  }

  return (
    <AppShell 
      activeTab={activeTab} setActiveTab={setActiveTab} onLoginClick={() => setIsAuthModalOpen(true)} onPricingClick={() => setIsPricingModalOpen(true)} onSaveClick={handleSave} saveStatus={saveStatus} lastSavedTime={lastSavedTime} clients={clients} onLoadClient={handleLoadClient} onSystemRefresh={refreshClients}
    >
      <AutoSaver onSave={handleSave} />
      {(() => {
        switch (activeTab) {
          case 'dashboard': return <DashboardTab user={user} clients={clients} onLoadClient={handleLoadClient} onNewClient={() => { resetClient(); setActiveTab('profile'); }} setActiveTab={setActiveTab} />;
          case 'crm': return <CrmTab clients={clients} profile={user} selectedClientId={clientId} newClient={() => { resetClient(); setActiveTab('profile'); }} saveClient={handleSave} loadClient={handleLoadClient} deleteClient={async (id) => { await db.deleteClient(id); setClients(c => c.filter(x => x.id !== id)); }} onRefresh={refreshClients} onUpdateGlobalClient={(c) => { setClients(prev => prev.map(old => old.id === c.id ? c : old)); db.saveClient(c, user.id, { owner: 'UI', module: 'CRM', reason: 'Update' }); db.scheduleFlush('CRM Update'); }} />;
          case 'profile': return <ProfileTab clients={clients} onLoadClient={handleLoadClient} onNewProfile={resetClient} />;
          case 'reminders': return <RemindersTab />;
          case 'market': return <MarketNewsTab />;
          case 'portfolio': return <PortfolioTab clients={clients} onUpdateClient={(c) => { setClients(prev => prev.map(old => old.id === c.id ? c : old)); db.saveClient(c, user.id, { owner: 'UI', module: 'Portfolio', reason: 'Valuation update' }); db.scheduleFlush('Portfolio Valuation Update'); }} />;
          case 'life_events': return <LifeEventsTab />;
          case 'children': return <ChildrenTab />;
          case 'cpf': return <CpfTab />;
          case 'cashflow': return <CashflowTab />;
          case 'insurance': return <InsuranceTab />;
          case 'retirement': return <RetirementTab />;
          case 'investor': return <InvestorTab />;
          case 'wealth': return <WealthToolTab />;
          case 'property': return <PropertyCalculatorTab />;
          case 'nine_box': return <NineBoxTab />;
          case 'vision': return <VisionBoardTab />;
          case 'analytics': return <AnalyticsTab clients={clients} />;
          case 'report': return <ReportTab clients={clients} />;
          case 'admin': return <AdminTab />;
          case 'disclaimer': return <DisclaimerTab />;
          default: return <DashboardTab user={user} clients={clients} onLoadClient={handleLoadClient} onNewClient={() => { resetClient(); setActiveTab('profile'); }} setActiveTab={setActiveTab} />;
        }
      })()}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} defaultView={isRecoveryMode ? 'update_password' : 'login'} />
      <PricingModal isOpen={isPricingModalOpen} onClose={() => setIsPricingModalOpen(false)} />
      <AiAssistant currentClient={clients.find(c => c.id === clientId) || null} />
    </AppShell>
  );
};

export default App;