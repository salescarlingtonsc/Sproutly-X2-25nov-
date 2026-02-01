
export const toNum = (val: any, def = 0): number => {
  if (typeof val === 'string' && val.includes('_to_')) {
    // Extract first number from range e.g., "$1000_to_$2000" -> 1000
    const match = val.match(/\d+/);
    return match ? parseFloat(match[0]) : def;
  }
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? def : n;
};

export const fmtSGD = (amt: any): string => {
  const num = typeof amt === 'number' ? amt : toNum(amt, 0);
  return `SGD $${num.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const monthNames = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export const parseDob = (iso: string): Date | null => {
  if (!iso) return null;
  const cleanIso = iso.trim().replace(/^'|'$/g, '');
  
  // 1. Handle YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanIso)) {
      const [y, m, d] = cleanIso.split('-').map(Number);
      return new Date(y, m - 1, d);
  }

  // 2. Handle DD/MM/YYYY or MM/DD/YYYY
  if (cleanIso.includes('/')) {
      const parts = cleanIso.split('/').map(Number);
      if (parts.length === 3) {
          // Heuristic: If first part > 12, it must be Day (DD/MM/YYYY)
          if (parts[0] > 12) return new Date(parts[2], parts[1] - 1, parts[0]);
          // If second part > 12, it must be Month (MM/DD/YYYY)
          if (parts[1] > 12) return new Date(parts[2], parts[0] - 1, parts[1]);
          // Default to US format (MM/DD/YYYY) as it's common in exports, 
          // but we prioritize based on the values above.
          return new Date(parts[2], parts[0] - 1, parts[1]);
      }
  }

  const d = new Date(cleanIso);
  return isNaN(d.getTime()) ? null : d;
};

export const monthsSinceDob = (dob: Date, refYear: number, refMonth: number): number => {
  const dobYear = dob.getFullYear();
  const dobMonth = dob.getMonth();
  return (refYear - dobYear) * 12 + (refMonth - dobMonth);
};

export const getAge = (dobIso: string): number => {
  if (!dobIso) return 0;
  const birthDate = parseDob(dobIso);
  if (!birthDate || isNaN(birthDate.getTime())) return 0;
  
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
  }
  return Math.max(0, age);
};

export const safeArray = <T>(arr: any): T[] => {
  return Array.isArray(arr) ? arr : [];
};

export const fmtTime = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-SG', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

export const fmtDateTime = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-SG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

export const convert24to12 = (time24: string): string => {
  if (!time24 || !time24.includes(':')) return time24;
  const [h, m] = time24.split(':');
  const hours = parseInt(h, 10);
  const suffix = hours >= 12 ? 'pm' : 'am';
  const h12 = hours % 12 || 12;
  return `${h12}:${m} ${suffix}`;
};

export const generateRefCode = (): string => {
  const segment = () => Math.random().toString(36).substr(2, 4).toUpperCase();
  return `REF-${segment()}-${segment()}`;
};

export const isAbortError = (error: any): boolean => {
  if (!error) return false;
  if (error.name === 'AbortError' || error.code === 20) return true;
  const msg = (error?.message || String(error) || '').toLowerCase();
  return (
    msg.includes('aborted') || 
    msg.includes('cancelled') || 
    msg.includes('operation was aborted')
  );
};
