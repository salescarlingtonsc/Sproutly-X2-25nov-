import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { TIER_CONFIG, getClientLimit } from '../../lib/config';

interface AdminUser {
  id: string;
  email: string;
  role: string;
  subscription_tier: string;
  status: string;
  extra_slots: number;
  created_at: string;
}

// Sub-component for cleaner row management and local state for inputs
interface AdminUserRowProps {
  u: AdminUser;
  updateUserStatus: (id: string, s: string) => Promise<void>;
  updateUserTier: (id: string, t: string) => Promise<void>;
  updateExtraSlots: (id: string, n: number) => Promise<void>;
}

const AdminUserRow: React.FC<AdminUserRowProps> = ({ u, updateUserStatus, updateUserTier, updateExtraSlots }) => {
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
        <span className={`px-2 py-1 rounded text-xs font-bold ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
          {u.role.toUpperCase()}
        </span>
      </td>
      <td className="p-4">
          <select 
            value={u.subscription_tier || 'free'}
            onChange={(e) => updateUserTier(u.id, e.target.value)}
            className="bg-white border border-gray-300 text-gray-700 text-xs rounded focus:ring-indigo-500 focus:border-indigo-500 block w-full p-1.5"
          >
            <option value="free">Free Trial</option>
            <option value="platinum">Platinum</option>
            <option value="diamond">Diamond</option>
            <option value="organisation">Organisation</option>
          </select>
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
                className="w-20 px-2 py-1 text-center font-bold text-gray-900 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
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

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    if (!supabase) return;
    setLoading(true);
    setError('');
    try {
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

  if (loading) return <div className="p-8 text-center text-gray-500">Loading users...</div>;
  
  return (
    <div className="p-5">
       {/* Header */}
       <div className="flex justify-between items-center mb-5">
          <div>
             <h2 className="text-xl font-bold text-gray-800">Agency Administration</h2>
             <p className="text-sm text-gray-500">Manage user approvals, subscription tiers, and profile limits.</p>
          </div>
          <button onClick={fetchUsers} className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold hover:bg-gray-50">
             Refresh List
          </button>
       </div>
       
       {error && (
         <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-5">
            <div className="flex">
               <div className="flex-shrink-0">⚠️</div>
               <div className="ml-3">
                  <p className="text-sm text-red-700">
                     Error fetching users: {error}
                  </p>
                  {showSql && (
                    <p className="text-xs text-red-600 mt-1 font-mono bg-red-100 p-2 rounded">
                       Hint: Check your Supabase RLS policies. The 'profiles' table must be readable by the admin user.
                    </p>
                  )}
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
                      <th className="p-4">Subscription</th>
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
    </div>
  );
};

export default AdminTab;