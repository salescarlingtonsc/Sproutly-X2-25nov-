
export interface DiagnosticLog {
  id: string;
  ts: string;
  stage: string;
  message: string;
  data?: any;
  type: 'info' | 'success' | 'error' | 'warning';
}

const STORAGE_KEY = 'sproutly_save_diagnostics_v1';

export const Diagnostics = {
  log: (stage: string, message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info', data?: any) => {
    try {
      const entry: DiagnosticLog = {
        id: Math.random().toString(36).substring(2, 9),
        ts: new Date().toISOString(),
        stage,
        message,
        type,
        data: data ? JSON.parse(JSON.stringify(data)) : undefined // Detach reference
      };

      const existing = localStorage.getItem(STORAGE_KEY);
      const logs: DiagnosticLog[] = existing ? JSON.parse(existing) : [];
      
      // Keep last 50 logs to prevent storage bloat
      const updatedLogs = [entry, ...logs].slice(0, 50);
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedLogs));
      
      // Also output to console for immediate devtools visibility
      const color = type === 'error' ? 'color: red' : type === 'success' ? 'color: green' : 'color: blue';
      console.log(`%c[${stage}] ${message}`, color, data || '');
    } catch (e) {
      console.error("Diagnostic logging failed", e);
    }
  },

  getLogs: (): DiagnosticLog[] => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  },

  clearLogs: () => {
    localStorage.removeItem(STORAGE_KEY);
  },

  exportLogs: () => {
    const logs = Diagnostics.getLogs();
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sproutly_diagnostics_${new Date().toISOString()}.json`;
    a.click();
  },

  // NEW: INTELLIGENT ROOT CAUSE ANALYZER
  analyzeRootCause: (): { verdict: string; fix: string; confidence: string } => {
      const logs = Diagnostics.getLogs();
      const text = JSON.stringify(logs);

      // 1. CHECK FOR CODE INTEGRITY ERRORS (Data missing before send)
      if (text.includes("CodeError")) {
          return {
              verdict: "Code Logic Error",
              fix: "The application code is failing to construct a valid client object. Check 'generateClientObject' in ClientContext.tsx.",
              confidence: "High"
          };
      }

      // 2. CHECK FOR DB RECURSION (Ping works, Save fails)
      const hasConnection = text.includes("Connection Test Passed");
      const hasTimeout = text.includes("Request Timeout") || text.includes("Supabase Request Timeout");
      
      if (hasConnection && hasTimeout) {
          return {
              verdict: "Database Policy Infinite Loop (RLS Recursion)",
              fix: "Your 'db.ts' code is CORRECT. The issue is the SQL Policies. Go to 'Admin' > 'DB Repair' and click 'Copy Repair Script', then run it in Supabase.",
              confidence: "Very High"
          };
      }

      // 3. CHECK FOR NETWORK
      if (text.includes("Network Offline") || (hasTimeout && !hasConnection)) {
          return {
              verdict: "Network Connection Lost",
              fix: "The device cannot reach the server. Switch to 4G or check Wi-Fi.",
              confidence: "Medium"
          };
      }

      // 4. CHECK FOR AUTH
      if (text.includes("JWT") || text.includes("401") || text.includes("No Active User")) {
          return {
              verdict: "Authentication Token Expired",
              fix: "The user session is stale. Sign out and sign back in to refresh the token.",
              confidence: "High"
          };
      }

      return {
          verdict: "Analysis Inconclusive",
          fix: "Try the 'Test Connection' button above to gather more data.",
          confidence: "Low"
      };
  }
};
