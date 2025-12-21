
import React, { useState, useEffect } from 'react';
import { Client, ContactStatus } from '../../../types';
import { fetchActivities, Activity } from '../../../lib/db/activities';
import { fetchClientFiles, uploadClientFile } from '../../../lib/db/clientFiles';
import FileUploader from '../../../components/common/FileUploader';
import StatusDropdown from './StatusDropdown';
import Button from '../../../components/ui/Button';
import { fmtDateTime } from '../../../lib/helpers';

interface ClientDrawerProps {
  client: Client;
  isOpen: boolean;
  onClose: () => void;
  onUpdateField: (id: string, field: string, value: any, section: string) => void;
  onStatusUpdate: (client: Client, newStatus: string) => void;
  onOpenFullProfile: () => void;
  onDelete: () => void;
}

const FILE_CATEGORIES = [
  { id: 'identity', label: 'Identity', icon: '🆔' },
  { id: 'financials', label: 'Financials', icon: '💵' },
  { id: 'medical', label: 'Medical', icon: '🏥' },
  { id: 'others', label: 'Others', icon: '📁' }
];

const ClientDrawer: React.FC<ClientDrawerProps> = ({ 
  client, isOpen, onClose, onUpdateField, onStatusUpdate, onOpenFullProfile, onDelete 
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'files' | 'activity'>('details');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [selectedUploadCategory, setSelectedUploadCategory] = useState('others');
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (isOpen && client.id) loadTabContent();
  }, [isOpen, client.id, activeTab]);

  const loadTabContent = async () => {
     if (activeTab === 'activity') setActivities(await fetchActivities(client.id));
     if (activeTab === 'files') setFiles(await fetchClientFiles(client.id));
  };

  const handleFileUpload = async (uploadedFiles: File[]) => {
    setIsUploading(true);
    try {
      for (const file of uploadedFiles) {
        await uploadClientFile(client.id, file, selectedUploadCategory);
      }
      await loadTabContent();
    } catch (e) {
      alert("Vault Sync Error");
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 font-sans">
        
        <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-white">
           <div className="space-y-1">
              <h3 className="font-black text-xl text-slate-800 tracking-tighter">{client.profile.name || 'Unnamed Client'}</h3>
              <div className="flex items-center gap-3">
                 <p className="text-[10px] text-slate-300 font-black uppercase tracking-widest">ID: {client.id.split('-')[0]}</p>
                 <StatusDropdown client={client} onUpdate={onStatusUpdate} />
              </div>
           </div>
           <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-900 transition-colors">✕</button>
        </div>

        <div className="flex px-6 bg-white border-b border-slate-50">
           {['details', 'files', 'activity'].map(t => (
              <button 
                key={t} onClick={() => setActiveTab(t as any)}
                className={`px-4 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                {t}
              </button>
           ))}
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/20">
           {activeTab === 'details' && (
              <div className="space-y-6">
                 {/* Requirement 2: Unified Appointment Box */}
                 <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 mb-4">
                       <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">📅</div>
                       <div className="flex flex-col">
                          <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Appointment Schedule</label>
                          <span className="text-[9px] text-slate-400 font-bold uppercase">Locked Meeting Event</span>
                       </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 p-1 bg-slate-50 rounded-xl border border-slate-100">
                        <input type="date" className="bg-transparent p-3 font-bold text-sm outline-none text-slate-700" value={client.appointments?.firstApptDate || ''} onChange={(e) => onUpdateField(client.id, 'firstApptDate', e.target.value, 'appointments')} />
                        <input type="time" className="bg-transparent p-3 font-bold text-sm outline-none text-indigo-600 text-right" value={client.appointments?.apptTime || ''} onChange={(e) => onUpdateField(client.id, 'apptTime', e.target.value, 'appointments')} />
                    </div>
                 </div>

                 {/* Requirement 3: Unified Follow Up Box */}
                 <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 mb-4">
                       <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">🔔</div>
                       <div className="flex flex-col">
                          <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Follow Up Protocol</label>
                          <span className="text-[9px] text-slate-400 font-bold uppercase">Next Strategic Touchpoint</span>
                       </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 p-1 bg-slate-50 rounded-xl border border-slate-100">
                        <input type="date" className="bg-transparent p-3 font-bold text-sm outline-none text-slate-700" value={client.followUp.nextFollowUpDate || ''} onChange={(e) => onUpdateField(client.id, 'nextFollowUpDate', e.target.value, 'followUp')} />
                        <input type="time" className="bg-transparent p-3 font-bold text-sm outline-none text-amber-600 text-right" value={client.followUp.nextFollowUpTime || ''} onChange={(e) => onUpdateField(client.id, 'nextFollowUpTime', e.target.value, 'followUp')} />
                    </div>
                 </div>

                 <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">Advisor Insights & Notes</label>
                    <textarea 
                       className="w-full h-40 p-4 bg-slate-50 rounded-xl text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all resize-none border-none shadow-inner"
                       value={client.followUp.notes || ''}
                       onChange={(e) => onUpdateField(client.id, 'notes', e.target.value, 'followUp')}
                       placeholder="Enter client behavioral insights..."
                    />
                 </div>
              </div>
           )}

           {activeTab === 'files' && (
              <div className="space-y-8">
                 <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl"></div>
                    <h4 className="font-black text-xl tracking-tighter mb-2 relative z-10">Vault Ingest</h4>
                    <p className="text-xs text-slate-400 mb-6 font-medium relative z-10">Select category before dropping files.</p>
                    
                    <div className="flex flex-wrap gap-2 mb-6 relative z-10">
                       {FILE_CATEGORIES.map(cat => (
                          <button 
                             key={cat.id} 
                             onClick={() => setSelectedUploadCategory(cat.id)}
                             className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase transition-all ${selectedUploadCategory === cat.id ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
                          >
                             {cat.icon} {cat.label}
                          </button>
                       ))}
                    </div>

                    <FileUploader onUpload={handleFileUpload} isUploading={isUploading} />
                 </div>

                 <div className="space-y-6">
                    {FILE_CATEGORIES.map(cat => {
                       const catFiles = files.filter(f => (f.category || 'others') === cat.id);
                       if (catFiles.length === 0) return null;
                       
                       return (
                          <div key={cat.id} className="space-y-3">
                             <h5 className="text-[10px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-2">
                                {cat.icon} {cat.label} ({catFiles.length})
                             </h5>
                             <div className="grid grid-cols-1 gap-2">
                                {catFiles.map(f => (
                                   <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="p-4 bg-white border border-slate-100 rounded-2xl flex items-center gap-4 hover:border-emerald-500 hover:shadow-md transition-all group">
                                      <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-xl group-hover:bg-emerald-50 transition-colors">
                                         {f.mime_type?.includes('image') ? '🖼️' : '📄'}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                         <div className="text-xs font-black text-slate-700 truncate">{f.name}</div>
                                         <div className="text-[9px] text-slate-400 uppercase font-bold">{(f.size_bytes / 1024).toFixed(1)} KB • {fmtDateTime(f.created_at)}</div>
                                      </div>
                                      <div className="text-slate-300 group-hover:text-emerald-500">📥</div>
                                   </a>
                                ))}
                             </div>
                          </div>
                       );
                    })}
                    
                    {files.length === 0 && (
                       <div className="p-12 text-center bg-white border-2 border-dashed border-slate-100 rounded-3xl text-slate-300 italic text-sm">Vault is empty.</div>
                    )}
                 </div>
              </div>
           )}

           {activeTab === 'activity' && (
              <div className="space-y-6 border-l-2 border-slate-100 ml-4 pl-8 py-2">
                 {activities.map(a => (
                    <div key={a.id} className="relative mb-8">
                       <div className="absolute -left-[41px] top-0 w-4 h-4 rounded-full bg-white border-2 border-indigo-500 shadow-sm" />
                       <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-2">{fmtDateTime(a.created_at)}</div>
                       <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                          <div className="text-xs font-bold text-slate-700 leading-relaxed">{a.title}</div>
                       </div>
                    </div>
                 ))}
              </div>
           )}
        </div>
        
        <div className="p-6 border-t border-slate-50 bg-white flex gap-4">
           <Button variant="ghost" className="flex-1" onClick={onDelete}>Discard</Button>
           <Button variant="primary" className="flex-[2] bg-indigo-600 hover:bg-indigo-700 border-none" onClick={onOpenFullProfile} leftIcon="↗">Strategic Desk</Button>
        </div>
      </div>
    </div>
  );
};

export default ClientDrawer;
