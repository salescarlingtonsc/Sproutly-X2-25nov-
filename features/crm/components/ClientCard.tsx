
import React, { useState } from 'react';
import { Client, FamilyMember, Policy, UserProfile } from '../../../types';
import { analyzeClientMomentum, generateInvestmentReport } from '../../../lib/gemini';
import { DEFAULT_SETTINGS } from '../../../lib/config';
import { FinancialTools } from './FinancialTools';
import { fmtDateTime } from '../../../lib/helpers';
import { logActivity } from '../../../lib/db/activities';
import { useToast } from '../../../contexts/ToastContext';
import { useDialog } from '../../../contexts/DialogContext'; // Added
import { db } from '../../../lib/db';

interface ClientCardProps {
  client: Client;
  onUpdate: (updatedClient: Client) => void;
  currentUser?: UserProfile | null;
  onDelete?: (id: string) => Promise<void> | void; 
  onAddSale?: () => void;
}

// ... (KEEP REVERSE_STATUS_MAP and EditableField as is) ...
const REVERSE_STATUS_MAP: Record<string, string> = {
  'New Lead': 'new',
  'Contacted': 'contacted',
  'Picked Up': 'picked_up',
  'NPU 1': 'npu_1',
  'NPU 2': 'npu_2',
  'NPU 3': 'npu_3',
  'NPU 4': 'npu_4',
  'NPU 5': 'npu_5',
  'NPU 6': 'npu_6',
  'Appt Set': 'appt_set',
  'Appt Met': 'appt_met',
  'Proposal': 'proposal',
  'Pending Decision': 'pending_decision',
  'Client': 'client',
  'Case Closed': 'case_closed',
  'Lost': 'not_keen',
};

const EditableField = ({ label, value, onChange, type = 'text', options = [], className = '', placeholder = '-' }: any) => {
  const displayValue = type === 'datetime-local' && value && typeof value === 'string' ? (value.length > 16 ? value.substring(0, 16) : value) : (value || '');
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{label}</label>
      {type === 'select' ? (
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:bg-white transition-all">
          <option value="">Select...</option>
          {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:bg-white transition-all resize-none" />
      ) : (
        <input type={type} value={displayValue} onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) : e.target.value)} placeholder={placeholder} className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:bg-white transition-all truncate" />
      )}
    </div>
  );
};

