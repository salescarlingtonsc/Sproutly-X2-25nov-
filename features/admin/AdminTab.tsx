
import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import { TIER_CONFIG, getClientLimit, TAB_DEFINITIONS } from '../../lib/config';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  Cell, BarChart, Bar, CartesianGrid, Legend 
} from 'recharts';
import { fmtSGD } from '../../lib/helpers';

interface AdminUser {
  id: string;
  email: string;
  role: string;
  subscription_tier: string;
  status: string;
  extra_slots: number;
  created_at: string;
  last_login?: string;
  modules?: string[]; 
}

interface ActivityLog {
  id: string;
  type: string;
  title: string;
  details: any;
  created_at: string;
}

const CATEGORY_MAP: Record<string, string> = {
  profile: 'Growth',
  children: 'Growth',
  crm: 'Growth',
  life_events: 'Growth',
  cashflow: 'Deep Work',
  cpf: 'Deep Work',
  insurance: 'Deep Work',
  retirement: 'Deep Work',
  investor: 'Deep Work',
  wealth: 'Deep Work',
  property: 'Deep Work',
  vision: 'Deep Work',
  analytics: 'Deep Work',
  report: 'Ops',
  admin: 'Ops',
  disclaimer: 'Ops',
  dashboard: 'Ops'
};

const CATEGORY_COLORS: Record<string, string> = {
  'Growth': '#10b981', // Emerald
  'Deep Work': '#6366f1', // Indigo
  'Ops': '#94a3b8' // Slate
};

interface UserActivityDrawerProps {
  user: AdminUser;
  isOpen: boolean;
  onClose: () => void;
}

