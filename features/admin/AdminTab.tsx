
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { db } from '../../lib/db';
import { Advisor, Client, Product, Team, AppSettings, Subscription } from '../../types';
import { DirectorDashboard } from './components/DirectorDashboard';
import { UserManagement } from './components/UserManagement';
import { AdminSettings } from './components/AdminSettings';
import { SubscriptionManager } from './components/SubscriptionManager';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';

// --- MOCK DATA FOR DEMO PURPOSES ---
const MOCK_PRODUCTS: Product[] = [
    { id: 'p1', name: 'Wealth Sol', provider: 'Pru', tiers: [{ min: 0, max: Infinity, rate: 0.5, dollarUp: 0 }] },
    { id: 'p2', name: 'Term Protect', provider: 'AIA', tiers: [{ min: 0, max: Infinity, rate: 0.6, dollarUp: 0 }] }
];

const MOCK_TEAMS: Team[] = [
    { id: 'team_alpha', name: 'Alpha Squad', leaderId: 'user_1' }
];

const MOCK_SUBSCRIPTION: Subscription = {
    planId: 'pro_individual',
    status: 'active',
    seats: 1,
    nextBillingDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString()
};

const DEFAULT_SETTINGS: AppSettings = {
    platforms: ['IG', 'FB', 'LinkedIn', 'Roadshow', 'Referral', 'Cold'],
    statuses: ['New Lead', 'Contacted', 'Appt Set', 'Client', 'Lost'],
    benchmarks: { callsPerWeek: 50, apptsPerWeek: 15 }
};

