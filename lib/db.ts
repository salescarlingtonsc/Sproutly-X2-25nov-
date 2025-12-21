
import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';
import { INITIAL_PROFILE, INITIAL_EXPENSES, INITIAL_CPF, INITIAL_CASHFLOW, INITIAL_INSURANCE, INITIAL_INVESTOR, INITIAL_PROPERTY, INITIAL_WEALTH, INITIAL_RETIREMENT } from '../contexts/ClientContext';

const LOCAL_STORAGE_KEY = 'fa_clients';

export const db = {
  getClients: async (userId?: string): Promise<Client[]> => {
    if (isSupabaseConfigured() && supabase) {
      try {
        // Step 1: Direct fetch from clients.
        const { data: clients, error: clientError } = await supabase
          .from('clients')
          .select('*')
          .order('updated_at', { ascending: false });
          
        if (clientError) {
          console.error('Data retrieval error (clients):', clientError.message);
          return [];
        }
        
        if (!clients) return [];

        // Step 2: Optimized profile lookup. 
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email');
        
        const emailMap: Record<string, string> = {};
        if (profiles) profiles.forEach(p => { emailMap[p.id] = p.email; });

        return clients.map((row: any) => {
          const clientData = row.data || {};
          return {
            ...clientData, 
            id: row.id,
            // Guard: Ensure profile and followUp exist to prevent evaluate errors
            profile: clientData.profile || { ...INITIAL_PROFILE },
            followUp: clientData.followUp || { status: 'new' },
            _ownerId: row.user_id,
            _ownerEmail: emailMap[row.user_id] || `Advisor (${row.user_id.substring(0,4)})`
          } as Client;
        });
      } catch (e: any) {
        console.error('Unexpected error in getClients:', e);
        return [];
      }
    }

    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  },

  saveClient: async (client: Client, userId?: string): Promise<Client> => {
    if (!isSupabaseConfigured() || !supabase) {
      const currentClientsStr = localStorage.getItem(LOCAL_STORAGE_KEY);
      let currentClients: Client[] = currentClientsStr ? JSON.parse(currentClientsStr) : [];
      const clientToSave = { ...client, lastUpdated: new Date().toISOString() };
      const index = currentClients.findIndex(c => c.id === client.id);
      if (index >= 0) currentClients[index] = clientToSave;
      else currentClients.push(clientToSave);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentClients));
      return clientToSave;
    }

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error("401: Authentication required.");

    let finalOwnerId = client._ownerId || authUser.id;

    const clientToSave = {
      ...client,
      _ownerId: finalOwnerId,
      lastUpdated: new Date().toISOString()
    };

    const payload: any = {
      id: client.id,
      user_id: finalOwnerId, 
      data: clientToSave,
      updated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from('clients')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw new Error(error.message || 'Sync Permission Denied.');
    
    let ownerEmail = 'System User';
    try {
      const { data: profile } = await supabase.from('profiles').select('email').eq('id', finalOwnerId).single();
      if (profile) ownerEmail = profile.email;
    } catch (e) {}

    return {
      ...(data.data || {}),
      id: data.id,
      _ownerId: finalOwnerId,
      _ownerEmail: ownerEmail
    };
  },

  createClientsBulk: async (leads: any[], targetUserId: string): Promise<number> => {
    if (!supabase) return 0;
    const payloads = leads.map(lead => {
      const id = crypto.randomUUID();
      return {
        id,
        user_id: targetUserId,
        data: {
          id,
          profile: { ...INITIAL_PROFILE, name: lead.name || 'Unnamed Lead', email: lead.email || '', phone: lead.phone || '' },
          expenses: INITIAL_EXPENSES,
          retirement: INITIAL_RETIREMENT,
          lastUpdated: new Date().toISOString(),
          followUp: { status: lead.status || 'new' },
          _ownerId: targetUserId 
        },
        updated_at: new Date().toISOString()
      };
    });

    const { error } = await supabase.from('clients').insert(payloads);
    if (error) throw error;
    return payloads.length;
  },

  deleteClient: async (clientId: string): Promise<void> => {
    if (isSupabaseConfigured() && supabase) {
      const { error } = await supabase.from('clients').delete().eq('id', clientId);
      if (error) throw new Error(error.message);
      return;
    }
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      const filtered = JSON.parse(saved).filter((c: any) => c.id !== clientId);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
    }
  }
};
