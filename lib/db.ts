
import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';
import { INITIAL_PROFILE, INITIAL_EXPENSES, INITIAL_CPF, INITIAL_CASHFLOW, INITIAL_INSURANCE, INITIAL_INVESTOR, INITIAL_PROPERTY, INITIAL_WEALTH, INITIAL_RETIREMENT } from '../contexts/ClientContext';

const LOCAL_STORAGE_KEY = 'fa_clients';

export const db = {
  getClients: async (userId?: string): Promise<Client[]> => {
    if (isSupabaseConfigured() && supabase) {
      try {
        // Use getSession for faster, local-first auth check. RLS handles security.
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        
        if (!user) return [];

        // 1. Fetch User Profile to determine role and hierarchy
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('role, is_admin, id')
          .eq('id', user.id)
          .single();

        const isAdmin = userProfile?.role === 'admin' || userProfile?.is_admin === true;
        const isDirector = userProfile?.role === 'director';

        // 2. Fetch Clients (Raw Select without Join to prevent schema errors)
        let query = supabase
          .from('clients')
          .select('id, data, user_id, updated_at')
          .order('updated_at', { ascending: false });

        // Hierarchy Logic (Safe Mode)
        if (isAdmin) {
           // Fetch ALL (no filter)
        } else if (isDirector) {
           try {
             // Fetch Self + Direct Reports
             const { data: downline, error: downlineErr } = await supabase
               .from('profiles')
               .select('id')
               .eq('reporting_to', user.id);
             
             if (downlineErr) throw downlineErr; // If column missing, this throws

             const downlineIds = downline?.map(d => d.id) || [];
             const allVisibleIds = [user.id, ...downlineIds];
             query = query.in('user_id', allVisibleIds);
           } catch (e: any) {
             console.warn("Director Hierarchy inactive (missing columns). Reverting to self-only.");
             query = query.eq('user_id', user.id);
           }
        } else {
           // Advisor: Fetch Self Only
           query = query.eq('user_id', user.id);
        }
          
        const { data: clients, error: clientError } = await query;
          
        if (clientError) {
          if (clientError.message.includes('stack depth')) {
             console.error('CRITICAL: Database RLS Recursion detected (Stack Depth). Please run repair script in Admin > Repair Database.');
             return [];
          }
          console.error('Data retrieval error (clients):', clientError.message);
          return [];
        }
        
        if (!clients) return [];

        // 3. Manual Join for Owner Emails
        // We fetch profiles separately to map IDs to Emails, avoiding SQL relationship dependency
        const userIds = Array.from(new Set(clients.map((c: any) => c.user_id).filter(Boolean)));
        const profileMap: Record<string, string> = {};
        
        if (userIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, email')
                .in('id', userIds);
            
            if (profiles) {
                profiles.forEach((p: any) => {
                    profileMap[p.id] = p.email;
                });
            }
        }

        return clients.map((row: any) => {
          const clientData = row.data || {};
          const profile = clientData.profile || { ...INITIAL_PROFILE };
          
          // Map email from manual lookup or fallback
          const realOwnerEmail = profileMap[row.user_id] || clientData._ownerEmail || `Advisor (${row.user_id?.substring(0,4)})`;

          return {
            ...clientData, 
            id: row.id,
            profile,
            // Backfill top-level keys from profile if missing
            name: clientData.name || profile.name || 'Unnamed Client',
            email: clientData.email || profile.email || '',
            phone: clientData.phone || profile.phone || '',
            
            followUp: clientData.followUp || { status: 'new' },
            _ownerId: row.user_id,
            _ownerEmail: realOwnerEmail
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

    // CHANGE: Use getSession instead of getUser. 
    // getUser() verifies against the server and can fail/timeout during rapid syncs.
    // getSession() retrieves the local cached token which is sufficient for RLS to validate.
    const { data: { session } } = await supabase.auth.getSession();
    const authUser = session?.user;
    
    if (!authUser) throw new Error("Unauthorized");

    const { _ownerId, _ownerEmail, ...payloadData } = client;

    // Fix: Explicitly include user_id in the upsert payload
    const validOwnerId = (_ownerId && _ownerId !== 'undefined') ? _ownerId : authUser.id;

    const payload: any = {
      id: client.id,
      user_id: validOwnerId, 
      data: { ...payloadData, lastUpdated: new Date().toISOString() },
      updated_at: new Date().toISOString()
    };
    
    // Perform Upsert
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

    // When returning, if we are the owner, use our email. 
    // If not, we might not know the new email immediately without a re-fetch, but that's okay for save response.
    const returnedOwnerId = data?.user_id || validOwnerId;
    const isSelf = returnedOwnerId === authUser.id;

    return {
      ...(data?.data || client),
      id: data?.id || client.id,
      _ownerId: returnedOwnerId,
      // If we own it, use our email. If not, preserve the existing known email or generic label.
      _ownerEmail: isSelf ? authUser.email : (client._ownerEmail || 'Pending Sync...')
    };
  },

  createClientsBulk: async (leads: any[], targetUserId: string): Promise<number> => {
    if (!supabase) return 0;
    const payloads = leads.map(lead => {
      const id = crypto.randomUUID();
      const name = lead.name || 'Unnamed Lead';
      const email = lead.email || '';
      const phone = lead.phone || '';
      
      return {
        id,
        user_id: targetUserId,
        data: {
          id,
          // Correctly populate top-level fields for CRM search/filtering
          name,
          email,
          phone,
          profile: { ...INITIAL_PROFILE, name, email, phone },
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
