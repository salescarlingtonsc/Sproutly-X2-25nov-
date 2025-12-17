
import React, { useState, useRef, useEffect } from 'react';
import { Client, ClientDocument } from '../../../types';
import StatusDropdown from './StatusDropdown';
import { SelectEditor, TextEditor, DateEditor, getOptionStyle } from './CellEditors';
import FileUploader from '../../../components/common/FileUploader';
import { getClientFiles, uploadClientFile, deleteClientFile } from '../../../lib/db/clientFiles';
import { getClientActivities, logActivity, ActivityItem } from '../../../lib/db/activities';

interface ClientDrawerProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateField: (field: string, value: any, section?: 'profile' | 'followUp' | 'appointments' | 'root') => void;
  onStatusUpdate: (client: Client, newStatus: string) => void;
  onOpenFullProfile: () => void;
  onDelete: () => void;
}

const DrawerField = ({ 
  value, type, options, onChange, placeholder 
}: { 
  value: any, type: string, options?: string[], onChange: (v: any) => void, placeholder?: string 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
     if (isEditing && ref.current) {
        setRect(ref.current.getBoundingClientRect());
     }
  }, [isEditing]);

  const handleStartEdit = () => setIsEditing(true);

  return (
    <div 
      ref={ref}
      onClick={handleStartEdit}
      className={`
         flex-1 p-2 border border-transparent hover:border-gray-200 hover:bg-gray-50 rounded text-sm text-gray-900 transition-all cursor-pointer min-h-[36px] flex items-center
         ${isEditing ? 'ring-2 ring-indigo-500 bg-white' : ''}
      `}
    >
      {type === 'select' && value ? (
         <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${getOptionStyle(value)}`}>{value}</span>
      ) : (
         <span className={!value ? 'text-gray-300' : ''}>{value || placeholder}</span>
      )}

      {isEditing && rect && (
        <>
          {type === 'select' && (
            <SelectEditor 
              value={value} options={options || []} rect={rect}
              onChange={onChange} onClose={() => setIsEditing(false)}
            />
          )}
          {type === 'text' && (
            <TextEditor 
              value={value} rect={rect}
              onChange={onChange} onClose={() => setIsEditing(false)}
            />
          )}
          {type === 'date' && (
            <DateEditor 
              value={value} rect={rect}
              onChange={onChange} onClose={() => setIsEditing(false)}
            />
          )}
        </>
      )}
    </div>
  );
};

const ClientDrawer: React.FC<ClientDrawerProps> = ({ 
  client, isOpen, onClose, onUpdateField, onStatusUpdate, onOpenFullProfile, onDelete 
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'documents' | 'activity'>('details');
  const [files, setFiles] = useState<ClientDocument[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (client && isOpen) {
      loadExtras();
    }
  }, [client?.id, isOpen, activeTab]);

  const loadExtras = async () => {
    if (!client) return;
    setLoading(true);
    try {
      if (activeTab === 'documents') {
         const docs = await getClientFiles(client.id);
         setFiles(docs);
      }
      if (activeTab === 'activity') {
         const acts = await getClientActivities(client.id);
         setActivities(acts);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleFileUpload = async (uploadedFiles: File[]) => {
    if (!client) return;
    try {
      for (const f of uploadedFiles) {
         await uploadClientFile(client.id, f);
      }
      loadExtras(); // Refresh list
    } catch (e) {
      alert("Failed to upload file");
    }
  };

  const handleDeleteFile = async (id: string, path: string) => {
    if (!client) return;
    if(!confirm("Delete file permanently?")) return;
    await deleteClientFile(id, path, client.id);
    loadExtras();
  };

  const handleStatusChange = async (c: Client, s: string) => {
    onStatusUpdate(c, s);
    // Explicitly log the status change activity
    await logActivity(c.id, 'status_change', `Status updated to ${s}`);
    // If activity tab is open, refresh it
    if (activeTab === 'activity') loadExtras();
  };

  if (!isOpen || !client) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-center items-center p-4 sm:p-8">
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      ></div>
      
      <div className="relative w-full max-w-5xl bg-white rounded-lg shadow-2xl flex flex-col z-10 h-[90vh] overflow-hidden animate-fade-in-up">
        
        {/* Header */}
        <div className="px-6 py-3 border-b border-gray-200 flex justify-between items-center bg-white shrink-0">
          <div className="flex items-center gap-2 text-sm text-gray-500">
             <button onClick={onClose} className="hover:bg-gray-100 p-1 rounded transition-colors">✕</button>
             <span className="font-medium text-gray-400">/ {client.profile.name}</span>
          </div>
          <div className="flex items-center gap-2">
             <button onClick={onDelete} className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded hover:bg-red-100 transition-colors">
                Delete
             </button>
             <button onClick={onOpenFullProfile} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded hover:bg-indigo-100 transition-colors">
                Full Profile ↗
             </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 border-b border-gray-100 flex gap-6 bg-gray-50/50">
           {['details', 'documents', 'activity'].map((t) => (
              <button 
                key={t}
                onClick={() => setActiveTab(t as any)}
                className={`py-3 text-sm font-bold border-b-2 transition-colors capitalize ${activeTab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                 {t}
              </button>
           ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-white">
           
           {activeTab === 'details' && (
              <div className="max-w-2xl mx-auto space-y-8">
                 <input 
                    type="text" 
                    value={client.profile.name}
                    onChange={(e) => onUpdateField('name', e.target.value)}
                    className="text-3xl font-bold text-gray-900 w-full outline-none placeholder-gray-300 bg-transparent"
                    placeholder="Unnamed Record"
                 />
                 <div className="space-y-6">
                    <div className="flex gap-4 items-start">
                       <div className="w-32 pt-2 text-xs font-bold text-gray-500 uppercase flex items-center gap-2">Status</div>
                       <div className="flex-1"><StatusDropdown client={client} onUpdate={handleStatusChange} /></div>
                    </div>
                    {/* Standard Fields */}
                    <div className="flex gap-4 items-center group">
                       <div className="w-32 text-xs font-bold text-gray-500 uppercase">Phone</div>
                       <DrawerField type="text" value={client.profile.phone} onChange={(v) => onUpdateField('phone', v)} placeholder="+65..." />
                    </div>
                    <div className="flex gap-4 items-center group">
                       <div className="w-32 text-xs font-bold text-gray-500 uppercase">Retirement Age</div>
                       <DrawerField type="text" value={client.profile.retirementAge} onChange={(v) => onUpdateField('retirementAge', v)} placeholder="65" />
                    </div>
                    <div className="flex gap-4 items-start group">
                       <div className="w-32 pt-2 text-xs font-bold text-gray-500 uppercase">Remarks</div>
                       <DrawerField type="text" value={client.followUp?.notes} onChange={(v) => onUpdateField('notes', v, 'followUp')} placeholder="Add notes..." />
                    </div>
                 </div>
              </div>
           )}

           {activeTab === 'documents' && (
              <div className="max-w-3xl mx-auto">
                 <div className="mb-8">
                    <FileUploader onUpload={handleFileUpload} />
                 </div>
                 
                 {loading && <div className="text-center py-4 text-gray-400">Loading files...</div>}
                 
                 <div className="space-y-2">
                    {files.map(f => (
                       <div key={f.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors group">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center text-xl">📄</div>
                             <div>
                                <div className="text-sm font-bold text-gray-900">{f.name}</div>
                                <div className="text-xs text-gray-500">{(f.size / 1024 / 1024).toFixed(2)} MB • {new Date(f.created_at).toLocaleDateString()}</div>
                             </div>
                          </div>
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                             <a href={f.url} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-white border border-gray-300 rounded text-xs font-bold text-gray-700 hover:bg-gray-100">View</a>
                             <button onClick={() => handleDeleteFile(f.id, f.path)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded text-xs font-bold hover:bg-red-100">Delete</button>
                          </div>
                       </div>
                    ))}
                    {!loading && files.length === 0 && (
                       <div className="text-center text-gray-400 py-10">No documents uploaded yet.</div>
                    )}
                 </div>
              </div>
           )}

           {activeTab === 'activity' && (
              <div className="max-w-3xl mx-auto">
                 {loading && <div className="text-center py-4 text-gray-400">Loading timeline...</div>}
                 
                 <div className="space-y-6 relative border-l-2 border-gray-100 ml-4 py-4">
                    {activities.map((act) => (
                       <div key={act.id} className="relative pl-8">
                          <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-indigo-100 border-2 border-indigo-500"></div>
                          <div className="text-xs text-gray-400 mb-1">{new Date(act.created_at).toLocaleString()}</div>
                          <div className="text-sm font-bold text-gray-800">{act.title}</div>
                          <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{act.type.replace('_', ' ')}</div>
                          {act.details && (
                             <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded mt-2 border border-gray-100">
                                {typeof act.details === 'string' ? act.details : JSON.stringify(act.details)}
                             </div>
                          )}
                       </div>
                    ))}
                    {!loading && activities.length === 0 && (
                       <div className="text-center text-gray-400 py-10 italic">No recorded activity. Change status or upload files to see logs.</div>
                    )}
                 </div>
              </div>
           )}

        </div>
      </div>
    </div>
  );
};

export default ClientDrawer;
