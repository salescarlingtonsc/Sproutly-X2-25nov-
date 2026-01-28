import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/db';
import { Client, Product, Sale, ContactStatus } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useClient } from '../../contexts/ClientContext';
import { logActivity } from '../../lib/db/activities';
import { adminDb } from '../../lib/db/admin';
import { supabase } from '../../lib/supabase';
import { ClientCard } from '../crm/components/ClientCard';
import PageHeader from '../../components/layout/PageHeader';

const RemindersTab: React.FC = () => {
  const { user } = useAuth();
  const { loadClient } = useClient(); 
  const toast = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [advisorMap, setAdvisorMap] = useState<Record<string, string>>({});
  
  const [advisorFilter, setAdvisorFilter] = useState<string>('All');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [saleClient, setSaleClient] = useState<Client | null>(null);

  useEffect(() => {
    refreshData();
    const fetchConfig = async () => {
        const settings = await adminDb.getSystemSettings(user?.organizationId);
        if (settings?.products) setProducts(settings.products);
    };
    fetchConfig();

    const onFocus = () => refreshData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [user]);

  useEffect(() => {
      if (selectedClient && clients.length > 0) {
          const fresh = clients.find(c => c.id === selectedClient.id);
          if (fresh) {
              const freshTime = new Date(fresh.lastUpdated || 0).getTime();
              const currTime = new Date(selectedClient.lastUpdated || 0).getTime();
              if (freshTime >= currTime && JSON.stringify(fresh) !== JSON.stringify(selectedClient)) {
                  setSelectedClient(fresh);
                  loadClient(fresh);
              }
          }
      }
  }, [clients]);

  useEffect(() => {
    const resolveAdvisorProfiles = async () => {
        if (!supabase || clients.length === 0) return;
        const uniqueIds = new Set<string>();
        clients.forEach(c => { if (c._ownerId) uniqueIds.add(c._ownerId); });
        if (uniqueIds.size === 0) return;
        try {
            const { data } = await supabase.from('profiles').select('id, name, email').in('id', Array.from(uniqueIds));
            if (data) {
                const newMap: Record<string, string> = {};
                data.forEach(p => {
                    let displayLabel = p.email || 'Unknown';
                    if (p.name && p.name.trim() !== '') displayLabel = p.name;
                    newMap[p.id] = displayLabel;
                });
                setAdvisorMap(newMap);
            }
        } catch (e) {}
    };
    resolveAdvisorProfiles();
  }, [clients]);

  const refreshData = () => {
    if (user) {
      db.getClients(user.id).then(setClients);
    }
  };

  const availableAdvisors = useMemo(() => {
      const map = new Map<string, string>();
      clients.forEach(c => {
          if (c._ownerId) {
              let name = advisorMap[c._ownerId] || c._ownerEmail || `Advisor ${c._ownerId.slice(0,4)}`;
              map.set(c._ownerId, name);
          }
      });
      return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, advisorMap]);

  const filteredClients = useMemo(() => {
      if (advisorFilter === 'All') return clients;
      return clients.filter(c => c._ownerId === advisorFilter);
  }, [clients, advisorFilter]);

  const handleOpenClient = (client: Client) => {
    setSelectedClient(client);
    loadClient(client); 
  };

  const handleUpdateClient = (updatedC: Client) => {
      setClients(prev => prev.map(old => old.id === updatedC.id ? updatedC : old));
      setSelectedClient(updatedC);
      loadClient(updatedC);
      db.saveClient(updatedC);
  };

  const isContactedToday = (client: Client) => {
      if (!client.lastContact) return false;
      const contact = new Date(client.lastContact);
      const today = new Date();
      return contact.getDate() === today.getDate() && 
             contact.getMonth() === today.getMonth() && 
             contact.getFullYear() === today.getFullYear();
  };

  const handleMarkWished = async (e: React.MouseEvent, client: Client) => {
      e.stopPropagation();
      const isAlreadyWished = isContactedToday(client);
      const now = new Date().toISOString();
      
      const updatedClient = {
          ...client,
          lastContact: isAlreadyWished ? "" : now,
          lastUpdated: now,
          notes: [{ 
            id: `wish_manual_${Date.now()}`, 
            content: isAlreadyWished ? 'Unmarked Birthday Wish' : 'Marked as Birthday Wished (Manual)', 
            date: now, 
            author: 'System' 
          }, ...(client.notes || [])]
      };
      handleUpdateClient(updatedClient);
      toast.success(isAlreadyWished ? "Unchecked!" : "Checked off!");
  };

  const handleDismissAppt = async (e: React.MouseEvent, client: Client) => {
      e.stopPropagation();
      const now = new Date().toISOString();
      const updatedClient = {
          ...client,
          appointments: { ...client.appointments, firstApptDate: '' },
          lastUpdated: now,
          notes: [{ 
            id: `appt_cleared_${Date.now()}`, 
            content: 'Appointment cleared from Action Center.', 
            date: now, 
            author: 'System' 
          }, ...(client.notes || [])]
      };
      await db.saveClient(updatedClient);
      handleUpdateClient(updatedClient);
      toast.success("Appointment cleared!");
  };

  const handleWhatsApp = async (e: React.MouseEvent, client: Client, isBirthday: boolean = false) => {
    e.stopPropagation();
    const phone = client.profile.phone?.replace(/\D/g, '') || '';
    if (!phone) { toast.error("No phone number found"); return; }
    
    let text = isBirthday ? `Happy Birthday ${client.profile.name.split(' ')[0]}! 🎂 Wishing you a fantastic year ahead!` : '';
    const url = `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
    
    if (isBirthday) {
        const now = new Date().toISOString();
        const updatedClient = {
            ...client,
            lastContact: now,
            lastUpdated: now,
            notes: [{ id: `wish_${Date.now()}`, content: 'Sent Birthday Wish 🎂', date: now, author: 'System' }, ...(client.notes || [])]
        };
        await db.saveClient(updatedClient);
        handleUpdateClient(updatedClient);
    }
    
    setTimeout(() => { window.open(url, '_blank'); }, 200);
  };

  const now = new Date();
  const currentMonth = now.getMonth();

  const birthdayReminders = useMemo(() => filteredClients.filter(c => {
    // FIX: Added optional chaining to followUp to prevent crash if object is missing
    const s = c.followUp?.status || 'new';
    if (s === 'new' || s.startsWith('npu') || s === 'not_keen') return false;

    const checkBirthday = (dobStr?: string) => {
        if (!dobStr) return false;
        const d = new Date(dobStr);
        return d.getMonth() === currentMonth;
    };
    return checkBirthday(c.profile.dob) || (c.familyMembers || []).some(f => checkBirthday(f.dob));
  }).sort((a, b) => {
      const dayA = new Date(a.profile.dob || '').getDate() || 32;
      const dayB = new Date(b.profile.dob || '').getDate() || 32;
      return dayA - dayB;
  }), [filteredClients, currentMonth]);

  const untouchedLeads = useMemo(() => filteredClients.filter(c => {
    // FIX: Added optional chaining to followUp to prevent crash if object is missing
    const s = c.followUp?.status;
    const isTargetStage = s === 'new' || (s && s.startsWith('npu'));
    if (!isTargetStage) return false;
    const lastActivity = c.followUp?.lastContactedAt || c.lastUpdated;
    const lastDate = lastActivity ? new Date(lastActivity) : new Date(0); 
    const diffTime = now.getTime() - lastDate.getTime();
    const diffDays = diffTime / (1000 * 3600 * 24);
    return diffDays > 2;
  }).sort((a,b) => {
      const dateA = new Date(a.followUp?.lastContactedAt || a.lastUpdated).getTime();
      const dateB = new Date(b.followUp?.lastContactedAt || b.lastUpdated).getTime();
      return dateA - dateB; 
  }), [filteredClients, now]);

  const pendingOverdue = useMemo(() => filteredClients.filter(c => {
    // FIX: Added optional chaining to followUp to prevent crash if object is missing
    if (c.followUp?.status !== 'pending_decision') return false;
    const lastDate = c.followUp?.lastContactedAt || c.lastUpdated;
    const daysSince = (now.getTime() - new Date(lastDate).getTime()) / (1000 * 3600 * 24);
    return daysSince > 3; 
  }), [filteredClients, now]);

  const appointments = useMemo(() => filteredClients.filter(c => {
      if (!c.appointments?.firstApptDate) return false;
      const apptDate = new Date(c.appointments.firstApptDate);
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      return apptDate.getTime() <= endOfToday.getTime(); 
  }).sort((a,b) => new Date(a.appointments.firstApptDate).getTime() - new Date(b.appointments.firstApptDate).getTime()), [filteredClients]);

  const followUpTasks = useMemo(() => filteredClients.filter(c => {
      if (!c.followUp?.nextFollowUpDate) return false;
      const target = new Date(c.followUp.nextFollowUpDate);
      target.setHours(0,0,0,0);
      const today = new Date(); today.setHours(0,0,0,0);
      const diffTime = target.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 14;
  }).sort((a, b) => new Date(a.followUp.nextFollowUpDate).getTime() - new Date(b.followUp.nextFollowUpDate).getTime()), [filteredClients]);

  const ReminderCard = ({ title, items, colorClass, icon, badgeColor, isBirthdayCard }: any) => {
    const isApptCard = title.includes('Appointment');
    
    return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-280px)] min-h-[500px]`}>
        <div className={`px-4 py-3 border-b border-slate-100 flex items-center gap-3 ${colorClass} shrink-0`}>
            <div className={`p-1.5 rounded-lg bg-white/40 shadow-sm border border-black/5`}>{icon}</div>
            <div className="flex-1">
                <h3 className="font-bold text-[11px] text-slate-800 uppercase tracking-wider">{title}</h3>
            </div>
            <span className="bg-white text-slate-900 px-2 py-0.5 rounded-md text-[10px] font-black shadow-sm border border-slate-100">{items.length}</span>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/30 p-1">
            {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center mt-10">
                    <span className="text-2xl mb-1 opacity-20 grayscale">✨</span>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">All Clear</p>
                </div>
            ) : (
                <div className="space-y-1">
                    {items.map((c: Client) => {
                        const wished = isBirthdayCard && isContactedToday(c);
                        return (
                            <div 
                                key={c.id} 
                                className={`p-2.5 rounded-lg border transition-all flex items-start gap-2
                                    ${wished 
                                        ? 'bg-slate-50 border-slate-200 opacity-60 grayscale' 
                                        : 'bg-white border-slate-100 hover:border-indigo-300 hover:shadow-sm'}
                                `}
                            >
                                <div 
                                    className="flex-1 min-w-0 cursor-pointer"
                                    onClick={() => handleOpenClient(c)}
                                >
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <p className={`text-xs font-bold truncate ${wished ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                            {c.profile.name || c.name}
                                        </p>
                                        
                                        {isBirthdayCard ? (
                                            c.profile.dob && (
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${wished ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                                                    {wished ? 'Wished' : `${new Date(c.profile.dob).getDate()} ${new Date(c.profile.dob).toLocaleString('default', {month: 'short'})}`}
                                                </span>
                                            )
                                        ) : title.includes('Tasks') && c.followUp?.nextFollowUpDate ? (
                                            (() => {
                                                const d = new Date(c.followUp.nextFollowUpDate); d.setHours(0,0,0,0);
                                                const today = new Date(); today.setHours(0,0,0,0);
                                                const isOverdue = d.getTime() < today.getTime();
                                                const isToday = d.getTime() === today.getTime();
                                                return (
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${isOverdue ? 'bg-red-50 text-red-600 border-red-100' : isToday ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                                                        {isOverdue ? 'Overdue' : isToday ? 'Today' : d.toLocaleDateString('en-SG', {day: 'numeric', month: 'short'})}
                                                    </span>
                                                );
                                            })()
                                        ) : isApptCard && c.appointments?.firstApptDate ? (
                                             <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${new Date(c.appointments.firstApptDate) < new Date() ? 'bg-red-50 text-red-600 border-red-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                                                {new Date(c.appointments.firstApptDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                {new Date(c.appointments.firstApptDate) < new Date() ? ' (Past)' : ''}
                                             </span>
                                        ) : null}
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[9px] font-bold px-1.5 rounded-sm uppercase tracking-wider ${badgeColor || 'bg-slate-100 text-slate-500'}`}>
                                            {c.followUp?.status?.replace('npu_', 'NPU ')}
                                        </span>
                                        <span className="text-[9px] text-slate-400 truncate font-mono">
                                            {c.profile.phone || '-'}
                                        </span>
                                    </div>
                                </div>
                                
                                <div className="flex flex-col gap-1 items-center justify-center shrink-0 self-center">
                                    {(isBirthdayCard || isApptCard) && (
                                        <button 
                                            onClick={(e) => isBirthdayCard ? handleMarkWished(e, c) : handleDismissAppt(e, c)}
                                            className={`w-6 h-6 flex items-center justify-center rounded transition-all shadow-sm
                                                ${wished 
                                                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                                                    : 'bg-white border border-slate-200 text-slate-300 hover:border-emerald-400 hover:text-emerald-500'
                                                }`}
                                            title={isBirthdayCard ? (wished ? "Unmark Wished" : "Mark as Wished") : "Mark Completed"}
                                        >
                                            {wished ? "✓" : (isApptCard ? "✓" : "○")}
                                        </button>
                                    )}
                                    <button 
                                        onClick={(e) => handleWhatsApp(e, c, isBirthdayCard)}
                                        className="w-6 h-6 flex items-center justify-center rounded transition-all shadow-sm bg-slate-50 text-slate-400 hover:bg-[#25D366] hover:text-white group-hover:opacity-100 border-slate-100"
                                        title="WhatsApp"
                                    >
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.025 3.312l-.542 2.01 2.036-.53c.96.514 1.95.787 3.25.788h.003c3.181 0 5.767-2.586 5.768-5.766 0-3.18-2.587-5.766-5.768-5.766h-.004zm3.003 8.3c-.12.33-.7.63-1.01.69-.24.05-.55.08-1.53-.33-1.3-.54-2.12-1.85-2.19-1.94-.06-.09-.54-.72-.54-1.37s.34-.97.46-1.1c.12-.13.27-.16.36-.16s.18.01.26.01.21-.04.33.25c.12.29.41 1.01.45 1.09.04.08.07.17.01.28-.06.11-.09.18-.18.29-.06.11-.09.18-.18.29-.09.11-.18.23-.26.3-.09.08-.18.17-.08.34.1.17.44.73.94 1.18.64.57 1.18.75 1.35.83.17.08.27.07.37-.04.1-.11.43-.51.55-.68.12-.17.23-.15.39-.09.16.06 1.03.49 1.2.58.17.09.28.14.32.2.04.06.04.35-.08.68z"/></svg>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    </div>
    );
  };

  return (
    <div className="p-6 md:p-8 animate-fade-in pb-24 md:pb-8">
      <PageHeader 
        title="Action Center" 
        icon="🔔" 
        subtitle="Priority daily tasks and client engagement reminders." 
        action={
            availableAdvisors.length > 1 && (
                <div className="relative group">
                    <select 
                        value={advisorFilter}
                        onChange={(e) => setAdvisorFilter(e.target.value)}
                        className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-bold py-2 pl-4 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-indigo-300 transition-all cursor-pointer shadow-sm"
                    >
                        <option value="All">All My Advisors</option>
                        {availableAdvisors.map(adv => <option key={adv.id} value={adv.id}>{adv.name}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[10px]">▼</div>
                </div>
            )
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          <ReminderCard title="Appointments" items={appointments} colorClass="bg-indigo-50" icon="📅" badgeColor="bg-indigo-100 text-indigo-700" />
          <ReminderCard title="Follow-up Tasks" items={followUpTasks} colorClass="bg-blue-50" icon="✅" badgeColor="bg-blue-100 text-blue-700" />
          <ReminderCard title="Untouched Leads" items={untouchedLeads} colorClass="bg-rose-50" icon="❄️" badgeColor="bg-rose-100 text-rose-700" />
          <ReminderCard title="Pending Review" items={pendingOverdue} colorClass="bg-amber-50" icon="⏳" badgeColor="bg-amber-100 text-amber-700" />
          <ReminderCard title="Birthdays" items={birthdayReminders} colorClass="bg-emerald-50" icon="🎂" badgeColor="bg-emerald-100 text-emerald-700" isBirthdayCard />
      </div>

      {selectedClient && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex justify-center p-4 animate-fade-in overflow-y-auto" onClick={() => setSelectedClient(null)}>
              <div className="w-full max-w-2xl min-h-0 h-fit my-auto animate-scale-in flex flex-col" onClick={e => e.stopPropagation()}>
                  <div className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 max-h-[90dvh]">
                      <ClientCard 
                          client={selectedClient} 
                          products={products}
                          onUpdate={handleUpdateClient}
                          currentUser={user}
                          onDelete={async (id) => {
                              await db.deleteClient(id);
                              setClients(prev => prev.filter(c => c.id !== id));
                              setSelectedClient(null);
                              toast.success("Client deleted");
                          }}
                          onAddSale={() => setSaleClient(selectedClient)}
                          onClose={() => setSelectedClient(null)}
                      />
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default RemindersTab;