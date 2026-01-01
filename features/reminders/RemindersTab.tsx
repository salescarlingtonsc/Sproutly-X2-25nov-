
import React, { useState, useEffect } from 'react';
import { db } from '../../lib/db';
import { Client } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import ClientDrawer from '../crm/components/ClientDrawer';
import { useToast } from '../../contexts/ToastContext';

const RemindersTab: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  
  // Drawer State
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    refreshData();
  }, [user]);

  const refreshData = () => {
    if (user) {
      db.getClients(user.id).then(setClients);
    }
  };

  const handleOpenClient = (client: Client) => {
    setSelectedClient(client);
    setIsDrawerOpen(true);
  };

  const handleUpdateClient = async (id: string, field: string, value: any, section: string = 'root') => {
    if (!selectedClient) return;
    
    const updatedClient = { ...selectedClient };
    
    if (section === 'root') {
        (updatedClient as any)[field] = value;
    } else if (section === 'profile') {
        updatedClient.profile = { ...updatedClient.profile, [field]: value };
    } else if (section === 'followUp') {
        updatedClient.followUp = { ...updatedClient.followUp, [field]: value };
    } else if (section === 'appointments') {
        updatedClient.appointments = { ...updatedClient.appointments, [field]: value };
    }

    // Optimistic Update
    setSelectedClient(updatedClient);
    setClients(prev => prev.map(c => c.id === id ? updatedClient : c));

    try {
        await db.saveClient(updatedClient);
    } catch (e) {
        toast.error("Failed to save changes");
    }
  };

  const handleWhatsApp = (e: React.MouseEvent, client: Client) => {
    e.stopPropagation();
    const phone = client.profile.phone?.replace(/\D/g, '') || '';
    if (!phone) {
        toast.error("No phone number found");
        return;
    }
    const url = `https://wa.me/${phone}`;
    window.open(url, '_blank');
  };

  const now = new Date();
  const currentMonth = now.getMonth();

  // --- FILTERS ---

  // 1. Birthdays
  const birthdayReminders = clients.filter(c => {
    const checkBirthday = (dobStr?: string) => {
        if (!dobStr) return false;
        const d = new Date(dobStr);
        return d.getMonth() === currentMonth;
    };
    return checkBirthday(c.profile.dob) || (c.familyMembers || []).some(f => checkBirthday(f.dob));
  });

  // 2. Immediate Attention (NPU Overdue)
  const npuOverdue = clients.filter(c => {
    if (!c.followUp.status?.includes('NPU')) return false;
    const lastDate = c.followUp.lastContactedAt || c.lastUpdated;
    const daysSince = (now.getTime() - new Date(lastDate).getTime()) / (1000 * 3600 * 24);
    if (c.followUp.status === 'NPU 1') return daysSince > 2; // Strict for NPU 1
    return daysSince > 5; // Looser for others
  });

  // 3. Pending Decision
  const pendingOverdue = clients.filter(c => {
    if (c.followUp.status !== 'pending_decision' && c.followUp.status !== 'Pending Decision') return false;
    const lastDate = c.followUp.lastContactedAt || c.lastUpdated;
    const daysSince = (now.getTime() - new Date(lastDate).getTime()) / (1000 * 3600 * 24);
    return daysSince > 3;
  });

  // 4. Appointments (Next 48h)
  const appointments = clients.filter(c => {
      if (!c.appointments?.firstApptDate) return false;
      const apptDate = new Date(c.appointments.firstApptDate);
      const diff = (apptDate.getTime() - now.getTime()) / (1000 * 3600 * 24);
      return diff >= 0 && diff <= 2;
  });

  const ReminderCard = ({ title, items, colorClass, icon, badgeColor }: any) => (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full`}>
        <div className={`px-5 py-4 border-b border-slate-100 flex items-center gap-3 ${colorClass}`}>
            <div className={`p-2 rounded-lg bg-white/20`}>{icon}</div>
            <div>
                <h3 className="font-bold text-sm">{title}</h3>
                <p className="text-[10px] opacity-80 uppercase tracking-wider font-bold">Action Required</p>
            </div>
            <span className="ml-auto bg-white text-slate-900 px-3 py-1 rounded-full text-xs font-black shadow-sm">{items.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto max-h-[300px] custom-scrollbar">
            {items.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs italic flex flex-col items-center">
                    <span className="text-2xl mb-2 opacity-30">✨</span>
                    All caught up.
                </div>
            ) : (
                <div className="divide-y divide-slate-50">
                    {items.map((c: Client) => (
                        <div 
                            key={c.id} 
                            onClick={() => handleOpenClient(c)}
                            className="p-4 hover:bg-slate-50 transition-all cursor-pointer group flex items-center justify-between"
                        >
                            <div className="flex-1 min-w-0 pr-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <p className="text-sm font-bold text-slate-800 truncate">{c.profile.name || c.name}</p>
                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${badgeColor || 'bg-slate-100 text-slate-500'}`}>
                                        {c.followUp.status?.replace('_', ' ') || 'New'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-slate-500">
                                    <span className="flex items-center gap-1">
                                        <span className="opacity-50">📞</span> {c.profile.phone || '-'}
                                    </span>
                                    <span className="text-slate-300">•</span>
                                    <span className="opacity-70 italic">Last: {new Date(c.followUp.lastContactedAt || c.lastUpdated).toLocaleDateString()}</span>
                                </div>
                            </div>
                            
                            <button 
                                onClick={(e) => handleWhatsApp(e, c)}
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-50 text-emerald-600 opacity-0 group-hover:opacity-100 transition-all hover:bg-emerald-500 hover:text-white hover:scale-110 shadow-sm"
                                title="Quick WhatsApp"
                            >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.025 3.312l-.542 2.01 2.036-.53c.96.514 1.95.787 3.25.788h.003c3.181 0 5.767-2.586 5.768-5.766 0-3.18-2.587-5.766-5.768-5.766h-.004zm3.003 8.3c-.12.33-.7.63-1.01.69-.24.05-.55.08-1.53-.33-1.3-.54-2.12-1.85-2.19-1.94-.06-.09-.54-.72-.54-1.37s.34-.97.46-1.1c.12-.13.27-.16.36-.16s.18.01.26.01.21-.04.33.25c.12.29.41 1.01.45 1.09.04.08.07.17.01.28-.06.11-.09.18-.18.29-.06.11-.09.18-.18.29-.09.11-.18.23-.26.3-.09.08-.18.17-.08.34.1.17.44.73.94 1.18.64.57 1.18.75 1.35.83.17.08.27.07.37-.04.1-.11.43-.51.55-.68.12-.17.23-.15.39-.09.16.06 1.03.49 1.2.58.17.09.28.14.32.2.04.06.04.35-.08.68z"/></svg>
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in space-y-8 pb-24">
        
        <div className="flex justify-between items-end">
            <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">Daily Pulse</h1>
                <p className="text-slate-500 font-medium text-sm mt-1">Focus on what moves the needle today.</p>
            </div>
            <button onClick={refreshData} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-2 rounded-lg hover:bg-indigo-100 transition-colors">
                ↻ Refresh
            </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ReminderCard 
                title="Immediate Attention (NPU)" 
                items={npuOverdue} 
                colorClass="bg-rose-500 text-white" 
                badgeColor="bg-rose-100 text-rose-700"
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} 
            />
            <ReminderCard 
                title="Pending Decisions" 
                items={pendingOverdue} 
                colorClass="bg-amber-500 text-white" 
                badgeColor="bg-amber-100 text-amber-700"
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} 
            />
            <ReminderCard 
                title="Appointments (48h)" 
                items={appointments} 
                colorClass="bg-indigo-600 text-white" 
                badgeColor="bg-indigo-100 text-indigo-700"
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} 
            />
            <ReminderCard 
                title="Birthdays & Milestones" 
                items={birthdayReminders} 
                colorClass="bg-purple-600 text-white" 
                badgeColor="bg-purple-100 text-purple-700"
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 15.546c-.523 0-1.046.151-1.5.454a2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.701 2.701 0 00-1.5-.454M9 6v2m3-2v2m3-2v2M9 3h.01M12 3h.01M15 3h.01M21 21v-7a2 2 0 00-2-2H5a2 2 0 00-2 2v7h18zm-3-9v-2a2 2 0 00-2-2H8a2 2 0 00-2 2v2h12z" /></svg>} 
            />
        </div>

        {/* Client Management Drawer Integration */}
        {selectedClient && (
            <ClientDrawer 
                isOpen={isDrawerOpen}
                onClose={() => { setIsDrawerOpen(false); setSelectedClient(null); refreshData(); }}
                client={selectedClient}
                onUpdateField={handleUpdateClient}
                onStatusUpdate={(c, s) => handleUpdateClient(c.id, 'status', s, 'followUp')}
                onOpenFullProfile={() => { /* Navigate to Profile Logic */ }}
                onDelete={() => {}} // Read-only here mostly, prevention of accidental delete
            />
        )}
    </div>
  );
};

export default RemindersTab;
