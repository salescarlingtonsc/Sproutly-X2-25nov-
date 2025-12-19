
import { supabase } from '../supabase';

export const runDiagnostics = async () => {
  if (!supabase) return "Not configured";
  
  const { data: { user } } = await supabase.auth.getUser();
  const { data: clients, error: clientErr, count } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: false })
    .limit(1);

  return {
    auth_uid: user?.id,
    auth_email: user?.email,
    visible_clients_count: count,
    client_error: clientErr,
    sample_client: clients?.[0]
  };
};
