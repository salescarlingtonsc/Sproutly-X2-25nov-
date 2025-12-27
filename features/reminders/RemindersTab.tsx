
import React from 'react';
import { useClient } from '../../contexts/ClientContext';
import { db } from '../../lib/db';
import { Client } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

const RemindersTab: React.FC = () => {
  const { user } = useAuth();
  const [clients, setClients] = React.useState<Client[]>([]);

  React.useEffect(() => {
    if (user) {
      db.getClients(user.id).then(setClients);
    }
  }, [user]);

  const now = new Date();
  const currentMonth = now.getMonth();

  // Logic: Birthdays (Client or Family)
  const birthdayReminders = clients.filter(c => {
    const checkBirthday = (dobStr?: string) => {
        if (!dobStr) return false;
        const d = new Date(dobStr);
        return d.getMonth() === currentMonth;
    };
    const hasClientBday = checkBirthday(c.dob);
    const hasFamilyBday = (c.familyMembers || []).some(f => checkBirthday(f.dob));
    return hasClientBday || hasFamilyBday;
  });

  // Logic: Immediate Attention (NPU 1-6)
  const npuOverdue = clients.filter(c => {
    if (!c.stage?.includes('NPU')) return false;
    const daysSince = (now.getTime() - new Date(c.lastContact || c.lastUpdated).getTime()) / (1000 * 3600 * 24);
    if (c.stage === 'NPU 1') return daysSince > 2;
    return daysSince > 5;
  });

  // Logic: Pending Decision Overdue (>5 days)
  const pendingOverdue = clients.filter(c => {
    if (c.stage !== 'Pending Decision') return false;
    const daysSince = (now.getTime() - new Date(c.lastContact || c.lastUpdated).getTime()) / (1000 * 3600 * 24);
    return daysSince > 5;
  });

  // Logic: Upcoming Appointments (Today/Tomorrow)
  const appointments = clients.filter(c => {
      if (!c.firstApptDate) return false;
      const apptDate = new Date(c.firstApptDate);
      const diff = (apptDate.getTime() - now.getTime()) / (1000 * 3600 * 24);
      return diff >= 0 && diff <= 2; // Next 48 hours
  });

  const ReminderCard = ({ title, items, colorClass, icon }: any) => (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6`}>
        <div className={`px-4 py-3 border-b border-slate-100 flex items-center gap-2 ${colorClass}`}>
            {icon}
            <h3 className="font-semibold text-sm">{title}</h3>
            <span className="ml-auto bg-white/50 px-2 py-0.5 rounded text-xs font-bold">{items.length}</span>
        </div>
        <div className="divide-y divide-slate-50">
            {items.length === 0 ? (
                <div className="p-4 text-xs text-slate-400 italic">No tasks pending.</div>
            ) : (
                items.map((c: Client) => (
                    <div key={c.id} className="p-3 hover:bg-slate-50 transition-colors flex items-center justify-between group">
                        <div className="flex-1 min-w-0 pr-4">
                            <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                                <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 border border-slate-200">{c.stage}</span>
                            </div>
                            <p className="text-xs text-slate-500 flex items-center gap-2">
                                <span>{c.phone}</span>
                                <span className="text-slate-300">•</span>
                                <span>Last: {new Date(c.lastContact || c.lastUpdated).toLocaleDateString()}</span>
                            </p>
                        </div>
                    </div>
                ))
            )}
        </div>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
        <h1 className="text-2xl font-bold text-slate-800 mb-6">Daily Pulse</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ReminderCard title="Immediate Attention (NPU)" items={npuOverdue} colorClass="bg-rose-50 text-rose-700" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
            <ReminderCard title="Pending Follow-ups" items={pendingOverdue} colorClass="bg-amber-50 text-amber-700" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
            <ReminderCard title="Appointments (Next 48h)" items={appointments} colorClass="bg-blue-50 text-blue-700" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} />
            <ReminderCard title="Birthdays & Milestones" items={birthdayReminders} colorClass="bg-purple-50 text-purple-700" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 15.546c-.523 0-1.046.151-1.5.454a2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.701 2.701 0 00-1.5-.454M9 6v2m3-2v2m3-2v2M9 3h.01M12 3h.01M15 3h.01M21 21v-7a2 2 0 00-2-2H5a2 2 0 00-2 2v7h18zm-3-9v-2a2 2 0 00-2-2H8a2 2 0 00-2 2v2h12z" /></svg>} />
        </div>
    </div>
  );
};

export default RemindersTab;
