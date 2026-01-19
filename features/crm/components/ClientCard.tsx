import React, { useState, useEffect, useCallback, memo } from 'react';
import { Client, FamilyMember, Policy, UserProfile, Sale, Product, ContactStatus } from '../../../types';
import { analyzeClientMomentum, generateInvestmentReport, polishContent } from '../../../lib/gemini';
import { DEFAULT_SETTINGS } from '../../../lib/config';
import { FinancialTools } from './FinancialTools';
import { fmtDateTime, fmtSGD, toNum } from '../../../lib/helpers';
import { logActivity } from '../../../lib/db/activities';
import { useToast } from '../../../contexts/ToastContext';
import { useDialog } from '../../../contexts/DialogContext'; 
import { db } from '../../../lib/db';
import { AddSaleModal } from './AddSaleModal';
import ClosureDeckModal from './ClosureDeckModal'; 
import { adminDb } from '../../../lib/db/admin';
import { WhatsAppModal } from './WhatsAppModal';
import { DEFAULT_TEMPLATES } from '../../../lib/templates';
import { dbTemplates } from '../../../lib/db/templates';

interface ClientCardProps {
  client: Client;
  onUpdate: (updatedClient: Client) => void;
  currentUser?: UserProfile | null;
  onDelete?: (id: string) => Promise<void> | void; 
  onAddSale?: () => void;
  products?: Product[]; 
  onClose?: () => void; 
}

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

const DEFAULT_CAMPAIGNS = ["PS5 Giveaway", "Retirement eBook", "Tax Masterclass"];

const EditableField = memo(({ label, value, onChange, type = 'text', options = [], className = '', placeholder = '-' }: any) => {
  const displayValue = type === 'datetime-local' && value && typeof value === 'string' ? (value.length > 16 ? value.substring(0, 16) : value) : (value || '');
  
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{label}</label>
      {type === 'select' ? (
        <select 
            value={value || ''} 
            onChange={(e) => onChange(e.target.value)} 
            className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:bg-white transition-all cursor-pointer"
        >
          <option value="">Select...</option>
          {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea 
            value={value || ''} 
            onChange={(e) => onChange(e.target.value)} 
            placeholder={placeholder} 
            rows={3} 
            className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:bg-white transition-all resize-none" 
        />
      ) : (
        <input 
            type={type} 
            value={displayValue} 
            onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) : e.target.value)} 
            placeholder={placeholder} 
            className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:bg-white transition-all truncate" 
        />
      )}
    </div>
  );
});

