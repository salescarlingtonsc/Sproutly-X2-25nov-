
import React from 'react';
import { Client } from '../../../types';
import StatusDropdown from './StatusDropdown';

interface ClientDrawerProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateField: (field: string, value: any, section?: 'profile' | 'followUp' | 'root') => void;
  onStatusUpdate: (client: Client, newStatus: string) => void;
  onOpenFullProfile: () => void;
  onDelete: () => void;
}

const ClientDrawer: React.FC<ClientDrawerProps> = ({ 
  client, isOpen, onClose, onUpdateField, onStatusUpdate, onOpenFullProfile, onDelete 
}) => {
  if (!isOpen || !client) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      ></div>
      
      {/* Slide-over Panel */}
      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl animate-slide-in-right flex flex-col z-10 border-l border-gray-200">
        
        {/* Drawer Header */}
        <div className="p-6 border-b border-gray-100 bg-white flex justify-between items-start sticky top-0 z-20">
          <div className="w-full mr-8">
            <div className="text-[10px] uppercase font-bold text-gray-400 tracking-widest mb-1">Client Record</div>
            <input 
              type="text" 
              value={client.profile.name}
              onChange={(e) => onUpdateField('name', e.target.value)}
              className="text-2xl font-black text-slate-900 bg-transparent outline-none border-b border-transparent hover:border-gray-200 focus:border-indigo-500 w-full transition-colors placeholder-gray-300"
              placeholder="Unnamed Client"
            />
          </div>
          <div className="flex gap-3">
            <button onClick={onOpenFullProfile} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors" title="Open Full Profile">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Drawer Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-0 bg-white">
          
          {/* Status Section */}
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-4">
              <div className="w-1/3 text-xs font-bold text-gray-500">Contact Status</div>
              <div className="flex-1">
                <StatusDropdown client={client} onUpdate={onStatusUpdate} />
              </div>
            </div>
          </div>

          {/* Core Fields Grid */}
          <div className="px-6 py-6 space-y-6">
            
            {/* Phone */}
            <div className="flex items-center gap-4 group">
              <div className="w-1/3 flex items-center gap-2 text-xs font-bold text-gray-500">
                <span className="text-base opacity-50">📱</span> Phone
              </div>
              <div className="flex-1">
                <input 
                  type="text" 
                  value={client.profile.phone}
                  onChange={(e) => onUpdateField('phone', e.target.value)}
                  className="w-full py-2 px-3 bg-white border border-gray-200 rounded-lg text-sm font-medium text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 outline-none transition-all placeholder-gray-300"
                  placeholder="+65 0000 0000"
                />
              </div>
            </div>

            {/* Email */}
            <div className="flex items-center gap-4 group">
              <div className="w-1/3 flex items-center gap-2 text-xs font-bold text-gray-500">
                <span className="text-base opacity-50">📧</span> Email
              </div>
              <div className="flex-1">
                <input 
                  type="text" 
                  value={client.profile.email}
                  onChange={(e) => onUpdateField('email', e.target.value)}
                  className="w-full py-2 px-3 bg-white border border-gray-200 rounded-lg text-sm font-medium text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 outline-none transition-all placeholder-gray-300"
                  placeholder="client@email.com"
                />
              </div>
            </div>

            {/* Job Title */}
            <div className="flex items-center gap-4 group">
              <div className="w-1/3 flex items-center gap-2 text-xs font-bold text-gray-500">
                <span className="text-base opacity-50">💼</span> Job Title
              </div>
              <div className="flex-1">
                <input 
                  type="text" 
                  value={client.profile.jobTitle || ''}
                  onChange={(e) => onUpdateField('jobTitle', e.target.value)}
                  className="w-full py-2 px-3 bg-white border border-gray-200 rounded-lg text-sm font-medium text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 outline-none transition-all placeholder-gray-300"
                  placeholder="e.g. Director"
                />
              </div>
            </div>

            {/* Source / Platform */}
            <div className="flex items-center gap-4 group">
              <div className="w-1/3 flex items-center gap-2 text-xs font-bold text-gray-500">
                <span className="text-base opacity-50">🌐</span> Platform
              </div>
              <div className="flex-1">
                <select 
                  value={client.profile.source || 'Other'}
                  onChange={(e) => onUpdateField('source', e.target.value)}
                  className="w-full py-2 px-3 bg-white border border-gray-200 rounded-lg text-sm font-medium text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 outline-none"
                >
                  <option value="IG">Instagram</option>
                  <option value="FB">Facebook</option>
                  <option value="LinkedIn">LinkedIn</option>
                  <option value="Referral">Referral</option>
                  <option value="Roadshow">Roadshow</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {/* Retirement Age */}
            <div className="flex items-center gap-4 group">
              <div className="w-1/3 flex items-center gap-2 text-xs font-bold text-gray-500">
                <span className="text-base opacity-50">🏖️</span> Retire Age
              </div>
              <div className="flex-1">
                <input 
                  type="number" 
                  value={client.profile.retirementAge || '65'}
                  onChange={(e) => onUpdateField('retirementAge', e.target.value)}
                  className="w-20 py-2 px-3 bg-white border border-gray-200 rounded-lg text-sm font-medium text-slate-900 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="border-t border-gray-100 my-6"></div>

            {/* Remarks / Notes - Full Width */}
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                  <span>📝</span> Remarks & History
                </label>
                <span className="text-[10px] text-gray-400">Auto-saved</span>
              </div>
              <textarea 
                value={client.followUp.notes || ''}
                onChange={(e) => onUpdateField('notes', e.target.value, 'followUp')}
                className="w-full h-40 p-4 bg-yellow-50/30 border border-yellow-200/50 rounded-xl text-sm leading-relaxed text-slate-700 outline-none focus:ring-2 focus:ring-yellow-200/50 focus:border-yellow-300 resize-none font-medium"
                placeholder="Type notes here... e.g. Client prefers Zoom calls, interested in legacy planning."
              ></textarea>
            </div>

            {/* Motivation */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <span>🎯</span> Why do they want to win?
              </label>
              <input 
                type="text" 
                value={client.profile.motivation || ''}
                onChange={(e) => onUpdateField('motivation', e.target.value)}
                className="w-full py-3 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all placeholder-gray-400"
                placeholder="e.g. Financial Freedom for kids..."
              />
            </div>

          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 text-[10px] text-gray-400 flex justify-between items-center">
          <div>
            Created: {new Date().toLocaleDateString()}
          </div>
          <div className="flex gap-4">
            <button 
              onClick={onDelete}
              className="text-red-400 hover:text-red-600 font-bold flex items-center gap-1 transition-colors"
            >
              <span>🗑</span> Delete
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ClientDrawer;
