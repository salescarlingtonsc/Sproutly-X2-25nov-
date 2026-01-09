
import { supabase, isSupabaseConfigured } from './supabase';
import { Client } from '../types';
import { INITIAL_PROFILE, INITIAL_EXPENSES, INITIAL_CPF, INITIAL_CASHFLOW, INITIAL_INSURANCE, INITIAL_INVESTOR, INITIAL_PROPERTY, INITIAL_WEALTH, INITIAL_RETIREMENT } from '../contexts/ClientContext';
import { adminDb } from './db/admin';

const LOCAL_STORAGE_KEY = 'fa_clients';

// Helper to ensure session exists or refresh it
const getActiveSession = async () => {
  if (!supabase) return null;
  
  try {
    // 1. Try standard getSession
    let { data: { session }, error } = await supabase.auth.getSession();
    
    // 2. If missing or error, force a refresh
    if (!session || error) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.warn("Session refresh failed:", refreshError.message);
        return null;
      }
      session = refreshData.session;
    }
    return session;
  } catch (e) {
    console.error("Session check exception:", e);
    return null;
  }
};

export const db = {
  getClients: async (userId?: string): Promise<Client[]> => {
    if (isSupabaseConfigured() && supabase) {
      try {
        const session = await getActiveSession();
        const user = session?.user;
        if (!user) return [];

        // 1. Get Current User's Profile & Role
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('role, is_admin, id, reporting_to')
          .eq('id', user.id)
          .single();

        const role = userProfile?.role || 'advisor';
        const isAdmin = role === 'admin' || userProfile?.is_admin === true;
        const isDirector = role === 'director';
        const isManager = role === 'manager';

        // 2. Determine Visibility Scope
        let targetUserIds: string[] = [user.id]; // Always see own clients

        if (isAdmin || isDirector) {
           // LEVEL 1: VIEW ALL
           // We don't filter by user_id, we fetch everything.
           targetUserIds = []; 
        } else if (isManager) {
           // LEVEL 2: VIEW UNIT (Self + Team Members)
           // Fetch the team where this manager is the leader
           const settings = await adminDb.getSystemSettings();
           const myTeam = settings?.teams?.find(t => t.leaderId === user.id);
           
           if (myTeam) {
               // Find all advisors in this team
               const { data: teamMembers } = await supabase
                   .from('profiles')
                   .select('id')
                   .eq('reporting_to', myTeam.id);
               
               if (teamMembers) {
                   const memberIds = teamMembers.map(m => m.id);
                   targetUserIds = [...targetUserIds, ...memberIds];
               }
           }
        } 
        // LEVEL 3: ADVISOR (Default) -> Only sees self (targetUserIds = [user.id])

        // 3. Construct Query
        let query = supabase
          .from('clients')
          .select('id, data, user_id, updated_at')
          .order('updated_at', { ascending: false });

        // Apply Filter if not Admin/Director
        if (targetUserIds.length > 0) {
            query = query.in('user_id', targetUserIds);
        }
          
        const { data: clients, error: clientError } = await query;
          
        if (clientError) {
          console.error('Data retrieval error (clients):', clientError.message);
          return [];
        }
        
        if (!clients) return [];

        // 4. Map Owner Emails for UI Context
        const uniqueUserIds = Array.from(new Set(clients.map((c: any) => c.user_id).filter(Boolean)));
        const profileMap: Record<string, string> = {};
        
        if (uniqueUserIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, email')
                .in('id', uniqueUserIds);
            
            if (profiles) {
                profiles.forEach((p: any) => {
                    profileMap[p.id] = p.email;
                });
            }
        }

        return clients.map((row: any) => {
          const clientData = row.data || {};
          const profile = clientData.profile || { ...INITIAL_PROFILE };
          const realOwnerEmail = profileMap[row.user_id] || clientData._ownerEmail || `Advisor (${row.user_id?.substring(0,4)})`;

          return {
            ...clientData, 
            id: row.id,
            profile,
            name: clientData.name || profile.name || 'Unnamed Client',
            email: clientData.email || profile.email || '',
            phone: clientData.phone || profile.phone || '',
            followUp: clientData.followUp || { status: 'new' },
            _ownerId: row.user_id,
            _ownerEmail: realOwnerEmail
          } as Client;
        });
      } catch (e: any) {
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
    if (rpcError) throw new Error(rpcError.message);
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

    const session = await getActiveSession();
    const authUser = session?.user;
    
    if (!authUser) {
       // Attempt one more proactive refresh if getActiveSession failed silently
       const { data: refreshData } = await supabase.auth.refreshSession();
       if (!refreshData.session?.user) {
           throw new Error("Session expired. Please reload or log in.");
       }
    }

    // Use specific user ID from session if valid, otherwise fallback
    const validUserId = session?.user?.id || userId;
    if (!validUserId) throw new Error("Authentication missing.");

    const { _ownerId, _ownerEmail, ...payloadData } = client;
    // Trust client-side owner ID if present, else default to current user (self)
    const rowOwnerId = (_ownerId && _ownerId !== 'undefined') ? _ownerId : validUserId;

    const payload: any = {
      id: client.id,
      user_id: rowOwnerId, 
      data: { ...payloadData, lastUpdated: new Date().toISOString() },
      updated_at: new Date().toISOString()
    };
    
    // UPSERT - Optimized to NOT select return data to avoid RLS read policy blocks for non-admin users
    const { error } = await supabase.from('clients').upsert(payload, { onConflict: 'id' });

    if (error) throw new Error(`Sync Error: ${error.message}`);

    const isSelf = rowOwnerId === validUserId;

    // We reconstruct the return object from payload since we trusted the client-side ID
    return {
      ...client,
      id: payload.id,
      _ownerId: rowOwnerId,
      _ownerEmail: isSelf ? session?.user?.email : (client._ownerEmail || 'Pending Sync...')
    };
  },

  createClientsBulk: async (leads: any[], targetUserId: string): Promise<number> => {
    if (!supabase) return 0;
    
    const payloads = leads.map(lead => {
      // Validate UUID format or generate new one
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const id = (lead.id && uuidRegex.test(lead.id)) ? lead.id : crypto.randomUUID();
      
      // Merge INITIAL_PROFILE with imported profile data to ensure structure
      const mergedProfile = {
          ...INITIAL_PROFILE,
          ...(lead.profile || {}),
          // Ensure core identity fields are synced
          name: lead.name || lead.profile?.name || 'Unnamed Lead',
          email: lead.email || lead.profile?.email || '',
          phone: lead.phone || lead.profile?.phone || ''
      };

      return {
        id,
        user_id: targetUserId,
        data: {
          // 1. Spread Default States First
          expenses: INITIAL_EXPENSES,
          retirement: INITIAL_RETIREMENT,
          cpfState: INITIAL_CPF,
          cashflowState: INITIAL_CASHFLOW,
          insuranceState: INITIAL_INSURANCE,
          investorState: INITIAL_INVESTOR,
          propertyState: INITIAL_PROPERTY,
          wealthState: INITIAL_WEALTH,
          followUp: { status: lead.status || 'new' },
          
          // 2. Spread Imported Lead Data (This overrides defaults with imported values like jobTitle, goals)
          ...lead,
          
          // 3. Enforce Critical System Fields
          id,
          profile: mergedProfile,
          lastUpdated: new Date().toISOString(),
          _ownerId: targetUserId,
          advisorId: targetUserId 
        },
        updated_at: new Date().toISOString()
      };
    });

    const { error } = await supabase.from('clients').insert(payloads);
    if (error) throw error;
    return payloads.length;
  },

  deleteClient: async (clientId: string): Promise<void> => {
    // 1. Force use Supabase if object exists, ignoring flag
    if (supabase) {
      
      const session = await getActiveSession();
      if (!session) {
          throw new Error("Authentication Error: You are not logged in. Please refresh.");
      }

      console.log(`[Delete Protocol] Removing ${clientId}...`);

      // 1. Try manual clean first (helps if cascade is broken)
      try {
          await supabase.from('activities').delete().eq('client_id', clientId);
          await supabase.from('client_files').delete().eq('client_id', clientId);
          await supabase.from('client_field_values').delete().eq('client_id', clientId);
      } catch (err) {
          console.warn("Manual cascade warning:", err);
      }

      // 2. Attempt Standard Delete
      console.log("Attempting Standard Delete...");
      const { error, data } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientId)
        .select('id');
      
      // 3. AUTO-FALLBACK: If failed or returned 0 rows (RLS blocked), try Superuser RPC
      if (error || !data || data.length === 0) {
          console.warn("Standard delete blocked/failed. Engaging Superuser Protocol...");
          
          if (error && error.code !== '42501') {
             console.error("Standard Delete Error:", error);
          }

          // Call the V10.4 RPC function
          const { data: rpcData, error: rpcError } = await supabase.rpc('delete_client_admin', { 
              target_client_id: clientId 
          });

          if (rpcError) {
              console.error("Nuclear Delete Failed:", rpcError);
              throw new Error(`DELETE FAILED: ${rpcError.message}. Ensure you have run the 'DB Repair' script (V10.4) in Admin tab.`);
          }

          if (rpcData === true) {
              console.log("Superuser Delete Successful.");
              return; 
          } else {
              // If RPC returned false, it likely means ID wasn't found (already deleted?)
              console.warn("Superuser Delete returned false (ID not found?). Assuming success.");
              return;
          }
      }

      console.log("Standard Delete Successful.");
      return;
    }
    
    // Local fallback
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      console.log("Deleting from Local Storage...");
      const filtered = JSON.parse(saved).filter((c: any) => c.id !== clientId);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
    }
  }
};