const UserActivityDrawer: React.FC<UserActivityDrawerProps> = ({ user, isOpen, onClose }) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && user.id) {
      fetchLogs();
    }
  }, [isOpen, user.id]);

  const fetchLogs = async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error: fetchError } = await supabase
        .from('activities')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });
      
      if (fetchError) throw fetchError;
      setLogs(data || []);
    } catch (e: any) {
      console.error("Log fetch failed", e);
      const msg = e.message || (typeof e === 'string' ? e : JSON.stringify(e));
      setError(msg || "Failed to access activity ledger.");
    } finally {
      setLoading(false);
    }
  };

  // --- COMPREHENSIVE ANALYTICS ENGINE ---
  const analytics = useMemo(() => {
    const usageLogs = logs.filter(l => l.type === 'tab_usage');
    
    // 1. Initialize 30-Day Range
    const dailyMap: Record<string, any> = {};
    const tabMap: Record<string, number> = {};
    const categoryMap: Record<string, number> = { 'Growth': 0, 'Deep Work': 0, 'Ops': 0 };
    const hourlyHeat: Record<number, number> = {};

    for(let i=29; i>=0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const iso = d.toISOString().split('T')[0];
        dailyMap[iso] = { date: iso, label: iso.split('-').slice(1).join('/'), 'Growth': 0, 'Deep Work': 0, 'Ops': 0, total: 0 };
    }

    usageLogs.forEach(log => {
        const dateKey = log.created_at.split('T')[0];
        const hour = new Date(log.created_at).getHours();
        const duration = log.details?.duration_sec || 0;
        const tabId = log.details?.tab_id || 'unknown';
        const category = CATEGORY_MAP[tabId] || 'Ops';

        if (dailyMap[dateKey]) {
            dailyMap[dateKey][category] = (dailyMap[dateKey][category] || 0) + Math.round(duration / 60);
            dailyMap[dateKey].total += Math.round(duration / 60);
        }
        tabMap[tabId] = (tabMap[tabId] || 0) + duration;
        categoryMap[category] += duration;
        hourlyHeat[hour] = (hourlyHeat[hour] || 0) + duration;
    });

    const timelineData = Object.values(dailyMap);
    
    const rankedTabs = Object.entries(tabMap)
        .map(([id, sec]) => ({
            id,
            label: TAB_DEFINITIONS.find(t => t.id === id)?.label || id,
            minutes: Math.round(sec / 60),
            category: CATEGORY_MAP[id] || 'Ops'
        }))
        .sort((a, b) => b.minutes - a.minutes);

    const totalMin = Math.round(usageLogs.reduce((sum, l) => sum + (l.details?.duration_sec || 0), 0) / 60);
    const avgDailyMin = Math.round(totalMin / 30);
    
    // Efficiency: Time spent in Strategy (Growth + Deep Work) vs Ops
    const productiveSec = categoryMap['Growth'] + categoryMap['Deep Work'];
    const totalUsageSec = categoryMap['Growth'] + categoryMap['Deep Work'] + categoryMap['Ops'];
    const efficiency = totalUsageSec > 0 ? Math.round((productiveSec / totalUsageSec) * 100) : 0;

    // Peak Hour
    const peakHourEntry = Object.entries(hourlyHeat).sort((a, b) => b[1] - a[1])[0];
    const peakHour = peakHourEntry ? peakHourEntry[0] : 'N/A';

    return { timelineData, rankedTabs, totalMin, avgDailyMin, efficiency, peakHour, categoryMap };
  }, [logs]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-slate-50 h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
        
        {/* HEADER */}
        <div className="p-8 border-b border-slate-200 flex items-center justify-between bg-white">
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tighter">Practitioner Performance Index</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">{user.email} • 30-Day Forensic View</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-slate-900">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-10">
          {error ? (
            <div className="p-10 bg-red-50 border border-red-100 rounded-3xl text-center">
              <div className="text-3xl mb-4">🚨</div>
              <h4 className="text-sm font-bold text-red-800">Ledger Desync</h4>
              <p className="text-xs text-red-600 mt-2">{error}</p>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reconstructing 30-Day Matrix...</span>
            </div>
          ) : (
            <>
              {/* 1. KEY KPI GRID */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                 <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-[9px] font-black uppercase text-slate-400 mb-1">Engagement</div>
                    <div className="text-2xl font-black text-slate-900">{analytics.totalMin}m</div>
                 </div>
                 <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-[9px] font-black uppercase text-slate-400 mb-1">Avg. Daily</div>
                    <div className="text-2xl font-black text-indigo-600">{analytics.avgDailyMin}m</div>
                 </div>
                 <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-[9px] font-black uppercase text-slate-400 mb-1">Efficiency</div>
                    <div className="text-2xl font-black text-emerald-600">{analytics.efficiency}%</div>
                 </div>
                 <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-[9px] font-black uppercase text-slate-400 mb-1">Peak Hour</div>
                    <div className="text-2xl font-black text-amber-600">{analytics.peakHour}:00</div>
                 </div>
              </div>

              {/* 2. ACTIVITY STACKED AREA CHART */}
              <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
                 <div className="flex justify-between items-center mb-8">
                    <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Workflow Composition (30 Days)</h4>
                    <div className="flex gap-4">
                       {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
                          <div key={cat} className="flex items-center gap-1.5">
                             <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></div>
                             <span className="text-[9px] font-black text-slate-400 uppercase">{cat}</span>
                          </div>
                       ))}
                    </div>
                 </div>
                 <div className="h-64 w-full">
                    <ResponsiveContainer>
                       <AreaChart data={analytics.timelineData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="label" fontSize={9} tickLine={false} axisLine={false} tickMargin={12} />
                          <YAxis fontSize={9} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}m`} />
                          <Tooltip 
                             contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', fontSize: '10px', fontWeight: 'bold' }}
                          />
                          <Area type="monotone" dataKey="Growth" stackId="1" stroke={CATEGORY_COLORS['Growth']} fill={CATEGORY_COLORS['Growth']} fillOpacity={0.6} />
                          <Area type="monotone" dataKey="Deep Work" stackId="1" stroke={CATEGORY_COLORS['Deep Work']} fill={CATEGORY_COLORS['Deep Work']} fillOpacity={0.6} />
                          <Area type="monotone" dataKey="Ops" stackId="1" stroke={CATEGORY_COLORS['Ops']} fill={CATEGORY_COLORS['Ops']} fillOpacity={0.6} />
                       </AreaChart>
                    </ResponsiveContainer>
                 </div>
              </div>

              {/* 3. RANKED TABS & PROCESS GAPS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Top Functional Areas</h4>
                    <div className="space-y-3">
                       {analytics.rankedTabs.slice(0, 8).map((t, idx) => (
                          <div key={t.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 group hover:shadow-md transition-all">
                             <div className="flex items-center gap-4">
                                <span className="text-lg">{TAB_DEFINITIONS.find(td => td.id === t.id)?.icon || '📍'}</span>
                                <div>
                                   <div className="text-xs font-black text-slate-900">{t.label}</div>
                                   <div className="text-[9px] font-bold uppercase tracking-tight" style={{ color: CATEGORY_COLORS[t.category] }}>{t.category}</div>
                                </div>
                             </div>
                             <div className="text-right">
                                <div className="text-sm font-black text-slate-900">{t.minutes}m</div>
                             </div>
                          </div>
                       ))}
                    </div>
                 </div>

                 <div className="space-y-6">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Optimization Insights</h4>
                    <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
                       <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
                       <h5 className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">Primary Workflow</h5>
                       <p className="text-sm font-bold leading-relaxed">
                          {analytics.rankedTabs[0]?.label || 'Record'} is the core focus area, accounting for {Math.round((analytics.rankedTabs[0]?.minutes || 0) / (analytics.totalMin || 1) * 100)}% of active time.
                       </p>
                    </div>

                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6">
                       <h5 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Growth Vector</h5>
                       <p className="text-xs text-emerald-800 font-medium leading-relaxed">
                          User is spending <strong>{Math.round(analytics.categoryMap['Growth'] / 60)}m</strong> in the Prospecting phase. This correlates with pipeline health.
                       </p>
                    </div>

                    <div className="bg-slate-900 rounded-2xl p-6 text-slate-300">
                       <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Session Health</h5>
                       <p className="text-xs leading-relaxed">
                          Engagement indicates {analytics.totalMin > 600 ? 'High Capacity' : 'Standard Baseline'}. 
                          Peak activity at <strong>{analytics.peakHour}:00</strong> suggests highest performance in {parseInt(analytics.peakHour) < 12 ? 'Morning' : 'Afternoon'} blocks.
                       </p>
                    </div>
                 </div>
              </div>

              {/* 4. GRANULAR DATE LEDGER */}
              <div>
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Date-by-Date Velocity</h4>
                 <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-left">
                       <thead className="bg-slate-50 border-b border-slate-200">
                          <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                             <th className="p-4">Reference Date</th>
                             <th className="p-4">Growth</th>
                             <th className="p-4">Deep Work</th>
                             <th className="p-4">Ops</th>
                             <th className="p-4 text-right">Total Active</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                          {[...analytics.timelineData].filter(d => d.total > 0).reverse().map(row => (
                             <tr key={row.date} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 text-xs font-black text-slate-900">{new Date(row.date).toLocaleDateString([], { month: 'short', day: 'numeric', weekday: 'short' })}</td>
                                <td className="p-4 text-xs font-bold text-emerald-600">{row['Growth']}m</td>
                                <td className="p-4 text-xs font-bold text-indigo-600">{row['Deep Work']}m</td>
                                <td className="p-4 text-xs font-bold text-slate-400">{row['Ops']}m</td>
                                <td className="p-4 text-xs font-black text-slate-900 text-right">{row.total}m</td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
            </>
          )}
        </div>
        
        <div className="p-6 border-t border-slate-200 bg-white text-center">
           <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.4em]">Optimizing Sales Experience Through Data</p>
        </div>
      </div>
    </div>
  );
};

interface PermissionEditorProps {
  user: AdminUser;
  isOpen: boolean;
  onClose: () => void;
  onSave: (modules: string[]) => void;
}

const PermissionEditor: React.FC<PermissionEditorProps> = ({ user, isOpen, onClose, onSave }) => {
  if (!isOpen) return null;
  const currentTier = user.subscription_tier || 'free';
  const tierDefaults = TIER_CONFIG[currentTier as keyof typeof TIER_CONFIG]?.allowedTabs || [];
  const initialModules = (user.modules && user.modules.length > 0) ? user.modules : tierDefaults;
  const [selectedModules, setSelectedModules] = useState<string[]>(initialModules);

  const toggleModule = (tabId: string) => {
    if (selectedModules.includes(tabId)) {
      setSelectedModules(selectedModules.filter(m => m !== tabId));
    } else {
      setSelectedModules([...selectedModules, tabId]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        <div className="p-5 bg-gray-50 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-800">Customize Modules: {user.email}</h3>
          <p className="text-xs text-gray-500 mt-1">Creating a <strong>Custom Plan</strong> for this user.</p>
        </div>
        <div className="p-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3">
            {TAB_DEFINITIONS.filter(t => t.id !== 'admin').map(tab => (
              <label key={tab.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selectedModules.includes(tab.id) ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                <input type="checkbox" checked={selectedModules.includes(tab.id)} onChange={() => toggleModule(tab.id)} className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" />
                <div className="flex items-center gap-2">
                  <span className="text-lg">{tab.icon}</span>
                  <span className={`text-xs font-bold uppercase tracking-tight ${selectedModules.includes(tab.id) ? 'text-indigo-900' : 'text-gray-500'}`}>{tab.label}</span>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div className="p-5 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 font-bold text-sm hover:bg-gray-200 rounded-lg">Cancel</button>
          <button onClick={() => onSave(selectedModules)} className="px-6 py-2 bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 rounded-lg shadow-sm">Save Custom Access</button>
        </div>
      </div>
    </div>
  );
};

interface AdminUserRowProps {
  u: AdminUser;
  updateUserStatus: (id: string, s: string) => Promise<void>;
  updateUserTier: (id: string, t: string) => Promise<void>;
  updateExtraSlots: (id: string, n: number) => Promise<void>;
  onEditPermissions: (u: AdminUser) => void;
  onViewActivity: (u: AdminUser) => void;
  onDeleteUser: (id: string) => void;
}

const AdminUserRow: React.FC<AdminUserRowProps> = ({ u, updateUserStatus, updateUserTier, updateExtraSlots, onEditPermissions, onViewActivity, onDeleteUser }) => {
  const rawTier = u.subscription_tier || 'free';
  const tierKey = (rawTier in TIER_CONFIG) ? (rawTier as keyof typeof TIER_CONFIG) : 'free';
  const baseLimit = TIER_CONFIG[tierKey].clientLimit;
  const totalLimit = getClientLimit(tierKey, u.extra_slots);
  const [limitInput, setLimitInput] = useState(String(totalLimit));

  useEffect(() => { setLimitInput(String(totalLimit)); }, [totalLimit]);

  const handleLimitBlur = () => {
    const val = parseInt(limitInput);
    if (!isNaN(val)) {
      const newTotal = Math.max(baseLimit, val);
      const newExtra = newTotal - baseLimit;
      if (newExtra !== u.extra_slots) updateExtraSlots(u.id, newExtra);
      setLimitInput(String(newTotal));
    } else {
      setLimitInput(String(totalLimit));
    }
  };

  const isCustomized = u.modules && u.modules.length > 0;
  const activeModulesCount = isCustomized ? u.modules!.length : (TIER_CONFIG[tierKey]?.allowedTabs.length || 0);

  return (
    <tr className={`hover:bg-indigo-50/30 transition-colors ${u.status === 'pending' ? 'bg-amber-50/30' : ''}`}>
      <td className="p-4">
        <div className="font-bold text-slate-900 truncate max-w-[200px]">{u.email}</div>
        <div className="text-[9px] text-slate-400 font-mono">ID: {u.id.substring(0, 8)}</div>
      </td>
      <td className="p-4">
        <select
          value={u.status || 'pending'}
          onChange={(e) => updateUserStatus(u.id, e.target.value)}
          className={`text-[10px] font-black uppercase tracking-widest rounded-lg px-3 py-1.5 border outline-none transition-all shadow-sm ${
            u.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
            u.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
            'bg-amber-50 text-amber-700 border-amber-200'
          }`}
        >
          <option value="pending">⏳ Pending</option>
          <option value="approved">✅ Approved</option>
          <option value="rejected">🚫 Rejected</option>
        </select>
      </td>
      <td className="p-4">
        <span className={`inline-block px-2.5 py-1 rounded-lg text-[9px] font-black tracking-widest border ${u.role === 'admin' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-200'}`}>
          {u.role.toUpperCase()}
        </span>
      </td>
      <td className="p-4">
        <div className="space-y-1.5">
          <select 
            value={u.subscription_tier || 'free'}
            onChange={(e) => updateUserTier(u.id, e.target.value)}
            className="bg-white border border-slate-200 text-slate-700 text-[11px] font-bold rounded-lg focus:ring-indigo-500 block w-full p-1.5"
          >
            <option value="free">Free Trial</option>
            <option value="platinum">Platinum</option>
            <option value="diamond">Diamond</option>
            <option value="organisation">Organisation</option>
          </select>
          <button 
            onClick={() => onEditPermissions(u)}
            className={`text-[9px] w-full text-center px-2 py-1.5 rounded-lg border font-black uppercase tracking-widest transition-all ${
              isCustomized ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {isCustomized ? `⚙️ Custom (${activeModulesCount})` : `Modules (${activeModulesCount})`}
          </button>
        </div>
      </td>
      <td className="p-4">
        <div className="text-[11px] font-bold text-slate-700">{u.last_login ? new Date(u.last_login).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'No Activity'}</div>
        <button 
          onClick={() => onViewActivity(u)}
          className="mt-2 text-[9px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1"
        >
          📊 Activity & Analytics
        </button>
      </td>
      <td className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
              <input type="number" value={limitInput} onChange={(e) => setLimitInput(e.target.value)} onBlur={handleLimitBlur} onKeyDown={(e) => e.key === 'Enter' && handleLimitBlur()} className="w-16 px-2 py-1.5 text-center font-black text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs" />
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Slots</span>
          </div>
          <button 
            onClick={() => onDeleteUser(u.id)}
            className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-red-400 hover:text-red-600 transition-colors opacity-40 hover:opacity-100"
          >
            <span>🗑️</span> Expunge User
          </button>
        </div>
      </td>
    </tr>
  );
};

const AdminTab: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showSql, setShowSql] = useState(false);
  const [editingPermissionsUser, setEditingPermissionsUser] = useState<AdminUser | null>(null);
  const [viewingActivityUser, setViewingActivityUser] = useState<AdminUser | null>(null);
  
  const { confirm } = useDialog();

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    if (!supabase) return;
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      setError(err.message);
      if (err.message.toLowerCase().includes('policy') || err.message.toLowerCase().includes('permission') || err.message.toLowerCase().includes('stack')) {
         setShowSql(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const updateUserTier = async (id: string, newTier: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('profiles').update({ subscription_tier: newTier }).eq('id', id);
      if (error) throw error;
      setUsers(users.map(u => u.id === id ? { ...u, subscription_tier: newTier } : u));
    } catch (err: any) { alert('Update failed: ' + err.message); if (err.message.includes('policy')) setShowSql(true); }
  };

  const updateUserStatus = async (id: string, newStatus: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
      setUsers(users.map(u => u.id === id ? { ...u, status: newStatus } : u));
    } catch (err: any) { alert('Update failed: ' + err.message); }
  };
  
  const updateExtraSlots = async (id: string, slots: number) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('profiles').update({ extra_slots: slots }).eq('id', id);
      if (error) throw error;
      setUsers(users.map(u => u.id === id ? { ...u, extra_slots: slots } : u));
    } catch (err: any) { alert('Update failed: ' + err.message); }
  };

  const deleteUser = async (id: string) => {
    const ok = await confirm({
      title: "Expunge Practitioner?",
      message: "This will permanently remove this user profile and all their clients from the system. This action cannot be undone.",
      isDestructive: true,
      confirmText: "Expunge Forever"
    });

    if (!ok) return;

    if (!supabase) return;
    try {
      // First delete clients to avoid FK violations if necessary, 
      // but usually cascade delete on user_id should be set in DB
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) throw error;
      setUsers(users.filter(u => u.id !== id));
    } catch (err: any) {
      alert('Expunge failed: ' + err.message);
    }
  };

  const savePermissions = async (modules: string[]) => {
    if (!supabase || !editingPermissionsUser) return;
    try {
      const { data, error } = await supabase.from('profiles').update({ modules }).eq('id', editingPermissionsUser.id).select();
      if (error) throw error;
      if (data && data.length === 0) {
         alert('Action Restricted: Your DB policy prevents you from updating other users.');
         setShowSql(true);
         return;
      }
      setUsers(users.map(u => u.id === editingPermissionsUser.id ? { ...u, modules: modules } : u));
      setEditingPermissionsUser(null);
    } catch (err: any) { alert('Error: ' + err.message); }
  };

  if (loading) return <div className="p-20 text-center flex flex-col items-center gap-4"><div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div><div className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Accessing Vault Registry...</div></div>;
  
  return (
    <div className="p-6 max-w-[1400px] mx-auto animate-in fade-in duration-500">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
          <div>
             <h2 className="text-3xl font-black text-slate-900 tracking-tight">Agency Operations</h2>
             <p className="text-sm text-slate-500 font-medium mt-1">Managing <span className="text-indigo-600 font-bold">{users.length}</span> practitioner records.</p>
          </div>
          <div className="flex gap-3">
             <button onClick={() => setShowSql(!showSql)} className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm ${showSql ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {showSql ? 'Hide SQL Logic' : 'Setup DB Access'}
             </button>
             <button onClick={fetchUsers} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95">
                Refresh Registry
             </button>
          </div>
       </div>
       
       {showSql && (
         <div className="bg-[#0f172a] text-slate-300 p-8 rounded-3xl mb-10 font-mono text-[11px] leading-relaxed shadow-2xl relative border border-slate-800 overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none text-8xl">🔧</div>
            <div className="absolute top-6 right-8 text-emerald-400 font-black tracking-widest text-[10px] animate-pulse">SUPABASE CONFIGURATION HUB</div>
            <p className="text-indigo-400 font-black mb-6 uppercase tracking-[0.2em] border-b border-slate-800 pb-4">UNIFIED AUDIT & ACCESS POLICIES</p>
            <div className="space-y-10">
               <div>
                  <div className="text-emerald-400 mb-2 font-black uppercase">1. Master Repair: Activities Table</div>
                  <p className="mb-3 text-slate-500">Run this script to enable advanced tab-usage telemetry and analytics.</p>
                  <code className="block bg-black/40 p-5 rounded-2xl border border-white/5 whitespace-pre overflow-x-auto custom-scrollbar text-indigo-100">
{`DO $$ 
BEGIN
  -- Create table if it doesn't exist
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'activities') THEN
    CREATE TABLE public.activities (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
      client_id uuid NOT NULL,
      type text,
      title text NOT NULL,
      details jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now()
    );
  END IF;
END $$;

-- Enable RLS
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own activities" ON activities;
CREATE POLICY "Users can view own activities" ON activities FOR SELECT USING ( auth.uid() = user_id );

DROP POLICY IF EXISTS "Admins can view all activities" ON activities;
CREATE POLICY "Admins can view all activities" ON activities FOR SELECT USING ( public.is_admin() );

DROP POLICY IF EXISTS "Users can insert own activities" ON activities;
CREATE POLICY "Users can insert own activities" ON activities FOR INSERT WITH CHECK ( auth.uid() = user_id );`}
                  </code>
               </div>

               <div>
                  <div className="text-emerald-400 mb-2 font-black uppercase">2. Fix: Client Save (RLS Error 42501)</div>
                  <p className="mb-3 text-slate-500">Run this to allow practitioners to save and update their own client profiles. This policy satisfies Upsert requirements.</p>
                  <code className="block bg-black/40 p-5 rounded-2xl border border-white/5 whitespace-pre overflow-x-auto custom-scrollbar text-indigo-100">
{`ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Combined Policy for easier management or granular ones below
DROP POLICY IF EXISTS "Users can manage own clients" ON clients;
CREATE POLICY "Users can manage own clients" ON clients
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Ensure all existing rows have the correct owner (Optional Cleanup)
-- UPDATE public.clients SET user_id = 'YOUR_USER_ID' WHERE user_id IS NULL;`}
                  </code>
               </div>

               <div>
                  <div className="text-emerald-400 mb-2 font-black uppercase">3. Core Admin Helper (Recursion Fix)</div>
                  <p className="mb-3 text-slate-500">Essential function to check roles without triggering database loops.</p>
                  <code className="block bg-black/40 p-5 rounded-2xl border border-white/5 whitespace-pre overflow-x-auto custom-scrollbar text-indigo-100">
{`CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN (SELECT (role = 'admin') FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;`}
                  </code>
               </div>
            </div>
         </div>
       )}
       
       <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
             <table className="w-full text-left border-collapse">
                <thead>
                   <tr className="bg-slate-50/50 border-b border-slate-100 text-[10px] uppercase font-black tracking-[0.15em] text-slate-400">
                      <th className="p-6">Practitioner Profile</th>
                      <th className="p-6">Auth Status</th>
                      <th className="p-6">System Role</th>
                      <th className="p-6">Plan & Modules</th>
                      <th className="p-6">Activity Timeline</th>
                      <th className="p-6">System Control</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                   {users.map(u => (
                      <AdminUserRow 
                        key={u.id} 
                        u={u} 
                        updateUserStatus={updateUserStatus}
                        updateUserTier={updateUserTier}
                        updateExtraSlots={updateExtraSlots}
                        onEditPermissions={setEditingPermissionsUser}
                        onViewActivity={setViewingActivityUser}
                        onDeleteUser={deleteUser}
                      />
                   ))}
                </tbody>
             </table>
             
             {users.length === 0 && !loading && (
                <div className="p-24 text-center">
                   <div className="text-5xl mb-6 opacity-20">📭</div>
                   <h4 className="text-xl font-black text-slate-800 tracking-tight">No Practitioners Found</h4>
                   <p className="text-sm text-slate-400 max-w-md mx-auto mt-2 leading-relaxed font-medium">
                      The registry is empty or blocked. Ensure you have run the SQL initialization scripts to unlock organizational visibility.
                   </p>
                </div>
             )}
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

       {viewingActivityUser && (
         <UserActivityDrawer 
            user={viewingActivityUser}
            isOpen={!!viewingActivityUser}
            onClose={() => setViewingActivityUser(null)}
         />
       )}
    </div>
  );
};

export default AdminTab;
