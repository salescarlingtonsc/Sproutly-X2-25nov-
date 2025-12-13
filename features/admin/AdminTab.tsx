
import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { TIER_CONFIG, getClientLimit, TAB_DEFINITIONS } from '../../lib/config';

interface AdminUser {
  id: string;
  email: string;
  role: string;
  subscription_tier: string;
  status: string;
  extra_slots: number;
  created_at: string;
  modules?: string[]; // Granular modules list
}

// Sub-component for permission editing
interface PermissionEditorProps {
  user: AdminUser;
  isOpen: boolean;
  onClose: () => void;
  onSave: (modules: string[]) => void;
}

const PermissionEditor: React.FC<PermissionEditorProps> = ({ user, isOpen, onClose, onSave }) => {
  if (!isOpen) return null;

  // Initialize with existing modules OR fallback to tier defaults
  const currentTier = user.subscription_tier || 'free';
  const tierDefaults = TIER_CONFIG[currentTier as keyof typeof TIER_CONFIG]?.allowedTabs || [];
  // Use existing custom modules if present, otherwise use defaults
  const initialModules = (user.modules && user.modules.length > 0) ? user.modules : tierDefaults;

  const [selectedModules, setSelectedModules] = useState<string[]>(initialModules);

  const toggleModule = (tabId: string) => {
    if (selectedModules.includes(tabId)) {
      setSelectedModules(selectedModules.filter(m => m !== tabId));
    } else {
      setSelectedModules([...selectedModules, tabId]);
    }
  };

  const selectAll = () => {
    setSelectedModules(TAB_DEFINITIONS.map(t => t.id).filter(id => id !== 'admin'));
  };

  const clearAll = () => {
    setSelectedModules(['disclaimer', 'profile']); // Always keep minimum
  };

  const resetToTier = () => {
    setSelectedModules(tierDefaults);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 bg-gray-50 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-800">Customize Modules: {user.email}</h3>
          <p className="text-xs text-gray-500 mt-1">
            Current Tier: <span className="font-bold uppercase">{user.subscription_tier}</span>. 
            Checking specific modules below creates a <strong>Custom Plan</strong> for this user.
          </p>
        </div>
        
        <div className="p-5 overflow-y-auto flex-1">
          <div className="flex gap-2 mb-4">
            <button onClick={selectAll} className="px-3 py-1.5 bg-gray-100 text-xs font-bold rounded hover:bg-gray-200">Select All</button>
            <button onClick={clearAll} className="px-3 py-1.5 bg-gray-100 text-xs font-bold rounded hover:bg-gray-200">Clear</button>
            <button onClick={resetToTier} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded hover:bg-indigo-100 border border-indigo-200">Reset to {user.subscription_tier} Default</button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {TAB_DEFINITIONS.filter(t => t.id !== 'admin').map(tab => (
              <label key={tab.id} className={`flex items-center gap-3 p-3 rounded border cursor-pointer transition-colors ${selectedModules.includes(tab.id) ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                <input 
                  type="checkbox" 
                  checked={selectedModules.includes(tab.id)}
                  onChange={() => toggleModule(tab.id)}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                />
                <div className="flex items-center gap-2">
                  <span className="text-lg">{tab.icon}</span>
                  <span className={`text-sm font-medium ${selectedModules.includes(tab.id) ? 'text-emerald-900' : 'text-gray-600'}`}>{tab.label}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="p-5 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 font-bold text-sm hover:bg-gray-200 rounded-lg">Cancel</button>
          <button 
            onClick={() => onSave(selectedModules)} 
            className="px-6 py-2 bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 rounded-lg shadow-sm"
          >
            Save Custom Access
          </button>
        </div>
      </div>
    </div>
  );
};

// Sub-component for cleaner row management and local state for inputs
interface AdminUserRowProps {
  u: AdminUser;
  updateUserStatus: (id: string, s: string) => Promise<void>;
  updateUserTier: (id: string, t: string) => Promise<void>;
  updateExtraSlots: (id: string, n: number) => Promise<void>;
  onEditPermissions: (u: AdminUser) => void;
}

const AdminUserRow: React.FC<AdminUserRowProps> = ({ u, updateUserStatus, updateUserTier, updateExtraSlots, onEditPermissions }) => {
  const rawTier = u.subscription_tier || 'free';
  const tierKey = (rawTier in TIER_CONFIG) ? (rawTier as keyof typeof TIER_CONFIG) : 'free';
  const baseLimit = TIER_CONFIG[tierKey].clientLimit;
  const totalLimit = getClientLimit(tierKey, u.extra_slots);
  
  const [limitInput, setLimitInput] = useState(String(totalLimit));

  // Sync input when external data changes (e.g. via +/- buttons or refresh)
  useEffect(() => {
    setLimitInput(String(totalLimit));
  }, [totalLimit]);

  const handleLimitBlur = () => {
    const val = parseInt(limitInput);
    if (!isNaN(val)) {
        // Enforce that we can't go below the base limit (negative extra slots not supported typically)
        const newTotal = Math.max(baseLimit, val);
        const newExtra = newTotal - baseLimit;
        if (newExtra !== u.extra_slots) {
            updateExtraSlots(u.id, newExtra);
        }
        setLimitInput(String(newTotal));
    } else {
        setLimitInput(String(totalLimit));
    }
  };

  const isCustomized = u.modules && u.modules.length > 0;
  const activeModulesCount = isCustomized
    ? u.modules!.length 
    : (TIER_CONFIG[tierKey]?.allowedTabs.length || 0);

  return (
    <tr className={`hover:bg-gray-50 transition-colors ${u.status === 'pending' ? 'bg-amber-50/50' : ''}`}>
      <td className="p-4 font-medium text-gray-900">
        {u.email}
        <div className="text-xs text-gray-400">{new Date(u.created_at).toLocaleDateString()}</div>
      </td>
      <td className="p-4">
        <select
          value={u.status || 'pending'}
          onChange={(e) => updateUserStatus(u.id, e.target.value)}
          className={`text-xs font-bold rounded px-2 py-1 border ${
            u.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
            u.status === 'rejected' ? 'bg-red-100 text-red-800 border-red-200' :
            'bg-amber-100 text-amber-800 border-amber-200'
          }`}
        >
          <option value="pending">⏳ Pending</option>
          <option value="approved">✅ Approved</option>
          <option value="rejected">🚫 Rejected</option>
        </select>
      </td>
      <td className="p-4">
        <div className="flex flex-col gap-1">
          <span className={`inline-block px-2 py-1 rounded text-xs font-bold w-fit ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
            {u.role.toUpperCase()}
          </span>
        </div>
      </td>
      <td className="p-4">
          <select 
            value={u.subscription_tier || 'free'}
            onChange={(e) => updateUserTier(u.id, e.target.value)}
            className="bg-white border border-gray-300 text-gray-700 text-xs rounded focus:ring-indigo-500 focus:border-indigo-500 block w-full p-1.5 mb-1"
          >
            <option value="free">Free Trial</option>
            <option value="platinum">Platinum</option>
            <option value="diamond">Diamond</option>
            <option value="organisation">Organisation</option>
          </select>
          
          <button 
            onClick={() => onEditPermissions(u)}
            className={`text-[10px] w-full text-center px-2 py-1 rounded border font-bold ${
              isCustomized 
                ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' 
                : 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100'
            }`}
          >
            {isCustomized ? `⚙️ Custom (${activeModulesCount})` : `Customize (${activeModulesCount})`}
          </button>
      </td>
      <td className="p-4">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => updateExtraSlots(u.id, Math.max(0, (u.extra_slots||0) - 1))}
              className="w-6 h-6 bg-gray-200 rounded text-gray-600 hover:bg-gray-300"
            >-</button>
            <span className="font-bold text-gray-800 w-6 text-center">{u.extra_slots || 0}</span>
            <button 
              onClick={() => updateExtraSlots(u.id, (u.extra_slots||0) + 1)}
              className="w-6 h-6 bg-indigo-100 rounded text-indigo-600 hover:bg-indigo-200"
            >+</button>
            <span className="text-[10px] text-gray-400 ml-1">($2 ea)</span>
          </div>
      </td>
      <td className="p-4">
        <div className="flex items-center gap-2">
            <input 
                type="number" 
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                onBlur={handleLimitBlur}
                onKeyDown={(e) => e.key === 'Enter' && handleLimitBlur()}
                className="w-20 px-2 py-1 text-center font-bold text-gray-900 bg-white border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <span className="text-xs text-gray-500">Profiles</span>
        </div>
        <div className="text-[10px] text-gray-400 mt-1">
            Base: {baseLimit} + Extra: {u.extra_slots || 0}
        </div>
      </td>
    </tr>
  );
};

