
import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';
import { INITIAL_PROFILE, INITIAL_EXPENSES, INITIAL_CPF, INITIAL_CASHFLOW, INITIAL_INSURANCE, INITIAL_INVESTOR, INITIAL_PROPERTY, INITIAL_WEALTH, INITIAL_RETIREMENT } from '../contexts/ClientContext';

const LOCAL_STORAGE_KEY = 'fa_clients';

export const db = {
  getClients: async (userId?: string): Promise<Client[]> => {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data: clients, error: clientError } = await supabase
          .from('clients')
          .select('id, data, user_id, updated_at')
          .order('updated_at', { ascending: false });
          
        if (clientError) {
          if (clientError.message.includes('stack depth')) {
             console.error('CRITICAL: Database RLS Recursion detected (Stack Depth). Please run repair script in Admin > Repair Database.');
             return [];
          }
          console.error('Data retrieval error (clients):', clientError.message);
          return [];
        }
        
        if (!clients) return [];

        return clients.map((row: any) => {
          const clientData = row.data || {};
          return {
            ...clientData, 
            id: row.id,
            profile: clientData.profile || { ...INITIAL_PROFILE },
            followUp: clientData.followUp || { status: 'new' },
            _ownerId: row.user_id,
            _ownerEmail: clientData._ownerEmail || `Advisor (${row.user_id.substring(0,4)})`
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

  transferOwnership: async (clientId: string, newUserId: string): Promise<void> => {
    if (!supabase) throw new Error('Supabase not configured');

    const { error: rpcError } = await supabase.rpc('transfer_client_owner', {
      p_client_id: clientId,
      p_new_user_id: newUserId,
    });

    if (rpcError) {
      console.error("Handover RPC Failed:", rpcError);
      throw new Error(rpcError.message);
    }

    const { data: row, error: readError } = await supabase
      .from('clients')
      .select('id, user_id')
      .eq('id', clientId)
      .single();

    if (readError) {
      console.error("Handover verification read failed:", readError);
      throw new Error("Handover executed but status is unverified.");
    }
    
    if (row.user_id !== newUserId) {
      console.error("Handover inconsistency detected. DB Owner:", row.user_id, "vs Expected:", newUserId);
      throw new Error(`Transfer did not persist. user_id is still ${row.user_id}`);
    }
    
    console.debug("Handover Protocol Verified: Owner is now", newUserId);
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
    if (!authUser) throw new Error("Unauthorized");

    const { _ownerId, _ownerEmail, ...payloadData } = client;

    const payload: any = {
      id: client.id,
      data: { ...payloadData, lastUpdated: new Date().toISOString() },
      updated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from('clients')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .maybeSingle();

    if (error) {
      if (error.message.includes('stack depth')) {
         throw new Error("Critical DB Error: Recursion detected. Admin intervention required.");
      }
      throw new Error(`Sync Error: ${error.message}`);
    }

    return {
      ...(data?.data || client),
      id: data?.id || client.id,
      _ownerId: data?.user_id || client._ownerId,
      _ownerEmail: client._ownerEmail
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
