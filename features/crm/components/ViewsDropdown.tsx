
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';

export interface SavedView {
  id: string;
  name: string;
  filters: { query?: string; statuses?: string[] };
  sort: { col: string; dir: 'asc' | 'desc' };
  visible_column_ids: string[];
  col_widths: Record<string, number>;
}

interface ViewsDropdownProps {
  currentView: {
    filters: { query: string; statuses: string[] };
    sort: { col: string; dir: 'asc' | 'desc' };
    visibleColumnIds?: Set<string>;
    colWidths?: Record<string, number>;
  };
  onApply: (view: SavedView) => void;
}

const ViewsDropdown: React.FC<ViewsDropdownProps> = ({ currentView, onApply }) => {
  const [views, setViews] = useState<SavedView[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchViews();
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchViews = async () => {
    if (!supabase) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data, error } = await supabase
        .from('crm_views')
        .select('*')
        .eq('user_id', session.user.id) // Point 7: Ensure personal scope
        .order('created_at', { ascending: false });
      
      if (error) {
        if (error.code === 'PGRST116' || error.message.includes('not find')) {
            console.warn("crm_views table might be missing.");
            return;
        }
        throw error;
      }
      
      if (data) {
        setViews(data.map(d => ({
          id: d.id,
          name: d.name,
          filters: d.filters || {},
          sort: d.sort || { col: 'updated_at', dir: 'desc' },
          visible_column_ids: d.visible_column_ids || [],
          col_widths: d.col_widths || {}
        })));
      }
    } catch (e: any) {
      console.error("Error fetching views:", e.message);
    }
  };

  const handleCreateView = async () => {
    const name = prompt("Enter a name for this personal view:");
    if (!name) return;
    
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("Unauthorized");

      const { error } = await supabase.from('crm_views').insert({
        user_id: session.user.id,
        name,
        filters: currentView.filters,
        sort: currentView.sort,
        visible_column_ids: Array.from(currentView.visibleColumnIds || []),
        col_widths: currentView.colWidths || {}
      });

      if (error) throw error;
      
      await fetchViews();
      setIsOpen(false);
    } catch (e: any) {
      alert("Failed to save view: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteView = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this personal perspective?")) return;
    
    try {
      const { error } = await supabase.from('crm_views').delete().eq('id', id);
      if (error) throw error;
      setViews(prev => prev.filter(v => v.id !== id));
    } catch (e: any) {
      alert("Delete failed: " + e.message);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-sm focus:outline-none"
      >
        <span className="text-base">📂</span>
        <span>My Perspectives {views.length > 0 ? `(${views.length})` : ''}</span>
        <span className={`text-[10px] opacity-30 transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-fade-in-up py-1">
          <div className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50 mb-1">
            Personal Grid Views
          </div>
          
          <div className="max-h-72 overflow-y-auto custom-scrollbar">
            {views.map(v => (
              <div key={v.id} className="group relative px-1">
                <button
                  onClick={() => { onApply(v); setIsOpen(false); }}
                  className="w-full text-left px-3 py-2.5 text-xs font-bold text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg transition-colors flex items-center justify-between"
                >
                  <span className="truncate pr-6">{v.name}</span>
                </button>
                <button 
                  onClick={(e) => handleDeleteView(e, v.id)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75V4H5a1.5 1.5 0 00-1.5 1.5V6a1 1 0 001 1h11a1 1 0 001-1v-.5A1.5 1.5 0 0015 4h-1V3.75A2.75 2.75 0 0011.25 1h-2.5zM7.5 3.75a1.25 1.25 0 011.25-1.25h2.5a1.25 1.25 0 011.25 1.25V4h-5v-.25zM5 8a1 1 0 011-1h8a1 1 0 011 1v9.25a1.75 1.75 0 01-1.75 1.75H6.75A1.75 1.75 0 015 17.25V8z" clip-rule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
            
            {views.length === 0 && (
              <div className="px-4 py-6 text-center">
                <div className="text-lg opacity-20 mb-1">🗄️</div>
                <div className="text-[10px] text-gray-400 font-medium italic">No personal views found</div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 mt-2 pt-2 bg-gray-50/50 p-2">
            <button
              onClick={handleCreateView}
              disabled={loading}
              className="w-full text-center py-2 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading ? 'Saving...' : '＋ Save Perspective'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewsDropdown;