export const ClientCard: React.FC<ClientCardProps> = ({ client, onUpdate, currentUser, onDelete, onAddSale, products = [], onClose }) => {
  const toast = useToast();
  const { confirm } = useDialog(); 
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'closures' | 'logs' | 'family' | 'policies' | 'tools'>('overview');
  const [isEditingCampaign, setIsEditingCampaign] = useState(false);
  const [campaignOptions, setCampaignOptions] = useState<string[]>(DEFAULT_CAMPAIGNS);
  
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
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [showClosureDeck, setShowClosureDeck] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [waTemplates, setWaTemplates] = useState(DEFAULT_TEMPLATES);
  const [isPolishing, setIsPolishing] = useState(false);

  const isOwner = client._ownerId === currentUser?.id;
  const canDeleteClient = currentUser?.email === 'sales.carlingtonsc@gmail.com' || currentUser?.role === 'admin' || currentUser?.is_admin === true;
  const canDeleteLogs = canDeleteClient || isOwner; 

  const campaignTag = (client.tags || []).find(t => t.startsWith('Campaign: '));
  const campaignName = campaignTag ? campaignTag.replace('Campaign: ', '') : '';
  const industryTag = (client.tags || []).find(t => t.startsWith('Industry: '));
  const industryName = industryTag ? industryTag.replace('Industry: ', '') : '';

  const custodianDisplay = client._ownerEmail || (client.advisorId === currentUser?.id ? 'Me' : 'System/Me');

  useEffect(() => {
      const loadSettings = async () => {
          const settings = await adminDb.getSystemSettings(currentUser?.organizationId);
          if (settings?.appSettings?.campaigns?.length) setCampaignOptions(settings.appSettings.campaigns);
      };
      loadSettings();
  }, [currentUser?.organizationId]);

  const handleUpdateField = useCallback((field: keyof Client | string, val: any) => {
      const now = new Date();
      if (field === 'gender' || field === 'monthlyInvestmentAmount' || field === 'dob') {
          onUpdate({ ...client, profile: { ...client.profile, [field]: val } });
          return;
      }
      if (field === 'jobTitle') {
          onUpdate({ ...client, jobTitle: val, profile: { ...client.profile, jobTitle: val } });
          return;
      }
      if (field === 'nextFollowUpDate') {
          onUpdate({ ...client, followUp: { ...client.followUp, nextFollowUpDate: val } });
          return;
      }
      if (field === 'stage' && val !== client.stage) {
          const statusKey = REVERSE_STATUS_MAP[val] || val;
          const logEntry = { id: `sys_${now.getTime()}`, content: `Stage updated: ${client.stage || 'New'} ➔ ${val}`, date: now.toISOString(), author: 'System' };
          onUpdate({ ...client, stage: val, followUp: { ...client.followUp, status: statusKey as ContactStatus, lastContactedAt: now.toISOString() }, notes: [logEntry, ...(client.notes || [])], lastUpdated: now.toISOString() });
          logActivity(client.id, 'status_change', `Stage changed to ${val}`);
      } else {
          onUpdate({ ...client, [field]: val });
      }
  }, [client, onUpdate]);

  const updateCampaign = (newCampaign: string) => {
      const currentTags = client.tags || [];
      const otherTags = currentTags.filter(t => !t.startsWith('Campaign: '));
      const newTags = newCampaign ? [...otherTags, `Campaign: ${newCampaign}`] : otherTags;
      onUpdate({ ...client, tags: newTags });
      setIsEditingCampaign(false);
  };

  const handlePolishGoals = async () => {
      if (!client.goals) return;
      setIsPolishing(true);
      try {
          const polished = await polishContent(client.goals, 'professional');
          onUpdate({ ...client, goals: polished });
          toast.success("AI Polish Complete");
      } catch (e) {
          toast.error("Polish failed");
      } finally {
          setIsPolishing(false);
      }
  };

  const handleRefreshAnalysis = async () => {
    setIsAnalyzing(true);
    const result = await analyzeClientMomentum(client);
    onUpdate({ ...client, momentumScore: result.score, nextAction: result.nextAction });
    setIsAnalyzing(false);
  };

  const handleCall = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const rawPhone = client.phone || client.profile?.phone || '';
    if (!rawPhone) { toast.error("No phone number found"); return; }
    
    const now = new Date().toISOString();
    const logEntry = { id: `call_${Date.now()}`, content: `Outgoing Call initiated to ${rawPhone}`, date: now, author: 'Me' };
    const updatedClient = { ...client, lastContact: now, lastUpdated: now, notes: [logEntry, ...(client.notes || [])] };

    try { await db.saveClient(updatedClient, currentUser?.id); } catch(e) {}
    onUpdate(updatedClient);
    
    setTimeout(() => { window.location.href = `tel:${rawPhone}`; }, 250);
  };

  const handleCalendar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const phone = client.phone || client.profile?.phone || '-';
    const currentCampaign = campaignName || 'General Outreach'; 
    const context = client.goals || 'Strategic review session.';
    const zoomLink = "https://us06web.zoom.us/j/2300107843"; 

    const title = `${client.name} / Zoom / ${phone} / ${currentCampaign}`;
    const description = `Phone: ${phone}\nCampaign: ${currentCampaign}\nZoom: ${zoomLink}\n\nGoals: ${context}`;

    let url = `https://calendar.google.com/calendar/u/0/r/eventedit?text=${encodeURIComponent(title)}&details=${encodeURIComponent(description)}`;
    if (client.firstApptDate) {
        const start = new Date(client.firstApptDate);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        const fmt = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, "");
        url += `&dates=${fmt(start)}/${fmt(end)}`;
    }
    
    const now = new Date().toISOString();
    const logEntry = { id: `book_${Date.now()}`, content: `Calendar Invitation Sent: ${title}`, date: now, author: 'Me' };
    const updatedClient = { ...client, lastUpdated: now, notes: [logEntry, ...(client.notes || [])] };

    try { await db.saveClient(updatedClient, currentUser?.id); } catch(e) {}
    onUpdate(updatedClient);
    
    setTimeout(() => { window.open(url, '_blank'); }, 250);
  };

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowWhatsApp(true);
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    const noteEntry = { id: `note_${Date.now()}`, content: newNote, date: new Date().toISOString(), author: 'Me' };
    onUpdate({ ...client, notes: [noteEntry, ...(client.notes || [])] });
    setNewNote('');
  };

  const getMomentumColor = (score: number) => {
    if (score >= 70) return 'text-emerald-600 bg-emerald-50 border-emerald-100';
    if (score >= 40) return 'text-amber-600 bg-amber-50 border-amber-100';
    return 'text-rose-600 bg-rose-50 border-rose-100';
  };

  return (
    <div className="group bg-white rounded-xl border border-slate-200 shadow-sm transition-all flex flex-col h-full max-h-[700px] overflow-hidden">
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start">
         <div className="flex-1 mr-4">
             <input className="text-lg font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-emerald-500 focus:outline-none w-full transition-colors" value={client.name} onChange={(e) => handleUpdateField('name', e.target.value)} placeholder="Client Name" />
             <input className="text-xs text-slate-500 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-emerald-500 focus:outline-none w-full mt-1" value={client.company} onChange={(e) => handleUpdateField('company', e.target.value)} placeholder="Company / Organization" />
         </div>
         <div className="flex items-start gap-4">
            <div className="flex flex-col items-end">
                <div className={`text-sm font-bold px-3 py-1 rounded-full border ${getMomentumColor(client.momentumScore || 0)} mb-1`}>Score: {client.momentumScore || 0}</div>
                <div className="flex gap-2 text-[10px] text-slate-400"><span>{(client.sales?.length || 0)} Sales</span><span>•</span><span>${(client.value || 0).toLocaleString()} Exp. Revenue</span></div>
            </div>
            {onClose && <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors">✕</button>}
         </div>
      </div>
      
      <div className="flex border-b border-slate-100">
          {['overview', 'closures', 'logs', 'family', 'policies', 'tools'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 py-3 text-[10px] font-bold border-b-2 uppercase tracking-widest transition-colors ${activeTab === tab ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>{tab}</button>
          ))}
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {activeTab === 'overview' && (
              <div className="space-y-6">
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 flex justify-between items-center mb-2">
                     <span className="text-[10px] font-bold text-slate-400 uppercase">Portfolio Custodian</span>
                     <span className="text-xs font-bold text-indigo-600">{custodianDisplay}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <EditableField label="Current Stage" value={client.stage} onChange={(v:any) => handleUpdateField('stage', v)} type="select" options={DEFAULT_SETTINGS.statuses} />
                      <EditableField label="Priority" value={client.priority} onChange={(v:any) => handleUpdateField('priority', v)} type="select" options={['High', 'Medium', 'Low']} />
                      <EditableField label="Exp. Revenue ($)" value={client.value} onChange={(v:any) => handleUpdateField('value', v)} type="number" placeholder="Est. Revenue" />
                      <EditableField label="Platform" value={client.platform} onChange={(v:any) => handleUpdateField('platform', v)} type="select" options={DEFAULT_SETTINGS.platforms} />
                  </div>
                  
                  <div className="flex gap-2">
                      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowClosureDeck(true); }} className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-lg transition-all font-bold text-xs flex items-center justify-center gap-2 transform active:scale-[0.98]">
                          <span>⚡ Launch Closure Deck</span>
                      </button>
                      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddSale && onAddSale(); }} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-500/30 transition-all font-bold text-xs flex items-center justify-center gap-2 transform active:scale-[0.98]">
                          <span>💰 Record Sale</span>
                      </button>
                  </div>

                  <div className="border-t border-slate-100 my-2"></div>
                  <div className="grid grid-cols-2 gap-4">
                      <EditableField label="Next Appt (Firm)" value={client.firstApptDate} onChange={(v:any) => handleUpdateField('firstApptDate', v)} type="datetime-local" />
                      <EditableField label="Next Follow Up (Task)" value={client.followUp?.nextFollowUpDate} onChange={(v:any) => handleUpdateField('nextFollowUpDate', v)} type="date" />
                  </div>
                  
                  <div className="border-t border-slate-100 my-2"></div>
                  <div className="grid grid-cols-2 gap-4">
                      <EditableField label="Status" value={client.contactStatus} onChange={(v:any) => handleUpdateField('contactStatus', v)} type="select" options={['Uncontacted', 'Attempted', 'Active']} />
                      <EditableField label="Phone" value={client.phone} onChange={(v:any) => handleUpdateField('phone', v)} type="text" />
                      <EditableField label="Email" value={client.email} onChange={(v:any) => handleUpdateField('email', v)} type="text" />
                      <EditableField label="DOB" value={client.profile?.dob} onChange={(v:any) => handleUpdateField('dob', v)} type="date" />
                  </div>

                  <div className="border-t border-slate-100 my-2"></div>
                  <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100 space-y-4">
                      <div className="flex justify-between items-start">
                          <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-1">Lead Context & Financials</h4>
                          {isEditingCampaign ? (
                              <select className="text-[10px] font-bold bg-white border border-indigo-200 text-indigo-800 rounded px-2 py-1 outline-none cursor-pointer" value={campaignName} onChange={(e) => updateCampaign(e.target.value)} onBlur={() => setIsEditingCampaign(false)} autoFocus>
                                  <option value="">No Campaign</option>
                                  {campaignOptions.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                          ) : (
                              <button onClick={() => setIsEditingCampaign(true)} className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border shadow-sm transition-all ${campaignName ? 'bg-indigo-200 text-indigo-800 border-indigo-300' : 'bg-white text-slate-400 border-slate-200 hover:text-indigo-600 hover:border-indigo-300'}`}>
                                  {campaignName ? `🎁 ${campaignName}` : '＋ Assign Campaign'}
                              </button>
                          )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                          <EditableField label="Job Title" value={client.jobTitle || client.profile?.jobTitle} onChange={(v:any) => handleUpdateField('jobTitle', v)} type="text" placeholder="e.g. Manager" />
                          <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Industry / Sector</label>
                              <input className="w-full bg-white border border-slate-200 text-slate-700 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all" value={industryName} disabled placeholder="-" />
                          </div>
                          <EditableField label="Gender" value={client.profile?.gender} onChange={(v:any) => handleUpdateField('gender', v)} type="select" options={['male', 'female']} />
                          <EditableField label="Reported Retirement Age" value={client.profile?.retirementAge} onChange={(v:any) => handleUpdateField('retirementAge', v)} type="text" placeholder="65" />
                          <EditableField label="Reported Savings ($)" value={client.profile?.monthlyInvestmentAmount} onChange={(v:any) => handleUpdateField('monthlyInvestmentAmount', v)} type="text" placeholder="e.g. 500" />
                          <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Est. Monthly Income</label>
                              <div className="text-xs font-bold text-slate-700 px-2 py-1.5 bg-slate-100 rounded-lg border border-slate-200">
                                  {fmtSGD(toNum(client.profile?.monthlyIncome) || toNum(client.profile?.grossSalary))}
                              </div>
                          </div>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-indigo-100 shadow-sm relative">
                          <div className="flex justify-between items-center mb-2">
                              <label className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">"Why I want to win?" (Context)</label>
                              <button 
                                  onClick={handlePolishGoals} 
                                  disabled={isPolishing || !client.goals}
                                  className="text-[9px] font-bold text-indigo-500 hover:text-indigo-700 flex items-center gap-1 disabled:opacity-50 transition-colors"
                              >
                                  {isPolishing ? <span className="animate-spin">✨</span> : <span>✨ AI Polish</span>}
                              </button>
                          </div>
                          <textarea value={client.goals} onChange={(e) => handleUpdateField('goals', e.target.value)} className="w-full text-xs font-medium text-slate-700 bg-transparent outline-none resize-none placeholder-slate-300" rows={3} placeholder="Client context..." />
                      </div>
                  </div>

                  <div className="bg-gradient-to-br from-slate-50 to-blue-50/50 rounded-lg p-3 border border-slate-100 mt-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1">Smart Next Step</span>
                      <button onClick={handleRefreshAnalysis} className={`text-[10px] text-blue-600 hover:text-blue-800 font-medium transition-colors ${isAnalyzing ? 'animate-pulse' : ''}`} disabled={isAnalyzing}>{isAnalyzing ? 'Thinking...' : 'Refresh AI'}</button>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">{client.nextAction || "Review recent notes to determine next steps."}</p>
                  </div>
              </div>
          )}
          {activeTab === 'logs' && (
              <div className="flex flex-col h-full">
                  <div className="flex-1 space-y-3 mb-4 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
                      {(client.notes || []).map((note, i) => (
                          <div key={i} className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
                              <div className="flex justify-between items-start mb-1">
                                  <span className="font-bold text-slate-700">{note.author}</span>
                                  <span className="text-[9px] text-slate-400 font-mono">{fmtDateTime(note.date)}</span>
                              </div>
                              <p className="text-slate-600 whitespace-pre-wrap">{note.content}</p>
                          </div>
                      ))}
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                      <textarea className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-100" rows={2} placeholder="Add log..." value={newNote} onChange={(e) => setNewNote(e.target.value)} />
                      <button onClick={handleAddNote} className="w-full mt-2 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg">Add Log</button>
                  </div>
              </div>
          )}
      </div>
      
      <div className="p-3 border-t border-slate-100 bg-slate-50 flex gap-2 shrink-0">
            <button onClick={handleCall} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold transition-all hover:bg-slate-800">Call</button>
            <button onClick={handleWhatsApp} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#25D366] text-white rounded-lg text-xs font-bold transition-all hover:bg-[#128C7E]">Chat</button>
            <button onClick={handleCalendar} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg text-xs font-bold transition-all hover:bg-blue-100">Book</button>
      </div>

      {showWhatsApp && (
          <WhatsAppModal 
             client={client}
             templates={waTemplates}
             onClose={() => setShowWhatsApp(false)}
             onSend={async (label, content) => {
                const now = new Date().toISOString();
                const updatedClient = { ...client, lastContact: now, lastUpdated: now, notes: [{ id: `wa_${Date.now()}`, content: `WhatsApp Sent: ${label}`, date: now, author: 'Me' }, ...(client.notes || [])] };
                try { await db.saveClient(updatedClient, currentUser?.id); } catch(e) {}
                onUpdate(updatedClient);
             }}
          />
      )}

      {editingSale && (
          <AddSaleModal 
              clientName={client.name}
              products={products} 
              advisorBanding={50} 
              onClose={() => setEditingSale(null)}
              onSave={(updatedSale) => {
                const sales = [...(client.sales || [])];
                const index = sales.findIndex(s => s.id === updatedSale.id);
                if (index > -1) sales[index] = updatedSale;
                else sales.push(updatedSale);
                onUpdate({ ...client, sales, lastUpdated: new Date().toISOString() });
              }}
              initialSale={editingSale}
          />
      )}

      <ClosureDeckModal 
         isOpen={showClosureDeck}
         onClose={() => setShowClosureDeck(false)}
         client={client}
      />
    </div>
  );
};