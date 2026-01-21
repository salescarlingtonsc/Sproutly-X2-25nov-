
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
  const { 
    clientId, generateClientObject, loadClient, promoteToSaved, resetClient,
    setChatHistory 
  } = useClient();
  const toast = useToast();
  
  const [clients, setClients] = useState<Client[]>(() => {
    try {
      const local = localStorage.getItem(DB_KEYS.CLIENTS);
      const parsed = local ? JSON.parse(local) : [];
      // Filter out ghosts on initial load
      return parsed.filter((c: Client) => c.profile?.name || c.name || c.company || c.phone);
    } catch (e) {
      return [];
    }
  });

  const [activeTab, setActiveTab] = useState('disclaimer');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);

  const refreshClients = useCallback(async () => {
    if (user) {
      const data = await db.getClients(user.id);
      // Filter out ghosts from DB fetch
      const validClients = data.filter(c => c.profile?.name || c.name || c.company || c.phone);
      
      // Update state with fresh data
      setClients(validClients);
    }
  }, [user]);

  // Handle password recovery mode
  useEffect(() => {
    if (isRecoveryMode) {
      setIsAuthModalOpen(true);
    }
  }, [isRecoveryMode]);

  // Sync Recovery Hook with Visual Feedback
  // Wrapped in useCallback with STABLE dependencies to prevent the hook from resetting locks on every render
  const handleRecovery = useCallback((source: string) => {
      const queueCount = db.getQueueCount();
      
      // VISUAL FEEDBACK: Provide reassurance when returning from background
      if (source === 'visibility_immediate' || source === 'time_jump_detected') {
          console.log(`⚡ App Woke Up (${source})`);
          // Force UI refresh if we have pending items OR just generally to be safe
          if (queueCount > 0) {
             toast.info(`⚡ Resuming Sync (${queueCount} items)...`);
          } else {
             // Subtle indicator that system is live
             // toast.info("⚡ System Active");
          }
      } else if (queueCount > 0 && source === 'network_online') {
          toast.info("⚡ Online: Resuming Sync...");
      }
      
      // Force data refresh from cloud to ensure we see any changes that might have happened
      // while we were backgrounded (or if the previous sync succeeded but UI didn't update)
      refreshClients();
  }, [refreshClients]);

  useSyncRecovery(user?.id, handleRecovery);

  // Access Guard: If current tab is blocked, force navigate to CRM
  useEffect(() => {
    if (user && !canAccessTab(user, activeTab)) {
      setActiveTab('crm');
    }
  }, [user, activeTab]);

  useEffect(() => {
    if (user) refreshClients();
  }, [user, refreshClients]);

  const handleSave = async () => {
    if (!user) {
        return;
    }
    
    const clientObj = generateClientObject();

    // GHOST GUARD: Strictly prevent saving empty records
    const hasIdentity = 
        (clientObj.profile.name && clientObj.profile.name.trim() !== '') || 
        (clientObj.profile.phone && clientObj.profile.phone.trim() !== '') || 
        (clientObj.company && clientObj.company.trim() !== '');

    if (!hasIdentity) {
        return;
    }

    setSaveStatus('saving');
    try {
      const savedClient = await db.saveClient(clientObj, user.id);
      
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
      console.error("Sync Error", e);
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
      default: return <CrmTab clients={clients} profile={user} selectedClientId={clientId} newClient={() => { resetClient(); setActiveTab('profile'); }} saveClient={handleSave} loadClient={handleLoadClient} deleteClient={async (id) => { await db.deleteClient(id); setClients(c => c.filter(x => x.id !== id)); }} onRefresh={refreshClients} onUpdateGlobalClient={(c) => { setClients(prev => prev.map(old => old.id === c.id ? c : old)); db.saveClient(c, user.id); }} />;
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
      <AutoSaver onSave={handleSave} />
      {renderTab()}
      {/* 
        This AuthModal instance serves as the "Password Reset" handler when user is logged in (via reset link).
        It forces 'update_password' view if isRecoveryMode is true.
      */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        defaultView={isRecoveryMode ? 'update_password' : 'login'}
      />
      <PricingModal isOpen={isPricingModalOpen} onClose={() => setIsPricingModalOpen(false)} />
      <AiAssistant currentClient={clients.find(c => c.id === clientId) || null} />
    </AppShell>
  );
};

export default App;
