import { db, save } from './db.js';
import { eventsFor } from './schedule.js';
import { sendSms } from './sms.js';

const offsets = () =>
  (process.env.REMINDER_OFFSETS_MINUTES || '1440,60')
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

const fmt = (iso) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export async function runReminders(now = new Date()) {
  const data = db();
  const offs = offsets();
  if (!offs.length) return;
  const horizon = new Date(now.getTime() + offs[offs.length - 1] * 60_000);
  let changed = false;

  for (const ev of eventsFor(data, null, now, horizon)) {
    if (ev.status !== 'approved') continue;
    const start = new Date(ev.start);
    if (start <= now) continue;
    const user = data.users.find((u) => u.id === ev.userId);
    const car = data.cars.find((c) => c.id === ev.carId);
    if (!user || !car || !user.phone || user.smsOptIn === false) continue;

    // Only the tightest reminder that is due gets sent; any earlier, larger
    // reminders that were missed (e.g. server was down) are skipped.
    const minutesLeft = (start - now) / 60_000;
    const due = offs.find((o) => minutesLeft <= o);
    if (due === undefined) continue;
    const key = `${ev.id}@${ev.start}@${due}`;
    if (data.sentReminders[key]) continue;

    const when = minutesLeft >= 90 ? `in ${Math.round(minutesLeft / 60)} hours` : `in ${Math.round(minutesLeft)} min`;
    const label = ev.recurring ? ` (${ev.title})` : '';
    const body = `🚗 Reminder: you have the ${car.name} ${when}${label} — ${fmt(ev.start)} to ${fmt(ev.end)}.${process.env.APP_URL ? ` ${process.env.APP_URL}` : ''}`;
    const res = await sendSms(user.phone, body);
    if (res.ok) {
      for (const o of offs) if (o >= due) data.sentReminders[`${ev.id}@${ev.start}@${o}`] = now.toISOString();
      changed = true;
    }
  }

  // Forget reminders older than 30 days.
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  for (const [k, v] of Object.entries(data.sentReminders)) {
    if (new Date(v).getTime() < cutoff) {
      delete data.sentReminders[k];
      changed = true;
    }
  }
  if (changed) save();
}

export function startReminderLoop() {
  const tick = () => runReminders().catch((err) => console.error('[reminders]', err));
  tick();
  return setInterval(tick, 60_000);
}
