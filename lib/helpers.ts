export const toNum = (val: any, def = 0): number => {
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
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};

export const monthsSinceDob = (dob: Date, refYear: number, refMonth: number): number => {
  const dobYear = dob.getFullYear();
  const dobMonth = dob.getMonth();
  return (refYear - dobYear) * 12 + (refMonth - dobMonth);
};

export const getAge = (dobIso: string): number => {
  if (!dobIso) return 0;
  const dob = parseDob(dobIso);
  if (!dob) return 0;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
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