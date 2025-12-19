
import React, { useState, useEffect } from 'react';
import { Client } from '../../../types';
import { fetchActivities, Activity } from '../../../lib/db/activities';
import { fetchClientFiles, uploadClientFile } from '../../../lib/db/clientFiles';
import { parseFinancialDocument } from '../../../lib/gemini';
import FileUploader from '../../../components/common/FileUploader';
import StatusDropdown from './StatusDropdown';
import Button from '../../../components/ui/Button';

interface ClientDrawerProps {
  client: Client;
  isOpen: boolean;
  onClose: () => void;
  onUpdateField: (id: string, field: string, value: any, section: string) => void;
  onStatusUpdate: (client: Client, newStatus: string) => void;
  onOpenFullProfile: () => void;
  onDelete: () => void;
}

const ClientDrawer: React.FC<ClientDrawerProps> = ({ 
  client, isOpen, onClose, onUpdateField, onStatusUpdate, onOpenFullProfile, onDelete 
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'files' | 'activity' | 'insights'>('details');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen && client.id) loadTabContent();
  }, [isOpen, client.id, activeTab]);

  const loadTabContent = async () => {
     if (activeTab === 'activity') setActivities(await fetchActivities(client.id));
     if (activeTab === 'files') setFiles(await fetchClientFiles(client.id));
  };

  const handleFileUpload = async (uploaded: File[]) => {
     setIsProcessing(true);
     try {
        for (const f of uploaded) {
           await uploadClientFile(client.id, f);
           if (f.type.startsWith('image/') || f.type === 'application/pdf') {
              const reader = new FileReader();
              reader.onload = async () => {
                 const base64 = (reader.result as string).split(',')[1];
                 try {
                    const extracted = await parseFinancialDocument(base64, f.type);
                    if (extracted.balances?.oa) onUpdateField(client.id, 'oa', extracted.balances.oa.toString(), 'cpfState.currentBalances');
                 } catch (err) {}
              };
              reader.readAsDataURL(f);
           }
        }
        await loadTabContent();
     } catch (e) {} finally { setIsProcessing(false); }
  };

  if (!isOpen) return null;

  const tabLabels: any = { details: 'Details', files: 'Files', activity: 'Activity', insights: 'Core Insights' };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        
        <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-white">
           <div className="space-y-1">
              <h3 className="font-black text-xl text-slate-800 tracking-tighter">{client.profile.name || 'Profile Draft'}</h3>
              <p className="text-[10px] text-slate-300 font-black uppercase tracking-widest flex items-center gap-2">
                 Ref: {client.id.split('-')[0]} <span className="w-1 h-1 rounded-full bg-slate-200"></span> Last active {new Date(client.lastUpdated).toLocaleDateString()}
              </p>
           </div>
           <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-300 hover:text-slate-900">✕</button>
        </div>
        
        <div className="flex px-6 bg-white border-b border-slate-50 sticky top-0 z-10">
           {['details', 'files', 'activity', 'insights'].map(t => (
              <button 
                key={t} onClick={() => setActiveTab(t as any)}
                className={`px-4 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all relative ${activeTab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                {tabLabels[t]}
                {t === 'insights' && <span className="ml-1 animate-pulse">✨</span>}
              </button>
           ))}
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/20">
           {activeTab === 'details' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-200">
                 <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">Stage Management</label>
                    <StatusDropdown client={client} onUpdate={onStatusUpdate} />
                 </div>
              </div>
           )}

           {activeTab === 'files' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-200">
                 <div className="bg-indigo-600 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                    <h4 className="font-black text-xl tracking-tighter mb-2">Quantum Document Ingest</h4>
                    <p className="text-xs text-indigo-100 mb-6 font-medium opacity-80 leading-relaxed">Auto-extract values from financial statements using Sproutly Logic.</p>
                    <FileUploader onUpload={handleFileUpload} isUploading={isProcessing} />
                 </div>
              </div>
           )}

           {activeTab === 'activity' && (
              <div className="space-y-6 border-l-2 border-slate-100 ml-4 pl-8 py-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                 {activities.map(a => (
                    <div key={a.id} className="relative mb-8">
                       <div className="absolute -left-[41px] top-0 w-4 h-4 rounded-full bg-white border-2 border-indigo-500 shadow-sm" />
                       <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-2">{new Date(a.created_at).toLocaleString()}</div>
                       <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                          <div className="text-xs font-bold text-slate-700 leading-relaxed">{a.title}</div>
                          {a.type === 'file' && <div className="mt-2 text-[10px] text-indigo-500 font-black uppercase tracking-widest border border-indigo-50 bg-indigo-50/30 px-2 py-0.5 rounded w-fit">Protocol Verified</div>}
                       </div>
                    </div>
                 ))}
              </div>
           )}

           {activeTab === 'insights' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
                 <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-2xl border border-slate-800 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl"></div>
                    <h4 className="font-black text-xs uppercase tracking-[0.2em] text-indigo-400 mb-6">Institutional Stress Test</h4>
                    <p className="text-xs text-slate-400 mb-8 leading-relaxed font-medium">Stress test this portfolio against 10,000+ macro scenarios using Sproutly Quantum Core.</p>
                    <Button variant="primary" className="w-full bg-indigo-600 hover:bg-indigo-500 border-none shadow-indigo-500/20 shadow-lg py-4">Initialize Analysis</Button>
                 </div>
              </div>
           )}
        </div>
        
        <div className="p-6 border-t border-slate-50 bg-white flex gap-4">
           <Button variant="ghost" className="flex-1" onClick={onDelete}>Delete Profile</Button>
           <Button variant="primary" className="flex-[2]" onClick={onOpenFullProfile} leftIcon="↗">Open Strategy Desk</Button>
        </div>
      </div>
    </div>
  );
};

export default ClientDrawer;
