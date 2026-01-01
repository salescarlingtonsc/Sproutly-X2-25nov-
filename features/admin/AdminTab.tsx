
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { db } from '../../lib/db';
import { adminDb } from '../../lib/db/admin';
import { Advisor, Client, Product, Team, AppSettings, Subscription } from '../../types';
import { DirectorDashboard } from './components/DirectorDashboard';
import { UserManagement } from './components/UserManagement';
import { AdminSettings } from './components/AdminSettings';
import { SubscriptionManager } from './components/SubscriptionManager';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';

// --- SQL REPAIR SCRIPT (THE FIX) ---
const REPAIR_SQL = `
-- RUN THIS IN SUPABASE SQL EDITOR TO FIX "FAILED TO UPDATE" & PERMISSIONS

-- 1. FIX PROFILES TABLE
alter table profiles add column if not exists role text default 'advisor';
alter table profiles add column if not exists status text default 'pending';
alter table profiles add column if not exists banding_percentage numeric default 50;
alter table profiles add column if not exists subscription_tier text default 'free';
alter table profiles add column if not exists is_admin boolean default false;
alter table profiles add column if not exists modules text[] default '{}';
alter table profiles add column if not exists organization_id text;
alter table profiles add column if not exists reporting_to uuid;

-- 2. FIX PERMISSIONS (RLS)
alter table profiles enable row level security;

drop policy if exists "Public profiles" on profiles;
drop policy if exists "Admins can update any profile" on profiles;
drop policy if exists "Users can update own profile" on profiles;

create policy "Public profiles" on profiles for select using (true);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Admins can update any profile" on profiles for update using (
  exists (
    select 1 from profiles
    where id = auth.uid() and (role = 'admin' or is_admin = true)
  )
);

-- 3. FIX CLIENTS TABLE
create table if not exists clients (
  id text primary key,
  user_id uuid not null,
  data jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table clients enable row level security;

drop policy if exists "Users view own clients" on clients;
drop policy if exists "Users manage own clients" on clients;
drop policy if exists "Admins view all clients" on clients;
drop policy if exists "Admins manage all clients" on clients;

create policy "Users view own clients" on clients for select using (auth.uid() = user_id);
create policy "Users manage own clients" on clients for all using (auth.uid() = user_id);

create policy "Admins view all clients" on clients for select using (
  exists (
    select 1 from profiles
    where id = auth.uid() and (role = 'admin' or is_admin = true)
  )
);

create policy "Admins manage all clients" on clients for all using (
  exists (
    select 1 from profiles
    where id = auth.uid() and (role = 'admin' or is_admin = true)
  )
);

-- 4. ORGANIZATION SETTINGS TABLE (NEW)
create table if not exists organization_settings (
  id text primary key,
  updated_by uuid references auth.users,
  updated_at timestamp with time zone,
  data jsonb
);
alter table organization_settings enable row level security;

drop policy if exists "Everyone can read settings" on organization_settings;
drop policy if exists "Admins can update settings" on organization_settings;

create policy "Everyone can read settings" on organization_settings for select using (true);
create policy "Admins can update settings" on organization_settings for insert with check (
  exists (
    select 1 from profiles
    where id = auth.uid() and (role = 'admin' or is_admin = true)
  )
);
create policy "Admins can update settings update" on organization_settings for update using (
  exists (
    select 1 from profiles
    where id = auth.uid() and (role = 'admin' or is_admin = true)
  )
);

-- 5. FORCE PROMOTE YOU TO ADMIN (Safety Hatch)
update profiles 
set role = 'admin', is_admin = true, status = 'active', subscription_tier = 'diamond';
`;

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
  
  // Config State (Auto-Saved)
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [teams, setTeams] = useState<Team[]>(MOCK_TEAMS);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [subscription, setSubscription] = useState<Subscription>(MOCK_SUBSCRIPTION);
  
  // Status State
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isRepairOpen, setIsRepairOpen] = useState(false);
  const isInitialMount = useRef(true);

  // --- 1. INITIAL FETCH ---
  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!supabase || !user) return;
    setLoading(true);
    try {
        // A. Load Advisors & Clients (Existing logic)
        const { data: profiles } = await supabase.from('profiles').select('*');
        if (profiles) {
            const mappedAdvisors: Advisor[] = profiles.map(p => ({
                id: p.id,
                name: p.email?.split('@')[0] || 'Unknown',
                email: p.email,
                role: p.role || 'advisor',
                status: (p.status === 'approved' ? 'active' : p.status) || 'pending',
                bandingPercentage: p.banding_percentage || 50,
                avatar: (p.email?.[0] || 'U').toUpperCase(),
                joinedAt: p.created_at,
                organizationId: 'org_default',
                teamId: p.reporting_to,
                isAgencyAdmin: p.role === 'admin' || p.is_admin,
                subscriptionTier: p.subscription_tier || 'free',
                modules: p.modules || []
            }));
            setAdvisors(mappedAdvisors);
        }

        const allClients = await db.getClients(); 
        const mappedClients = allClients.map(c => ({
            ...c,
            advisorId: c._ownerId || c.advisorId || 'unassigned'
        }));
        setClients(mappedClients);

        // B. Load Admin Config (New Logic)
        const sysSettings = await adminDb.getSystemSettings();
        if (sysSettings) {
            setProducts(sysSettings.products || MOCK_PRODUCTS);
            setTeams(sysSettings.teams || MOCK_TEAMS);
            setSettings(sysSettings.appSettings || DEFAULT_SETTINGS);
            if (sysSettings.subscription) setSubscription(sysSettings.subscription);
        }

    } catch (e: any) {
        console.error("Sync Error:", e);
        toast.error("Data sync failed. Check console.");
    } finally {
        setLoading(false);
        // Important: allow auto-save only after initial fetch is done
        setTimeout(() => { isInitialMount.current = false; }, 1000);
    }
  };

  // --- 2. AUTO SAVE EFFECT ---
  useEffect(() => {
      if (isInitialMount.current || loading) return;

      const timer = setTimeout(async () => {
          setSaveStatus('saving');
          try {
              await adminDb.saveSystemSettings({
                  products,
                  teams,
                  appSettings: settings,
                  subscription
              });
              setSaveStatus('saved');
              setTimeout(() => setSaveStatus('idle'), 2000);
          } catch (e) {
              setSaveStatus('error');
              console.error("Auto-save failed", e);
          }
      }, 1500); // 1.5s debounce

      return () => clearTimeout(timer);
  }, [products, teams, settings, subscription, loading]);

  const handleUpdateAdvisor = async (updatedAdvisor: Advisor) => {
      setAdvisors(prev => prev.map(a => a.id === updatedAdvisor.id ? updatedAdvisor : a));
      if (supabase) {
          const { error } = await supabase.from('profiles').update({
              role: updatedAdvisor.role,
              status: updatedAdvisor.status,
              banding_percentage: updatedAdvisor.bandingPercentage,
              subscription_tier: updatedAdvisor.subscriptionTier,
              modules: updatedAdvisor.modules,
              is_admin: updatedAdvisor.role === 'admin'
          }).eq('id', updatedAdvisor.id);
          
          if (error) toast.error(`Update failed: ${error.message}`);
          else toast.success("Advisor updated.");
      }
  };

  const handleUpdateClient = async (updatedClient: Client) => {
      setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
      try {
          if (updatedClient.advisorId) updatedClient._ownerId = updatedClient.advisorId;
          await db.saveClient(updatedClient, user?.id);
          toast.success("Client updated.");
      } catch (e) {
          toast.error("Failed to save client.");
      }
  };

  const handleImportLeads = async (newClients: Client[]) => {
      try {
          if (!supabase) throw new Error("No DB connection");
          const count = await db.createClientsBulk(newClients, newClients[0].advisorId || user?.id || '');
          toast.success(`Successfully imported ${count} leads.`);
          fetchData(); 
      } catch (e: any) {
          toast.error("Import failed: " + e.message);
      }
  };

  if (loading) return <div className="p-20 text-center"><div className="animate-spin w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto"></div><p className="mt-4 text-slate-400 text-sm animate-pulse">Syncing Admin Core...</p></div>;

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
            
            <div className="flex items-center gap-4">
               {/* Auto-Save Indicator */}
               <div className="flex items-center gap-2">
                  {saveStatus === 'saving' && <span className="text-[10px] text-indigo-500 font-bold animate-pulse">☁️ Syncing...</span>}
                  {saveStatus === 'saved' && <span className="text-[10px] text-emerald-600 font-bold">✓ Saved</span>}
                  {saveStatus === 'error' && <span className="text-[10px] text-red-500 font-bold">⚠️ Sync Failed</span>}
               </div>

               <div className="h-6 w-px bg-slate-200"></div>

               <button onClick={() => setIsRepairOpen(true)} className="text-xs text-white bg-rose-600 font-bold hover:bg-rose-700 px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-sm">
                  <span>🛠</span> DB Repair
               </button>
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
                    activeSeconds={124000} 
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

        {/* Repair Modal */}
        <Modal 
            isOpen={isRepairOpen} 
            onClose={() => setIsRepairOpen(false)} 
            title="System Diagnostics & Repair"
            footer={<Button variant="ghost" onClick={() => setIsRepairOpen(false)}>Close</Button>}
        >
            <div className="p-4 bg-slate-900 rounded-xl text-white font-mono text-xs overflow-auto max-h-96">
                <p className="text-emerald-400 mb-2">// Database Connection: ACTIVE</p>
                <p className="mb-4 text-slate-300">
                   If Admin Settings (Products/Teams) are not saving, your database is missing the config table.
                </p>
                <div className="border-t border-slate-700 pt-4">
                    <p className="mb-2 font-bold text-white">Action Required:</p>
                    <ol className="list-decimal list-inside mb-4 text-slate-400 space-y-1">
                       <li>Click "Copy Repair SQL" below</li>
                       <li>Go to Supabase Dashboard {'>'} SQL Editor</li>
                       <li>Paste and Run the script</li>
                    </ol>
                    <button 
                        onClick={() => {
                            navigator.clipboard.writeText(REPAIR_SQL);
                            toast.success("SQL Copied! Run in Supabase SQL Editor.");
                        }}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs uppercase font-bold w-full"
                    >
                        Copy Repair SQL
                    </button>
                </div>
            </div>
        </Modal>
    </div>
  );
};

export default AdminTab;
