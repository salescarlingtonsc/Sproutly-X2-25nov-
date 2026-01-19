import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { adminDb } from '../../lib/db/admin';
import { db } from '../../lib/db';
import { fetchGlobalActivity } from '../../lib/db/activities';
import { supabase } from '../../lib/supabase';
import { DirectorDashboard } from './components/DirectorDashboard';
import { UserManagement } from './components/UserManagement';
import { AdminSettings } from './components/AdminSettings';
import { SubscriptionManager } from './components/SubscriptionManager';
import { AiKnowledgeManager } from './components/AiKnowledgeManager';
import DbRepairModal from './components/DbRepairModal';
import SaveDiagnosticsModal from './components/SaveDiagnosticsModal';
import { Client, Advisor, Team, Product, AppSettings, Subscription } from '../../types';
import { DEFAULT_SETTINGS } from '../../lib/config';

const AdminTab: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [activeView, setActiveView] = useState<'dashboard' | 'users' | 'settings' | 'billing' | 'ai'>('dashboard');
  const [loading, setLoading] = useState(true);
  const [showDbRepair, setShowDbRepair] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Data
  const [clients, setClients] = useState<Client[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [subscription, setSubscription] = useState<Subscription>({ planId: 'free', status: 'active', seats: 1, nextBillingDate: new Date().toISOString() });
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    loadAdminData();
  }, [user]);

  const loadAdminData = async () => {
    if (!user) return;
    setLoading(true);

    // UX: Warn if slow, but DO NOT CRASH.
    const slowTimer = setTimeout(() => {
        toast.info("Database is waking up... this may take a moment.");
    }, 12000); // Increased wait time before warning

    try {
        // 1. Fetch System Settings (Products, Teams, Config)
        const sys = await adminDb.getSystemSettings(user.organizationId);
        if (sys) {
            setProducts(sys.products || []);
            setTeams(sys.teams || []);
            setSettings(sys.appSettings || DEFAULT_SETTINGS);
            if (sys.subscription) setSubscription(sys.subscription);
        }

        // 2. Fetch Advisors (Profiles)
        if (supabase) {
            let query = supabase.from('profiles').select('*');
            if (user.role !== 'admin' && user.organizationId) {
                query = query.eq('organization_id', user.organizationId);
            }
            const { data: profiles } = await query;
            if (profiles) {
                setAdvisors(profiles.map((p: any) => {
                    let status = p.status;
                    if (status === 'active') status = 'approved';
                    if (!status || (status !== 'approved' && status !== 'rejected')) status = 'pending';

                    let displayName = p.name;
                    if (!displayName || displayName.trim() === '') {
                        const safeEmail = p.email || 'unknown';
                        const emailName = safeEmail.split('@')[0];
                        displayName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
                    }

                    return {
                        id: p.id,
                        email: p.email,
                        name: displayName,
                        role: p.role || 'advisor',
                        status: status, 
                        bandingPercentage: p.banding_percentage || 0,
                        annualGoal: p.annual_goal || 0,
                        subscriptionTier: p.subscription_tier,
                        organizationId: p.organization_id || 'org_default',
                        teamId: p.reporting_to,
                        avatar: (displayName || p.email || '?')[0].toUpperCase(),
                        joinedAt: p.created_at,
                        modules: p.modules,
                        isAgencyAdmin: p.role === 'director' || p.is_admin,
                        is_admin: p.is_admin,
                        extraSlots: p.extra_slots
                    };
                }));
            }
        }

        // 3. Fetch Clients
        const allClients = await db.getClients();
        setClients(allClients);

        // 4. Fetch Activities (Safe wrapper to prevent timeout crash)
        try {
            const recentActivity = await Promise.race([
                fetchGlobalActivity(100),
                new Promise((resolve) => setTimeout(() => resolve([]), 5000)) // 5s timeout fallback
            ]);
            setActivities(recentActivity as any[]);
        } catch (e) {
            console.warn("Activity fetch failed or timed out (non-critical)");
        }

    } catch (e: any) {
        console.error("Admin load error", e);
        toast.error("Failed to load some admin data. Check connection.");
    } finally {
        clearTimeout(slowTimer);
        setLoading(false);
    }
  };

  const handleUpdateSettings = async (newSettings: any) => {
      if (newSettings.products) setProducts(newSettings.products);
      if (newSettings.teams) setTeams(newSettings.teams);
      if (newSettings.appSettings) setSettings(newSettings.appSettings);
      if (newSettings.subscription) setSubscription(newSettings.subscription);

      await adminDb.saveSystemSettings({
          products: newSettings.products || products,
          teams: newSettings.teams || teams,
          appSettings: newSettings.appSettings || settings,
          subscription: newSettings.subscription || subscription
      }, user?.organizationId);
      toast.success("Settings saved.");
  };

  const handleUpdateAdvisor = async (advisor: Advisor) => {
      if (!supabase) return;
      const { error } = await supabase.from('profiles').update({
          name: advisor.name,
          role: advisor.role,
          status: advisor.status === 'approved' ? 'active' : advisor.status,
          banding_percentage: advisor.bandingPercentage,
          annual_goal: advisor.annualGoal,
          subscription_tier: advisor.subscriptionTier,
          modules: advisor.modules,
          organization_id: advisor.organizationId,
          reporting_to: advisor.teamId
      }).eq('id', advisor.id);

      if (error) {
          toast.error("Update failed: " + error.message);
      } else {
          setAdvisors(prev => prev.map(a => a.id === advisor.id ? advisor : a));
          toast.success("Advisor profile updated.");
      }
  };

  const handleAddAdvisor = async (advisor: Advisor) => {
      if (!supabase) return;
      const { data } = await supabase.from('profiles').select('id').eq('email', advisor.email).single();
      if (data) {
          await handleUpdateAdvisor({ ...advisor, id: data.id });
      } else {
          toast.info("Invite sent (Simulated)");
      }
      loadAdminData();
  };

  const handleDeleteAdvisor = async (id: string) => {
      if (!supabase) return;
      const { error } = await supabase.from('profiles').update({ status: 'rejected' }).eq('id', id);
      if (!error) {
          setAdvisors(prev => prev.map(a => a.id === id ? { ...a, status: 'rejected' } : a));
          toast.success("Advisor suspended.");
      }
  };

  const handleClientImport = async (newClients: Client[]) => {
      if (newClients.length === 0) return;
      const targetOwner = newClients[0].advisorId;
      if (!targetOwner) return;

      try {
          await db.createClientsBulk(newClients, targetOwner);
          toast.success(`Imported ${newClients.length} leads.`);
          loadAdminData();
      } catch (e: any) {
          toast.error("Import failed: " + e.message);
      }
  };

  // Safe Fallback for User Object
  const currentAdvisor: Advisor = user ? {
      ...user,
      name: user.name || user.email?.split('@')[0] || 'Admin',
      joinedAt: new Date().toISOString(),
      avatar: (user.email?.[0] || 'A').toUpperCase(),
      teamId: user.reporting_to
  } : {} as any;

  return (
    <div className="flex flex-col h-full bg-slate-50">
        {/* HEADER ALWAYS VISIBLE */}
        <div className="bg-white border-b border-slate-200 px-6 py-2 flex items-center justify-between shadow-sm shrink-0 z-20">
            <div className="flex items-center gap-1 overflow-x-auto">
                <NavButton active={activeView === 'dashboard'} onClick={() => setActiveView('dashboard')} icon="📊" label="Dashboard" />
                <NavButton active={activeView === 'users'} onClick={() => setActiveView('users')} icon="👥" label="Team Roster" />
                <NavButton active={activeView === 'settings'} onClick={() => setActiveView('settings')} icon="⚙️" label="Configuration" />
                <NavButton active={activeView === 'billing'} onClick={() => setActiveView('billing')} icon="💳" label="Billing" />
                <NavButton active={activeView === 'ai'} onClick={() => setActiveView('ai')} icon="🧠" label="AI Brain" />
            </div>
            
            <div className="flex gap-2">
                <button 
                    onClick={() => setShowDiagnostics(true)} 
                    className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-indigo-200 hover:bg-indigo-100 transition-colors flex items-center gap-1"
                >
                    <span>🩺</span> Save Logs
                </button>

                <button 
                    onClick={() => setShowDbRepair(true)} 
                    className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-red-200 hover:bg-red-100 transition-colors flex items-center gap-1 shadow-sm"
                >
                    <span>🛠️</span> DB Repair
                </button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto">
            {loading ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
                    <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    <div>Loading Agency Control...</div>
                    <div className="text-xs bg-slate-100 px-3 py-1 rounded">If data is large, this may take 10-20 seconds.</div>
                </div>
            ) : (
                <>
                    {activeView === 'dashboard' && (
                        <DirectorDashboard 
                            clients={clients} 
                            advisors={advisors}
                            teams={teams}
                            currentUser={currentAdvisor}
                            activities={activities}
                            products={products}
                            onUpdateClient={async (c) => { await db.saveClient(c); loadAdminData(); }}
                            onImport={handleClientImport}
                            onUpdateAdvisor={handleUpdateAdvisor}
                        />
                    )}
                    {activeView === 'users' && (
                        <div className="p-6">
                            <UserManagement 
                                advisors={advisors}
                                teams={teams}
                                currentUser={currentAdvisor}
                                onUpdateAdvisor={handleUpdateAdvisor}
                                onDeleteAdvisor={handleDeleteAdvisor}
                                onUpdateTeams={(newTeams) => handleUpdateSettings({ teams: newTeams })}
                                onAddAdvisor={handleAddAdvisor}
                            />
                        </div>
                    )}
                    {activeView === 'settings' && (
                        <AdminSettings 
                            products={products}
                            settings={settings}
                            advisors={advisors}
                            onUpdateProducts={(p) => handleUpdateSettings({ products: p })}
                            onUpdateSettings={(s) => handleUpdateSettings({ appSettings: s })}
                            onUpdateAdvisors={(advs) => { loadAdminData(); }}
                        />
                    )}
                    {activeView === 'billing' && (
                        <SubscriptionManager 
                            subscription={subscription}
                            onUpdateSubscription={(s) => handleUpdateSettings({ subscription: s })}
                            currentUser={currentAdvisor}
                            onUpdateUser={handleUpdateAdvisor}
                        />
                    )}
                    {activeView === 'ai' && <AiKnowledgeManager />}
                </>
            )}
        </div>

        <DbRepairModal isOpen={showDbRepair} onClose={() => setShowDbRepair(false)} />
        <SaveDiagnosticsModal isOpen={showDiagnostics} onClose={() => setShowDiagnostics(false)} />
    </div>
  );
};

const NavButton = ({ active, onClick, icon, label }: any) => (
    <button 
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${active ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
    >
        <span>{icon}</span> {label}
    </button>
);

export default AdminTab;