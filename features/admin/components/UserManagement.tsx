
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

// Helper for generating robust IDs
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try { return crypto.randomUUID(); } catch(e) {}
  }
  return 'team_' + Math.random().toString(36).substr(2, 9);
};

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
}> = ({ user, isLeader = false, directorName, onBandingUpdate, onGoalUpdate, onEdit, onDelete, readOnly, canDelete = false }) => {
  // Local state to prevent input jitter/focus loss
  const [banding, setBanding] = useState(user.bandingPercentage?.toString() || '0');
  const [goal, setGoal] = useState(user.annualGoal?.toString() || '0');

  // Sync with prop updates if they come from outside
  useEffect(() => {
      setBanding(user.bandingPercentage?.toString() || '0');
  }, [user.bandingPercentage]);

  useEffect(() => {
      setGoal(user.annualGoal?.toString() || '0');
  }, [user.annualGoal]);

  const handleBandingBlur = () => {
      if (banding !== user.bandingPercentage?.toString()) {
          onBandingUpdate(user, banding);
      }
  };

  const handleGoalBlur = () => {
      if (goal !== user.annualGoal?.toString()) {
          onGoalUpdate(user, goal);
      }
  };

  return (
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
                    value={banding}
                    onChange={(e) => setBanding(e.target.value)}
                    onBlur={handleBandingBlur}
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
                    value={goal}
                    placeholder="0"
                    onChange={(e) => setGoal(e.target.value)}
                    onBlur={handleGoalBlur}
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
};

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
      let role = (user.role || 'advisor').toLowerCase();
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
              const newTeamId = generateId();
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
      try {
          const val = parseFloat(newGoal);
          // Safely call async parent method without risking crash
          await onUpdateAdvisor({ ...user, annualGoal: isNaN(val) ? 0 : val });
      } catch (e) {
          console.error("Failed to update goal:", e);
      }
  };

  const handleCreateTeamTab = () => {
      if (!newTeamName || !newTeamLeader) return;
      const newTeam: Team = { id: generateId(), name: newTeamName, leaderId: newTeamLeader };
      onUpdateTeams([...teams, newTeam]);
      setNewTeamName(''); setNewTeamLeader('');
      setIsCreateUnitOpen(false);
      toast.success("Unit created successfully.");
  };

  const handleCreateTeamForManager = (manager: Advisor) => {
      const name = prompt(`Enter a new Unit name for ${manager.name}:`);
      if (!name) return;
      const newTeam: Team = { id: generateId(), name, leaderId: manager.id };
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
                <div className="flex gap-4 items-center">
                    <h2 className="font-semibold text-slate-700">{isManager ? 'My Unit Roster' : 'Agency Roster'}</h2>
                    {isDirector && (
                        <button onClick={() => openInviteModal()} className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg font-bold shadow-sm hover:bg-slate-800 transition-colors">
                            + Invite Advisor
                        </button>
                    )}
                </div>
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

        {/* RESTORED MODAL FOR EDITING/INVITING USERS */}
        <Modal
          isOpen={!!modalType}
          onClose={closeModal}
          title={modalType === 'invite' ? 'Invite New Advisor' : modalType === 'new_org' ? 'Create Organization' : 'Edit Profile'}
          footer={
             <div className="flex gap-2 w-full justify-end">
                <Button variant="ghost" onClick={closeModal}>Cancel</Button>
                <Button variant="primary" onClick={handleSaveUser}>
                    {modalType === 'invite' ? 'Send Invite' : 'Save Changes'}
                </Button>
             </div>
          }
       >
          <div className="space-y-6">
             <div className="flex border-b border-slate-100 mb-4">
                <button onClick={() => setModalTab('details')} className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors ${modalTab === 'details' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>Profile Details</button>
                <button onClick={() => setModalTab('access')} className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors ${modalTab === 'access' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>Access & Modules</button>
             </div>

             {modalTab === 'details' ? (
                 <div className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Full Name</label>
                        <input className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-bold text-slate-900 outline-none focus:border-indigo-500" value={formName} onChange={e => setFormName(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Email Address</label>
                        <input className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-bold text-slate-900 outline-none focus:border-indigo-500" value={formEmail} onChange={e => setFormEmail(e.target.value)} disabled={modalType === 'edit'} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">System Role</label>
                            <select className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-bold text-slate-900 outline-none" value={formRole} onChange={e => setFormRole(e.target.value)}>
                                <option value="advisor">Advisor</option>
                                <option value="manager">Manager</option>
                                {isSuperAdmin && <option value="director">Director</option>}
                                {isSuperAdmin && <option value="admin">Super Admin</option>}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Account Status</label>
                            <select className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-bold text-slate-900 outline-none" value={formStatus} onChange={e => setFormStatus(e.target.value as any)}>
                                <option value="approved">Active</option>
                                <option value="pending">Pending</option>
                                <option value="rejected">Suspended</option>
                            </select>
                        </div>
                    </div>
                    
                    {formRole !== 'director' && formRole !== 'admin' && (
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Reporting To (Unit)</label>
                            <select className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-bold text-slate-900 outline-none" value={formReportingTo} onChange={e => setFormReportingTo(e.target.value)}>
                                <option value="">-- Direct to Director --</option>
                                {formVisibleTeams.map(t => (
                                    <option key={t.id} value={t.id}>Unit: {t.name}</option>
                                ))}
                                {formManagersWithoutTeams.map(m => (
                                    <option key={`create_for_${m.id}`} value={`create_for_${m.id}`}>+ Create Unit for {m.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                 </div>
             ) : (
                 <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">License Tier</label>
                            <select className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-bold text-slate-900 outline-none" value={formTier} onChange={e => setFormTier(e.target.value as SubscriptionTier)}>
                                <option value="free">Free (Trial)</option>
                                <option value="platinum">Platinum</option>
                                <option value="diamond">Diamond</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Banding %</label>
                            <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-bold text-slate-900 outline-none" value={formBanding} onChange={e => setFormBanding(e.target.value)} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Module Permissions</label>
                        <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto custom-scrollbar p-1">
                            {AVAILABLE_MODULES.map(mod => (
                                <button
                                    key={mod.id}
                                    onClick={() => toggleModule(mod.id)}
                                    className={`px-3 py-2.5 rounded-lg text-xs font-bold text-left border transition-all flex items-center gap-2 ${
                                        formModules.includes(mod.id) 
                                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' 
                                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                    }`}
                                >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${formModules.includes(mod.id) ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                                        {formModules.includes(mod.id) && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                                    </div>
                                    <span className="truncate">{mod.label}</span>
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 italic">
                            Modules checked here will be visible in the user's sidebar. Uncheck to restrict access.
                        </p>
                    </div>
                 </div>
             )}
          </div>
       </Modal>
    </div>
  );
};
