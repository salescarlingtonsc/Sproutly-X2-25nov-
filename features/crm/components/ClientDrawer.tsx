
import React, { useState, useEffect } from 'react';
import { Client, ContactStatus } from '../../../types';
import { fetchActivities, Activity } from '../../../lib/db/activities';
import { fetchClientFiles, uploadClientFile } from '../../../lib/db/clientFiles';
import { supabase } from '../../../lib/supabase';
import { db } from '../../../lib/db';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';
import { useDialog } from '../../../contexts/DialogContext'; // Added
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
  onDelete: () => Promise<void> | void; 
  onForceRefresh?: () => void; 
  onTransferStart?: (id: string) => void;
  onTransferEnd?: (id: string) => void;
}

const FILE_CATEGORIES = [
  { id: 'identity', label: 'Identity', icon: '🆔' },
  { id: 'financials', label: 'Financials', icon: '💵' },
  { id: 'medical', label: 'Medical', icon: '🏥' },
  { id: 'others', label: 'Others', icon: '📁' }
];

const ClientDrawer: React.FC<ClientDrawerProps> = ({ 
  client, isOpen, onClose, onUpdateField, onStatusUpdate, onOpenFullProfile, onDelete, onForceRefresh,
  onTransferStart, onTransferEnd
}) => {
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const { confirm } = useDialog(); // Use custom dialog
  const [activeTab, setActiveTab] = useState<'details' | 'files' | 'activity'>('details');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [advisors, setAdvisors] = useState<{id: string, email: string}[]>([]);
  const [selectedUploadCategory, setSelectedUploadCategory] = useState('others');
  const [isUploading, setIsUploading] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.is_admin === true;
  const isDirector = currentUser?.role === 'director';
  const canDeleteClient = isAdmin || isDirector; // Strict delete permission

  // ... (keep useEffect, fetchAdvisors, loadTabContent, handleFileUpload, handleDeleteActivity, handleReassign) ...
  useEffect(() => {
    if (isOpen && client.id) {
        loadTabContent();
        if (isAdmin) fetchAdvisors();
    }
  }, [isOpen, client.id, activeTab, isAdmin]);

  const fetchAdvisors = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.from('profiles').select('id, email').order('email');
      if (error) throw error;
      if (data) setAdvisors(data);
    } catch (e) {
      console.error("Advisor directory unavailable");
    }
  };

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
      toast.error("Vault Sync Error");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteActivity = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      e.preventDefault();
      
      if (!isAdmin) {
          toast.error("Permission Denied: Only Admins can delete logs.");
          return;
      }

      // Use Custom Confirm
      const isConfirmed = await confirm({
          title: "Delete Log?",
          message: "This will permanently remove this activity record.",
          confirmText: "Delete",
          isDestructive: true
      });

      if (!isConfirmed) return;
      
      try {
          const { error, data } = await supabase!
            .from('activities')
            .delete()
            .eq('id', id)
            .select('id');
          
          if (error) throw new Error(error.message);
          if (!data || data.length === 0) throw new Error("Delete Failed: Access Denied or Record Missing.");

          setActivities(prev => prev.filter(a => a.id !== id));
          toast.success("Activity log removed.");
      } catch (e: any) {
          console.error("Delete Exception:", e);
          toast.error(e.message);
      }
  };

  const handleReassign = async (newOwnerId: string) => {
    if (!newOwnerId || newOwnerId === client._ownerId) return;
    const selectedAdvisor = advisors.find(a => a.id === newOwnerId);
    const email = selectedAdvisor?.email || 'New Advisor';
    
    // Use Custom Confirm
    const isConfirmed = await confirm({
        title: "Transfer Client?",
        message: `Initialize portfolio handover of ${client.profile.name} to ${email}?`,
        confirmText: "Execute Transfer"
    });

    if (!isConfirmed) return;

    setIsReassigning(true);
    if (onTransferStart) onTransferStart(client.id);
    try {
        await db.transferOwnership(client.id, newOwnerId);
        onUpdateField(client.id, '_ownerId', newOwnerId, 'root');
        onUpdateField(client.id, '_ownerEmail', email, 'root');
        toast.success(`Handover Protocol Executed: ${email.split('@')[0]} is now custodian.`);
        if (onForceRefresh) onForceRefresh();
        setTimeout(() => {
           if (onTransferEnd) onTransferEnd(client.id);
           onClose();
        }, 1200);
    } catch (e: any) {
        toast.error(`Protocol Breach: ${e.message}`);
        if (onTransferEnd) onTransferEnd(client.id);
    } finally {
        setIsReassigning(false);
    }
  };

  const handleDeleteClient = async () => {
      // Use Custom Confirm
      const isConfirmed = await confirm({
          title: "Delete Client Dossier?",
          message: "Permanently discard this client dossier? This cannot be undone.",
          confirmText: "Discard Forever",
          isDestructive: true
      });

      if (!isConfirmed) return;

      setIsDeleting(true);
      try {
          await onDelete();
          onClose();
          toast.success("Client deleted successfully.");
      } catch (e: any) {
          console.error("Delete Error:", e);
          toast.error(`Delete Failed: ${e.message}`);
          alert(`FAILED TO DELETE: ${e.message}`); // LOUD FAILURE
      } finally {
          setIsDeleting(false);
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
                 {isAdmin && (
                    <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-2xl relative overflow-hidden group mb-4 border border-indigo-500/20">
                       <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl -mr-16 -mt-16"></div>
                       <div className="relative z-10">
                          <div className="flex items-center gap-2 mb-4">
                             <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-200">🤝</div>
                             <div>
                                <label className="text-[10px] font-black text-indigo-300 uppercase tracking-widest block">Portfolio Custodian</label>
                                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-tight leading-none">Administrative Handover</span>
                             </div>
                          </div>
                          <div className="space-y-3">
                             <div className="flex justify-between items-center px-1">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Primary Owner</span>
                                <span className="text-[11px] font-black text-indigo-400 truncate max-w-[180px]">{client._ownerEmail || 'System'}</span>
                             </div>
                             <div className="relative group">
                                <select 
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-sm font-bold text-white outline-none focus:bg-white/10 focus:border-indigo-500 transition-all appearance-none cursor-pointer"
                                    value={client._ownerId || ''}
                                    onChange={(e) => handleReassign(e.target.value)}
                                    disabled={isReassigning}
                                >
                                    <option value="" className="text-slate-900">Select Advisor...</option>
                                    {advisors.map(adv => <option key={adv.id} value={adv.id} className="text-slate-900">{adv.email}</option>)}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 text-xs">▼</div>
                             </div>
                             {isReassigning && <div className="flex items-center justify-center gap-2 mt-2"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></div><p className="text-[9px] text-emerald-400 font-black uppercase">Executing Handover...</p></div>}
                          </div>
                       </div>
                    </div>
                 )}
                 <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 mb-4"><div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">📅</div><div className="flex flex-col"><label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Appointment Schedule</label><span className="text-[9px] text-slate-400 font-bold uppercase">Locked Meeting Event</span></div></div>
                    <div className="grid grid-cols-2 gap-3 p-1 bg-slate-50 rounded-xl border border-slate-100">
                        <input type="date" className="bg-transparent p-3 font-bold text-sm outline-none text-slate-700" value={client.appointments?.firstApptDate || ''} onChange={(e) => onUpdateField(client.id, 'firstApptDate', e.target.value, 'appointments')} />
                        <input type="time" className="bg-transparent p-3 font-bold text-sm outline-none text-indigo-600 text-right" value={client.appointments?.apptTime || ''} onChange={(e) => onUpdateField(client.id, 'apptTime', e.target.value, 'appointments')} />
                    </div>
                 </div>
                 <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 mb-4"><div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">🔔</div><div className="flex flex-col"><label className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Follow Up Protocol</label><span className="text-[9px] text-slate-400 font-bold uppercase">Next Strategic Touchpoint</span></div></div>
                    <div className="grid grid-cols-2 gap-3 p-1 bg-slate-50 rounded-xl border border-slate-100">
                        <input type="date" className="bg-transparent p-3 font-bold text-sm outline-none text-slate-700" value={client.followUp.nextFollowUpDate || ''} onChange={(e) => onUpdateField(client.id, 'nextFollowUpDate', e.target.value, 'followUp')} />
                        <input type="time" className="bg-transparent p-3 font-bold text-sm outline-none text-amber-600 text-right" value={client.followUp.nextFollowUpTime || ''} onChange={(e) => onUpdateField(client.id, 'nextFollowUpTime', e.target.value, 'followUp')} />
                    </div>
                 </div>
                 <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">Advisor Insights & Notes</label><textarea className="w-full h-40 p-4 bg-slate-50 rounded-xl text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all resize-none border-none shadow-inner" value={client.followUp.notes || ''} onChange={(e) => onUpdateField(client.id, 'notes', e.target.value, 'followUp')} placeholder="Enter client behavioral insights..." /></div>
              </div>
           )}

           {activeTab === 'files' && (
              <div className="space-y-8">
                 <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl"></div>
                    <h4 className="font-black text-xl tracking-tighter mb-2 relative z-10">Vault Ingest</h4>
                    <p className="text-xs text-slate-400 mb-6 font-medium relative z-10">Select category before dropping files.</p>
                    <div className="flex flex-wrap gap-2 mb-6 relative z-10">
                       {FILE_CATEGORIES.map(cat => <button key={cat.id} onClick={() => setSelectedUploadCategory(cat.id)} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase transition-all ${selectedUploadCategory === cat.id ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>{cat.icon} {cat.label}</button>)}
                    </div>
                    <FileUploader onUpload={handleFileUpload} isUploading={isUploading} />
                 </div>
                 <div className="space-y-6">
                    {FILE_CATEGORIES.map(cat => {
                       const catFiles = files.filter(f => (f.category || 'others') === cat.id);
                       if (catFiles.length === 0) return null;
                       return (
                          <div key={cat.id} className="space-y-3">
                             <h5 className="text-[10px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-2">{cat.icon} {cat.label} ({catFiles.length})</h5>
                             <div className="grid grid-cols-1 gap-2">
                                {catFiles.map(f => (
                                   <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="p-4 bg-white border border-slate-100 rounded-2xl flex items-center gap-4 hover:border-emerald-500 hover:shadow-md transition-all group">
                                      <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-xl group-hover:bg-emerald-50 transition-colors">{f.mime_type?.includes('image') ? '🖼️' : '📄'}</div>
                                      <div className="flex-1 min-w-0"><div className="text-xs font-black text-slate-700 truncate">{f.name}</div><div className="text-[9px] text-slate-400 uppercase font-bold">{(f.size_bytes / 1024).toFixed(1)} KB • {fmtDateTime(f.created_at)}</div></div>
                                      <div className="text-slate-300 group-hover:text-emerald-500">📥</div>
                                   </a>
                                ))}
                             </div>
                          </div>
                       );
                    })}
                    {files.length === 0 && <div className="p-12 text-center bg-white border-2 border-dashed border-slate-100 rounded-3xl text-slate-300 italic text-sm">Vault is empty.</div>}
                 </div>
              </div>
           )}

           {activeTab === 'activity' && (
              <div className="space-y-6 border-l-2 border-slate-100 ml-4 pl-8 py-2">
                 {activities.map(a => (
                    <div key={a.id} className="relative mb-8 group">
                       <div className="absolute -left-[41px] top-0 w-4 h-4 rounded-full bg-white border-2 border-indigo-500 shadow-sm" />
                       <div className="flex justify-between items-center mb-2">
                           <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{fmtDateTime(a.created_at)}</div>
                           {isAdmin && (
                               <button 
                                   onClick={(e) => handleDeleteActivity(e, a.id)}
                                   className="text-[10px] text-red-400 hover:text-white hover:bg-red-500 transition-colors px-3 py-1 bg-white border border-red-200 rounded font-bold shadow-sm z-50 relative opacity-0 group-hover:opacity-100"
                               >
                                   Delete Log
                               </button>
                           )}
                       </div>
                       <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:border-slate-200 transition-colors">
                          <div className="text-xs font-bold text-slate-700 leading-relaxed">{a.title}</div>
                       </div>
                    </div>
                 ))}
                 {activities.length === 0 && <div className="text-center text-slate-400 text-xs italic">No activity recorded.</div>}
              </div>
           )}
        </div>
        
        <div className="p-6 border-t border-slate-50 bg-white flex gap-4">
           {canDeleteClient && (
               <Button variant="ghost" className="flex-1 hover:bg-red-50 hover:text-red-600 transition-colors" onClick={handleDeleteClient} isLoading={isDeleting}>Delete Client</Button>
           )}
           <Button variant="primary" className="flex-[2] bg-indigo-600 hover:bg-indigo-700 border-none" onClick={onOpenFullProfile} leftIcon="↗">Strategic Desk</Button>
        </div>
      </div>
    </div>
  );
};

export default ClientDrawer;
