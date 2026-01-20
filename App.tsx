
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useClient } from './contexts/ClientContext';
import { useToast } from './contexts/ToastContext';
import { useDialog } from './contexts/DialogContext';
import { db } from './lib/db';
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

const LAST_TAB_KEY = 'sproutly_last_active_tab';

export default function App() {
  const { user, isLoading: authLoading } = useAuth();
  const { clientId, profile, loadClient, resetClient, generateClientObject, promoteToSaved } = useClient();
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem(LAST_TAB_KEY) || 'disclaimer');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  useEffect(() => { localStorage.setItem(LAST_TAB_KEY, activeTab); }, [activeTab]);

  const loadClientsList = useCallback(async (silent = false) => {
     if (!silent) setSaveStatus('saving');
     try {
       const data = await db.getClients(user?.id);
       setClients(data);
       if (!silent) {
         setSaveStatus('saved');
         setTimeout(() => setSaveStatus('idle'), 1000);
       }
     } catch (e) { 
       if (!silent) setSaveStatus('error');
     }
  }, [user]);

  // ACTIVATE DEFIBRILLATOR
  // This automatically pushes data when you return from YouTube/WhatsApp
  useSyncRecovery(user?.id, () => {
      loadClientsList(false); // Forces a sync visual and cloud check
  });

  useEffect(() => {
    if (user) {
      loadClientsList(true);
      const unsub = db.subscribeToChanges(() => loadClientsList(true));
      return () => { if(unsub) unsub(); };
    }
  }, [user, loadClientsList]);

  const handleLoadClient = (client: Client) => {
     loadClient(client);
     setActiveTab('profile');
  };

  const handleSaveClient = useCallback(async () => {
     if (!user) return;
     const clientData = generateClientObject();
     if (!clientData.profile.name) return;

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
     }
  }, [user, generateClientObject, clientId, promoteToSaved]);

  if (authLoading) return null;
  if (!user) return <><LandingPage onLogin={() => setIsAuthModalOpen(true)} /><AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} /></>;

  return (
    <div className="relative h-screen overflow-hidden">
      <AppShell 
        activeTab={activeTab} setActiveTab={setActiveTab} 
        onPricingClick={() => setIsPricingModalOpen(true)}
        onSaveClick={handleSaveClient}
        clientName={profile.name} saveStatus={saveStatus} lastSavedTime={lastSaved}
        clients={clients} onLoadClient={handleLoadClient}
        onSystemRefresh={() => loadClientsList(false)}
      >
        {activeTab === 'dashboard' && <DashboardTab user={user} clients={clients} onNewClient={resetClient} onLoadClient={handleLoadClient} setActiveTab={setActiveTab} />}
        {activeTab === 'crm' && <CrmTab clients={clients} profile={profile} selectedClientId={clientId} newClient={resetClient} saveClient={handleSaveClient} loadClient={handleLoadClient} deleteClient={db.deleteClient} onRefresh={loadClientsList} onUpdateGlobalClient={(u) => { setClients(prev => prev.map(c => c.id === u.id ? u : c)); db.saveClient(u); }} />}
        {activeTab === 'profile' && <ProfileTab clients={clients} onLoadClient={handleLoadClient} onNewProfile={resetClient} />}
        {activeTab === 'reminders' && <RemindersTab />}
        {activeTab === 'market' && <MarketNewsTab />}
        {activeTab === 'portfolio' && <PortfolioTab clients={clients} onUpdateClient={(u) => { setClients(prev => prev.map(c => c.id === u.id ? u : c)); db.saveClient(u); }} />}
        {activeTab === 'cpf' && <CpfTab />}
        {activeTab === 'cashflow' && <CashflowTab />}
        {activeTab === 'insurance' && <InsuranceTab />}
        {activeTab === 'retirement' && <RetirementTab />}
        {activeTab === 'investor' && <InvestorTab />}
        {activeTab === 'wealth' && <WealthToolTab />}
        {activeTab === 'property' && <PropertyCalculatorTab />}
        {activeTab === 'nine_box' && <NineBoxTab />}
        {activeTab === 'vision' && <VisionBoardTab />}
        {activeTab === 'analytics' && <AnalyticsTab clients={clients} />}
        {activeTab === 'report' && <ReportTab clients={clients} />}
        {activeTab === 'admin' && <AdminTab />}
        {activeTab === 'disclaimer' && <DisclaimerTab />}
      </AppShell>
      <PricingModal isOpen={isPricingModalOpen} onClose={() => setIsPricingModalOpen(false)} />
    </div>
  );
}
