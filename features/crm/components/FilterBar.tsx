
import React from 'react';

interface FilterBarProps {
  query: string;
  setQuery: (val: string) => void;
  statuses: string[];
  setStatuses: (val: string[]) => void;
}

const FilterBar: React.FC<FilterBarProps> = ({ query, setQuery, statuses, setStatuses }) => {
  const toggleStatus = (s: string) => {
    if (statuses.includes(s)) setStatuses(statuses.filter(x => x !== s));
    else setStatuses([...statuses, s]);
  };

  return (
    <div className="flex items-center gap-4 flex-1 max-w-2xl">
      <div className="relative flex-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
        <input 
          type="text" 
          value={query} 
          onChange={e => setQuery(e.target.value)}
          placeholder="Search name, email, or phone..."
          className="w-full pl-8 pr-4 py-1.5 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100"
        />
      </div>
      
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
         {['new', 'picked_up', 'proposal', 'client'].map(s => (
            <button
               key={s}
               onClick={() => toggleStatus(s)}
               className={`px-2 py-1 rounded text-[10px] font-bold border transition-all whitespace-nowrap ${statuses.includes(s) ? 'bg-indigo-600 border-indigo-700 text-white' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
            >
               {s.replace('_', ' ').toUpperCase()}
            </button>
         ))}
      </div>

      {(query || statuses.length > 0) && (
         <button onClick={() => { setQuery(''); setStatuses([]); }} className="text-[10px] font-bold text-red-500 hover:underline">Clear</button>
      )}
    </div>
  );
};

export default FilterBar;
