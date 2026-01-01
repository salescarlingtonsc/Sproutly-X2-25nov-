
import React, { useState } from 'react';
import { Advisor, Team, UserRole } from '../../../types';

interface UserManagementProps {
  advisors: Advisor[];
  teams: Team[];
  currentUser: Advisor;
  onUpdateAdvisor: (advisor: Advisor) => void;
  onDeleteAdvisor: (id: string) => void;
  onUpdateTeams: (teams: Team[]) => void;
  onAddAdvisor: (advisor: Advisor) => void;
}

export const UserManagement: React.FC<UserManagementProps> = ({ advisors, teams, currentUser, onUpdateAdvisor, onDeleteAdvisor, onUpdateTeams, onAddAdvisor }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'teams'>('users');
  const [bandingInputs, setBandingInputs] = useState<Record<string, string>>({});
  
  // Team Creation State
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamLeader, setNewTeamLeader] = useState('');

  // Edit/Invite Modal States
  const [modalType, setModalType] = useState<'invite' | 'edit' | null>(null);
  const [editingUser, setEditingUser] = useState<Advisor | null>(null);
  
  // Form State
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('advisor');
  const [formTeamId, setFormTeamId] = useState('');
  const [formStatus, setFormStatus] = useState<'active' | 'pending' | 'rejected'>('active');
  const [formBanding, setFormBanding] = useState<string>('50');

  const pendingUsers = advisors.filter(a => a.status === 'pending');
  const activeUsers = advisors.filter(a => a.status === 'active');
  const rejectedUsers = advisors.filter(a => a.status === 'rejected');

  const directors = advisors.filter(a => a.role === 'director' && a.status === 'active');

  const openInviteModal = () => {
      setModalType('invite');
      setFormName('');
      setFormEmail('');
      setFormRole('advisor');
      setFormTeamId('');
      setFormStatus('active'); // Default to immediate active
      setFormBanding('50');
  };

  const openEditModal = (user: Advisor) => {
      setModalType('edit');
      setEditingUser(user);
      setFormName(user.name);
      setFormEmail(user.email);
      setFormRole(user.role);
      setFormTeamId(user.teamId || '');
      setFormStatus(user.status);
      setFormBanding(user.bandingPercentage.toString());
  };

  const closeModal = () => {
      setModalType(null);
      setEditingUser(null);
      setIsCreatingTeam(false);
  };

  const handleSaveUser = () => {
      if (!formName || !formEmail) return;

      const userData = {
          name: formName,
          email: formEmail,
          role: formRole,
          teamId: formTeamId || undefined,
          status: formStatus,
          bandingPercentage: parseFloat(formBanding) || 0,
      };

      if (modalType === 'edit' && editingUser) {
          // Overwrite existing user
          onUpdateAdvisor({ ...editingUser, ...userData });
      } else {
          // Invite new user
          const newAdvisor: Advisor = {
              id: `adv_${Date.now()}`,
              avatar: formName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase(),
              joinedAt: new Date().toISOString(),
              organizationId: currentUser.organizationId,
              ...userData
          };
          onAddAdvisor(newAdvisor);
          alert(`Invitation sent to ${formEmail}. User activated.`);
      }
      closeModal();
  };

  const handleQuickCreateTeam = () => {
      if (!newTeamName) return;
      const newTeam: Team = {
          id: `team_${Date.now()}`,
          name: newTeamName,
          leaderId: currentUser.id // Default to self for quick create
      };
      onUpdateTeams([...teams, newTeam]);
      setFormTeamId(newTeam.id); // Auto-select new team
      setIsCreatingTeam(false);
      setNewTeamName('');
  };

  const handleApprove = (user: Advisor) => {
    const banding = parseFloat(bandingInputs[user.id] || '0');
    if (banding <= 0 || isNaN(banding)) {
        alert("Please enter a valid Banding % before approving.");
        return;
    }
    onUpdateAdvisor({ ...user, status: 'active', bandingPercentage: banding });
    const newInputs = { ...bandingInputs };
    delete newInputs[user.id];
    setBandingInputs(newInputs);
  };

  const handleReject = (user: Advisor) => {
    if(confirm(`Reject ${user.name}? This will move them to the rejected list.`)) {
        onUpdateAdvisor({ ...user, status: 'rejected', bandingPercentage: 0 });
    }
  };

  const handleBandingChange = (id: string, value: string) => {
      setBandingInputs(prev => ({...prev, [id]: value}));
  };
  
  const handleActiveBandingUpdate = (user: Advisor, newVal: string) => {
      const val = parseFloat(newVal);
      onUpdateAdvisor({
          ...user,
          bandingPercentage: isNaN(val) ? 0 : val
      });
  };

  const handleCreateTeamTab = () => {
      if (!newTeamName || !newTeamLeader) return;
      const newTeam: Team = {
          id: `team_${Date.now()}`,
          name: newTeamName,
          leaderId: newTeamLeader
      };
      onUpdateTeams([...teams, newTeam]);
      setNewTeamName('');
      setNewTeamLeader('');
  };

  const handleDeleteTeam = (id: string) => {
      if (confirm("Delete this team? Members will become unassigned.")) {
          onUpdateTeams(teams.filter(t => t.id !== id));
          const teamUsers = advisors.filter(a => a.teamId === id);
          teamUsers.forEach(u => onUpdateAdvisor({...u, teamId: undefined}));
      }
  };

  return (
    <div className="p-8 bg-slate-50 min-h-full animate-fade-in relative">
        <div className="max-w-5xl mx-auto">
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Agency Management</h1>
                    <p className="text-slate-500">Manage advisors, approvals, and team structures.</p>
                </div>
                <button 
                    onClick={openInviteModal}
                    className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-800 transition-all"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                    Invite Advisor
                </button>
            </div>

            <div className="flex gap-4 mb-6 border-b border-slate-200">
                <button 
                    onClick={() => setActiveTab('users')}
                    className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'users' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'}`}
                >
                    Advisors & Approvals
                </button>
                {currentUser.isAgencyAdmin && (
                    <button 
                        onClick={() => setActiveTab('teams')}
                        className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'teams' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'}`}
                    >
                        Teams & Hierarchy
                    </button>
                )}
            </div>

            {activeTab === 'users' && (
            <div className="space-y-8">
                {/* PENDING APPROVALS */}
                {pendingUsers.length > 0 && (
                    <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
                        <div className="bg-amber-50 px-6 py-4 border-b border-amber-100 flex items-center justify-between">
                            <h2 className="font-semibold text-amber-800 flex items-center gap-2">
                                <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                                </span>
                                Pending Approvals ({pendingUsers.length})
                            </h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[800px] text-left text-sm">
                                <thead className="bg-slate-50 border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-3 font-semibold text-slate-600">Name</th>
                                        <th className="px-6 py-3 font-semibold text-slate-600">Email</th>
                                        <th className="px-6 py-3 font-semibold text-slate-600">Registered</th>
                                        <th className="px-6 py-3 font-semibold text-slate-600">Assign Banding %</th>
                                        <th className="px-6 py-3 font-semibold text-slate-600 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {pendingUsers.map(user => (
                                        <tr key={user.id} className="hover:bg-slate-50/50">
                                            <td className="px-6 py-4 font-medium text-slate-900">{user.name}</td>
                                            <td className="px-6 py-4 text-slate-600">{user.email}</td>
                                            <td className="px-6 py-4 text-slate-500 text-xs">{new Date(user.joinedAt).toLocaleDateString()}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <input 
                                                        type="number" 
                                                        min="0" max="100"
                                                        placeholder="e.g. 50"
                                                        className="w-24 px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900"
                                                        value={bandingInputs[user.id] || ''}
                                                        onChange={(e) => handleBandingChange(user.id, e.target.value)}
                                                    />
                                                    <span className="text-slate-400">%</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right space-x-2">
                                                <button 
                                                    onClick={() => handleReject(user)}
                                                    className="px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                >
                                                    Reject
                                                </button>
                                                <button 
                                                    onClick={() => handleApprove(user)}
                                                    className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
                                                >
                                                    Approve & Activate
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ACTIVE USERS */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[200px]">
                    <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                        <h2 className="font-semibold text-slate-700">Active Advisors</h2>
                        <span className="text-xs text-slate-400 font-medium">{activeUsers.length} licenses used</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[800px] text-left text-sm">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-3 font-semibold text-slate-600">Advisor</th>
                                    <th className="px-6 py-3 font-semibold text-slate-600">Email</th>
                                    <th className="px-6 py-3 font-semibold text-slate-600">Team</th>
                                    <th className="px-6 py-3 font-semibold text-slate-600">Banding</th>
                                    <th className="px-6 py-3 font-semibold text-slate-600 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {activeUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">
                                            No active advisors found. Click "Invite Advisor" to add one.
                                        </td>
                                    </tr>
                                ) : (
                                    activeUsers.map(user => (
                                        <tr key={user.id}>
                                            <td className="px-6 py-3 flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">{user.avatar}</div>
                                                <div>
                                                    <span className="font-medium text-slate-900 block">{user.name}</span>
                                                    {user.isAgencyAdmin && <span className="text-[10px] bg-slate-800 text-white px-1.5 py-0.5 rounded">Owner</span>}
                                                    {user.role === 'director' && !user.isAgencyAdmin && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">Director</span>}
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 text-slate-600">{user.email}</td>
                                            <td className="px-6 py-3">
                                                {currentUser.isAgencyAdmin ? (
                                                    <select 
                                                        value={user.teamId || ''}
                                                        onChange={(e) => onUpdateAdvisor({ ...user, teamId: e.target.value })}
                                                        className="bg-white border border-slate-200 text-slate-900 text-xs rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                                                    >
                                                        <option value="">Unassigned</option>
                                                        {teams.map(t => (
                                                            <option key={t.id} value={t.id}>{t.name}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <span className="text-slate-500 text-xs">
                                                        {teams.find(t => t.id === user.teamId)?.name || '-'}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-3">
                                                <div className="flex items-center gap-2 group">
                                                    <input 
                                                        type="number"
                                                        min="0" max="100"
                                                        value={user.bandingPercentage}
                                                        onChange={(e) => handleActiveBandingUpdate(user, e.target.value)}
                                                        className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm text-center text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none transition-all group-hover:border-slate-300"
                                                    />
                                                    <span className="text-slate-400 text-xs font-medium">%</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 text-right">
                                                <button 
                                                    onClick={() => openEditModal(user)}
                                                    className="text-xs text-slate-500 hover:text-slate-800 font-medium bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded transition-colors"
                                                >
                                                    Edit / Overwrite
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                 {/* REJECTED USERS */}
                {rejectedUsers.length > 0 && (
                     <div className="opacity-60 hover:opacity-100 transition-opacity">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Rejected / Deactivated</h3>
                        <div className="bg-slate-100 rounded-lg p-4">
                            {rejectedUsers.map(u => (
                                <div key={u.id} className="flex justify-between items-center py-2 border-b border-slate-200 last:border-0 text-sm">
                                    <span>{u.name} ({u.email})</span>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs bg-rose-100 text-rose-800 px-2 py-1 rounded">Rejected</span>
                                        <button onClick={() => openEditModal(u)} className="text-xs text-slate-400 underline hover:text-slate-600">Re-activate</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                     </div>
                )}
            </div>
            )}

            {activeTab === 'teams' && currentUser.isAgencyAdmin && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Existing Teams */}
                    <div className="lg:col-span-2 space-y-4">
                         {teams.map(team => {
                             const leader = advisors.find(a => a.id === team.leaderId);
                             const members = advisors.filter(a => a.teamId === team.id);
                             return (
                                 <div key={team.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center">
                                     <div>
                                         <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                             {team.name}
                                             <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-normal">{members.length} members</span>
                                         </h3>
                                         <p className="text-sm text-slate-500 mt-1">Leader: <span className="font-semibold text-slate-700">{leader?.name || 'Unassigned'}</span></p>
                                     </div>
                                     <div className="mt-4 md:mt-0 flex items-center gap-3">
                                         <div className="flex -space-x-2">
                                             {members.slice(0, 5).map(m => (
                                                 <div key={m.id} className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-600" title={m.name}>
                                                     {m.avatar}
                                                 </div>
                                             ))}
                                             {members.length > 5 && (
                                                 <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] text-slate-500">
                                                     +{members.length - 5}
                                                 </div>
                                             )}
                                         </div>
                                         <button onClick={() => handleDeleteTeam(team.id)} className="text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded transition-colors">
                                             Disband
                                         </button>
                                     </div>
                                 </div>
                             )
                         })}
                    </div>

                    {/* Create Team Form */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit">
                        <h3 className="font-bold text-slate-800 mb-4">Create New Team</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Team Name</label>
                                <input 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                    placeholder="e.g. Wolfpack"
                                    value={newTeamName}
                                    onChange={e => setNewTeamName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Assign Director</label>
                                <select 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={newTeamLeader}
                                    onChange={e => setNewTeamLeader(e.target.value)}
                                >
                                    <option value="">Select Leader...</option>
                                    {directors.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                            <button 
                                onClick={handleCreateTeamTab}
                                disabled={!newTeamName || !newTeamLeader}
                                className="w-full bg-slate-900 text-white font-bold py-2 rounded-lg text-sm shadow hover:bg-slate-800 disabled:opacity-50"
                            >
                                Create Team
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* INVITE / EDIT MODAL */}
        {modalType && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in" onClick={closeModal}>
                <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
                    <div className="bg-slate-900 px-6 py-4 flex justify-between items-center">
                        <h3 className="text-white font-bold text-lg">{modalType === 'invite' ? 'Invite Advisor' : 'Edit Advisor Details'}</h3>
                        <button onClick={closeModal} className="text-slate-400 hover:text-white"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name</label>
                            <input 
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                value={formName}
                                onChange={e => setFormName(e.target.value)}
                                placeholder="e.g. John Doe"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email Address</label>
                            <input 
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                value={formEmail}
                                onChange={e => setFormEmail(e.target.value)}
                                placeholder="e.g. john@agency.com"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Role</label>
                                <select 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={formRole}
                                    onChange={e => setFormRole(e.target.value as UserRole)}
                                >
                                    <option value="advisor">Advisor</option>
                                    <option value="director">Director</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>
                                <select 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={formStatus}
                                    onChange={e => setFormStatus(e.target.value as any)}
                                >
                                    <option value="active">Active</option>
                                    <option value="pending">Pending</option>
                                    <option value="rejected">Rejected/Inactive</option>
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase">Team</label>
                                    {!isCreatingTeam && (
                                        <button 
                                            onClick={() => setIsCreatingTeam(true)}
                                            className="text-[10px] text-emerald-600 hover:underline font-bold"
                                        >
                                            + Create New
                                        </button>
                                    )}
                                </div>
                                {isCreatingTeam ? (
                                    <div className="flex gap-1">
                                        <input 
                                            autoFocus
                                            className="w-full bg-slate-50 border border-emerald-500 rounded-lg px-2 py-2 text-sm text-slate-900 focus:outline-none"
                                            placeholder="Team Name"
                                            value={newTeamName}
                                            onChange={e => setNewTeamName(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleQuickCreateTeam()}
                                        />
                                        <button 
                                            onClick={handleQuickCreateTeam} 
                                            className="bg-emerald-600 text-white p-2 rounded-lg"
                                            title="Save Team"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                        </button>
                                    </div>
                                ) : (
                                    <select 
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={formTeamId}
                                        onChange={e => setFormTeamId(e.target.value)}
                                    >
                                        <option value="">Unassigned</option>
                                        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Banding %</label>
                                <input 
                                    type="number"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={formBanding}
                                    onChange={e => setFormBanding(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="pt-4">
                            <button 
                                onClick={handleSaveUser}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-500/30 transition-all"
                            >
                                {modalType === 'invite' ? 'Send Invitation & Activate' : 'Save Changes'}
                            </button>
                            {modalType === 'invite' && (
                                <p className="text-[10px] text-center text-slate-400 mt-2">
                                    This will send an email to {formEmail || 'the user'} and instantly active the account.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
