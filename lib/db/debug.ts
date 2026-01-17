import { supabase } from '../supabase';

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (e) {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const runDiagnostics = async () => {
  if (!supabase) return { status: 'error', message: 'Supabase client not initialized' };
  
  const results: any = {
    timestamp: new Date().toISOString(),
    tests: []
  };

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    
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

    // 4. Check Hierarchy Schema
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

    results.status = results.tests.every((t: any) => t.passed) ? 'healthy' : 'degraded';
  } catch (e: any) {
    results.status = 'critical';
    results.message = e.message;
  }

  return results;
};

// NEW: Active Write Probe to diagnose RLS issues
export const probeWriteAccess = async () => {
  if (!supabase) return { success: false, logs: ['Supabase not initialized'] };
  const logs: string[] = [];
  const probeId = generateUUID(); // Robust UUID
  
  try {
    logs.push("⏱️ Getting Session...");
    
    // Add timeout to session retrieval to prevent infinite hangs
    const sessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Session check timed out")), 5000));
    
    const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any;
    
    const user = session?.user;
    if (!user) {
        logs.push("❌ No Active Session (User is null). Please re-login.");
        return { success: false, logs };
    }
    logs.push(`👤 User: ${user.email} (${user.id.substring(0, 8)}...)`);

    // 1. Attempt Write
    logs.push("👉 Attempting INSERT...");
    const { error: insertErr } = await supabase.from('clients').insert({
        id: probeId,
        user_id: user.id,
        data: { name: 'Probe Test' },
        updated_at: new Date().toISOString()
    });

    if (insertErr) {
        logs.push(`❌ INSERT Failed: ${insertErr.message}`);
        logs.push(`ℹ️ Hint: Check 'clients' RLS policy for INSERT.`);
        return { success: false, logs };
    }
    logs.push("✅ INSERT Success (No Error Returned)");

    // 2. Attempt Read
    logs.push("👉 Attempting SELECT (Verification)...");
    const { data: readData, error: readErr } = await supabase.from('clients').select('id').eq('id', probeId).single();
    
    if (readErr || !readData) {
        logs.push(`❌ SELECT Failed: ${readErr?.message || 'Row not found after insert'}`);
        logs.push(`ℹ️ Hint: Check 'clients' RLS policy for SELECT (USING clause).`);
        // We continue to try delete anyway to clean up if it exists but is invisible
    } else {
        logs.push("✅ SELECT Success (Row Verified)");
    }

    // 3. Attempt Delete
    logs.push("👉 Attempting DELETE...");
    const { error: delErr } = await supabase.from('clients').delete().eq('id', probeId);
    
    if (delErr) {
        logs.push(`❌ DELETE Failed: ${delErr.message}`);
    } else {
        logs.push("✅ DELETE Success");
    }

    return { success: true, logs };

  } catch (e: any) {
    logs.push(`❌ CRITICAL EXCEPTION: ${e.message}`);
    return { success: false, logs };
  }
};