
import React, { useState, useMemo, useEffect } from 'react';
import { Advisor, Team, UserRole, SubscriptionTier } from '../../../types';
import { TAB_DEFINITIONS } from '../../../lib/config';
import { supabase } from '../../../lib/supabase';
import { adminDb } from '../../../lib/db/admin'; 
import Modal from '../../../components/ui/Modal'; 
import Button from '../../../components/ui/Button'; 
import { useToast } from '../../../contexts/ToastContext';

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

// Reusable Advisor Row Component
const AdvisorRow: React.FC<{
  user: Advisor;
  isLeader?: boolean;
  directorName?: string;
  onBandingUpdate: (user: Advisor, val: string) => void;
  onGoalUpdate: (user: Advisor, val: string) => void;
  onEdit: (user: Advisor) => void;
  onDelete: (id: string) => void;
  readOnly?: boolean;
  canDelete?: boolean;
}> = ({ user, isLeader = false, directorName, onBandingUpdate, onGoalUpdate, onEdit, onDelete, readOnly, canDelete = false }) => (
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
                {canDelete && (
                    <button onClick={() => onDelete(user.id)} className="text-xs text-rose-500 hover:text-rose-700 font-medium bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded transition-colors ml-2">Delete</button>
                )}
              </>
          )}
      </td>
  </tr>
);

