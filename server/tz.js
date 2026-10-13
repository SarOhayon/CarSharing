// The family's time zone, used for repeating events ("school at 7:30") and
// the times written in emails. Servers like Vercel run on UTC, so this can't
// rely on the machine's clock settings.

function pickZone() {
  const tz = process.env.APP_TIMEZONE || (process.env.TZ && !/^:?UTC$/i.test(process.env.TZ) ? process.env.TZ : null);
  try {
    if (tz) {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return tz;
    }
  } catch {
    console.warn(`[warn] Unknown time zone "${tz}" — using the server's.`);
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export const TIMEZONE = pickZone();

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function partsAt(date) {
  const p = Object.fromEntries(partsFormat.formatToParts(date).map(({ type, value }) => [type, Number(value)]));
  return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
}

// How far the family's clock is ahead of UTC at a given moment, in ms.
function offsetAt(ms) {
  const p = partsAt(new Date(ms));
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

const pad = (n) => String(n).padStart(2, '0');
const toYmd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const splitYmd = (ymd) => ymd.split('-').map(Number);

// The moment it is `time` ("HH:MM") on `ymd` ("YYYY-MM-DD") in the family's zone.
export function zonedTime(ymd, time = '00:00') {
  const [y, m, d] = splitYmd(ymd);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let t = wall - offsetAt(wall);
  const corrected = offsetAt(t); // re-check: daylight saving may differ at the real moment
  if (wall - corrected !== t) t = wall - corrected;
  return new Date(t);
}

// The family's calendar date ("YYYY-MM-DD") at a moment.
export function ymdAt(date) {
  const p = partsAt(date);
  return toYmd(p.y, p.m, p.d);
}

export function addDaysYmd(ymd, n) {
  const [y, m, d] = splitYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return toYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

// 0 = Sunday … 6 = Saturday.
export function weekdayOf(ymd) {
  const [y, m, d] = splitYmd(ymd);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const todayYmd = () => ymdAt(new Date());

export const fmt = (iso) =>
  new Date(iso).toLocaleString('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-US', { timeZone: TIMEZONE, hour: 'numeric', minute: '2-digit' });
