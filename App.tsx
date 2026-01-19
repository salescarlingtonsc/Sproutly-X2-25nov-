import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useClient } from './contexts/ClientContext';
import { useToast } from './contexts/ToastContext';
import { useDialog } from './contexts/DialogContext';
import { db } from './lib/db';
import { supabase } from './lib/supabase';
import { Diagnostics } from './lib/diagnostics';
import { Client } from './types';

import AppShell from './components/layout/AppShell';
import LandingPage from './features/auth/LandingPage';
import AuthModal from './features/auth/AuthModal';
import PricingModal from './features/subscription/PricingModal';
import DbRepairModal from './features/admin/components/DbRepairModal';

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
import VisionBoardTab from './features/vision/VisionBoardTab';
import AnalyticsTab from './features/analytics/AnalyticsTab';
import ReportTab from './features/report/ReportTab';
import AdminTab from './features/admin/AdminTab';
import DisclaimerTab from './features/disclaimer/DisclaimerTab';

const LAST_TAB_KEY = 'sproutly_last_active_tab';
const LAST_CLIENT_ID_KEY = 'sproutly_last_client_id';

export default function App() {
  const { user, isLoading: authLoading } = useAuth();
  const { clientId, profile, loadClient, resetClient, generateClientObject, promoteToSaved } = useClient();
  const toast = useToast();
  const { confirm } = useDialog();

  const [activeTab, setActiveTab] = useState(() => localStorage.getItem(LAST_TAB_KEY) || 'crm');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [showEmergencyRepair, setShowEmergencyRepair] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  const isSavingRef = useRef(false);

  useEffect(() => { localStorage.setItem(LAST_TAB_KEY, activeTab); }, [activeTab]);

  const loadClientsList = useCallback(async () => {
     try {
       const data = await db.getClients(user?.id);
       setClients(data);
       return data;
     } catch (e) { return []; }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadClientsList();
      const unsub = db.subscribeToChanges((event: string) => {
         if (event === 'remote_update') loadClientsList();
      });
      return () => { if(unsub) unsub(); };
    }
  }, [user, loadClientsList]);

  // WAKE UP LOGIC: Perfect Refresh
  useEffect(() => {
    const handleWakeUp = async () => {
        if (!user) return;
        setSaveStatus('saving'); // Visual indicator
        const freshList = await loadClientsList();
        
        // Re-sync active context if a client is open
        if (clientId) {
            const freshActive = freshList.find(c => c.id === clientId);
            if (freshActive) loadClient(freshActive);
        }
        setTimeout(() => setSaveStatus('idle'), 500);
    };

    const handleVisibility = () => { if (document.visibilityState === 'visible') handleWakeUp(); };
    window.addEventListener('focus', handleWakeUp);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
        window.removeEventListener('focus', handleWakeUp);
        document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, clientId, loadClientsList, loadClient]);

  const handleLoadClient = (client: Client, redirect = true) => {
     localStorage.setItem(LAST_CLIENT_ID_KEY, client.id);
     loadClient(client);
     if (redirect) setActiveTab('profile');
  };

  const handleSaveClient = useCallback(async (force = false) => {
     if (!user) return;
     const clientData = generateClientObject();
     if (!clientData.profile.name) return;

     isSavingRef.current = true;
     setSaveStatus('saving');
     try {
        const saved = await db.saveClient(clientData, user.id);
        setClients(prev => {
            const exists = prev.find(c => c.id === saved.id);
            return exists ? prev.map(c => c.id === saved.id ? saved : c) : [...prev, saved];
        });
        if (!clientId) promoteToSaved(saved);
        setLastSaved(new Date());
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
     } catch (e) {
        setSaveStatus('error');
     } finally { isSavingRef.current = false; }
  }, [user, generateClientObject, clientId, promoteToSaved]);

  if (authLoading) return null;
  if (!user) return <><LandingPage onLogin={() => setIsAuthModalOpen(true)} /><AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} /></>;

  const handleUpdateGlobalClient = (updated: Client) => {
      setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
      if (clientId === updated.id) loadClient(updated);
      db.saveClient(updated, user.id); 
  };

  return (
    <AppShell 
      activeTab={activeTab} setActiveTab={setActiveTab} 
      onLoginClick={() => setIsAuthModalOpen(true)} onPricingClick={() => setIsPricingModalOpen(true)}
      onSaveClick={() => handleSaveClient(true)}
      clientName={profile.name} saveStatus={saveStatus} lastSavedTime={lastSaved}
      clients={clients} onLoadClient={handleLoadClient}
      onSystemRefresh={loadClientsList}
    >
      {activeTab === 'dashboard' && <DashboardTab user={user} clients={clients} onNewClient={resetClient} onLoadClient={handleLoadClient} setActiveTab={setActiveTab} />}
      {activeTab === 'crm' && <CrmTab clients={clients} profile={profile} selectedClientId={clientId} newClient={resetClient} saveClient={() => handleSaveClient()} loadClient={handleLoadClient} deleteClient={db.deleteClient} onRefresh={loadClientsList} onUpdateGlobalClient={handleUpdateGlobalClient} />}
      {activeTab === 'profile' && <ProfileTab clients={clients} onLoadClient={handleLoadClient} onNewProfile={resetClient} />}
      {activeTab === 'reminders' && <RemindersTab />}
      {activeTab === 'market' && <MarketNewsTab />}
      {activeTab === 'portfolio' && <PortfolioTab clients={clients} onUpdateClient={handleUpdateGlobalClient} />}
      {activeTab === 'cpf' && <CpfTab />}
      {activeTab === 'cashflow' && <CashflowTab />}
      {activeTab === 'insurance' && <InsuranceTab />}
      {activeTab === 'retirement' && <RetirementTab />}
      {activeTab === 'investor' && <InvestorTab />}
      {activeTab === 'wealth' && <WealthToolTab />}
      {activeTab === 'property' && <PropertyCalculatorTab />}
      {activeTab === 'vision' && <VisionBoardTab />}
      {activeTab === 'analytics' && <AnalyticsTab clients={clients} />}
      {activeTab === 'admin' && <AdminTab />}
      {activeTab === 'disclaimer' && <DisclaimerTab />}
    </AppShell>
  );
}