export const UserManagement: React.FC<UserManagementProps> = ({ advisors, teams, currentUser, onUpdateAdvisor, onDeleteAdvisor, onUpdateTeams, onAddAdvisor }) => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'users' | 'teams'>('users');
  const [bandingInputs, setBandingInputs] = useState<Record<string, string>>({});
  
  // Create Unit State
  const [isCreateUnitOpen, setIsCreateUnitOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamLeader, setNewTeamLeader] = useState('');
  
  // Managing Unit State
  const [managingTeam, setManagingTeam] = useState<Team | null>(null);

  // Invite/Edit Modal State
  const [modalType, setModalType] = useState<'invite' | 'edit' | 'new_org' | null>(null);
  const [editingUser, setEditingUser] = useState<Advisor | null>(null);
  const [modalTab, setModalTab] = useState<'details' | 'access'>('details');
  const [systemOrgName, setSystemOrgName] = useState<string>('Sproutly Organization');
  
  // Organization Filter State (For Super Admins)
  const [selectedOrgId, setSelectedOrgId] = useState<string>(currentUser.organizationId || 'org_default');

  // Form State
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<string>('advisor');
  const [formReportingTo, setFormReportingTo] = useState('');
  const [formStatus, setFormStatus] = useState<'active' | 'pending' | 'rejected' | 'approved'>('active');
  const [formBanding, setFormBanding] = useState<string>('50');
  const [formTier, setFormTier] = useState<SubscriptionTier>('free');
  const [formModules, setFormModules] = useState<string[]>([]);
  const [formOrgId, setFormOrgId] = useState('');

  // --- VISIBILITY PERMISSIONS ---
  const isSuperAdmin = currentUser.role === 'admin' || currentUser.is_admin === true;
  const isDirector = currentUser.role === 'director' || isSuperAdmin;
  const isManager = currentUser.role === 'manager';

  // Load Org Name Effect
  useEffect(() => {
      adminDb.getSystemSettings().then(res => {
          if (res?.appSettings && (res.appSettings as any).agencyName) {
              setSystemOrgName((res.appSettings as any).agencyName);
          }
      });
  }, []);

  // Update selected Org if user changes (or on init)
  useEffect(() => {
      if (currentUser.organizationId && !isSuperAdmin) {
          setSelectedOrgId(currentUser.organizationId);
      }
  }, [currentUser, isSuperAdmin]);

  // --- DERIVED DATA ---

  // 1. Unique Organizations (for Super Admin Switcher)
  const uniqueOrgs = useMemo(() => {
      const orgs = new Map<string, string>(); 
      advisors.forEach(a => {
          if (a.organizationId) {
              const label = a.role === 'director' ? `${a.name}'s Agency` : a.organizationId;
              if (!orgs.has(a.organizationId)) orgs.set(a.organizationId, label);
          }
      });
      // Ensure current is in list
      if (!orgs.has('org_default')) orgs.set('org_default', systemOrgName);
      return Array.from(orgs.entries()).map(([id, name]) => ({ id, name }));
  }, [advisors, systemOrgName]);

  // 2. Filter Advisors by Selected Org
  const orgAdvisors = useMemo(() => {
      if (isSuperAdmin && selectedOrgId === 'all') return advisors;
      return advisors.filter(a => a.organizationId === selectedOrgId);
  }, [advisors, selectedOrgId, isSuperAdmin]);

  // 3. Filter Visible Teams (Based on OrgAdvisors)
  const visibleTeams = useMemo(() => {
      return teams.filter(t => {
          const leader = advisors.find(a => a.id === t.leaderId);
          if (leader && leader.organizationId === selectedOrgId) return true;
          if (isManager && t.leaderId === currentUser.id) return true;
          return false;
      });
  }, [teams, advisors, selectedOrgId, isManager, currentUser]);

  // 4. Final Visible Advisors List (Hierarchy applied)
  const visibleAdvisors = useMemo(() => {
      if (isDirector) return orgAdvisors;
      
      const myTeamIds = visibleTeams.map(t => t.id);
      return orgAdvisors.filter(a => {
          if (a.id === currentUser.id) return true;
          if (a.teamId && myTeamIds.includes(a.teamId)) return true;
          return false;
      });
  }, [orgAdvisors, visibleTeams, currentUser, isDirector]);

  const pendingUsers = visibleAdvisors.filter(a => a.status === 'pending');
  const activeUsers = visibleAdvisors.filter(a => a.status === 'active' || a.status === 'approved');

  // Leaders for dropdowns (Must be in current Org)
  const potentialLeaders = useMemo(() => {
      return orgAdvisors.filter(a => (a.role === 'director' || a.role === 'manager') && (a.status === 'active' || a.status === 'approved'));
  }, [orgAdvisors]);

  // --- MODAL DERIVED DATA (Dynamic based on formOrgId) ---
  const formVisibleTeams = useMemo(() => {
      const targetOrg = formOrgId || selectedOrgId;
      return teams.filter(t => {
          const leader = advisors.find(a => a.id === t.leaderId);
          // Permissive check: If leader is missing from list (due to filters), we still show the team
          // if we are Admin/Director. If leader exists, we check Org ID.
          if (!leader) return true; 
          return leader.organizationId === targetOrg;
      });
  }, [teams, advisors, formOrgId, selectedOrgId]);

  const formManagersWithoutTeams = useMemo(() => {
      const targetOrg = formOrgId || selectedOrgId;
      const activeManagers = advisors.filter(a => 
          a.role === 'manager' && 
          (a.status === 'active' || a.status === 'approved') &&
          a.organizationId === targetOrg
      );
      return activeManagers.filter(m => !teams.find(t => t.leaderId === m.id));
  }, [advisors, teams, formOrgId, selectedOrgId]);

  const formGlobalDirectors = useMemo(() => {
      const targetOrg = formOrgId || selectedOrgId;
      return advisors.filter(a => (a.role === 'director' || a.isAgencyAdmin) && a.organizationId === targetOrg);
  }, [advisors, formOrgId, selectedOrgId]);


  // Global Directors (For hierarchy tree in dashboard)
  const globalDirectors = orgAdvisors.filter(a => (a.role === 'director' || a.isAgencyAdmin));

  // --- HIERARCHY GROUPING ---
  const groupedAdvisors = useMemo(() => {
      const groups: { [key: string]: Advisor[] } = {};
      const unassigned: Advisor[] = [];

      activeUsers.forEach(user => {
          const isAssignable = ['advisor', 'user', 'viewer'].includes(user.role);
          if (isAssignable) {
              if (user.teamId) {
                  if (!groups[user.teamId]) groups[user.teamId] = [];
                  groups[user.teamId].push(user);
              } else {
                  unassigned.push(user);
              }
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


  const openInviteModal = (prefillTeamId?: string) => {
      setModalType('invite');
      setModalTab('details');
      setFormName('');
      setFormEmail('');
      setFormRole('advisor');
      setFormReportingTo(prefillTeamId || '');
      setFormStatus('active');
      setFormBanding('50');
      setFormTier('free');
      setFormModules([]);
      setFormOrgId(selectedOrgId);
  };

  const openNewOrgModal = () => {
      setModalType('new_org');
      setModalTab('details');
      setFormName('New Director');
      setFormEmail('');
      setFormRole('director');
      setFormReportingTo('');
      setFormStatus('active');
      setFormBanding('100');
      setFormTier('diamond');
      setFormModules([]);
      setFormOrgId(`org_${Date.now()}`); // Generate new Org ID
  };

  const openEditModal = (user: Advisor) => {
      setModalType('edit');
      setModalTab('details');
      setEditingUser(user);
      setFormName(user.name);
      setFormEmail(user.email);
      
      // Normalize role to lowercase
      let role = user.role.toLowerCase();
      // FIX: Map generic/viewer users to 'advisor' so the UI logic works correctly
      if (!['manager', 'director', 'admin'].includes(role)) {
          role = 'advisor';
      }
      setFormRole(role);
      
      setFormReportingTo(user.teamId || ''); 
      setFormStatus(user.status as 'active' | 'pending' | 'rejected' | 'approved');
      setFormBanding(user.bandingPercentage?.toString() || '0');
      setFormTier(user.subscriptionTier || 'free');
      setFormModules(user.modules || []);
      setFormOrgId(user.organizationId || selectedOrgId);
  };

  const closeModal = () => {
      setModalType(null);
      setEditingUser(null);
      setManagingTeam(null);
      setIsCreateUnitOpen(false);
  };

  const handleSaveUser = () => {
      if (!formName || !formEmail) {
          alert("Please provide both a Name and Email Address.");
          return;
      }

      let finalTeamId = formReportingTo || undefined;
      
      if (formReportingTo && formReportingTo.startsWith('create_for_')) {
          const managerId = formReportingTo.replace('create_for_', '');
          const manager = advisors.find(a => a.id === managerId);
          if (manager) {
              const newTeamId = `team_${Date.now()}`;
              const newTeam: Team = {
                  id: newTeamId,
                  name: `${manager.name.split(' ')[0]}'s Unit`,
                  leaderId: managerId
              };
              onUpdateTeams([...teams, newTeam]);
              finalTeamId = newTeamId;
          } else {
              finalTeamId = undefined;
          }
      } else if (formReportingTo === '') {
          finalTeamId = undefined;
      }

      const userData = {
          name: formName,
          email: formEmail,
          role: formRole as UserRole,
          teamId: finalTeamId, 
          status: (formStatus === 'active' ? 'approved' : formStatus) as 'active' | 'pending' | 'rejected' | 'approved',
          bandingPercentage: parseFloat(formBanding) || 0,
          subscriptionTier: formTier,
          modules: formModules,
          organizationId: formOrgId 
      };

      if (modalType === 'edit' && editingUser) {
          onUpdateAdvisor({ ...editingUser, ...userData });
      } else {
          // Invite / New Org
          const newAdvisor: Advisor = {
              id: `adv_${Date.now()}`,
              avatar: formName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase(),
              joinedAt: new Date().toISOString(),
              isAgencyAdmin: formRole === 'director' || modalType === 'new_org', 
              extraSlots: 0,
              is_admin: false,
              ...userData
          };
          onAddAdvisor(newAdvisor);
          
          if (modalType === 'new_org') {
              alert(`New Organization Created!\nDirector: ${formName}\nOrg ID: ${formOrgId}`);
              setSelectedOrgId(formOrgId); 
          } else {
              alert(`Invitation sent to ${formEmail}. User activated.`);
          }
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
      setIsCreateUnitOpen(false);
      toast.success("Unit created successfully.");
  };

  const handleCreateTeamForManager = (manager: Advisor) => {
      const name = prompt(`Enter a new Unit name for ${manager.name}:`);
      if (!name) return;
      const newTeam: Team = { id: `team_${Date.now()}`, name, leaderId: manager.id };
      onUpdateTeams([...teams, newTeam]);
  };

  const handleDeleteTeam = (id: string) => {
      if (confirm("Delete this team? Members will be unassigned.")) {
          onUpdateTeams(teams.filter(t => t.id !== id));
          const teamUsers = advisors.filter(a => a.teamId === id);
          teamUsers.forEach(u => onUpdateAdvisor({...u, teamId: undefined}));
      }
  };

  const handleAddToTeam = (advisor: Advisor, teamId: string) => {
      onUpdateAdvisor({ ...advisor, teamId });
  };

  const handleRemoveFromTeam = (advisor: Advisor) => {
      onUpdateAdvisor({ ...advisor, teamId: undefined });
  };

  return (
    <div className="p-8 bg-slate-50 min-h-full animate-fade-in relative">
        <div className="max-w-6xl mx-auto">
            {/* HEADER TOOLBAR */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
                <div>
                    {isSuperAdmin && uniqueOrgs.length > 1 ? (
                        <div className="mb-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Select Organization</label>
                            <div className="relative group">
                                <select 
                                    value={selectedOrgId} 
                                    onChange={(e) => setSelectedOrgId(e.target.value)}
                                    className="appearance-none bg-slate-900 text-white font-bold text-lg px-4 py-2 pr-10 rounded-xl outline-none hover:bg-slate-800 transition-colors cursor-pointer min-w-[250px]"
                                >
                                    {uniqueOrgs.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">▼</div>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">Agency Management</h1>
                            <div className="flex items-center gap-2 text-slate-500 mt-1">
                                <span>{systemOrgName}</span>
                                <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                                    {isDirector ? 'Director View' : 'Manager View'}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="flex gap-3">
                    {/* Add Unit Button - Top Level */}
                    {isDirector && (
                        <button 
                            onClick={() => setIsCreateUnitOpen(true)}
                            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50 transition-all"
                        >
                            <span>🏢</span> New Unit
                        </button>
                    )}

                    {/* Invite Button */}
                    <button onClick={() => openInviteModal()} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-800 transition-all">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                        Invite Advisor
                    </button>

                    {/* Super Admin: New Organization */}
                    {isSuperAdmin && (
                        <button onClick={openNewOrgModal} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-indigo-700 transition-all" title="Add New Organization">
                            <span>🌐</span> + Org
                        </button>
                    )}
                </div>
            </div>

            <div className="flex gap-4 mb-6 border-b border-slate-200">
                <button onClick={() => setActiveTab('users')} className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'users' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'}`}>
                    Advisors & Approvals
                </button>
                {(isDirector || isManager) && (
                    <button onClick={() => setActiveTab('teams')} className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'teams' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'}`}>
                        Org Chart & Units
                    </button>
                )}
            </div>

            {/* USERS TAB */}
            {activeTab === 'users' && (
            <div className="space-y-8 animate-fade-in">
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
                                            return <AdvisorRow key={u.id} user={u} directorName={reportingDirector} onBandingUpdate={handleActiveBandingUpdate} onGoalUpdate={handleGoalUpdate} onEdit={openEditModal} onDelete={onDeleteAdvisor} readOnly={!isDirector && u.id !== currentUser.id} canDelete={isDirector} />;
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
                                                                <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                                                                    <span className="text-slate-300">|</span> 
                                                                    Manager: <strong className="text-slate-700">{leader?.name || 'Unassigned'}</strong>
                                                                </span>
                                                                <span className="text-[10px] bg-white border border-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold ml-auto">{teamMembers.length} Members</span>
                                                                {leader && leaderDirector && <span className="ml-3 text-[10px] text-indigo-400 font-medium">Reports to: <b>{leaderDirector}</b></span>}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {teamMembers.map(u => <AdvisorRow key={u.id} user={u} isLeader={u.id === team.leaderId} onBandingUpdate={handleActiveBandingUpdate} onGoalUpdate={handleGoalUpdate} onEdit={openEditModal} onDelete={onDeleteAdvisor} readOnly={isManager && u.role === 'manager'} canDelete={isDirector} />)}
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
                <div className="space-y-12 animate-fade-in">
                    
                    {groupedAdvisors.unassigned.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                            <h3 className="text-sm font-bold text-slate-600 mb-4 flex items-center gap-2">
                                <span>⚠️</span> Unassigned Advisors ({groupedAdvisors.unassigned.length})
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {groupedAdvisors.unassigned.map(u => (
                                    <div key={u.id} className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs">
                                        <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-500">{u.avatar}</div>
                                        <span className="font-bold text-slate-700">{u.name}</span>
                                        <span className="text-[9px] text-slate-400">{u.email}</span>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-3 italic">Use "Manage Team" on a Unit card below to assign these advisors.</p>
                        </div>
                    )}

                    {/* VISUAL ORG CHART */}
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <span>🏛️</span> Organizational Chart
                        </h2>
                        
                        <div className="grid grid-cols-1 gap-8">
                            {orgTree.tree.map((node, i) => (
                                <div key={node.director.id} className="bg-white rounded-2xl border-2 border-slate-200 shadow-lg overflow-hidden">
                                    <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center text-xl font-bold border-2 border-white">{node.director.avatar}</div>
                                            <div>
                                                <h3 className="text-xl font-bold">{node.director.name}</h3>
                                                <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">{systemOrgName} Director</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-2xl font-black">{node.units.reduce((sum, u) => sum + u.members.length, 0) + node.units.length}</div>
                                            <div className="text-[10px] text-slate-400 uppercase font-bold">Total Headcount</div>
                                        </div>
                                    </div>

                                    <div className="p-6 bg-slate-50">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {node.units.map(unit => (
                                                <div key={unit.team?.id || unit.manager.id} className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col relative overflow-hidden">
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
                                                    
                                                    <div className="bg-slate-100 px-4 py-1 text-[9px] text-slate-400 font-bold uppercase border-b border-slate-100 flex items-center justify-between">
                                                        <span>↳ Reports to {node.director.name}</span>
                                                    </div>
                                                    
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
                                                    
                                                    <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center">
                                                        {unit.team ? (
                                                            <button 
                                                                onClick={() => setManagingTeam(unit.team)} 
                                                                className="text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded transition-colors flex items-center gap-1"
                                                            >
                                                                ⚙ Manage Team
                                                            </button>
                                                        ) : (
                                                            <button 
                                                                onClick={() => handleCreateTeamForManager(unit.manager)} 
                                                                className="text-[10px] font-bold text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded transition-colors"
                                                            >
                                                                Initialize Unit
                                                            </button>
                                                        )}
                                                        <span className="text-[10px] text-slate-400">{unit.members.length} Advisors</span>
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
                                            
                                            <div className="flex justify-between items-center mt-2">
                                                {unit.team ? (
                                                    <button onClick={() => setManagingTeam(unit.team)} className="text-[10px] text-indigo-500 font-bold hover:underline">Manage</button>
                                                ) : (
                                                    <button onClick={() => handleCreateTeamForManager(unit.manager)} className="text-[10px] text-emerald-600 font-bold hover:underline">Init Unit</button>
                                                )}
                                                <div className="text-xs text-slate-500 bg-slate-50 p-1 px-2 rounded text-center">
                                                    {unit.members.length} Advisors
                                                </div>
                                            </div>

                                            {isDirector && (
                                                <div className="mt-2 text-center pt-2 border-t border-slate-100">
                                                    <button onClick={() => openEditModal(unit.manager)} className="text-[10px] text-slate-400 font-bold hover:text-indigo-500">Assign Director</button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>

        {/* --- MANAGE TEAM MODAL --- */}
        {managingTeam && (
            <Modal
                isOpen={!!managingTeam}
                onClose={() => setManagingTeam(null)}
                title={`Manage Unit: ${managingTeam.name}`}
                footer={<Button variant="ghost" onClick={() => setManagingTeam(null)}>Close</Button>}
            >
                <div className="space-y-6 max-h-96 overflow-y-auto custom-scrollbar p-1">
                    <div>
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Current Members</h4>
                        <div className="space-y-2">
                            {groupedAdvisors.groups[managingTeam.id]?.map(member => (
                                <div key={member.id} className="flex items-center justify-between bg-white border border-slate-200 p-2 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-[10px] font-bold">{member.avatar}</div>
                                        <span className="text-sm font-bold text-slate-700">{member.name}</span>
                                    </div>
                                    <button 
                                        onClick={() => handleRemoveFromTeam(member)}
                                        className="text-[10px] text-red-500 hover:bg-red-50 px-2 py-1 rounded font-bold"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}
                            {(!groupedAdvisors.groups[managingTeam.id] || groupedAdvisors.groups[managingTeam.id].length === 0) && (
                                <div className="text-center text-slate-400 text-xs italic py-2">No members in this unit yet.</div>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-slate-100 my-4"></div>

                    <div>
                        <h4 className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-3">Available to Add</h4>
                        <div className="space-y-2">
                            {groupedAdvisors.unassigned.length > 0 ? (
                                groupedAdvisors.unassigned.map(member => (
                                    <div key={member.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 p-2 rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[10px] font-bold">{member.avatar}</div>
                                            <div>
                                                <div className="text-sm font-bold text-slate-700">{member.name}</div>
                                                <div className="text-[9px] text-slate-400">{member.email}</div>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleAddToTeam(member, managingTeam.id)}
                                            className="text-[10px] bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-3 py-1.5 rounded font-bold"
                                        >
                                            + Add
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center text-slate-400 text-xs italic py-2">No unassigned advisors available. Invite new advisors first.</div>
                            )}
                        </div>
                    </div>
                    
                    <div className="border-t border-slate-100 pt-4 mt-4">
                        <button 
                            onClick={() => { closeModal(); openInviteModal(managingTeam.id); }}
                            className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-bold shadow hover:bg-slate-800"
                        >
                            + Invite New Advisor directly to Unit
                        </button>
                    </div>
                </div>
            </Modal>
        )}

        {/* --- CREATE UNIT MODAL --- */}
        {isCreateUnitOpen && (
            <Modal
                isOpen={isCreateUnitOpen}
                onClose={() => setIsCreateUnitOpen(false)}
                title="Initialize New Unit"
                footer={
                    <div className="flex gap-2 w-full">
                        <Button variant="ghost" onClick={() => setIsCreateUnitOpen(false)}>Cancel</Button>
                        <Button variant="primary" onClick={handleCreateTeamTab} disabled={!newTeamName || !newTeamLeader}>Create Unit</Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Unit / Team Name</label>
                        <input 
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                            placeholder="e.g. Wolfpack"
                            value={newTeamName}
                            onChange={e => setNewTeamName(e.target.value)}
                            autoFocus
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
                        <p className="text-[10px] text-slate-400 mt-1 italic">
                            Only approved Managers/Directors can lead units. Invite a Manager first if they are missing.
                        </p>
                    </div>
                </div>
            </Modal>
        )}

        {modalType && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in" onClick={closeModal}>
                <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
                    <div className="bg-slate-900 px-6 py-4 flex justify-between items-center">
                        <h3 className="text-white font-bold text-lg">
                            {modalType === 'invite' ? 'Invite Advisor' : modalType === 'new_org' ? 'Create Organization' : 'Edit Advisor'}
                        </h3>
                        <button onClick={closeModal} className="text-slate-400 hover:text-white"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                    
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
                                {modalType === 'new_org' && (
                                    <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                                        <label className="block text-xs font-bold text-indigo-700 uppercase mb-1">New Organization ID</label>
                                        <div className="font-mono text-xs text-indigo-900">{formOrgId}</div>
                                        <p className="text-[10px] text-indigo-500 mt-1">A fresh organization environment will be initialized.</p>
                                    </div>
                                )}
                                
                                {/* FIX: Email Input is ALWAYS rendered now */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email Address</label>
                                    <input 
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={formEmail}
                                        onChange={e => setFormEmail(e.target.value)}
                                        placeholder="e.g. john@agency.com"
                                    />
                                </div>
                                
                                {isSuperAdmin && modalType !== 'new_org' && (
                                    <div className="mb-4">
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Organization</label>
                                        <select
                                            value={formOrgId}
                                            onChange={(e) => setFormOrgId(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                        >
                                            {uniqueOrgs.map(org => (
                                                <option key={org.id} value={org.id}>{org.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                
                                {modalType !== 'new_org' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Role</label>
                                            <select 
                                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                                value={formRole}
                                                onChange={e => {
                                                    setFormRole(e.target.value as string);
                                                    if (modalType === 'edit') return; 
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
                                )}

                                {modalType !== 'new_org' && (
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
                                                {formRole === 'advisor' && (
                                                    <>
                                                        <optgroup label="Existing Units">
                                                            {formVisibleTeams.map(t => (
                                                                <option key={t.id} value={t.id}>
                                                                    {t.name} (Mgr: {advisors.find(a => a.id === t.leaderId)?.name || 'None'})
                                                                </option>
                                                            ))}
                                                        </optgroup>
                                                        {(isDirector || isSuperAdmin) && formManagersWithoutTeams.length > 0 && (
                                                            <optgroup label="Create New Unit For...">
                                                                {formManagersWithoutTeams.map(m => (
                                                                    <option key={m.id} value={`create_for_${m.id}`}>
                                                                        {m.name} (Manager)
                                                                    </option>
                                                                ))}
                                                            </optgroup>
                                                        )}
                                                    </>
                                                )}
                                                {formRole === 'manager' && formGlobalDirectors.map(d => <option key={d.id} value={d.id}>Dir: {d.name}</option>)}
                                            </select>
                                            {formRole === 'advisor' && formVisibleTeams.length === 0 && formManagersWithoutTeams.length === 0 && (
                                                <div className="mt-1">
                                                    <p className="text-[10px] text-amber-600 mb-1">No units found.</p>
                                                    <button onClick={() => { closeModal(); setIsCreateUnitOpen(true); }} className="text-[10px] font-bold text-indigo-600 hover:underline">
                                                        + Create New Unit
                                                    </button>
                                                </div>
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
                                )}
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
                                {modalType === 'new_org' ? 'Initialize Organization' : modalType === 'invite' ? 'Send Invitation & Activate' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
