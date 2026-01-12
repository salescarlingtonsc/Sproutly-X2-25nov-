
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/db';
import { Client, Product, Sale, ContactStatus } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { ClientCard } from '../crm/components/ClientCard';
import { AddSaleModal } from '../crm/components/AddSaleModal';
import { useToast } from '../../contexts/ToastContext';
import { logActivity } from '../../lib/db/activities';
import { adminDb } from '../../lib/db/admin';

const RemindersTab: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  // Filter State
  const [advisorFilter, setAdvisorFilter] = useState<string>('All');
  
  // Modal States
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [saleClient, setSaleClient] = useState<Client | null>(null);

  useEffect(() => {
    refreshData();
    // Load products for the ClientCard dropdowns
    const fetchConfig = async () => {
        // Pass organization ID to fetch specific products
        const settings = await adminDb.getSystemSettings(user?.organizationId);
        if (settings?.products) setProducts(settings.products);
    };
    fetchConfig();
  }, [user]);

  const refreshData = () => {
    if (user) {
      db.getClients(user.id).then(setClients);
    }
  };

  // Derive unique advisors from the loaded clients
  const availableAdvisors = useMemo(() => {
      const map = new Map<string, string>();
      clients.forEach(c => {
          if (c._ownerId) {
              // Use email part before @ as name if available, else 'Advisor'
              const name = c._ownerEmail ? c._ownerEmail.split('@')[0] : `Advisor ${c._ownerId.slice(0,4)}`;
              map.set(c._ownerId, name);
          }
      });
      return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [clients]);

  // Filter clients based on selection
  const filteredClients = useMemo(() => {
      if (advisorFilter === 'All') return clients;
      return clients.filter(c => c._ownerId === advisorFilter);
  }, [clients, advisorFilter]);

  // Open the full ClientCard modal
  const handleOpenClient = (client: Client) => {
    setSelectedClient(client);
  };

  // Handle updates from within the ClientCard
  const handleFullUpdate = async (updatedClient: Client) => {
      // Optimistic update
      setSelectedClient(updatedClient); 
      setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c)); 
      
      try {
          await db.saveClient(updatedClient);
      } catch (e) {
          toast.error("Failed to save changes");
          refreshData(); // Revert on error
      }
  };

  const handleDeleteClient = async () => {
      if (!selectedClient) return;
      try {
          await db.deleteClient(selectedClient.id);
          setClients(prev => prev.filter(c => c.id !== selectedClient!.id));
          setSelectedClient(null);
          toast.success("Client deleted successfully.");
      } catch (e: any) {
          console.error("Delete Failed:", e);
          toast.error(`Delete Failed: ${e.message}`);
      }
  };

  const handleAddSale = async (sale: Sale) => {
      if (!saleClient) return;
      
      const updatedClient = {
          ...saleClient,
          sales: [...(saleClient.sales || []), sale],
          stage: 'Client',
          followUp: { ...saleClient.followUp, status: 'client' as ContactStatus },
          momentumScore: 100,
          lastUpdated: new Date().toISOString(),
          stageHistory: [...(saleClient.stageHistory || []), { stage: 'Client', date: new Date().toISOString() }],
          notes: [{ id: `sale_${Date.now()}`, content: `Sale Closed: ${sale.productName} ($${sale.premiumAmount})`, date: new Date().toISOString(), author: 'System' }, ...(saleClient.notes || [])]
      };

      setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
      
      // If we are currently viewing this client, update the modal too
      if (selectedClient?.id === updatedClient.id) setSelectedClient(updatedClient);
      
      try {
          await db.saveClient(updatedClient);
          logActivity(updatedClient.id, 'sale_recorded', `Sale recorded via Reminders: ${sale.productName}`);
          toast.success("Sale recorded!");
      } catch (e) {
          toast.error("Failed to save sale.");
      }
  };

  // --- WISHED / WHATSAPP LOGIC ---
  
  const isContactedToday = (client: Client) => {
      if (!client.lastContact) return false;
      const contact = new Date(client.lastContact);
      const today = new Date();
      return contact.getDate() === today.getDate() && 
             contact.getMonth() === today.getMonth() && 
             contact.getFullYear() === today.getFullYear();
  };

  const handleWhatsApp = async (e: React.MouseEvent, client: Client, isBirthday: boolean = false) => {
    e.stopPropagation();
    const phone = client.profile.phone?.replace(/\D/g, '') || '';
    
    if (!phone) {
        toast.error("No phone number found");
        return;
    }

    // 1. Construct Message
    let text = '';
    if (isBirthday) {
        text = `Happy Birthday ${client.profile.name.split(' ')[0]}! 🎂 Wishing you a fantastic year ahead!`;
    }
    
    // 2. Open WhatsApp
    const url = `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
    window.open(url, '_blank');

    // 3. Mark as "Wished" (Update lastContact)
    if (isBirthday) {
        const now = new Date().toISOString();
        const updatedClient = {
            ...client,
            lastContact: now,
            lastUpdated: now,
            notes: [{
                id: `wish_${Date.now()}`,
                content: 'Sent Birthday Wish 🎂',
                date: now,
                author: 'System'
            }, ...(client.notes || [])]
        };

        // Optimistic UI Update (Unhighlights immediately)
        setClients(prev => prev.map(c => c.id === client.id ? updatedClient : c));
        if (selectedClient?.id === client.id) setSelectedClient(updatedClient);

        await db.saveClient(updatedClient);
        toast.success("Marked as wished!");
    }
  };

  const now = new Date();
  const currentMonth = now.getMonth();

  // --- FILTERS ---

  const birthdayReminders = filteredClients.filter(c => {
    const checkBirthday = (dobStr?: string) => {
        if (!dobStr) return false;
        const d = new Date(dobStr);
        return d.getMonth() === currentMonth;
    };
    return checkBirthday(c.profile.dob) || (c.familyMembers || []).some(f => checkBirthday(f.dob));
  }).sort((a, b) => {
      const dayA = new Date(a.profile.dob || '').getDate() || 32;
      const dayB = new Date(b.profile.dob || '').getDate() || 32;
      
      // Move "Wished" (contacted today) clients to the bottom
      const wishedA = isContactedToday(a) ? 1 : 0;
      const wishedB = isContactedToday(b) ? 1 : 0;
      
      if (wishedA !== wishedB) return wishedA - wishedB;
      return dayA - dayB;
  });

  // UNTOUCHED LEADS LOGIC (New Lead or NPU, >2 Days Inactive)
  const untouchedLeads = filteredClients.filter(c => {
    const s = c.followUp.status;
    const isTargetStage = s === 'new' || (s && s.startsWith('npu'));
    
    if (!isTargetStage) return false;

    // Check last interaction (either manual log or system update)
    const lastActivity = c.followUp.lastContactedAt || c.lastUpdated;
    // Default to epoch if no date, ensuring it shows up as untouched
    const lastDate = lastActivity ? new Date(lastActivity) : new Date(0); 
    
    const diffTime = now.getTime() - lastDate.getTime();
    const diffDays = diffTime / (1000 * 3600 * 24);
    
    return diffDays > 2;
  }).sort((a,b) => {
      // Sort by oldest activity first (most neglected)
      const dateA = new Date(a.followUp.lastContactedAt || a.lastUpdated).getTime();
      const dateB = new Date(b.followUp.lastContactedAt || b.lastUpdated).getTime();
      return dateA - dateB; 
  });

  const pendingOverdue = filteredClients.filter(c => {
    if (c.followUp.status !== 'pending_decision') return false;
    const lastDate = c.followUp.lastContactedAt || c.lastUpdated;
    const daysSince = (now.getTime() - new Date(lastDate).getTime()) / (1000 * 3600 * 24);
    return daysSince > 3; 
  });

  const appointments = filteredClients.filter(c => {
      if (!c.appointments?.firstApptDate) return false;
      const apptDate = new Date(c.appointments.firstApptDate);
      const diff = (apptDate.getTime() - now.getTime()) / (1000 * 3600 * 24);
      return diff >= 0 && diff <= 2; 
  }).sort((a,b) => new Date(a.appointments.firstApptDate).getTime() - new Date(b.appointments.firstApptDate).getTime());

  const followUpTasks = filteredClients.filter(c => {
      if (!c.followUp?.nextFollowUpDate) return false;
      const target = new Date(c.followUp.nextFollowUpDate);
      target.setHours(0,0,0,0);
      const today = new Date(); today.setHours(0,0,0,0);
      const diffTime = target.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 14;
  }).sort((a, b) => new Date(a.followUp.nextFollowUpDate).getTime() - new Date(b.followUp.nextFollowUpDate).getTime());

  // --- CARD COMPONENT ---
  const ReminderCard = ({ title, items, colorClass, icon, badgeColor, isBirthdayCard }: any) => (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-220px)] min-h-[500px]`}>
        <div className={`px-4 py-3 border-b border-slate-100 flex items-center gap-3 ${colorClass} shrink-0`}>
            <div className={`p-1.5 rounded-lg bg-white/40 shadow-sm border border-black/5`}>{icon}</div>
            <div className="flex-1">
                <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wide">{title}</h3>
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
                        // Check if wished today (only for birthday card logic visual)
                        const wished = isBirthdayCard && isContactedToday(c);
                        
                        return (
                            <div 
                                key={c.id} 
                                onClick={() => handleOpenClient(c)}
                                className={`bg-white p-2.5 rounded-lg border transition-all cursor-pointer group flex items-start gap-2
                                    ${wished ? 'opacity-50 border-slate-100 grayscale' : 'border-slate-100 hover:border-indigo-300 hover:shadow-sm'}
                                `}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <p className={`text-xs font-bold truncate ${wished ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                                            {c.profile.name || c.name}
                                        </p>
                                        
                                        {/* Dynamic Date Badge */}
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
                                        ) : title.includes('Appointment') && c.appointments?.firstApptDate ? (
                                             <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                                {new Date(c.appointments.firstApptDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                             </span>
                                        ) : null}
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[9px] font-bold px-1.5 rounded-sm uppercase tracking-wider ${badgeColor || 'bg-slate-100 text-slate-500'}`}>
                                            {c.followUp.status?.replace('npu_', 'NPU ')}
                                        </span>
                                        <span className="text-[9px] text-slate-400 truncate font-mono">
                                            {c.profile.phone || '-'}
                                        </span>
                                    </div>
                                    
                                    {/* Advisor Name if viewing All */}
                                    {advisorFilter === 'All' && c._ownerEmail && (
                                        <div className="mt-1 flex items-center gap-1">
                                            <span className="text-[8px] uppercase font-bold text-slate-300 bg-slate-50 px-1 rounded">
                                                {c._ownerEmail.split('@')[0]}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                
                                <button 
                                    onClick={(e) => handleWhatsApp(e, c, isBirthdayCard)}
                                    className={`w-6 h-6 flex items-center justify-center rounded transition-all shadow-sm shrink-0 self-center 
                                        ${wished 
                                            ? 'bg-emerald-100 text-emerald-600 cursor-default' 
                                            : 'bg-slate-50 text-slate-400 hover:bg-[#25D366] hover:text-white opacity-0 group-hover:opacity-100'
                                        }`}
                                    title={wished ? "Already Wished" : "Quick WhatsApp"}
                                    disabled={wished}
                                >
                                    {wished ? (
                                        <span className="text-xs font-bold">✓</span>
                                    ) : (
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.025 3.312l-.542 2.01 2.036-.53c.96.514 1.95.787 3.25.788h.003c3.181 0 5.767-2.586 5.768-5.766 0-3.18-2.587-5.766-5.768-5.766h-.004zm3.003 8.3c-.12.33-.7.63-1.01.69-.24.05-.55.08-1.53-.33-1.3-.54-2.12-1.85-2.19-1.94-.06-.09-.54-.72-.54-1.37s.34-.97.46-1.1c.12-.13.27-.16.36-.16s.18.01.26.01.21-.04.33.25c.12.29.41 1.01.45 1.09.04.08.07.17.01.28-.06.11-.09.18-.18.29-.06.11-.09.18-.18.29-.09.11-.18.23-.26.3-.09.08-.18.17-.08.34.1.17.44.73.94 1.18.64.57 1.18.75 1.35.83.17.08.27.07.37-.04.1-.11.43-.51.55-.68.12-.17.23-.15.39-.09.16.06 1.03.49 1.2.58.17.09.28.14.32.2.04.06.04.35-.08.68z"/></svg>
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto space-y-4 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-end mb-2 shrink-0 gap-4">
        <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                <span>🔔</span> Action Center
            </h1>
            <p className="text-slate-500 text-xs font-medium">Daily prioritized bird's eye view.</p>
        </div>
        
        <div className="flex items-center gap-2">
            {availableAdvisors.length > 1 && (
                <div className="relative">
                    <select 
                        value={advisorFilter}
                        onChange={(e) => setAdvisorFilter(e.target.value)}
                        className="appearance-none bg-white border border-indigo-100 text-slate-700 text-xs font-bold py-1.5 pl-3 pr-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-indigo-300 transition-all cursor-pointer shadow-sm"
                    >
                        <option value="All">All Advisors</option>
                        {availableAdvisors.map(adv => (
                            <option key={adv.id} value={adv.id}>{adv.name}</option>
                        ))}
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[8px]">▼</div>
                </div>
            )}
            
            <button onClick={refreshData} className="text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 border border-indigo-100 bg-white shadow-sm">
                <span>↻</span> Refresh
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 flex-1 min-h-0">
        <ReminderCard 
          title="Appointments (48h)" 
          items={appointments} 
          icon="📅" 
          colorClass="bg-indigo-50 border-indigo-100 text-indigo-800"
          badgeColor="text-indigo-600 bg-indigo-50 border border-indigo-100"
        />
        <ReminderCard 
          title="Scheduled Tasks" 
          items={followUpTasks} 
          icon="📝" 
          colorClass="bg-blue-50 border-blue-100 text-blue-800"
          badgeColor="text-blue-600 bg-blue-50 border border-blue-100"
        />
        <ReminderCard 
          title="Untouched Leads (>2 Days)" 
          items={untouchedLeads} 
          icon="💤" 
          colorClass="bg-amber-50 border-amber-100 text-amber-800"
          badgeColor="text-amber-600 bg-amber-50 border border-amber-100"
        />
        <ReminderCard 
          title="Stalled Closures" 
          items={pendingOverdue} 
          icon="⏳" 
          colorClass="bg-rose-50 border-rose-100 text-rose-800"
          badgeColor="text-rose-600 bg-rose-50 border border-rose-100"
        />
        <ReminderCard 
          title="Birthdays (Month)" 
          items={birthdayReminders} 
          icon="🎂" 
          colorClass="bg-emerald-50 border-emerald-100 text-emerald-800"
          badgeColor="text-emerald-600 bg-emerald-50 border border-emerald-100"
          isBirthdayCard={true} 
        />
      </div>

      {selectedClient && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedClient(null)}>
            <div className="w-full max-w-2xl h-[85vh] animate-scale-in flex flex-col" onClick={e => e.stopPropagation()}>
                 <div className="bg-white rounded-xl shadow-2xl h-full overflow-hidden flex flex-col">
                    <ClientCard 
                        client={selectedClient} 
                        products={products}
                        onUpdate={handleFullUpdate} 
                        currentUser={user}
                        onDelete={() => { handleDeleteClient(); setSelectedClient(null); }}
                        onAddSale={() => setSaleClient(selectedClient)}
                        onClose={() => setSelectedClient(null)} // Added
                    />
                 </div>
            </div>
        </div>
      )}

      {saleClient && (
          <AddSaleModal 
              clientName={saleClient.name}
              products={products} 
              advisorBanding={user?.bandingPercentage || 50} 
              onClose={() => setSaleClient(null)}
              onSave={handleAddSale}
          />
      )}
    </div>
  );
};

export default RemindersTab;