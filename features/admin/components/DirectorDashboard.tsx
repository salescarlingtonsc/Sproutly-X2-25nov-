
import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Client, Advisor, Product, Team } from '../../../types';
import { LeadImporter } from './LeadImporter';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { Activity } from '../../../lib/db/activities';
import { fmtSGD } from '../../../lib/helpers';
import { useToast } from '../../../contexts/ToastContext';
import { generateDirectorBriefing } from '../../../lib/gemini';

interface DirectorDashboardProps {
  clients: Client[];
  advisors: Advisor[];
  teams: Team[];
  currentUser: Advisor;
  activities: Activity[];
  products: Product[];
  onUpdateClient: (client: Client) => void;
  onImport: (newClients: Client[]) => void;
  onUpdateAdvisor: (advisor: Advisor) => Promise<void>;
}

type TimeFilter = 'This Month' | 'Last Month' | 'This Quarter' | 'This Year' | 'All Time';

export const DirectorDashboard: React.FC<DirectorDashboardProps> = ({ clients, advisors, teams, currentUser, activities, products, onUpdateClient, onImport, onUpdateAdvisor }) => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'analytics' | 'activity' | 'leads'>('analytics');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('This Month');
  const [showImporter, setShowImporter] = useState(false);
  const [filterAdvisor, setFilterAdvisor] = useState<string>('all');
  
  const managedAdvisors = useMemo(() => {
      if (currentUser.isAgencyAdmin) return advisors;
      const myTeam = teams.find(t => t.leaderId === currentUser.id);
      return myTeam ? advisors.filter(a => a.teamId === myTeam.id) : [];
  }, [advisors, teams, currentUser]);

  const managedClients = useMemo(() => {
      const managedAdvisorIds = managedAdvisors.map(a => a.id);
      return clients.filter(c => c.advisorId && managedAdvisorIds.includes(c.advisorId));
  }, [clients, managedAdvisors]);

  const totalClosureVol = useMemo(() => managedClients.reduce((acc, c) => acc + (c.value || 0), 0), [managedClients]);
  const unsyncedCount = useMemo(() => managedClients.filter(c => c._isSynced === false).length, [managedClients]);

  const handleAssign = (clientId: string, newAdvisorId: string) => {
    const client = clients.find(c => c.id === clientId);
    const advisor = advisors.find(a => a.id === newAdvisorId);
    if (client && advisor) {
        onUpdateClient({ ...client, advisorId: newAdvisorId, _ownerId: newAdvisorId, _ownerEmail: advisor.email });
        toast.success(`Assigned to ${advisor.name}`);
    }
  };

  return (
    <div className="p-8 bg-slate-50 min-h-full animate-fade-in">
      {showImporter && <LeadImporter advisors={managedAdvisors.filter(a => a.status === 'active' || a.status === 'approved')} onClose={() => setShowImporter(false)} onImport={onImport} />}
      
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{currentUser.isAgencyAdmin ? 'Agency Control' : 'Team Hub'}</h1>
            <p className="text-slate-500">Overseeing {managedAdvisors.length} agents • {managedClients.length} managed leads</p>
          </div>
          <div className="flex gap-4">
             {unsyncedCount > 0 && (
                <div className="bg-amber-50 border border-amber-100 px-4 py-2 rounded-xl flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    <span className="text-[10px] font-black text-amber-700 uppercase">{unsyncedCount} PENDING AGENT DRAFTS</span>
                </div>
             )}
             <div className="bg-white p-1 rounded-xl border border-slate-200 flex">
                {['analytics', 'activity', 'leads'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-4 py-2 text-sm font-medium rounded-lg transition-all capitalize ${activeTab === tab ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-900'}`}>{tab}</button>
                ))}
            </div>
          </div>
        </header>

        {activeTab === 'analytics' && (
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-4">Pipeline Volume</h3>
                  <div className="text-4xl font-black text-slate-900">{fmtSGD(totalClosureVol)}</div>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-4">Agent Health</h3>
                  <div className="flex gap-2">
                     {managedAdvisors.slice(0, 5).map(a => (
                        <div key={a.id} className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-500" title={a.name}>{a.avatar}</div>
                     ))}
                  </div>
              </div>
           </div>
        )}

        {activeTab === 'leads' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
             <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-800">Lead Assignment</h3>
                <Button variant="primary" onClick={() => setShowImporter(true)} leftIcon="📥">Import Leads</Button>
             </div>
             <table className="w-full text-left text-sm">
                 <thead className="bg-slate-50 border-b border-slate-100">
                   <tr>
                     <th className="px-6 py-3 font-semibold text-slate-500">Client</th>
                     <th className="px-6 py-3 font-semibold text-slate-500">Stage</th>
                     <th className="px-6 py-3 font-semibold text-slate-500">Sync Status</th>
                     <th className="px-6 py-3 font-semibold text-slate-500">Custodian</th>
                     <th className="px-6 py-3 font-semibold text-slate-500">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {managedClients.map(client => (
                       <tr key={client.id} className="hover:bg-slate-50/50">
                         <td className="px-6 py-3">
                           <div className="font-bold text-slate-800">{client.name}</div>
                           <div className="text-xs text-slate-400">{client.company}</div>
                         </td>
                         <td className="px-6 py-3"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 uppercase">{client.stage}</span></td>
                         <td className="px-6 py-3">
                            {client._isSynced ? (
                               <span className="text-emerald-600 font-bold text-xs flex items-center gap-1">✓ Cloud Verified</span>
                            ) : (
                               <span className="text-amber-600 font-bold text-xs flex items-center gap-1">⌛ Draft Pending</span>
                            )}
                         </td>
                         <td className="px-6 py-3 text-slate-600 font-medium">{advisors.find(a => a.id === client.advisorId)?.name || 'Unassigned'}</td>
                         <td className="px-6 py-3">
                           <select 
                             value={client.advisorId || ''}
                             onChange={(e) => handleAssign(client.id, e.target.value)}
                             className="bg-white border border-slate-200 text-slate-600 text-xs rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                           >
                             <option value="" disabled>Re-assign...</option>
                             {managedAdvisors.map(adv => <option key={adv.id} value={adv.id}>{adv.name}</option>)}
                           </select>
                         </td>
                       </tr>
                   ))}
                 </tbody>
             </table>
          </div>
        )}
      </div>
    </div>
  );
};