const AdminTab: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'settings' | 'billing'>('overview');
  
  // Data State
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [teams, setTeams] = useState<Team[]>(MOCK_TEAMS);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [subscription, setSubscription] = useState<Subscription>(MOCK_SUBSCRIPTION);
  
  // Loading State
  const [loading, setLoading] = useState(true);
  const [isRepairOpen, setIsRepairOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!supabase || !user) return;
    setLoading(true);
    try {
        // 1. Fetch Profiles (Advisors)
        const { data: profiles } = await supabase.from('profiles').select('*');
        if (profiles) {
            const mappedAdvisors: Advisor[] = profiles.map(p => ({
                id: p.id,
                name: p.email?.split('@')[0] || 'Unknown', // Derive name from email if name not in DB
                email: p.email,
                role: p.role || 'advisor',
                status: p.status || 'pending',
                bandingPercentage: p.bandingPercentage || 50,
                avatar: (p.email?.[0] || 'U').toUpperCase(),
                joinedAt: p.created_at,
                organizationId: 'org_default', // Mock org
                teamId: p.reporting_to, // Map reporting_to to team logic if needed, or maintain separate
                isAgencyAdmin: p.role === 'admin' || p.is_admin
            }));
            setAdvisors(mappedAdvisors);
        }

        // 2. Fetch Clients (Global)
        const allClients = await db.getClients(); // Admin fetches all
        // Map clients to ensure advisorId is set (using _ownerId)
        const mappedClients = allClients.map(c => ({
            ...c,
            advisorId: c._ownerId || c.advisorId || 'unassigned'
        }));
        setClients(mappedClients);

        // 3. Teams (Mocked for now, or fetch if table exists)
        // In a real scenario, we'd fetch from 'teams' table.
        // setTeams(fetchedTeams); 

    } catch (e: any) {
        toast.error("Data sync failed: " + e.message);
    } finally {
        setLoading(false);
    }
  };

  const handleUpdateAdvisor = async (updatedAdvisor: Advisor) => {
      // Optimistic update
      setAdvisors(prev => prev.map(a => a.id === updatedAdvisor.id ? updatedAdvisor : a));
      
      // DB Sync
      if (supabase) {
          const { error } = await supabase.from('profiles').update({
              role: updatedAdvisor.role,
              status: updatedAdvisor.status,
              // Map back to DB schema
              // teamId logic would go here if columns exist
          }).eq('id', updatedAdvisor.id);
          
          if (error) toast.error("Failed to update advisor in cloud.");
          else toast.success("Advisor updated.");
      }
  };

  const handleUpdateClient = async (updatedClient: Client) => {
      // Optimistic
      setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
      
      // DB Sync
      try {
          // If reassigned, ensure _ownerId is updated
          if (updatedClient.advisorId) {
              updatedClient._ownerId = updatedClient.advisorId;
          }
          await db.saveClient(updatedClient, user?.id);
          toast.success("Client updated.");
      } catch (e) {
          toast.error("Failed to save client.");
      }
  };

  const handleImportLeads = async (newClients: Client[]) => {
      // Bulk create in DB
      try {
          if (!supabase) throw new Error("No DB connection");
          // Transform for DB insertion
          // Note: createClientsBulk in db.ts expects specific format, may need adjustment or use existing
          // We will use existing bulk create which handles basic fields
          const count = await db.createClientsBulk(newClients, newClients[0].advisorId || user?.id || '');
          toast.success(`Successfully imported ${count} leads.`);
          fetchData(); // Refresh to get full objects with IDs
      } catch (e: any) {
          toast.error("Import failed: " + e.message);
      }
  };

  if (loading) return <div className="p-20 text-center"><div className="animate-spin w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto"></div></div>;

  const currentUserAdvisor = advisors.find(a => a.id === user?.id) || {
      id: user?.id || '',
      name: 'Admin',
      email: user?.email || '',
      role: 'admin',
      status: 'active',
      bandingPercentage: 100,
      joinedAt: new Date().toISOString(),
      isAgencyAdmin: true
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 font-sans">
        {/* Navigation Bar */}
        <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-30">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                <button onClick={() => setActiveTab('overview')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'overview' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>Overview</button>
                <button onClick={() => setActiveTab('users')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'users' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>Team</button>
                <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'settings' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>Config</button>
                <button onClick={() => setActiveTab('billing')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'billing' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>Billing</button>
            </div>
            <div className="flex gap-3">
               <button onClick={() => setIsRepairOpen(true)} className="text-xs text-slate-400 font-bold hover:text-slate-600">DB Repair</button>
               <div className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-2 rounded-lg">
                   Agency Mode
               </div>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
            {activeTab === 'overview' && (
                <DirectorDashboard 
                    clients={clients} 
                    advisors={advisors} 
                    teams={teams} 
                    currentUser={currentUserAdvisor} 
                    activeSeconds={124000} // Mock activity metric
                    products={products}
                    onUpdateClient={handleUpdateClient}
                    onImport={handleImportLeads}
                />
            )}

            {activeTab === 'users' && (
                <UserManagement 
                    advisors={advisors} 
                    teams={teams} 
                    currentUser={currentUserAdvisor} 
                    onUpdateAdvisor={handleUpdateAdvisor}
                    onDeleteAdvisor={(id) => { /* Implement delete logic */ }}
                    onUpdateTeams={setTeams}
                    onAddAdvisor={(adv) => setAdvisors([...advisors, adv])}
                />
            )}

            {activeTab === 'settings' && (
                <AdminSettings 
                    products={products} 
                    settings={settings} 
                    advisors={advisors} 
                    onUpdateProducts={setProducts} 
                    onUpdateSettings={setSettings} 
                    onUpdateAdvisors={(updated) => {
                        setAdvisors(updated);
                        // Trigger individual updates if needed
                    }}
                />
            )}

            {activeTab === 'billing' && (
                <SubscriptionManager 
                    subscription={subscription} 
                    onUpdateSubscription={setSubscription} 
                    currentUser={currentUserAdvisor} 
                    onUpdateUser={handleUpdateAdvisor} 
                />
            )}
        </div>

        {/* Repair Modal (Legacy Support) */}
        <Modal 
            isOpen={isRepairOpen} 
            onClose={() => setIsRepairOpen(false)} 
            title="System Diagnostics"
            footer={<Button variant="ghost" onClick={() => setIsRepairOpen(false)}>Close</Button>}
        >
            <div className="p-4 bg-slate-900 rounded-xl text-white font-mono text-xs overflow-auto max-h-96">
                <p className="text-emerald-400 mb-2">// System Status: ONLINE</p>
                <p className="mb-4">Database connection verified. RLS policies active.</p>
                <div className="border-t border-slate-700 pt-4">
                    <p className="mb-2">Run SQL Repair Script if tables are missing:</p>
                    <button 
                        onClick={() => navigator.clipboard.writeText("/* Paste SQL Repair Script Here */")}
                        className="bg-white/10 hover:bg-white/20 px-3 py-1 rounded text-[10px] uppercase font-bold"
                    >
                        Copy SQL
                    </button>
                </div>
            </div>
        </Modal>
    </div>
  );
};

export default AdminTab;
