
import React, { useState, useMemo } from 'react';
import { Advisor, Team, UserRole, SubscriptionTier } from '../../../types';
import { TAB_DEFINITIONS } from '../../../lib/config';
import { supabase } from '../../../lib/supabase';
import { fmtSGD } from '../../../lib/helpers';
import { adminDb } from '../../../lib/db/admin'; // Import for reading org name

interface UserManagementProps {
  advisors: Advisor[];
  teams: Team[];
  currentUser: Advisor;
  onUpdateAdvisor: (advisor: Advisor) => void;
  onDeleteAdvisor: (id: string) => void;
  onUpdateTeams: (teams: Team[]) => void;
  onAddAdvisor: (advisor: Advisor) => void;
}

const AVAILABLE_MODULES = TAB_DEFINITIONS.filter(t => 
    !['disclaimer', 'dashboard', 'crm', 'reminders', 'report', 'admin'].includes(t.id)
);

// Reusable Advisor Row Component (List View)
const AdvisorRow: React.FC<{
  user: Advisor;
  isLeader?: boolean;
  directorName?: string;
  onBandingUpdate: (user: Advisor, val: string) => void;
  onGoalUpdate: (user: Advisor, val: string) => void;
  onEdit: (user: Advisor) => void;
  onDelete: (id: string) => void;
  readOnly?: boolean;
}> = ({ user, isLeader = false, directorName, onBandingUpdate, onGoalUpdate, onEdit, onDelete, readOnly }) => (
  <tr className={isLeader ? "bg-indigo-50/40" : "bg-white"}>
      <td className="px-6 py-3 flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isLeader ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>{user.avatar}</div>
          <div>
              <span className={`font-medium block ${isLeader ? 'text-indigo-900' : 'text-slate-900'}`}>{user.name}</span>
              <div className="flex gap-1 flex-wrap">
                  {user.isAgencyAdmin && <span className="text-[10px] bg-slate-800 text-white px-1.5 py-0.5 rounded">Director</span>}
                  {user.role === 'director' && !user.isAgencyAdmin && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">Director</span>}
                  {user.role === 'manager' && <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded">Manager</span>}
                  {isLeader && user.role !== 'manager' && user.role !== 'director' && !user.isAgencyAdmin && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">Team Lead</span>}
                  
                  {user.role === 'manager' && directorName && (
                      <span className="text-[9px] bg-white border border-teal-200 text-teal-700 px-1.5 py-0.5 rounded flex items-center gap-1">
                          Reports to: <b>{directorName}</b>
                      </span>
                  )}
              </div>
          </div>
      </td>
      <td className="px-6 py-3 text-slate-600">{user.email}</td>
      <td className="px-6 py-3">
          <div className="flex items-center gap-2 group">
              <input 
                  type="number"
                  min="0" max="100"
                  value={user.bandingPercentage}
                  onChange={(e) => onBandingUpdate(user, e.target.value)}
                  disabled={readOnly}
                  className={`w-14 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm text-center text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none transition-all group-hover:border-slate-300 ${readOnly ? 'opacity-50' : ''}`}
              />
              <span className="text-slate-400 text-xs font-medium">%</span>
          </div>
      </td>
      <td className="px-6 py-3">
          <div className="flex items-center gap-2 group">
              <span className="text-slate-400 text-xs font-bold">$</span>
              <input 
                  type="number"
                  value={user.annualGoal || ''}
                  placeholder="0"
                  onChange={(e) => onGoalUpdate(user, e.target.value)}
                  disabled={readOnly}
                  className={`w-24 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none transition-all group-hover:border-slate-300 font-mono ${readOnly ? 'opacity-50' : ''}`}
              />
          </div>
      </td>
      <td className="px-6 py-3 text-right">
          {!readOnly && (
              <>
                <button onClick={() => onEdit(user)} className="text-xs text-slate-500 hover:text-slate-800 font-medium bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded transition-colors">Edit</button>
                <button onClick={() => onDelete(user.id)} className="text-xs text-rose-500 hover:text-rose-700 font-medium bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded transition-colors ml-2">Delete</button>
              </>
          )}
      </td>
  </tr>
);

export const UserManagement: React.FC<UserManagementProps> = ({ advisors, teams, currentUser, onUpdateAdvisor, onDeleteAdvisor, onUpdateTeams, onAddAdvisor }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'teams'>('users');
  const [bandingInputs, setBandingInputs] = useState<Record<string, string>>({});
  
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamLeader, setNewTeamLeader] = useState('');
  const [isCreatingTeam, setIsCreatingTeam] = useState(false); // To show inline form

  const [modalType, setModalType] = useState<'invite' | 'edit' | null>(null);
  const [editingUser, setEditingUser] = useState<Advisor | null>(null);
  const [modalTab, setModalTab] = useState<'details' | 'access'>('details');
  const [orgName, setOrgName] = useState<string>('Sproutly Organization');
  
  // Form State
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('advisor');
  const [formReportingTo, setFormReportingTo] = useState('');
  const [formStatus, setFormStatus] = useState<'active' | 'pending' | 'rejected' | 'approved'>('active');
  const [formBanding, setFormBanding] = useState<string>('50');
  const [formTier, setFormTier] = useState<SubscriptionTier>('free');
  const [formModules, setFormModules] = useState<string[]>([]);

  // --- VISIBILITY PERMISSIONS ---
  const isDirector = currentUser.role === 'director' || currentUser.isAgencyAdmin;
  const isManager = currentUser.role === 'manager';

  // Load Org Name Effect
  React.useEffect(() => {
      adminDb.getSystemSettings().then(res => {
          if (res?.appSettings && (res.appSettings as any).agencyName) {
              setOrgName((res.appSettings as any).agencyName);
          }
      });
  }, []);

  // 1. Filter Visible Teams
  const visibleTeams = useMemo(() => {
      if (isDirector) return teams; // Directors see all IN THEIR ORGANIZATION (Already filtered by AdminTab)
      if (isManager) return teams.filter(t => t.leaderId === currentUser.id); // Managers see only their team
      return [];
  }, [teams, currentUser, isDirector, isManager]);

  // 2. Filter Visible Advisors (Advisors in visible teams + Unassigned if Director)
  const visibleAdvisors = useMemo(() => {
      if (isDirector) return advisors; // Directors see everyone IN THEIR ORGANIZATION
      
      const myTeamIds = visibleTeams.map(t => t.id);
      return advisors.filter(a => {
          // You see yourself
          if (a.id === currentUser.id) return true;
          // You see members of your team
          if (a.teamId && myTeamIds.includes(a.teamId)) return true;
          return false;
      });
  }, [advisors, visibleTeams, currentUser, isDirector]);

  const pendingUsers = visibleAdvisors.filter(a => a.status === 'pending');
  const activeUsers = visibleAdvisors.filter(a => a.status === 'active' || a.status === 'approved');

  // Leaders for dropdowns (Filtered scope)
  const potentialLeaders = isDirector 
      ? advisors.filter(a => (a.role === 'director' || a.role === 'manager') && (a.status === 'active' || a.status === 'approved'))
      : [currentUser]; // Managers can only assign themselves if creating a sub-unit (rare)

  // Global Directors (For Reporting To dropdown)
  const globalDirectors = advisors.filter(a => (a.role === 'director' || a.isAgencyAdmin));

  // --- HIERARCHY GROUPING ---
  const groupedAdvisors = useMemo(() => {
      const groups: { [key: string]: Advisor[] } = {};
      const unassigned: Advisor[] = [];

      activeUsers.forEach(user => {
          if (user.teamId && user.role === 'advisor') {
              if (!groups[user.teamId]) groups[user.teamId] = [];
              groups[user.teamId].push(user);
          } else {
              unassigned.push(user);
          }
      });

      return { groups, unassigned };
  }, [activeUsers]);

  // --- ORG TREE CONSTRUCTION (FOR VISUALIZATION) ---
  const orgTree = useMemo(() => {
      const relevantDirectors = isDirector 
          ? globalDirectors 
          : globalDirectors.filter(d => d.id === currentUser.teamId);

      const tree = relevantDirectors.map(dir => {
          const directReportManagers = visibleAdvisors.filter(a => a.role === 'manager' && a.teamId === dir.id);
          
          const units = directReportManagers.map(mgr => {
              const team = visibleTeams.find(t => t.leaderId === mgr.id);
              const members = team ? (groupedAdvisors.groups[team.id] || []) : [];
              return { manager: mgr, team, members };
          });

          return { director: dir, units };
      }).filter(node => node.units.length > 0 || isDirector);

      const assignedManagerIds = new Set(tree.flatMap(d => d.units.map(u => u.manager.id)));
      
      const independentManagers = visibleAdvisors.filter(a => 
          a.role === 'manager' && !assignedManagerIds.has(a.id)
      );
      
      const independentUnits = independentManagers.map(mgr => {
          const team = visibleTeams.find(t => t.leaderId === mgr.id);
          const members = team ? (groupedAdvisors.groups[team.id] || []) : [];
          return { manager: mgr, team, members };
      });

      return { tree, independentUnits };
  }, [globalDirectors, visibleAdvisors, visibleTeams, groupedAdvisors, isDirector, currentUser]);


  // ... (Keep existing Modal Open/Close/Save Logic) ...
  const openInviteModal = () => {
      setModalType('invite');
      setModalTab('details');
      setFormName('');
      setFormEmail('');
      setFormRole('advisor');
      setFormReportingTo('');
      setFormStatus('active');
      setFormBanding('50');
      setFormTier('free');
      setFormModules([]);
  };

  const openEditModal = (user: Advisor) => {
      setModalType('edit');
      setModalTab('details');
      setEditingUser(user);
      setFormName(user.name);
      setFormEmail(user.email);
      setFormRole(user.role);
      setFormReportingTo(user.teamId || ''); 
      setFormStatus(user.status as 'active' | 'pending' | 'rejected' | 'approved');
      setFormBanding(user.bandingPercentage?.toString() || '0');
      setFormTier(user.subscriptionTier || 'free');
      setFormModules(user.modules || []);
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
          teamId: formReportingTo || undefined, 
          status: (formStatus === 'active' ? 'approved' : formStatus) as 'active' | 'pending' | 'rejected' | 'approved',
          bandingPercentage: parseFloat(formBanding) || 0,
          subscriptionTier: formTier,
          modules: formModules
      };
      if (modalType === 'edit' && editingUser) {
          onUpdateAdvisor({ ...editingUser, ...userData });
      } else {
          const newAdvisor: Advisor = {
              id: `adv_${Date.now()}`,
              avatar: formName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase(),
              joinedAt: new Date().toISOString(),
              organizationId: currentUser.organizationId,
              isAgencyAdmin: false, 
              extraSlots: 0,
              is_admin: false,
              ...userData
          };
          onAddAdvisor(newAdvisor);
          alert(`Invitation sent to ${formEmail}. User activated.`);
      }
      closeModal();
  };

  const toggleModule = (modId: string) => {
      if (formModules.includes(modId)) setFormModules(formModules.filter(m => m !== modId));
      else setFormModules([...formModules, modId]);
  };

  const handleApprove = (user: Advisor) => {
    const banding = parseFloat(bandingInputs[user.id] || '0');
    if (banding <= 0 || isNaN(banding)) { alert("Please enter a valid Banding % before approving."); return; }
    onUpdateAdvisor({ ...user, status: 'approved', bandingPercentage: banding });
    const newInputs = { ...bandingInputs }; delete newInputs[user.id]; setBandingInputs(newInputs);
  };

  const handleReject = (user: Advisor) => {
    if(confirm(`Reject ${user.name}?`)) onUpdateAdvisor({ ...user, status: 'rejected', bandingPercentage: 0 });
  };

  const handleBandingChange = (id: string, value: string) => setBandingInputs(prev => ({...prev, [id]: value}));
  const handleActiveBandingUpdate = (user: Advisor, newVal: string) => onUpdateAdvisor({ ...user, bandingPercentage: parseFloat(newVal) || 0 });
  const handleGoalUpdate = async (user: Advisor, newGoal: string) => {
      const val = parseFloat(newGoal);
      onUpdateAdvisor({ ...user, annualGoal: isNaN(val) ? 0 : val });
      if (supabase) await supabase.from('profiles').update({ annual_goal: isNaN(val) ? 0 : val }).eq('id', user.id);
  };

  const handleCreateTeamTab = () => {
      if (!newTeamName || !newTeamLeader) return;
      const newTeam: Team = { id: `team_${Date.now()}`, name: newTeamName, leaderId: newTeamLeader };
      onUpdateTeams([...teams, newTeam]);
      setNewTeamName(''); setNewTeamLeader('');
  };

  const handleDeleteTeam = (id: string) => {
      if (confirm("Delete this team? Members will be unassigned.")) {
          onUpdateTeams(teams.filter(t => t.id !== id));
          const teamUsers = advisors.filter(a => a.teamId === id);
          teamUsers.forEach(u => onUpdateAdvisor({...u, teamId: undefined}));
      }
  };

  return (
    <div className="p-8 bg-slate-50 min-h-full animate-fade-in relative">
        <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Agency Management</h1>
                    <div className="flex items-center gap-2 text-slate-500 mt-1">
                        <span>Manage advisors, approvals, and team structures.</span>
                        {/* Visible Organization Label */}
                        <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                            {orgName}
                        </span>
                    </div>
                </div>
                {/* Only Directors/Admins can invite new advisors usually, but letting managers invite too if needed */}
                <button onClick={openInviteModal} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-800 transition-all">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                    Invite Advisor
                </button>
            </div>

            <div className="flex gap-4 mb-6 border-b border-slate-200">
                <button onClick={() => setActiveTab('users')} className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'users' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'}`}>
                    Advisors & Approvals
                </button>
                {/* Managers and Directors can see Teams/Hierarchy */}
                {(isDirector || isManager) && (
                    <button onClick={() => setActiveTab('teams')} className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'teams' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'}`}>
                        Org Chart & Units
                    </button>
                )}
            </div>

            {/* USERS TAB */}
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
                                                        type="number" min="0" max="100" placeholder="e.g. 50"
                                                        className="w-24 px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900"
                                                        value={bandingInputs[user.id] || ''}
                                                        onChange={(e) => handleBandingChange(user.id, e.target.value)}
                                                    />
                                                    <span className="text-slate-400">%</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right space-x-2">
                                                <button onClick={() => handleReject(user)} className="px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">Reject</button>
                                                <button onClick={() => handleApprove(user)} className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors">Approve</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ACTIVE USERS HIERARCHY LIST */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[200px]">
                    <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                        <h2 className="font-semibold text-slate-700">{isManager ? 'My Unit Roster' : 'Agency Roster'}</h2>
                        <span className="text-xs text-slate-400 font-medium">{activeUsers.length} members visible</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[800px] text-left text-sm">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-3 font-semibold text-slate-600">Advisor</th>
                                    <th className="px-6 py-3 font-semibold text-slate-600">Email</th>
                                    <th className="px-6 py-3 font-semibold text-slate-600">Banding</th>
                                    <th className="px-6 py-3 font-semibold text-slate-600">FY Goal ($)</th>
                                    <th className="px-6 py-3 font-semibold text-slate-600 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {activeUsers.length === 0 ? (
                                    <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">No active advisors found.</td></tr>
                                ) : (
                                    <>
                                        {groupedAdvisors.unassigned.map(u => {
                                            const reportingDirector = u.role === 'manager' && u.teamId ? advisors.find(a => a.id === u.teamId)?.name : undefined;
                                            return <AdvisorRow key={u.id} user={u} directorName={reportingDirector} onBandingUpdate={handleActiveBandingUpdate} onGoalUpdate={handleGoalUpdate} onEdit={openEditModal} onDelete={onDeleteAdvisor} readOnly={!isDirector && u.id !== currentUser.id} />;
                                        })}
                                        {visibleTeams.map(team => {
                                            const teamMembers = groupedAdvisors.groups[team.id] || [];
                                            const leader = advisors.find(a => a.id === team.leaderId);
                                            const leaderDirector = leader?.role === 'manager' && leader.teamId ? advisors.find(a => a.id === leader.teamId)?.name : undefined;
                                            return (
                                                <React.Fragment key={team.id}>
                                                    <tr className="bg-indigo-50/30">
                                                        <td colSpan={5} className="px-6 py-3 border-y border-slate-100">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-black text-indigo-800 uppercase tracking-wider">Unit: {team.name}</span>
                                                                {/* Explicit Manager Display */}
                                                                <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                                                                    <span className="text-slate-300">|</span> 
                                                                    Manager: <strong className="text-slate-700">{leader?.name || 'Unassigned'}</strong>
                                                                </span>
                                                                <span className="text-[10px] bg-white border border-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold ml-auto">{teamMembers.length} Members</span>
                                                                {leader && leaderDirector && <span className="ml-3 text-[10px] text-indigo-400 font-medium">Reports to: <b>{leaderDirector}</b></span>}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {teamMembers.map(u => <AdvisorRow key={u.id} user={u} isLeader={u.id === team.leaderId} onBandingUpdate={handleActiveBandingUpdate} onGoalUpdate={handleGoalUpdate} onEdit={openEditModal} onDelete={onDeleteAdvisor} readOnly={isManager && u.role === 'manager'} />)}
                                                </React.Fragment>
                                            );
                                        })}
                                    </>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            )}

            {/* TEAMS TAB */}
            {activeTab === 'teams' && (isDirector || isManager) && (
                <div className="space-y-12">
                    {/* VISUAL ORG CHART */}
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <span>🏛️</span> Organizational Chart
                        </h2>
                        
                        {/* Directors Level */}
                        <div className="grid grid-cols-1 gap-8">
                            {orgTree.tree.map((node, i) => (
                                <div key={node.director.id} className="bg-white rounded-2xl border-2 border-slate-200 shadow-lg overflow-hidden">
                                    {/* Director Header */}
                                    <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center text-xl font-bold border-2 border-white">{node.director.avatar}</div>
                                            <div>
                                                <h3 className="text-xl font-bold">{node.director.name}</h3>
                                                <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">{orgName} Director</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-2xl font-black">{node.units.reduce((sum, u) => sum + u.members.length, 0) + node.units.length}</div>
                                            <div className="text-[10px] text-slate-400 uppercase font-bold">Total Headcount</div>
                                        </div>
                                    </div>

                                    {/* Units Grid */}
                                    <div className="p-6 bg-slate-50">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {node.units.map(unit => (
                                                <div key={unit.team?.id || unit.manager.id} className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col relative overflow-hidden">
                                                    {/* Manager Header */}
                                                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-indigo-50/30">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">{unit.manager.avatar}</div>
                                                            <div>
                                                                <h4 className="text-sm font-bold text-slate-800">{unit.manager.name}</h4>
                                                                <p className="text-[10px] text-slate-500 uppercase tracking-wide">{unit.team?.name || 'Unassigned Unit'}</p>
                                                            </div>
                                                        </div>
                                                        {isDirector && (
                                                            <button 
                                                                onClick={() => unit.team && handleDeleteTeam(unit.team.id)}
                                                                className="text-xs text-slate-300 hover:text-rose-500"
                                                                title="Disband Unit"
                                                            >
                                                                ✕
                                                            </button>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Visual Connector for Managers */}
                                                    <div className="bg-slate-100 px-4 py-1 text-[9px] text-slate-400 font-bold uppercase border-b border-slate-100 flex items-center gap-1">
                                                        <span>↳ Reports to {node.director.name}</span>
                                                    </div>
                                                    
                                                    {/* Advisors List */}
                                                    <div className="p-4 flex-1">
                                                        {unit.members.length > 0 ? (
                                                            <ul className="space-y-2">
                                                                {unit.members.map(adv => (
                                                                    <li key={adv.id} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                                        <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center text-[9px] font-bold text-slate-400 border border-slate-200">{adv.avatar}</div>
                                                                        <span>{adv.name}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        ) : (
                                                            <div className="text-center py-4 text-xs text-slate-300 italic">No advisors assigned yet.</div>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Footer stats */}
                                                    <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50 text-[10px] text-slate-400 flex justify-between">
                                                        <span>{unit.members.length} Advisors</span>
                                                        <span className="font-mono">{unit.manager.email}</span>
                                                    </div>
                                                </div>
                                            ))}
                                            {node.units.length === 0 && (
                                                <div className="col-span-full py-8 text-center text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                                                    No units currently visible in this branch.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Unassigned / Orphaned Units (Only show if Director or if it's the manager themselves) */}
                        {orgTree.independentUnits.length > 0 && (
                            <div className="mt-8">
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Independent Units (No Director Assigned)</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    {orgTree.independentUnits.map(unit => (
                                        <div key={unit.manager.id} className="bg-white rounded-xl border-2 border-slate-200 border-dashed p-4 opacity-75 hover:opacity-100 transition-opacity">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold">{unit.manager.avatar}</div>
                                                <div>
                                                    <h4 className="text-sm font-bold text-slate-700">{unit.manager.name}</h4>
                                                    <p className="text-[10px] text-slate-400">{unit.team?.name || 'No Team'}</p>
                                                </div>
                                            </div>
                                            <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded text-center">
                                                {unit.members.length} Advisors
                                            </div>
                                            {isDirector && (
                                                <div className="mt-2 text-center">
                                                    <button onClick={() => openEditModal(unit.manager)} className="text-[10px] text-indigo-500 font-bold hover:underline">Assign Director</button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Create Team Form (Bottom) - Only for Directors */}
                    {isDirector && (
                        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm max-w-lg">
                            <h3 className="font-bold text-slate-800 mb-6">Initialize New Unit</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Unit / Team Name</label>
                                    <input 
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                        placeholder="e.g. Wolfpack"
                                        value={newTeamName}
                                        onChange={e => setNewTeamName(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Assign Manager</label>
                                    <select 
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={newTeamLeader}
                                        onChange={e => setNewTeamLeader(e.target.value)}
                                    >
                                        <option value="">Select Manager...</option>
                                        {potentialLeaders.map(d => (
                                            <option key={d.id} value={d.id}>{d.name} ({d.role})</option>
                                        ))}
                                    </select>
                                    <p className="text-[10px] text-slate-400 mt-1 italic">Can't find the manager? Invite them as a user with 'Manager' role first.</p>
                                </div>
                                <button 
                                    onClick={handleCreateTeamTab}
                                    disabled={!newTeamName || !newTeamLeader}
                                    className="w-full bg-slate-900 text-white font-bold py-3 rounded-lg text-sm shadow hover:bg-slate-800 disabled:opacity-50 transition-all"
                                >
                                    Create Unit
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* ... (Keep existing Invite Modal logic) ... */}
        {modalType && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in" onClick={closeModal}>
                <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
                    <div className="bg-slate-900 px-6 py-4 flex justify-between items-center">
                        <h3 className="text-white font-bold text-lg">{modalType === 'invite' ? 'Invite Advisor' : 'Edit Advisor'}</h3>
                        <button onClick={closeModal} className="text-slate-400 hover:text-white"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                    
                    {/* Tabs */}
                    <div className="flex bg-slate-50 border-b border-slate-100">
                        <button onClick={() => setModalTab('details')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${modalTab === 'details' ? 'bg-white border-t-2 border-t-slate-900 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>Profile</button>
                        <button onClick={() => setModalTab('access')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${modalTab === 'access' ? 'bg-white border-t-2 border-t-slate-900 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>Access Control</button>
                    </div>

                    <div className="p-6 space-y-4">
                        {modalTab === 'details' ? (
                            <>
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
                                            onChange={e => {
                                                setFormRole(e.target.value as UserRole);
                                                setFormReportingTo(''); // Reset selection on role change
                                            }}
                                        >
                                            <option value="advisor">Advisor</option>
                                            <option value="manager">Manager</option>
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
                                            <option value="rejected">Rejected</option>
                                            <option value="approved">Approved</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                                            {formRole === 'advisor' ? 'Assign Team (Unit)' : (formRole === 'manager' ? 'Reports To (Director)' : 'Team/Director')}
                                        </label>
                                        <select 
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={formReportingTo}
                                            onChange={e => setFormReportingTo(e.target.value)}
                                        >
                                            <option value="">Unassigned</option>
                                            {formRole === 'advisor' && visibleTeams.map(t => (
                                                <option key={t.id} value={t.id}>
                                                    {t.name} (Mgr: {advisors.find(a => a.id === t.leaderId)?.name || 'None'})
                                                </option>
                                            ))}
                                            {formRole === 'manager' && globalDirectors.map(d => <option key={d.id} value={d.id}>Dir: {d.name}</option>)}
                                        </select>
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
                            </>
                        ) : (
                            <>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Subscription Tier (Client Limits)</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['free', 'platinum', 'diamond'].map(tier => (
                                            <button 
                                                key={tier}
                                                onClick={() => setFormTier(tier as SubscriptionTier)}
                                                className={`py-2 rounded-lg text-xs font-bold uppercase border-2 transition-all ${formTier === tier ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-300'}`}
                                            >
                                                {tier}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                
                                <div className="pt-2 border-t border-slate-100">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-3">Module Overrides</label>
                                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                                        {AVAILABLE_MODULES.map(module => (
                                            <label key={module.id} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100">
                                                <input 
                                                    type="checkbox" 
                                                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                                    checked={formModules.includes(module.id)}
                                                    onChange={() => toggleModule(module.id)}
                                                />
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm">{module.icon}</span>
                                                    <span className="text-xs font-semibold text-slate-700">{module.label}</span>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-2 italic">Selected modules will be accessible regardless of Tier limits.</p>
                                </div>
                            </>
                        )}

                        <div className="pt-4 border-t border-slate-100">
                            <button 
                                onClick={handleSaveUser}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-500/30 transition-all"
                            >
                                {modalType === 'invite' ? 'Send Invitation & Activate' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
