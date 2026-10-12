export const DAY_MS = 24 * 60 * 60 * 1000;
export const SLOT_MIN = 30;
export const SLOTS_PER_DAY = (24 * 60) / SLOT_MIN;
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
// Weeks start on Sunday, like most family calendars.
export const startOfWeek = (d) => addDays(startOfDay(d), -new Date(d).getDay());

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const fmtTime = (d) =>
  new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
export const fmtDay = (d) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
export const fmtRange = (a, b) => {
  const s = new Date(a);
  const e = new Date(b);
  const sameDay = startOfDay(s).getTime() === startOfDay(new Date(e.getTime() - 1)).getTime();
  return sameDay ? `${fmtDay(s)} · ${fmtTime(s)} – ${fmtTime(e)}` : `${fmtDay(s)} ${fmtTime(s)} → ${fmtDay(e)} ${fmtTime(e)}`;
};
export const fmtDuration = (a, b) => {
  const mins = Math.round((new Date(b) - new Date(a)) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d}d${rh ? ` ${rh}h` : ''}`;
  }
  return `${h ? `${h}h` : ''}${m ? ` ${m}m` : ''}`.trim();
};
export const slotLabel = (i) => {
  const h = Math.floor(i / 2);
  if (i % 2) return '';
  if (h === 0) return '12 AM';
  if (h === 12) return 'Noon';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
};

// Readable text color for a given background hex.
export function onColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#0f172a' : '#ffffff';
}

export const PALETTE = ['#8b5cf6', '#0ea5e9', '#f43f5e', '#f59e0b', '#10b981', '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#f97316', '#06b6d4', '#a855f7'];
