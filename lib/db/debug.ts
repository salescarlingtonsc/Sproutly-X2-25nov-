
import { supabase } from '../supabase';

export const runDiagnostics = async () => {
  if (!supabase) return { status: 'error', message: 'Supabase client not initialized' };
  
  const results: any = {
    timestamp: new Date().toISOString(),
    tests: []
  };

  try {
    const { data: { user } } = await supabase.auth.getUser();
    results.auth = { uid: user?.id, email: user?.email, isAuthenticated: !!user };

    // 1. Check Profile Role
    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', user?.id)
      .single();
    
    results.tests.push({
      name: 'Admin Identity Verification',
      passed: profile?.role === 'admin',
      details: profile ? `Current Role: ${profile.role} | Status: ${profile.status}` : 'No profile found.',
      error: profErr?.message
    });

    // 2. Check RPC Permissions
    const { data: isAdminFunc, error: funcErr } = await supabase.rpc('check_is_admin');
    results.tests.push({
      name: 'Master Key Protocol (SQL)',
      passed: isAdminFunc === true,
      details: isAdminFunc === true ? 'DB engine acknowledges Admin status.' : 'DB engine denied Admin privileges.',
      error: funcErr ? `RPC Error: ${funcErr.message}` : null
    });

    // 3. Check Basic Client Access
    const { count, error: leadErr } = await supabase.from('clients').select('*', { count: 'exact', head: true });
    results.tests.push({
      name: 'Cross-User Visibility',
      passed: !leadErr && (count !== null),
      details: leadErr ? 'RLS is blocking global access.' : `Visible Records: ${count}.`,
      error: leadErr?.message
    });

    // 4. NEW: Check Hierarchy Schema (Director Support)
    // We try to select the specific columns. If they don't exist, this throws an error.
    const { error: schemaErr } = await supabase
      .from('profiles')
      .select('reporting_to, team_name')
      .limit(1);
    
    results.tests.push({
      name: 'Hierarchy Schema Check',
      passed: !schemaErr || !schemaErr.message.includes('does not exist'),
      details: schemaErr ? 'Missing Director/Team columns. Run SQL Repair.' : 'Schema ready for Hierarchy.',
      error: schemaErr?.message
    });

    // 5. Handover Probe
    const { data: updateTest, error: updateErr } = await supabase
        .from('clients')
        .select('id, user_id')
        .limit(1)
        .single();
    
    if (updateTest) {
        results.tests.push({
            name: 'Handover Update Probe',
            passed: !updateErr,
            details: `Probed client ID: ${updateTest.id.substring(0, 8)}. DB Owner: ${updateTest.user_id === user?.id ? 'Self' : 'Other'}.`,
            error: updateErr?.message
        });
    }

    results.status = results.tests.every((t: any) => t.passed) ? 'healthy' : 'degraded';
  } catch (e: any) {
    results.status = 'critical';
    results.message = e.message;
  }

  return results;
};
