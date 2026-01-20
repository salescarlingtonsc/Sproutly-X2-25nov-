
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useClient } from './contexts/ClientContext';
import { useToast } from './contexts/ToastContext';
import { useDialog } from './contexts/DialogContext';
import { db, DB_KEYS } from './lib/db';
import { Client } from './types';
import { canAccessTab } from './lib/config';
import { useSyncRecovery } from './hooks/useSyncRecovery';

import AppShell from './components/layout/AppShell';
import LandingPage from './features/auth/LandingPage';
import AuthModal from './features/auth/AuthModal';
import PricingModal from './features/subscription/PricingModal';

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
  const { user, isLoading: isAuthLoading } = useAuth();
  const { 
    clientId, generateClientObject, loadClient, promoteToSaved, resetClient,
    setChatHistory 
  } = useClient();
  const toast = useToast();
  
  // 1. INSTANT ANCHOR HYDRATION
  // Using unified DB_KEYS to ensure 0ms load time
  const [clients, setClients] = useState<Client[]>(() => {
    try {
      const local = localStorage.getItem(DB_KEYS.CLIENTS);
      return local ? JSON.parse(local) : [];
    } catch (e) {
      return [];
    }
  });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);

  // Sync Recovery Hook (Auto-resets connection zombies when app wakes up)
  useSyncRecovery(user?.id, () => {
      refreshClients();
  });

  const refreshClients = useCallback(async () => {
    if (user) {
      const data = await db.getClients(user.id);
      // Safety: Only update state if we got data back OR if state is currently empty
      // This prevents the "disappearing leads" flicker on network timeout
      if (data.length > 0 || clients.length === 0) {
        setClients(data);
      }
    }
  }, [user, clients.length]);

  useEffect(() => {
    if (user) refreshClients();
  }, [user, refreshClients]);

  const handleSave = async () => {
    if (!user) {
        setIsAuthModalOpen(true);
        return;
    }
    setSaveStatus('saving');
    try {
      const clientObj = generateClientObject();
      const savedClient = await db.saveClient(clientObj, user.id);
      
      // Update local state immediately (Optimistic UI)
      setClients(prev => {
        const idx = prev.findIndex(c => c.id === savedClient.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = savedClient;
          return next;
        }
        return [savedClient, ...prev];
      });

      promoteToSaved(savedClient);
      setSaveStatus('saved');
      setLastSavedTime(new Date());
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e) {
      setSaveStatus('error');
      toast.error("Save failed. Background sync active.");
    }
  };

  const handleLoadClient = (client: Client, redirect: boolean = true) => {
    loadClient(client);
    if (redirect) setActiveTab('profile');
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
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

  const renderTab = () => {
    if (!canAccessTab(user, activeTab)) {
        return <div className="p-20 text-center text-slate-400 font-bold">Please upgrade your plan to access this high-precision module.</div>;
    }

    switch (activeTab) {
      case 'dashboard': return <DashboardTab user={user} clients={clients} onLoadClient={handleLoadClient} onNewClient={() => { resetClient(); setActiveTab('profile'); }} setActiveTab={setActiveTab} />;
      case 'crm': return <CrmTab clients={clients} profile={user} selectedClientId={clientId} newClient={() => { resetClient(); setActiveTab('profile'); }} saveClient={handleSave} loadClient={handleLoadClient} deleteClient={async (id) => { await db.deleteClient(id); setClients(c => c.filter(x => x.id !== id)); }} onRefresh={refreshClients} onUpdateGlobalClient={(c) => { setClients(prev => prev.map(old => old.id === c.id ? c : old)); db.saveClient(c, user.id); }} />;
      case 'profile': return <ProfileTab clients={clients} onLoadClient={handleLoadClient} onNewProfile={resetClient} />;
      case 'reminders': return <RemindersTab />;
      case 'market': return <MarketNewsTab />;
      case 'portfolio': return <PortfolioTab clients={clients} onUpdateClient={(c) => { setClients(prev => prev.map(old => old.id === c.id ? c : old)); db.saveClient(c, user.id); }} />;
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
      default: return <DashboardTab user={user} clients={clients} onLoadClient={handleLoadClient} onNewClient={resetClient} setActiveTab={setActiveTab} />;
    }
  };

  return (
    <AppShell 
      activeTab={activeTab} 
      setActiveTab={setActiveTab}
      onLoginClick={() => setIsAuthModalOpen(true)}
      onPricingClick={() => setIsPricingModalOpen(true)}
      onSaveClick={handleSave}
      saveStatus={saveStatus}
      lastSavedTime={lastSavedTime}
      clients={clients}
      onLoadClient={handleLoadClient}
      onSystemRefresh={refreshClients}
    >
      {renderTab()}
      <PricingModal isOpen={isPricingModalOpen} onClose={() => setIsPricingModalOpen(false)} />
      <AiAssistant currentClient={clients.find(c => c.id === clientId) || null} />
    </AppShell>
  );
};

export default App;