export const ClientCard: React.FC<ClientCardProps> = ({ client, onUpdate, currentUser, onDelete, onAddSale }) => {
  const toast = useToast();
  const { confirm } = useDialog(); // Use custom dialog hook
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'family' | 'policies' | 'tools'>('overview');
  
  // ... (keep state) ...
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'Father'|'Mother'|'Child'|'Other'>('Child');
  const [newMemberDob, setNewMemberDob] = useState('');
  const [newPolicyProvider, setNewPolicyProvider] = useState('');
  const [newPolicyName, setNewPolicyName] = useState('');
  const [newPolicyNumber, setNewPolicyNumber] = useState('');
  const [newPolicyValue, setNewPolicyValue] = useState('');
  const [newNote, setNewNote] = useState('');
  
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportContent, setReportContent] = useState('');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Permission Logic
  const isOwner = client._ownerId === currentUser?.id;
  const isAdmin = 
    currentUser?.email === 'sales.carlingtonsc@gmail.com' || 
    currentUser?.role === 'admin' || 
    currentUser?.role === 'director' || 
    currentUser?.is_admin === true;
    
  const canDeleteLogs = isAdmin || isOwner;
  const canDeleteClient = isAdmin || isOwner;

  // ... (Keep existing methods: handleRefreshAnalysis, generateUniqueId, handleUpdateField, handleAddFamilyMember, handleAddPolicy, handleAddNote, handleDeleteNote) ...
  const handleRefreshAnalysis = async (e: React.MouseEvent) => {
    e.stopPropagation(); 
    setIsAnalyzing(true);
    const result = await analyzeClientMomentum(client);
    onUpdate({ ...client, momentumScore: result.score, nextAction: result.nextAction });
    setIsAnalyzing(false);
  };

  const generateUniqueId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const handleUpdateField = (field: keyof Client, val: any) => {
      const now = new Date().toISOString();
      const statusKey = REVERSE_STATUS_MAP[val] || val;

      if (field === 'stage' && val !== client.stage) {
          const logEntry = { 
              id: generateUniqueId('sys'), 
              content: `Stage updated: ${client.stage || 'New'} ➔ ${val}`, 
              date: now, 
              author: 'System' 
          };
          
          onUpdate({ 
             ...client, 
             [field]: val,
             followUp: { ...client.followUp, status: statusKey, lastContactedAt: now },
             notes: [logEntry, ...(client.notes || [])],
             lastUpdated: now,
             stageHistory: [...(client.stageHistory || []), { stage: val, date: now }] 
          });
          logActivity(client.id, 'status_change', `Manual stage change to ${val}`);

      } else if (field === 'contactStatus' && val !== client.contactStatus) {
          const logEntry = { 
              id: generateUniqueId('sys'), 
              content: `Status updated: ${client.contactStatus || '-'} ➔ ${val}`, 
              date: now, 
              author: 'System' 
          };
          
          onUpdate({
              ...client,
              [field]: val,
              notes: [logEntry, ...(client.notes || [])],
              lastUpdated: now
          });
      
      } else {
          onUpdate({ ...client, [field]: val });
      }
  };

  const handleAddFamilyMember = () => {
      if (!newMemberName) return;
      const newMember: FamilyMember = { id: generateUniqueId('fam'), name: newMemberName, role: newMemberRole, dob: newMemberDob };
      onUpdate({ ...client, familyMembers: [...(client.familyMembers || []), newMember] });
      setNewMemberName('');
      setNewMemberDob('');
  };

  const handleAddPolicy = () => {
      if (!newPolicyProvider || !newPolicyName) return;
      const newPolicy: Policy = { id: generateUniqueId('pol'), provider: newPolicyProvider, name: newPolicyName, policyNumber: newPolicyNumber || 'N/A', value: parseFloat(newPolicyValue) || 0, startDate: new Date().toISOString() };
      const newTag = `Insured: ${newPolicyProvider}`;
      const updatedTags = (client.tags || []).includes(newTag) ? (client.tags || []) : [...(client.tags || []), newTag];
      onUpdate({ ...client, policies: [...(client.policies || []), newPolicy], tags: updatedTags });
      setNewPolicyProvider(''); setNewPolicyName(''); setNewPolicyNumber(''); setNewPolicyValue('');
  };

  const handleAddNote = () => {
      if (!newNote.trim()) return;
      const noteEntry = {
          id: generateUniqueId('note'),
          content: newNote,
          date: new Date().toISOString(),
          author: 'Me' 
      };
      onUpdate({ ...client, notes: [noteEntry, ...(client.notes || [])] });
      setNewNote('');
  };

  const handleDeleteNote = async (noteId: string, index: number) => {
      if (!canDeleteLogs) {
          toast.error("Permission Denied");
          return;
      }
      
      const isConfirmed = await confirm({
          title: "Delete Log?",
          message: "This action cannot be undone.",
          confirmText: "Delete",
          isDestructive: true
      });

      if (!isConfirmed) return;

      try {
          const currentNotes = [...(client.notes || [])];
          if (index >= 0 && index < currentNotes.length) {
             currentNotes.splice(index, 1);
          } else {
             const noteIndex = currentNotes.findIndex(n => n.id === noteId);
             if (noteIndex > -1) currentNotes.splice(noteIndex, 1);
          }
          const updatedClient = { ...client, notes: currentNotes, lastUpdated: new Date().toISOString() };
          onUpdate(updatedClient);
          try {
              await db.saveClient(updatedClient, currentUser?.id);
              toast.success("Log removed.");
          } catch (err: any) {
              console.error("Save after delete failed:", err);
              toast.error("DB Save Failed: " + err.message);
          }
      } catch (e: any) {
          console.error("Delete failed:", e);
          toast.error("Failed to delete log");
      }
  };

  const handleDeleteClientAction = async () => {
      console.log("Delete Initiated for:", client.id);
      
      // Use Custom Modal instead of window.confirm
      const isConfirmed = await confirm({
          title: "Delete Client Dossier?",
          message: `Are you sure you want to permanently delete ${client.name || 'this client'}? This includes all files, notes, and history. This cannot be undone.`,
          confirmText: "Delete Forever",
          isDestructive: true
      });
      
      if (!isConfirmed) {
          console.log("Delete cancelled by user (Dialog)");
          return;
      }
      
      console.log("User confirmed delete (Dialog)");

      try {
          if (onDelete) {
              await onDelete(client.id);
          } else {
              // Legacy Fallback
              await db.deleteClient(client.id);
              toast.success("Client deleted.");
              setTimeout(() => window.location.reload(), 500);
          }
      } catch (e: any) {
          console.error("DELETE ACTION FAILED:", e);
          alert(`CRITICAL ERROR: ${e.message}`);
          toast.error(e.message);
      }
  };

  // ... (Keep handleGenerateReport, handleWhatsApp, handleCalendar, getMomentumColor) ...
  const handleGenerateReport = async () => {
      setReportModalOpen(true); setIsGeneratingReport(true); setReportContent('Generating personalized investment review...');
      const text = await generateInvestmentReport(client);
      setReportContent(text); setIsGeneratingReport(false);
  };

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rawPhone = client.phone || client.profile?.phone || '';
    let cleanPhone = rawPhone.replace(/\D/g, '');
    if (cleanPhone.length === 8) cleanPhone = '65' + cleanPhone;
    const firstName = (client.name || '').split(' ')[0] || 'there';
    const template = `Hi ${firstName}, it's Sproutly. I found an opportunity that matches your portfolio. Do you have 5 mins?`;
    const encodedText = encodeURIComponent(template);
    const url = cleanPhone.length >= 8 ? `https://wa.me/${cleanPhone}?text=${encodedText}` : `https://wa.me/?text=${encodedText}`;
    window.open(url, '_blank');
  };

  const handleCalendar = (e: React.MouseEvent) => {
    e.stopPropagation();
    let url = '';
    if (client.firstApptDate) {
        const startDate = new Date(client.firstApptDate);
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
        const fmt = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, "");
        url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=Meeting+with+${encodeURIComponent(client.name)}&details=Sproutly+Client+Review&dates=${fmt(startDate)}/${fmt(endDate)}`;
    } else {
        url = `https://calendar.google.com/calendar/u/0/r/eventedit?text=Meeting+with+${encodeURIComponent(client.name)}&details=Review+portfolio+performance`;
    }
    window.open(url, '_blank');
  };

  const getMomentumColor = (score: number) => {
    if (score >= 70) return 'text-emerald-600 bg-emerald-50 border-emerald-100';
    if (score >= 40) return 'text-amber-600 bg-amber-50 border-amber-100';
    return 'text-rose-600 bg-rose-50 border-rose-100';
  };

  return (
    <div className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 cursor-default mb-3 relative overflow-hidden flex flex-col h-full max-h-[700px]">
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start">
         <div className="flex-1 mr-4">
             <input className="text-lg font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-emerald-500 focus:outline-none w-full transition-colors" value={client.name} onChange={(e) => handleUpdateField('name', e.target.value)} placeholder="Client Name" />
             <input className="text-xs text-slate-500 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-emerald-500 focus:outline-none w-full mt-1" value={client.company} onChange={(e) => handleUpdateField('company', e.target.value)} placeholder="Company / Organization" />
         </div>
         <div className={`flex flex-col items-end`}>
            <div className={`text-sm font-bold px-3 py-1 rounded-full border ${getMomentumColor(client.momentumScore || 0)} mb-1`}>Score: {client.momentumScore || 0}</div>
            <div className="flex gap-2 text-[10px] text-slate-400"><span>{(client.sales?.length || 0)} Sales</span><span>•</span><span>${(client.value || 0).toLocaleString()} Exp. Revenue</span></div>
         </div>
      </div>
      <div className="flex border-b border-slate-100">
          {['overview', 'logs', 'tools', 'policies', 'family'].map(tab => (
              <button key={tab} onClick={(e) => { e.stopPropagation(); setActiveTab(tab as any); }} className={`flex-1 py-3 text-xs font-semibold border-b-2 transition-colors capitalize ${activeTab === tab ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                  {tab === 'logs' ? `Logs (${client.notes?.length || 0})` : 
                   tab === 'policies' ? `Policies (${client.policies?.length || 0})` : 
                   tab === 'family' ? `Family (${client.familyMembers?.length || 0})` : tab}
              </button>
          ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
      {activeTab === 'overview' && (
      <div className="space-y-6">
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 flex justify-between items-center">
             <span className="text-[10px] font-bold text-slate-400 uppercase">Portfolio Custodian</span>
             <span className="text-xs font-bold text-indigo-600">{client._ownerEmail || 'System/Me'}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
              <EditableField label="Current Stage" value={client.stage} onChange={(v:any) => handleUpdateField('stage', v)} type="select" options={DEFAULT_SETTINGS.statuses} />
              <EditableField label="Priority" value={client.priority} onChange={(v:any) => handleUpdateField('priority', v)} type="select" options={['High', 'Medium', 'Low']} className={client.priority === 'High' ? 'text-rose-600 font-semibold' : ''} />
              <EditableField label="Exp. Revenue ($)" value={client.value} onChange={(v:any) => handleUpdateField('value', v)} type="number" placeholder="Est. Revenue" />
              <EditableField label="Platform" value={client.platform} onChange={(v:any) => handleUpdateField('platform', v)} type="select" options={DEFAULT_SETTINGS.platforms} />
          </div>
          
          {onAddSale && (
              <button 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddSale(); }} 
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-500/30 transition-all font-bold text-xs flex items-center justify-center gap-2 transform active:scale-[0.98]"
              >
                  <span>💰 Record Closure / Sale</span>
              </button>
          )}

          <div className="border-t border-slate-100 my-2"></div>
          <div className="grid grid-cols-2 gap-4">
              <EditableField label="Next Appt" value={client.firstApptDate} onChange={(v:any) => handleUpdateField('firstApptDate', v)} type="datetime-local" />
              <EditableField label="Status" value={client.contactStatus} onChange={(v:any) => handleUpdateField('contactStatus', v)} type="select" options={['Uncontacted', 'Attempted', 'Active']} />
          </div>
          <div className="border-t border-slate-100 my-2"></div>
          <div className="grid grid-cols-2 gap-4">
              <EditableField label="Phone" value={client.phone} onChange={(v:any) => handleUpdateField('phone', v)} type="text" />
              <EditableField label="Email" value={client.email} onChange={(v:any) => handleUpdateField('email', v)} type="text" />
              <EditableField label="Job" value={client.jobTitle} onChange={(v:any) => handleUpdateField('jobTitle', v)} type="text" />
              <EditableField label="DOB" value={client.dob} onChange={(v:any) => handleUpdateField('dob', v)} type="date" />
          </div>
          <div className="border-t border-slate-100 my-2"></div>
          <div className="space-y-4">
             <div className="grid grid-cols-2 gap-4">
                <EditableField label="Retire Age" value={client.retirementAge} onChange={(v:any) => handleUpdateField('retirementAge', v)} type="number" placeholder="65" />
                <EditableField label="Tags" value={client.tags?.join(', ')} onChange={(v:any) => handleUpdateField('tags', v.split(',').map((s:string) => s.trim()))} type="text" placeholder="e.g. VIP" />
             </div>
             <EditableField label="Goals / Why" value={client.goals} onChange={(v:any) => handleUpdateField('goals', v)} type="textarea" placeholder="Client goals..." />
          </div>
          <div className="bg-gradient-to-br from-slate-50 to-blue-50/50 rounded-lg p-3 border border-slate-100 mt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1">Smart Next Step</span>
              <button onClick={handleRefreshAnalysis} className={`text-[10px] text-blue-600 hover:text-blue-800 font-medium transition-colors ${isAnalyzing ? 'animate-pulse' : ''}`} disabled={isAnalyzing}>{isAnalyzing ? 'Thinking...' : 'Refresh AI'}</button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">{client.nextAction || "Review recent notes to determine next steps."}</p>
          </div>
          {canDeleteClient && (
              <div className="pt-4 border-t border-slate-100">
                  <button 
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteClientAction(); }} 
                      className="w-full text-xs text-red-500 hover:text-white bg-red-50 hover:bg-red-500 py-2 rounded-lg transition-colors font-bold uppercase tracking-wider border border-red-100 cursor-pointer"
                  >
                      Delete Client
                  </button>
              </div>
          )}
      </div>
      )}
      
      {/* ... (Keep other tabs) ... */}
      {activeTab === 'logs' && (
        <div className="flex flex-col h-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex-1 space-y-3 mb-4 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
                {(client.notes || []).map((note, i) => (
                    <div key={`${note.id || 'note'}-${i}`} className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs relative group hover:border-slate-300 transition-colors">
                        <div className="flex justify-between items-start mb-1.5">
                            <div>
                                <span className={`font-bold block ${note.author === 'System' ? 'text-indigo-600' : 'text-slate-700'}`}>{note.author || 'Advisor'}</span>
                                <span className="text-[10px] text-slate-400 font-mono">{fmtDateTime(note.date)}</span>
                            </div>
                            {canDeleteLogs && (
                                <button 
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteNote(note.id, i); }}
                                    className="bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200 p-2 rounded-lg transition-all cursor-pointer z-20 shadow-sm"
                                    title="Delete Log"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            )}
                        </div>
                        <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{note.content}</p>
                    </div>
                ))}
                {(!client.notes || client.notes.length === 0) && (
                    <div className="text-center py-8 text-slate-400 text-xs italic">No activity logs recorded.</div>
                )}
            </div>
            <div className="pt-2 border-t border-slate-100">
                <textarea 
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none resize-none transition-all placeholder-slate-300"
                    rows={3}
                    placeholder="Type a log entry..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddNote(); } }}
                />
                <button 
                    onClick={handleAddNote}
                    disabled={!newNote.trim()}
                    className="w-full mt-2 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 shadow-sm"
                >
                    Add Log Entry
                </button>
            </div>
        </div>
      )}
      
      {activeTab === 'tools' && <FinancialTools client={client} onUpdate={onUpdate} />}
      {activeTab === 'policies' && (
          <div onClick={(e) => e.stopPropagation()}>
              <div className="space-y-2 mb-4">
                  {(!client.policies || client.policies.length === 0) ? <p className="text-xs text-slate-400 italic text-center py-4">No policies added yet.</p> : client.policies.map(p => (
                      <div key={p.id} className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <div className="overflow-hidden"><p className="text-xs font-semibold text-slate-700 truncate">{p.provider} - {p.name}</p><p className="text-[10px] text-slate-400 font-mono">#{p.policyNumber}</p></div>
                          <span className="text-xs font-bold text-emerald-600">${p.value.toLocaleString()}</span>
                      </div>
                  ))}
              </div>
              <div className="pt-3 border-t border-slate-100 space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Add Policy</p>
                  <input className="w-full text-xs p-2 border border-slate-200 rounded-lg text-slate-700 focus:ring-1 focus:ring-slate-400 outline-none" placeholder="Provider" value={newPolicyProvider} onChange={e => setNewPolicyProvider(e.target.value)} />
                  <input className="w-full text-xs p-2 border border-slate-200 rounded-lg text-slate-700 focus:ring-1 focus:ring-slate-400 outline-none" placeholder="Policy Name" value={newPolicyName} onChange={e => setNewPolicyName(e.target.value)} />
                  <div className="flex gap-2">
                     <input className="w-1/2 text-xs p-2 border border-slate-200 rounded-lg text-slate-700 focus:ring-1 focus:ring-slate-400 outline-none" placeholder="Policy #" value={newPolicyNumber} onChange={e => setNewPolicyNumber(e.target.value)} />
                     <input className="w-1/2 text-xs p-2 border border-slate-200 rounded-lg text-slate-700 focus:ring-1 focus:ring-slate-400 outline-none" placeholder="Value ($)" type="number" value={newPolicyValue} onChange={e => setNewPolicyValue(e.target.value)} />
                  </div>
                  <button onClick={handleAddPolicy} className="w-full py-2 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-700 transition-colors shadow-sm">Add Policy</button>
                  <button onClick={handleGenerateReport} className="w-full py-2 mt-2 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-lg hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2">Generate Investment Report</button>
              </div>
          </div>
      )}
      {activeTab === 'family' && (
      <div onClick={(e) => e.stopPropagation()}>
          <div className="space-y-2 mb-4">
              {(!client.familyMembers || client.familyMembers.length === 0) ? <p className="text-xs text-slate-400 italic text-center py-4">No family members listed.</p> : client.familyMembers.map(m => (
                  <div key={m.id} className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <div><p className="text-xs font-semibold text-slate-700">{m.name}</p><p className="text-[10px] text-slate-500">{m.dob ? new Date(m.dob).toLocaleDateString() : 'No DOB'}</p></div>
                      <span className="text-[10px] font-medium px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full">{m.role}</span>
                  </div>
              ))}
          </div>
          <div className="pt-3 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Add Member</p>
              <input className="w-full text-xs p-2 border border-slate-200 rounded-lg mb-2 text-slate-700 focus:ring-1 focus:ring-slate-400 outline-none" placeholder="Name" value={newMemberName} onChange={e => setNewMemberName(e.target.value)} />
              <div className="flex gap-2 mb-2">
                  <select className="text-xs p-2 border border-slate-200 rounded-lg flex-1 bg-white text-slate-700 focus:ring-1 focus:ring-slate-400 outline-none" value={newMemberRole} onChange={e => setNewMemberRole(e.target.value as any)}>
                      <option value="Child">Child</option><option value="Father">Father</option><option value="Mother">Mother</option><option value="Other">Other</option>
                  </select>
                  <input type="date" className="text-xs p-2 border border-slate-200 rounded-lg flex-1 text-slate-700 focus:ring-1 focus:ring-slate-400 outline-none" value={newMemberDob} onChange={e => setNewMemberDob(e.target.value)} />
              </div>
              <button onClick={handleAddFamilyMember} className="w-full py-2 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-700 transition-colors shadow-sm">Add Member</button>
          </div>
      </div>
      )}
      </div>
      <div className="p-3 border-t border-slate-100 bg-slate-50 flex gap-2 shrink-0">
            <button onClick={handleWhatsApp} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-lg text-xs font-bold transition-colors shadow-sm">Chat</button>
            <button onClick={handleCalendar} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100 rounded-lg text-xs font-bold transition-colors shadow-sm">Book</button>
      </div>
      {reportModalOpen && (
          <div className="absolute inset-0 z-50 bg-white flex flex-col p-4 animate-fade-in" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2"><h3 className="font-bold text-sm text-slate-800">Generated Report</h3><button onClick={() => setReportModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button></div>
              <div className="flex-1 bg-slate-50 rounded-lg p-3 text-xs text-slate-700 overflow-y-auto whitespace-pre-wrap font-sans leading-relaxed border border-slate-200">
                  {isGeneratingReport ? <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400"><span className="w-6 h-6 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin"></span>Writing report...</div> : reportContent}
              </div>
              <div className="pt-3 flex gap-2">
                  <button onClick={() => {navigator.clipboard.writeText(reportContent); alert('Copied to clipboard!');}} className="flex-1 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded hover:bg-slate-50">Copy Text</button>
                  <button onClick={() => window.open(`mailto:${client.email}?subject=Investment Review&body=${encodeURIComponent(reportContent)}`)} className="flex-1 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded hover:bg-indigo-700">Email Client</button>
              </div>
          </div>
      )}
    </div>
  );
};