const AdminTab: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showSql, setShowSql] = useState(false);
  
  // Modal State
  const [editingPermissionsUser, setEditingPermissionsUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    if (!supabase) return;
    setLoading(true);
    setError('');
    try {
      // Ensure 'modules' is fetched
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      setError(err.message);
      // Auto-show SQL if we suspect a permission/recursion error
      if (err.message.toLowerCase().includes('recursion') || err.message.toLowerCase().includes('policy')) {
        setShowSql(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const updateUserTier = async (id: string, newTier: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ subscription_tier: newTier })
        .eq('id', id);

      if (error) throw error;
      
      setUsers(users.map(u => u.id === id ? { ...u, subscription_tier: newTier } : u));
    } catch (err: any) {
      alert('Error updating user: ' + err.message);
    }
  };

  const updateUserStatus = async (id: string, newStatus: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      
      setUsers(users.map(u => u.id === id ? { ...u, status: newStatus } : u));
    } catch (err: any) {
      alert('Error updating status: ' + err.message);
    }
  };
  
  const updateExtraSlots = async (id: string, slots: number) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ extra_slots: slots })
        .eq('id', id);

      if (error) throw error;
      
      setUsers(users.map(u => u.id === id ? { ...u, extra_slots: slots } : u));
    } catch (err: any) {
      alert('Error updating slots: ' + err.message);
    }
  };

  const savePermissions = async (modules: string[]) => {
    if (!supabase || !editingPermissionsUser) return;
    try {
      // Perform Update and SELECT data back to ensure it took effect (RLS check)
      const { data, error } = await supabase
        .from('profiles')
        .update({ modules: modules })
        .eq('id', editingPermissionsUser.id)
        .select();

      if (error) {
        // Handle common schema error gracefully
        // Code 42703: Undefined column
        // Error message: "Could not find the 'modules' column..."
        if (error.code === '42703' || error.message.includes("Could not find the 'modules' column") || error.message.includes('schema cache')) {
           alert('Database Error: The "modules" column is missing or the schema cache is stale. \n\nPlease click "Show DB Setup" and run the updated SQL commands.');
           setShowSql(true);
           return;
        }
        throw error;
      }

      // Check if update actually happened (Rows > 0)
      if (data && data.length === 0) {
         alert('Update Failed! Database blocked the write. \n\nYou are an admin, but the database Policy (RLS) is preventing you from editing other users. \n\nPlease click "Show DB Setup" and run the "ENABLE ADMIN UPDATES" SQL command.');
         setShowSql(true);
         return;
      }

      // Success
      setUsers(users.map(u => u.id === editingPermissionsUser.id ? { ...u, modules: modules } : u));
      setEditingPermissionsUser(null);
      alert('Custom modules saved successfully!');
      
    } catch (err: any) {
      alert('Error saving permissions: ' + err.message);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading users...</div>;
  
  return (
    <div className="p-5">
       {/* Header */}
       <div className="flex justify-between items-center mb-5">
          <div>
             <h2 className="text-xl font-bold text-gray-800">Agency Administration</h2>
             <p className="text-sm text-gray-500">Manage user approvals, subscription tiers, profile limits, and module permissions.</p>
          </div>
          <div className="flex gap-2">
             <button onClick={() => setShowSql(!showSql)} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200">
                {showSql ? 'Hide SQL Hints' : 'Show DB Setup'}
             </button>
             <button onClick={fetchUsers} className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold hover:bg-gray-50">
                Refresh List
             </button>
          </div>
       </div>
       
       {showSql && (
         <div className="bg-slate-800 text-white p-4 rounded-lg mb-5 font-mono text-xs overflow-x-auto shadow-lg">
            <p className="text-emerald-400 font-bold mb-2">-- Run this in Supabase SQL Editor to Enable Features --</p>
            <div className="space-y-4">
               <div>
                  <div className="text-gray-400 mb-1">1. Add Modules Column & Fix Schema Cache:</div>
                  <code className="block bg-black/30 p-2 rounded">
                     alter table profiles add column if not exists modules jsonb; <br/>
                     -- Force refresh of schema cache <br/>
                     NOTIFY pgrst, 'reload schema';
                  </code>
               </div>
               <div>
                  <div className="text-gray-400 mb-1">2. ENABLE ADMIN UPDATES (Reset Policy - Safe to Run):</div>
                  <code className="block bg-black/30 p-2 rounded">
                     -- Drop old policy if exists to avoid error <br/>
                     drop policy if exists "Admins can update any profile" on profiles; <br/><br/>
                     -- Create new policy <br/>
                     create policy "Admins can update any profile" <br/>
                     on profiles for update <br/>
                     using ( (select role from profiles where id = auth.uid()) = 'admin' );
                  </code>
               </div>
            </div>
         </div>
       )}
       
       {error && (
         <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-5">
            <div className="flex">
               <div className="flex-shrink-0">⚠️</div>
               <div className="ml-3">
                  <p className="text-sm text-red-700">
                     Error fetching users: {error}
                  </p>
               </div>
            </div>
         </div>
       )}

       <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
             <table className="w-full text-left border-collapse">
                <thead>
                   <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500">
                      <th className="p-4">User / Email</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Subscription & Permissions</th>
                      <th className="p-4">Add-ons</th>
                      <th className="p-4">Profile Limit</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                   {users.map(u => (
                      <AdminUserRow 
                        key={u.id} 
                        u={u} 
                        updateUserStatus={updateUserStatus}
                        updateUserTier={updateUserTier}
                        updateExtraSlots={updateExtraSlots}
                        onEditPermissions={setEditingPermissionsUser}
                      />
                   ))}
                   {users.length === 0 && !loading && (
                      <tr>
                         <td colSpan={6} className="p-8 text-center text-gray-500">
                            No users found.
                         </td>
                      </tr>
                   )}
                </tbody>
             </table>
          </div>
       </div>

       {editingPermissionsUser && (
         <PermissionEditor 
            user={editingPermissionsUser}
            isOpen={!!editingPermissionsUser}
            onClose={() => setEditingPermissionsUser(null)}
            onSave={savePermissions}
         />
       )}
    </div>
  );
};

export default AdminTab;
